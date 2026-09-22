"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Item = {
  id: string;
  name: string;
  quantity: number;
  minimumThreshold: number;
  unit: string;
  lowStock?: boolean;
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    api<{ items: Item[] }>("/api/v1/inventory")
      .then((r) => setItems(r.data.items))
      .catch(() => toast.error("Unable to load inventory."));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.unit}</TableCell>
              <TableCell>
                {item.lowStock ? <Badge variant="destructive">Low stock</Badge> : <Badge variant="secondary">OK</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
