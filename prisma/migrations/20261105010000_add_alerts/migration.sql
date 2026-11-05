-- CreateTable: AlertPreference — buyer opt-in settings for property alerts
CREATE TABLE "AlertPreference" (
    "id"          TEXT NOT NULL,
    "buyerId"     TEXT NOT NULL,
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "frequency"   TEXT NOT NULL DEFAULT 'immediate',
    "minScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "siteAlerts"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification — in-app notification for a buyer
CREATE TABLE "Notification" (
    "id"         TEXT NOT NULL,
    "buyerId"    TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "unitTypeId" TEXT,
    "readAt"     TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_buyerId_key" ON "AlertPreference"("buyerId");
CREATE INDEX "Notification_buyerId_readAt_createdAt_idx" ON "Notification"("buyerId", "readAt", "createdAt");

-- AddForeignKey
ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
