import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Users, Phone, AlertTriangle, CheckCircle2, Clock, ArrowLeft,
  Search, X, Mail, MapPin, Calendar, CreditCard, ShieldCheck,
  User, ExternalLink, MessageCircle, FileText
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant } from '../../../lib/utils';
import { UserAvatar } from '../../../components/UserAvatar';
import { generateQuittancePDF } from '../../../lib/pdf';

export default function WebProprietaireLocataires() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilter = searchParams.get('filter');
  const [filterMode, setFilterMode] = useState<'tous' | 'retard' | 'solde'>(
    initialFilter === 'retard' ? 'retard' : 'tous'
  );

  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Fiche Profil du locataire sélectionné
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Synchroniser avec les query params si l'URL change (ex: clic sur "Détails" depuis le dashboard)
  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'retard') setFilterMode('retard');
    else if (f === 'solde') setFilterMode('solde');
    else if (f === 'tous') setFilterMode('tous');
  }, [searchParams]);

  // Charger l'historique des règlements du locataire quand le modal profil s'ouvre
  useEffect(() => {
    if (!selectedTenant?.tenant_id) {
      setPaymentHistory([]);
      return;
    }
    setLoadingHistory(true);
    supabase
      .from('payments')
      .select('id, amount, payment_method, operator, status, created_at, receipt_url')
      .eq('tenant_id', selectedTenant.tenant_id)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (!error && data) {
          setPaymentHistory(data);
        }
        setLoadingHistory(false);
      });
  }, [selectedTenant]);

  const fetchTenants = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);

      // 1. Obtenir les biens du propriétaire
      const { data: properties, error: propErr } = await supabase
        .from('properties')
        .select('id, name, address, monthly_rent')
        .eq('owner_id', user.id);

      if (propErr) throw propErr;

      if (!properties || properties.length === 0) {
        setTenants([]);
        setLoading(false);
        return;
      }

      const propertyIds = properties.map((p) => p.id);
      const propMap = new Map(properties.map((p) => [p.id, p]));

      // 2. Obtenir les baux actifs
      const { data: leases, error: leasesErr } = await supabase
        .from('leases')
        .select('id, tenant_id, property_id, start_date, end_date, status, created_at')
        .in('property_id', propertyIds)
        .eq('status', 'actif');

      if (leasesErr) throw leasesErr;

      if (!leases || leases.length === 0) {
        setTenants([]);
        setLoading(false);
        return;
      }

      const tenantIds = [...new Set(leases.map((l) => l.tenant_id).filter(Boolean))];
      const leaseIds = leases.map((l) => l.id);

      // 3. Obtenir les profils des locataires avec photo (avatar_url) et les échéances du mois
      const now = new Date();
      const [{ data: usersData, error: usersErr }, { data: periodsData }] = await Promise.all([
        tenantIds.length > 0
          ? supabase.rpc('get_owner_tenant_profiles', { p_tenant_ids: tenantIds })
          : Promise.resolve({ data: [], error: null }),
        leaseIds.length > 0
          ? supabase
              .from('rent_periods')
              .select('lease_id, amount_due, amount_paid, deadline_date, status')
              .in('lease_id', leaseIds)
              .eq('period_month', now.getMonth() + 1)
              .eq('period_year', now.getFullYear())
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (usersErr) {
        console.warn('[WebProprietaireLocataires] Info locataires:', usersErr);
      }

      const userMap = new Map<string, any>(((usersData as any[]) || []).map((u: any) => [u.id, u]));
      const periodMap = new Map((periodsData || []).map((p) => [p.lease_id, p]));

      const merged = leases.map((l: any) => {
        const period = periodMap.get(l.id) || null;
        const prop = propMap.get(l.property_id);
        const due = period?.amount_due ?? prop?.monthly_rent ?? 0;
        const paid = period?.amount_paid ?? 0;
        const remaining = Math.max(0, due - paid);
        const isSettled = remaining === 0 && paid > 0;
        const isLate = remaining > 0;

        return {
          ...l,
          property: prop,
          users: userMap.get(l.tenant_id) || null,
          currentPeriod: period,
          due,
          paid,
          remaining,
          isSettled,
          isLate,
        };
      });

      setTenants(merged);
    } catch (err) {
      console.error('[WebProprietaireLocataires] Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // Statistiques
  const stats = useMemo(() => {
    const total = tenants.length;
    const settled = tenants.filter((t) => t.isSettled).length;
    const late = tenants.filter((t) => t.isLate).length;
    const totalRemaining = tenants.reduce((acc, t) => acc + (t.remaining || 0), 0);
    return { total, settled, late, totalRemaining };
  }, [tenants]);

  // Filtrage
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      // Filtre statut
      if (filterMode === 'retard' && !t.isLate) return false;
      if (filterMode === 'solde' && !t.isSettled) return false;

      // Filtre recherche textuelle
      if (search.trim()) {
        const q = search.toLowerCase();
        const name = t.users?.full_name?.toLowerCase() || '';
        const propName = t.property?.name?.toLowerCase() || '';
        const phone = t.users?.phone?.toLowerCase() || '';
        if (!name.includes(q) && !propName.includes(q) && !phone.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [tenants, filterMode, search]);

  const handleFilterChange = (mode: 'tous' | 'retard' | 'solde') => {
    setFilterMode(mode);
    setSearchParams(mode === 'tous' ? {} : { filter: mode });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Bouton retour vers dashboard */}
      <div className="flex items-center gap-2">
        <Link
          to="/web/pro/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[var(--imx-accent)] transition-colors py-1 px-2.5 rounded-lg hover:bg-white"
        >
          <ArrowLeft size={14} />
          <span>Retour au tableau de bord</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Gestion Locative
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Mes Locataires Actifs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivi des baux en cours, situation des règlements du mois et fiches profils complètes.
          </p>
        </div>

        {/* Barre de recherche */}
        <div className="w-full sm:w-72 relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher locataire, bien, tél…"
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-xs border bg-white outline-none focus:border-[var(--imx-accent)] transition-all shadow-2xs"
            style={{ borderColor: 'var(--imx-border)' }}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total locataires */}
        <button
          onClick={() => handleFilterChange('tous')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMode === 'tous'
              ? 'bg-purple-50/60 border-purple-300 ring-2 ring-purple-200'
              : 'bg-white hover:bg-gray-50'
          }`}
          style={{ borderColor: filterMode === 'tous' ? 'var(--imx-accent)' : 'var(--imx-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total locataires</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100/60 text-[var(--imx-accent)] flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            {stats.total}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5 font-medium">Baux locatifs en cours</p>
        </button>

        {/* Loyers en retard / échus */}
        <button
          onClick={() => handleFilterChange('retard')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMode === 'retard'
              ? 'bg-red-50 border-red-300 ring-2 ring-red-200'
              : 'bg-white hover:bg-gray-50'
          }`}
          style={{ borderColor: filterMode === 'retard' ? '#EF4444' : 'var(--imx-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600">Loyers en attente / retard</span>
            <div className="w-8 h-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-red-600" style={{ fontFamily: 'Sora' }}>
            {stats.late}
          </p>
          <p className="text-[11px] text-red-500 mt-0.5 font-medium">
            {stats.late > 0 ? `${formatMontant(stats.totalRemaining)} restant à percevoir` : 'Aucun impayé'}
          </p>
        </button>

        {/* Loyers soldés */}
        <button
          onClick={() => handleFilterChange('solde')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterMode === 'solde'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-200'
              : 'bg-white hover:bg-gray-50'
          }`}
          style={{ borderColor: filterMode === 'solde' ? '#10B981' : 'var(--imx-border)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Loyers soldés</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-700" style={{ fontFamily: 'Sora' }}>
            {stats.settled}
          </p>
          <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">À jour sur le mois en cours</p>
        </button>
      </div>

      {/* Onglets de filtrage */}
      <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--imx-border)' }}>
        <button
          onClick={() => handleFilterChange('tous')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterMode === 'tous'
              ? 'bg-[var(--imx-accent)] text-white shadow-2xs'
              : 'bg-white text-gray-600 hover:bg-gray-100 border'
          }`}
          style={{ borderColor: filterMode === 'tous' ? 'transparent' : 'var(--imx-border)' }}
        >
          Tous ({stats.total})
        </button>
        <button
          onClick={() => handleFilterChange('retard')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterMode === 'retard'
              ? 'bg-red-600 text-white shadow-2xs'
              : 'bg-white text-red-600 hover:bg-red-50 border border-red-200'
          }`}
        >
          En attente / Retard ({stats.late})
        </button>
        <button
          onClick={() => handleFilterChange('solde')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterMode === 'solde'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
          }`}
        >
          À jour ({stats.settled})
        </button>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : tenants.length === 0 ? (
        <div
          className="p-16 text-center rounded-2xl border bg-white shadow-2xs"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3 text-[var(--imx-accent)]">
            <Users size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-800 mb-1" style={{ fontFamily: 'Sora' }}>
            Aucun locataire actif pour le moment
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Dès qu'un bail locatif sera conclu et activé sur ImoFlex, vos locataires s'afficheront ici avec le détail de leurs échéances.
          </p>
        </div>
      ) : filteredTenants.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
          <p className="text-sm font-semibold text-gray-700 mb-1">Aucun locataire trouvé</p>
          <p className="text-xs text-gray-500 mb-4">
            {search.trim()
              ? `Aucun locataire ne correspond à votre recherche « ${search} »`
              : filterMode === 'retard'
              ? 'Félicitations ! Aucun loyer n\'est en retard ce mois-ci.'
              : 'Aucun locataire dans cette catégorie.'}
          </p>
          {(search || filterMode !== 'tous') && (
            <button
              onClick={() => {
                setSearch('');
                handleFilterChange('tous');
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-50 text-[var(--imx-accent)] hover:bg-purple-100 transition-colors"
            >
              Afficher tous les locataires
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((t) => {
            const due = t.due;
            const paid = t.paid;
            const remaining = t.remaining;
            const isSettled = t.isSettled;
            const progress = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;

            const phone = t.users?.phone || '';
            const cleanPhone = phone.replace(/[^0-9]/g, '');

            return (
              <div
                key={t.id}
                className="rounded-2xl border bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setSelectedTenant(t)}
                      className="flex items-center gap-3 min-w-0 text-left hover:opacity-85 transition-opacity"
                      title="Cliquer pour voir la fiche profil"
                    >
                      {/* Photo ou avatar du locataire */}
                      <UserAvatar
                        src={t.users?.avatar_url}
                        name={t.users?.full_name}
                        size="md"
                        shape="rounded"
                        className="w-11 h-11 ring-2 ring-purple-100 shadow-2xs group-hover:scale-105 transition-transform"
                      />
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-[#17132B] truncate group-hover:text-[var(--imx-accent)] transition-colors">
                          {t.users?.full_name || 'Locataire'}
                        </h3>
                        <p className="text-xs text-gray-400 font-medium truncate max-w-[170px]">
                          {t.property?.name || 'Logement'}
                        </p>
                      </div>
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${
                        isSettled
                          ? 'bg-emerald-50 text-emerald-700'
                          : paid > 0
                          ? 'bg-purple-50 text-[var(--imx-accent)]'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {isSettled ? 'Loyer soldé' : paid > 0 ? 'Partiel' : 'En attente'}
                    </span>
                  </div>

                  {/* Barre de progression du mois */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-[11px] font-semibold">
                      <span className="text-gray-400">Règlement du mois</span>
                      <span className={isSettled ? 'text-emerald-600 font-bold' : 'text-gray-700'}>
                        {progress}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progress}%`,
                          background: isSettled ? '#10B981' : remaining > 0 && paid === 0 ? '#EF4444' : 'var(--imx-accent)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Détail financier */}
                  <div className="p-3.5 rounded-xl bg-gray-50 text-xs space-y-2 mb-4 border border-gray-100">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Loyer mensuel :</span>
                      <strong className="text-gray-900">{formatMontant(t.property?.monthly_rent || due)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Déjà versé :</span>
                      <strong className="text-emerald-600">{formatMontant(paid)}</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-200/60">
                      <span className="text-gray-500">Solde restant :</span>
                      <strong className={remaining > 0 ? 'text-red-600' : 'text-gray-900'}>
                        {formatMontant(remaining)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Coordonnées & actions */}
                <div
                  className="pt-3 border-t flex items-center justify-between gap-2 text-xs"
                  style={{ borderColor: 'var(--imx-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTenant(t)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 text-[var(--imx-accent)] hover:bg-purple-100 font-bold transition-all text-xs"
                    title="Voir le profil complet et l'historique"
                  >
                    <User size={13} />
                    <span>Profil</span>
                  </button>

                  {phone ? (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`tel:${phone}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 text-gray-700 hover:text-[var(--imx-accent)] font-semibold transition-colors"
                        title="Appeler le locataire"
                      >
                        <Phone size={12} />
                      </a>
                      <a
                        href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                          `Bonjour ${t.users?.full_name || ''}, je vous contacte concernant votre bail pour le logement ${t.property?.name || ''}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold transition-colors text-[11px] flex items-center gap-1"
                        title="Contacter sur WhatsApp"
                      >
                        <MessageCircle size={12} />
                        <span>WA</span>
                      </a>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">Pas de téléphone</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Fiche Profil Locataire ── */}
      {selectedTenant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedTenant(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border flex flex-col animate-scaleUp web-scrollbar"
            style={{ borderColor: 'var(--imx-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="relative p-6 sm:p-7 border-b bg-gradient-to-br from-purple-50/70 via-white to-purple-50/30" style={{ borderColor: 'var(--imx-border)' }}>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors shadow-2xs"
              >
                <X size={16} />
              </button>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <UserAvatar
                  src={selectedTenant.users?.avatar_url}
                  name={selectedTenant.users?.full_name}
                  size="xl"
                  shape="rounded"
                  className="w-20 h-20 shadow-md ring-4 ring-white flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-[var(--imx-accent)]">
                      Locataire actif
                    </span>
                    {selectedTenant.users?.phone_verified && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <ShieldCheck size={11} /> Identité vérifiée
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                    {selectedTenant.users?.full_name || 'Profil du Locataire'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <MapPin size={12} className="text-gray-400" />
                    {selectedTenant.property?.name}
                  </p>
                </div>
              </div>

              {/* Boutons d'action rapide sous l'entête */}
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-purple-100/80 flex-wrap">
                {selectedTenant.users?.phone && (
                  <>
                    <a
                      href={`tel:${selectedTenant.users.phone}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-gray-800 border border-gray-200 hover:border-[var(--imx-accent)] hover:text-[var(--imx-accent)] transition-all shadow-2xs"
                    >
                      <Phone size={13} className="text-[var(--imx-accent)]" />
                      <span>{selectedTenant.users.phone}</span>
                    </a>
                    <a
                      href={`https://wa.me/${selectedTenant.users.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Bonjour ${selectedTenant.users?.full_name || ''}, je vous contacte au sujet de votre bail pour ${selectedTenant.property?.name || ''}.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-all shadow-2xs"
                    >
                      <MessageCircle size={13} className="text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  </>
                )}
                {selectedTenant.users?.email && (
                  <a
                    href={`mailto:${selectedTenant.users.email}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all shadow-2xs"
                  >
                    <Mail size={13} />
                    <span>E-mail</span>
                  </a>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-7 space-y-6">
              {/* Coordonnées & Logement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Carte Logement */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <MapPin size={13} className="text-[var(--imx-accent)]" />
                    <span>Logement loué</span>
                  </div>
                  <p className="font-bold text-sm text-[#17132B]">
                    {selectedTenant.property?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedTenant.property?.address || 'Adresse non spécifiée'}
                  </p>
                  <p className="text-xs font-semibold text-[var(--imx-accent)] pt-1">
                    Loyer conventionné : {formatMontant(selectedTenant.property?.monthly_rent || 0)} / mois
                  </p>
                </div>

                {/* Carte Bail */}
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <Calendar size={13} className="text-[var(--imx-accent)]" />
                    <span>Détails du bail</span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Entrée en vigueur :</span>
                      <strong className="text-gray-900">{selectedTenant.start_date || 'En cours'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Échéance de fin :</span>
                      <strong className="text-gray-900">{selectedTenant.end_date || 'Durée indéterminée'}</strong>
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-gray-500">Statut contrat :</span>
                      <span className="text-emerald-700 font-bold uppercase text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full">
                        {selectedTenant.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Situation de paiement du mois en cours */}
              <div className="p-5 rounded-2xl border space-y-3" style={{ borderColor: 'var(--imx-border)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700">
                    <CreditCard size={14} className="text-[var(--imx-accent)]" />
                    <span>Échéance du mois en cours</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      selectedTenant.isSettled
                        ? 'bg-emerald-50 text-emerald-700'
                        : selectedTenant.paid > 0
                        ? 'bg-purple-50 text-[var(--imx-accent)]'
                        : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {selectedTenant.isSettled
                      ? 'Loyer soldé'
                      : selectedTenant.paid > 0
                      ? 'Règlement partiel'
                      : 'Paiement en attente'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 text-center bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium">Exigible</p>
                    <p className="text-xs sm:text-sm font-bold text-gray-900">
                      {formatMontant(selectedTenant.due)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium">Déjà versé</p>
                    <p className="text-xs sm:text-sm font-bold text-emerald-600">
                      {formatMontant(selectedTenant.paid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium">Reste à payer</p>
                    <p className={`text-xs sm:text-sm font-black ${selectedTenant.remaining > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {formatMontant(selectedTenant.remaining)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Historique des règlements récents */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                    <Clock size={13} className="text-[var(--imx-accent)]" />
                    <span>Historique récent des versements</span>
                  </h4>
                  <span className="text-[11px] text-gray-400">Via Mobile Money (FedaPay)</span>
                </div>

                {loadingHistory ? (
                  <div className="py-8 flex justify-center">
                    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
                  </div>
                ) : paymentHistory.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-gray-50 text-xs text-gray-500 border border-gray-100">
                    Aucun versement enregistré sur la plateforme pour ce locataire.
                  </div>
                ) : (
                  <div className="divide-y rounded-2xl border overflow-hidden bg-white text-xs" style={{ borderColor: 'var(--imx-border)' }}>
                    {paymentHistory.map((p) => {
                      const isSuccess = p.status === 'valide' || p.status === 'approuve';
                      const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

                      return (
                        <div key={p.id} className="p-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                              isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                            }`}>
                              <CreditCard size={14} />
                            </div>
                            <div>
                              <p className="font-bold text-[#17132B]">
                                {formatMontant(p.amount || 0)}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {dateStr} {p.operator ? `· ${p.operator.toUpperCase()}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isSuccess ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {isSuccess ? 'Validé' : p.status}
                            </span>
                            {isSuccess && (
                              <button
                                type="button"
                                onClick={() => {
                                  generateQuittancePDF({
                                    id: p.id,
                                    fedapay_transaction_id: p.fedapay_transaction_id,
                                    amount: p.amount || 0,
                                    date: new Date(p.created_at || Date.now()),
                                    periodLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(p.created_at || Date.now())),
                                    propertyName: selectedTenant.property?.name || 'Logement loué',
                                    propertyLocation: selectedTenant.property?.address || null,
                                    tenantName: selectedTenant.users?.full_name || 'Locataire',
                                    tenantPhone: selectedTenant.users?.phone || null,
                                    ownerName: user?.user_metadata?.full_name || user?.email || 'Bailleur',
                                    operator: p.operator || 'mtn',
                                    rentAmount: selectedTenant.property?.monthly_rent || p.amount,
                                    remainingDue: selectedTenant.remaining,
                                  });
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-[var(--imx-accent)] hover:bg-purple-50 transition-colors"
                                title="Télécharger la quittance officielle"
                              >
                                <FileText size={14} />
                              </button>
                            )}
                            {p.receipt_url && (
                              <a
                                href={p.receipt_url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded-md text-gray-400 hover:text-[var(--imx-accent)] hover:bg-purple-50 transition-colors"
                                title="Voir le reçu en ligne"
                              >
                                <ExternalLink size={13} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t bg-gray-50 rounded-b-3xl flex justify-end" style={{ borderColor: 'var(--imx-border)' }}>
              <button
                type="button"
                onClick={() => setSelectedTenant(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
                style={{ background: 'var(--imx-accent)' }}
              >
                Fermer la fiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
