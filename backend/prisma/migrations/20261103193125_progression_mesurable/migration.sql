-- CreateEnum
CREATE TYPE "progress_mode" AS ENUM ('JALONS', 'MESURE');

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "measure_unit" VARCHAR(30),
ADD COLUMN     "progress_mode" "progress_mode" NOT NULL DEFAULT 'JALONS',
ADD COLUMN     "start_value" INTEGER,
ADD COLUMN     "target_value" INTEGER;

-- CreateTable
CREATE TABLE "goal_readings" (
    "id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "read_on" DATE NOT NULL,
    "note" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_readings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goal_readings_goal_id_read_on_idx" ON "goal_readings"("goal_id", "read_on");

-- AddForeignKey
ALTER TABLE "goal_readings" ADD CONSTRAINT "goal_readings_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
