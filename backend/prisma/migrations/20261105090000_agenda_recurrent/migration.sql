-- Spec 009 : réunions récurrentes. Migration générée par différence, complétée à la main (contraintes, déclencheurs).
-- AlterTable
ALTER TABLE "events" ADD COLUMN     "occurrence_date" DATE,
ADD COLUMN     "series_id" UUID;

-- CreateTable
CREATE TABLE "event_series" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID,
    "milestone_id" UUID,
    "type" "event_type" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "location" VARCHAR(200),
    "link" VARCHAR(500),
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agenda" VARCHAR(2000),
    "travel_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "prep_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "weekdays" INTEGER[],
    "start_date" DATE NOT NULL,
    "until" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "field_clocks" JSONB NOT NULL DEFAULT '{}',
    "server_version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "event_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_series_user_id_server_version_idx" ON "event_series"("user_id", "server_version");

-- CreateIndex
CREATE UNIQUE INDEX "events_series_id_occurrence_date_key" ON "events"("series_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "event_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Au moins un jour, et seulement des jours ISO (1 = lundi … 7 = dimanche).
ALTER TABLE "event_series" ALTER COLUMN "weekdays" SET NOT NULL;
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_weekdays_check"
  CHECK (cardinality("weekdays") >= 1 AND "weekdays" <@ ARRAY[1,2,3,4,5,6,7]);
ALTER TABLE "event_series" ADD CONSTRAINT "event_series_until_check"
  CHECK ("until" IS NULL OR "until" >= "start_date");
-- Une occurrence a toujours sa date d'origine, et seulement elle.
ALTER TABLE "events" ADD CONSTRAINT "events_occurrence_check"
  CHECK (("series_id" IS NULL) = ("occurrence_date" IS NULL));

-- Synchronisation (spec 007) : numéro de version, horodatage et pierres tombales, comme les autres tables.
CREATE TRIGGER event_series_sync_stamp BEFORE INSERT OR UPDATE ON "event_series"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER event_series_sync_tombstone AFTER DELETE ON "event_series"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();
