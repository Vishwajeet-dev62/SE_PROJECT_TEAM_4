"use strict";

function createTagController(tagService) {
  return {
    list: async (req, res) => {
      const tags = await tagService.list(
        req.params.id,
        req.user,
      );

      res.status(200).json({
        data: tags,
      });
    },

    create: async (req, res) => {
      const tag = await tagService.create(
        req.params.id,
        req.body,
        req.user,
      );

      res.status(201).json({
        data: tag,
      });
    },

    update: async (req, res) => {
      const tag = await tagService.update(
        req.params.id,
        req.params.tagId,
        req.body,
        req.user,
      );

      res.status(200).json({
        data: tag,
      });
    },

    delete: async (req, res) => {
      await tagService.delete(
        req.params.id,
        req.params.tagId,
        req.user,
      );

      res.status(204).send();
    },
  };
}

module.exports = { createTagController };