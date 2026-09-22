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

  const requireAuth = (allowed?: SessionUser["role"][]) => {
    if (user === undefined) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (allowed && !allowed.includes(user.role)) {
      router.replace("/app");
    }
  };

  return { user, setUser, requireAuth };
}
