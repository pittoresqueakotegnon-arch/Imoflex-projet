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
  X,
  Building2,
  Calendar,
  Phone,
  User,
  ShieldAlert,
  ShieldCheck,
  Bell,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase, Notification } from '../../lib/supabase';
import { BackButton } from '../../components/BackButton';
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
  leaseId?: string;
}

interface TypeConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  dot: string;
  badgeLabel: string;
  category: 'finances' | 'demandes' | 'system';
}

const TYPE_CONFIGS: Record<string, TypeConfig> = {
  nouveau_versement: {
    icon: CheckCircle2,
    color: '#059669',
    bg: '#ECFDF5',
    dot: '#10B981',
    badgeLabel: 'Loyer reçu',
    category: 'finances',
  },
  confirmation: {
    icon: CheckCircle2,
    color: '#059669',
    bg: '#ECFDF5',
    dot: '#10B981',
    badgeLabel: 'Paiement validé',
    category: 'finances',
  },
  rappel: {
    icon: Clock,
    color: '#D97706',
    bg: '#FFFBEB',
    dot: '#F59E0B',
    badgeLabel: "Rappel d'échéance",
    category: 'finances',
  },
  retard: {
    icon: AlertTriangle,
    color: '#DC2626',
    bg: '#FEF2F2',
    dot: '#EF4444',
    badgeLabel: 'Loyer en retard',
    category: 'finances',
  },
  retrait_complete: {
    icon: Wallet,
    color: '#7B3FE4',
    bg: '#F5F3FF',
    dot: '#7B3FE4',
    badgeLabel: 'Retrait effectué',
    category: 'finances',
  },
  retrait_echoue: {
    icon: ShieldAlert,
    color: '#DC2626',
    bg: '#FEF2F2',
    dot: '#EF4444',
    badgeLabel: 'Retrait échoué',
    category: 'finances',
  },
  alerte: {
    icon: ShieldAlert,
    color: '#DC2626',
    bg: '#FEF2F2',
    dot: '#EF4444',
    badgeLabel: 'Alerte',
    category: 'finances',
  },
  nouveau_locataire: {
    icon: Home,
    color: '#4F46E5',
    bg: '#EEF2FF',
    dot: '#6366F1',
    badgeLabel: 'Nouveau locataire',
    category: 'demandes',
  },
  nouvelle_demande_contact: {
    icon: MessageSquare,
    color: '#2563EB',
    bg: '#EFF6FF',
    dot: '#3B82F6',
    badgeLabel: 'Demande de contact',
    category: 'demandes',
  },
  suppression_annonce_approuvee: {
    icon: CheckCircle2,
    color: '#059669',
    bg: '#ECFDF5',
    dot: '#10B981',
    badgeLabel: 'Annonce supprimée',
    category: 'demandes',
  },
  suppression_annonce_rejetee: {
    icon: AlertTriangle,
    color: '#DC2626',
    bg: '#FEF2F2',
    dot: '#EF4444',
    badgeLabel: 'Suppression rejetée',
    category: 'demandes',
  },
  suppression_annonce_demandee: {
    icon: Clock,
    color: '#D97706',
    bg: '#FFFBEB',
    dot: '#F59E0B',
    badgeLabel: 'Demande en cours',
    category: 'demandes',
  },
  owner_verified: {
    icon: ShieldCheck,
    color: '#7B3FE4',
    bg: '#F5F3FF',
    dot: '#7B3FE4',
    badgeLabel: 'Identité vérifiée',
    category: 'system',
  },
  owner_verification_rejected: {
    icon: ShieldAlert,
    color: '#DC2626',
    bg: '#FEF2F2',
    dot: '#EF4444',
    badgeLabel: 'Vérification refusée',
    category: 'system',
  },
};

const DEFAULT_TYPE_CONFIG: TypeConfig = {
  icon: Bell,
  color: '#7B3FE4',
  bg: '#F5F3FF',
  dot: '#7B3FE4',
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
  if (diffMin < 60) return `${diffMin} min`;
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1 || (diffDays === 0 && date.getDate() !== now.getDate())) {
    return `Hier · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* ─────────────────────────────────────────────────────────────
   Composant NotifCard — version premium
───────────────────────────────────────────────────────────── */
function NotifCard({ notif, onClick }: { notif: Notification; onClick: () => void }) {
  const config = TYPE_CONFIGS[notif.type] || DEFAULT_TYPE_CONFIG;
  const Icon = config.icon;
  const isUnread = !notif.is_read;

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
    >
      <div
        className={`group relative rounded-2xl p-4 transition-all duration-200 active:scale-[0.99] ${
          isUnread
            ? 'bg-white shadow-sm'
            : 'bg-white/70 hover:bg-white'
        }`}
        style={{
          border: isUnread ? `1px solid ${config.color}22` : '1px solid #F3F4F6',
          boxShadow: isUnread ? `0 2px 16px ${config.color}0d` : undefined,
        }}
      >
        {/* Barre de couleur latérale si non lu */}
        {isUnread && (
          <div
            className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
            style={{ background: config.dot }}
          />
        )}

        <div className="flex items-start gap-3">
          {/* Icône */}
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: config.bg, color: config.color }}
          >
            <Icon size={20} />
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span
                className="text-[10px] font-space-grotesk font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: config.bg, color: config.color }}
              >
                {config.badgeLabel}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                <span className="text-[11px] text-gray-400 font-space-grotesk whitespace-nowrap">
                  {formatRelativeDate(notif.created_at)}
                </span>
                {isUnread && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: config.dot }}
                  />
                )}
              </div>
            </div>

            <h3
              className={`font-nunito text-[14px] leading-snug mb-0.5 ${
                isUnread ? 'font-black text-[#17132B]' : 'font-bold text-gray-700'
              }`}
            >
              {notif.title}
            </h3>

            <p className="text-[12px] text-gray-500 font-space-grotesk line-clamp-2 leading-relaxed">
              {notif.body}
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Composant DetailSheet — version premium
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
      case 'confirmation': return 'Voir le reçu & quittance';
      case 'nouveau_versement': return 'Voir le tableau de bord';
      case 'rappel':
      case 'retard': return 'Payer mon loyer';
      case 'retrait_complete':
      case 'retrait_echoue':
      case 'alerte': return 'Voir mon wallet';
      case 'nouvelle_demande_contact': return 'Voir les demandes';
      case 'owner_verified': return 'Faire un retrait';
      case 'owner_verification_rejected': return 'Soumettre à nouveau';
      default: return 'Accéder aux détails';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.2s ease' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes zoomIn { from { opacity:0; transform: scale(0.95) } to { opacity:1; transform: scale(1) } }
        .detail-sheet { animation: slideUp 0.3s cubic-bezier(0.16,1,0.3,1) both; }
        @media (min-width: 640px) { .detail-sheet { animation: zoomIn 0.25s cubic-bezier(0.16,1,0.3,1) both; } }
      `}</style>
      <div
        className="detail-sheet w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header coloré */}
        <div
          className="px-6 pt-6 pb-5 flex items-start justify-between gap-4"
          style={{
            background: `linear-gradient(135deg, ${config.color}15, ${config.color}05)`,
            borderBottom: `1px solid ${config.color}15`,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-[18px] flex items-center justify-center flex-shrink-0 shadow-sm"
              style={{ background: config.bg, color: config.color }}
            >
              <Icon size={26} />
            </div>
            <div>
              <span
                className="text-[11px] font-space-grotesk font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: config.bg, color: config.color }}
              >
                {config.badgeLabel}
              </span>
              <p className="text-[11px] text-gray-400 font-space-grotesk mt-1.5">
                {new Date(notif.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5">
          <h2 className="font-nunito font-black text-[20px] text-[#17132B] mb-2 leading-snug">
            {notif.title}
          </h2>
          <p className="text-[14px] text-gray-600 font-space-grotesk leading-relaxed mb-5 whitespace-pre-line">
            {notif.body}
          </p>

          {/* Données complémentaires */}
          {loading ? (
            <div className="rounded-2xl p-4 space-y-3 mb-5" style={{ background: '#F9FAFB' }}>
              <div className="h-3 bg-gray-200 rounded-md w-1/3 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded-md w-2/3 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded-md w-1/2 animate-pulse" />
            </div>
          ) : details && Object.values(details).some(Boolean) ? (
            <div
              className="rounded-2xl p-4 space-y-3 mb-5"
              style={{ background: `${config.color}08`, border: `1px solid ${config.color}18` }}
            >
              {details.amount !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-gray-400 font-space-grotesk">Montant</span>
                  <span className="font-nunito font-900 text-[20px]" style={{ color: config.color }}>
                    {formatMontant(details.amount)} FCFA
                  </span>
                </div>
              )}
              {details.period && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                    <Calendar size={13} /> Période
                  </span>
                  <span className="font-space-grotesk font-bold text-[#17132B]">{details.period}</span>
                </div>
              )}
              {details.listingTitle && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                    <Building2 size={13} /> Logement
                  </span>
                  <span className="font-nunito font-bold text-[#17132B] max-w-[200px] truncate text-right">
                    {details.listingTitle}
                  </span>
                </div>
              )}
              {details.senderName && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                    <User size={13} /> Demandeur
                  </span>
                  <span className="font-space-grotesk font-bold text-[#17132B]">{details.senderName}</span>
                </div>
              )}
              {details.senderPhone && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                    <Phone size={13} /> Téléphone
                  </span>
                  <span className="font-mono text-[13px] font-bold text-[#17132B]">{details.senderPhone}</span>
                </div>
              )}
              {details.destinationPhone && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-gray-400 font-space-grotesk flex items-center gap-1.5">
                    <Phone size={13} /> Vers
                  </span>
                  <span className="font-mono text-[13px] font-bold text-[#17132B]">
                    {details.destinationPhone}
                    {details.operator && <span className="font-space-grotesk text-gray-500 ml-1">({details.operator.toUpperCase()})</span>}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {/* Bouton d'action */}
          <button
            onClick={onAction}
            className="w-full text-white font-nunito font-900 text-[15px] rounded-2xl py-4 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all"
            style={{
              background: `linear-gradient(135deg, ${config.color}, ${config.color}cc)`,
              boxShadow: `0 8px 24px ${config.color}40`,
            }}
          >
            <span>{getActionText()}</span>
            <ArrowRight size={17} />
          </button>
        </div>
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
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications(profile?.id);

  const [tab, setTab] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<Notification | null>(null);
  const [details, setDetails] = useState<NotifDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const role = profile?.role || 'locataire';

  /* ── Chargement des détails associés ───────────── */
  const loadDetails = useCallback(async (notif: Notification) => {
    if (!notif.related_id) { setDetails(null); return; }
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
      } else if (['retrait_complete', 'retrait_echoue', 'alerte'].includes(notif.type)) {
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
        const { data: pay } = await supabase
          .from('payments')
          .select(`id, amount, operator, rent_periods:rent_period_id (period_month, period_year, leases:lease_id (properties:property_id (name)))`)
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
    if (!notif.is_read) await markRead(notif.id);
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
      navigate(details?.paymentId || notif.related_id ? `/recu/${details?.paymentId || notif.related_id}` : '/historique');
    } else if (notif.type === 'nouveau_versement') {
      navigate(role === 'proprietaire' ? '/pro/dashboard' : '/historique');
    } else if (['rappel', 'retard'].includes(notif.type)) {
      navigate(details?.leaseId ? `/payer/${details.leaseId}` : '/dashboard');
    } else if (['retrait_complete', 'retrait_echoue', 'alerte'].includes(notif.type)) {
      navigate('/pro/wallet');
    } else if (notif.type === 'nouvelle_demande_contact') {
      navigate(role === 'proprietaire' ? '/pro/demandes' : '/mes-demandes');
    } else if (notif.type === 'owner_verified') {
      navigate('/pro/retrait');
    } else if (notif.type === 'owner_verification_rejected') {
      navigate('/pro/verification');
    } else {
      navigate(role === 'proprietaire' ? '/pro/dashboard' : '/');
    }
  };

  /* ── Filtrage ─────────────────────────────────── */
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (tab === 'unread') return !n.is_read;
      if (tab === 'finances') return (TYPE_CONFIGS[n.type] || DEFAULT_TYPE_CONFIG).category === 'finances';
      if (tab === 'demandes') return (TYPE_CONFIGS[n.type] || DEFAULT_TYPE_CONFIG).category === 'demandes';
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
      if (time >= startOfToday) today.push(n);
      else if (time >= startOfWeek) thisWeek.push(n);
      else older.push(n);
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
      className="min-h-screen flex flex-col"
      style={{ background: '#F6F5FF', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
    >
      {/* ── Header premium ────────────────────────────── */}
      <header
        className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-100/80"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: '12px' }}
      >
        <div className="px-5 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="font-nunito font-900 text-[22px] text-[#17132B] leading-none">
                Notifications
              </h1>
              <p className="text-[12px] font-space-grotesk mt-0.5" style={{ color: unreadCount > 0 ? '#7B3FE4' : '#9CA3AF' }}>
                {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est à jour ✓'}
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={() => { haptics.light(); markAllRead(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-space-grotesk font-bold transition-colors active:scale-95"
              style={{ background: '#F5F3FF', color: '#7B3FE4' }}
            >
              <CheckCheck size={13} />
              Tout lire
            </button>
          )}
        </div>

        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide px-5">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { haptics.light(); setTab(t.key); }}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-space-grotesk font-bold transition-all active:scale-95 ${
                  active ? 'text-white' : 'text-gray-500 bg-gray-50 border border-gray-100'
                }`}
                style={active ? { background: 'linear-gradient(135deg, #7B3FE4, #A855F7)', boxShadow: '0 4px 12px #7B3FE430' } : {}}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={active ? { background: 'rgba(255,255,255,0.25)', color: 'white' } : { background: '#EDE9FE', color: '#7B3FE4' }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Contenu ───────────────────────────────────── */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-gray-100">
                <div className="w-11 h-11 rounded-2xl bg-gray-100 flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded-md w-1/4 animate-pulse" />
                  <div className="h-4 bg-gray-100 rounded-md w-3/4 animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded-md w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="pt-20 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-[28px] bg-[#F5F3FF] flex items-center justify-center mb-5">
              <Bell size={36} className="text-[#7B3FE4]" />
            </div>
            <h2 className="font-nunito font-900 text-[20px] text-[#17132B] mb-2">
              {tab === 'unread' ? 'Tout à jour !' : 'Aucune notification'}
            </h2>
            <p className="font-space-grotesk text-[14px] text-gray-400 max-w-[260px] leading-relaxed">
              {tab === 'unread'
                ? 'Vous avez consulté toutes vos alertes.'
                : 'Vos alertes de loyer et mises à jour apparaîtront ici.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(({ label, items }) => (
              <div key={label}>
                {/* Séparateur de groupe */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11px] font-space-grotesk font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">
                    {label}
                  </span>
                  <div className="flex-1 h-px bg-gray-200/70" />
                </div>

                <div className="space-y-2">
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

      {/* ── Detail Sheet ─────────────────────────────── */}
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
