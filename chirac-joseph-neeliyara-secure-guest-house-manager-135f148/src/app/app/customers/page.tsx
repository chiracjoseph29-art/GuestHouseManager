"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiRequestError } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

type Customer = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  stayCount: number;
  totalSpent: number;
  outstanding: number;
  lastStay: string | null;
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

const emptyForm = () => ({
  fullName: "",
  phone: "",
  email: "",
  address: "",
  idType: "",
  idNumber: "",
  notes: "",
});

export default function CustomersPage() {
  const router = useRouter();
  const { user } = useSession();
  const canCreate = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [existingConflictId, setExistingConflictId] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const r = await api<{ customers: Customer[] }>(`/api/v1/guests${params}`);
      setCustomers(r.data.customers);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCustomer() {
    if (!form.fullName.trim() || !form.phone.trim()) {
      toast.error("Full name and phone are required.");
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ guest: { id: string } }>("/api/v1/guests", {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
          idType: form.idType.trim() || undefined,
          idNumber: form.idNumber.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      toast.success("Customer added.");
      setOpen(false);
      setForm(emptyForm());
      await load();
      router.push(`/app/customers/${r.data.guest.id}`);
    } catch (e) {
      if (e instanceof ApiRequestError && e.details?.existingGuestId) {
        setExistingConflictId(String(e.details.existingGuestId));
        toast.error(e.message);
      } else {
        toast.error(e instanceof Error ? e.message : "Could not save customer.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Customers</h1>
        {canCreate && (
          <Button
            type="button"
            onClick={() => {
              setExistingConflictId(null);
              setForm(emptyForm());
              setOpen(true);
            }}
          >
            + Add Customer
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-600">Search by name, phone, or email.</p>
      <div className="flex max-w-md gap-2">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load(search)}
        />
        <button type="button" className="rounded-md border px-3 text-sm" onClick={() => void load(search)}>
          Search
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {customers.map((c) => (
            <Link key={c.id} href={`/app/customers/${c.id}`}>
              <Card className="transition hover:border-slate-400">
                <CardHeader>
                  <CardTitle className="text-base">{c.fullName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-slate-600">
                  {c.phone && <p>Phone: {c.phone}</p>}
                  {c.email && <p>Email: {c.email}</p>}
                  <p>Stays: {c.stayCount}</p>
                  <p>Total spent: {fmt(c.totalSpent)}</p>
                  <p>Outstanding: {fmt(c.outstanding)}</p>
                  <p>Last stay: {c.lastStay ? new Date(c.lastStay).toLocaleDateString("en-IN") : "—"}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {existingConflictId && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-medium">Customer already exists. Use the existing customer instead.</p>
                <Link
                  href={`/app/customers/${existingConflictId}`}
                  className="mt-2 inline-flex text-sm font-medium text-slate-900 underline"
                >
                  Open existing customer
                </Link>
              </div>
            )}
            <div>
              <Label>Full name</Label>
              <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Address (optional)</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>ID type (optional)</Label>
                <Input value={form.idType} onChange={(e) => setForm((f) => ({ ...f, idType: e.target.value }))} />
              </div>
              <div>
                <Label>ID number (optional)</Label>
                <Input value={form.idNumber} onChange={(e) => setForm((f) => ({ ...f, idNumber: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saving} onClick={() => void saveCustomer()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
