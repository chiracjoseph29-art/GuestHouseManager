"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AppOverviewPage() {
  const { user } = useSession();
  const [stats, setStats] = useState<{ bookings?: number; tasks?: number; lowStock?: number }>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        if (user.role === "CLEANER") {
          const t = await api<{ tasks: unknown[] }>("/api/v1/cleaning/tasks");
          setStats({ tasks: t.data.tasks.length });
        } else {
          const b = await api<{ bookings: unknown[] }>("/api/v1/bookings");
          const c = await api<{ tasks: unknown[] }>("/api/v1/cleaning/tasks");
          setStats({ bookings: b.data.bookings.length, tasks: c.data.tasks.length });
        }
      } catch {
        /* ignore dashboard errors */
      }
    })();
  }, [user]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operations overview</h1>
        <p className="text-sm text-slate-600">Role: {user.role}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.bookings !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent bookings</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{stats.bookings}</CardContent>
          </Card>
        )}
        {stats.tasks !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cleaning tasks</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{stats.tasks}</CardContent>
          </Card>
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
    </div>
  );
}
