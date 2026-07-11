/**
 * useAdminMetrics.ts
 * Hook dédié pour le dashboard admin.
 * Centralise : chargement initial, rafraîchissement, Realtime Supabase, et gestion du filtre de période.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  PeriodKey,
  DashboardAlerts,
  DashboardKPIs,
  RevenuePoint,
  PendingListing,
  PendingWithdrawal,
  ActivityEntry,
  fetchAlerts,
  fetchKPIs,
  fetchRevenueChart,
  fetchPendingListings,
  fetchPendingWithdrawals,
  fetchRecentActivity,
} from '../lib/adminDashboardService';

export type { PeriodKey };

interface AdminMetricsState {
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;
  alerts: DashboardAlerts;
  kpis: DashboardKPIs;
  revenueChart: RevenuePoint[];
  pendingListings: PendingListing[];
  pendingWithdrawals: PendingWithdrawal[];
  activity: ActivityEntry[];
  loading: boolean;
  lastRefresh: Date;
  refresh: () => void;
}

const DEFAULT_KPIS: DashboardKPIs = {
  totalUsers: 0, activeListings: 0, pendingListings: 0,
  pendingWithdrawals: 0, paymentsCount: 0, paymentsTotalVolume: 0,
  revenueImoflex: 0, activeLeases: 0, lateRentPeriods: 0, visitRequests: 0,
  usersDelta: null, listingsDelta: null, revenueDelta: null, visitsDelta: null,
};

const DEFAULT_ALERTS: DashboardAlerts = {
  pendingWithdrawals: 0, lateRentPeriods: 0, failedPayments: 0,
};

export function useAdminMetrics(): AdminMetricsState {
  const [period, setPeriod]                 = useState<PeriodKey>('30d');
  const [alerts, setAlerts]                 = useState<DashboardAlerts>(DEFAULT_ALERTS);
  const [kpis, setKpis]                     = useState<DashboardKPIs>(DEFAULT_KPIS);
  const [revenueChart, setRevenueChart]     = useState<RevenuePoint[]>([]);
  const [pendingListings, setPendingListings]       = useState<PendingListing[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawal[]>([]);
  const [activity, setActivity]             = useState<ActivityEntry[]>([]);
  const [loading, setLoading]               = useState(true);
  const [lastRefresh, setLastRefresh]       = useState(new Date());
  const periodRef                           = useRef(period);

  periodRef.current = period;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, k, chart, pl, pw, act] = await Promise.all([
        fetchAlerts(),
        fetchKPIs(periodRef.current),
        fetchRevenueChart(periodRef.current),
        fetchPendingListings(),
        fetchPendingWithdrawals(),
        fetchRecentActivity(15),
      ]);
      setAlerts(a);
      setKpis(k);
      setRevenueChart(chart);
      setPendingListings(pl);
      setPendingWithdrawals(pw);
      setActivity(act);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[useAdminMetrics] Erreur de chargement:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Rechargement lorsque la période change
  useEffect(() => {
    refresh();
  }, [period, refresh]);

  // Supabase Realtime — écoute uniquement les tables essentielles
  useEffect(() => {
    const channel = supabase
      .channel('admin-dashboard-realtime')
      // Nouvelles activités (audit_logs)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setActivity(prev => {
          const newEntry = payload.new as ActivityEntry;
          const updated = [newEntry, ...prev].slice(0, 15);
          return updated;
        });
      })
      // Nouveaux utilisateurs
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, () => {
        setKpis(prev => ({ ...prev, totalUsers: prev.totalUsers + 1 }));
      })
      // Nouvelles annonces / changements de statut
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        // Actualisation complète pour les compteurs d'annonces
        Promise.all([fetchKPIs(periodRef.current), fetchPendingListings()])
          .then(([k, pl]) => { setKpis(k); setPendingListings(pl); })
          .catch(console.error);
      })
      // Nouveaux retraits
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawals' }, () => {
        Promise.all([fetchAlerts(), fetchPendingWithdrawals()])
          .then(([a, pw]) => { setAlerts(a); setPendingWithdrawals(pw); })
          .catch(console.error);
      })
      // Paiements
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        Promise.all([fetchAlerts(), fetchKPIs(periodRef.current), fetchRevenueChart(periodRef.current)])
          .then(([a, k, chart]) => { setAlerts(a); setKpis(k); setRevenueChart(chart); })
          .catch(console.error);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    period, setPeriod,
    alerts, kpis, revenueChart,
    pendingListings, pendingWithdrawals, activity,
    loading, lastRefresh, refresh,
  };
}
