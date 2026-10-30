
"use strict";

const { ApiError } = require("../errors/apiError");
const { requireUser } = require("../utils/ids");
const {
  collectionResponse,
  parsePagination,
} = require("../utils/pagination");

class NotificationService {
  constructor({ notificationRepository }) {
    this.notificationRepository = notificationRepository;
  }

  async create(input) {
    const {
      userId,
      type,
      title,
      message,
      data = null,
    } = input || {};

    if (
      !/^[1-9]\d*$/.test(String(userId ?? "")) ||
      typeof type !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,49}$/.test(type) ||
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 150 ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Notification input is invalid",
      );
    }

    if (
      data !== null &&
      (typeof data !== "object" || Array.isArray(data))
    ) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Notification data must be a JSON object or null",
      );
    }

    return this.notificationRepository.create({
      userId: String(userId),
      type,
      title: title.trim(),
      message: message.trim(),
      data,
    });
  }

  async list(userInput, query = {}) {
    const user = requireUser(userInput);
    const pagination = parsePagination(query);

    const { rows, total } =
      await this.notificationRepository.findByUser(
        user.id,
        pagination,
      );

    return collectionResponse(rows, pagination, total);
  }

  async markAsRead(notificationIdInput, userInput) {
    const user = requireUser(userInput);

    if (!/^[1-9]\d*$/.test(String(notificationIdInput ?? ""))) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid notification ID",
      );
    }

    const notification =
      await this.notificationRepository.markAsRead(
        user.id,
        String(notificationIdInput),
      );

    if (!notification) {
      throw new ApiError(
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification not found",
      );
    }

    return notification;
  }

  async markAllAsRead(userInput) {
    const user = requireUser(userInput);

    const updatedCount =
      await this.notificationRepository.markAllAsRead(user.id);

    return { updatedCount };
  }

  async countUnread(userInput) {
    const user = requireUser(userInput);

    const count =
      await this.notificationRepository.countUnread(user.id);

    return { count };
  }
}

module.exports = { NotificationService };
