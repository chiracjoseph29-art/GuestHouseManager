"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];
const EXPENSE_CATEGORIES = [
  "Electricity",
  "Water",
  "Cleaning supplies",
  "Repairs",
  "Maintenance",
  "Staff payments",
  "Laundry",
  "Food/supplies",
  "Internet",
  "Other",
];
type Period = "today" | "week" | "month" | "last_month" | "custom";

type Overview = {
  period: { label: string };
  summary: {
    income: number;
    expenses: number;
    net: number;
    todayIncome: number;
    todayExpenses: number;
    monthIncome: number;
    monthExpenses: number;
    outstandingBalance: number;
  };
  incomeBreakdown: { label: string; amount: number }[];
  expenseBreakdown: { category: string; amount: number }[];
  payments: {
    id: string;
    amount: number;
    method: string;
    reference?: string | null;
    recordedAt: string;
    bookingReference: string;
    guestName: string;
  }[];
  expenses: {
    id: string;
    category: string;
    amount: number;
    description: string;
    incurredAt: string;
  }[];
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function FinancePage() {
  const { user } = useSession();
  const canManage = user?.role === "ADMIN";
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bookings, setBookings] = useState<{ id: string; reference: string; balance: number }[]>([]);
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    category: EXPENSE_CATEGORIES[0],
    description: "",
    amount: "",
    paymentMethod: "CASH",
    reference: "",
    notes: "",
  });
  const [paymentForm, setPaymentForm] = useState({ bookingId: "", amount: "", method: "CASH", reference: "", notes: "" });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ period });
    if (period === "custom" && customFrom && customTo) {
      params.set("from", new Date(customFrom).toISOString());
      params.set("to", new Date(customTo).toISOString());
    }
    const r = await api<Overview>(`/api/v1/finance/overview?${params}`);
    setData(r.data);
  }, [period, customFrom, customTo]);

  useEffect(() => {
    load().catch(() => toast.error("Unable to load financial overview."));
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api<{ bookings: { id: string; reference: string; balance: string | number }[] }>("/api/v1/bookings")
      .then((b) => setBookings(b.data.bookings.filter((x) => Number(x.balance) > 0).map((x) => ({
        id: x.id,
        reference: x.reference,
        balance: Number(x.balance),
      }))))
      .catch(() => undefined);
  }, [canManage]);

  async function saveExpense() {
    const amount = Number(expenseForm.amount);
    if (!expenseForm.description.trim() || amount <= 0) {
      toast.error("Description and a positive amount are required.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: new Date(expenseForm.date).toISOString(),
          category: expenseForm.category,
          description: expenseForm.description.trim(),
          amount,
          paymentMethod: expenseForm.paymentMethod,
          reference: expenseForm.reference || undefined,
          notes: expenseForm.notes || undefined,
        }),
      });
      toast.success("Expense recorded.");
      setExpenseOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function savePayment() {
    const amount = Number(paymentForm.amount);
    if (!paymentForm.bookingId || amount <= 0) {
      toast.error("Select a booking and enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/payments", {
        method: "POST",
        body: JSON.stringify({
          bookingId: paymentForm.bookingId,
          amount,
          method: paymentForm.method,
          reference: paymentForm.reference || undefined,
          notes: paymentForm.notes || undefined,
        }),
      });
      toast.success("Payment recorded.");
      setPaymentOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed.");
    } finally {
      setSaving(false);
    }
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Finance</h1>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPaymentOpen(true)}>Record income</Button>
            <Button onClick={() => setExpenseOpen(true)}>+ Add expense</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["today", "week", "month", "last_month", "custom"] as Period[]).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
            {p === "last_month" ? "Last month" : p === "custom" ? "Custom" : p.charAt(0).toUpperCase() + p.slice(1)}
          </Button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          <Button size="sm" onClick={() => void load()}>Apply</Button>
        </div>
      )}

      {s && (
        <>
          <p className="text-sm text-slate-600">{data?.period.label}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardHeader><CardTitle className="text-base">Income</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{fmt(s.income)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Expenses</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{fmt(s.expenses)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Net cash flow</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{fmt(s.net)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Outstanding</CardTitle></CardHeader><CardContent className="text-xl font-semibold">{fmt(s.outstandingBalance)}</CardContent></Card>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <p>Today income: <strong>{fmt(s.todayIncome)}</strong></p>
            <p>Today expenses: <strong>{fmt(s.todayExpenses)}</strong></p>
            <p>This month income: <strong>{fmt(s.monthIncome)}</strong></p>
            <p>This month expenses: <strong>{fmt(s.monthExpenses)}</strong></p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Income</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data?.incomeBreakdown.map((row) => (
                  <div key={row.label} className="flex justify-between border-b pb-1">
                    <span>{row.label}</span><span>{fmt(row.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-1">
                  <span>Total income</span><span>{fmt(s.income)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Expenses</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data?.expenseBreakdown.length === 0 && <p className="text-slate-500">No expenses in this period.</p>}
                {data?.expenseBreakdown.map((row) => (
                  <div key={row.category} className="flex justify-between border-b pb-1">
                    <span>{row.category}</span><span>{fmt(row.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-1">
                  <span>Total expenses</span><span>{fmt(s.expenses)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium">Income transactions</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDate(p.recordedAt)}</TableCell>
                    <TableCell>{p.guestName}</TableCell>
                    <TableCell>{p.bookingReference}</TableCell>
                    <TableCell>{p.method}</TableCell>
                    <TableCell>{p.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium">Expense transactions</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{fmtDate(e.incurredAt)}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right">{fmt(e.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>Date</Label><Input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div>
              <Label>Category</Label>
              <select className="flex h-9 w-full rounded-md border px-3 text-sm" value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label>Description</Label><Input value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div><Label>Amount</Label><Input type="number" min={0} step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div>
              <Label>Payment method</Label>
              <select className="flex h-9 w-full rounded-md border px-3 text-sm" value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm((f) => ({ ...f, paymentMethod: e.target.value }))}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Reference</Label><Input value={expenseForm.reference} onChange={(e) => setExpenseForm((f) => ({ ...f, reference: e.target.value }))} /></div>
            <div><Label>Notes</Label><Input value={expenseForm.notes} onChange={(e) => setExpenseForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void saveExpense()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record booking payment</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label>Booking</Label>
              <select className="flex h-9 w-full rounded-md border px-3 text-sm" value={paymentForm.bookingId} onChange={(e) => setPaymentForm((f) => ({ ...f, bookingId: e.target.value }))}>
                <option value="">Select…</option>
                {bookings.map((b) => <option key={b.id} value={b.id}>{b.reference} (due {fmt(b.balance)})</option>)}
              </select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))} /></div>
            <div>
              <Label>Method</Label>
              <select className="flex h-9 w-full rounded-md border px-3 text-sm" value={paymentForm.method} onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div><Label>Reference</Label><Input value={paymentForm.reference} onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void savePayment()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
