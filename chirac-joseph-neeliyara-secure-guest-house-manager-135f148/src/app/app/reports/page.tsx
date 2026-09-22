"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function ReportsPage() {
  const [summary, setSummary] = useState<{ totalPayments: number; totalExpenses: number; activeBookings: number } | null>(
    null,
  );

  useEffect(() => {
    api<{ totalPayments: number; totalExpenses: number; activeBookings: number }>("/api/v1/reports/summary")
      .then((r) => setSummary(r.data))
      .catch(() => toast.error("Financial reports are restricted for your role."));
  }, []);

  if (!summary) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments recorded</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">₹{Number(summary.totalPayments).toLocaleString()}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">₹{Number(summary.totalExpenses).toLocaleString()}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active bookings</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">{summary.activeBookings}</CardContent>
      </Card>
    </div>
  );
}
