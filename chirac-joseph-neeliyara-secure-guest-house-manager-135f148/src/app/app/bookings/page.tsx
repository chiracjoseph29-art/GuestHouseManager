"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Booking = {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  status: string;
  isWholeHouse: boolean;
  guest: { fullName: string };
  bookingRooms: { room: { name: string } }[];
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    api<{ bookings: Booking[] }>("/api/v1/bookings")
      .then((r) => setBookings(r.data.bookings))
      .catch(() => toast.error("Unable to load bookings."));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <div className="grid gap-3">
        {bookings.map((b) => (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{b.reference}</CardTitle>
              <Badge>{b.status}</Badge>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <p>{b.guest.fullName}</p>
              <p>
                {new Date(b.checkIn).toLocaleString()} → {new Date(b.checkOut).toLocaleString()}
              </p>
              <p>
                {b.isWholeHouse
                  ? "Whole house"
                  : b.bookingRooms.map((br) => br.room.name).join(", ")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
