import { api, apiForm } from "@/lib/api-client";

export type RoomInventoryRow = {
  id: string;
  expectedQuantity: number;
  item: { id: string; name: string; unit?: string };
};

export function buildFoundMap(rows: RoomInventoryRow[], foundQty: Record<string, string>): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    const raw = foundQty[row.item.id] ?? String(row.expectedQuantity);
    const found = Number(raw);
    if (!Number.isInteger(found) || found < 0) {
      throw new Error(`Enter a valid found quantity for ${row.item.name}.`);
    }
    result.set(row.item.id, found);
  }
  return result;
}

export async function submitRoomInventoryVerifications(input: {
  roomId: string;
  rows: RoomInventoryRow[];
  foundQty: Record<string, string>;
  photoFileId: string;
  cleaningTaskId?: string;
  notes?: string;
}): Promise<{ discrepancies: number }> {
  const foundMap = buildFoundMap(input.rows, input.foundQty);
  let discrepancies = 0;
  for (const row of input.rows) {
    const found = foundMap.get(row.item.id)!;
    await api("/api/v1/room-inventory", {
      method: "POST",
      body: JSON.stringify({
        action: "verify",
        roomId: input.roomId,
        itemId: row.item.id,
        foundQuantity: found,
        photoFileId: input.photoFileId,
        cleaningTaskId: input.cleaningTaskId,
        notes: input.notes,
      }),
    });
    if (found !== row.expectedQuantity) discrepancies += 1;
  }
  return { discrepancies };
}

export async function uploadInventoryVerificationPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", "INVENTORY_VERIFICATION");
  const up = await apiForm<{ fileId: string }>("/api/v1/files", form);
  return up.data.fileId;
}
