const express = require("express");
const { createProjectController } = require("../controllers/projectController");
const { asyncHandler } = require("../utils/asyncHandler");

function createProjectRouter({ projectService, requireAuth }) {
  const router = express.Router();
  const controller = createProjectController(projectService);
  router.use(requireAuth);

  router.get("/", asyncHandler(controller.list));
  router.post("/", asyncHandler(controller.create));
  router.get("/:id/members", asyncHandler(controller.listMembers));
  router.post("/:id/members", asyncHandler(controller.addMember));
  router.delete("/:id/members/:userId", asyncHandler(controller.removeMember));
  router.get("/:id/dashboard", asyncHandler(controller.dashboard));
  router.get("/:id/board", asyncHandler(controller.board));
  router.post("/:id/archive", asyncHandler(controller.archive));
  router.patch("/:id", asyncHandler(controller.update));
  router.get("/:id", asyncHandler(controller.get));

  return router;
}

module.exports = { createProjectRouter };
