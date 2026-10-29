
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError } = require("../errors/apiError");
const { toPublicUser } = require("../repositories/userRepository");

const MIN_SECRET_LENGTH = 32;
const DEFAULT_BCRYPT_COST = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

class AuthService {
  constructor({
    userRepository,
    tokenRevocationRepository,
    jwtSecret,
    jwtExpiresIn = "30m",
    bcryptCost = DEFAULT_BCRYPT_COST,
  }) {
    if (typeof jwtSecret !== "string" || jwtSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`,
      );
    }

    if (
      !tokenRevocationRepository ||
      typeof tokenRevocationRepository.revoke !== "function"
    ) {
      throw new Error(
        "A token revocation repository is required for authentication",
      );
    }

    this.userRepository = userRepository;
    this.tokenRevocationRepository = tokenRevocationRepository;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
    this.bcryptCost = bcryptCost;
    this.dummyHash = bcrypt.hashSync("not-a-real-password-1", bcryptCost);
  }

  async register({ name, email, password }) {
    const passwordHash = await bcrypt.hash(password, this.bcryptCost);
    const user = await this.userRepository.create({
      name,
      email,
      passwordHash,
    });

    return toPublicUser(user);
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmail(email);

    // Keep credential errors generic for unknown and inactive accounts.
    const hash = user ? user.passwordHash : this.dummyHash;
    const passwordMatches = await bcrypt.compare(password, hash);

    if (!user || !user.active) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    // Production repository checks the lock using MySQL's UTC clock.
    // The fallback supports existing unit-test repositories.
    const currentlyLocked =
      typeof this.userRepository.isLocked === "function"
        ? await this.userRepository.isLocked(user.id)
        : user.lockedUntil &&
          new Date(user.lockedUntil).getTime() > Date.now();

    if (currentlyLocked) {
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    if (!passwordMatches) {
      if (typeof this.userRepository.recordFailedLogin === "function") {
        await this.userRepository.recordFailedLogin(
          user.id,
          MAX_FAILED_ATTEMPTS,
          LOCKOUT_MINUTES,
        );
      }

      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password",
      );
    }

    if (typeof this.userRepository.resetFailedLogins === "function") {
      await this.userRepository.resetFailedLogins(user.id);
    }

    return {
      accessToken: this.signToken(user),
      user: toPublicUser(user),
    };
  }

  async logout({ tokenId, userId, expiresAt }) {
    await this.tokenRevocationRepository.revoke({
      tokenId,
      userId,
      expiresAt: new Date(expiresAt * 1000),
    });
  }

  async getCurrentUser(userId) {
    const user = await this.userRepository.findById(userId);

    if (!user || !user.active) {
      throw new ApiError(
        401,
        "UNAUTHENTICATED",
        "User is unavailable or inactive",
      );
    }

    return toPublicUser(user);
  }

  signToken(user) {
    return jwt.sign(
      { role: user.role },
      this.jwtSecret,
      {
        subject: user.id,
        expiresIn: this.jwtExpiresIn,
        jwtid: crypto.randomUUID(),
        algorithm: "HS256",
      },
    );
  }
}

module.exports = { AuthService };
