
"use strict";

function createActivityController(activityService) {
  return {
    list: async (req, res) => {
      const result = await activityService.list(
        req.params.projectId,
        req.user,
        req.query,
      );

      res.status(200).json(result);
    },
  };
}

module.exports = { createActivityController };
