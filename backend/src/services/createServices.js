
"use strict";

const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { TaskRepository } = require("../repositories/taskRepository");
const { UserRepository } = require("../repositories/userRepository");
const { TokenRevocationRepository } = require("../repositories/tokenRevocationRepository");

const { CommentService } = require("./commentService");
const { ProjectService } = require("./projectService");
const { TaskService } = require("./taskService");
const { AuthService } = require("./authService");
const { createRequireAuth } = require("../middleware/requireAuth");

function createServices(pool, authConfig = {}) {
  const projectRepository = new ProjectRepository(pool);
  const projectService = new ProjectService(projectRepository);

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
    commentService,
    taskService,
    authService,
    requireAuth,
  };
}

module.exports = { createServices };
