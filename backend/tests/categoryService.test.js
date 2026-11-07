
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CategoryService,
} = require("../src/services/categoryService");

const user = { id: "7", role: "MEMBER" };

const project = {
  id: "10",
  name: "TaskFlow",
  isArchived: false,
};

const sampleCategory = {
  id: "12",
  projectId: "10",
  name: "Development",
  createdAt: "2026-11-07T10:00:00.000Z",
  updatedAt: "2026-11-07T10:00:00.000Z",
};

function createService(overrides = {}) {
  const calls = [];

  const categoryRepository = {
    listForProject: async (projectId) => {
      calls.push(["listForProject", projectId]);
      return [sampleCategory];
    },

    findById: async (projectId, categoryId) => {
      calls.push(["findById", projectId, categoryId]);
      return sampleCategory;
    },

    create: async (projectId, name) => {
      calls.push(["create", projectId, name]);
      return "12";
    },

    update: async (projectId, categoryId, name) => {
      calls.push(["update", projectId, categoryId, name]);
      return { ...sampleCategory, name };
    },

    delete: async (projectId, categoryId) => {
      calls.push(["delete", projectId, categoryId]);
      return true;
    },

    ...overrides,
  };

  const projectService = {
    getProject: async (projectId, authenticatedUser) => {
      calls.push(["getProject", projectId, authenticatedUser]);
      return project;
    },

    assertWritable: (projectToCheck) => {
      calls.push(["assertWritable", projectToCheck.id]);

      if (projectToCheck.isArchived) {
        const error = new Error("Archived projects are read-only");
        error.status = 403;
        error.code = "PROJECT_ARCHIVED";
        throw error;
      }
    },
  };

  return {
    service: new CategoryService({
      categoryRepository,
      projectService,
    }),
    calls,
  };
}

test("lists categories for an authorized project", async () => {
  const { service, calls } = createService();

  const result = await service.list("10", user);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Development");

  assert.deepEqual(calls[0], ["getProject", "10", user]);
  assert.deepEqual(calls[1], ["listForProject", "10"]);
});

test("creates a category with a trimmed name", async () => {
  const { service, calls } = createService();

  const result = await service.create(
    "10",
    { name: "  Testing  " },
    user,
  );

  assert.equal(result.id, "12");
  assert.equal(result.name, "Development");

  assert.ok(
    calls.some((call) =>
      call[0] === "create" &&
      call[1] === "10" &&
      call[2] === "Testing"
    ),
  );

  assert.ok(
    calls.some((call) =>
      call[0] === "findById" &&
      call[1] === "10" &&
      call[2] === "12"
    ),
  );
});

test("rejects a missing category name", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.create("10", {}, user),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(
    calls.some((call) => call[0] === "create"),
    false,
  );
});

test("rejects a blank category name", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.create("10", { name: "   " }, user),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(
    calls.some((call) => call[0] === "create"),
    false,
  );
});

test("rejects a category name longer than 80 characters", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.create("10", { name: "A".repeat(81) }, user),
    { status: 400, code: "VALIDATION_ERROR" },
  );

  assert.equal(
    calls.some((call) => call[0] === "create"),
    false,
  );
});

test("rejects duplicate category names", async () => {
  const { service } = createService({
    create: async () => {
      const error = new Error("Duplicate entry");
      error.code = "ER_DUP_ENTRY";
      throw error;
    },
  });

  await assert.rejects(
    service.create("10", { name: "Development" }, user),
    {
      status: 409,
      code: "CATEGORY_ALREADY_EXISTS",
    },
  );
});

test("rejects category creation when the project is unavailable", async () => {
  const { service } = createService({
    create: async () => null,
  });

  await assert.rejects(
    service.create("10", { name: "Testing" }, user),
    {
      status: 409,
      code: "PROJECT_NOT_WRITABLE",
    },
  );
});

test("updates an existing category", async () => {
  const { service, calls } = createService();

  const result = await service.update(
    "10",
    "12",
    { name: "Testing" },
    user,
  );

  assert.equal(result.id, "12");
  assert.equal(result.name, "Testing");

  assert.ok(
    calls.some((call) =>
      call[0] === "update" &&
      call[1] === "10" &&
      call[2] === "12" &&
      call[3] === "Testing"
    ),
  );
});

test("rejects updating a category that does not exist", async () => {
  const { service } = createService({
    findById: async () => null,
  });

  await assert.rejects(
    service.update("10", "99", { name: "Testing" }, user),
    { status: 404, code: "NOT_FOUND" },
  );
});

test("rejects an invalid category ID during update", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.update("10", "invalid", { name: "Testing" }, user),
    { status: 400, code: "INVALID_ID" },
  );

  assert.equal(
    calls.some((call) => call[0] === "update"),
    false,
  );
});

test("rejects duplicate names during category update", async () => {
  const { service } = createService({
    update: async () => {
      const error = new Error("Duplicate entry");
      error.code = "ER_DUP_ENTRY";
      throw error;
    },
  });

  await assert.rejects(
    service.update("10", "12", { name: "Testing" }, user),
    {
      status: 409,
      code: "CATEGORY_ALREADY_EXISTS",
    },
  );
});

test("deletes an existing category", async () => {
  const { service, calls } = createService();

  const result = await service.delete("10", "12", user);

  assert.equal(result, undefined);
  assert.ok(
    calls.some((call) =>
      call[0] === "delete" &&
      call[1] === "10" &&
      call[2] === "12"
    ),
  );
});

test("rejects deleting a category that does not exist", async () => {
  const { service } = createService({
    delete: async () => false,
  });

  await assert.rejects(
    service.delete("10", "99", user),
    { status: 404, code: "NOT_FOUND" },
  );
});

test("rejects users without a valid authenticated identity", async () => {
  const { service, calls } = createService();

  await assert.rejects(
    service.list("10", null),
    { status: 401 },
  );

  assert.equal(calls.length, 0);
});
