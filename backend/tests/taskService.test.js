
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TaskService } = require("../src/services/taskService");

const owner = { id: "10", role: "MEMBER" };
const member = { id: "20", role: "MEMBER" };
const outsider = { id: "30", role: "MEMBER" };

function createDependencies() {
  const project = {
    id: "7",
    ownerId: "10",
    archived: false,
    name: "Planning",
  };

  const tasks = new Map();
  const activityEvents = [];
  let nextId = 42;

  const projectService = {
    async getProject(projectId, user) {
      if (String(projectId) !== project.id) {
        const error = new Error("Not found");
        error.status = 404;
        throw error;
      }

      if (
        user.role !== "ADMIN" &&
        user.id !== project.ownerId &&
        !["20"].includes(user.id)
      ) {
        const error = new Error("Forbidden");
        error.status = 403;
        throw error;
      }

      return { ...project };
    },

    assertWritable(value) {
      if (value.archived) {
        const error = new Error("Archived project");
        error.code = "ARCHIVED_PROJECT_READ_ONLY";
        throw error;
      }
    },

    async authorizeTask(taskId, user, { write = false } = {}) {
      const task = tasks.get(String(taskId));

      if (!task || task.deletedAt) {
        const error = new Error("Not found");
        error.status = 404;
        throw error;
      }

      const authorizedProject = await this.getProject(
        task.projectId,
        user,
      );

      if (write) {
        this.assertWritable(authorizedProject);
      }

      return {
        task: { ...task },
        project: authorizedProject,
      };
    },
  };

  const projectRepository = {
    async userExists(id) {
      return ["10", "20", "30"].includes(String(id));
    },

    async isMember(projectId, userId) {
      return (
        String(projectId) === "7" &&
        String(userId) === "20"
      );
    },
  };

  const taskRepository = {
    async create(input) {
      const id = String(nextId++);

      tasks.set(id, {
        id,
        projectId: input.projectId,
        createdBy: input.createdBy,
        assignedTo: input.assignedTo,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate,
        deletedAt: null,
      });

      return id;
    },

    async findById(id, { includeDeleted = false } = {}) {
      const task = tasks.get(String(id));

      if (!task || (!includeDeleted && task.deletedAt)) {
        return null;
      }

      return {
        ...task,
        ownerId: project.ownerId,
        archived: project.archived,
      };
    },

    async listForProject(projectId, pagination) {
      return [...tasks.values()]
        .filter(
          (task) =>
            task.projectId === String(projectId) &&
            !task.deletedAt,
        )
        .slice(
          pagination.offset,
          pagination.offset + pagination.limit,
        );
    },

    async countForProject(projectId) {
      return [...tasks.values()].filter(
        (task) =>
          task.projectId === String(projectId) &&
          !task.deletedAt,
      ).length;
    },

    async update(id, changes) {
      const task = tasks.get(String(id));

      if (!task || task.deletedAt || project.archived) {
        return false;
      }

      Object.assign(task, changes);
      return true;
    },

    async softDelete(id) {
      const task = tasks.get(String(id));

      if (!task || task.deletedAt || project.archived) {
        return false;
      }

      task.deletedAt = new Date().toISOString();
      return true;
    },

    async listTrashForProject(projectId, pagination) {
      return [...tasks.values()]
        .filter(
          (task) =>
            task.projectId === String(projectId) &&
            task.deletedAt,
        )
        .slice(
          pagination.offset,
          pagination.offset + pagination.limit,
        );
    },

    async countTrashForProject(projectId) {
      return [...tasks.values()].filter(
        (task) =>
          task.projectId === String(projectId) &&
          task.deletedAt,
      ).length;
    },

    async restore(id) {
      const task = tasks.get(String(id));

      if (!task || !task.deletedAt || project.archived) {
        return false;
      }

      task.deletedAt = null;
      return true;
    },
  };

  const activityService = {
    async record(event) {
      activityEvents.push(event);
    },
  };

  const service = new TaskService({
    taskRepository,
    projectService,
    projectRepository,
    activityService,
  });

  return {
    service,
    tasks,
    project,
    activityEvents,
  };
}

test("create derives creator and project from authenticated context", async () => {
  const { service, tasks } = createDependencies();

  const task = await service.create(
    "7",
    { title: "Prepare report" },
    owner,
  );

  assert.equal(task.createdBy, owner.id);
  assert.equal(task.projectId, "7");
  assert.equal(task.title, "Prepare report");
  assert.equal(tasks.size, 1);
});

test("create rejects users without project access", async () => {
  const { service } = createDependencies();

  await assert.rejects(
    service.create(
      "7",
      { title: "Private task" },
      outsider,
    ),
    (error) => error.status === 403,
  );
});

test("create rejects an assignee who is not a project member", async () => {
  const { service } = createDependencies();

  await assert.rejects(
    service.create(
      "7",
      { title: "Task", assigned_to: "30" },
      owner,
    ),
    (error) => error.code === "ASSIGNEE_NOT_PROJECT_MEMBER",
  );
});

test("create allows a project member as assignee", async () => {
  const { service } = createDependencies();

  const task = await service.create(
    "7",
    { title: "Task", assigned_to: "20" },
    owner,
  );

  assert.equal(task.assignedTo, "20");
});

test("create rejects client-controlled creator and project fields", async () => {
  const { service } = createDependencies();

  await assert.rejects(
    service.create(
      "7",
      { title: "Task", created_by: "30" },
      owner,
    ),
    (error) => error.code === "VALIDATION_ERROR",
  );
});

test("task creator can update and the response reflects edit permission", async () => {
  const { service } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Old title" },
    owner,
  );

  const updated = await service.update(
    created.id,
    {
      title: "New title",
      status: "IN_PROGRESS",
    },
    owner,
  );

  assert.equal(updated.title, "New title");
  assert.equal(updated.status, "IN_PROGRESS");
  assert.equal(updated.permissions.canEdit, true);
});

test("assigned project members can update tasks", async () => {
  const { service } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Assigned task", assigned_to: member.id },
    owner,
  );

  const updated = await service.update(
    created.id,
    { status: "IN_PROGRESS" },
    member,
  );

  assert.equal(updated.status, "IN_PROGRESS");
  assert.equal(updated.permissions.canEdit, true);
});

test("project members who are neither creator nor assignee cannot update tasks", async () => {
  const { service } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Owner task" },
    owner,
  );

  await assert.rejects(
    service.update(
      created.id,
      { title: "Changed by member" },
      member,
    ),
    (error) =>
      error.status === 403 &&
      error.code === "FORBIDDEN",
  );

  const memberTasks = await service.list("7", member, {});

  assert.equal(memberTasks.data[0].title, "Owner task");
  assert.equal(memberTasks.data[0].permissions.canEdit, false);
});

test("outsiders cannot update tasks", async () => {
  const { service } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Task" },
    owner,
  );

  await assert.rejects(
    service.update(
      created.id,
      { title: "Changed" },
      outsider,
    ),
    (error) => error.status === 403,
  );
});

test("delete soft-deletes a task and restore makes it active again", async () => {
  const { service } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Task" },
    owner,
  );

  await service.delete(created.id, owner);

  assert.equal(
    (await service.list("7", owner, {})).pagination.total,
    0,
  );

  const restored = await service.restore(created.id, owner);

  assert.equal(restored.deletedAt, null);

  assert.equal(
    (await service.list("7", owner, {})).pagination.total,
    1,
  );
});

test("invalid task filters are rejected", async () => {
  const { service } = createDependencies();

  await assert.rejects(
    service.list("7", owner, { status: "WAITING" }),
    (error) => error.code === "VALIDATION_ERROR",
  );
});

test("trash listing is limited to authorized project members", async () => {
  const { service } = createDependencies();

  await assert.rejects(
    service.listTrash("7", outsider, {}),
    (error) => error.status === 403,
  );
});

test("task mutations record activity events", async () => {
  const { service, activityEvents } = createDependencies();

  const created = await service.create(
    "7",
    { title: "Activity test task" },
    owner,
  );

  await service.update(
    created.id,
    { title: "Updated activity test task" },
    owner,
  );

  await service.delete(created.id, owner);
  await service.restore(created.id, owner);

  assert.deepEqual(
    activityEvents.map((event) => event.eventType),
    [
      "TASK_CREATED",
      "TASK_UPDATED",
      "TASK_DELETED",
      "TASK_RESTORED",
    ],
  );

  for (const event of activityEvents) {
    assert.equal(event.projectId, "7");
    assert.equal(event.userId, owner.id);
    assert.ok(event.details.taskId);
  }
});

test("failed task operations do not record activity events", async () => {
  const { service, activityEvents } = createDependencies();

  await assert.rejects(
    service.create(
      "7",
      { title: "Invalid task", created_by: "30" },
      owner,
    ),
    (error) => error.code === "VALIDATION_ERROR",
  );

  await assert.rejects(
    service.create(
      "7",
      { title: "Private task" },
      outsider,
    ),
    (error) => error.status === 403,
  );

  assert.equal(activityEvents.length, 0);
});

test("activity logging failures do not fail successful task operations", async () => {
  const { service } = createDependencies();

  service.activityService.record = async () => {
    throw new Error("Simulated activity database failure");
  };

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const task = await service.create(
      "7",
      { title: "Activity logging failure test" },
      owner,
    );

    assert.equal(task.title, "Activity logging failure test");
  } finally {
    console.error = originalConsoleError;
  }
});
