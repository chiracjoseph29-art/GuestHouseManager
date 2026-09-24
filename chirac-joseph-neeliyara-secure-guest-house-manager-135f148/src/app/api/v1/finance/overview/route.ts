import { getFinancialOverview, type FinancePeriod } from "@/server/modules/finance/finance.service";
import { jsonOk, withAuth } from "@/server/http/api-handler";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { ValidationError } from "@/server/lib/errors";

const PERIODS: FinancePeriod[] = ["today", "week", "month", "last_month", "custom"];

export const GET = withAuth(PERMISSIONS.FINANCE_VIEW, async ({ req, user, correlationId }) => {
  const url = new URL(req.url);
  const period = (url.searchParams.get("period") ?? "month") as FinancePeriod;
  if (!PERIODS.includes(period)) throw new ValidationError("Invalid period.");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if (period === "custom" && (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))) {
    throw new ValidationError("Custom range requires valid from and to dates.");
  }
  const overview = await getFinancialOverview(user, period, from, to);
  return jsonOk(overview, correlationId);
});
