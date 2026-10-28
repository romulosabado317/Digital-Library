import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const librarianEmail = process.env.DEMO_LIBRARIAN_EMAIL?.toLowerCase();
  const librarianPassword = process.env.DEMO_LIBRARIAN_PASSWORD;
  const memberPassword = process.env.DEMO_MEMBER_PASSWORD;
  if (!librarianEmail || !librarianPassword || librarianPassword.length < 12) {
    throw new Error("Set DEMO_LIBRARIAN_EMAIL and a 12+ character DEMO_LIBRARIAN_PASSWORD before seeding.");
  }
  if (!memberPassword || memberPassword.length < 12) {
    throw new Error("Set a 12+ character DEMO_MEMBER_PASSWORD before seeding.");
  }

  const librarianHash = await bcrypt.hash(librarianPassword, 12);
  await prisma.user.upsert({
    where: { email: librarianEmail },
    update: {},
    create: {
      fullName: "Demo Librarian",
      email: librarianEmail,
      passwordHash: librarianHash,
      role: "LIBRARIAN",
    },
  });
  const memberHash = await bcrypt.hash(memberPassword, 12);
  await prisma.user.upsert({
    where: { email: "member@example.test" },
    update: {},
    create: {
      fullName: "Demo Member",
      email: "member@example.test",
      passwordHash: memberHash,
      role: "MEMBER",
    },
  });

  const category = await prisma.category.upsert({
    where: { name: "Computer Science" },
    update: {},
    create: { name: "Computer Science" },
  });
  const publisher = await prisma.publisher.upsert({
    where: { name: "Open Learning Press" },
    update: {},
    create: { name: "Open Learning Press" },
  });
  const author = await prisma.author.upsert({
    where: { name: "Demo Author" },
    update: {},
    create: { name: "Demo Author" },
  });
  const resource = await prisma.resource.upsert({
    where: { isbn: "9780000000001" },
    update: {},
    create: {
      title: "Foundations of Digital Libraries",
      description: "Synthetic demonstration title for testing library operations.",
      isbn: "9780000000001",
      publicationYear: 2025,
      categoryId: category.id,
      publisherId: publisher.id,
      authors: { create: { author: { connect: { id: author.id } } } },
    },
  });

  await prisma.physicalCopy.upsert({
    where: { accessionNumber: "DEMO-0001" },
    update: {},
    create: {
      resourceId: resource.id,
      accessionNumber: "DEMO-0001",
      barcode: "DEMO-BAR-0001",
    },
  });

  console.log("Seeded synthetic demonstration users, a resource, and a physical copy.");
}

seed()
  .catch((error) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
