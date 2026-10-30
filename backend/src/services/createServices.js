
"use strict";

const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { TaskRepository } = require("../repositories/taskRepository");
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
const { AuthService } = require("./authService");
const { ActivityService } = require("./activityService");
const { createRequireAuth } = require("../middleware/requireAuth");

const { NotificationRepository } = require("../repositories/notificationRepository");
const { NotificationService } = require("./notificationService");

function createServices(pool, authConfig = {}) {
  const projectRepository = new ProjectRepository(pool);
  const projectService = new ProjectService(projectRepository);

  const activityRepository = new ActivityRepository(pool);
  const activityService = new ActivityService({
    activityRepository,
    projectService,
  });

  const notificationRepository = new NotificationRepository(pool);
  const notificationService = new NotificationService({
    notificationRepository,
});

  const commentRepository = new CommentRepository(pool);
  const commentService = new CommentService({
    commentRepository,
    projectService,
  });

  const taskRepository = new TaskRepository(pool);
  const taskService = new TaskService({
    taskRepository,
    projectService,
    projectRepository,
    activityService,
  });

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
    notificationService,
  };
}

module.exports = { createServices };
