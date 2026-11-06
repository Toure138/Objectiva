-- Spec 012 : habitudes. Migration générée par différence, complétée à la main (déclencheurs de synchronisation).
-- CreateEnum
CREATE TYPE "habit_status" AS ENUM ('ACTIVE', 'ARCHIVEE');

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID,
    "title" VARCHAR(120) NOT NULL,
    "rules" JSONB NOT NULL,
    "pauses" JSONB NOT NULL DEFAULT '[]',
    "status" "habit_status" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "field_clocks" JSONB NOT NULL DEFAULT '{}',
    "server_version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_checks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "field_clocks" JSONB NOT NULL DEFAULT '{}',
    "server_version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "habit_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "habits_user_id_server_version_idx" ON "habits"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "habit_checks_user_id_server_version_idx" ON "habit_checks"("user_id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "habit_checks_habit_id_date_key" ON "habit_checks"("habit_id", "date");

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "habits"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Synchronisation (spec 007) : numéro de version, horodatage et pierres tombales, comme les autres tables.
CREATE TRIGGER habits_sync_stamp BEFORE INSERT OR UPDATE ON "habits"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER habits_sync_tombstone AFTER DELETE ON "habits"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();
CREATE TRIGGER habit_checks_sync_stamp BEFORE INSERT OR UPDATE ON "habit_checks"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER habit_checks_sync_tombstone AFTER DELETE ON "habit_checks"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();
