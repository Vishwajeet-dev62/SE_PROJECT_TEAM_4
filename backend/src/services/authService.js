const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError } = require("../errors/apiError");
const { toPublicUser } = require("../repositories/userRepository");

const MIN_SECRET_LENGTH = 32;
const DEFAULT_BCRYPT_COST = 12; // SRS TM-SR-002 requires cost >= 10

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
      throw new Error("A token revocation repository is required for authentication");
    }
    this.userRepository = userRepository;
    this.tokenRevocationRepository = tokenRevocationRepository;
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
    this.bcryptCost = bcryptCost;
    // Used so unknown emails take as long to reject as wrong passwords.
    this.dummyHash = bcrypt.hashSync("not-a-real-password-1", bcryptCost);
  }

  async register({ name, email, password }) {
    const passwordHash = await bcrypt.hash(password, this.bcryptCost);
    const user = await this.userRepository.create({ name, email, passwordHash });
    return toPublicUser(user);
  }

  async login({ email, password }) {
    const user = await this.userRepository.findByEmail(email);
    const hash = user ? user.passwordHash : this.dummyHash;
    const passwordMatches = await bcrypt.compare(password, hash);

    // One generic message for unknown email, wrong password and inactive
    // accounts, so the response never reveals which accounts exist.
    if (!user || !passwordMatches || !user.active) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
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
      throw new ApiError(401, "UNAUTHENTICATED", "User is unavailable or inactive");
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
