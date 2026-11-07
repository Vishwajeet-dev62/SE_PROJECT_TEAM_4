"use strict";

const express = require("express");
const { createCategoryController } = require("../controllers/categoryController");
const { asyncHandler } = require("../utils/asyncHandler");

function createCategoryRouter({ categoryService, requireAuth }) {
  const router = express.Router({
    mergeParams: true,
  });

  const controller = createCategoryController(categoryService);

  router.use(requireAuth);

  router.get("/", asyncHandler(controller.list));
  router.post("/", asyncHandler(controller.create));
  router.patch("/:categoryId", asyncHandler(controller.update));
  router.delete("/:categoryId", asyncHandler(controller.delete));

  return router;
}

module.exports = { createCategoryRouter };