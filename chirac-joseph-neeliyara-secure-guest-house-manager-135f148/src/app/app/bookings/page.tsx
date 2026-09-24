"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "@/lib/api-client";
import { CustomerPicker, type CustomerSummary } from "@/components/customer-picker";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useSession } from "@/hooks/use-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Booking = {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  status: string;
  isWholeHouse: boolean;
  guestCount: number;
  source: string;
  amountTotal: string | number;
  amountPaid: string | number;
  balance: string | number;
  paymentStatus: string;
  extraBedCount?: number;
  roomStayTotal?: string | number;
  extraBedTotal?: string | number;
  notes?: string | null;
  roomNightlyRate?: string | number;
  extraBedNightlyRate?: string | number;
  guest: { id?: string; fullName: string; email?: string | null; phone?: string | null };
  bookingRooms: { room: { id: string; name: string } }[];
};

type RoomOption = {
  id: string;
  name: string;
  available?: boolean;
  baseRate?: number | string;
  extraBedAllowed?: boolean;
  extraBedRate?: number | string;
};

const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"] as const;
const SOURCES = ["DIRECT", "ONLINE", "PHONE", "WALK_IN", "OTHER"] as const;

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultForm() {
  const checkIn = new Date();
  checkIn.setHours(14, 0, 0, 0);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  checkOut.setHours(11, 0, 0, 0);
  return {
    guestFullName: "",
    guestEmail: "",
    guestPhone: "",
    guestAddress: "",
    guestIdType: "",
    guestIdNumber: "",
    checkIn: toLocalInput(checkIn.toISOString()),
    checkOut: toLocalInput(checkOut.toISOString()),
    guestCount: 1,
    source: "DIRECT" as const,
    status: "CONFIRMED" as const,
    isWholeHouse: false,
    roomIds: [] as string[],
    extraBedCount: 0,
    roomNightlyRate: "",
    extraBedNightlyRate: "",
    amountTotal: "0",
    amountPaid: "0",
    notes: "",
  };
}

function stayNights(checkIn: string, checkOut: string) {
  const start = new Date(checkIn);
  start.setHours(0, 0, 0, 0);
  const end = new Date(checkOut);
  end.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}

function defaultRatesFromRooms(rooms: RoomOption[], roomIds: string[]) {
  const selected = rooms.filter((r) => roomIds.includes(r.id));
  const roomNightlyRate = selected.reduce((sum, r) => sum + Number(r.baseRate ?? 0), 0);
  let extraBedAllowed = false;
  let extraBedNightlyRate = 0;
  for (const room of selected) {
    if (room.extraBedAllowed) {
      extraBedAllowed = true;
      extraBedNightlyRate = Math.max(extraBedNightlyRate, Number(room.extraBedRate ?? 0));
    }
  }
  return { roomNightlyRate, extraBedNightlyRate, extraBedAllowed };
}

function computeBookingTotal(
  rooms: RoomOption[],
  roomIds: string[],
  extraBedCount: number,
  checkIn: string,
  checkOut: string,
  roomNightlyRateInput: string,
  extraBedNightlyRateInput: string,
) {
  const defaults = defaultRatesFromRooms(rooms, roomIds);
  const nights = stayNights(checkIn, checkOut);
  const roomNightlyRate =
    roomNightlyRateInput !== "" ? Number(roomNightlyRateInput) : defaults.roomNightlyRate;
  const roomStayTotal = roomNightlyRate * nights;
  const extraBedNightlyRate =
    extraBedNightlyRateInput !== ""
      ? Number(extraBedNightlyRateInput)
      : defaults.extraBedNightlyRate;
  const beds = defaults.extraBedAllowed ? Math.max(0, extraBedCount) : 0;
  const extraBedTotal = beds * extraBedNightlyRate * nights;
  return {
    nights,
    roomNightlyRate,
    roomStayTotal,
    extraBedNightlyRate,
    extraBedTotal,
    amountTotal: roomStayTotal + extraBedTotal,
    extraBedAllowed: defaults.extraBedAllowed,
  };
}

export default function BookingsPage() {
  const { user } = useSession();
  const canManage = user?.role === "ADMIN";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const selectedGuestIdRef = useRef<string | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<CustomerSummary | null>(null);
  const [duplicateHint, setDuplicateHint] = useState<CustomerSummary | null>(null);
  const roomRateEdited = useRef(false);
  const extraBedRateEdited = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ bookings: Booking[] }>("/api/v1/bookings");
      setBookings(r.data.bookings);
    } catch {
      toast.error("Unable to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    if (!form.checkIn || !form.checkOut) return;
    const checkInIso = new Date(form.checkIn).toISOString();
    const checkOutIso = new Date(form.checkOut).toISOString();
    if (new Date(checkOutIso) <= new Date(checkInIso)) return;
    const exclude = editingId ? `&excludeBookingId=${editingId}` : "";
    try {
      const r = await api<{ rooms: RoomOption[]; wholeHouseBlocked?: boolean }>(
        `/api/v1/bookings?availability=1&checkIn=${encodeURIComponent(checkInIso)}&checkOut=${encodeURIComponent(checkOutIso)}${exclude}`,
      );
      setRooms(
        r.data.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          available: room.available,
          baseRate: room.baseRate,
          extraBedAllowed: room.extraBedAllowed,
          extraBedRate: room.extraBedRate,
        })),
      );
    } catch {
      toast.error("Could not check room availability.");
    }
  }, [form.checkIn, form.checkOut, editingId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (dialogOpen) void loadAvailability();
  }, [dialogOpen, loadAvailability]);

  useEffect(() => {
    if (!dialogOpen) return;
    const ids = form.isWholeHouse ? rooms.map((r) => r.id) : form.roomIds;
    if (ids.length === 0) return;
    const defaults = defaultRatesFromRooms(rooms, ids);
    setForm((f) => ({
      ...f,
      roomNightlyRate: roomRateEdited.current ? f.roomNightlyRate : String(defaults.roomNightlyRate),
      extraBedNightlyRate: extraBedRateEdited.current
        ? f.extraBedNightlyRate
        : String(defaults.extraBedNightlyRate),
    }));
  }, [dialogOpen, form.roomIds, form.isWholeHouse, rooms]);

  useEffect(() => {
    if (!dialogOpen || (form.roomIds.length === 0 && !form.isWholeHouse)) return;
    const ids = form.isWholeHouse ? rooms.map((r) => r.id) : form.roomIds;
    const pricing = computeBookingTotal(
      rooms,
      ids,
      form.extraBedCount,
      form.checkIn,
      form.checkOut,
      form.roomNightlyRate,
      form.extraBedNightlyRate,
    );
    setForm((f) => ({ ...f, amountTotal: String(pricing.amountTotal) }));
  }, [
    dialogOpen,
    form.roomIds,
    form.extraBedCount,
    form.checkIn,
    form.checkOut,
    form.isWholeHouse,
    form.roomNightlyRate,
    form.extraBedNightlyRate,
    rooms,
  ]);

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setSelectedGuestId(null);
    selectedGuestIdRef.current = null;
    setSelectedGuest(null);
    setDuplicateHint(null);
    roomRateEdited.current = false;
    extraBedRateEdited.current = false;
    setDialogOpen(true);
  }

  const checkDuplicateContact = useCallback(async () => {
    if (selectedGuestId) {
      setDuplicateHint(null);
      return;
    }
    const phone = form.guestPhone.trim();
    const email = form.guestEmail.trim();
    if (!phone && !email) {
      setDuplicateHint(null);
      return;
    }
    try {
      const params = new URLSearchParams({ search: "1" });
      if (phone) params.set("phone", phone);
      else params.set("email", email);
      const r = await api<{ guests: CustomerSummary[] }>(`/api/v1/guests?${params}`);
      setDuplicateHint(r.data.guests[0] ?? null);
    } catch {
      setDuplicateHint(null);
    }
  }, [form.guestEmail, form.guestPhone, selectedGuestId]);

  useEffect(() => {
    if (!dialogOpen || editingId) return;
    const handle = window.setTimeout(() => {
      void checkDuplicateContact();
    }, 400);
    return () => window.clearTimeout(handle);
  }, [dialogOpen, editingId, checkDuplicateContact]);

  async function selectGuest(g: CustomerSummary) {
    let full = g;
    try {
      const r = await api<{
        guest: CustomerSummary & {
          address?: string | null;
          idType?: string | null;
          idNumber?: string | null;
        };
      }>(`/api/v1/guests?id=${g.id}`);
      full = { ...g, ...r.data.guest };
    } catch {
      /* use search result if profile fetch fails */
    }
    selectedGuestIdRef.current = full.id;
    setSelectedGuestId(full.id);
    setSelectedGuest(full);
    setDuplicateHint(null);
    setForm((f) => ({
      ...f,
      guestFullName: full.fullName,
      guestEmail: full.email ?? "",
      guestPhone: full.phone ?? "",
      guestAddress: full.address ?? "",
      guestIdType: full.idType ?? "",
      guestIdNumber: full.idNumber ?? "",
    }));
  }

  async function openEdit(id: string) {
    try {
      const r = await api<{ booking: Booking }>(`/api/v1/bookings?id=${id}`);
      const b = r.data.booking;
      setEditingId(b.id);
      setSelectedGuestId(b.guest.id ?? null);
      roomRateEdited.current = true;
      extraBedRateEdited.current = true;
      setForm({
        guestFullName: b.guest.fullName,
        guestEmail: b.guest.email ?? "",
        guestPhone: b.guest.phone ?? "",
        guestAddress: "",
        guestIdType: "",
        guestIdNumber: "",
        checkIn: toLocalInput(b.checkIn),
        checkOut: toLocalInput(b.checkOut),
        guestCount: b.guestCount,
        source: b.source as typeof form.source,
        status: b.status as typeof form.status,
        isWholeHouse: b.isWholeHouse,
        roomIds: b.bookingRooms.map((br) => br.room.id),
        extraBedCount: b.extraBedCount ?? 0,
        roomNightlyRate: String(b.roomNightlyRate ?? 0),
        extraBedNightlyRate: String(b.extraBedNightlyRate ?? 0),
        amountTotal: String(b.amountTotal),
        amountPaid: String(b.amountPaid),
        notes: b.notes ?? "",
      });
      setDialogOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load booking.");
    }
  }

  async function handleSave() {
    if (!form.guestFullName.trim()) {
      toast.error("Guest name is required.");
      return;
    }
    const guestIdForSave = selectedGuestIdRef.current ?? selectedGuestId;
    if (!editingId && !guestIdForSave && !form.guestPhone.trim()) {
      toast.error("Phone is required for a new customer.");
      return;
    }
    if (!editingId && !guestIdForSave && duplicateHint) {
      toast.error("Customer already exists. Select the existing customer instead.");
      return;
    }
    const checkIn = new Date(form.checkIn);
    const checkOut = new Date(form.checkOut);
    if (checkOut <= checkIn) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    if (!form.isWholeHouse && form.roomIds.length === 0) {
      toast.error("Select at least one room.");
      return;
    }

    const payload = {
      guest: {
        fullName: form.guestFullName.trim(),
        email: form.guestEmail.trim() || undefined,
        phone: form.guestPhone.trim() || undefined,
      },
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
      guestCount: form.guestCount,
      source: form.source,
      status: form.status,
      isWholeHouse: form.isWholeHouse,
      roomIds: form.isWholeHouse ? [] : form.roomIds,
      extraBedCount: form.extraBedCount,
      roomNightlyRate: form.roomNightlyRate !== "" ? Number(form.roomNightlyRate) : undefined,
      extraBedNightlyRate:
        form.extraBedNightlyRate !== "" ? Number(form.extraBedNightlyRate) : undefined,
      amountPaid: Number(form.amountPaid) || 0,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await api("/api/v1/bookings", {
          method: "PATCH",
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        toast.success("Booking updated.");
      } else {
        await api("/api/v1/bookings", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            ...(guestIdForSave ? { guestId: guestIdForSave } : {}),
          }),
        });
        toast.success("Booking created.");
      }
      setDialogOpen(false);
      await loadBookings();
    } catch (e) {
      if (e instanceof ApiRequestError && e.details?.existingGuest) {
        const existing = e.details.existingGuest as CustomerSummary;
        selectGuest(existing);
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Could not save booking.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteBooking() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/v1/bookings?id=${deleteTarget.id}&permanent=1`, { method: "DELETE" });
      toast.success("Booking deleted.");
      setDeleteTarget(null);
      await loadBookings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete booking.");
    } finally {
      setDeleting(false);
    }
  }

  function toggleRoom(roomId: string) {
    setForm((f) => ({
      ...f,
      roomIds: f.roomIds.includes(roomId) ? f.roomIds.filter((id) => id !== roomId) : [...f.roomIds, roomId],
    }));
  }

  const pricingRoomIds = form.isWholeHouse ? rooms.map((r) => r.id) : form.roomIds;
  const pricingPreview =
    pricingRoomIds.length > 0
      ? computeBookingTotal(
          rooms,
          pricingRoomIds,
          form.extraBedCount,
          form.checkIn,
          form.checkOut,
          form.roomNightlyRate,
          form.extraBedNightlyRate,
        )
      : null;

  const selectedRoomNames = rooms.filter((r) => form.roomIds.includes(r.id)).map((r) => r.name);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        {canManage && (
          <Button type="button" onClick={openCreate}>
            + New Booking
          </Button>
        )}
      </div>

      {loading && <p className="text-sm text-slate-500">Loading bookings…</p>}

      <div className="grid gap-3">
        {bookings.map((b) => (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{b.reference}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge>{b.status}</Badge>
                {canManage && b.status !== "CANCELLED" && (
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(b.id)}>
                    Edit
                  </Button>
                )}
                {canManage && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-700 hover:text-red-800"
                    onClick={() => setDeleteTarget(b)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <p>{b.guest.fullName}</p>
              <p>
                {new Date(b.checkIn).toLocaleString()} → {new Date(b.checkOut).toLocaleString()}
              </p>
              <p>
                {b.isWholeHouse
                  ? "Whole house"
                  : b.bookingRooms.map((br) => br.room.name).join(", ")}
              </p>
              <p className="text-xs text-slate-500">
                ₹{Number(b.amountTotal).toLocaleString()} total · ₹{Number(b.amountPaid).toLocaleString()} paid · ₹
                {Number(b.balance).toLocaleString()} balance · {b.paymentStatus}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget ? `Delete booking ${deleteTarget.reference}?` : "Delete booking?"}
        description={
          deleteTarget ? (
            <>
              <p>This permanently removes this booking and its room links. This cannot be undone.</p>
              <p className="font-medium text-slate-800">{deleteTarget.guest.fullName}</p>
              <p>
                {deleteTarget.isWholeHouse
                  ? "Whole house"
                  : deleteTarget.bookingRooms.map((br) => br.room.name).join(", ")}
              </p>
              <p className="text-xs">
                The customer record is kept. Bookings with payments cannot be deleted.
              </p>
            </>
          ) : null
        }
        loading={deleting}
        onConfirm={confirmDeleteBooking}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit booking" : "New booking"}</DialogTitle>
            <DialogDescription>
              Dates are checked for conflicts on save. Room availability updates when dates change.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            {!editingId ? (
              <CustomerPicker
                selectedGuestId={selectedGuestId}
                selectedGuest={selectedGuest}
                guestFullName={form.guestFullName}
                guestEmail={form.guestEmail}
                guestPhone={form.guestPhone}
                guestAddress={form.guestAddress}
                guestIdType={form.guestIdType}
                guestIdNumber={form.guestIdNumber}
                duplicateHint={duplicateHint}
                onSelectGuest={selectGuest}
                onUseDuplicateHint={() => duplicateHint && void selectGuest(duplicateHint)}
                onClearSelection={() => {
                  setSelectedGuestId(null);
                  selectedGuestIdRef.current = null;
                  setSelectedGuest(null);
                  setDuplicateHint(null);
                }}
                onStartNewCustomer={() => {
                  setSelectedGuestId(null);
                  selectedGuestIdRef.current = null;
                  setSelectedGuest(null);
                  setDuplicateHint(null);
                }}
                onChangeFullName={(value) => {
                  setForm((f) => ({ ...f, guestFullName: value }));
                }}
                onChangeEmail={(value) => {
                  setForm((f) => ({ ...f, guestEmail: value }));
                }}
                onChangePhone={(value) => {
                  setForm((f) => ({ ...f, guestPhone: value }));
                }}
              />
            ) : (
              <div className="rounded-md border bg-slate-50 p-3 text-sm">
                <p className="font-medium">{form.guestFullName}</p>
                {form.guestPhone && <p>{form.guestPhone}</p>}
                {form.guestEmail && <p>{form.guestEmail}</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="checkIn">Check-in</Label>
                <Input
                  id="checkIn"
                  type="datetime-local"
                  value={form.checkIn}
                  onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="checkOut">Check-out</Label>
                <Input
                  id="checkOut"
                  type="datetime-local"
                  value={form.checkOut}
                  onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="guestCount">Guests</Label>
                <Input
                  id="guestCount"
                  type="number"
                  min={1}
                  value={form.guestCount}
                  onChange={(e) => setForm((f) => ({ ...f, guestCount: Number(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label htmlFor="source">Source</Label>
                <select
                  id="source"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as typeof f.source }))}
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))}
              >
                {BOOKING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isWholeHouse}
                onChange={(e) => setForm((f) => ({ ...f, isWholeHouse: e.target.checked, roomIds: [] }))}
              />
              Whole-house booking
            </label>
            {!form.isWholeHouse && (
              <div>
                <Label>Rooms</Label>
                <div className="mt-1 flex flex-col gap-1">
                  {rooms.length === 0 && <p className="text-xs text-slate-500">No rooms or adjust dates to refresh.</p>}
                  {rooms.map((room) => (
                    <label key={room.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={room.available === false}
                        checked={form.roomIds.includes(room.id)}
                        onChange={() => toggleRoom(room.id)}
                      />
                      {room.name}
                      {room.available === false && <span className="text-xs text-red-600">(unavailable)</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {pricingPreview && (form.roomIds.length > 0 || form.isWholeHouse) && (
              <div className="space-y-2 rounded-md border bg-slate-50 p-3 text-sm">
                {!form.isWholeHouse && selectedRoomNames.length > 0 && (
                  <p className="font-medium">{selectedRoomNames.join(", ")}</p>
                )}
                {form.isWholeHouse && <p className="font-medium">Whole house</p>}
                <div>
                  <Label htmlFor="roomNightlyRate">Rate per night (₹)</Label>
                  <Input
                    id="roomNightlyRate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.roomNightlyRate}
                    onChange={(e) => {
                      roomRateEdited.current = true;
                      setForm((f) => ({ ...f, roomNightlyRate: e.target.value }));
                    }}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            {pricingPreview?.extraBedAllowed && (
              <div>
                <Label htmlFor="extraBeds">Extra beds</Label>
                <Input
                  id="extraBeds"
                  type="number"
                  min={0}
                  value={form.extraBedCount}
                  onChange={(e) => setForm((f) => ({ ...f, extraBedCount: Number(e.target.value) || 0 }))}
                />
                <Label htmlFor="extraBedNightlyRate" className="mt-2 block">
                  Extra bed rate per night (₹)
                </Label>
                <Input
                  id="extraBedNightlyRate"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.extraBedNightlyRate}
                  onChange={(e) => {
                    extraBedRateEdited.current = true;
                    setForm((f) => ({ ...f, extraBedNightlyRate: e.target.value }));
                  }}
                />
              </div>
            )}
            {pricingPreview && (
              <div className="rounded-md border bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                <p>Nights: {pricingPreview.nights}</p>
                <p>Room rate/night: ₹{pricingPreview.roomNightlyRate.toLocaleString("en-IN")}</p>
                <p>Room total: ₹{pricingPreview.roomStayTotal.toLocaleString("en-IN")}</p>
                {pricingPreview.extraBedAllowed && (
                  <>
                    <p>Extra beds: {form.extraBedCount}</p>
                    <p>Extra bed rate/night: ₹{pricingPreview.extraBedNightlyRate.toLocaleString("en-IN")}</p>
                    <p>Extra bed total: ₹{pricingPreview.extraBedTotal.toLocaleString("en-IN")}</p>
                  </>
                )}
                <p className="font-medium text-slate-800">
                  Booking total: ₹{pricingPreview.amountTotal.toLocaleString("en-IN")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="amountTotal">Total amount (calculated)</Label>
                <Input id="amountTotal" type="number" readOnly value={form.amountTotal} className="bg-slate-50" />
              </div>
              <div>
                <Label htmlFor="amountPaid">Amount paid</Label>
                <Input
                  id="amountPaid"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amountPaid}
                  onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
