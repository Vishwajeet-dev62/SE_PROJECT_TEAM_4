const { ApiError } = require("../errors/apiError");
const { requireUser } = require("../utils/ids");
const { validateAssignment } = require("../validators/assignmentValidators");

const TITLE_ASSIGNED = "Task assigned to you";
const TITLE_UNASSIGNED = "Task unassigned";

// PATCH /tasks/:id/assignment (contract section 8, Member 3).
class AssignmentService {
  constructor({
    projectService,
    projectRepository,
    taskRepository,
    taskService,
    assignmentRepository,
    notificationService,
    activityService,
    logger = console,
  }) {
    this.projectService = projectService;
    this.projectRepository = projectRepository;
    this.taskRepository = taskRepository;
    this.taskService = taskService;
    this.assignmentRepository = assignmentRepository;
    this.notificationService = notificationService;
    this.activityService = activityService;
    this.logger = logger;
  }

  async assign(taskIdInput, body, userInput) {
    const user = requireUser(userInput);
    const { task: authorized, project } = await this.projectService.authorizeTask(
      taskIdInput,
      user,
      { write: true },
    );
    const task = await this.taskRepository.findById(authorized.id);
    if (!task) {
      throw new ApiError(404, "NOT_FOUND", "Resource not found");
    }

    if (!canAssign(task, project, user)) {
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have permission to assign this task",
      );
    }

    const { assigneeId } = validateAssignment(body);
    await this.validateAssignee(assigneeId, project);

    const previousAssigneeId = task.assignedTo ?? null;
    if (assigneeId === previousAssigneeId) {
      return this.taskService.get(task.id, user); // nothing to change
    }

    const changed = await this.assignmentRepository.setAssignee({
      taskId: task.id,
      assigneeId,
      expectedAssigneeId: previousAssigneeId,
    });
    if (!changed) {
      // Surface archived or deleted state first, otherwise it was a race.
      await this.projectService.authorizeTask(task.id, user, { write: true });
      throw new ApiError(
        409,
        "TASK_CHANGED",
        "The task was changed by someone else; reload it and try again",
      );
    }

    await this.recordActivity(project, user, task, previousAssigneeId, assigneeId);
    await this.notify(project, user, task, previousAssigneeId, assigneeId);

    return this.taskService.get(task.id, user);
  }

  async validateAssignee(assigneeId, project) {
    if (assigneeId === null) {
      return;
    }
    if (!(await this.projectRepository.userExists(assigneeId))) {
      throw new ApiError(404, "USER_NOT_FOUND", "Assigned user not found");
    }
    if (
      assigneeId !== project.ownerId
      && !(await this.projectRepository.isMember(project.id, assigneeId))
    ) {
      throw new ApiError(
        400,
        "ASSIGNEE_NOT_PROJECT_MEMBER",
        "The assignee must be the project owner or a project member",
      );
    }
  }

  async recordActivity(project, user, task, from, to) {
    try {
      await this.activityService.record({
        projectId: project.id,
        userId: user.id,
        eventType: to === null ? "TASK_UNASSIGNED" : "TASK_ASSIGNED",
        details: { taskId: task.id, from, to },
      });
    } catch {
      // Task history is best effort and must not undo a successful change.
      this.logger.error("Failed to record assignment activity");
    }
  }

  // The new assignee is told about the task (SRS TM-F-014); a previous
  // assignee is told it moved away. Nobody is notified about their own action.
  async notify(project, user, task, from, to) {
    const data = {
      taskId: task.id,
      projectId: project.id,
      changedBy: user.id,
    };
    const messages = [];
    if (to !== null && to !== user.id) {
      messages.push({
        userId: to,
        type: "TASK_ASSIGNED",
        title: TITLE_ASSIGNED,
        message: `You were assigned the task "${task.title}".`,
      });
    }
    if (from !== null && from !== user.id) {
      messages.push({
        userId: from,
        type: "TASK_UNASSIGNED",
        title: TITLE_UNASSIGNED,
        message: `You are no longer assigned to the task "${task.title}".`,
      });
    }

    for (const message of messages) {
      try {
        await this.notificationService.create({ ...message, data });
      } catch {
        this.logger.error("Failed to create assignment notification");
      }
    }
  }
}

// The task creator and current assignee (SRS TM-F-011 owner-or-assignee
// rule), plus the project owner and administrators, who manage the team.
function canAssign(task, project, user) {
  return (
    user.role === "ADMIN"
    || project.ownerId === user.id
    || task.createdBy === user.id
    || task.assignedTo === user.id
  );
}

module.exports = { AssignmentService };
