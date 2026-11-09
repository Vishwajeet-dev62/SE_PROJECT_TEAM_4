"use strict";

function createCategoryController(categoryService) {
  return {
    list: async (req, res) => {
      const categories = await categoryService.list(
        req.params.id,
        req.user,
      );

      res.status(200).json({
        data: categories,
      });
    },

    create: async (req, res) => {
      const category = await categoryService.create(
        req.params.id,
        req.body,
        req.user,
      );

      res.status(201).json({
        data: category,
      });
    },

    update: async (req, res) => {
      const category = await categoryService.update(
        req.params.id,
        req.params.categoryId,
        req.body,
        req.user,
      );

      res.status(200).json({
        data: category,
      });
    },

    delete: async (req, res) => {
      await categoryService.delete(
        req.params.id,
        req.params.categoryId,
        req.user,
      );

      res.status(204).send();
    },
  };
}

module.exports = { createCategoryController };