"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Profile = {
  guest: {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    notes?: string | null;
  };
  stats: {
    stayCount: number;
    totalPaid: number;
    outstanding: number;
    bookingValue: number;
    avgBookingValue: number;
    lastStay: string | null;
    firstStay: string | null;
  };
  bookings: {
    reference: string;
    roomNames: string;
    checkIn: string;
    checkOut: string;
    amountTotal: number;
    amountPaid: number;
    balance: number;
  }[];
  payments: {
    recordedAt: string;
    bookingReference: string;
    amount: number;
    method: string;
    reference?: string | null;
  }[];
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<Profile>(`/api/v1/guests?id=${id}`)
      .then((r) => setProfile(r.data))
      .catch(() => toast.error("Unable to load customer."));
  }, [id]);

  async function confirmDeleteCustomer() {
    setDeleting(true);
    try {
      await api(`/api/v1/guests?id=${id}`, { method: "DELETE" });
      toast.success("Customer deleted.");
      setDeleteOpen(false);
      router.push("/app/customers");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete customer.");
    } finally {
      setDeleting(false);
    }
  }

  if (!profile) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const { guest, stats } = profile;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href="/app/customers" className="text-sm text-slate-500 hover:underline">← Customers</Link>
        {isAdmin && (
          <Button type="button" variant="outline" className="text-red-700" onClick={() => setDeleteOpen(true)}>
            Delete customer
          </Button>
        )}
      </div>
      <h1 className="text-2xl font-semibold">{guest.fullName}</h1>
      <div className="text-sm text-slate-600 space-y-1">
        {guest.phone && <p>Phone: {guest.phone}</p>}
        {guest.email && <p>Email: {guest.email}</p>}
        {guest.address && <p>Address: {guest.address}</p>}
        {(guest.idType || guest.idNumber) && (
          <p>ID: {[guest.idType, guest.idNumber].filter(Boolean).join(" — ")}</p>
        )}
        {guest.notes && <p>Notes: {guest.notes}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <p>Total stays: <strong>{stats.stayCount}</strong></p>
        <p>Total paid: <strong>{fmt(stats.totalPaid)}</strong></p>
        <p>Outstanding: <strong>{fmt(stats.outstanding)}</strong></p>
        <p>Avg booking value: <strong>{fmt(stats.avgBookingValue)}</strong></p>
        <p>Booking value (all): <strong>{fmt(stats.bookingValue)}</strong></p>
        <p>First stay: <strong>{stats.firstStay ? fmtDate(stats.firstStay) : "—"}</strong></p>
        <p>Last stay: <strong>{stats.lastStay ? fmtDate(stats.lastStay) : "—"}</strong></p>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Booking history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profile.bookings.map((b) => (
              <TableRow key={b.reference}>
                <TableCell>{b.reference}</TableCell>
                <TableCell>{b.roomNames}</TableCell>
                <TableCell>{fmtDate(b.checkIn)}</TableCell>
                <TableCell>{fmtDate(b.checkOut)}</TableCell>
                <TableCell>{fmt(b.amountTotal)}</TableCell>
                <TableCell>{fmt(b.amountPaid)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Payment history</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profile.payments.map((p, i) => (
              <TableRow key={`${p.recordedAt}-${i}`}>
                <TableCell>{fmtDate(p.recordedAt)}</TableCell>
                <TableCell>{p.bookingReference}</TableCell>
                <TableCell>{p.method}</TableCell>
                <TableCell>{p.reference ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(p.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete customer ${guest.fullName}?`}
        description={
          <>
            <p>This permanently removes this customer record. This cannot be undone.</p>
            {guest.phone && <p>Phone: {guest.phone}</p>}
            {guest.email && <p>Email: {guest.email}</p>}
            {stats.stayCount > 0 && (
              <p className="font-medium text-amber-900">
                This customer has {stats.stayCount} booking(s). Delete those bookings first.
              </p>
            )}
          </>
        }
        loading={deleting}
        onConfirm={confirmDeleteCustomer}
      />
    </div>
  );
}
