import { PrismaClient } from "@prisma/client";

export function createPrismaClient(database_url?: string): PrismaClient {
  if (!database_url) {
    return new PrismaClient();
  }

  return new PrismaClient({
    datasources: {
      db: { url: database_url }
    }
  });
}

