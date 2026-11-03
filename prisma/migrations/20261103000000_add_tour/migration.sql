-- CreateTable
CREATE TABLE "ApartmentModel" (
    "id" TEXT NOT NULL,
    "unitTypeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApartmentModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TourEvent" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "unitTypeId" TEXT,
    "profileId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "roomId" TEXT,
    "durationMs" INTEGER,
    "payload" JSONB,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TourEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApartmentModel_unitTypeId_key" ON "ApartmentModel"("unitTypeId");
CREATE INDEX "TourEvent_unitTypeId_createdAt_idx" ON "TourEvent"("unitTypeId", "createdAt");
CREATE INDEX "TourEvent_sessionId_idx" ON "TourEvent"("sessionId");

ALTER TABLE "ApartmentModel" ADD CONSTRAINT "ApartmentModel_unitTypeId_fkey"
  FOREIGN KEY ("unitTypeId") REFERENCES "UnitType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
