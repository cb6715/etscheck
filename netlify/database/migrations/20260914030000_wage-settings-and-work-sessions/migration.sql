-- CreateTable
CREATE TABLE "WageSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "overtimeThresholdHours" DOUBLE PRECISION NOT NULL DEFAULT 37,
    "overtimeBonusPct" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "nightSupplement" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "nightStartHour" INTEGER NOT NULL DEFAULT 17,
    "nightEndHour" INTEGER NOT NULL DEFAULT 5,
    "breakStartMinutes" INTEGER NOT NULL DEFAULT 720,
    "breakEndMinutes" INTEGER NOT NULL DEFAULT 750,
    "monthlyTaxDeduction" DOUBLE PRECISION NOT NULL DEFAULT 5100,
    "amBidragPct" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 0.44,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WageSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "paidSeconds" INTEGER,
    "grossAmount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WageSettings_userId_key" ON "WageSettings"("userId");

-- CreateIndex
CREATE INDEX "WorkSession_userId_checkInAt_idx" ON "WorkSession"("userId", "checkInAt");

-- AddForeignKey
ALTER TABLE "WageSettings" ADD CONSTRAINT "WageSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
