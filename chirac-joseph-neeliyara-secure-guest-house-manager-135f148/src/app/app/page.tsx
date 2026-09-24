"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Overview = {
  role: string;
  bookings?: {
    todayCount: number;
    checkInsToday: number;
    checkOutsToday: number;
    occupiedRooms: number;
    availableRooms: number;
    recent: { reference: string; guestName: string; status: string }[];
  };
  cleaning?: {
    roomsNeedingCleaning: number;
    awaitingVerification: number;
    completedToday: number;
    recent: { roomName: string; status: string; assignee: string | null }[];
  };
  finance?: {
    todayRevenue: number;
    monthRevenue: number;
    monthExpenses: number;
    netCashFlowMonth: number;
    outstandingBalance: number;
    recentPayments: { amount: number; guestName: string; bookingReference: string }[];
  };
  inventory?: {
    itemsNeedingAttention: number;
    openDiscrepancies: number;
  };
};

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function AppOverviewPage() {
  const { user } = useSession();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    if (!user) return;
    api<Overview>("/api/v1/operations/overview")
      .then((r) => setData(r.data))
      .catch(() => {
        /* keep existing cards empty on error */
      });
  }, [user]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operations overview</h1>
        <p className="text-sm text-slate-600">Role: {user.role}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.bookings && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Today&apos;s bookings</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.bookings.todayCount}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Check-ins today</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.bookings.checkInsToday}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Check-outs today</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.bookings.checkOutsToday}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Occupied rooms</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.bookings.occupiedRooms}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Available rooms</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.bookings.availableRooms}</CardContent>
            </Card>
          </>
        )}

        {data?.cleaning && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Rooms needing cleaning</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.cleaning.roomsNeedingCleaning}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Awaiting verification</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.cleaning.awaitingVerification}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Cleaning completed today</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.cleaning.completedToday}</CardContent>
            </Card>
          </>
        )}

        {data?.finance && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Today&apos;s revenue</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(data.finance.todayRevenue)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">This month revenue</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(data.finance.monthRevenue)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">This month expenses</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(data.finance.monthExpenses)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Net cash flow (month)</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(data.finance.netCashFlowMonth)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Outstanding balances</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{fmt(data.finance.outstandingBalance)}</CardContent>
            </Card>
          </>
        )}

        {data?.inventory && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Inventory low / attention</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.inventory.itemsNeedingAttention}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Inventory discrepancies</CardTitle></CardHeader>
              <CardContent className="text-3xl font-semibold">{data.inventory.openDiscrepancies}</CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">Server-side RBAC</Badge>
            <p className="mt-2 text-xs text-slate-500">Authorization is enforced on every API request.</p>
          </CardContent>
        </Card>
      </div>

      {data?.bookings?.recent && data.bookings.recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent bookings</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.bookings.recent.map((b) => (
              <div key={b.reference} className="flex justify-between border-b pb-1">
                <span>{b.reference} — {b.guestName}</span>
                <span className="text-slate-500">{b.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.finance?.recentPayments && data.finance.recentPayments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent payments</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.finance.recentPayments.map((p, i) => (
              <div key={i} className="flex justify-between border-b pb-1">
                <span>{p.bookingReference} — {p.guestName}</span>
                <span>{fmt(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data?.cleaning?.recent && data.cleaning.recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent cleaning activity</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.cleaning.recent.map((t) => (
              <div key={t.roomName + t.status} className="flex justify-between border-b pb-1">
                <span>{t.roomName}</span>
                <span className="text-slate-500">{t.status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
