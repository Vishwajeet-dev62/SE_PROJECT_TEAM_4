
"use strict";

const { ApiError } = require("../errors/apiError");
const { parseId, requireUser } = require("../utils/ids");
const { collectionResponse } = require("../utils/pagination");
const {
  ALLOWED_PRIORITIES,
  ALLOWED_STATUSES,
  parsePagination,
  parsePositiveInteger,
  validateTaskBody,
} = require("../validators/taskValidators");

class TaskService {
  constructor({
    taskRepository,
    projectService,
    projectRepository,
    activityService,
  }) {
    this.taskRepository = taskRepository;
    this.projectService = projectService;
    this.projectRepository = projectRepository;
    this.activityService = activityService;
  }

  async list(projectIdInput, userInput, query = {}) {
    const user = requireUser(userInput);
    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );
    const pagination = parsePagination(query);

    if (!pagination) {
      throw validationError("Invalid pagination parameters");
    }

    const filters = this.parseFilters(query);

    const [tasks, total] = await Promise.all([
      this.taskRepository.listForProject(project.id, {
        ...pagination,
        ...filters,
      }),
      this.taskRepository.countForProject(project.id, filters),
    ]);

    return collectionResponse(
      tasks.map((task) => this.withPermissions(task, user, project)),
      pagination,
      total,
    );
  }

  async get(taskIdInput, userInput) {
    const user = requireUser(userInput);
    const { task, project } = await this.projectService.authorizeTask(
      taskIdInput,
      user,
    );
    const fullTask = await this.taskRepository.findById(task.id);

    if (!fullTask) {
      throw notFound();
    }

    return this.withPermissions(fullTask, user, project);
  }

  async create(projectIdInput, body, userInput) {
    const user = requireUser(userInput);
    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );
    this.projectService.assertWritable(project);

    const { input, errors } = validateTaskBody(body);

    if (errors.length) {
      throw validationError("Task input is invalid", errors);
    }

    await this.validateAssignee(input.assigned_to, project);

    const taskId = await this.taskRepository.create({
      projectId: project.id,
      createdBy: user.id,
      assignedTo: input.assigned_to ?? null,
      categoryId: input.category_id ?? null,
      title: input.title.trim(),
      description: input.description ?? null,
      status: input.status ?? "TODO",
      priority: input.priority ?? "MEDIUM",
      dueDate: input.due_date || null,
    });

    if (!taskId) {
      await this.projectService.getProject(project.id, user);

      throw new ApiError(
        409,
        "PROJECT_NOT_WRITABLE",
        "The project is no longer available for changes",
      );
    }

    const createdTask = await this.get(taskId, user);

    await this.recordActivity({
      projectId: project.id,
      userId: user.id,
      eventType: "TASK_CREATED",
      details: {
        taskId: createdTask.id,
        title: createdTask.title,
      },
    });

    return createdTask;
  }

  async update(taskIdInput, body, userInput) {
    const user = requireUser(userInput);

    const {
      task: authorizedTask,
      project,
    } = await this.projectService.authorizeTask(
      taskIdInput,
      user,
      { write: true },
    );

    const task = await this.taskRepository.findById(authorizedTask.id);

    if (!task) {
      throw notFound();
    }

    if (!canEditTask(task, user)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have permission to edit this task",
      );
    }

    const { input, errors } = validateTaskBody(body, {
      partial: true,
    });

    if (errors.length) {
      throw validationError("Task input is invalid", errors);
    }

    if (Object.hasOwn(input, "assigned_to")) {
      await this.validateAssignee(input.assigned_to, project);
    }

    const changes = { ...input };

    if (typeof changes.title === "string") {
      changes.title = changes.title.trim();
    }

    if (changes.due_date === "") {
      changes.due_date = null;
    }

    const updated = await this.taskRepository.update(
      task.id,
      changes,
      user.id,
    );

    if (!updated) {
      await this.projectService.authorizeTask(
        task.id,
        user,
        { write: true },
      );

      throw notFound();
    }

    const updatedTask = await this.get(task.id, user);

    await this.recordActivity({
      projectId: project.id,
      userId: user.id,
      eventType: "TASK_UPDATED",
      details: {
        taskId: updatedTask.id,
        changedFields: Object.keys(changes),
      },
    });

    return updatedTask;
  }

  async delete(taskIdInput, userInput) {
    const user = requireUser(userInput);

    const { task, project } = await this.projectService.authorizeTask(
      taskIdInput,
      user,
      { write: true },
    );

    const deleted = await this.taskRepository.softDelete(task.id);

    if (!deleted) {
      await this.projectService.authorizeTask(
        task.id,
        user,
        { write: true },
      );

      throw notFound();
    }

    await this.recordActivity({
      projectId: project.id,
      userId: user.id,
      eventType: "TASK_DELETED",
      details: {
        taskId: task.id,
      },
    });
  }

  async listTrash(projectIdInput, userInput, query = {}) {
    const user = requireUser(userInput);
    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );
    const pagination = parsePagination(query);

    if (!pagination) {
      throw validationError("Invalid pagination parameters");
    }

    const [tasks, total] = await Promise.all([
      this.taskRepository.listTrashForProject(
        project.id,
        pagination,
      ),
      this.taskRepository.countTrashForProject(project.id),
    ]);

    return collectionResponse(
      tasks.map((task) => this.withPermissions(task, user, project)),
      pagination,
      total,
    );
  }

  async restore(taskIdInput, userInput) {
    const user = requireUser(userInput);
    const taskId = parseId(taskIdInput, "taskId");

    // Trash items are not returned by authorizeTask because it only
    // authorizes active tasks.
    const task = await this.taskRepository.findById(taskId, {
      includeDeleted: true,
    });

    if (!task || !task.deletedAt) {
      throw notFound();
    }

    const project = await this.projectService.getProject(
      task.projectId,
      user,
    );
    this.projectService.assertWritable(project);

    const restored = await this.taskRepository.restore(task.id);

    if (!restored) {
      throw new ApiError(
        409,
        "TASK_RESTORE_UNAVAILABLE",
        "The task cannot be restored; it may have expired or the project may be archived",
      );
    }

    const restoredTask = await this.get(task.id, user);

    await this.recordActivity({
      projectId: project.id,
      userId: user.id,
      eventType: "TASK_RESTORED",
      details: {
        taskId: restoredTask.id,
        title: restoredTask.title,
      },
    });

    return restoredTask;
  }

  async recordActivity(event) {
    if (!this.activityService) {
      return;
    }

    try {
      await this.activityService.record(event);
    } catch (error) {
      // Activity history is best-effort and must not turn a successful
      // task operation into a failed API request.
      console.error("Failed to record task activity", error);
    }
  }

  parseFilters(query) {
    const filters = {};

    if (query.status !== undefined && query.status !== "") {
      if (!ALLOWED_STATUSES.has(query.status)) {
        throw validationError("Invalid task status filter");
      }

      filters.status = query.status;
    }

    if (query.priority !== undefined && query.priority !== "") {
      if (!ALLOWED_PRIORITIES.has(query.priority)) {
        throw validationError("Invalid task priority filter");
      }

      filters.priority = query.priority;
    }

    if (query.assignedTo !== undefined && query.assignedTo !== "") {
      const id = parsePositiveInteger(query.assignedTo, null);

      if (id === null) {
        throw validationError("Invalid assignedTo filter");
      }

      filters.assignedTo = String(id);
    }

    if (query.search !== undefined && query.search !== "") {
      if (
        typeof query.search !== "string" ||
        query.search.length > 100
      ) {
        throw validationError("Search must be at most 100 characters");
      }

      filters.search = query.search.trim();
    }

    if (query.dueBefore !== undefined && query.dueBefore !== "") {
      const { errors } = validateTaskBody({
        title: "Filter",
        due_date: query.dueBefore,
      });

      if (errors.some((error) => error.field === "due_date")) {
        throw validationError("Invalid dueBefore filter");
      }

      filters.dueBefore = query.dueBefore;
    }

    return filters;
  }

  async validateAssignee(assigneeId, project) {
    if (assigneeId === undefined || assigneeId === null) {
      return;
    }

    const id = parseId(assigneeId, "assigned_to");
    const userExists = await this.projectRepository.userExists(id);

    if (!userExists) {
      throw new ApiError(
        404,
        "USER_NOT_FOUND",
        "Assigned user not found",
      );
    }

    if (
      id !== project.ownerId &&
      !(await this.projectRepository.isMember(project.id, id))
    ) {
      throw new ApiError(
        400,
        "ASSIGNEE_NOT_PROJECT_MEMBER",
        "The assignee must be the project owner or a project member",
      );
    }
  }

  withPermissions(task, user, project) {
    return {
      ...task,
      permissions: {
        canEdit: !project.archived && canEditTask(task, user),
        canDelete: !project.archived,
        canRestore: Boolean(task.deletedAt) && !project.archived,
      },
    };
  }
}

function canEditTask(task, user) {
  return task.createdBy === user.id || task.assignedTo === user.id;
}

function validationError(message, errors) {
  return new ApiError(
    400,
    "VALIDATION_ERROR",
    message,
    errors
      ? Object.fromEntries(
          errors.map((error) => [error.field, error.message]),
        )
      : undefined,
  );
}

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found");
}

module.exports = { TaskService };
