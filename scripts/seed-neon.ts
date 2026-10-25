/**
 * Idempotent demo data for Neon (PostgreSQL).
 * Run: npm run seed:neon
 *
 * Prices are stored in ILS.
 * Accounts are email-verified so they can sign in without SMTP.
 */
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../app/generated/prisma/client";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: url })),
});

const DEMO = {
  buyer: { email: "buyer@haveniq.demo", password: "buyer123" },
  developer: { email: "dev@haveniq.demo", password: "devpass123" },
  seller: { email: "seller@haveniq.demo", password: "seller123" },
};

async function upsertUser(email: string, password: string, role: string, extra: { name?: string; phone?: string } = {}) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { emailVerified: true, locale: "he", role, ...extra },
    create: {
      email,
      passwordHash,
      role,
      emailVerified: true,
      locale: "he",
      name: extra.name,
      phone: extra.phone,
    },
  });
}

async function main() {
  const buyer = await upsertUser(DEMO.buyer.email, DEMO.buyer.password, "buyer", {
    name: "דנה לוי",
  });

  const developer = await upsertUser(DEMO.developer.email, DEMO.developer.password, "developer", {
    name: "יוסי אברהם",
    phone: "050-000-0001",
  });

  await prisma.developerProfile.upsert({
    where: { userId: developer.id },
    update: { crnStatus: "approved", companyName: "הירקון יזמות בע״מ" },
    create: {
      userId: developer.id,
      companyName: "הירקון יזמות בע״מ",
      crn: "515151515",
      contactName: "יוסי אברהם",
      phone: "050-000-0001",
      crnStatus: "approved",
      qualityScore: 82,
      baselineScore: 80,
    },
  });

  const seller = await upsertUser(DEMO.seller.email, DEMO.seller.password, "seller", {
    name: "מיכל כהן",
    phone: "052-000-0002",
  });

  await prisma.sellerProfile.upsert({
    where: { userId: seller.id },
    update: { phone: "052-000-0002" },
    create: { userId: seller.id, phone: "052-000-0002" },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-yarkon-towers" },
    update: {
      name: "מגדלי הירקון",
      location: "רחוב הירקון 120, תל אביב",
      building_3d_url: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
    },
    create: {
      id: "seed-yarkon-towers",
      developerId: developer.id,
      name: "מגדלי הירקון",
      location: "רחוב הירקון 120, תל אביב",
      description: "פרויקט לדוגמה לבדיקת סרטון, יחידות, תוכנית וייבוא.",
      building_3d_url: "https://my.matterport.com/show/?m=SxQL3iGyoDo",
      amenities: ["חניה", "מחסן"],
      ownerType: "developer",
      status: "active",
    },
  });

  const types = [
    { id: "seed-yarkon-3", label: "3 חדרים", price: 2_450_000, eil: 55, ail: 80, rooms: 3, area: 85 },
    { id: "seed-yarkon-4", label: "4 חדרים", price: 3_200_000, eil: 60, ail: 85, rooms: 4, area: 110 },
  ];

  for (const unit of types) {
    await prisma.unitType.upsert({
      where: { id: unit.id },
      update: {
        price: unit.price,
        unitLabel: unit.label,
        active: true,
        attributes: JSON.stringify({ rooms: unit.rooms, area: unit.area }),
      },
      create: {
        id: unit.id,
        projectId: project.id,
        sellerId: developer.id,
        ownerType: "developer",
        unitLabel: unit.label,
        price: unit.price,
        quantityTotal: 1,
        quantityAvailable: 1,
        description: "יחידה לדוגמה במחיר שקלי.",
        eil: unit.eil,
        ail: unit.ail,
        attributes: JSON.stringify({ rooms: unit.rooms, area: unit.area }),
        image_urls: [],
        active: true,
        aomStatus: "available",
      },
    });
  }

  await prisma.unit.deleteMany({ where: { projectId: project.id } });
  await prisma.building.deleteMany({ where: { projectId: project.id } });

  const towers = [
    { id: "seed-yarkon-a", name: "מגדל A", sortIndex: 0 },
    { id: "seed-yarkon-b", name: "מגדל B", sortIndex: 1 },
  ];

  for (const tower of towers) {
    const building = await prisma.building.create({
      data: {
        id: tower.id,
        projectId: project.id,
        name: tower.name,
        floorCount: 8,
        unitsPerFloor: 4,
        sortIndex: tower.sortIndex,
      },
    });

    // Floor 1 is an empty lobby. Floors 2–7 have four apartments.
    // Floor 8 is a penthouse with two apartments.
    for (let floor = 2; floor <= 8; floor++) {
      const count = floor === 8 ? 2 : 4;
      for (let position = 0; position < count; position++) {
        const type = types[position % 2];
        const price = floor === 8
          ? Math.round(type.price * 1.12)
          : floor >= 6
            ? Math.round(type.price * 1.06)
            : null;
        let status = "available";
        if (tower.id === "seed-yarkon-a" && floor === 2 && position === 0) status = "sold";
        if (tower.id === "seed-yarkon-a" && floor === 3 && position === 1) status = "reserved";
        if (tower.id === "seed-yarkon-b" && floor === 4 && position === 2) status = "sold";

        await prisma.unit.create({
          data: {
            id: `${tower.id}-f${floor}-p${position}`,
            projectId: project.id,
            buildingId: building.id,
            unitTypeId: type.id,
            floor,
            unitNumber: `${floor}${position + 1}`,
            positionIndex: position,
            status,
            price,
          },
        });
      }
    }
  }

  for (const type of types) {
    const rows = await prisma.unit.findMany({
      where: { unitTypeId: type.id },
      select: { status: true },
    });
    const available = rows.filter((row) => row.status === "available").length;
    await prisma.unitType.update({
      where: { id: type.id },
      data: {
        quantityTotal: rows.length,
        quantityAvailable: available,
        active: available > 0,
      },
    });
  }

  const sellerProject = await prisma.project.upsert({
    where: { id: "seed-florentin-flat" },
    update: { name: "דירת פלורנטין", location: "פלורנטין, תל אביב" },
    create: {
      id: "seed-florentin-flat",
      developerId: seller.id,
      name: "דירת פלורנטין",
      location: "פלורנטין, תל אביב",
      description: "מודעת מוכר יחיד — משא ומתן מלא.",
      amenities: [],
      ownerType: "seller",
      status: "active",
    },
  });

  await prisma.unitType.upsert({
    where: { id: "seed-florentin-unit" },
    update: { price: 1_890_000, active: true },
    create: {
      id: "seed-florentin-unit",
      projectId: sellerProject.id,
      sellerId: seller.id,
      ownerType: "seller",
      unitLabel: "3 חדרים",
      price: 1_890_000,
      quantityTotal: 1,
      quantityAvailable: 1,
      description: "דירה יד שנייה לדוגמה.",
      eil: 50,
      ail: 78,
      attributes: "{}",
      image_urls: [],
      active: true,
      aomStatus: "available",
    },
  });

  console.log("Seeded Neon demo data (ILS, Hebrew).");
  console.log(`Buyer     ${DEMO.buyer.email} / ${DEMO.buyer.password}`);
  console.log(`Developer ${DEMO.developer.email} / ${DEMO.developer.password}`);
  console.log(`Seller    ${DEMO.seller.email} / ${DEMO.seller.password}`);
  console.log("Developer visualizer: /dev/properties/seed-yarkon-3");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
