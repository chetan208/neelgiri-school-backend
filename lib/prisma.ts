import "dotenv/config";
import pg from "pg";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new pg.Pool({ 
  connectionString,
  max: 10,                
  idleTimeoutMillis: 30000 
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export { prisma };