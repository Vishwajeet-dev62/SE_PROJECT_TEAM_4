"use strict";

const express = require("express");
const { createTagController } = require("../controllers/tagController");
const { asyncHandler } = require("../utils/asyncHandler");

function createTagRouter({ tagService, requireAuth }) {
  const router = express.Router({
    mergeParams: true,
  });

  const controller = createTagController(tagService);

  router.use(requireAuth);

  router.get("/", asyncHandler(controller.list));
  router.post("/", asyncHandler(controller.create));
  router.patch("/:tagId", asyncHandler(controller.update));
  router.delete("/:tagId", asyncHandler(controller.delete));

  return router;
}

module.exports = { createTagRouter };