"use strict";

const { ApiError } = require("../errors/apiError");
const { parseId, requireUser } = require("../utils/ids");

class CategoryService {
  constructor({ categoryRepository, projectService }) {
    this.categoryRepository = categoryRepository;
    this.projectService = projectService;
  }

  async list(projectIdInput, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    return this.categoryRepository.listForProject(project.id);
  }

  async create(projectIdInput, body, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const name = validateCategoryName(body);

    try {
      const categoryId = await this.categoryRepository.create(
        project.id,
        name,
      );

      if (!categoryId) {
        throw new ApiError(
          409,
          "PROJECT_NOT_WRITABLE",
          "The project is no longer available for changes",
        );
      }

      return this.categoryRepository.findById(project.id, categoryId);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw duplicateCategoryError();
      }

      throw error;
    }
  }

  async update(projectIdInput, categoryIdInput, body, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const categoryId = parseId(categoryIdInput, "categoryId");
    const name = validateCategoryName(body);

    const existing = await this.categoryRepository.findById(
      project.id,
      categoryId,
    );

    if (!existing) {
      throw notFound();
    }

    try {
      const updated = await this.categoryRepository.update(
        project.id,
        categoryId,
        name,
      );

      if (!updated) {
        throw notFound();
      }

      return updated;
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw duplicateCategoryError();
      }

      throw error;
    }
  }

  async delete(projectIdInput, categoryIdInput, userInput) {
    const user = requireUser(userInput);

    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    this.projectService.assertWritable(project);

    const categoryId = parseId(categoryIdInput, "categoryId");

    const deleted = await this.categoryRepository.delete(
      project.id,
      categoryId,
    );

    if (!deleted) {
      throw notFound();
    }
  }
}

function validateCategoryName(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.name !== "string"
  ) {
    throw validationError("Category name is required");
  }

  const name = body.name.trim();

  if (name.length === 0 || name.length > 80) {
    throw validationError(
      "Category name must contain between 1 and 80 characters",
    );
  }

  return name;
}

function isDuplicateKey(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

function duplicateCategoryError() {
  return new ApiError(
    409,
    "CATEGORY_ALREADY_EXISTS",
    "A category with this name already exists in the project",
  );
}

function validationError(message) {
  return new ApiError(400, "VALIDATION_ERROR", message);
}

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found");
}

module.exports = { CategoryService };