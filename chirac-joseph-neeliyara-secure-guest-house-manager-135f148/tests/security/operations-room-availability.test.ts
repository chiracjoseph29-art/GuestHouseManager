import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, prismaMock } = vi.hoisted(() => {
  type BookingStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
  type BookingFixture = {
    id: string;
    status: BookingStatus;
    checkIn: Date;
    checkOut: Date;
    isWholeHouse: boolean;
  };

  return {
    state: {
      rooms: [] as Array<{ id: string; isActive: boolean }>,
      bookings: [] as BookingFixture[],
      bookingRooms: [] as Array<{ roomId: string; bookingId: string }>,
    },
    prismaMock: {
      booking: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
      bookingRoom: { findMany: vi.fn() },
      room: { findMany: vi.fn() },
      cleaningTask: { count: vi.fn(), findMany: vi.fn() },
      inventoryItem: { findMany: vi.fn() },
      inventoryVerification: { count: vi.fn() },
    },
  };
});

vi.mock("@/server/db/prisma", () => ({ prisma: prismaMock }));

import { getOperationsOverview } from "@/server/modules/operations/overview.service";

const manager = {
  id: "manager-id",
  email: "manager@example.com",
  name: "Test Manager",
  role: "MANAGER" as const,
  status: "ACTIVE" as const,
  canViewFinancials: false,
  mfaEnabled: true,
};

function localDayBounds() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  return { todayStart, tomorrowStart };
}

function addBooking(input: {
  id?: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
  checkIn: Date;
  checkOut: Date;
  roomIds?: string[];
  isWholeHouse?: boolean;
}) {
  const id = input.id ?? `booking-${state.bookings.length + 1}`;
  state.bookings.push({
    id,
    status: input.status,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    isWholeHouse: input.isWholeHouse ?? false,
  });
  for (const roomId of input.roomIds ?? []) state.bookingRooms.push({ roomId, bookingId: id });
}

function bookingResults(overview: Awaited<ReturnType<typeof getOperationsOverview>>) {
  return overview.bookings as {
    checkInsToday: number;
    occupiedRooms: number;
    availableRooms: number;
  };
}

describe("operations overview room availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rooms.length = 0;
    state.bookings.length = 0;
    state.bookingRooms.length = 0;

    prismaMock.room.findMany.mockImplementation(async ({ where }: { where: { isActive?: boolean } }) =>
      state.rooms.filter((room) => where.isActive === undefined || room.isActive === where.isActive).map(({ id }) => ({ id })),
    );
    prismaMock.booking.count.mockImplementation(async ({ where }: {
      where: {
        checkIn?: { gte: Date; lte: Date };
        checkOut?: { gte: Date; lte: Date };
        status?: { in?: string[]; notIn?: string[] };
      };
    }) => {
      const dateFilter = where.checkIn ?? where.checkOut;
      if (!dateFilter) return 0;
      const field = where.checkIn ? "checkIn" : "checkOut";
      return state.bookings.filter((booking) => {
        const date = booking[field];
        return (
          date >= dateFilter.gte &&
          date <= dateFilter.lte &&
          (!where.status?.in || where.status.in.includes(booking.status))
        );
      }).length;
    });
    prismaMock.booking.findFirst.mockImplementation(async ({ where }: {
      where: {
        isWholeHouse?: boolean;
        status: { in: string[] };
        checkIn: { lt: Date };
        checkOut: { gt: Date };
      };
    }) => state.bookings.find((booking) =>
      booking.isWholeHouse === where.isWholeHouse &&
      where.status.in.includes(booking.status) &&
      booking.checkIn < where.checkIn.lt &&
      booking.checkOut > where.checkOut.gt,
    ) ?? null);
    prismaMock.bookingRoom.findMany.mockImplementation(async ({ where }: {
      where: {
        booking: { status: { in: string[] }; checkIn: { lt: Date }; checkOut: { gt: Date } };
        room: { isActive: boolean };
      };
    }) => state.bookingRooms.filter((link) => {
      const booking = state.bookings.find((candidate) => candidate.id === link.bookingId);
      const room = state.rooms.find((candidate) => candidate.id === link.roomId);
      return !!booking && !!room && room.isActive === where.room.isActive &&
        where.booking.status.in.includes(booking.status) &&
        booking.checkIn < where.booking.checkIn.lt &&
        booking.checkOut > where.booking.checkOut.gt;
    }).map(({ roomId }) => ({ roomId })));
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.cleaningTask.count.mockResolvedValue(0);
    prismaMock.cleaningTask.findMany.mockResolvedValue([]);
    prismaMock.inventoryItem.findMany.mockResolvedValue([]);
    prismaMock.inventoryVerification.count.mockResolvedValue(0);
  });

  it("counts a confirmed check-in today as occupied and preserves checkInsToday", async () => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-1", isActive: true }, { id: "room-2", isActive: true });
    const checkIn = new Date(todayStart);
    checkIn.setHours(14);
    addBooking({ status: "CONFIRMED", checkIn, checkOut: tomorrowStart, roomIds: ["room-1"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.checkInsToday).toBe(1);
    expect(result.occupiedRooms).toBe(1);
    expect(result.availableRooms).toBe(1);
  });

  it.each(["CHECKED_IN", "PENDING"] as const)("counts overlapping %s bookings as occupied", async (status) => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-1", isActive: true }, { id: "room-2", isActive: true });
    addBooking({ status, checkIn: todayStart, checkOut: tomorrowStart, roomIds: ["room-1"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.availableRooms).toBe(1);
  });

  it.each(["CANCELLED", "NO_SHOW", "CHECKED_OUT"] as const)("does not count %s bookings as occupied", async (status) => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-1", isActive: true }, { id: "room-2", isActive: true });
    addBooking({ status, checkIn: todayStart, checkOut: tomorrowStart, roomIds: ["room-1"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.occupiedRooms).toBe(0);
    expect(result.availableRooms).toBe(2);
  });

  it("applies the half-open checkout boundary at the start of today", async () => {
    const { todayStart } = localDayBounds();
    const previousDay = new Date(todayStart);
    previousDay.setDate(previousDay.getDate() - 1);
    state.rooms.push({ id: "room-1", isActive: true });
    addBooking({ status: "CONFIRMED", checkIn: previousDay, checkOut: todayStart, roomIds: ["room-1"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.availableRooms).toBe(1);
  });

  it.each(["starts tomorrow", "ended before today"] as const)("ignores a booking that $0", async (caseName) => {
    const { todayStart, tomorrowStart } = localDayBounds();
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    state.rooms.push({ id: "room-1", isActive: true });
    addBooking({
      status: "CONFIRMED",
      checkIn: caseName === "starts tomorrow" ? tomorrowStart : yesterdayStart,
      checkOut: caseName === "starts tomorrow" ? new Date(tomorrowStart.getTime() + 86_400_000) : todayStart,
      roomIds: ["room-1"],
    });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.availableRooms).toBe(1);
  });

  it("counts a room only once when multiple active booking-room rows refer to it", async () => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-1", isActive: true }, { id: "room-2", isActive: true });
    addBooking({ status: "CONFIRMED", checkIn: todayStart, checkOut: tomorrowStart, roomIds: ["room-1"] });
    addBooking({ status: "CHECKED_IN", checkIn: todayStart, checkOut: tomorrowStart, roomIds: ["room-1"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.occupiedRooms).toBe(1);
    expect(result.availableRooms).toBe(1);
  });

  it("excludes inactive rooms from both the total and occupied room count", async () => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-active", isActive: true }, { id: "room-inactive", isActive: false });
    addBooking({ status: "CONFIRMED", checkIn: todayStart, checkOut: tomorrowStart, roomIds: ["room-inactive"] });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.occupiedRooms).toBe(0);
    expect(result.availableRooms).toBe(1);
  });

  it("marks every active room occupied by an overlapping whole-house booking", async () => {
    const { todayStart, tomorrowStart } = localDayBounds();
    state.rooms.push({ id: "room-1", isActive: true }, { id: "room-2", isActive: true });
    addBooking({ status: "CONFIRMED", checkIn: todayStart, checkOut: tomorrowStart, isWholeHouse: true });

    const result = bookingResults(await getOperationsOverview(manager));

    expect(result.occupiedRooms).toBe(2);
    expect(result.availableRooms).toBe(0);
  });
});