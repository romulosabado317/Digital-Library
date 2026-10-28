import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173").refine(
    (origins) => origins.split(",").every((origin) => {
      try {
        return ["http:", "https:"].includes(new URL(origin.trim()).protocol);
      } catch {
        return false;
      }
    }),
    "FRONTEND_ORIGIN must contain one or more comma-separated HTTP(S) origins.",
  ),
  SESSION_COOKIE_NAME: z.string().min(1).default("digital_library_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
});

export function readEnv(source = process.env) {
  return envSchema.parse(source);
}