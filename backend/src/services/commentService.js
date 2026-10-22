const { ApiError } = require("../errors/apiError");
const { requireUser, parseId } = require("../utils/ids");
const { collectionResponse, parsePagination } = require("../utils/pagination");

class CommentService {
  constructor({ commentRepository, projectService }) {
    this.commentRepository = commentRepository;
    this.projectService = projectService;
  }

  async list(taskIdInput, userInput, query) {
    const user = requireUser(userInput);
    const { task, project } = await this.projectService.authorizeTask(taskIdInput, user);
    const pagination = parsePagination(query);
    const [comments, total] = await Promise.all([
      this.commentRepository.listForTask(task.id, pagination),
      this.commentRepository.countForTask(task.id),
    ]);
    return collectionResponse(
      comments.map((comment) => withPermissions(comment, user, project)),
      pagination,
      total,
    );
  }

  async create(taskIdInput, body, userInput) {
    const user = requireUser(userInput);
    const { task } = await this.projectService.authorizeTask(
      taskIdInput,
      user,
      { write: true },
    );
    const commentId = await this.commentRepository.create({
      taskId: task.id,
      authorId: user.id,
      body,
    });
    if (!commentId) {
      await this.projectService.authorizeTask(task.id, user, { write: true });
      throw notFound();
    }
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw notFound();
    }
    return withPermissions(comment, user, {
      ownerId: comment.ownerId,
      archived: comment.archived,
    });
  }

  async update(commentIdInput, body, userInput) {
    const user = requireUser(userInput);
    const comment = await this.loadComment(commentIdInput, user);
    this.projectService.assertWritable({ archived: comment.archived });
    if (comment.authorId !== user.id) {
      throw forbidden();
    }

    const updated = await this.commentRepository.update(comment.id, body);
    if (!updated) {
      const current = await this.loadComment(comment.id, user);
      this.projectService.assertWritable({ archived: current.archived });
    }
    const updatedComment = await this.commentRepository.findById(comment.id);
    if (!updatedComment) {
      throw notFound();
    }
    return withPermissions(updatedComment, user, {
      ownerId: updatedComment.ownerId,
      archived: updatedComment.archived,
    });
  }

  async delete(commentIdInput, userInput) {
    const user = requireUser(userInput);
    const comment = await this.loadComment(commentIdInput, user);
    this.projectService.assertWritable({ archived: comment.archived });
    const isAuthor = comment.authorId === user.id;
    const isOwner = comment.ownerId === user.id;
    const isAdmin = user.role === "ADMIN";
    if (!isAuthor && !isOwner && !isAdmin) {
      throw forbidden();
    }

    const deleted = await this.commentRepository.delete(comment.id);
    if (!deleted) {
      const current = await this.loadComment(comment.id, user);
      this.projectService.assertWritable({ archived: current.archived });
      throw notFound();
    }
  }

  async loadComment(commentIdInput, user) {
    const commentId = parseId(commentIdInput, "commentId");
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw notFound();
    }
    await this.projectService.assertProjectAccess(
      {
        id: comment.projectId,
        ownerId: comment.ownerId,
        archived: comment.archived,
      },
      user,
    );
    return comment;
  }
}

function validateCommentBody(body) {
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Comment body is required", {
      body: "This field cannot be empty",
    });
  }
  const trimmed = body.trim();
  if (trimmed.length > 5000) {
    throw new ApiError(400, "VALIDATION_ERROR", "Comment body is too long", {
      body: "Must not exceed 5000 characters",
    });
  }
  return trimmed;
}

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found");
}

function forbidden() {
  return new ApiError(403, "FORBIDDEN", "You do not have permission to change this comment");
}

function withPermissions(comment, user, project) {
  const isAuthor = comment.authorId === user.id;
  return {
    ...comment,
    permissions: {
      canEdit: isAuthor && !project.archived,
      canDelete: (isAuthor || project.ownerId === user.id || user.role === "ADMIN")
        && !project.archived,
    },
  };
}

module.exports = { CommentService, validateCommentBody };
