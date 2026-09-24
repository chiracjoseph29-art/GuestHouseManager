import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";
import { generateSecret, generateURI, verify, NobleCryptoPlugin } from "otplib";
import { prisma } from "@/server/db/prisma";
import { isProduction } from "@/server/config/env";
import { generateSecureToken, hashToken, verifyPassword } from "@/server/lib/crypto";
import { ForbiddenError, ValidationError, AuthError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import {
  issueSessionCredentials,
  type SessionCookieAttach,
  type SessionUser,
} from "@/server/modules/auth/session.service";
import type { AuthMeta } from "@/server/modules/auth/auth.service";
import { getEnv } from "@/server/config/env";

const totpCrypto = new NobleCryptoPlugin();

function encryptionKey(): Buffer {
  const secret = process.env.MFA_ENCRYPTION_KEY ?? getEnv().SESSION_SECRET;
  return createHash("sha256").update(secret).digest();
}

export function encryptMfaSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptMfaSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function blockAdminWithoutMfaInProduction(user: Pick<SessionUser, "role" | "mfaEnabled">): void {
  if (user.role !== "ADMIN" || !isProduction()) return;
  if (user.mfaEnabled) return;
  if (process.env.ADMIN_MFA_BOOTSTRAP === "true") return;
  throw new AuthError("Administrator MFA must be enabled before production sign-in.");
}

export function requiresMfaChallenge(user: Pick<SessionUser, "mfaEnabled">): boolean {
  return user.mfaEnabled;
}

async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const result = await verify({
    secret,
    token: token.replace(/\s/g, ""),
    epochTolerance: 1,
    crypto: totpCrypto,
  });
  return result.valid;
}

export async function beginMfaEnrollment(user: SessionUser): Promise<{ otpauthUrl: string; secret: string }> {
  if (user.role !== "ADMIN") throw new ForbiddenError();
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: "GHMS", label: user.email, secret });
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecretEnc: encryptMfaSecret(secret), mfaEnabled: false },
  });
  return { otpauthUrl, secret };
}

export async function confirmMfaEnrollment(user: SessionUser, token: string): Promise<{ recoveryCodes: string[] }> {
  if (user.role !== "ADMIN") throw new ForbiddenError();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.mfaSecretEnc) throw new ValidationError("Enrollment not started.");
  const secret = decryptMfaSecret(dbUser.mfaSecretEnc);
  if (!(await verifyTotp(secret, token))) {
    throw new ValidationError("Invalid verification code.");
  }
  const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(5).toString("hex"));
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId: user.id, codeHash: hashToken(code) })),
    }),
  ]);
  await writeAuditLog({
    userId: user.id,
    action: "auth.mfa.enabled",
    result: "SUCCESS",
  });
  return { recoveryCodes };
}

export async function createMfaLoginChallenge(userId: string, ipAddress?: string): Promise<string> {
  const raw = generateSecureToken(24);
  await prisma.mfaLoginChallenge.create({
    data: {
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 1000 * 60 * 5),
      ipAddress,
    },
  });
  return raw;
}

function verifyRecoveryCode(input: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(input.trim()));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function verifyMfaLogin(
  challengeToken: string,
  totpOrRecovery: string,
  meta: AuthMeta,
): Promise<{ userId: string; sessionAttach: SessionCookieAttach }> {
  const tokenHash = hashToken(challengeToken);
  const challenge = await prisma.mfaLoginChallenge.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!challenge || challenge.user.status !== "ACTIVE") {
    throw new AuthError("Invalid or expired MFA challenge.");
  }

  let valid = false;
  if (challenge.user.mfaSecretEnc) {
    const secret = decryptMfaSecret(challenge.user.mfaSecretEnc);
    valid = await verifyTotp(secret, totpOrRecovery);
  }
  if (!valid) {
    const recoveryRecords = await prisma.mfaRecoveryCode.findMany({
      where: { userId: challenge.userId, usedAt: null },
    });
    const match = recoveryRecords.find((r) => verifyRecoveryCode(totpOrRecovery, r.codeHash));
    if (match) {
      valid = true;
      await prisma.mfaRecoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
    }
  }
  if (!valid) {
    await writeAuditLog({
      userId: challenge.userId,
      action: "auth.mfa.failure",
      result: "FAILURE",
      correlationId: meta.correlationId,
      ipAddress: meta.ipAddress,
    });
    throw new AuthError("Invalid verification code.");
  }

  await prisma.mfaLoginChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
  const sessionAttach = await issueSessionCredentials(challenge.userId, {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    isAdmin: challenge.user.role === "ADMIN",
  });
  await writeAuditLog({
    userId: challenge.userId,
    action: "auth.mfa.success",
    result: "SUCCESS",
    correlationId: meta.correlationId,
    ipAddress: meta.ipAddress,
  });
  return { userId: challenge.userId, sessionAttach };
}

export async function disableMfa(
  user: SessionUser,
  input: { password: string; code: string },
): Promise<void> {
  if (user.role !== "ADMIN") throw new ForbiddenError();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const ok = await verifyPassword(dbUser.passwordHash, input.password);
  if (!ok) throw new AuthError("Invalid email or password.");
  if (!dbUser.mfaSecretEnc) throw new ValidationError("MFA is not enabled.");
  const secret = decryptMfaSecret(dbUser.mfaSecretEnc);
  if (!(await verifyTotp(secret, input.code))) {
    throw new ValidationError("Invalid verification code.");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecretEnc: null },
    }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
  await writeAuditLog({ userId: user.id, action: "auth.mfa.disabled", result: "SUCCESS" });
}
