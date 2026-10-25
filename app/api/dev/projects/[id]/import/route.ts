/**
 * POST /api/dev/projects/[id]/import — bulk import unit types from CSV or XLSX
 *
 * Body: { csvData: string } OR { xlsxData: string (base64) }
 * Returns: { created, updated, skipped: [{ row, reason }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { syncUnitTypeInventory } from "@/lib/inventory";
import * as XLSX from "xlsx";

function requireApprovedDev(req: NextRequest) {
  const auth = extractToken(req.headers.get("Authorization"));
  if (!auth || auth.role !== "developer") return null;
  return auth;
}

// ── Flexible header normalisation ─────────────────────────────────────────────

type FieldName = "label" | "rooms" | "area" | "price" | "floor" | "building" | "quantity" | "available" | "unit";

const HEADER_MAP: Array<[RegExp, FieldName]> = [
  [/^(label|type|unittype|type_code|טיפוס|סוג)$/i, "label"],
  [/^(rooms|bedrooms|חדרים|hdarim)$/i, "rooms"],
  [/^(area|sqm|sqft|מ"ר|שטח|size)$/i, "area"],
  [/^(price|מחיר|mekhir)$/i, "price"],
  [/^(unitnumber|unit_number|apt|apartment|דירה|מספר)$/i, "unit"],
  [/^(floor|קומה|koma)$/i, "floor"],
  [/^(building|בניין|binyan)$/i, "building"],
  [/^(quantity|qty|units|כמות)$/i, "quantity"],
  [/^(available|זמין)$/i, "available"],
];

function normaliseHeader(raw: string): FieldName | null {
  const trimmed = raw.trim();
  for (const [pattern, field] of HEADER_MAP) {
    if (pattern.test(trimmed)) return field;
  }
  return null;
}

// ── Parse rows from CSV text or base64 XLSX ───────────────────────────────────

function parseRows(body: { csvData?: string; xlsxData?: string }): Record<string, string>[] {
  let wb: XLSX.WorkBook;
  if (body.xlsxData) {
    const buf = Buffer.from(body.xlsxData, "base64");
    wb = XLSX.read(buf, { type: "buffer" });
  } else if (body.csvData) {
    wb = XLSX.read(body.csvData, { type: "string" });
  } else {
    return [];
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  // header: 1 means first row is the header
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
}

// ── Import handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApprovedDev(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.developerProfile.findUnique({ where: { userId: auth.userId } });
  if (!profile || profile.crnStatus !== "approved") {
    return NextResponse.json({ error: "Account not approved" }, { status: 403 });
  }

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, developerId: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.developerId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { csvData?: string; xlsxData?: string };
  const rawRows = parseRows(body);

  if (rawRows.length === 0) {
    return NextResponse.json({ created: 0, updated: 0, skipped: [] });
  }

  // Build column mapping from first row's keys
  const sampleKeys = Object.keys(rawRows[0]);
  const colMap: Partial<Record<FieldName, string>> = {};
  for (const key of sampleKeys) {
    const field = normaliseHeader(key);
    if (field && !colMap[field]) colMap[field] = key;
  }

  const skipped: Array<{ row: number; reason: string }> = [];

  // Helper: get value by mapped field
  function get(row: Record<string, string>, field: FieldName): string {
    const col = colMap[field];
    return col ? (row[col] ?? "").toString().trim() : "";
  }

  // Group rows by label or (rooms + area)
  const groups = new Map<string, Array<{ row: Record<string, string>; rowNum: number }>>();

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, row 1 is header
    const labelVal = get(row, "label");
    const roomsVal = get(row, "rooms");
    const areaVal  = get(row, "area");

    let groupKey: string | null = null;

    if (labelVal) {
      groupKey = labelVal;
    } else if (roomsVal || areaVal) {
      const rooms = roomsVal ? parseFloat(roomsVal).toFixed(1) : "?";
      const area  = areaVal  ? parseFloat(areaVal).toFixed(1) : "?";
      groupKey = `${rooms}-room ${area}sqm`;
    }

    if (!groupKey) {
      skipped.push({ row: rowNum, reason: "no label or rooms/area column found" });
      return;
    }

    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push({ row, rowNum });
  });

  // Fetch existing unit types for this project
  const existing = await prisma.unitType.findMany({
    where: { projectId },
    select: { id: true, unitLabel: true },
  });
  const existingMap = new Map(existing.map(ut => [ut.unitLabel, ut.id]));

  let created = 0;
  let updated = 0;

  for (const [groupKey, entries] of groups) {
    // Compute aggregate values
    const prices: number[] = [];
    for (const { row } of entries) {
      const priceStr = get(row, "price");
      if (priceStr) {
        const p = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
        if (!isNaN(p)) prices.push(p);
      }
    }
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

    const firstRow = entries[0].row;
    const quantityStr  = get(firstRow, "quantity");
    const availableStr = get(firstRow, "available");

    let quantityTotal     = entries.length;
    let quantityAvailable = entries.length;

    if (quantityStr) {
      const q = parseInt(quantityStr, 10);
      if (!isNaN(q) && q > 0) { quantityTotal = q; quantityAvailable = q; }
    }
    if (availableStr) {
      const a = parseInt(availableStr, 10);
      if (!isNaN(a)) quantityAvailable = a;
    }

    const attrs: Record<string, unknown> = {};
    const roomsStr    = get(firstRow, "rooms");
    const areaStr     = get(firstRow, "area");
    const floorStr    = get(firstRow, "floor");
    const buildingStr = get(firstRow, "building");
    if (roomsStr)    attrs.rooms    = parseFloat(roomsStr);
    if (areaStr)     attrs.area     = parseFloat(areaStr);
    if (floorStr)    attrs.floor    = floorStr;
    if (buildingStr) attrs.building = buildingStr;

    let unitTypeId = existingMap.get(groupKey);

    if (unitTypeId) {
      await prisma.unitType.update({
        where: { id: unitTypeId },
        data: {
          price: avgPrice,
          attributes: JSON.stringify(attrs),
        },
      });
      updated++;
    } else {
      const createdType = await prisma.unitType.create({
        data: {
          projectId,
          sellerId: auth.userId,
          ownerType: "developer",
          unitLabel: groupKey,
          price: avgPrice,
          quantityTotal,
          quantityAvailable,
          eil: 0.0,
          ail: 0.0,
          attributes: JSON.stringify(attrs),
        },
      });
      unitTypeId = createdType.id;
      existingMap.set(groupKey, unitTypeId);
      created++;
    }

    const apartmentRows: Array<{ building: string; floor: number; unitNumber: string; price: number | null }> = [];
    for (const { row, rowNum } of entries) {
      const unitNumber = get(row, "unit");
      const floorRaw = get(row, "floor");
      if (!unitNumber || !floorRaw) continue;
      const floor = parseInt(floorRaw, 10);
      if (Number.isNaN(floor)) {
        skipped.push({ row: rowNum, reason: "floor is not a number" });
        continue;
      }
      const priceRaw = get(row, "price");
      const rowPrice = priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) : NaN;
      apartmentRows.push({
        building: get(row, "building") || "1",
        floor,
        unitNumber,
        price: !Number.isNaN(rowPrice) && Math.abs(rowPrice - avgPrice) > 1 ? rowPrice : null,
      });
    }

    const byFloor = new Map<string, typeof apartmentRows>();
    for (const row of apartmentRows) {
      const key = `${row.building}::${row.floor}`;
      const list = byFloor.get(key) ?? [];
      list.push(row);
      byFloor.set(key, list);
    }

    for (const rows of byFloor.values()) {
      rows.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
      const building = await prisma.building.upsert({
        where: { projectId_name: { projectId, name: rows[0].building } },
        update: {},
        create: {
          projectId,
          name: rows[0].building,
          floorCount: rows[0].floor,
          unitsPerFloor: rows.length,
          sortIndex: 0,
        },
      });
      if (building.floorCount < rows[0].floor) {
        await prisma.building.update({
          where: { id: building.id },
          data: { floorCount: rows[0].floor },
        });
      }

      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        await prisma.unit.upsert({
          where: {
            buildingId_floor_unitNumber: {
              buildingId: building.id,
              floor: row.floor,
              unitNumber: row.unitNumber,
            },
          },
          update: {
            unitTypeId,
            positionIndex: index,
            price: row.price,
          },
          create: {
            projectId,
            buildingId: building.id,
            unitTypeId,
            floor: row.floor,
            unitNumber: row.unitNumber,
            positionIndex: index,
            status: "available",
            price: row.price,
          },
        });
      }
    }

    if (apartmentRows.length === 0) {
      await prisma.unitType.update({
        where: { id: unitTypeId },
        data: { quantityTotal, quantityAvailable },
      });
    }

    await prisma.$transaction((tx) => syncUnitTypeInventory(tx, unitTypeId));
  }

  return NextResponse.json({ created, updated, skipped });
}
