"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type UserRow = { id: string; email: string; name: string; role: string; status: string; canViewFinancials?: boolean };

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MANAGER" | "CLEANER">("MANAGER");
  const [password, setPassword] = useState("");
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [creating, setCreating] = useState(false);

  function loadUsers() {
    return api<{ users: UserRow[] }>("/api/v1/users").then((r) => setUsers(r.data.users));
  }

  useEffect(() => {
    loadUsers().catch(() => toast.error("Admin access required."));
  }, []);

  async function handleCreateStaff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      await api<{ id: string }>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          password,
          ...(role === "MANAGER" ? { canViewFinancials } : {}),
        }),
      });
      toast.success("Staff account created.");
      setName("");
      setEmail("");
      setPassword("");
      setCanViewFinancials(false);
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create staff account.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <p className="text-sm text-slate-600">Manage staff accounts, rooms, and review system access.</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/admin/rooms" className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-slate-50">
          Rooms
        </Link>
      </div>
      <section className="max-w-2xl space-y-4 border-y py-5">
        <h2 className="text-lg font-semibold">Add Staff Account</h2>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleCreateStaff}>
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <Input autoComplete="name" maxLength={200} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <Input type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Role
            <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={role} onChange={(event) => setRole(event.target.value as "MANAGER" | "CLEANER")}>
              <option value="MANAGER">Manager</option>
              <option value="CLEANER">Cleaner</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Temporary password
            <Input type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {role === "MANAGER" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={canViewFinancials} onChange={(event) => setCanViewFinancials(event.target.checked)} />
              Allow this manager to view financial information
            </label>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating account..." : "Create staff account"}
            </Button>
          </div>
        </form>
      </section>
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
