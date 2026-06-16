import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
    // @ts-ignore: Prisma CLI requires this but the type definitions are outdated
    directUrl: (process.env.DIRECT_URL || process.env.DATABASE_URL) as string,
  },
});
