-- Stellog operator dashboard. Enrollment is a property of the project.
-- Operator keys are stored as a hash. The token is not stored.

ALTER TABLE "website"
ADD COLUMN "enrollment_status" VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE "website"
ADD CONSTRAINT "website_enrollment_status_check"
CHECK ("enrollment_status" IN ('active', 'pending'));

ALTER TABLE "team"
ADD COLUMN "enrollment_status" VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE "team"
ADD CONSTRAINT "team_enrollment_status_check"
CHECK ("enrollment_status" IN ('active', 'pending'));

CREATE TABLE "operator_api_key" (
    "operator_api_key_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),

    CONSTRAINT "operator_api_key_pkey" PRIMARY KEY ("operator_api_key_id")
);

CREATE UNIQUE INDEX "operator_api_key_key_hash_key" ON "operator_api_key"("key_hash");

CREATE INDEX "operator_api_key_created_by_idx" ON "operator_api_key"("created_by");

ALTER TABLE "operator_api_key"
ADD CONSTRAINT "operator_api_key_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "app_setting" ("key", "value")
VALUES ('enrollment_mode', 'open')
ON CONFLICT ("key") DO NOTHING;
