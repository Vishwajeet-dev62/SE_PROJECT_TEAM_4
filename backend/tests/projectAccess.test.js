const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiError } = require("../src/errors/apiError");
const { createProjectAccessMiddleware } = require("../src/middleware/projectAccess");

const projectService = {
  getProject: async (projectId, user) => {
    if (!user || user.id !== "7") {
      throw new ApiError(401, "UNAUTHENTICATED", "Authentication is required");
    }
    return { id: projectId, archived: false };
  },
  assertWritable(project) {
    if (project.archived) {
      throw new ApiError(409, "ARCHIVED_PROJECT_READ_ONLY", "Project is archived");
    }
  },
  authorizeTask: async (taskId, user, { write }) => {
    const project = { id: "2", archived: write };
    if (write) {
      projectService.assertWritable(project);
    }
    return { task: { id: taskId }, project };
  },
};

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (error) => {
      if (error) reject(error);
      else resolve(req);
    });
  });
}

test("project access middleware resolves the route project and attaches it", async () => {
  const { requireProjectMember } = createProjectAccessMiddleware(projectService);
  const req = { params: { projectId: "12" }, user: { id: "7", role: "MEMBER" } };

  await runMiddleware(
    requireProjectMember((request) => request.params.projectId),
    req,
  );

  assert.deepEqual(req.project, { id: "12", archived: false });
});

test("project access middleware rejects missing IDs and archived writes", async () => {
  const { requireProjectMember, requireTaskProjectMember } =
    createProjectAccessMiddleware(projectService);

  await assert.rejects(
    runMiddleware(requireProjectMember(() => undefined), {
      params: {},
      user: { id: "7", role: "MEMBER" },
    }),
    (error) => error.code === "INVALID_PROJECT_ID",
  );

  await assert.rejects(
    runMiddleware(requireTaskProjectMember(
      (request) => request.params.taskId,
      { write: true },
    ), {
      params: { taskId: "52" },
      user: { id: "7", role: "MEMBER" },
    }),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );
});

test("task access middleware authorizes by task ID and attaches task/project", async () => {
  const calls = [];
  const service = {
    authorizeTask: async (...args) => {
      calls.push(args);
      return { task: { id: "52", projectId: "8" }, project: { id: "8" } };
    },
  };
  const { requireTaskProjectMember } = createProjectAccessMiddleware(service);
  const req = {
    params: { taskId: "52" },
    user: { id: "7", role: "MEMBER" },
  };

  await runMiddleware(
    requireTaskProjectMember((request) => request.params.taskId, { write: true }),
    req,
  );

  assert.deepEqual(calls, [[
    "52",
    { id: "7", role: "MEMBER" },
    { write: true },
  ]]);
  assert.deepEqual(req.task, { id: "52", projectId: "8" });
  assert.deepEqual(req.project, { id: "8" });
});
