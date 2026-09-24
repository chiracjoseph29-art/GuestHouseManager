"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CustomerSummary = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  idType?: string | null;
  idNumber?: string | null;
};

type CustomerPickerProps = {
  selectedGuestId: string | null;
  selectedGuest: CustomerSummary | null;
  guestFullName: string;
  guestEmail: string;
  guestPhone: string;
  guestAddress?: string;
  guestIdType?: string;
  guestIdNumber?: string;
  onSelectGuest: (guest: CustomerSummary) => void | Promise<void>;
  onClearSelection: () => void;
  onStartNewCustomer: () => void;
  onChangeFullName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangePhone: (value: string) => void;
  duplicateHint?: CustomerSummary | null;
  onUseDuplicateHint?: () => void;
};

const MIN_SEARCH_LEN = 1;

export function CustomerPicker({
  selectedGuestId,
  selectedGuest,
  guestFullName,
  guestEmail,
  guestPhone,
  guestAddress,
  guestIdType,
  guestIdNumber,
  onSelectGuest,
  onClearSelection,
  onStartNewCustomer,
  onChangeFullName,
  onChangeEmail,
  onChangePhone,
  duplicateHint,
  onUseDuplicateHint,
}: CustomerPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mode, setMode] = useState<"search" | "new">("search");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_SEARCH_LEN) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ search: "1", q: trimmed });
      const r = await api<{ guests: CustomerSummary[] }>(`/api/v1/guests?${params}`);
      if (seq !== searchSeq.current) return;
      setResults(r.data.guests);
    } catch {
      if (seq !== searchSeq.current) return;
      setResults([]);
      setSearchError("Could not search customers. Try again.");
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "search" || selectedGuestId) return;
    const handle = window.setTimeout(() => {
      void runSearch(searchQuery);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery, mode, selectedGuestId, runSearch]);

  async function pickGuest(g: CustomerSummary) {
    setSelectingId(g.id);
    try {
      await onSelectGuest(g);
      setSearchQuery("");
      setResults([]);
      setSearchError(null);
    } finally {
      setSelectingId(null);
    }
  }

  const display = selectedGuest ?? {
    id: selectedGuestId ?? "",
    fullName: guestFullName,
    email: guestEmail || null,
    phone: guestPhone || null,
    address: guestAddress || null,
    idType: guestIdType || null,
    idNumber: guestIdNumber || null,
  };

  return (
    <div className="space-y-3 rounded-md border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-sm">Customer</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "search" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("search")}
          >
            Find existing
          </Button>
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setMode("new");
              onStartNewCustomer();
            }}
          >
            + New customer
          </Button>
        </div>
      </div>

      {selectedGuestId ? (
        <div className="rounded border bg-white p-3 text-sm space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected customer</p>
          <p className="font-medium text-base">{display.fullName}</p>
          {display.phone && <p>Phone: {display.phone}</p>}
          {display.email && <p>Email: {display.email}</p>}
          {display.address && <p>Address: {display.address}</p>}
          {(display.idType || display.idNumber) && (
            <p>ID: {[display.idType, display.idNumber].filter(Boolean).join(" — ")}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClearSelection}>
              Change customer
            </Button>
            <Link
              href={`/app/customers/${selectedGuestId}`}
              className="inline-flex min-h-8 items-center rounded-md border px-3 text-xs hover:bg-slate-50"
            >
              View profile
            </Link>
          </div>
        </div>
      ) : (
        <>
          {mode === "search" && (
            <div>
              <Label htmlFor="customerSearch">Search by name, phone, or email</Label>
              <Input
                id="customerSearch"
                type="search"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="e.g. Priyanka or 97666…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mt-1"
              />
              {searching && <p className="mt-1 text-xs text-slate-500">Searching…</p>}
              {searchError && <p className="mt-1 text-xs text-red-600">{searchError}</p>}
              {!searching &&
                !searchError &&
                searchQuery.trim().length >= MIN_SEARCH_LEN &&
                results.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">No customers found.</p>
                )}
              {results.length > 0 && (
                <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto overscroll-contain">
                  {results.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        disabled={selectingId === g.id}
                        className="w-full min-h-[44px] rounded border bg-white px-3 py-2 text-left text-sm hover:border-slate-400 active:bg-slate-50 disabled:opacity-60"
                        onClick={() => void pickGuest(g)}
                      >
                        <span className="block font-medium">{g.fullName}</span>
                        {g.phone && <span className="block text-slate-600">{g.phone}</span>}
                        {g.email && <span className="block text-slate-500 text-xs">{g.email}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === "new" && (
            <>
              <div>
                <Label htmlFor="guestFullName">Full name</Label>
                <Input
                  id="guestFullName"
                  value={guestFullName}
                  onChange={(e) => onChangeFullName(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="guestPhone">Phone</Label>
                  <Input
                    id="guestPhone"
                    type="tel"
                    autoComplete="tel"
                    value={guestPhone}
                    onChange={(e) => onChangePhone(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="guestEmail">Email (optional)</Label>
                  <Input
                    id="guestEmail"
                    type="email"
                    autoComplete="email"
                    value={guestEmail}
                    onChange={(e) => onChangeEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {duplicateHint && onUseDuplicateHint && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Customer already exists</p>
              <p className="mt-1 font-medium">{duplicateHint.fullName}</p>
              {duplicateHint.phone && <p>{duplicateHint.phone}</p>}
              <Button type="button" size="sm" className="mt-2 min-h-9" onClick={onUseDuplicateHint}>
                Use this customer
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
