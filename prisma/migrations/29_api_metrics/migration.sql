-- Stellog API metrics. Raw rows expire on a configurable window.
-- Hourly and daily aggregates are retained for at least 24 months.

CREATE TABLE "ingest_key" (
    "ingest_key_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingest_key_pkey" PRIMARY KEY ("ingest_key_id")
);

CREATE UNIQUE INDEX "ingest_key_key_hash_key" ON "ingest_key"("key_hash");
CREATE INDEX "ingest_key_website_id_idx" ON "ingest_key"("website_id");
ALTER TABLE "ingest_key" ADD CONSTRAINT "ingest_key_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_metric_raw" (
    "metric_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "service_name" VARCHAR(255) NOT NULL,
    "route" VARCHAR(500) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "latency_ms" DOUBLE PRECISION,
    "request_count" INTEGER NOT NULL,
    "latency_sum_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_metric_raw_pkey" PRIMARY KEY ("metric_id"),
    CONSTRAINT "api_metric_raw_status_chk" CHECK ("status_code" BETWEEN 100 AND 599),
    CONSTRAINT "api_metric_raw_count_chk" CHECK ("request_count" >= 0),
    CONSTRAINT "api_metric_raw_latency_chk" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0)
);

CREATE INDEX "api_metric_raw_observed_at_idx" ON "api_metric_raw"("observed_at");
CREATE INDEX "api_metric_raw_website_id_observed_at_idx" ON "api_metric_raw"("website_id", "observed_at");
ALTER TABLE "api_metric_raw" ADD CONSTRAINT "api_metric_raw_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_metric_hour" (
    "website_id" UUID NOT NULL,
    "bucket_start" TIMESTAMPTZ(6) NOT NULL,
    "service_name" VARCHAR(255) NOT NULL,
    "route" VARCHAR(500) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "latency_sum_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_count" INTEGER NOT NULL DEFAULT 0,
    "h5" INTEGER NOT NULL DEFAULT 0,
    "h10" INTEGER NOT NULL DEFAULT 0,
    "h25" INTEGER NOT NULL DEFAULT 0,
    "h50" INTEGER NOT NULL DEFAULT 0,
    "h100" INTEGER NOT NULL DEFAULT 0,
    "h250" INTEGER NOT NULL DEFAULT 0,
    "h500" INTEGER NOT NULL DEFAULT 0,
    "h1000" INTEGER NOT NULL DEFAULT 0,
    "h2500" INTEGER NOT NULL DEFAULT 0,
    "h5000" INTEGER NOT NULL DEFAULT 0,
    "h10000" INTEGER NOT NULL DEFAULT 0,
    "h_inf" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_metric_hour_pkey" PRIMARY KEY ("website_id", "bucket_start", "service_name", "route", "status_code"),
    CONSTRAINT "api_metric_hour_status_chk" CHECK ("status_code" BETWEEN 100 AND 599)
);

CREATE INDEX "api_metric_hour_bucket_start_idx" ON "api_metric_hour"("bucket_start");
ALTER TABLE "api_metric_hour" ADD CONSTRAINT "api_metric_hour_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_metric_day" (
    "website_id" UUID NOT NULL,
    "bucket_start" TIMESTAMPTZ(6) NOT NULL,
    "service_name" VARCHAR(255) NOT NULL,
    "route" VARCHAR(500) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "latency_sum_ms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_count" INTEGER NOT NULL DEFAULT 0,
    "h5" INTEGER NOT NULL DEFAULT 0,
    "h10" INTEGER NOT NULL DEFAULT 0,
    "h25" INTEGER NOT NULL DEFAULT 0,
    "h50" INTEGER NOT NULL DEFAULT 0,
    "h100" INTEGER NOT NULL DEFAULT 0,
    "h250" INTEGER NOT NULL DEFAULT 0,
    "h500" INTEGER NOT NULL DEFAULT 0,
    "h1000" INTEGER NOT NULL DEFAULT 0,
    "h2500" INTEGER NOT NULL DEFAULT 0,
    "h5000" INTEGER NOT NULL DEFAULT 0,
    "h10000" INTEGER NOT NULL DEFAULT 0,
    "h_inf" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "api_metric_day_pkey" PRIMARY KEY ("website_id", "bucket_start", "service_name", "route", "status_code"),
    CONSTRAINT "api_metric_day_status_chk" CHECK ("status_code" BETWEEN 100 AND 599)
);

CREATE INDEX "api_metric_day_bucket_start_idx" ON "api_metric_day"("bucket_start");
ALTER TABLE "api_metric_day" ADD CONSTRAINT "api_metric_day_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_metric_cursor" (
    "website_id" UUID NOT NULL,
    "service_name" VARCHAR(255) NOT NULL,
    "route" VARCHAR(500) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "metric_name" VARCHAR(255) NOT NULL,
    "last_count" INTEGER NOT NULL,
    "last_sum" DOUBLE PRECISION NOT NULL,
    "last_hist" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_metric_cursor_pkey" PRIMARY KEY ("website_id", "service_name", "route", "status_code", "metric_name")
);

ALTER TABLE "api_metric_cursor" ADD CONSTRAINT "api_metric_cursor_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "website"("website_id") ON DELETE CASCADE ON UPDATE CASCADE;
