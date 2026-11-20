-- CreateTable
CREATE TABLE "PlanTwinRecord" (
    "id" TEXT NOT NULL,
    "unitTypeId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL DEFAULT 'dxf',
    "twin" JSONB NOT NULL,
    "report" JSONB NOT NULL,
    "notes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'parsed',
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanTwinRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanTwinRecord_unitTypeId_key" ON "PlanTwinRecord"("unitTypeId");

-- AddForeignKey
ALTER TABLE "PlanTwinRecord" ADD CONSTRAINT "PlanTwinRecord_unitTypeId_fkey" FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

