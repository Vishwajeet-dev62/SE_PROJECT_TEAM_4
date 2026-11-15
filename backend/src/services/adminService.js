const bcrypt = require("bcryptjs");
const { ApiError } = require("../errors/apiError");
const { toAdminUser } = require("../repositories/userRepository");
const { AUDIT_EVENTS } = require("./auditLog");
const { collectionResponse, parsePagination } = require("../utils/pagination");
const { parseId, requireUser } = require("../utils/ids");
const {
  validateCreateUser,
  validateRoleUpdate,
  validateStatusUpdate,
} = require("../validators/adminValidators");

class AdminService {
  constructor({ userRepository, auditLog, bcryptCost = 12 }) {
    this.userRepository = userRepository;
    this.auditLog = auditLog;
    this.bcryptCost = bcryptCost;
  }

  // SRS TM-F-041: administrators can create accounts. The administrator sets
  // the first password, which the person should change after signing in.
  async createUser(actorInput, body, context = {}) {
    const actor = requireUser(actorInput);
    const { name, email, password, role } = validateCreateUser(body);
    const passwordHash = await bcrypt.hash(password, this.bcryptCost);
    const created = await this.userRepository.create({
      name,
      email,
      passwordHash,
      role,
    });
    await this.auditLog({
      eventType: AUDIT_EVENTS.USER_CREATED_BY_ADMIN,
      userId: actor.id,
      ip: context.ip,
      details: { targetUserId: created.id, role },
    });
    return toAdminUser(created);
  }

  async listUsers(query) {
    const pagination = parsePagination(query);
    const { rows, total } = await this.userRepository.listAll(pagination);
    return collectionResponse(rows, pagination, total);
  }

  async setStatus(actorInput, idInput, body, context = {}) {
    const actor = requireUser(actorInput);
    const targetId = parseId(idInput, "user id");
    const { active } = validateStatusUpdate(body);
    this.assertNotSelf(actor, targetId);

    const target = await this.requireTarget(targetId);
    if (target.active === active) {
      return toAdminUser(target); // nothing changed, nothing to audit
    }

    const previous = target.active;
    await this.userRepository.setActive(targetId, active);
    await this.auditLog({
      eventType: "USER_STATUS_CHANGED",
      userId: actor.id,
      ip: context.ip,
      details: { targetUserId: targetId, from: previous, to: active },
    });
    return toAdminUser(await this.requireTarget(targetId));
  }

  async setRole(actorInput, idInput, body, context = {}) {
    const actor = requireUser(actorInput);
    const targetId = parseId(idInput, "user id");
    const { role } = validateRoleUpdate(body);
    this.assertNotSelf(actor, targetId);

    const target = await this.requireTarget(targetId);
    if (target.role === role) {
      return toAdminUser(target);
    }

    const previous = target.role;
    await this.userRepository.setRole(targetId, role);
    await this.auditLog({
      eventType: "ROLE_CHANGED",
      userId: actor.id,
      ip: context.ip,
      details: { targetUserId: targetId, from: previous, to: role },
    });
    return toAdminUser(await this.requireTarget(targetId));
  }

  // An administrator cannot demote or deactivate themselves, so the system
  // can never end up with no way back in.
  assertNotSelf(actor, targetId) {
    if (actor.id === targetId) {
      throw new ApiError(
        409,
        "CANNOT_MODIFY_SELF",
        "Administrators cannot change their own role or status",
      );
    }
  }

  async requireTarget(id) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }
    return user;
  }
}

module.exports = { AdminService };
