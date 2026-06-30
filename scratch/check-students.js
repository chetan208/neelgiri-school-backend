import { prisma } from '../lib/prisma.ts';

async function main() {
  const students = await prisma.student.findMany({
    include: {
      studentclass: true,
      session: true
    },
    take: 50
  });
  
  console.log("Students found:");
  students.forEach(s => {
    console.log(`Name: ${s.name}, Class: ${s.studentclass.className}, Session: ${s.session.year}, CardNo/RollNo: ${s.cardNo}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
