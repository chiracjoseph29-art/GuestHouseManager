"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type InventoryCheckRow = {
  id: string;
  expectedQuantity: number;
  item: { id: string; name: string; unit?: string };
};

type Props = {
  roomId: string;
  title?: string;
  compact?: boolean;
  foundQty: Record<string, string>;
  onFoundQtyChange: (next: Record<string, string>) => void;
};

export function RoomInventoryChecklist({
  roomId,
  title = "Room inventory check",
  compact = false,
  foundQty,
  onFoundQtyChange,
}: Props) {
  const [rows, setRows] = useState<InventoryCheckRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    setLoading(true);
    api<{ roomInventory: InventoryCheckRow[] }>(`/api/v1/room-inventory?roomId=${roomId}`)
      .then((r) => {
        setRows(r.data.roomInventory);
        const next = { ...foundQty };
        for (const row of r.data.roomInventory) {
          if (next[row.item.id] === undefined) {
            next[row.item.id] = String(row.expectedQuantity);
          }
        }
        onFoundQtyChange(next);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [roomId]);

  const allMatch = useMemo(() => {
    return rows.every((row) => {
      const found = Number(foundQty[row.item.id] ?? row.expectedQuantity);
      return Number.isInteger(found) && found === row.expectedQuantity;
    });
  }, [rows, foundQty]);

  function setFound(itemId: string, value: number) {
    onFoundQtyChange({ ...foundQty, [itemId]: String(Math.max(0, value)) });
  }

  function markAllPresent() {
    const next = { ...foundQty };
    for (const row of rows) {
      next[row.item.id] = String(row.expectedQuantity);
    }
    onFoundQtyChange(next);
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading room inventory…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No inventory configured for this room. Assign items from Inventory → Add item.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Room inventory</p>
          <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
            ✓ All items present
          </Button>
        </div>
        <ul className="space-y-1 text-sm">
          {rows.map((row) => {
            const found = Number(foundQty[row.item.id] ?? row.expectedQuantity);
            const ok = found === row.expectedQuantity;
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5">
                <span>
                  {ok ? "✓" : "⚠"} {row.item.name}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 px-0"
                    onClick={() => setFound(row.item.id, found - 1)}
                  >
                    −
                  </Button>
                  <span className="min-w-[3rem] text-center tabular-nums">
                    {found}/{row.expectedQuantity}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 px-0"
                    onClick={() => setFound(row.item.id, found + 1)}
                  >
                    +
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {!allMatch && <p className="text-xs font-medium text-amber-800">Some counts do not match expected.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
          ✓ All items present
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Found</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const found = Number(foundQty[row.item.id] ?? row.expectedQuantity);
            const mismatch = Number.isInteger(found) && found !== row.expectedQuantity;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.item.name}</div>
                  {mismatch && (
                    <Badge variant="destructive" className="mt-1 text-xs">DISCREPANCY</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.expectedQuantity}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 px-0"
                      aria-label="Decrease found"
                      onClick={() => setFound(row.item.id, found - 1)}
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-14 text-center tabular-nums"
                      value={foundQty[row.item.id] ?? String(row.expectedQuantity)}
                      onChange={(e) =>
                        onFoundQtyChange({ ...foundQty, [row.item.id]: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 px-0"
                      aria-label="Increase found"
                      onClick={() => setFound(row.item.id, found + 1)}
                    >
                      +
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
