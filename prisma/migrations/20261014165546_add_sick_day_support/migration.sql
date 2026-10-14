-- AlterTable
ALTER TABLE "WageSettings" ADD COLUMN     "sickPayHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 132;

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "isSickDay" BOOLEAN NOT NULL DEFAULT false;
