
"use strict";

const { requireUser } = require("../utils/ids");
const {
  collectionResponse,
  parsePagination,
} = require("../utils/pagination");

class ActivityService {
  constructor({ activityRepository, projectService }) {
    this.activityRepository = activityRepository;
    this.projectService = projectService;
  }

  async list(projectIdInput, userInput, query = {}) {
    const user = requireUser(userInput);

    // Enforce project-level access before returning history.
    const project = await this.projectService.getProject(
      projectIdInput,
      user,
    );

    const pagination = parsePagination(query);

    const [items, total] = await Promise.all([
      this.activityRepository.listForProject(project.id, pagination),
      this.activityRepository.countForProject(project.id),
    ]);

    return collectionResponse(items, pagination, total);
  }

  async record(event) {
    return this.activityRepository.create(event);
  }
}

module.exports = { ActivityService };
