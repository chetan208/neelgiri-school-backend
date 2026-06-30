import { prisma } from '../lib/prisma.ts';

async function main() {
  console.log("Checking schema fields for FeeStructure...");
  const fields = await prisma.$queryRaw`
    SELECT column_name, data_type, column_default 
    FROM information_schema.columns 
    WHERE table_name = 'fee_structures' AND column_name = 'previousSessionDues'
  `;
  console.log("Database column definition:", fields);
  
  if (fields.length > 0) {
    console.log("SUCCESS: previousSessionDues column exists in database!");
  } else {
    console.error("ERROR: previousSessionDues column not found in database!");
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
