
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

    exportCsv: async (req, res) => {
      const tasks = await taskService.exportCsv(
        req.params.projectId,
        req.user,
        req.query,
      );

      const headers = [
        "ID",
        "Title",
        "Description",
        "Status",
        "Priority",
        "Assigned To",
        "Category ID",
        "Due Date",
        "Tags",
        "Created At",
        "Updated At",
      ];

      const escapeCsv = (value) => {
        const text =
          value === null || value === undefined
            ? ""
            : String(value);

        const safeText = /^[\u0000-\u0020]*[=+\-@]/.test(text)
          ? `'${text}`
          : text;

        return `"${safeText.replace(/"/g, '""')}"`;
      };

      const rows = tasks.map((task) => [
        task.id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.assignedTo,
        task.categoryId,
        task.dueDate,
        (task.tags || []).map((tag) => tag.name).join(", "),
        task.createdAt,
        task.updatedAt,
      ]);

      const csv = [
        headers.map(escapeCsv).join(","),
        ...rows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\r\n");

      res
        .status(200)
        .set({
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="tasks.csv"',
        })
        .send(`\uFEFF${csv}`);
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
