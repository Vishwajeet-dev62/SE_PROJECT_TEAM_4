
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

  const smtpVariables = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
  ];

  const smtpConfigured = smtpVariables.some(
    (name) => Boolean(env[name]?.trim()),
  );

  let smtp = null;

  if (smtpConfigured) {
    for (const name of smtpVariables) {
      if (!env[name]?.trim()) {
        throw new Error(`${name} is required when SMTP is configured`);
      }
    }

    const secureValue = (env.SMTP_SECURE || "false").toLowerCase();

    if (!["true", "false"].includes(secureValue)) {
      throw new Error("SMTP_SECURE must be true or false");
    }

    const port = readInteger(
      "SMTP_PORT",
      env.SMTP_PORT,
      587,
      1,
      65535,
    );

    smtp = {
      host: env.SMTP_HOST.trim(),
      port,
      secure: secureValue === "true",
      user: env.SMTP_USER.trim(),
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM?.trim() || env.SMTP_USER.trim(),
    };
  }

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
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN || "30m",
    corsOrigins: origins,
    email: { smtp },
  };
}

module.exports = { getConfig };
