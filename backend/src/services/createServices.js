
"use strict";

const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { TaskRepository } = require("../repositories/taskRepository");
const { CategoryRepository } = require("../repositories/categoryRepository");
const { UserRepository } = require("../repositories/userRepository");
const {
  TokenRevocationRepository,
} = require("../repositories/tokenRevocationRepository");
const {
  ActivityRepository,
} = require("../repositories/activityRepository");

const { CommentService } = require("./commentService");
const { ProjectService } = require("./projectService");
const { TaskService } = require("./taskService");
const { CategoryService } = require("./categoryService");
const { AuthService } = require("./authService");
const { ActivityService } = require("./activityService");
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

  // Tasks and categories
  const taskRepository = new TaskRepository(pool);
  const categoryRepository = new CategoryRepository(pool);

  const taskService = new TaskService({
    taskRepository,
    projectService,
    projectRepository,
    categoryRepository,
    activityService,
  });

  const categoryService = new CategoryService({
    categoryRepository,
    projectService,
  });

  // Authentication
  const userRepository = new UserRepository(pool);
  const tokenRevocationRepository = new TokenRevocationRepository(pool);

  const authService = new AuthService({
    userRepository,
    tokenRevocationRepository,
    jwtSecret: authConfig.jwtSecret,
    jwtExpiresIn: authConfig.jwtExpiresIn,
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
    authService,
    requireAuth,
    categoryService,
    notificationService,
  };
}

module.exports = { createServices };
