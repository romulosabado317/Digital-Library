import assert from "node:assert/strict";
import test from "node:test";
import { seedDemoCatalog } from "../src/services/demoCatalogSeed.js";

function createPrismaFixture() {
  const categories = new Map();
  const resources = new Map();
  const prisma = {
    category: {
      upsert: async ({ where, create }) => {
        if (!categories.has(where.name)) {
          categories.set(where.name, { id: `category-${categories.size + 1}`, name: create.name });
        }
        return categories.get(where.name);
      },
    },
    resource: {
      findFirst: async ({ where }) => resources.get(where.title) ?? null,
      create: async ({ data }) => {
        const resource = {
          id: `resource-${resources.size + 1}`,
          title: data.title,
          description: data.description,
          categoryId: data.category.connect.id,
          resourceType: data.resourceType,
        };
        resources.set(data.title, resource);
        return resource;
      },
    },
  };
  return { prisma, resources };
}

test("seeds clearly labeled synthetic ICCT-context samples idempotently", async () => {
  const { prisma, resources } = createPrismaFixture();
  const first = await seedDemoCatalog(prisma);
  const second = await seedDemoCatalog(prisma);

  assert.equal(first.created, 4);
  assert.equal(second.created, 0);
  assert.equal(resources.size, 4);
  for (const resource of resources.values()) {
    assert.match(resource.title, /^Sample:/);
    assert.match(resource.description, /not an official title or ICCT holding/i);
  }
});
