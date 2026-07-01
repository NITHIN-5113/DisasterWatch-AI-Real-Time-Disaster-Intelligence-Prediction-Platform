// prisma/seed.js
// Seed the database with a demo admin user

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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

  // Default alert prefs for analyst
  await prisma.alertPreference.upsert({
    where: { userId_hazardType: { userId: analyst.id, hazardType: 'EARTHQUAKE' } },
    update: {},
    create: {
      userId: analyst.id,
      hazardType: 'EARTHQUAKE', 
      minMagnitude: 4.5,
      emailEnabled: true,
    },
  });

  // Demo hazard events
  const hazards = [
    {
      externalId: 'demo-1',
      type: 'earthquake',
      magnitude: 6.8,
      depth: 10,
      latitude: 35.6,
      longitude: 139.7,
      place: 'Tokyo, Japan',
      title: 'M 6.8 - 10km SSE of Tokyo, Japan',
      riskScore: 85,
      riskLevel: 'critical',
      occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      rawData: JSON.stringify({ demo: true }),
    },
    {
      externalId: 'demo-2',
      type: 'flood',
      latitude: 13.0,
      longitude: 80.3,
      place: 'Chennai, India',
      title: 'Flood warning in Chennai',
      riskScore: 75,
      riskLevel: 'high',
      occurredAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      rawData: JSON.stringify({ demo: true }),
    },
    {
      externalId: 'demo-3',
      type: 'storm',
      latitude: 25.0,
      longitude: -90.0,
      place: 'Gulf of Mexico',
      title: 'Tropical storm approaching',
      riskScore: 90,
      riskLevel: 'critical',
      occurredAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      rawData: JSON.stringify({ demo: true }),
    },
  ];

  for (const hazard of hazards) {
    await prisma.hazardEvent.upsert({
      where: { externalId: hazard.externalId },
      update: {},
      create: hazard,
    });
  }

  console.log('✅ Seed complete.');
  console.log('   admin@disasterwatch.dev  / Admin1234!');
  console.log('   analyst@disasterwatch.dev / Analyst1234!');
  console.log('   test@example.com          / Demo1234!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
