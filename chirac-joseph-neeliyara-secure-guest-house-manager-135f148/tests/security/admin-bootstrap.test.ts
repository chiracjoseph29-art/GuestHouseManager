import { describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/lib/crypto";
import {
  bootstrapAdmin,
  type BootstrapDatabase,
} from "@/server/modules/auth/admin-bootstrap.service";

type FakeUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "ADMIN";
};

function createFakeDatabase(initialUsers: FakeUser[] = []) {
  const users = [...initialUsers];
  const auditLogs: Array<Record<string, unknown>> = [];
  let transactionCalls = 0;

  const database = {
    users,
    auditLogs,
    get transactionCalls() {
      return transactionCalls;
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      transactionCalls += 1;
      return callback({
        user: {
          count: async ({ where }: { where: { role: "ADMIN" } }) =>
            users.filter((user) => user.role === where.role).length,
          create: async ({ data }: { data: Omit<FakeUser, "id"> }) => {
            const user = { ...data, id: `user-${users.length + 1}` };
            users.push(user);
            return { id: user.id };
          },
        },
        auditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            auditLogs.push(data);
          },
        },
      });
    },
  } as unknown as BootstrapDatabase & {
    users: FakeUser[];
    auditLogs: Array<Record<string, unknown>>;
    transactionCalls: number;
  };

  return database;
}

describe("production first-admin bootstrap", () => {
  it("does nothing when bootstrap is disabled", async () => {
    const database = createFakeDatabase();

    await expect(
      bootstrapAdmin(
        {
          ADMIN_MFA_BOOTSTRAP: "false",
          BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
          BOOTSTRAP_ADMIN_PASSWORD: "A strong password 123!",
        },
        database,
      ),
    ).rejects.toThrow("Admin bootstrap is disabled.");
    expect(database.transactionCalls).toBe(0);
    expect(database.users).toHaveLength(0);
  });

  it("creates one active admin with an application password hash and audit event", async () => {
    const database = createFakeDatabase();
    const password = "A strong password 123!";

    const result = await bootstrapAdmin(
      {
        ADMIN_MFA_BOOTSTRAP: "true",
        BOOTSTRAP_ADMIN_EMAIL: " Owner@Example.com ",
        BOOTSTRAP_ADMIN_PASSWORD: password,
      },
      database,
    );

    expect(result.email).toBe("owner@example.com");
    expect(database.users).toHaveLength(1);
    expect(database.users[0]).toMatchObject({
      email: "owner@example.com",
      name: "System Administrator",
      role: "ADMIN",
    });
    expect(await verifyPassword(database.users[0].passwordHash, password)).toBe(true);
    expect(database.auditLogs).toEqual([
      expect.objectContaining({
        userId: null,
        action: "auth.bootstrap_admin.created",
        resourceType: "user",
        result: "SUCCESS",
      }),
    ]);
  });

  it("refuses to run when an admin already exists", async () => {
    const database = createFakeDatabase([
      { id: "existing-admin", email: "existing@example.com", name: "Existing", passwordHash: "hash", role: "ADMIN" },
    ]);

    await expect(
      bootstrapAdmin(
        {
          ADMIN_MFA_BOOTSTRAP: "true",
          BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
          BOOTSTRAP_ADMIN_PASSWORD: "A strong password 123!",
        },
        database,
      ),
    ).rejects.toThrow("An ADMIN user already exists.");
    expect(database.users).toHaveLength(1);
    expect(database.auditLogs).toHaveLength(0);
  });

  it.each([
    { name: "missing email", email: undefined, password: "A strong password 123!" },
    { name: "invalid email", email: "not-an-email", password: "A strong password 123!" },
    { name: "missing password", email: "owner@example.com", password: undefined },
    { name: "short password", email: "owner@example.com", password: "too-short" },
  ])("rejects $name bootstrap credentials", async ({ email, password }) => {
    const database = createFakeDatabase();

    await expect(
      bootstrapAdmin(
        {
          ADMIN_MFA_BOOTSTRAP: "true",
          BOOTSTRAP_ADMIN_EMAIL: email,
          BOOTSTRAP_ADMIN_PASSWORD: password,
        },
        database,
      ),
    ).rejects.toThrow("Bootstrap admin credentials are invalid.");
    expect(database.transactionCalls).toBe(0);
    expect(database.users).toHaveLength(0);
  });

  it("creates no demo data", async () => {
    const database = createFakeDatabase();

    await bootstrapAdmin(
      {
        ADMIN_MFA_BOOTSTRAP: "true",
        BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "A strong password 123!",
      },
      database,
    );

    expect(database.users).toHaveLength(1);
    expect(database.users[0].email).toBe("owner@example.com");
    expect(database.auditLogs).toHaveLength(1);
  });
});