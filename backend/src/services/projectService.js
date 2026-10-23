const { ApiError } = require("../errors/apiError");
const { DUPLICATE_KEY, FOREIGN_KEY_MISSING } = require("../repositories/projectRepository");
const { parseId, requireUser } = require("../utils/ids");
const { collectionResponse, parsePagination } = require("../utils/pagination");

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"];

class ProjectService {
  constructor(projectRepository) {
    this.projectRepository = projectRepository;
  }

  async listProjects(userInput, query) {
    const user = requireUser(userInput);
    const pagination = parsePagination(query);
    const [projects, total] = await Promise.all([
      this.projectRepository.listVisible(user, pagination),
      this.projectRepository.countVisible(user),
    ]);
    return collectionResponse(projects, pagination, total);
  }

  async getProject(projectIdInput, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    await this.assertProjectAccess(project, user);
    const isOwner = project.ownerId === user.id;
    return {
      ...project,
      permissions: {
        canManage: isOwner,
        canArchive: isOwner || user.role === "ADMIN",
        isMember: isOwner || await this.projectRepository.isMember(project.id, user.id),
      },
    };
  }

  async createProject(input, userInput) {
    const user = requireUser(userInput);
    const project = await this.projectRepository.createProject({
      ownerId: user.id,
      name: input.name,
      description: input.description,
    });
    return {
      ...project,
      permissions: {
        canManage: true,
        canArchive: true,
        isMember: true,
      },
    };
  }

  async updateProject(projectIdInput, input, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    this.assertOwner(project, user);
    this.assertWritable(project);

    const updated = await this.projectRepository.updateProject(project.id, input);
    if (!updated) {
      const current = await this.projectRepository.findById(project.id);
      if (!current) {
        throw notFound();
      }
      this.assertWritable(current);
    }
    return this.getProject(project.id, user);
  }

  async archiveProject(projectIdInput, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    if (user.role !== "ADMIN" && project.ownerId !== user.id) {
      throw forbidden();
    }
    if (!project.archived) {
      await this.projectRepository.archiveProject(project.id);
    }
    return this.getProject(project.id, user);
  }

  async listMembers(projectIdInput, userInput, query) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    await this.assertProjectAccess(project, user);
    const pagination = parsePagination(query);
    const [members, total] = await Promise.all([
      this.projectRepository.listMembers(project.id, pagination),
      this.projectRepository.countMembers(project.id),
    ]);
    return collectionResponse(members, pagination, total);
  }

  async addMember(projectIdInput, memberIdInput, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    this.assertOwner(project, user);
    this.assertWritable(project);
    const memberId = parseId(memberIdInput, "userId");

    if (!(await this.projectRepository.userExists(memberId))) {
      throw new ApiError(404, "USER_NOT_FOUND", "User not found");
    }
    if (await this.projectRepository.isMember(project.id, memberId)) {
      throw new ApiError(409, "MEMBERSHIP_EXISTS", "User is already a project member");
    }

    try {
      const inserted = await this.projectRepository.addMember(project.id, memberId);
      if (!inserted) {
        await this.assertProjectStillWritable(project.id);
        throw notFound();
      }
    } catch (error) {
      if (error.code === DUPLICATE_KEY) {
        throw new ApiError(409, "MEMBERSHIP_EXISTS", "User is already a project member");
      }
      if (error.code === FOREIGN_KEY_MISSING) {
        throw new ApiError(404, "USER_NOT_FOUND", "User not found");
      }
      throw error;
    }
    return {
      projectId: project.id,
      userId: memberId,
      role: "MEMBER",
    };
  }

  async removeMember(projectIdInput, memberIdInput, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    this.assertOwner(project, user);
    this.assertWritable(project);
    const memberId = parseId(memberIdInput, "userId");

    if (memberId === project.ownerId) {
      throw new ApiError(409, "OWNER_MEMBERSHIP_REQUIRED", "The project owner cannot be removed");
    }

    const removed = await this.projectRepository.removeMember(project.id, memberId);
    if (!removed) {
      await this.assertProjectStillWritable(project.id);
      throw new ApiError(404, "MEMBERSHIP_NOT_FOUND", "Project membership not found");
    }
  }

  async getDashboard(projectIdInput, userInput) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    await this.assertProjectAccess(project, user);
    const countsByStatus = await this.projectRepository.getDashboardCounts(project.id);
    if (
      countsByStatus.unknownStatus > 0 ||
      TASK_STATUSES.reduce((sum, status) => sum + countsByStatus[status], 0) !== countsByStatus.total
    ) {
      throw new ApiError(
        500,
        "TASK_STATUS_CONTRACT_MISMATCH",
        "Project tasks contain an unsupported status",
      );
    }
    const total = TASK_STATUSES.reduce((sum, status) => sum + countsByStatus[status], 0);
    return {
      countsByStatus: {
        TODO: countsByStatus.TODO,
        IN_PROGRESS: countsByStatus.IN_PROGRESS,
        DONE: countsByStatus.DONE,
      },
      percentComplete: total === 0
        ? 0
        : Math.round((countsByStatus.DONE / total) * 100),
      overdue: countsByStatus.overdue,
    };
  }

  async getBoard(projectIdInput, userInput, query = {}) {
    const user = requireUser(userInput);
    const project = await this.loadProject(projectIdInput);
    await this.assertProjectAccess(project, user);
    const pagination = parsePagination(query);
    const board = { TODO: [], IN_PROGRESS: [], DONE: [] };
    const [tasks, total] = await Promise.all([
      this.projectRepository.listActiveTasks(project.id, pagination),
      this.projectRepository.countActiveTasks(project.id),
    ]);

    for (const task of tasks) {
      if (!TASK_STATUSES.includes(task.status)) {
        throw new ApiError(
          500,
          "TASK_STATUS_CONTRACT_MISMATCH",
          "A stored task has an unsupported status",
        );
      }
      board[task.status].push(task);
    }

    return collectionResponse(board, pagination, total);
  }

  async authorizeTask(taskIdInput, userInput, { write = false } = {}) {
    const user = requireUser(userInput);
    const taskId = parseId(taskIdInput, "taskId");
    const task = await this.projectRepository.findActiveTaskProject(taskId);
    if (!task) {
      throw notFound();
    }
    const project = await this.loadProject(task.projectId);
    await this.assertProjectAccess(project, user);
    if (write) {
      this.assertWritable(project);
    }
    return { task, project };
  }

  async loadProject(projectIdInput) {
    const projectId = parseId(projectIdInput, "projectId");
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw notFound();
    }
    return project;
  }

  async assertProjectAccess(project, userInput) {
    const user = requireUser(userInput);
    if (
      user.role === "ADMIN" ||
      project.ownerId === user.id ||
      await this.projectRepository.isMember(project.id, user.id)
    ) {
      return;
    }
    throw forbidden();
  }

  assertOwner(project, user) {
    if (project.ownerId !== user.id) {
      throw forbidden();
    }
  }

  assertWritable(project) {
    if (project.archived) {
      throw new ApiError(
        409,
        "ARCHIVED_PROJECT_READ_ONLY",
        "Archived projects cannot be changed",
      );
    }
  }

  async assertProjectStillWritable(projectId) {
    const current = await this.projectRepository.findById(projectId);
    if (!current) {
      throw notFound();
    }
    this.assertWritable(current);
  }
}

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found");
}

function forbidden() {
  return new ApiError(403, "FORBIDDEN", "You do not have access to this project");
}

module.exports = { ProjectService, TASK_STATUSES };
