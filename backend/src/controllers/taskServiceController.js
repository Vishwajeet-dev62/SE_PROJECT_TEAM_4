
"use strict";

function createTaskServiceController(taskService) {
  return {
    list: async (req, res) => {
      const result = await taskService.list(
        req.params.projectId,
        req.user,
        req.query,
      );
      res.status(200).json(result);
    },

    create: async (req, res) => {
      const task = await taskService.create(
        req.params.projectId,
        req.body,
        req.user,
      );
      res.status(201).json({ data: task });
    },

    get: async (req, res) => {
      const task = await taskService.get(req.params.id, req.user);
      res.status(200).json({ data: task });
    },

    update: async (req, res) => {
      const task = await taskService.update(
        req.params.id,
        req.body,
        req.user,
      );
      res.status(200).json({ data: task });
    },

    delete: async (req, res) => {
      await taskService.delete(req.params.id, req.user);
      res.status(204).end();
    },

    trash: async (req, res) => {
      const result = await taskService.listTrash(
        req.params.projectId,
        req.user,
        req.query,
      );
      res.status(200).json(result);
    },

    restore: async (req, res) => {
      const task = await taskService.restore(req.params.id, req.user);
      res.status(200).json({ data: task });
    },
  };
}

module.exports = { createTaskServiceController };
