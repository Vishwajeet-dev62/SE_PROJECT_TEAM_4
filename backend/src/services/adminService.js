const { ApiError } = require("../errors/apiError");
const { toAdminUser } = require("../repositories/userRepository");
const { collectionResponse, parsePagination } = require("../utils/pagination");
const { parseId, requireUser } = require("../utils/ids");
const {
  validateRoleUpdate,
  validateStatusUpdate,
} = require("../validators/adminValidators");

class AdminService {
  constructor({ userRepository, auditLog }) {
    this.userRepository = userRepository;
    this.auditLog = auditLog;
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
