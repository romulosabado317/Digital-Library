const sampleNote = "Synthetic sample for the ICCT College library prototype; not an official title or ICCT holding.";

const demoResources = [
  { title: "Sample: Information Technology Foundations", category: "Information Technology" },
  { title: "Sample: Business Communication Essentials", category: "Business and Management" },
  { title: "Sample: Principles of Teaching and Learning", category: "Education" },
  { title: "Sample: Applied Mathematics for Technology", category: "General Education" },
];

export async function seedDemoCatalog(prisma) {
  let created = 0;

  for (const { title, category: categoryName } of demoResources) {
    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName },
    });
    const existing = await prisma.resource.findFirst({
      where: { title, description: sampleNote },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.resource.create({
      data: {
        title,
        description: sampleNote,
        resourceType: "BOOK",
        category: { connect: { id: category.id } },
      },
    });
    created += 1;
  }

  return { created, skipped: demoResources.length - created };
}
