"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — finance overview lives at /app/finance */
export default function PaymentsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/finance");
  }, [router]);
  return <p className="text-sm text-slate-500">Redirecting to Finance…</p>;
}
