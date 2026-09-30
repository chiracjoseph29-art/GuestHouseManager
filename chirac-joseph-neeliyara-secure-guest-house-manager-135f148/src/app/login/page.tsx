"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api, clearCsrfCache, ensureCsrf, fetchMe } from "@/lib/api-client";
import { readLoginFormValues } from "@/lib/login-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
        toast.error("We couldn't complete sign-in. Please try again.");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't sign you in. Check your details and try again.");
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
        toast.error("We couldn't complete sign-in. Please try again.");
        return;
      }
      router.replace("/app");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't verify your code. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-[100svh] overflow-hidden bg-[#f6f0e5] px-4 py-6 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.78fr)] lg:px-10 lg:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden lg:inset-y-0 lg:left-0 lg:right-[27%]"
      >
        <Image
          src="/summer-house-login-background.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 73vw, 100vw"
          className="object-cover object-[53%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(39,47,38,0.03)_0%,rgba(15,43,47,0.2)_100%),linear-gradient(90deg,transparent_55%,rgba(246,240,229,0.2)_100%)] lg:bg-[linear-gradient(90deg,transparent_63%,#f6f0e5_100%),linear-gradient(180deg,rgba(39,47,38,0.02)_0%,rgba(15,43,47,0.22)_100%)]" />
      </div>
      <section className="relative z-10 mx-auto grid w-full max-w-[520px] place-items-center lg:col-start-2 lg:col-end-3 lg:mx-0 lg:ml-auto lg:mr-[clamp(0px,5vw,76px)] lg:min-h-[calc(100svh-4rem)]">
        <Card className="w-full rounded-[26px] border border-white/70 bg-[#fbf8f1] shadow-[0_32px_90px_-44px_rgba(8,31,37,0.7)]">
          <CardHeader className="items-center gap-3 px-7 pt-8 text-center sm:px-10 sm:pt-10">
            <div className="mx-auto mb-1 h-[84px] w-[132px] overflow-hidden" aria-hidden="true">
              <Image
                src="/summer-house-rose-logo.png"
                alt=""
                width={245}
                height={180}
                className="h-auto w-full"
                priority
              />
            </div>
            <div className="space-y-1 text-[#243f37]">
              <CardTitle className="font-serif text-[25px] font-medium leading-tight tracking-normal text-[#243f37]">
                SUMMER HOUSE
              </CardTitle>
              <p className="font-serif text-[17px] leading-tight text-[#6a6a55]">
                MANAGEMENT
              </p>
              <CardDescription className="pt-2 text-sm text-[#777464]">
                Comfortable Stays. Happier Guests.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-7 pb-8 pt-5 sm:px-10 sm:pb-10">
            {mfaChallenge ? (
              <form className="space-y-5" onSubmit={onMfaSubmit}>
                <div className="space-y-2.5">
                  <Label htmlFor="mfa" className="text-[#394b41]">
                    Authenticator code
                  </Label>
                  <Input
                    id="mfa"
                    name="mfa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-describedby="mfa-description"
                    disabled={loading}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                  />
                  <p id="mfa-description" className="text-xs text-[#777464]">
                    Enter the code from your authenticator app.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full bg-[#315a45] text-white hover:bg-[#264a38]"
                  disabled={loading}
                >
                  {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                  {loading ? "Verifying..." : "Verify and continue"}
                </Button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={onSubmit}>
                <div className="space-y-2.5">
                  <Label htmlFor="email" className="text-[#394b41]">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="h-11 rounded-lg border-[#d8d2c5] bg-white px-3 focus-visible:border-[#58745c] focus-visible:ring-[#58745c]/20"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                    required
                  />
                </div>
                <div className="space-y-2.5">
                  <Label htmlFor="password" className="text-[#394b41]">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      className="h-11 rounded-lg border-[#d8d2c5] bg-white px-3 pe-11 focus-visible:border-[#58745c] focus-visible:ring-[#58745c]/20"
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute end-1 top-1/2 -translate-y-1/2 text-[#777464] hover:text-[#243f37]"
                      aria-label={passwordVisible ? "Hide password" : "Show password"}
                      aria-pressed={passwordVisible}
                      aria-controls="password"
                      disabled={loading}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full bg-[#315a45] text-white hover:bg-[#264a38]"
                  disabled={loading}
                >
                  {loading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            )}
            <div className="mt-7 border-t border-slate-100 pt-5 text-center">
              <p className="text-xs text-[#928c7c]">Staff access</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
