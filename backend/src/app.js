
"use strict";

const express = require("express");
const {
  authenticationUnavailable,
} = require("./middleware/authenticationUnavailable");
const { createCorsMiddleware } = require("./middleware/cors");
const { errorHandler } = require("./middleware/errorHandler");
const { requestContext } = require("./middleware/requestContext");
const {
  createCommentRouter,
} = require("./controllers/commentController");
const { createProjectRouter } = require("./routes/projectRoutes");
const { createAuthRouter } = require("./routes/authRoutes");
const {
  createTaskServiceRouter,
} = require("./routes/taskServiceRoutes");
const {
  createActivityRouter,
} = require("./routes/activityRoutes");

const DEFAULT_CORS_ORIGINS = ["http://localhost:5173"];

function createApp({
  corsOrigins = DEFAULT_CORS_ORIGINS,
  requireAuth = authenticationUnavailable,
  projectService,
  commentService,
  taskService,
  activityService,
  authService,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(createCorsMiddleware(corsOrigins));
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  if (authService) {
    app.use("/api/v1/auth", createAuthRouter({ authService, requireAuth }));
  }

  if (projectService) {
    app.use(
      "/api/v1/projects",
      createProjectRouter({ projectService, requireAuth }),
    );
  }

  if (activityService) {
    app.use(
      "/api/v1/projects",
      createActivityRouter({ activityService, requireAuth }),
    );
  }

  if (commentService) {
    app.use(
      "/api/v1",
      createCommentRouter({ express, commentService, requireAuth }),
    );
  }

  if (taskService) {
    app.use(
      "/api/v1",
      createTaskServiceRouter({ taskService, requireAuth }),
    );
  }

  app.use((req, res) => {
    if (
      req.path.startsWith("/api/v1/") &&
      (
        (!projectService && req.path.startsWith("/api/v1/projects")) ||
        req.path.startsWith("/api/v1/tasks") ||
        (!commentService && req.path.startsWith("/api/v1/comments/"))
      )
    ) {
      return res.status(503).json({
        error: {
          code: "API_NOT_CONFIGURED",
          message: "API services are not configured",
        },
      });
    }

    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
      },
    });
  });

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
