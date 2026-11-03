import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new (PrismaClient as any)({ adapter }) as PrismaClient
  try {
    // Get unit types for the seed project
    const unitTypes = await prisma.unitType.findMany({
      where: { projectId: 'seed-yarkon-towers' },
      select: { id: true, unitLabel: true }
    })
    console.log('UnitTypes:')
    for (const ut of unitTypes) console.log(' ', ut.id, ut.unitLabel)

    // Get some units with floors
    const units = await prisma.unit.findMany({
      where: { buildingId: 'seed-yarkon-a' },
      select: { id: true, floor: true, unitNumber: true, status: true },
      orderBy: { floor: 'asc' },
      take: 5
    })
    console.log('\nUnits (seed-yarkon-a):')
    for (const u of units) console.log(' ', u.id, 'floor:', u.floor, u.unitNumber, u.status)
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}
main()
