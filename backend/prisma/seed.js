// prisma/seed.js
// Seed the database with demo users without emojis or fake disaster telemetry

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('[DB] Seeding database...');

  // Admin user
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@disasterwatch.dev' },
    update: {},
    create: {
      email: 'admin@disasterwatch.dev',
      passwordHash: adminHash,
      name: 'Admin',
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  // Demo analyst
  const analystHash = await bcrypt.hash('Analyst1234!', 12);
  const analyst = await prisma.user.upsert({
    where: { email: 'analyst@disasterwatch.dev' },
    update: {},
    create: {
      email: 'analyst@disasterwatch.dev',
      passwordHash: analystHash,
      name: 'Jane Analyst',
      role: 'ANALYST',
      emailVerified: true,
    },
  });

  // Demo regular user
  const userHash = await bcrypt.hash('Demo1234!', 12);
  await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: userHash,
      name: 'Demo User',
      role: 'USER',
      emailVerified: true,
    },
  });

  // Default alert preference for analyst
  await prisma.alertPreference.upsert({
    where: { userId_hazardType: { userId: analyst.id, hazardType: 'earthquake' } },
    update: {},
    create: {
      userId: analyst.id,
      hazardType: 'earthquake',
      minMagnitude: 4.5,
      emailEnabled: true,
    },
  });

  // Remove stale demo events
  await prisma.hazardEvent.deleteMany({
    where: { externalId: { in: ['demo-1', 'demo-2', 'demo-3'] } }
  });

  console.log('[DB] Seed complete. Ready for live data synchronization.');
  console.log('   admin@disasterwatch.dev   / Admin1234!');
  console.log('   analyst@disasterwatch.dev / Analyst1234!');
  console.log('   test@example.com           / Demo1234!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
