const { ApiError } = require("../errors/apiError");
const { asyncHandler } = require("../utils/asyncHandler");

function createProjectAccessMiddleware(projectService) {
  function requireProjectMember(projectId, { write = false } = {}) {
    const resolveProjectId = typeof projectId === "function"
      ? projectId
      : () => projectId;

    return asyncHandler(async (req, _res, next) => {
      const resolvedId = resolveProjectId(req);
      if (resolvedId === undefined || resolvedId === null) {
        throw new ApiError(400, "INVALID_PROJECT_ID", "Project ID is required");
      }
      req.project = await projectService.getProject(resolvedId, req.user);
      if (write) {
        projectService.assertWritable(req.project);
      }
      return next();
    });
  }

  function requireTaskProjectMember(taskId, { write = false } = {}) {
    const resolveTaskId = typeof taskId === "function" ? taskId : () => taskId;

    return asyncHandler(async (req, _res, next) => {
      const resolvedId = resolveTaskId(req);
      if (resolvedId === undefined || resolvedId === null) {
        throw new ApiError(400, "INVALID_TASK_ID", "Task ID is required");
      }
      const access = await projectService.authorizeTask(
        resolvedId,
        req.user,
        { write },
      );
      req.task = access.task;
      req.project = access.project;
      return next();
    });
  }

  return { requireProjectMember, requireTaskProjectMember };
}

module.exports = { createProjectAccessMiddleware };
