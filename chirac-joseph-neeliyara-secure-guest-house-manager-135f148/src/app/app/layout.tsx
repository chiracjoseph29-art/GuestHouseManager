"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useRequireAuth } from "@/hooks/use-session";
import { api, clearCsrfCache } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navForRole = (role: string) => {
  const common = [{ href: "/app", label: "Overview" }];
  if (role === "CLEANER") {
    return [
      ...common,
      { href: "/app/cleaning", label: "My tasks" },
      { href: "/app/room-inventory", label: "Room inventory" },
    ];
  }
  return [
    ...common,
    { href: "/app/bookings", label: "Bookings" },
    { href: "/app/customers", label: "Customers" },
    { href: "/app/finance", label: "Finance" },
    { href: "/app/cleaning", label: "Cleaning" },
    { href: "/app/inventory", label: "Inventory" },
    { href: "/app/audit", label: "Audit log" },
    ...(role === "ADMIN"
      ? [
          { href: "/app/room-inventory", label: "Room inventory" },
          { href: "/app/admin", label: "Administration" },
        ]
      : [{ href: "/app/reports", label: "Reports" }]),
  ];
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useRequireAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    clearCsrfCache();
    router.push("/login");
  }

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }
  if (!user) return null;

  const nav = navForRole(user.role);

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              aria-label="Summer House"
              title="Summer House"
              className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c6a76d]/55 bg-[#f4ecdb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            >
              <span className="h-[29px] w-[38px] overflow-hidden" aria-hidden="true">
                <Image
                  src="/summer-house-rose-logo.png"
                  alt=""
                  width={245}
                  height={180}
                  className="h-auto w-full"
                />
              </span>
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#243f37]">SUMMER HOUSE</p>
              <p className="text-[11px] text-[#6a6a55]">MANAGEMENT</p>
              <p className="mt-1 truncate text-xs text-slate-500">{user.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="md:mt-4" onClick={logout}>
            Sign out
          </Button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-slate-100",
                pathname === item.href && "bg-slate-900 text-white hover:bg-slate-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
