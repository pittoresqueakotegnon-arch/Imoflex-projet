import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ArrowRight, Phone, Home, Wallet, Clock,
  AlertTriangle, CheckCircle, Bell, MessageSquare,
  TrendingUp, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../lib/supabase';
import { BackButton } from '../../components/BackButton';
import EmptyState from '../../components/EmptyState';

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
type FilterTab = 'all' | 'unread' | 'demandes' | 'finances';

interface NotifDetails {
  senderName?: string;
  senderPhone?: string;
  listingTitle?: string;
  message?: string;
  amount?: number;
  operator?: string;
  destinationPhone?: string;
  period?: string;
}

/* ─────────────────────────────────────────────────────────────
   Config par type de notification
───────────────────────────────────────────────────────────── */
type TypeCfg = {
  icon: React.ReactNode;
  emoji: string;
  color: string;         // couleur principale
  bg: string;            // fond de l'icône
  border: string;        // bordure gauche accent
  label: string;
  category: 'demandes' | 'finances' | 'system';
};

const T: Record<string, TypeCfg> = {
  rappel: {
    icon: <Clock size={16} />, emoji: '⏰',
    color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: '#F59E0B',
    label: 'Rappel', category: 'finances',
  },
  confirmation: {
    icon: <CheckCircle size={16} />, emoji: '✅',
    color: '#22C55E', bg: 'rgba(34,197,94,0.15)', border: '#22C55E',
    label: 'Confirmé', category: 'finances',
  },
  retard: {
    icon: <AlertTriangle size={16} />, emoji: '⚠️',
    color: '#EF4444', bg: 'rgba(239,68,68,0.15)', border: '#EF4444',
    label: 'Retard', category: 'finances',
  },
  nouveau_versement: {
    icon: <TrendingUp size={16} />, emoji: '💸',
    color: '#A855F7', bg: 'rgba(168,85,247,0.15)', border: '#A855F7',
    label: 'Versement', category: 'finances',
  },
  nouveau_locataire: {
    icon: <MessageSquare size={16} />, emoji: '🤝',
    color: '#22C55E', bg: 'rgba(34,197,94,0.15)', border: '#22C55E',
    label: 'Locataire', category: 'demandes',
  },
  nouvelle_demande_contact: {
    icon: <MessageSquare size={16} />, emoji: '💬',
    color: '#C4B5FD', bg: 'rgba(196,181,253,0.12)', border: '#C4B5FD',
    label: 'Demande', category: 'demandes',
  },
  retrait_complete: {
    icon: <Wallet size={16} />, emoji: '🏦',
    color: '#FBBF24', bg: 'rgba(251,191,36,0.15)', border: '#FBBF24',
    label: 'Retrait', category: 'finances',
  },
  retrait_echoue: {
    icon: <AlertTriangle size={16} />, emoji: '❌',
    color: '#EF4444', bg: 'rgba(239,68,68,0.15)', border: '#EF4444',
    label: 'Échec', category: 'finances',
  },
};

const DEFAULT_T: TypeCfg = {
  icon: <Bell size={16} />, emoji: '🔔',
  color: '#A855F7', bg: 'rgba(168,85,247,0.12)', border: '#A855F7',
  label: 'Info', category: 'system',
};

/* ─────────────────────────────────────────────────────────────
   Utilitaires
───────────────────────────────────────────────────────────── */
function relTime(dateStr: string): string {
  const d = new Date(dateStr), now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1)  return 'À l\'instant';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h} h`;
  const days = Math.floor(h / 24);
  if (days === 1) return 'Hier';
  if (days < 7)  return `${days} j`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
}

function fullDate(dateStr: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(dateStr));
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}

function operatorLabel(op?: string) {
  return { mtn: 'MTN MoMo', moov: 'Moov Money', celtiis: 'Celtiis Cash' }[op ?? ''] ?? op ?? '';
}

// Groupe les notifs par date lisible
function groupByDate(notifs: any[]): { label: string; items: any[] }[] {
  const groups: Record<string, any[]> = {};
  const now = new Date();

  for (const n of notifs) {
    const d = new Date(n.created_at);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    let key = diffDays === 0 ? "Aujourd'hui"
            : diffDays === 1 ? 'Hier'
            : diffDays < 7  ? `Il y a ${diffDays} jours`
            : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);

    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

/* ─────────────────────────────────────────────────────────────
   Bottom-sheet Détail
───────────────────────────────────────────────────────────── */
interface SheetProps {
  notif: any;
  cfg: TypeCfg;
  details: NotifDetails | null;
  loading: boolean;
  onClose: () => void;
  onNavigate: () => void;
}

function DetailSheet({ notif, cfg, details, loading, onClose, onNavigate }: SheetProps) {
  const navLabel: Record<string, string> = {
    nouvelle_demande_contact: 'Voir la demande',
    nouveau_locataire:        'Voir les locataires',
    nouveau_versement:        'Tableau de bord',
    confirmation:             "Voir l'historique",
    retard:                   "Voir l'historique",
    rappel:                   "Voir l'historique",
    retrait_complete:         'Mon portefeuille',
    retrait_echoue:           'Mon portefeuille',
  };

  return (
    /* Fond flou */
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(8,5,24,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] mx-auto rounded-t-[28px] overflow-hidden"
        style={{ background: '#0F0B28', border: '1px solid rgba(123,63,228,0.18)', borderBottom: 'none' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Handle ── */}
        <div className="flex justify-center pt-3">
          <div className="w-9 h-[3px] rounded-full bg-white/20" />
        </div>

        {/* ── Icône centrale + Titre ── */}
        <div className="px-5 pt-5 pb-4 flex flex-col items-center text-center" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Icône grande */}
          <div
            className="w-16 h-16 rounded-[22px] flex items-center justify-center mb-3 relative"
            style={{ background: cfg.bg, border: `1.5px solid ${cfg.color}25` }}
          >
            <span className="text-3xl">{cfg.emoji}</span>
            {/* Puce app */}
            <div
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.color}80` }}
            >
              <span className="text-[9px] text-white font-bold">i</span>
            </div>
          </div>

          {/* Label app */}
          <span
            className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: cfg.color, fontFamily: 'Space Grotesk' }}
          >
            ImoFlex · {cfg.label}
          </span>

          {/* Titre */}
          <h2 className="font-nunito font-900 text-white text-lg leading-snug px-2">
            {notif.title}
          </h2>

          {/* Date précise */}
          <p className="text-[11px] text-[#6B5FA0] mt-1.5 capitalize" style={{ fontFamily: 'Space Grotesk' }}>
            {fullDate(notif.created_at)}
          </p>
        </div>

        {/* ── Corps / Aperçu ── */}
        {notif.body && (
          <div className="mx-5 mt-4 px-4 py-3 rounded-2xl" style={{ background: 'rgba(123,63,228,0.07)', border: '1px solid rgba(123,63,228,0.1)' }}>
            <p className="text-sm text-[#C4B5FD] leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
              {notif.body}
            </p>
          </div>
        )}

        {/* ── Détails contextuels ── */}
        <div className="px-5 mt-4 space-y-2 pb-2">
          {loading ? (
            <>
              {[1, 2].map(i => (
                <div key={i} className="h-13 rounded-2xl animate-pulse" style={{ background: '#1A1240' }} />
              ))}
            </>
          ) : details && (
            <>
              {/* Demandeur */}
              {details.senderName && (
                <DetailRow icon="👤" label="Demandeur" value={details.senderName} />
              )}

              {/* Téléphone cliquable */}
              {details.senderPhone && (
                <a href={`tel:${details.senderPhone}`} className="block">
                  <DetailRow icon={<Phone size={14} color="#10B981" />} label="Téléphone" value={details.senderPhone} accent="#10B981" clickable />
                </a>
              )}

              {/* Logement */}
              {details.listingTitle && (
                <DetailRow icon={<Home size={14} color={cfg.color} />} label="Logement" value={details.listingTitle} />
              )}

              {/* Message */}
              {details.message && (
                <div className="px-4 py-3 rounded-2xl" style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] text-[#6B5FA0] uppercase tracking-wider mb-1" style={{ fontFamily: 'Space Grotesk' }}>Message</p>
                  <p className="text-sm text-[#C4B5FD] leading-relaxed italic" style={{ fontFamily: 'Space Grotesk' }}>
                    "{details.message}"
                  </p>
                </div>
              )}

              {/* Montant */}
              {details.amount && (
                <div
                  className="flex items-center justify-between px-4 py-3 rounded-2xl"
                  style={{ background: `${cfg.color}10`, border: `1px solid ${cfg.color}20` }}
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: cfg.color, fontFamily: 'Space Grotesk' }}>Montant</p>
                    <p className="font-nunito font-900 text-white text-xl">{fmt(details.amount)}</p>
                  </div>
                  <Wallet size={24} style={{ color: cfg.color }} className="opacity-60" />
                </div>
              )}

              {/* Opérateur */}
              {details.operator && (
                <DetailRow icon="📱" label="Opérateur" value={`${operatorLabel(details.operator)}${details.destinationPhone ? ' · ' + details.destinationPhone : ''}`} />
              )}

              {/* Période */}
              {details.period && (
                <DetailRow icon={<Clock size={14} color={cfg.color} />} label="Période" value={details.period} />
              )}
            </>
          )}
        </div>

        {/* ── Bouton d'action ── */}
        {navLabel[notif.type] && (
          <div className="px-5 py-4">
            <button
              onClick={onNavigate}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.97]"
              style={{
                background: `linear-gradient(135deg, ${cfg.color}CC, ${cfg.color})`,
                color: 'white',
                fontFamily: 'Space Grotesk',
                boxShadow: `0 8px 24px ${cfg.color}40`,
              }}
            >
              {navLabel[notif.type]}
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* Safe area bottom */}
        <div className="h-safe-area pb-2" />
      </div>
    </div>
  );
}

/* ── Ligne de détail réutilisable ── */
function DetailRow({
  icon, label, value, accent, clickable,
}: {
  icon: React.ReactNode | string;
  label: string;
  value: string;
  accent?: string;
  clickable?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl"
      style={{
        background: '#1A1240',
        border: '1px solid rgba(255,255,255,0.05)',
        ...(clickable ? { borderColor: `${accent}30` } : {}),
      }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: accent ? `${accent}18` : 'rgba(123,63,228,0.1)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-[#6B5FA0] mb-0.5" style={{ fontFamily: 'Space Grotesk' }}>{label}</p>
        <p className="text-sm font-semibold truncate" style={{ color: accent ?? '#E8E0FF', fontFamily: 'Space Grotesk' }}>{value}</p>
      </div>
      {clickable && <ChevronRight size={14} style={{ color: accent }} className="flex-shrink-0 opacity-70" />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Carte de notification (style iOS/Android)
───────────────────────────────────────────────────────────── */
function NotifCard({ notif, onClick }: { notif: any; onClick: () => void }) {
  const cfg = T[notif.type] ?? DEFAULT_T;
  const isUnread = !notif.is_read;

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-2xl transition-all active:scale-[0.98] hover:brightness-110"
      style={{
        background: isUnread ? '#15103C' : '#0E0B26',
        border: `1px solid ${isUnread ? cfg.color + '30' : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isUnread ? `0 0 0 1px ${cfg.color}15 inset` : 'none',
      }}
    >
      {/* Barre accent gauche */}
      <div
        className="self-stretch w-[3px] rounded-full flex-shrink-0 mt-0.5"
        style={{ background: isUnread ? cfg.color : 'rgba(255,255,255,0.06)', minHeight: '36px' }}
      />

      {/* Icône / Avatar app */}
      <div
        className="w-10 h-10 rounded-[14px] flex items-center justify-center flex-shrink-0 text-xl"
        style={{ background: cfg.bg, border: `1px solid ${cfg.color}20` }}
      >
        {cfg.emoji}
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        {/* Ligne 1 : app label + temps */}
        <div className="flex items-center justify-between mb-0.5">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: cfg.color, fontFamily: 'Space Grotesk' }}
          >
            {cfg.label}
          </span>
          <span
            className="text-[10px] flex-shrink-0 ml-2"
            style={{ color: isUnread ? '#8B7BB5' : '#4A3D7A', fontFamily: 'Space Grotesk' }}
          >
            {relTime(notif.created_at)}
          </span>
        </div>

        {/* Ligne 2 : Titre */}
        <p
          className="text-sm leading-snug"
          style={{
            color: isUnread ? '#F0ECFF' : '#6B5FA0',
            fontWeight: isUnread ? 700 : 500,
            fontFamily: 'Nunito Sans, sans-serif',
          }}
        >
          {notif.title}
        </p>

        {/* Ligne 3 : Corps aperçu */}
        {notif.body && (
          <p
            className="text-xs mt-0.5 line-clamp-1"
            style={{
              color: isUnread ? '#6B5FA0' : '#3D3260',
              fontFamily: 'Space Grotesk',
              lineHeight: '1.4',
            }}
          >
            {notif.body}
          </p>
        )}
      </div>

      {/* Puce non-lu à droite */}
      {isUnread && (
        <div
          className="w-2 h-2 rounded-full flex-shrink-0 mt-2"
          style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }}
        />
      )}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────
   Page principale
───────────────────────────────────────────────────────────── */
export default function Notifications() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications(profile?.id);

  const [tab, setTab] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<any | null>(null);
  const [details, setDetails] = useState<NotifDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  /* ── Filtrage ─────────────────────────────────── */
  const filtered = useMemo(() => notifications.filter(n => {
    const cat = (T[n.type] ?? DEFAULT_T).category;
    if (tab === 'all')      return true;
    if (tab === 'unread')   return !n.is_read;
    if (tab === 'demandes') return cat === 'demandes';
    if (tab === 'finances') return cat === 'finances';
    return true;
  }), [notifications, tab]);

  /* ── Groupement par date ──────────────────────── */
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  /* ── Chargement des détails ───────────────────── */
  const loadDetails = useCallback(async (notif: any) => {
    if (!notif.related_id) { setDetails(null); return; }
    setLoadingDetails(true);
    try {
      const d: NotifDetails = {};
      if (notif.type === 'nouvelle_demande_contact') {
        const { data } = await supabase
          .from('contact_requests')
          .select('message, contact_phone, users(full_name), listings(title)')
          .eq('id', notif.related_id)
          .single();
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
          .single();
        if (data) {
          d.amount = data.amount;
          d.operator = data.operator;
          d.destinationPhone = data.destination_phone;
        }
      } else if (['nouveau_versement', 'confirmation', 'retard', 'rappel'].includes(notif.type)) {
        const { data } = await supabase
          .from('rent_periods')
          .select('amount_due, period_month, period_year, leases(properties(name))')
          .eq('id', notif.related_id)
          .single();
        if (data) {
          d.amount = data.amount_due;
          const months = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
          d.period = `${months[(data.period_month ?? 1) - 1]} ${data.period_year}`;
          d.listingTitle = (data.leases as any)?.properties?.name;
        }
      }
      setDetails(d);
    } catch { setDetails(null); }
    finally { setLoadingDetails(false); }
  }, []);

  /* ── Clic sur une carte ───────────────────────── */
  const handleClick = async (notif: any) => {
    if (!notif.is_read) await markRead(notif.id);
    setDetails(null);
    setSelected(notif);
    loadDetails(notif);
  };

  /* ── Navigation depuis sheet ──────────────────── */
  const handleNavigate = () => {
    if (!selected) return;
    setSelected(null);
    const { type } = selected;
    if (['nouveau_versement','confirmation','retard','rappel'].includes(type)) {
      navigate(role === 'proprietaire' ? '/pro/dashboard' : '/historique');
    } else if (type === 'nouvelle_demande_contact') {
      navigate(role === 'proprietaire' ? '/pro/demandes' : '/mes-demandes');
    } else if (['retrait_complete','retrait_echoue'].includes(type)) {
      navigate('/pro/wallet');
    } else if (type === 'nouveau_locataire') {
      navigate('/pro/dashboard');
    }
  };

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all',      label: 'Toutes',   count: notifications.length },
    { key: 'unread',   label: 'Non lues', count: unreadCount || undefined },
    { key: 'demandes', label: 'Demandes' },
    { key: 'finances', label: 'Finances' },
  ];

  const selectedCfg = selected ? (T[selected.type] ?? DEFAULT_T) : DEFAULT_T;

  return (
    <>
      <div className="page-container" style={{ paddingBottom: '24px' }}>

        {/* ── Header ─────────────────────────────────────── */}
        <header className="sticky-header px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="font-nunito font-900 text-lg text-white leading-none">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-[11px] text-[#A855F7] mt-0.5" style={{ fontFamily: 'Space Grotesk' }}>
                  {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all active:scale-95"
              style={{
                background: 'rgba(168,85,247,0.1)',
                color: '#A855F7',
                border: '1px solid rgba(168,85,247,0.22)',
                fontFamily: 'Space Grotesk',
              }}
            >
              Tout lire
            </button>
          )}
        </header>

        {/* ── Onglets ─────────────────────────────────────── */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {tabs.map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95"
                style={{
                  fontFamily: 'Space Grotesk',
                  background: active ? '#7B3FE4' : 'rgba(255,255,255,0.04)',
                  color: active ? 'white' : '#6B5FA0',
                  border: active ? 'none' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className="text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center"
                    style={{
                      background: active ? 'rgba(255,255,255,0.2)' : 'rgba(168,85,247,0.25)',
                      color: active ? 'white' : '#C4B5FD',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Séparateur ── */}
        <div style={{ height: '1px', background: 'rgba(123,63,228,0.08)', margin: '0 0 8px 0' }} />

        {/* ── Liste groupée ────────────────────────────────── */}
        {loading ? (
          <div className="px-4 space-y-1 pt-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-start gap-3 py-3">
                <div className="w-10 h-10 rounded-[14px] animate-pulse flex-shrink-0" style={{ background: '#1A1240' }} />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 rounded-full animate-pulse w-1/3" style={{ background: '#1A1240' }} />
                  <div className="h-3.5 rounded-full animate-pulse w-3/4" style={{ background: '#1A1240' }} />
                  <div className="h-3 rounded-full animate-pulse w-1/2" style={{ background: '#1A1240' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucune notification"
            description={tab === 'unread' ? 'Vous avez tout lu ✓' : 'Vos alertes apparaîtront ici.'}
          />
        ) : (
          <div className="px-4 space-y-2">
            {groups.map(({ label, items }) => (
              <div key={label}>
                {/* Titre du groupe */}
                <div className="flex items-center gap-2 mb-2 mt-1">
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: '#4A3D7A', fontFamily: 'Space Grotesk' }}
                  >
                    {label}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                </div>

                {/* Cartes individuelles */}
                <div className="space-y-2">
                  {items.map(notif => (
                    <NotifCard key={notif.id} notif={notif} onClick={() => handleClick(notif)} />
                  ))}
                </div>

                <div className="h-1" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sheet de détail ─────────────────────────────── */}
      {selected && (
        <DetailSheet
          notif={selected}
          cfg={selectedCfg}
          details={details}
          loading={loadingDetails}
          onClose={() => setSelected(null)}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
