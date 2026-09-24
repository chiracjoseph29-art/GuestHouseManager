/** Normalize email for duplicate detection (lowercase, trimmed). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Normalize phone for duplicate detection.
 * Strips formatting; treats +91 / 91 prefixes and common Indian 10-digit mobiles as the same number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  while (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) return digits;
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}

/** Strip to digits for partial phone search (min 3 digits). */
export function phoneDigitsForSearch(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length < 3) return null;
  while (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length >= 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.length >= 3 ? digits : null;
}

export function formatGuestSearchLine(guest: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
}): string {
  const parts = [guest.fullName];
  if (guest.phone?.trim()) parts.push(guest.phone.trim());
  else if (guest.email?.trim()) parts.push(guest.email.trim());
  return parts.join(" — ");
}
