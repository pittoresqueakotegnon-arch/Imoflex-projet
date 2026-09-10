import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wallet,
  MessageSquare,
  Home,
  CheckCheck,
  ChevronRight,
  X,
  Building2,
  Calendar,
  Phone,
  User,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase, Notification } from '../../lib/supabase';
import { BackButton } from '../../components/BackButton';
import EmptyState from '../../components/EmptyState';
import { formatMontant } from '../../lib/utils';
import { haptics } from '../../lib/haptics';

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
type FilterTab = 'all' | 'unread' | 'finances' | 'demandes';

interface NotifDetails {
  senderName?: string;
  senderPhone?: string;
  listingTitle?: string;
  message?: string;
  amount?: number;
  operator?: string;
  destinationPhone?: string;
  period?: string;
  paymentId?: string;
  leaseId?: string; // Pour la navigation vers /payer/:leaseId
}

interface TypeConfig {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
  bgClass: string;
  badgeLabel: string;
  category: 'finances' | 'demandes' | 'system';
}

const TYPE_CONFIGS: Record<string, TypeConfig> = {
  nouveau_versement: {
    icon: CheckCircle2,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    badgeLabel: 'Loyer reçu',
    category: 'finances',
  },
  confirmation: {
    icon: CheckCircle2,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    badgeLabel: 'Paiement validé',
    category: 'finances',
  },
  rappel: {
    icon: Clock,
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50',
    badgeLabel: 'Rappel d\'échéance',
    category: 'finances',
  },
  retard: {
    icon: AlertTriangle,
    colorClass: 'text-rose-600',
    bgClass: 'bg-rose-50',
    badgeLabel: 'Loyer en retard',
    category: 'finances',
  },
  retrait_complete: {
    icon: Wallet,
    colorClass: 'text-[#7B3FE4]',
    bgClass: 'bg-[#F5F3FF]',
    badgeLabel: 'Retrait validé',
    category: 'finances',
  },
  retrait_echoue: {
    icon: ShieldAlert,
    colorClass: 'text-rose-600',
    bgClass: 'bg-rose-50',
    badgeLabel: 'Retrait échoué',
    category: 'finances',
  },
  nouveau_locataire: {
    icon: Home,
    colorClass: 'text-indigo-600',
    bgClass: 'bg-indigo-50',
    badgeLabel: 'Nouveau locataire',
    category: 'demandes',
  },
  nouvelle_demande_contact: {
    icon: MessageSquare,
    colorClass: 'text-blue-600',
    bgClass: 'bg-blue-50',
    badgeLabel: 'Demande de contact',
    category: 'demandes',
  },
  suppression_annonce_approuvee: {
    icon: CheckCircle2,
    colorClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50',
    badgeLabel: 'Annonce supprimée',
    category: 'demandes',
  },
  suppression_annonce_rejetee: {
    icon: AlertTriangle,
    colorClass: 'text-rose-600',
    bgClass: 'bg-rose-50',
    badgeLabel: 'Suppression rejetée',
    category: 'demandes',
  },
  suppression_annonce_demandee: {
    icon: Clock,
    colorClass: 'text-amber-600',
    bgClass: 'bg-amber-50',
    badgeLabel: 'Demande en cours',
    category: 'demandes',
  },
};

const DEFAULT_TYPE_CONFIG: TypeConfig = {
  icon: Clock,
  colorClass: 'text-[#7B3FE4]',
  bgClass: 'bg-[#F5F3FF]',
  badgeLabel: 'Information',
  category: 'system',
};

/* ─────────────────────────────────────────────────────────────
   Formatage des dates relatives en français
───────────────────────────────────────────────────────────── */
function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 2) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1 || (diffDays === 0 && date.getDate() !== now.getDate())) {
    return `Hier à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* ─────────────────────────────────────────────────────────────
   Composant NotifCard
───────────────────────────────────────────────────────────── */
function NotifCard({
  notif,
  onClick,
}: {
  notif: Notification;
  onClick: () => void;
}) {
  const config = TYPE_CONFIGS[notif.type] || DEFAULT_TYPE_CONFIG;
  const Icon = config.icon;
  const isUnread = !notif.is_read;

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer border ${
        isUnread
          ? 'bg-white border-[#7B3FE4]/20 shadow-sm shadow-[#7B3FE4]/5'
          : 'bg-white/80 hover:bg-white border-gray-100 hover:border-gray-200'
      } active:scale-[0.99]`}
    >
      <div className="flex items-start gap-3.5">
        {/* Icône de type */}
        <div
          className={`w-11 h-11 rounded-2xl ${config.bgClass} ${config.colorClass} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105`}
        >
          <Icon size={20} />
        </div>

        {/* Contenu principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span
              className={`text-[11px] font-space-grotesk font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.bgClass} ${config.colorClass}`}
            >
              {config.badgeLabel}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-gray-400 font-space-grotesk">
                {formatRelativeDate(notif.created_at)}
              </span>
              {isUnread && (
                <span className="w-2 h-2 rounded-full bg-[#7B3FE4] flex-shrink-0" />
              )}
            </div>
          </div>

          <h3
            className={`font-nunito text-[14px] leading-tight mb-1 truncate ${
              isUnread ? 'font-black text-[#17132B]' : 'font-bold text-gray-800'
            }`}
          >
            {notif.title}
          </h3>

          <p className="text-[12px] text-gray-500 font-space-grotesk line-clamp-2 leading-relaxed">
            {notif.body}
          </p>
        </div>

        {/* Flèche subtile */}
        <div className="self-center flex-shrink-0 text-gray-300 group-hover:text-[#7B3FE4] transition-colors">
          <ChevronRight size={16} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Composant DetailSheet
───────────────────────────────────────────────────────────── */
function DetailSheet({
  notif,
  config,
  details,
  loading,
  onClose,
  onAction,
}: {
  notif: Notification;
  config: TypeConfig;
  details: NotifDetails | null;
  loading: boolean;
  onClose: () => void;
  onAction: () => void;
}) {
  const Icon = config.icon;

  const getActionText = () => {
    switch (notif.type) {
      case 'confirmation':
        return 'Voir le reçu & quittance';
      case 'nouveau_versement':
        return 'Voir le tableau de bord';
      case 'rappel':
      case 'retard':
        return 'Payer mon loyer';
      case 'retrait_complete':
      case 'retrait_echoue':
        return 'Voir mon solde';
      case 'nouvelle_demande_contact':
        return 'Voir les demandes';
      default:
        return 'Accéder aux détails';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-[28px] p-6 shadow-2xl border border-gray-100 max-h-[88vh] overflow-y-auto my-auto animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl ${config.bgClass} ${config.colorClass} flex items-center justify-center flex-shrink-0`}
            >
              <Icon size={24} />
            </div>
            <div>
              <span
                className={`text-[11px] font-space-grotesk font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${config.bgClass} ${config.colorClass}`}
              >
                {config.badgeLabel}
              </span>
              <p className="text-[12px] text-gray-400 font-space-grotesk mt-1">
                {new Date(notif.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Titre & Corps */}
        <h2 className="font-nunito font-black text-[18px] text-[#17132B] mb-2 leading-snug">
          {notif.title}
        </h2>
        <p className="text-[14px] text-gray-600 font-space-grotesk leading-relaxed mb-6 whitespace-pre-line">
          {notif.body}
        </p>

        {/* Données complémentaires chargées */}
        {loading ? (
          <div className="bg-gray-50 rounded-2xl p-4 animate-pulse space-y-2 mb-6">
            <div className="h-4 bg-gray-200 rounded-md w-1/3" />
            <div className="h-4 bg-gray-200 rounded-md w-2/3" />
          </div>
        ) : details ? (
          <div className="bg-[#F8F7FF] rounded-2xl p-4 border border-[#7B3FE4]/10 space-y-3 mb-6">
            {details.amount !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-400 font-space-grotesk">Montant</span>
                <span className="font-nunito font-900 text-[18px] text-[#7B3FE4]">
                  {formatMontant(details.amount)} FCFA
                </span>
              </div>
            )}

            {details.period && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                  <Calendar size={14} /> Période
                </span>
                <span className="font-space-grotesk font-bold text-[#17132B]">
                  {details.period}
                </span>
              </div>
            )}

            {details.listingTitle && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                  <Building2 size={14} /> Logement
                </span>
                <span className="font-nunito font-bold text-[#17132B] max-w-[200px] truncate text-right">
                  {details.listingTitle}
                </span>
              </div>
            )}

            {details.senderName && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                  <User size={14} /> Demandeur
                </span>
                <span className="font-space-grotesk font-bold text-[#17132B]">
                  {details.senderName}
                </span>
              </div>
            )}

            {details.senderPhone && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                  <Phone size={14} /> Téléphone
                </span>
                <span className="font-mono text-[13px] font-bold text-[#17132B]">
                  {details.senderPhone}
                </span>
              </div>
            )}

            {details.destinationPhone && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                  <Phone size={14} /> Numéro de réception
                </span>
                <span className="font-mono text-[13px] font-bold text-[#17132B]">
                  {details.destinationPhone} ({details.operator?.toUpperCase() || ''})
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* Bouton d'action contextuel */}
        <button
          onClick={onAction}
          className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[15px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/25"
        >
          <span>{getActionText()}</span>
          <ExternalLink size={16} />
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Page principale Notifications
───────────────────────────────────────────────────────────── */
export default function Notifications() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    markAllRead,
    markRead,
  } = useNotifications(profile?.id);

  const [tab, setTab] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<Notification | null>(null);
  const [details, setDetails] = useState<NotifDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const role = profile?.role || 'locataire';

  /* ── Chargement des détails associés ───────────── */
  const loadDetails = useCallback(async (notif: Notification) => {
    if (!notif.related_id) {
      setDetails(null);
      return;
    }
    setLoadingDetails(true);
    try {
      const d: NotifDetails = {};

      if (notif.type === 'nouvelle_demande_contact') {
        const { data } = await supabase
          .from('contact_requests')
          .select('message, contact_phone, users(full_name), listings(title)')
          .eq('id', notif.related_id)
          .maybeSingle();
        if (data) {
          d.message = data.message;
          d.senderPhone = data.contact_phone;
          d.senderName = (data.users as any)?.full_name;
          d.listingTitle = (data.listings as any)?.title;
        }
      } else if (['retrait_complete', 'retrait_echoue'].includes(notif.type)) {
        const { data } = await supabase
          .from('withdrawals')
          .select('amount, operator, destination_phone')
          .eq('id', notif.related_id)
          .maybeSingle();
        if (data) {
          d.amount = data.amount;
          d.operator = data.operator;
          d.destinationPhone = data.destination_phone;
        }
      } else if (['nouveau_versement', 'confirmation'].includes(notif.type)) {
        // Tenter d'abord de récupérer le paiement associé
        const { data: pay } = await supabase
          .from('payments')
          .select(`
            id, amount, operator,
            rent_periods:rent_period_id (
              period_month, period_year,
              leases:lease_id (properties:property_id (name))
            )
          `)
          .eq('id', notif.related_id)
          .maybeSingle();

        if (pay) {
          d.amount = pay.amount;
          d.operator = pay.operator;
          d.paymentId = pay.id;
          const rp = (pay as any).rent_periods;
          if (rp) {
            const months = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
            d.period = `${months[(rp.period_month ?? 1) - 1]} ${rp.period_year}`;
            d.listingTitle = rp.leases?.properties?.name;
          }
        } else {
          // Fallback sur rent_periods
          const { data: rp } = await supabase
            .from('rent_periods')
            .select('amount_due, period_month, period_year, leases(properties(name))')
            .eq('id', notif.related_id)
            .maybeSingle();
          if (rp) {
            d.amount = rp.amount_due;
            const months = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
            d.period = `${months[(rp.period_month ?? 1) - 1]} ${rp.period_year}`;
            d.listingTitle = (rp.leases as any)?.properties?.name;
          }
        }
      } else if (['rappel', 'retard'].includes(notif.type)) {
        const { data: rp } = await supabase
          .from('rent_periods')
          .select('id, amount_due, period_month, period_year, lease_id, leases(id, properties(name))')
          .eq('id', notif.related_id)
          .maybeSingle();
        if (rp) {
          d.amount = rp.amount_due;
          const months = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
          d.period = `${months[(rp.period_month ?? 1) - 1]} ${rp.period_year}`;
          d.listingTitle = (rp.leases as any)?.properties?.name;
          // Récupérer le lease_id pour naviguer vers /payer/:leaseId
          d.leaseId = (rp as any).lease_id || (rp.leases as any)?.id;
        }
      }
      setDetails(d);
    } catch (e) {
      console.warn('Error loading notif details:', e);
      setDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  /* ── Clic sur une notification ─────────────────── */
  const handleClick = async (notif: Notification) => {
    haptics.light();
    if (!notif.is_read) {
      await markRead(notif.id);
    }
    setDetails(null);
    setSelected(notif);
    loadDetails(notif);
  };

  /* ── Action contextuelle depuis le sheet ───────── */
  const handleAction = () => {
    if (!selected) return;
    const notif = selected;
    setSelected(null);

    if (notif.type === 'confirmation') {
      if (details?.paymentId || notif.related_id) {
        navigate(`/recu/${details?.paymentId || notif.related_id}`);
      } else {
        navigate('/historique');
      }
    } else if (notif.type === 'nouveau_versement') {
      navigate(role === 'proprietaire' ? '/pro/dashboard' : '/historique');
    } else if (['rappel', 'retard'].includes(notif.type)) {
      // Naviguer vers /payer/:leaseId si on a le lease_id, sinon vers le dashboard
      if (details?.leaseId) {
        navigate(`/payer/${details.leaseId}`);
      } else {
        navigate('/dashboard');
      }
    } else if (['retrait_complete', 'retrait_echoue'].includes(notif.type)) {
      navigate('/pro/wallet');
    } else if (notif.type === 'nouvelle_demande_contact') {
      navigate(role === 'proprietaire' ? '/pro/demandes' : '/mes-demandes');
    } else {
      navigate(role === 'proprietaire' ? '/pro/dashboard' : '/');
    }
  };

  /* ── Filtrage ─────────────────────────────────── */
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (tab === 'unread') return !n.is_read;
      if (tab === 'finances') {
        const cfg = TYPE_CONFIGS[n.type] || DEFAULT_TYPE_CONFIG;
        return cfg.category === 'finances';
      }
      if (tab === 'demandes') {
        const cfg = TYPE_CONFIGS[n.type] || DEFAULT_TYPE_CONFIG;
        return cfg.category === 'demandes';
      }
      return true;
    });
  }, [notifications, tab]);

  /* ── Regroupement temporel ────────────────────── */
  const groups = useMemo(() => {
    const today: Notification[] = [];
    const thisWeek: Notification[] = [];
    const older: Notification[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;

    filtered.forEach((n) => {
      const time = new Date(n.created_at).getTime();
      if (time >= startOfToday) {
        today.push(n);
      } else if (time >= startOfWeek) {
        thisWeek.push(n);
      } else {
        older.push(n);
      }
    });

    const list: { label: string; items: Notification[] }[] = [];
    if (today.length > 0) list.push({ label: "Aujourd'hui", items: today });
    if (thisWeek.length > 0) list.push({ label: 'Cette semaine', items: thisWeek });
    if (older.length > 0) list.push({ label: 'Plus ancien', items: older });

    return list;
  }, [filtered]);

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'Toutes', count: notifications.length },
    { key: 'unread', label: 'Non lues', count: unreadCount || undefined },
    { key: 'finances', label: 'Finances' },
    { key: 'demandes', label: 'Demandes' },
  ];

  return (
    <div
      className="min-h-screen bg-[#F8F7FF] flex flex-col"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
    >
      {/* ── Header ────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-5 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="font-nunito font-900 text-xl text-[#17132B] leading-none">
                Notifications
              </h1>
              {unreadCount > 0 ? (
                <p className="text-[12px] text-[#7B3FE4] font-space-grotesk font-semibold mt-0.5">
                  {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-[12px] text-gray-400 font-space-grotesk mt-0.5">
                  Toutes vos alertes
                </p>
              )}
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={() => {
                haptics.light();
                markAllRead();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-space-grotesk font-bold bg-[#F5F3FF] text-[#7B3FE4] active:bg-[#EDE9FE] transition-colors"
            >
              <CheckCheck size={14} />
              <span>Tout lire</span>
            </button>
          )}
        </div>

        {/* ── Onglets de filtres ──────────────────────── */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pt-1">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  haptics.light();
                  setTab(t.key);
                }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-space-grotesk font-bold transition-all active:scale-95 ${
                  active
                    ? 'bg-[#7B3FE4] text-white shadow-sm shadow-[#7B3FE4]/20'
                    : 'bg-gray-50 text-gray-600 border border-gray-100'
                }`}
              >
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center ${
                      active ? 'bg-white/25 text-white' : 'bg-[#7B3FE4]/10 text-[#7B3FE4]'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Contenu / Liste ───────────────────────────── */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 flex items-center gap-3 animate-pulse border border-gray-100"
              >
                <div className="w-11 h-11 rounded-2xl bg-gray-100 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded-md w-1/4" />
                  <div className="h-4 bg-gray-100 rounded-md w-3/4" />
                  <div className="h-3 bg-gray-100 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="pt-12">
            <EmptyState
              title={tab === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
              description={
                tab === 'unread'
                  ? 'Vous êtes à jour ! Toutes vos alertes ont été consultées.'
                  : 'Vos alertes et mises à jour de loyer apparaîtront ici.'
              }
            />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ label, items }) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-space-grotesk font-bold uppercase tracking-wider text-gray-400">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <div className="space-y-2.5">
                  {items.map((notif) => (
                    <NotifCard
                      key={notif.id}
                      notif={notif}
                      onClick={() => handleClick(notif)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Bottom Sheet de détail ─────────────────────── */}
      {selected && (
        <DetailSheet
          notif={selected}
          config={TYPE_CONFIGS[selected.type] || DEFAULT_TYPE_CONFIG}
          details={details}
          loading={loadingDetails}
          onClose={() => setSelected(null)}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
