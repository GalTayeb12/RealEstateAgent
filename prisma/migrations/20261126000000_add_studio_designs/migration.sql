-- CreateTable
CREATE TABLE "StudioDesign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDesignVersion" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioDesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDesignShare" (
    "id" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioDesignShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudioDesign_ownerId_baselineId_updatedAt_idx" ON "StudioDesign"("ownerId", "baselineId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioDesignVersion_designId_createdAt_idx" ON "StudioDesignVersion"("designId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudioDesignShare_tokenHash_key" ON "StudioDesignShare"("tokenHash");

-- CreateIndex
CREATE INDEX "StudioDesignShare_designId_idx" ON "StudioDesignShare"("designId");

-- AddForeignKey
ALTER TABLE "StudioDesign" ADD CONSTRAINT "StudioDesign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDesignVersion" ADD CONSTRAINT "StudioDesignVersion_designId_fkey" FOREIGN KEY ("designId") REFERENCES "StudioDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDesignShare" ADD CONSTRAINT "StudioDesignShare_designId_fkey" FOREIGN KEY ("designId") REFERENCES "StudioDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

