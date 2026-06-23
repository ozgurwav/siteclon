const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const cnt = await prisma.bookingCategory.count();
    if (cnt === 0) {
      await prisma.bookingCategory.create({
        data: {
          name: 'Genel Ürün',
          depositAmountMinor: BigInt(50000),
          currency: 'try',
          active: true,
          sortOrder: 0,
        },
      });
    }
    const cats = await prisma.bookingCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    console.log({ ok: true, categories: cats });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

