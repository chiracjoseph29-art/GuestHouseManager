"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiForm } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Category = { id: string; name: string };

type Item = {
  id: string;
  name: string;
  quantity: number;
  minimumThreshold: number;
  unit: string;
  location?: string | null;
  categoryId: string;
  category?: Category;
  lowStock?: boolean;
  referencePhotoId?: string | null;
  assignedQuantity?: number;
  availableQuantity?: number;
};

type ItemForm = {
  name: string;
  categoryId: string;
  quantity: string;
  minimumThreshold: string;
  unit: string;
  location: string;
};

type RoomOption = { id: string; name: string };
type RoomAssignState = Record<string, { selected: boolean; expected: string }>;

function emptyForm(categories: Category[]): ItemForm {
  return {
    name: "",
    categoryId: categories[0]?.id ?? "",
    quantity: "0",
    minimumThreshold: "0",
    unit: "pieces",
    location: "",
  };
}

export default function InventoryPage() {
  const { user } = useSession();
  const canManage = user?.role === "ADMIN";
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ItemForm>(emptyForm([]));
  const [qtyDialog, setQtyDialog] = useState<{ id: string; name: string } | null>(null);
  const [qtyChange, setQtyChange] = useState({ type: "ADDITION", amount: "1", reason: "" });
  const [activeRooms, setActiveRooms] = useState<RoomOption[]>([]);
  const [roomAssign, setRoomAssign] = useState<RoomAssignState>({});

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Item[]; categories: Category[] }>("/api/v1/inventory");
      if (!r.data?.items || !r.data?.categories) {
        throw new Error("Inventory response was incomplete. Try signing in again or restart the dev server.");
      }
      setItems(r.data.items);
      setCategories(r.data.categories);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load inventory.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api<{ rooms: RoomOption[] }>("/api/v1/rooms")
      .then((r) => setActiveRooms(r.data.rooms))
      .catch(() => {});
  }, [canManage]);

  function emptyRoomAssign(): RoomAssignState {
    const next: RoomAssignState = {};
    for (const room of activeRooms) {
      next[room.id] = { selected: false, expected: "1" };
    }
    return next;
  }

  function roomAssignmentsPayload() {
    return Object.entries(roomAssign)
      .filter(([, v]) => v.selected)
      .map(([roomId, v]) => ({
        roomId,
        expectedQuantity: Math.max(0, Number(v.expected) || 0),
      }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm(categories));
    setRoomAssign(emptyRoomAssign());
    setDialogOpen(true);
  }

  async function openEdit(item: Item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      categoryId: item.categoryId,
      quantity: String(item.quantity),
      minimumThreshold: String(item.minimumThreshold),
      unit: item.unit,
      location: item.location ?? "",
    });
    const next = emptyRoomAssign();
    try {
      const assignRes = await api<{
        assignments: { roomId: string; expectedQuantity: number; assignedQuantity?: number }[];
      }>(`/api/v1/inventory?itemId=${item.id}`);
      for (const a of assignRes.data.assignments) {
        next[a.roomId] = { selected: true, expected: String(a.expectedQuantity) };
      }
    } catch {
      /* keep empty selection */
    }
    setRoomAssign(next);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.categoryId || !form.unit.trim()) {
      toast.error("Name, category, and unit are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api(`/api/v1/inventory?id=${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: form.name.trim(),
            categoryId: form.categoryId,
            minimumThreshold: Number(form.minimumThreshold) || 0,
            unit: form.unit.trim(),
            location: form.location.trim() || undefined,
            roomAssignments: roomAssignmentsPayload(),
          }),
        });
        toast.success("Item updated.");
      } else {
        await api("/api/v1/inventory", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            categoryId: form.categoryId,
            quantity: Number(form.quantity) || 0,
            minimumThreshold: Number(form.minimumThreshold) || 0,
            unit: form.unit.trim(),
            location: form.location.trim() || undefined,
            roomAssignments: roomAssignmentsPayload(),
          }),
        });
        toast.success("Item added.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save item.");
    } finally {
      setSaving(false);
    }
  }

  async function applyQuantityChange() {
    if (!qtyDialog) return;
    if (!qtyChange.reason.trim()) {
      toast.error("A reason is required for quantity changes.");
      return;
    }
    const amount = Number(qtyChange.amount);
    if (!Number.isInteger(amount) || amount === 0) {
      toast.error("Enter a non-zero whole number.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/v1/inventory?id=${qtyDialog.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: qtyChange.type,
          quantityChange: amount,
          reason: qtyChange.reason.trim(),
        }),
      });
      toast.success("Quantity updated.");
      setQtyDialog(null);
      setQtyChange({ type: "ADDITION", amount: "1", reason: "" });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update quantity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        {canManage && (
          <Button type="button" onClick={openCreate} disabled={categories.length === 0}>
            + Add Item
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {item.referencePhotoId && (
                    <img src={`/api/v1/files?id=${item.referencePhotoId}`} alt="" className="h-10 w-10 rounded border object-cover" />
                  )}
                  {item.name}
                </div>
              </TableCell>
              <TableCell>{item.availableQuantity ?? item.quantity}</TableCell>
              <TableCell>{item.assignedQuantity ?? 0}</TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell>
                {item.lowStock ? (
                  <Badge variant="destructive">Low stock</Badge>
                ) : (
                  <Badge variant="secondary">OK</Badge>
                )}
              </TableCell>
              {canManage && (
                <TableCell className="space-x-2 text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => void openEdit(item)}>
                    Edit
                  </Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-2 py-1 text-xs">
                    Photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void (async () => {
                          try {
                            const form = new FormData();
                            form.append("file", file);
                            form.append("purpose", "INVENTORY_REFERENCE");
                            const up = await apiForm<{ fileId: string }>("/api/v1/files", form);
                            await api("/api/v1/room-inventory", {
                              method: "POST",
                              body: JSON.stringify({
                                action: "attach_reference_photo",
                                itemId: item.id,
                                fileId: up.data.fileId,
                              }),
                            });
                            toast.success("Reference photo updated.");
                            await load();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Upload failed.");
                          }
                        })();
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQtyDialog({ id: item.id, name: item.name })}
                  >
                    Adjust qty
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit item" : "Add inventory item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="inv-name">Name</Label>
              <Input
                id="inv-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="inv-cat">Category</Label>
              <select
                id="inv-cat"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {!editingId && (
              <div>
                <Label htmlFor="inv-qty">Initial quantity</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min={0}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
            )}
            <div>
              <Label htmlFor="inv-threshold">Reorder threshold</Label>
              <Input
                id="inv-threshold"
                type="number"
                min={0}
                value={form.minimumThreshold}
                onChange={(e) => setForm((f) => ({ ...f, minimumThreshold: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="inv-unit">Unit</Label>
              <Input
                id="inv-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="inv-loc">Location</Label>
              <Input
                id="inv-loc"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            {canManage && activeRooms.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <Label>{editingId ? "Assigned rooms" : "Assign to rooms"}</Label>
                <p className="text-xs text-slate-500">
                  Select rooms and set expected quantities. Uncheck to remove from a room (if no stock is assigned there).
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                  {activeRooms.map((room) => {
                    const row = roomAssign[room.id] ?? { selected: false, expected: "1" };
                    return (
                      <li key={room.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex min-w-[10rem] flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) =>
                              setRoomAssign((ra) => ({
                                ...ra,
                                [room.id]: { ...row, selected: e.target.checked },
                              }))
                            }
                          />
                          {room.name}
                        </label>
                        <span className="text-slate-500">Expected:</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20"
                          disabled={!row.selected}
                          value={row.expected}
                          onChange={(e) =>
                            setRoomAssign((ra) => ({
                              ...ra,
                              [room.id]: { ...row, expected: e.target.value },
                            }))
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : editingId ? "Save" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qtyDialog} onOpenChange={(open) => !open && setQtyDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust quantity — {qtyDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Type</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={qtyChange.type}
                onChange={(e) => setQtyChange((q) => ({ ...q, type: e.target.value }))}
              >
                <option value="ADDITION">Addition</option>
                <option value="CONSUMPTION">Consumption</option>
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="DAMAGED">Damaged</option>
                <option value="LOST">Lost</option>
              </select>
            </div>
            <div>
              <Label>Quantity change (+/-)</Label>
              <Input
                type="number"
                value={qtyChange.amount}
                onChange={(e) => setQtyChange((q) => ({ ...q, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <Input
                value={qtyChange.reason}
                onChange={(e) => setQtyChange((q) => ({ ...q, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQtyDialog(null)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void applyQuantityChange()}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
