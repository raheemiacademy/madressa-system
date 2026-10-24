import { monthRange } from '@/server/attendance/registers';
import { todayIso } from '@/server/people/common';

export function statsParams(sp: Record<string, string | undefined>) {
  const iso = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '') ? v : undefined);
  const m = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? monthRange(sp.month!) : null;
  const from = iso(sp.from) ?? m?.from ?? `${todayIso().slice(0, 7)}-01`;
  const to = iso(sp.to) ?? m?.to ?? todayIso();
  const n = (v?: string) => (v && /^\d{1,3}(\.\d)?$/.test(v) ? Number(v) : undefined);
  return { from, to: to < from ? from : to, classId: Number(sp.class) || undefined, below: n(sp.below), above: n(sp.above) };
}
