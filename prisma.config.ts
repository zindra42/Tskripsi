import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // CLI validation and generation need a URL, but never open a connection.
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused",
  },
});
