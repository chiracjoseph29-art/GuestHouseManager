"use client";

import { useEffect, useState } from "react";
import { api, apiForm } from "@/lib/api-client";
import { RoomInventoryChecklist } from "@/components/room-inventory-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadInventoryVerificationPhoto, submitRoomInventoryVerifications } from "@/lib/room-inventory-verify";
import { toast } from "sonner";

type Room = { id: string; name: string };

export default function RoomInventoryPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [foundQty, setFoundQty] = useState<Record<string, string>>({});
  const [verifyPhoto, setVerifyPhoto] = useState<File | null>(null);
  const [verifyPhotoPreview, setVerifyPhotoPreview] = useState<string | null>(null);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rowCount, setRowCount] = useState(0);

  const selectedRoom = rooms.find((r) => r.id === roomId);

  useEffect(() => {
    api<{ rooms: Room[] }>("/api/v1/rooms")
      .then((r) => {
        setRooms(r.data.rooms);
        if (r.data.rooms[0]) setRoomId(r.data.rooms[0].id);
      })
      .catch(() => toast.error("Could not load rooms."));
  }, []);

  useEffect(() => {
    if (!roomId) return;
    api<{ roomInventory: unknown[] }>(`/api/v1/room-inventory?roomId=${roomId}`)
      .then((r) => setRowCount(r.data.roomInventory.length))
      .catch(() => setRowCount(0));
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (verifyPhotoPreview) URL.revokeObjectURL(verifyPhotoPreview);
    };
  }, [verifyPhotoPreview]);

  function onVerifyPhotoSelected(file: File | undefined) {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      toast.error("Use JPEG, PNG, or WebP images.");
      return;
    }
    setVerifyPhoto(file);
    if (verifyPhotoPreview) URL.revokeObjectURL(verifyPhotoPreview);
    setVerifyPhotoPreview(URL.createObjectURL(file));
  }

  async function submitInventoryCheck() {
    if (!roomId || rowCount === 0) return;
    if (!verifyPhoto) {
      toast.error("Upload a verification photo before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const rowsRes = await api<{
        roomInventory: { id: string; expectedQuantity: number; item: { id: string; name: string } }[];
      }>(`/api/v1/room-inventory?roomId=${roomId}`);
      const rows = rowsRes.data.roomInventory;
      const photoFileId = await uploadInventoryVerificationPhoto(verifyPhoto);
      const { discrepancies } = await submitRoomInventoryVerifications({
        roomId,
        rows,
        foundQty,
        photoFileId,
        notes: verifyNotes.trim() || undefined,
      });
      if (discrepancies > 0) {
        toast.warning(
          `Check submitted with ${discrepancies} discrepancy(ies). Expected quantities were not changed.`,
        );
      } else {
        toast.success("Inventory check submitted — all counts match expected.");
      }
      setVerifyPhoto(null);
      if (verifyPhotoPreview) URL.revokeObjectURL(verifyPhotoPreview);
      setVerifyPhotoPreview(null);
      setVerifyNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Room inventory</h1>
        <p className="mt-1 text-sm text-slate-600">
          Verify items configured for each room. To assign items to rooms, use Inventory → Add or Edit item.
        </p>
      </div>

      <div>
        <Label>Room</Label>
        <select
          className="mt-1 flex h-9 w-full max-w-md rounded-md border px-3 text-sm"
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setFoundQty({});
          }}
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {selectedRoom && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selectedRoom.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <RoomInventoryChecklist
              roomId={roomId}
              foundQty={foundQty}
              onFoundQtyChange={setFoundQty}
            />

            {rowCount > 0 && (
              <div className="space-y-3 rounded-md border bg-slate-50 p-4">
                <h3 className="text-sm font-semibold">Submit inventory check</h3>
                <div>
                  <Label>Verification photo</Label>
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="mt-1"
                    disabled={submitting}
                    onChange={(e) => {
                      onVerifyPhotoSelected(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  {verifyPhotoPreview && (
                    <img
                      src={verifyPhotoPreview}
                      alt="Verification preview"
                      className="mt-2 h-24 rounded border object-cover"
                    />
                  )}
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <Button
                  type="button"
                  disabled={submitting || !verifyPhoto}
                  onClick={() => void submitInventoryCheck()}
                >
                  Submit inventory check
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
