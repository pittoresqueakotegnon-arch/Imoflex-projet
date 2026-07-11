/**
 * adminDashboardService.ts
 * Couche service centralisée pour toutes les données du Dashboard Administrateur.
 * Toutes les requêtes Supabase sont ici – aucune logique de fetch dans les composants.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PeriodKey = 'today' | '7d' | '30d' | 'month' | 'prev_month';

export interface PeriodRange {
  from: string;
  to: string;
}

export interface DashboardAlerts {
  pendingWithdrawals: number;
  lateRentPeriods: number;
  failedPayments: number;
}

export interface DashboardKPIs {
  // Existants
  totalUsers: number;
  activeListings: number;
  pendingListings: number;
  pendingWithdrawals: number;
  paymentsCount: number;
  paymentsTotalVolume: number;
  revenueImoflex: number;
  // Nouveaux
  activeLeases: number;
  lateRentPeriods: number;
  visitRequests: number;
  // Évolutions
  usersDelta: number | null;
  listingsDelta: number | null;
  revenueDelta: number | null;
  visitsDelta: number | null;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  volume: number;
}

export interface PendingListing {
  id: string;
  title: string;
  property_type: string;
  monthly_rent: number;
  created_at: string;
  ownerName: string;
}

export interface PendingWithdrawal {
  id: string;
  amount: number;
  created_at: string;
  ownerName: string;
  operator: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  user_id: string;
  details: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString();
}

function endOfPrevMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMilliseconds(-1);
  return d.toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function periodToRange(period: PeriodKey): PeriodRange {
  const now = new Date().toISOString();
  switch (period) {
    case 'today':     return { from: startOfToday(), to: now };
    case '7d':        return { from: daysAgo(7),     to: now };
    case '30d':       return { from: daysAgo(30),    to: now };
    case 'month':     return { from: startOfMonth(), to: now };
    case 'prev_month': return { from: startOfPrevMonth(), to: endOfPrevMonth() };
  }
}

function prevPeriod(period: PeriodKey): PeriodRange {
  switch (period) {
    case 'today':
      return { from: daysAgo(1), to: startOfToday() };
    case '7d':
      return { from: daysAgo(14), to: daysAgo(7) };
    case '30d':
      return { from: daysAgo(60), to: daysAgo(30) };
    case 'month':
      return { from: startOfPrevMonth(), to: endOfPrevMonth() };
    case 'prev_month': {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      d.setDate(1); d.setHours(0, 0, 0, 0);
      const from = d.toISOString();
      const to = startOfPrevMonth();
      return { from, to };
    }
  }
}

function pct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${d.getMonth() + 1}`;
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function fetchAlerts(): Promise<DashboardAlerts> {
  const [withdrawals, lateRents, failedPay] = await Promise.all([
    supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'en_traitement'),
    supabase.from('rent_periods').select('*', { count: 'exact', head: true }).eq('status', 'retard'),
    supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'echoue'),
  ]);

  return {
    pendingWithdrawals: withdrawals.count ?? 0,
    lateRentPeriods:    lateRents.count   ?? 0,
    failedPayments:     failedPay.count   ?? 0,
  };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export async function fetchKPIs(period: PeriodKey): Promise<DashboardKPIs> {
  const range = periodToRange(period);
  const prev  = prevPeriod(period);

  const [
    usersTotal,
    usersInPeriod,
    usersPrev,
    activeListings,
    pendingListings,
    pendingWithdrawals,
    activeLeases,
    lateRents,
    visitsCurrent,
    visitsPrev,
    paymentsCurrent,
    paymentsPrev,
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', range.from).lte('created_at', range.to),
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', prev.from).lte('created_at', prev.to),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'publiee'),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'en_attente'),
    supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'en_traitement'),
    supabase.from('leases').select('*', { count: 'exact', head: true }).eq('status', 'actif'),
    supabase.from('rent_periods').select('*', { count: 'exact', head: true }).eq('status', 'retard'),
    supabase.from('contact_requests').select('*', { count: 'exact', head: true }).gte('created_at', range.from).lte('created_at', range.to),
    supabase.from('contact_requests').select('*', { count: 'exact', head: true }).gte('created_at', prev.from).lte('created_at', prev.to),
    supabase.from('payments').select('amount, commission_amount').eq('status', 'valide').gte('validated_at', range.from).lte('validated_at', range.to),
    supabase.from('payments').select('amount, commission_amount').eq('status', 'valide').gte('validated_at', prev.from).lte('validated_at', prev.to),
  ]);

  type PayRow = { amount?: number; commission_amount?: number };
  const curPay = (paymentsCurrent.data ?? []) as PayRow[];
  const prePay = (paymentsPrev.data ?? []) as PayRow[];

  const revenueCurrent  = curPay.reduce((s, p) => s + (p.commission_amount ?? 0), 0);
  const revenuePrevious = prePay.reduce((s, p) => s + (p.commission_amount ?? 0), 0);

  return {
    totalUsers:           usersTotal.count        ?? 0,
    activeListings:       activeListings.count     ?? 0,
    pendingListings:      pendingListings.count    ?? 0,
    pendingWithdrawals:   pendingWithdrawals.count ?? 0,
    paymentsCount:        curPay.length,
    paymentsTotalVolume:  curPay.reduce((s, p) => s + (p.amount ?? 0), 0),
    revenueImoflex:       revenueCurrent,
    activeLeases:         activeLeases.count       ?? 0,
    lateRentPeriods:      lateRents.count          ?? 0,
    visitRequests:        visitsCurrent.count      ?? 0,
    // Évolutions
    usersDelta:   pct(usersInPeriod.count  ?? 0, usersPrev.count    ?? 0),
    listingsDelta: null, // Pas de dimension temporelle sur les annonces publiées
    revenueDelta: pct(revenueCurrent, revenuePrevious),
    visitsDelta:  pct(visitsCurrent.count ?? 0, visitsPrev.count ?? 0),
  };
}

// ─── Graphique Revenus/Volume ─────────────────────────────────────────────────

export async function fetchRevenueChart(period: PeriodKey): Promise<RevenuePoint[]> {
  const range = periodToRange(period);

  const { data } = await supabase
    .from('payments')
    .select('amount, commission_amount, validated_at')
    .eq('status', 'valide')
    .gte('validated_at', range.from)
    .lte('validated_at', range.to);

  // Calculer le nombre de jours dans la plage
  const fromMs = new Date(range.from).getTime();
  const toMs   = new Date(range.to).getTime();
  const days   = Math.max(1, Math.ceil((toMs - fromMs) / (1000 * 60 * 60 * 24)));

  // Construire les buckets
  const buckets: Record<string, RevenuePoint> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(toMs - i * 86400000);
    const key = fmtDate(d.toISOString());
    buckets[key] = { date: key, revenue: 0, volume: 0 };
  }

  type PayRow = { amount?: number; commission_amount?: number; validated_at?: string };
  (data ?? []).forEach((p: PayRow) => {
    if (!p.validated_at) return;
    const key = fmtDate(p.validated_at);
    if (buckets[key]) {
      buckets[key].revenue += p.commission_amount ?? 0;
      buckets[key].volume  += p.amount            ?? 0;
    }
  });

  return Object.values(buckets);
}

// ─── Annonces en attente ──────────────────────────────────────────────────────

export async function fetchPendingListings(): Promise<PendingListing[]> {
  const { data } = await supabase
    .from('listings')
    .select('id, title, property_type, monthly_rent, created_at, owner_id')
    .eq('status', 'en_attente')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  type ListRow = { id: string; title: string; property_type: string; monthly_rent: number; created_at: string; owner_id: string };
  const ownerIds = [...new Set((data as ListRow[]).map(l => l.owner_id).filter(Boolean))];
  let ownerMap: Record<string, string> = {};

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase.from('users').select('id, full_name').in('id', ownerIds);
    (owners ?? []).forEach((u: { id: string; full_name: string }) => { ownerMap[u.id] = u.full_name; });
  }

  return (data as ListRow[]).map(l => ({
    id: l.id,
    title: l.title,
    property_type: l.property_type,
    monthly_rent: l.monthly_rent,
    created_at: l.created_at,
    ownerName: ownerMap[l.owner_id] ?? 'Propriétaire',
  }));
}

// ─── Retraits en attente ──────────────────────────────────────────────────────

export async function fetchPendingWithdrawals(): Promise<PendingWithdrawal[]> {
  const { data } = await supabase
    .from('withdrawals')
    .select('id, amount, created_at, operator, wallets!inner(owner_id)')
    .eq('status', 'en_traitement')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return [];

  type WRow = { id: string; amount: number; created_at: string; operator: string; wallets?: { owner_id: string } };
  const wOwnerIds = [...new Set((data as WRow[]).map(w => w.wallets?.owner_id).filter(Boolean) as string[])];
  let wOwnerMap: Record<string, string> = {};

  if (wOwnerIds.length > 0) {
    const { data: owners } = await supabase.from('users').select('id, full_name').in('id', wOwnerIds);
    (owners ?? []).forEach((u: { id: string; full_name: string }) => { wOwnerMap[u.id] = u.full_name; });
  }

  return (data as WRow[]).map(w => ({
    id: w.id,
    amount: w.amount,
    created_at: w.created_at,
    operator: w.operator ?? 'N/A',
    ownerName: (w.wallets?.owner_id && wOwnerMap[w.wallets.owner_id]) ? wOwnerMap[w.wallets.owner_id] : 'Propriétaire',
  }));
}

// ─── Activités récentes (audit_logs) ─────────────────────────────────────────

export async function fetchRecentActivity(limit = 15): Promise<ActivityEntry[]> {
  const { data } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, created_at, user_id, details')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []) as ActivityEntry[];
}
