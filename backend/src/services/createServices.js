const { CommentRepository } = require("../repositories/commentRepository");
const { ProjectRepository } = require("../repositories/projectRepository");
const { CommentService } = require("./commentService");
const { ProjectService } = require("./projectService");

function createServices(pool) {
  const projectRepository = new ProjectRepository(pool);
  const projectService = new ProjectService(projectRepository);
  const commentRepository = new CommentRepository(pool);
  const commentService = new CommentService({
    commentRepository,
    projectService,
  });
  return { projectService, commentService };
}

module.exports = { createServices };
