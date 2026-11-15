"use strict";

const { createApp } = require("./src/app");
const { createPool } = require("./src/config/database");
const { getConfig } = require("./src/config/env");
const { createServices } = require("./src/services/createServices");
const {
  startAuditRetentionScheduler,
} = require("./src/services/auditRetentionScheduler");
const {
  startTaskReminderScheduler,
} = require("./src/services/taskReminderScheduler");

function start() {
  require("dotenv").config();

  const config = getConfig();
  const pool = createPool(config.db);

  const services = createServices(pool, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    nodeEnv: config.nodeEnv,
    email: config.email,
  });

  const app = createApp({
    ...services,
    corsOrigins: config.corsOrigins,
    trustProxy: config.trustProxy,
  });
  const stopReminderScheduler = startTaskReminderScheduler({
    taskReminderService: services.taskReminderService,
  });

  const stopAuditRetentionScheduler = startAuditRetentionScheduler({
    auditRetentionService: services.auditRetentionService,
  });

  const server = app.listen(config.port, () => {
    console.info(`Task Manager API listening on port ${config.port}`);
  });

  let shuttingDown = false;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      stopReminderScheduler();
      stopAuditRetentionScheduler();

      server.close(async (error) => {
        if (error) {
          console.error("Failed to stop the HTTP server cleanly");
          process.exitCode = 1;
        }

        await pool.end();
      });
    });
  }

  return { server, pool, stopReminderScheduler, stopAuditRetentionScheduler };
}

if (require.main === module) {
  start();
}

module.exports = { start };
