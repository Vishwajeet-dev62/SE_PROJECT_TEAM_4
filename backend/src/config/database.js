const mysql = require("mysql2/promise");

function createPool(databaseConfig) {
  return mysql.createPool({
    ...databaseConfig,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    waitForConnections: true,
    queueLimit: 0,
  });
}

module.exports = { createPool };
