-- Seed standard guest-house inventory categories (idempotent; does not reassign items).
INSERT INTO "inventory_categories" ("id", "name", "description")
VALUES
  (gen_random_uuid(), 'Housekeeping', 'Detergents, cleaning chemicals, mops, brooms, and cleaning supplies'),
  (gen_random_uuid(), 'Room Amenities', 'Glasses, cups, kettles, hangers, toiletries, and room supplies'),
  (gen_random_uuid(), 'Food & Beverage', 'Drinking water, snacks, breakfast supplies, and beverages'),
  (gen_random_uuid(), 'Maintenance', 'Bulbs, batteries, plumbing, electrical supplies, and tools'),
  (gen_random_uuid(), 'Office & Admin', 'Stationery, printer supplies, registers, and office consumables'),
  (gen_random_uuid(), 'Other', 'Items that do not fit the other categories')
ON CONFLICT ("name") DO NOTHING;
