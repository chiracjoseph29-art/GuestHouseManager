-- CreateEnum
CREATE TYPE "InventoryVerificationStatus" AS ENUM ('VERIFIED', 'MISSING', 'DAMAGED', 'MISMATCH');
CREATE TYPE "InventoryDiscrepancyStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'INVENTORY_REFERENCE';
ALTER TYPE "FilePurpose" ADD VALUE 'INVENTORY_VERIFICATION';
ALTER TYPE "InventoryTxnType" ADD VALUE 'ASSIGNED_TO_ROOM';
ALTER TYPE "InventoryTxnType" ADD VALUE 'RETURNED_FROM_ROOM';

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "reference_photo_id" UUID;
ALTER TABLE "inventory_transactions" ADD COLUMN "room_id" UUID;
ALTER TABLE "payments" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "room_inventory" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "expected_quantity" INTEGER NOT NULL DEFAULT 0,
    "assigned_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_inventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory_verifications" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "expected_quantity" INTEGER NOT NULL,
    "found_quantity" INTEGER NOT NULL,
    "status" "InventoryVerificationStatus" NOT NULL,
    "discrepancy_status" "InventoryDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "photo_file_id" UUID NOT NULL,
    "verified_by_id" UUID NOT NULL,
    "notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_reference_photo_id_key" ON "inventory_items"("reference_photo_id");
CREATE UNIQUE INDEX "room_inventory_room_id_item_id_key" ON "room_inventory"("room_id", "item_id");
CREATE INDEX "room_inventory_item_id_idx" ON "room_inventory"("item_id");
CREATE INDEX "inventory_verifications_room_id_item_id_created_at_idx" ON "inventory_verifications"("room_id", "item_id", "created_at");
CREATE INDEX "inventory_verifications_discrepancy_status_idx" ON "inventory_verifications"("discrepancy_status");
CREATE INDEX "inventory_transactions_room_id_created_at_idx" ON "inventory_transactions"("room_id", "created_at");
CREATE INDEX "payments_recorded_at_idx" ON "payments"("recorded_at");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_reference_photo_id_fkey" FOREIGN KEY ("reference_photo_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_inventory" ADD CONSTRAINT "room_inventory_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_inventory" ADD CONSTRAINT "room_inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_verifications" ADD CONSTRAINT "inventory_verifications_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
