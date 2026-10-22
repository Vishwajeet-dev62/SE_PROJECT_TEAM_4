const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiError } = require("../src/errors/apiError");
const { ProjectService } = require("../src/services/projectService");

function createRepository(overrides = {}) {
  const state = {
    project: {
      id: "1",
      ownerId: "10",
      name: "Planning",
      description: null,
      archived: false,
      createdAt: "2026-10-22T00:00:00.000Z",
      updatedAt: "2026-10-22T00:00:00.000Z",
    },
    members: new Set(["1:10", "1:20"]),
  };
  return {
    state,
    listVisible: async () => [state.project],
    countVisible: async () => 1,
    findById: async (id) => (id === "1" ? { ...state.project } : null),
    isMember: async (projectId, userId) => state.members.has(`${projectId}:${userId}`),
    createProject: async (input) => ({ id: "2", ...input }),
    updateProject: async (id, changes) => {
      if (id !== "1" || state.project.archived) {
        return false;
      }
      Object.assign(state.project, changes);
      return true;
    },
    archiveProject: async (id) => {
      if (id !== "1") {
        return false;
      }
      state.project.archived = true;
      return true;
    },
    userExists: async (id) => id === "20" || id === "30",
    listMembers: async () => [],
    countMembers: async () => 2,
    addMember: async (projectId, userId) => {
      const key = `${projectId}:${userId}`;
      if (state.project.archived || state.members.has(key)) {
        return false;
      }
      state.members.add(key);
      return true;
    },
    removeMember: async (projectId, userId) => {
      if (state.project.archived) {
        return false;
      }
      return state.members.delete(`${projectId}:${userId}`);
    },
    listActiveTasks: async () => [],
    countActiveTasks: async () => 0,
    getDashboardCounts: async () => ({
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      total: 0,
      unknownStatus: 0,
      overdue: 0,
    }),
    findActiveTaskProject: async (id) => (
      id === "50" ? { id: "50", projectId: "1" } : null
    ),
    ...overrides,
  };
}

const owner = { id: "10", role: "MEMBER" };
const member = { id: "20", role: "MEMBER" };
const outsider = { id: "30", role: "MEMBER" };
const admin = { id: "99", role: "ADMIN" };

test("project lists use pagination and project access is scoped to members", async () => {
  const repository = createRepository();
  const service = new ProjectService(repository);
  const response = await service.listProjects(member, { page: "1", limit: "20" });

  assert.equal(response.data.length, 1);
  assert.deepEqual(response.pagination, { page: 1, limit: 20, total: 1 });
  assert.equal((await service.getProject("1", admin)).id, "1");
  await assert.rejects(service.getProject("1", outsider), (error) => error.status === 403);
  await assert.rejects(service.getProject("999", owner), (error) => error.status === 404);
});

test("project creation associates the owner and update is owner-only", async () => {
  const repository = createRepository();
  const service = new ProjectService(repository);
  const created = await service.createProject({
    name: "Launch",
    description: null,
  }, owner);

  assert.equal(created.ownerId, owner.id);
  assert.equal(repository.state.project.name, "Planning");
  assert.equal((await service.updateProject("1", { name: "Updated" }, owner)).name, "Updated");
  await assert.rejects(
    service.updateProject("1", { name: "Nope" }, member),
    (error) => error.status === 403,
  );
});

test("owner and admin may archive; archived projects reject further writes", async () => {
  const repository = createRepository();
  const service = new ProjectService(repository);

  await assert.rejects(service.archiveProject("1", member), (error) => error.status === 403);
  assert.equal((await service.archiveProject("1", owner)).archived, true);
  await assert.rejects(
    service.updateProject("1", { name: "blocked" }, owner),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );

  const secondRepository = createRepository({
    archiveProject: async () => {
      secondRepository.state.project.archived = true;
      return true;
    },
  });
  const secondService = new ProjectService(secondRepository);
  assert.equal((await secondService.archiveProject("1", admin)).archived, true);
});

test("membership operations reject missing users, duplicates, and owner removal", async () => {
  const service = new ProjectService(createRepository());

  await assert.rejects(
    service.addMember("1", "404", owner),
    (error) => error.code === "USER_NOT_FOUND",
  );
  await assert.rejects(
    service.addMember("1", "20", owner),
    (error) => error.code === "MEMBERSHIP_EXISTS",
  );
  await assert.rejects(
    service.addMember("1", "30", member),
    (error) => error.status === 403,
  );
  await assert.rejects(
    service.removeMember("1", "10", owner),
    (error) => error.code === "OWNER_MEMBERSHIP_REQUIRED",
  );

  assert.deepEqual(await service.addMember("1", "30", owner), {
    projectId: "1",
    userId: "30",
    role: "MEMBER",
  });
  await service.removeMember("1", "30", owner);
  await assert.rejects(
    service.removeMember("1", "30", owner),
    (error) => error.code === "MEMBERSHIP_NOT_FOUND",
  );
});

test("archived projects reject member writes and memberships cannot bypass access", async () => {
  const repository = createRepository();
  repository.state.project.archived = true;
  const service = new ProjectService(repository);

  await assert.rejects(
    service.addMember("1", "30", owner),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );
  await assert.rejects(
    service.authorizeTask("50", outsider),
    (error) => error.status === 403,
  );
});

test("dashboard percentage, zero-task case, overdue count, and statuses are validated", async () => {
  const repository = createRepository({
    getDashboardCounts: async () => ({
      TODO: 1,
      IN_PROGRESS: 1,
      DONE: 2,
      total: 4,
      unknownStatus: 0,
      overdue: 1,
    }),
  });
  const service = new ProjectService(repository);
  assert.deepEqual(await service.getDashboard("1", member), {
    countsByStatus: { TODO: 1, IN_PROGRESS: 1, DONE: 2 },
    percentComplete: 50,
    overdue: 1,
  });

  const emptyService = new ProjectService(createRepository());
  assert.deepEqual(await emptyService.getDashboard("1", member), {
    countsByStatus: { TODO: 0, IN_PROGRESS: 0, DONE: 0 },
    percentComplete: 0,
    overdue: 0,
  });

  const invalidStatusService = new ProjectService(createRepository({
    getDashboardCounts: async () => ({
      TODO: 1,
      IN_PROGRESS: 0,
      DONE: 0,
      total: 2,
      unknownStatus: 1,
      overdue: 0,
    }),
  }));
  await assert.rejects(
    invalidStatusService.getDashboard("1", member),
    (error) => error.code === "TASK_STATUS_CONTRACT_MISMATCH",
  );
});

test("Kanban groups tasks by contract status and rejects unknown statuses", async () => {
  const repository = createRepository({
    listActiveTasks: async () => [
      { id: "1", status: "TODO" },
      { id: "2", status: "IN_PROGRESS" },
      { id: "3", status: "DONE" },
    ],
  });
  const service = new ProjectService(repository);
  repository.countActiveTasks = async () => 3;
  const board = await service.getBoard("1", member);
  assert.deepEqual(board.data.TODO.map((task) => task.id), ["1"]);
  assert.deepEqual(board.data.IN_PROGRESS.map((task) => task.id), ["2"]);
  assert.deepEqual(board.data.DONE.map((task) => task.id), ["3"]);
  assert.deepEqual(board.pagination, { page: 1, limit: 20, total: 3 });

  const badStatusService = new ProjectService(createRepository({
    listActiveTasks: async () => [{ id: "4", status: "BLOCKED" }],
    countActiveTasks: async () => 1,
  }));
  await assert.rejects(
    badStatusService.getBoard("1", member),
    (error) => error.code === "TASK_STATUS_CONTRACT_MISMATCH",
  );
});

test("archived tasks cannot be written through the shared project access check", async () => {
  const repository = createRepository({
    findActiveTaskProject: async () => ({ id: "50", projectId: "1" }),
  });
  repository.state.project.archived = true;
  const service = new ProjectService(repository);

  await assert.rejects(
    service.authorizeTask("50", member, { write: true }),
    (error) => error.code === "ARCHIVED_PROJECT_READ_ONLY",
  );
});
