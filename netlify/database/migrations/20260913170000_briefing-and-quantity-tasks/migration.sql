-- CreateEnum
CREATE TYPE "Shift" AS ENUM ('DAGHOLD', 'NATHOLD', 'ANDRE');

-- CreateEnum
CREATE TYPE "BriefingRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "EndOfDayDecision" AS ENUM ('CARRIED_OVER', 'NOT_NEEDED', 'CLOSED_ANYWAY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "carriedOverFromId" TEXT,
ADD COLUMN     "isQuantityTask" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quantityDone" INTEGER DEFAULT 0,
ADD COLUMN     "quantityTotal" INTEGER,
ADD COLUMN     "quantityUnit" TEXT,
ADD COLUMN     "sourceBriefingId" TEXT;

-- CreateTable
CREATE TABLE "QuantityLogEntry" (
    "id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "shift" "Shift" NOT NULL DEFAULT 'DAGHOLD',
    "shiftLabel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "QuantityLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBriefing" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedSummary" JSONB,
    "pendingConfirmation" JSONB,
    "pendingClarification" JSONB,
    "closedAt" TIMESTAMP(3),
    "closedSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingMessage" (
    "id" TEXT NOT NULL,
    "role" "BriefingRole" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "briefingId" TEXT NOT NULL,

    CONSTRAINT "BriefingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuantityLogEntry_taskId_idx" ON "QuantityLogEntry"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBriefing_userId_date_key" ON "DailyBriefing"("userId", "date");

-- CreateIndex
CREATE INDEX "BriefingMessage_briefingId_idx" ON "BriefingMessage"("briefingId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_carriedOverFromId_key" ON "Task"("carriedOverFromId");

-- CreateIndex
CREATE INDEX "Task_sourceBriefingId_idx" ON "Task"("sourceBriefingId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceBriefingId_fkey" FOREIGN KEY ("sourceBriefingId") REFERENCES "DailyBriefing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_carriedOverFromId_fkey" FOREIGN KEY ("carriedOverFromId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogEntry" ADD CONSTRAINT "QuantityLogEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityLogEntry" ADD CONSTRAINT "QuantityLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBriefing" ADD CONSTRAINT "DailyBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingMessage" ADD CONSTRAINT "BriefingMessage_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "DailyBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

