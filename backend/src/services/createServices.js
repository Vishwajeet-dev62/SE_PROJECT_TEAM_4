
"use strict";

const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { TaskRepository } = require("../repositories/taskRepository");
const { CategoryRepository } = require("../repositories/categoryRepository");
const { UserRepository } = require("../repositories/userRepository");
const { AuditLogRepository } = require("../repositories/auditLogRepository");
const { createAuditLog } = require("./auditLog");
const { TagRepository } = require("../repositories/tagRepository");
const { TagService } = require("./tagService");


const {
  TokenRevocationRepository,
} = require("../repositories/tokenRevocationRepository");

const {
  ActivityRepository,
} = require("../repositories/activityRepository");

const {
  PasswordResetRepository,
} = require("../repositories/passwordResetRepository");

const {
  AssignmentRepository,
} = require("../repositories/assignmentRepository");

const { CommentService } = require("./commentService");
const { ProjectService } = require("./projectService");
const { TaskService } = require("./taskService");
const { CategoryService } = require("./categoryService");
const { AdminService } = require("./adminService");
const { AssignmentService } = require("./assignmentService");
const { AuthService } = require("./authService");
const { PasswordResetService } = require("./passwordResetService");
const { ActivityService } = require("./activityService");

const {
  createDevEmailSender,
  createUnconfiguredEmailSender,
  createSmtpEmailSender,
} = require("./emailSender");

const { createRequireAuth } = require("../middleware/requireAuth");

const {
  NotificationRepository,
} = require("../repositories/notificationRepository");

const { NotificationService } = require("./notificationService");

function createServices(pool, authConfig = {}) {
  // Project
  const projectRepository = new ProjectRepository(pool);
  const projectService = new ProjectService(projectRepository);

  // Activity
  const activityRepository = new ActivityRepository(pool);
  const activityService = new ActivityService({
    activityRepository,
    projectService,
  });

  // Notifications
  const notificationRepository = new NotificationRepository(pool);
  const notificationService = new NotificationService({
    notificationRepository,
  });

  // Comments
  const commentRepository = new CommentRepository(pool);
  const commentService = new CommentService({
    commentRepository,
    projectService,
  });

  // Tasks, categories and tags
  const taskRepository = new TaskRepository(pool);
  const categoryRepository = new CategoryRepository(pool);
  const tagRepository = new TagRepository(pool);

  const taskService = new TaskService({
    taskRepository,
    projectService,
    projectRepository,
    categoryRepository,
    tagRepository,
    activityService,
  });

  const categoryService = new CategoryService({
    categoryRepository,
    projectService,
  });

  const tagService = new TagService({
    tagRepository,
    projectService,
  });

  // Assignments
  const assignmentService = new AssignmentService({
    projectService,
    projectRepository,
    taskRepository,
    taskService,
    assignmentRepository: new AssignmentRepository(pool),
    notificationService,
    activityService,
  });

  // Authentication and audit
  const userRepository = new UserRepository(pool);
  const tokenRevocationRepository = new TokenRevocationRepository(pool);

  const auditLog = createAuditLog(new AuditLogRepository(pool));

  const authService = new AuthService({
    userRepository,
    auditLog,
    tokenRevocationRepository,
    jwtSecret: authConfig.jwtSecret,
    jwtExpiresIn: authConfig.jwtExpiresIn,
  });

  // Administration
  const adminService = new AdminService({
    userRepository,
    auditLog,
  });

  // Password reset
  const passwordResetService = new PasswordResetService({
    passwordResetRepository: new PasswordResetRepository(pool),
    userRepository,
    auditLog,
    emailSender: authConfig.email?.smtp
      ? createSmtpEmailSender(authConfig.email.smtp)
      : (authConfig.nodeEnv || process.env.NODE_ENV) === "production"
        ? createUnconfiguredEmailSender()
        : createDevEmailSender(),
    resetUrlBase:
      authConfig.passwordResetUrl ||
      process.env.PASSWORD_RESET_URL ||
      "http://localhost:5173/reset-password",
  });

  const requireAuth = createRequireAuth({
    jwtSecret: authConfig.jwtSecret,
    userRepository,
    tokenRevocationRepository,
  });

  return {
    projectService,
    activityService,
    commentService,
    taskService,
    assignmentService,
    authService,
    requireAuth,
    categoryService,
    tagService,
    auditLog,
    adminService,
    passwordResetService,
    notificationService,
  };
}

module.exports = { createServices };
