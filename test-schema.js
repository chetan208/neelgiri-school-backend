import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const res = await prisma.$queryRaw`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'Teacher'`;
    console.log(res);
}

main().catch(console.error).finally(() => prisma.$disconnect());
