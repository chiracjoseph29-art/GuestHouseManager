"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type UserRow = { id: string; email: string; name: string; role: string; status: string };

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    api<{ users: UserRow[] }>("/api/v1/users")
      .then((r) => setUsers(r.data.users))
      .catch(() => toast.error("Admin access required."));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="text-sm text-slate-600">Manage staff accounts and review system access.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.name}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
