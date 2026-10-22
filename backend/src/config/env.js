const DEFAULT_PORT = 3000;

function readInteger(name, value, fallback, minimum, maximum) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function getConfig(env = process.env) {
  const dbUser = env.DB_USER?.trim();
  const dbName = env.DB_NAME?.trim();

  if (!dbUser) {
    throw new Error("DB_USER is required");
  }
  if (!dbName) {
    throw new Error("DB_NAME is required");
  }

  const origins = (env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: env.NODE_ENV || "development",
    port: readInteger("PORT", env.PORT, DEFAULT_PORT, 1, 65535),
    db: {
      host: env.DB_HOST || "localhost",
      port: readInteger("DB_PORT", env.DB_PORT, 3306, 1, 65535),
      user: dbUser,
      password: env.DB_PASSWORD || "",
      database: dbName,
      connectionLimit: readInteger(
        "DB_CONNECTION_LIMIT",
        env.DB_CONNECTION_LIMIT,
        10,
        1,
        100,
      ),
    },
    corsOrigins: origins,
  };
}

module.exports = { getConfig };
