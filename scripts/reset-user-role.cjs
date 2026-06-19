const { PrismaClient } = require('@prisma/client');

const email = String(process.argv[2] || '').trim().toLowerCase();
const role = String(process.argv[3] || 'customer').trim().toLowerCase();

if (!email) {
  console.error('Usage: node scripts/reset-user-role.cjs <email> [role]');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const before = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true } });
    console.log('before', before);
    const updated = await prisma.user.update({ where: { email }, data: { role }, select: { id: true, email: true, role: true } });
    console.log('after', updated);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

