"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useSession } from "@/hooks/use-session";

type Room = {
  id: string;
  name: string;
  isActive: boolean;
  floor?: string | null;
  roomType: { id: string; name: string; maxGuests: number; baseRate: string | number };
};

type RoomType = {
  id: string;
  name: string;
  description?: string | null;
  maxGuests: number;
  baseRate: string | number;
  extraBedRate?: string | number;
  extraBedAllowed?: boolean;
};

export default function AdminRoomsPage() {
  const { user } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [types, setTypes] = useState<RoomType[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState({ name: "", roomTypeId: "", floor: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [rateType, setRateType] = useState<RoomType | null>(null);
  const [rateForm, setRateForm] = useState({ baseRate: "", extraBedRate: "" });
  const [rateSaving, setRateSaving] = useState(false);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    description: "",
    maxGuests: "2",
    baseRate: "0",
    extraBedAllowed: false,
    extraBedRate: "0",
  });
  const [typeSaving, setTypeSaving] = useState(false);
  const [deleteType, setDeleteType] = useState<RoomType | null>(null);
  const [deletingType, setDeletingType] = useState(false);
  const [createRoomAfterType, setCreateRoomAfterType] = useState(false);

  async function load() {
    const [r, t] = await Promise.all([
      api<{ rooms: Room[] }>("/api/v1/rooms?all=1"),
      api<{ roomTypes: RoomType[] }>("/api/v1/rooms?types=1"),
    ]);
    setRooms(r.data.rooms);
    setTypes(t.data.roomTypes);
  }

  useEffect(() => {
    load().catch(() => toast.error("Unable to load rooms."));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", roomTypeId: types[0]?.id ?? "", floor: "", isActive: true });
    setOpen(true);
  }

  function openEdit(room: Room) {
    setEditing(room);
    setForm({
      name: room.name,
      roomTypeId: room.roomType.id,
      floor: room.floor ?? "",
      isActive: room.isActive,
    });
    setOpen(true);
  }

  function openRateEdit(type: RoomType) {
    setRateType(type);
    setRateForm({
      baseRate: String(type.baseRate),
      extraBedRate: String(type.extraBedRate ?? 0),
    });
  }

  function openTypeCreate(fromRoom = false) {
    setEditingType(null);
    setTypeForm({
      name: "",
      description: "",
      maxGuests: "2",
      baseRate: "0",
      extraBedAllowed: false,
      extraBedRate: "0",
    });
    setCreateRoomAfterType(fromRoom);
    if (fromRoom) setOpen(false);
    setTypeDialogOpen(true);
  }

  function openTypeEdit(type: RoomType) {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description ?? "",
      maxGuests: String(type.maxGuests),
      baseRate: String(type.baseRate),
      extraBedAllowed: type.extraBedAllowed ?? false,
      extraBedRate: String(type.extraBedRate ?? 0),
    });
    setCreateRoomAfterType(false);
    setTypeDialogOpen(true);
  }

  async function saveType() {
    if (!typeForm.name.trim()) {
      toast.error("Room type name is required.");
      return;
    }
    setTypeSaving(true);
    try {
      const payload = {
        name: typeForm.name.trim(),
        description: typeForm.description.trim(),
        maxGuests: Number(typeForm.maxGuests),
        baseRate: Number(typeForm.baseRate),
        extraBedAllowed: typeForm.extraBedAllowed,
        extraBedRate: Number(typeForm.extraBedRate),
      };
      const result = editingType
        ? await api<{ roomType: RoomType }>(`/api/v1/room-types?id=${editingType.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await api<{ roomType: RoomType }>("/api/v1/room-types", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      toast.success(editingType ? "Room type updated." : "Room type created.");
      setTypeDialogOpen(false);
      await load();
      if (createRoomAfterType) {
        setForm((current) => ({ ...current, roomTypeId: result.data.roomType.id }));
        setOpen(true);
      }
      setCreateRoomAfterType(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save room type.");
    } finally {
      setTypeSaving(false);
    }
  }

  async function confirmDeleteType() {
    if (!deleteType) return;
    setDeletingType(true);
    try {
      await api(`/api/v1/room-types?id=${deleteType.id}`, { method: "DELETE" });
      toast.success("Room type deleted.");
      setDeleteType(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete room type.");
    } finally {
      setDeletingType(false);
    }
  }

  async function saveRates() {
    if (!rateType) return;
    setRateSaving(true);
    try {
      await api(`/api/v1/rooms?roomTypeId=${rateType.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          baseRate: Number(rateForm.baseRate),
          extraBedRate: Number(rateForm.extraBedRate),
        }),
      });
      toast.success("Room type rates updated.");
      setRateType(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update rates.");
    } finally {
      setRateSaving(false);
    }
  }

  async function confirmDeleteRoom() {
    if (!deleteRoom) return;
    setDeletingRoom(true);
    try {
      await api(`/api/v1/rooms?id=${deleteRoom.id}`, { method: "DELETE" });
      toast.success("Room deleted.");
      setDeleteRoom(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete room.");
    } finally {
      setDeletingRoom(false);
    }
  }

  async function save() {
    if (!form.name.trim() || !form.roomTypeId) {
      toast.error("Name and room type are required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/v1/rooms?id=${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            roomTypeId: form.roomTypeId,
            floor: form.floor,
            isActive: form.isActive,
          }),
        });
        toast.success("Room updated.");
      } else {
        await api("/api/v1/rooms", {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            roomTypeId: form.roomTypeId,
            floor: form.floor,
            isActive: form.isActive,
          }),
        });
        toast.success("Room created.");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/app/admin" className="text-sm text-slate-500 hover:underline">← Administration</Link>
          <h1 className="text-2xl font-semibold">Rooms</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openTypeCreate()}>+ Add Room Type</Button>
          <Button onClick={openCreate}>+ Add Room</Button>
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Room type default rates</h2>
        <p className="text-sm text-slate-600">
          New bookings load these rates; each booking stores its own agreed rate.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Base rate / night</TableHead>
              <TableHead>Extra bed rate / night</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>₹{Number(t.baseRate).toLocaleString("en-IN")}</TableCell>
                <TableCell>₹{Number(t.extraBedRate ?? 0).toLocaleString("en-IN")}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => openTypeEdit(t)}>Edit type</Button>
                  <Button size="sm" variant="outline" onClick={() => openRateEdit(t)}>Edit rates</Button>
                  {user?.role === "ADMIN" && (
                    <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDeleteType(t)}>
                      Delete
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {types.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <p className="text-sm text-slate-600">No room types yet — Create room type</p>
                  <Button className="mt-3" size="sm" onClick={() => openTypeCreate()}>
                    Create room type
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Base rate</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.map((room) => (
            <TableRow key={room.id}>
              <TableCell>{room.name}</TableCell>
              <TableCell>{room.roomType.name}</TableCell>
              <TableCell>{room.roomType.maxGuests} guests</TableCell>
              <TableCell>₹{Number(room.roomType.baseRate).toLocaleString("en-IN")}</TableCell>
              <TableCell>
                {room.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(room)}>Edit</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  onClick={() => setDeleteRoom(room)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rooms.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-600">
                No rooms yet. Create a room type first, then add rooms to make them available for bookings.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <ConfirmDeleteDialog
        open={Boolean(deleteRoom)}
        onOpenChange={(open) => !open && setDeleteRoom(null)}
        title={deleteRoom ? `Delete room ${deleteRoom.name}?` : "Delete room?"}
        description={
          deleteRoom ? (
            <>
              <p>This permanently removes this room. This cannot be undone.</p>
              <p className="font-medium text-slate-800">{deleteRoom.name}</p>
              <p>Type: {deleteRoom.roomType.name}</p>
              <p className="text-xs">
                Rooms with bookings, cleaning tasks, or inventory links cannot be deleted. Use Edit to deactivate
                instead.
              </p>
            </>
          ) : null
        }
        loading={deletingRoom}
        onConfirm={confirmDeleteRoom}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteType)}
        onOpenChange={(value) => !value && setDeleteType(null)}
        title={deleteType ? `Delete room type ${deleteType.name}?` : "Delete room type?"}
        description={
          deleteType ? (
            <>
              <p>This permanently removes this room type.</p>
              <p className="font-medium text-slate-800">{deleteType.name}</p>
              <p className="text-xs">Room types assigned to rooms cannot be deleted.</p>
            </>
          ) : null
        }
        loading={deletingType}
        onConfirm={confirmDeleteType}
      />

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit room type" : "Create room type"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor="room-type-name">Name</Label>
              <Input id="room-type-name" maxLength={100} value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="room-type-description">Description</Label>
              <Input id="room-type-description" maxLength={500} value={typeForm.description} onChange={(e) => setTypeForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="room-type-capacity">Maximum guests</Label>
              <Input id="room-type-capacity" type="number" min={1} max={20} step={1} value={typeForm.maxGuests} onChange={(e) => setTypeForm((f) => ({ ...f, maxGuests: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="room-type-base-rate">Default rate per night (₹)</Label>
              <Input id="room-type-base-rate" type="number" min={0} step="0.01" value={typeForm.baseRate} onChange={(e) => setTypeForm((f) => ({ ...f, baseRate: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={typeForm.extraBedAllowed} onChange={(e) => setTypeForm((f) => ({ ...f, extraBedAllowed: e.target.checked }))} />
              Extra bed allowed
            </label>
            <div>
              <Label htmlFor="room-type-extra-rate">Extra bed rate per night (₹)</Label>
              <Input id="room-type-extra-rate" type="number" min={0} step="0.01" disabled={!typeForm.extraBedAllowed} value={typeForm.extraBedRate} onChange={(e) => setTypeForm((f) => ({ ...f, extraBedRate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Cancel</Button>
            <Button disabled={typeSaving} onClick={() => void saveType()}>{typeSaving ? "Saving…" : "Save room type"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rateType)} onOpenChange={(v) => !v && setRateType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit rates — {rateType?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Default rate per night (₹)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={rateForm.baseRate}
                onChange={(e) => setRateForm((f) => ({ ...f, baseRate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Extra bed rate per night (₹)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={rateForm.extraBedRate}
                onChange={(e) => setRateForm((f) => ({ ...f, extraBedRate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateType(null)}>Cancel</Button>
            <Button disabled={rateSaving} onClick={() => void saveRates()}>Save rates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit room" : "Add room"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Room type</Label>
              {types.length > 0 ? (
                <select className="flex h-9 w-full rounded-md border px-3 text-sm" value={form.roomTypeId} onChange={(e) => setForm((f) => ({ ...f, roomTypeId: e.target.value }))}>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">No room types yet. Create one before adding a room.</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => openTypeCreate(true)}>
                    Create room type
                  </Button>
                </div>
              )}
            </div>
            <div>
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active (available for new bookings)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void save()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
