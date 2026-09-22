"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearCsrfCache, ensureCsrf } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@guesthouse.local");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await ensureCsrf();
      const loginRes = await api<{ status: string; challengeToken?: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (loginRes.data.status === "mfa_required" && loginRes.data.challengeToken) {
        setMfaChallenge(loginRes.data.challengeToken);
        toast.message("Enter your authenticator code.");
        return;
      }
      clearCsrfCache();
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaChallenge) return;
    setLoading(true);
    try {
      await api("/api/v1/auth/mfa", {
        method: "POST",
        body: JSON.stringify({ challengeToken: mfaChallenge, code: mfaCode }),
      });
      clearCsrfCache();
      router.push("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle>Guest House Management</CardTitle>
          <CardDescription>Sign in to manage bookings, cleaning, and inventory.</CardDescription>
        </CardHeader>
        <CardContent>
          {mfaChallenge ? (
            <form className="space-y-4" onSubmit={onMfaSubmit}>
              <div className="space-y-2">
                <Label htmlFor="mfa">Authentication code</Label>
                <Input
                  id="mfa"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Verify
              </Button>
            </form>
          ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Demo seed accounts are documented in README. Change all default passwords before production use.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
