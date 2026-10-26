const { createApp } = require("./src/app");
const { createPool } = require("./src/config/database");
const { getConfig } = require("./src/config/env");
const { createServices } = require("./src/services/createServices");

function start() {
  require("dotenv").config();
  const config = getConfig();
  const pool = createPool(config.db);
  const services = createServices(pool, {
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
  });
  const app = createApp({ ...services, corsOrigins: config.corsOrigins });
  const server = app.listen(config.port, () => {
    console.info(`Task Manager API listening on port ${config.port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(async (error) => {
        if (error) {
          console.error("Failed to stop the HTTP server cleanly");
          process.exitCode = 1;
        }
        await pool.end();
      });
    });
  }

  return { server, pool };
}

if (require.main === module) {
  start();
}

module.exports = { start };
