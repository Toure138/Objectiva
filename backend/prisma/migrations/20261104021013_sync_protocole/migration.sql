-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "budget_categories" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "envelopes" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "goal_readings" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "planned_operations" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "field_clocks" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "sync_mutations" (
    "user_id" UUID NOT NULL,
    "mutation_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(40),
    "message" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("user_id","mutation_id")
);

-- CreateIndex
CREATE INDEX "sync_mutations_created_at_idx" ON "sync_mutations"("created_at");

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
