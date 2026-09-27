import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, ConflictError, ValidationError } from "@/server/lib/errors";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    roomType: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    room: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/modules/audit/audit.service", () => ({ writeAuditLog: vi.fn() }));

import { createBooking } from "@/server/modules/bookings/booking.service";
import { createRoom, createRoomType, deleteRoomType, updateRoomType } from "@/server/modules/rooms/room.service";
import { assertPermission } from "@/server/rbac/authorize";
import { PERMISSIONS } from "@/server/rbac/permissions";

const admin = {
  id: "admin-id",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  canViewFinancials: true,
  mfaEnabled: true,
};

const manager = { ...admin, id: "manager-id", role: "MANAGER" as const };
const cleaner = { ...admin, id: "cleaner-id", role: "CLEANER" as const };

describe("Room Type setup workflow", () => {
  const types: Array<Record<string, unknown>> = [];
  const rooms: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    types.length = 0;
    rooms.length = 0;

    prismaMock.roomType.findUnique.mockImplementation(async ({ where }: { where: { id?: string; name?: string } }) =>
      types.find((type) => (where.id ? type.id === where.id : type.name === where.name)) ?? null,
    );
    prismaMock.roomType.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const type = { ...data, id: `type-${types.length + 1}` };
      types.push(type);
      return type;
    });
    prismaMock.roomType.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const type = types.find((candidate) => candidate.id === where.id)!;
      Object.assign(type, data);
      return type;
    });
    prismaMock.room.count.mockImplementation(async ({ where }: { where: { roomTypeId?: string; isActive?: boolean } }) => {
      if (where.roomTypeId) return rooms.filter((room) => room.roomTypeId === where.roomTypeId).length;
      if (where.isActive === false) return 0;
      return 0;
    });
    prismaMock.room.findUnique.mockImplementation(async ({ where }: { where: { id?: string; name?: string } }) =>
      rooms.find((room) => (where.id ? room.id === where.id : room.name === where.name)) ?? null,
    );
    prismaMock.room.findMany.mockImplementation(async ({ where }: { where: { id?: { in: string[] } } }) =>
      rooms
        .filter((room) => !where.id || where.id.in.includes(String(room.id)))
        .map((room) => ({ ...room, roomType: types.find((type) => type.id === room.roomTypeId) })),
    );
    prismaMock.room.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const room = { ...data, id: `room-${rooms.length + 1}` };
      rooms.push(room);
      const roomTypeId = (room as Record<string, unknown>).roomTypeId;
      return { ...room, roomType: types.find((type) => type.id === roomTypeId) };
    });
    prismaMock.roomType.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const index = types.findIndex((type) => type.id === where.id);
      if (index >= 0) types.splice(index, 1);
      return {};
    });
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: vi.fn(async () => []),
        room: { count: async () => 0 },
        booking: {
          findFirst: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "booking-1",
            reference: data.reference,
          }),
        },
        bookingRoom: { findFirst: async () => null },
        guest: {
          findFirst: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "guest-1", ...data }),
        },
        cleaningTask: { createMany: async () => ({ count: rooms.length }) },
      }),
    );
  });

  it("keeps Room and Room Type management restricted to admins", () => {
    expect(() => assertPermission(admin, PERMISSIONS.ROOMS_MANAGE)).not.toThrow();
    expect(() => assertPermission(manager, PERMISSIONS.ROOMS_MANAGE)).toThrow(ForbiddenError);
    expect(() => assertPermission(cleaner, PERMISSIONS.ROOMS_MANAGE)).toThrow(ForbiddenError);
    expect(() => assertPermission(manager, PERMISSIONS.ROOMS_DELETE_PERMANENT)).toThrow(ForbiddenError);
  });

  it("does not allow managers to permanently delete Room Types", async () => {
    await expect(deleteRoomType(manager, "type-1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.roomType.delete).not.toHaveBeenCalled();
  });

  it("creates a type, room, and booking from an otherwise empty property", async () => {
    const type = await createRoomType(admin, {
      name: "Standard",
      description: "Standard room",
      maxGuests: 2,
      baseRate: 120,
      extraBedAllowed: false,
      extraBedRate: 0,
    });
    const room = await createRoom(admin, { name: "Room 1", roomTypeId: String(type.id) });
    const checkIn = new Date("2030-06-10T14:00:00.000Z");
    const checkOut = new Date("2030-06-11T11:00:00.000Z");
    const booking = await createBooking(
      {
        guest: { fullName: "Test Guest", phone: "9876543210" },
        checkIn,
        checkOut,
        guestCount: 1,
        source: "DIRECT",
        isWholeHouse: false,
        roomIds: [String(room.id)],
      },
      admin,
    );

    expect(type.name).toBe("Standard");
    expect(room.roomType.name).toBe("Standard");
    expect(booking.id).toBe("booking-1");
    expect(prismaMock.roomType.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.room.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid types, duplicate names, and deletion while rooms reference the type", async () => {
    await expect(
      createRoomType(admin, {
        name: "   ",
        maxGuests: 0,
        baseRate: -1,
        extraBedAllowed: false,
        extraBedRate: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const type = await createRoomType(admin, {
      name: "Suite",
      maxGuests: 2,
      baseRate: 100,
      extraBedAllowed: false,
      extraBedRate: 0,
    });
    await expect(
      createRoomType(admin, {
        name: "Suite",
        maxGuests: 2,
        baseRate: 100,
        extraBedAllowed: false,
        extraBedRate: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    rooms.push({ id: "room-linked", roomTypeId: type.id });
    await expect(deleteRoomType(admin, String(type.id))).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.roomType.delete).not.toHaveBeenCalled();
  });

  it("updates and deletes an unused room type", async () => {
    const type = await createRoomType(admin, {
      name: "Basic",
      maxGuests: 1,
      baseRate: 80,
      extraBedAllowed: false,
      extraBedRate: 0,
    });
    const updated = await updateRoomType(admin, String(type.id), {
      name: "Basic Plus",
      maxGuests: 2,
    });

    expect(updated.name).toBe("Basic Plus");
    expect(updated.maxGuests).toBe(2);
    await expect(deleteRoomType(admin, String(type.id))).resolves.toEqual({ id: type.id });
    expect(prismaMock.roomType.delete).toHaveBeenCalledTimes(1);
    expect(types).toHaveLength(0);
  });
});