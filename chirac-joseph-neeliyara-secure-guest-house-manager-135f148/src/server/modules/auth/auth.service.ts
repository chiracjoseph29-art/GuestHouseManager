import { prisma } from "@/server/db/prisma";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "@/server/lib/crypto";
import { AppError, AuthError, ValidationError } from "@/server/lib/errors";
import { writeAuditLog } from "@/server/modules/audit/audit.service";
import {
  issueSessionCredentials,
  revokeSessionByToken,
  type SessionCookieAttach,
} from "@/server/modules/auth/session.service";
import { getEnv } from "@/server/config/env";
import type { UserRole } from "@/generated/prisma/client";
import { getRateLimiter, consumeRateLimit } from "@/server/lib/rate-limit";
import { assertNotDemoAccountInProduction } from "@/server/lib/demo-guard";
import {
  blockAdminWithoutMfaInProduction,
  createMfaLoginChallenge,
  requiresMfaChallenge,
} from "@/server/modules/auth/mfa.service";

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export type AuthMeta = {
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

export type LoginResult =
  | { status: "session"; userId: string; sessionAttach: SessionCookieAttach }
  | { status: "mfa_required"; challengeToken: string; userId: string };

export type LoginClientDiag = {
  emailLength?: number;
  passwordLength?: number;
  passwordHadWhitespace?: boolean;
  emailHadWhitespace?: boolean;
  emailStateMatchesDom?: boolean;
  passwordStateMatchesDom?: boolean;
};

async function logLoginDiag(
  payload: Record<string, string | number | boolean | null | undefined>,
): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const { logger } = await import("@/server/lib/logger");
  const { databaseHostLabel } = await import("@/server/lib/auth-flow-log");
  logger.info(
    {
      authFlow: "login.diag",
      dbHost: databaseHostLabel(),
      nodeEnv: process.env.NODE_ENV,
      ...payload,
    },
    "auth.flow",
  );
}

export async function login(
  email: string,
  password: string,
  meta: AuthMeta,
  clientDiag?: LoginClientDiag,
): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  // Passwords may pick up trailing whitespace from mobile keyboards / autofill paste.
  const normalizedPassword = password.trim();
  assertNotDemoAccountInProduction(normalizedEmail);

  const { emailFingerprint, databaseHostLabel } = await import("@/server/lib/auth-flow-log");
  const emailFp = emailFingerprint(normalizedEmail);

  const env = getEnv();
  const loginLimiter = await getRateLimiter(
    "login",
    env.RATE_LIMIT_LOGIN_MAX,
    Math.floor(env.RATE_LIMIT_LOGIN_WINDOW_MS / 1000),
  );
  const rateLimitKey = `${meta.ipAddress ?? "unknown"}:${normalizedEmail}`;
  try {
    await consumeRateLimit(rateLimitKey, loginLimiter);
  } catch (err) {
    await logLoginDiag({
      step: "rate_limited",
      emailFp,
      rateLimitKeyScope: "ip+email",
      dbHost: databaseHostLabel(),
    });
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const genericFail = async (reason: string) => {
    await logLoginDiag({
      step: "auth_failed",
      reason,
      emailFp,
      emailLength: email.length,
      emailTrimmedLength: normalizedEmail.length,
      emailHadWhitespace: email !== email.trim(),
      passwordLength: password.length,
      passwordTrimmedLength: normalizedPassword.length,
      passwordHadWhitespace: password !== password.trim(),
      passwordTrimChanged: password !== normalizedPassword,
      userFound: Boolean(user),
      userActive: user?.status === "ACTIVE",
      passwordVerificationAttempted: reason === "password_mismatch",
      passwordVerificationSucceeded: false,
      emailStateMatchesDom: clientDiag?.emailStateMatchesDom,
      passwordStateMatchesDom: clientDiag?.passwordStateMatchesDom,
      clientPasswordLength: clientDiag?.passwordLength,
      clientReportedPasswordWhitespace: clientDiag?.passwordHadWhitespace,
      dbHost: databaseHostLabel(),
    });
    void writeAuditLog({
      userId: user?.id,
      action: "auth.login.failure",
      result: "FAILURE",
      correlationId: meta.correlationId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    throw new AuthError("Invalid email or password.");
  };

  if (!user) {
    await genericFail("user_not_found");
  }

  if (user!.status !== "ACTIVE") {
    await genericFail("user_inactive");
  }

  if (user!.lockedUntil && user!.lockedUntil > new Date()) {
    throw new AppError("Too many attempts. Please try again later.", 429, "RATE_LIMITED", true);
  }

  const valid = await verifyPassword(user!.passwordHash, normalizedPassword);
  if (!valid) {
    const attempts = user!.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user!.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS) : null,
      },
    });
    await genericFail("password_mismatch");
  }

  await logLoginDiag({
    step: "auth_ok",
    emailFp,
    userFound: true,
    userActive: true,
    passwordVerificationAttempted: true,
    passwordVerificationSucceeded: true,
    passwordHadWhitespace: password !== password.trim(),
    emailStateMatchesDom: clientDiag?.emailStateMatchesDom,
    passwordStateMatchesDom: clientDiag?.passwordStateMatchesDom,
    dbHost: databaseHostLabel(),
  });

  await prisma.user.update({
    where: { id: user!.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  const sessionUser = {
    id: user!.id,
    email: user!.email,
    name: user!.name,
    role: user!.role,
    status: user!.status,
    canViewFinancials: user!.canViewFinancials,
    mfaEnabled: user!.mfaEnabled,
  };

  blockAdminWithoutMfaInProduction(sessionUser);

  if (requiresMfaChallenge(sessionUser)) {
    if (!user!.mfaSecretEnc) {
      throw new AuthError("MFA is enabled but not configured.");
    }
    const challengeToken = await createMfaLoginChallenge(user!.id, meta.ipAddress);
    await writeAuditLog({
      userId: user!.id,
      action: "auth.login.mfa_challenge",
      result: "SUCCESS",
      correlationId: meta.correlationId,
      ipAddress: meta.ipAddress,
    });
    return { status: "mfa_required", challengeToken, userId: user!.id };
  }

  const sessionAttach = await issueSessionCredentials(user!.id, {
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    isAdmin: user!.role === "ADMIN",
  });

  await writeAuditLog({
    userId: user!.id,
    action: "auth.login.success",
    result: "SUCCESS",
    correlationId: meta.correlationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { status: "session", userId: user!.id, sessionAttach };
}

export async function logout(rawToken: string | null, meta: AuthMeta & { userId?: string }): Promise<void> {
  if (rawToken) {
    await revokeSessionByToken(rawToken);
  }
  await writeAuditLog({
    userId: meta.userId,
    action: "auth.logout",
    result: "SUCCESS",
    correlationId: meta.correlationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function requestPasswordReset(email: string, meta: AuthMeta): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const resetLimiter = await getRateLimiter("password_reset", 5, 900);
  await consumeRateLimit(`${meta.ipAddress ?? "unknown"}:reset`, resetLimiter);

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || user.status !== "ACTIVE") {
    return;
  }

  const rawToken = generateSecureToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  await writeAuditLog({
    userId: user.id,
    action: "auth.password_reset.requested",
    result: "SUCCESS",
    correlationId: meta.correlationId,
    ipAddress: meta.ipAddress,
    metadata: { delivery: "secure_channel_required" },
  });

  if (process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_RESET_TOKEN_LOG === "true") {
    console.info("[DEV ONLY] Password reset token issued.");
  }
}

export async function completePasswordReset(
  token: string,
  newPassword: string,
  meta: AuthMeta,
): Promise<void> {
  if (newPassword.length < 12) {
    throw new ValidationError("Password must be at least 12 characters.");
  }

  const tokenHash = hashToken(token);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) {
    throw new ValidationError("Invalid or expired reset link.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await writeAuditLog({
    userId: record.userId,
    action: "auth.password_reset.completed",
    result: "SUCCESS",
    correlationId: meta.correlationId,
    ipAddress: meta.ipAddress,
  });
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  canViewFinancials?: boolean;
  createdById: string;
}): Promise<{ id: string }> {
  if (input.password.length < 12) {
    throw new ValidationError("Password must be at least 12 characters.");
  }
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash,
      role: input.role,
      status: "ACTIVE",
      canViewFinancials: input.canViewFinancials ?? false,
      createdById: input.createdById,
      passwordChangedAt: new Date(),
    },
    select: { id: true },
  });
  return user;
}
