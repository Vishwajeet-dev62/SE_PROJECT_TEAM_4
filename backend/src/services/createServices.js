const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { CommentService } = require("./commentService");
const { ProjectService } = require("./projectService");
const { UserRepository } = require("../repositories/userRepository");
const { AuthService } = require("./authService");

function createServices(pool, authConfig = {}) {
  const projectRepository = new ProjectRepository(pool);
  const projectService = new ProjectService(projectRepository);
  const commentRepository = new CommentRepository(pool);
  const commentService = new CommentService({
    commentRepository,
    projectService,
  });
  const userRepository = new UserRepository(pool);
  const authService = new AuthService({
    userRepository,
    jwtSecret: authConfig.jwtSecret,
    jwtExpiresIn: authConfig.jwtExpiresIn,
  });
  return { projectService, commentService, authService };
}

module.exports = { createServices };
