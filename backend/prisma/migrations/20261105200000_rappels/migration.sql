-- Spec 011 : rappels avant les rendez-vous (null = réglage par défaut du téléphone).
-- CreateEnum
CREATE TYPE "event_reminder" AS ENUM ('AUCUN', 'HEURE', 'M15', 'M30', 'H1', 'DEPART');

-- AlterTable
ALTER TABLE "event_series" ADD COLUMN     "reminder" "event_reminder";

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "reminder" "event_reminder";

