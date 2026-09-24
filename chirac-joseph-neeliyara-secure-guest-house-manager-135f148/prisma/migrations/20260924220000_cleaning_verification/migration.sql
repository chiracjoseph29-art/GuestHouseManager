-- Cleaning manager verification workflow (nullable columns; existing rows unchanged).
ALTER TABLE "cleaning_tasks" ADD COLUMN "submitted_for_verification_at" TIMESTAMP(3);
ALTER TABLE "cleaning_tasks" ADD COLUMN "verified_by_id" UUID;
ALTER TABLE "cleaning_tasks" ADD COLUMN "verified_at" TIMESTAMP(3);
ALTER TABLE "cleaning_tasks" ADD COLUMN "submission_meta" JSONB;

ALTER TABLE "cleaning_tasks" ADD CONSTRAINT "cleaning_tasks_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "cleaning_tasks_verified_by_id_idx" ON "cleaning_tasks"("verified_by_id");
