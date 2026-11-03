-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('REUNION', 'RENCONTRE', 'RENDEZ_VOUS', 'APPEL', 'VISIO');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('PREVU', 'REALISE', 'ANNULE');

-- CreateEnum
CREATE TYPE "event_task_role" AS ENUM ('PREPARATION', 'SUIVI');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "event_id" UUID,
ADD COLUMN     "event_role" "event_task_role";

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID,
    "milestone_id" UUID,
    "type" "event_type" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(200),
    "link" VARCHAR(500),
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agenda" VARCHAR(2000),
    "decisions" VARCHAR(2000),
    "status" "event_status" NOT NULL DEFAULT 'PREVU',
    "travel_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "prep_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_user_id_starts_at_idx" ON "events"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "events_user_id_status_idx" ON "events"("user_id", "status");

-- CreateIndex
CREATE INDEX "tasks_event_id_idx" ON "tasks"("event_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
