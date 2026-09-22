import pino from "pino";
import { getEnv } from "@/server/config/env";

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "cookie",
      "authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
    ],
    remove: true,
  },
  base: { service: "ghms" },
});

export const securityLogger = logger.child({ channel: "security" });
