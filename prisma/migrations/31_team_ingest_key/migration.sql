-- Move ingest keys from a website to that website's team.
-- A website with a key and no team gets its own team. Migration 29 is unchanged.

ALTER TABLE "ingest_key" ADD COLUMN "team_id" UUID;
ALTER TABLE "ingest_key" ADD COLUMN "rotated_from_id" UUID;

UPDATE "ingest_key" AS key
SET "team_id" = website."team_id"
FROM "website" AS website
WHERE website."website_id" = key."website_id"
  AND website."team_id" IS NOT NULL;

DO $$
DECLARE
  site RECORD;
  new_team UUID;
BEGIN
  FOR site IN
    SELECT DISTINCT website."website_id", website."name", website."user_id"
    FROM "ingest_key" AS key
    JOIN "website" AS website ON website."website_id" = key."website_id"
    WHERE website."team_id" IS NULL
  LOOP
    new_team := gen_random_uuid();
    INSERT INTO "team" ("team_id", "name", "enrollment_status", "created_at", "updated_at")
    VALUES (new_team, left(COALESCE(site."name", 'website'), 50), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    UPDATE "website" SET "team_id" = new_team WHERE "website_id" = site."website_id";
    UPDATE "ingest_key" SET "team_id" = new_team WHERE "website_id" = site."website_id";
    IF site."user_id" IS NOT NULL THEN
      INSERT INTO "team_user" ("team_user_id", "team_id", "user_id", "role", "created_at", "updated_at")
      VALUES (gen_random_uuid(), new_team, site."user_id", 'team-owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;

DELETE FROM "ingest_key" WHERE "team_id" IS NULL;

ALTER TABLE "ingest_key" ALTER COLUMN "team_id" SET NOT NULL;
ALTER TABLE "ingest_key" DROP CONSTRAINT "ingest_key_website_id_fkey";
DROP INDEX "ingest_key_website_id_idx";
ALTER TABLE "ingest_key" DROP COLUMN "website_id";

ALTER TABLE "ingest_key"
  ADD CONSTRAINT "ingest_key_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "team"("team_id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ingest_key_team_id_idx" ON "ingest_key"("team_id");

ALTER TABLE "ingest_key"
  ADD CONSTRAINT "ingest_key_rotated_from_id_fkey"
  FOREIGN KEY ("rotated_from_id") REFERENCES "ingest_key"("ingest_key_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Read-only role for rollup tables. It is not the application login.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stellog_operator') THEN
    CREATE ROLE stellog_operator NOLOGIN;
  END IF;
END $$;

GRANT SELECT ON "api_metric_hour", "api_metric_day" TO stellog_operator;
GRANT stellog_operator TO CURRENT_USER;
