"use strict";

const { ApiError } = require("../errors/apiError");
const { parseId, requireUser } = require("../utils/ids");

class TagService {
  constructor({ tagRepository, projectService }) {
    this.tagRepository = tagRepository;
    this.projectService = projectService;
  }

  async list(projectIdInput, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    return this.tagRepository.listForProject(project.id);
  }

  async create(projectIdInput, body, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const name = validateTagName(body);

    try {
      const tagId = await this.tagRepository.create(
        project.id,
        name,
      );

      if (!tagId) {
        throw new ApiError(
          409,
          "PROJECT_NOT_WRITABLE",
          "The project is no longer available for changes",
        );
      }

      return this.tagRepository.findById(project.id, tagId);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw duplicateTagError();
      }

      throw error;
    }
  }

  async update(projectIdInput, tagIdInput, body, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const tagId = parseId(tagIdInput, "tagId");
    const name = validateTagName(body);

    const existing = await this.tagRepository.findById(
      project.id,
      tagId,
    );

    if (!existing) {
      throw notFound();
    }

    try {
      const updated = await this.tagRepository.update(
        project.id,
        tagId,
        name,
      );

      if (!updated) {
        throw notFound();
      }

      return updated;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw duplicateTagError();
      }

      throw error;
    }
  }

  async delete(projectIdInput, tagIdInput, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const tagId = parseId(tagIdInput, "tagId");

    const deleted = await this.tagRepository.delete(
      project.id,
      tagId,
    );

    if (!deleted) {
      throw notFound();
    }
  }
}

function validateTagName(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.name !== "string"
  ) {
    throw validationError("Tag name is required");
  }

  const name = body.name.trim();

  if (name.length === 0 || name.length > 80) {
    throw validationError(
      "Tag name must contain between 1 and 80 characters",
    );
  }

  return name;
}

function isDuplicateKey(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

function duplicateTagError() {
  return new ApiError(
    409,
    "TAG_ALREADY_EXISTS",
    "A tag with this name already exists in the project",
  );
}

function validationError(message) {
  return new ApiError(400, "VALIDATION_ERROR", message);
}

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found");
}

module.exports = { TagService };