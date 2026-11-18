-- A website row is either a site or an API. The name is not the type.
-- "API Docs" stays a site. Rows created as APIs use a name ending in " API"
-- or a domain that starts with api.

ALTER TABLE "website"
ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'site';

ALTER TABLE "website"
ADD CONSTRAINT "website_kind_check"
CHECK ("kind" IN ('site', 'api'));

UPDATE "website"
SET "kind" = 'api'
WHERE "name" ~ ' API$'
   OR "domain" ILIKE 'api.%';
