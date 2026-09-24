"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearCsrfCache, ensureCsrf, fetchMe } from "@/lib/api-client";
import { readLoginFormValues } from "@/lib/login-form";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      // Prefer live DOM values — iOS Safari / Keychain often fill inputs without syncing React state.
      const { email: submitEmail, password: submitPassword, diag } = readLoginFormValues(
        e.currentTarget,
        email,
        password,
      );
      setEmail(submitEmail);
      setPassword(submitPassword);

      await ensureCsrf();
      const loginRes = await api<{
        status: string;
        challengeToken?: string;
        bootstrapToken?: string;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: submitEmail,
          password: submitPassword,
          clientDiag: diag,
        }),
      });
      if (loginRes.data.status === "mfa_required" && loginRes.data.challengeToken) {
        setMfaChallenge(loginRes.data.challengeToken);
        toast.message("Enter your authenticator code.");
        return;
      }
      clearCsrfCache();
      const me = await fetchMe();
      if (!me) {
        if (loginRes.data.bootstrapToken) {
          // Top-level navigation: iOS Safari often ignores Set-Cookie from fetch on http://<LAN-IP>.
          window.location.assign(
            `/api/v1/auth/bootstrap?t=${encodeURIComponent(loginRes.data.bootstrapToken)}`,
          );
          return;
        }
        toast.error("Sign-in succeeded but the session cookie was not saved. Try again or check browser cookie settings.");
        return;
      }
      router.replace("/app");
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
      const mfaRes = await api<{ userId: string; bootstrapToken?: string }>("/api/v1/auth/mfa", {
        method: "POST",
        body: JSON.stringify({ challengeToken: mfaChallenge, code: mfaCode }),
      });
      clearCsrfCache();
      const me = await fetchMe();
      if (!me) {
        if (mfaRes.data.bootstrapToken) {
          window.location.assign(
            `/api/v1/auth/bootstrap?t=${encodeURIComponent(mfaRes.data.bootstrapToken)}`,
          );
          return;
        }
        toast.error("Verification succeeded but the session cookie was not saved.");
        return;
      }
      router.replace("/app");
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
          <form className="space-y-4" method="post" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
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
