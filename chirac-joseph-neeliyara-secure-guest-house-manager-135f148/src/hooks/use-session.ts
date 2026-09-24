"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe, type SessionUser } from "@/lib/api-client";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    fetchMe().then(setUser);
  }, []);

  return { user, setUser };
}

/** Redirect to login (or app) after session is resolved — never during render. */
export function useRequireAuth(allowed?: SessionUser["role"][]) {
  const { user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (allowed && !allowed.includes(user.role)) {
      router.replace("/app");
    }
  }, [user, allowed, router]);

  return { user };
}
