"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Log = {
  id: string;
  action: string;
  result: string;
  createdAt: string;
  user?: { email: string };
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    api<{ logs: Log[] }>("/api/v1/audit")
      .then((r) => setLogs(r.data.logs))
      .catch(() => toast.error("Unable to load audit log."));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-slate-600">Append-only operational history (administration cannot edit entries).</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-xs">{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell className="font-mono text-xs">{log.action}</TableCell>
              <TableCell className="text-xs">{log.user?.email ?? "—"}</TableCell>
              <TableCell className="text-xs">{log.result}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
