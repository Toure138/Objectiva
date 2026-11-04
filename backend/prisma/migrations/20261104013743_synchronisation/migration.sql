/*
  Migration éditée à la main (spec 007) : remplissage de user_id, déclencheurs, époque.
  Warnings:

  - Added the required column `user_id` to the `goal_readings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `milestones` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "budget_categories" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "envelopes" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goal_readings" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "planned_operations" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "server_version" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Remplissage de user_id (dénormalisé pour que chaque ligne synchronisable porte son propriétaire).
UPDATE "milestones" m SET "user_id" = g."user_id" FROM "goals" g WHERE g."id" = m."goal_id";
UPDATE "goal_readings" r SET "user_id" = g."user_id" FROM "goals" g WHERE g."id" = r."goal_id";
ALTER TABLE "milestones" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "goal_readings" ALTER COLUMN "user_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "sync_state" (
    "user_id" UUID NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tombstones" (
    "user_id" UUID NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "server_version" BIGINT NOT NULL,
    "deleted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tombstones_pkey" PRIMARY KEY ("user_id","entity","entity_id")
);

-- CreateTable
CREATE TABLE "server_meta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "epoch" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tombstones_user_id_server_version_idx" ON "tombstones"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "accounts_user_id_server_version_idx" ON "accounts"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "budget_categories_user_id_server_version_idx" ON "budget_categories"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "envelopes_user_id_server_version_idx" ON "envelopes"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "events_user_id_server_version_idx" ON "events"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "goal_readings_user_id_server_version_idx" ON "goal_readings"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "goals_user_id_server_version_idx" ON "goals"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "milestones_user_id_server_version_idx" ON "milestones"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "planned_operations_user_id_server_version_idx" ON "planned_operations"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "tasks_user_id_server_version_idx" ON "tasks"("user_id", "server_version");

-- CreateIndex
CREATE INDEX "transactions_user_id_server_version_idx" ON "transactions"("user_id", "server_version");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_readings" ADD CONSTRAINT "goal_readings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tombstones" ADD CONSTRAINT "tombstones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Époque du serveur : une seule ligne. À renouveler après toute restauration de sauvegarde
-- (npm run db:new-epoch) pour que les appareils détectent le retour en arrière.
INSERT INTO "server_meta" ("id") VALUES (1);

-- Numéro de version suivant pour un utilisateur (verrouille sa ligne de sync_state jusqu'à la
-- fin de la transaction : les écritures d'un même utilisateur sont numérotées sans trou ni doublon).
CREATE FUNCTION next_user_version(p_user uuid) RETURNS bigint AS $$
  INSERT INTO sync_state (user_id, version) VALUES (p_user, 1)
  ON CONFLICT (user_id) DO UPDATE SET version = sync_state.version + 1
  RETURNING version;
$$ LANGUAGE sql;

-- À l'écriture : horodatage et numéro de version, quelle que soit la route qui écrit.
CREATE FUNCTION sync_stamp() RETURNS trigger AS $$
BEGIN
  NEW.server_version := next_user_version(NEW.user_id);
  NEW.updated_at := now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- À la suppression : une trace (pierre tombale), cascades comprises. Pas de trace quand c'est
-- l'utilisateur lui-même qui disparaît (suppression du compte : tout part avec lui).
CREATE FUNCTION sync_tombstone() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id) THEN
    INSERT INTO tombstones (user_id, entity, entity_id, server_version, deleted_at)
    VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, next_user_version(OLD.user_id), now())
    ON CONFLICT (user_id, entity, entity_id)
    DO UPDATE SET server_version = EXCLUDED.server_version, deleted_at = EXCLUDED.deleted_at;
  END IF;
  RETURN OLD;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_sync_stamp BEFORE INSERT OR UPDATE ON "goals"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER goals_sync_tombstone AFTER DELETE ON "goals"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER milestones_sync_stamp BEFORE INSERT OR UPDATE ON "milestones"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER milestones_sync_tombstone AFTER DELETE ON "milestones"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER goal_readings_sync_stamp BEFORE INSERT OR UPDATE ON "goal_readings"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER goal_readings_sync_tombstone AFTER DELETE ON "goal_readings"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER tasks_sync_stamp BEFORE INSERT OR UPDATE ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER tasks_sync_tombstone AFTER DELETE ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER events_sync_stamp BEFORE INSERT OR UPDATE ON "events"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER events_sync_tombstone AFTER DELETE ON "events"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER accounts_sync_stamp BEFORE INSERT OR UPDATE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER accounts_sync_tombstone AFTER DELETE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER budget_categories_sync_stamp BEFORE INSERT OR UPDATE ON "budget_categories"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER budget_categories_sync_tombstone AFTER DELETE ON "budget_categories"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER envelopes_sync_stamp BEFORE INSERT OR UPDATE ON "envelopes"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER envelopes_sync_tombstone AFTER DELETE ON "envelopes"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER planned_operations_sync_stamp BEFORE INSERT OR UPDATE ON "planned_operations"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER planned_operations_sync_tombstone AFTER DELETE ON "planned_operations"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

CREATE TRIGGER transactions_sync_stamp BEFORE INSERT OR UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION sync_stamp();
CREATE TRIGGER transactions_sync_tombstone AFTER DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION sync_tombstone();

-- Numérotation des lignes déjà présentes (les parents d'abord).
UPDATE "goals" SET "updated_at" = "updated_at";
UPDATE "milestones" SET "updated_at" = "updated_at";
UPDATE "goal_readings" SET "updated_at" = "updated_at";
UPDATE "tasks" SET "updated_at" = "updated_at";
UPDATE "events" SET "updated_at" = "updated_at";
UPDATE "accounts" SET "updated_at" = "updated_at";
UPDATE "budget_categories" SET "updated_at" = "updated_at";
UPDATE "envelopes" SET "updated_at" = "updated_at";
UPDATE "planned_operations" SET "updated_at" = "updated_at";
UPDATE "transactions" SET "updated_at" = "updated_at";
