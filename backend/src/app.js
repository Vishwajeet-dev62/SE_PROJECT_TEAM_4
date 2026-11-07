
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

const {
  createNotificationRouter,
} = require("./routes/notificationRoutes");

const DEFAULT_CORS_ORIGINS = ["http://localhost:5173"];

function createApp({
  corsOrigins = DEFAULT_CORS_ORIGINS,
  requireAuth = authenticationUnavailable,
  projectService,
  commentService,
  categoryService,
  taskService,
  activityService,
  authService,
  notificationService,
} = {}) {
  const app = express();

  // Security and common middleware
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(createCorsMiddleware(corsOrigins));
  app.use(express.json({ limit: "32kb" }));

  // Health check
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Authentication routes
  if (authService) {
    app.use(
      "/api/v1/auth",
      createAuthRouter({ authService, requireAuth }),
    );
  }

  // Project routes
  if (projectService) {
    app.use(
      "/api/v1/projects",
      createProjectRouter({ projectService, requireAuth, categoryService, }),
    );
  }

  // Activity history routes
  if (activityService) {
    app.use(
      "/api/v1/projects",
      createActivityRouter({ activityService, requireAuth }),
    );
  }

  // Notification routes
  if (notificationService) {
    app.use(
      "/api/v1/notifications",
      createNotificationRouter({
        notificationService,
        requireAuth,
      }),
    );
  }

  // Comment routes
  if (commentService) {
    app.use(
      "/api/v1",
      createCommentRouter({
        express,
        commentService,
        requireAuth,
      }),
    );
  }

  // Task routes
  if (taskService) {
    app.use(
      "/api/v1",
      createTaskServiceRouter({
        taskService,
        requireAuth,
      }),
    );
  }

  // Handle API requests when required services are unavailable
  app.use((req, res) => {
    const isApiRequest = req.path.startsWith("/api/v1/");

    const isUnconfiguredApi =
      (!projectService &&
        req.path.startsWith("/api/v1/projects")) ||
      (!taskService &&
        req.path.startsWith("/api/v1/tasks")) ||
      (!commentService &&
        req.path.startsWith("/api/v1/comments/")) ||
      (!activityService &&
        req.path.startsWith("/api/v1/projects") &&
        req.path.includes("/activity")) ||
      (!notificationService &&
        req.path.startsWith("/api/v1/notifications")) ||
      (!authService &&
        req.path.startsWith("/api/v1/auth"));

    if (isApiRequest && isUnconfiguredApi) {
      return res.status(503).json({
        error: {
          code: "API_NOT_CONFIGURED",
          message: "API services are not configured",
        },
      });
    }

    return res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Resource not found",
      },
    });
  });

  // Centralized error handling
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
