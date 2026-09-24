-- Add normalized contact columns for duplicate-safe guest lookup (not based on name).
ALTER TABLE "guests" ADD COLUMN "email_normalized" VARCHAR(320);
ALTER TABLE "guests" ADD COLUMN "phone_normalized" VARCHAR(20);

UPDATE "guests"
SET "email_normalized" = lower(trim("email"))
WHERE "email" IS NOT NULL AND trim("email") <> '';

-- Last 10 digits handles +91 / spacing / punctuation for typical Indian mobiles.
UPDATE "guests"
SET "phone_normalized" = right(regexp_replace("phone", '\D', '', 'g'), 10)
WHERE "phone" IS NOT NULL
  AND length(regexp_replace("phone", '\D', '', 'g')) >= 10;

CREATE INDEX "guests_email_normalized_idx" ON "guests"("email_normalized");
CREATE INDEX "guests_phone_normalized_idx" ON "guests"("phone_normalized");

-- Partial unique indexes when no legacy duplicate normalized values exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "guests"
    WHERE "phone_normalized" IS NOT NULL AND "anonymized_at" IS NULL
    GROUP BY "phone_normalized" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "guests_phone_normalized_active_key"
      ON "guests"("phone_normalized")
      WHERE "anonymized_at" IS NULL AND "phone_normalized" IS NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "guests"
    WHERE "email_normalized" IS NOT NULL AND "anonymized_at" IS NULL
    GROUP BY "email_normalized" HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "guests_email_normalized_active_key"
      ON "guests"("email_normalized")
      WHERE "anonymized_at" IS NULL AND "email_normalized" IS NOT NULL;
  END IF;
END $$;
