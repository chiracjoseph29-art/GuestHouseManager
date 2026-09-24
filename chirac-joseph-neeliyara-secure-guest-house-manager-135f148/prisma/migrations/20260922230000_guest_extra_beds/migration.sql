-- Guest profile fields
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "address" VARCHAR(500);
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "id_type" VARCHAR(50);
ALTER TABLE "guests" ADD COLUMN IF NOT EXISTS "id_number" VARCHAR(100);
CREATE INDEX IF NOT EXISTS "guests_phone_idx" ON "guests"("phone");

-- Room type extra bed
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "room_types" ADD COLUMN IF NOT EXISTS "extra_bed_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Booking pricing breakdown
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "room_nightly_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "room_stay_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "extra_bed_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "extra_bed_nightly_rate" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "extra_bed_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
