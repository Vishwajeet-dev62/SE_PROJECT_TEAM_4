
"use strict";

function createNotificationController(notificationService) {
  return {
    list: async (req, res) => {
      const result = await notificationService.list(
        req.user,
        req.query,
      );

      res.status(200).json(result);
    },

    markAsRead: async (req, res) => {
      const notification = await notificationService.markAsRead(
        req.params.id,
        req.user,
      );

      res.status(200).json({ data: notification });
    },

    markAllAsRead: async (req, res) => {
      const result = await notificationService.markAllAsRead(req.user);

      res.status(200).json({ data: result });
    },

    countUnread: async (req, res) => {
      const result = await notificationService.countUnread(req.user);

      res.status(200).json({ data: result });
    },
  };
}

module.exports = { createNotificationController };
