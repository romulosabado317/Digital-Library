import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createAdminUser } from "../src/services/adminProvisioningService.js";

const prisma = new PrismaClient();

try {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Provide ADMIN_EMAIL and ADMIN_PASSWORD in the command environment.");
  }

  const admin = await createAdminUser(prisma, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    fullName: ADMIN_NAME || "Library Administrator",
  });
  console.log(`Created active admin account for ${admin.email}.`);
} catch (error) {
  console.error(error.message || "Admin account creation failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
