import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./app.js";
import { readEnv } from "./config/env.js";

const env = readEnv();
const prisma = new PrismaClient();
const app = createApp({ prisma, env });

const server = app.listen(env.PORT, () => {
  console.log(`Digital Library API listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; closing server`);
  server.close(async (serverError) => {
    await prisma.$disconnect();
    if (serverError) {
      console.error("Server shutdown failed", serverError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
