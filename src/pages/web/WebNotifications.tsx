import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CreditCard, MessageSquare, ShieldCheck, Check, ArrowRight, Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { Notification } from '../../lib/supabase';

export default function WebNotifications() {
  const { user, profile } = useAuth();
  const { notifications, loading, markRead, markAllRead, unreadCount } = useNotifications(user?.id);
  const role = profile?.role || 'locataire';
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    return notifications.filter((n) => (filter === 'unread' ? !n.is_read : true));
  }, [notifications, filter]);

  // Groupement par date
  const groupedNotifications = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const groups: { [key: string]: Notification[] } = {
      "Aujourd'hui": [],
      "Cette semaine": [],
      "Plus anciennes": [],
    };

    filtered.forEach((n) => {
      const nDate = new Date(n.created_at);
      if (nDate >= today) {
        groups["Aujourd'hui"].push(n);
      } else if (nDate >= sevenDaysAgo) {
        groups["Cette semaine"].push(n);
      } else {
        groups["Plus anciennes"].push(n);
      }
    });

    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filtered]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'confirmation':
      case 'nouveau_versement':
        return <CreditCard size={18} className="text-emerald-600" />;
      case 'nouvelle_demande_contact':
        return <MessageSquare size={18} className="text-[var(--imx-accent)]" />;
      case 'owner_verified':
        return <ShieldCheck size={18} className="text-[#10B981]" />;
      default:
        return <Bell size={18} className="text-[var(--imx-accent)]" />;
    }
  };

  const getBadgeLabel = (type: string) => {
    switch (type) {
      case 'confirmation':
      case 'nouveau_versement':
        return 'Paiement';
      case 'nouvelle_demande_contact':
        return 'Visite';
      case 'owner_verified':
        return 'Sécurité';
      default:
        return 'Système';
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      await markRead(n.id);
    }

    // Routing contextuel par type + rôle
    switch (n.type) {
      case 'confirmation':
        // Locataire : voir son reçu. Propriétaire : voir le tableau de bord
        if (role === 'locataire' && n.related_id) {
          navigate(`/web/recu/${n.related_id}`);
        } else if (role === 'locataire') {
          navigate('/web/paiements');
        } else {
          navigate('/web/pro/dashboard');
        }
        break;
      case 'nouveau_versement':
        // Toujours côté propriétaire → dashboard ou locataires
        navigate('/web/pro/dashboard');
        break;
      case 'rappel':
      case 'retard':
        navigate('/web/paiements');
        break;
      case 'nouvelle_demande_contact':
        navigate('/web/pro/demandes');
        break;
      case 'nouveau_locataire':
        navigate('/web/pro/locataires');
        break;
      case 'retrait_complete':
      case 'retrait_echoue':
      case 'alerte':
        navigate('/web/pro/wallet');
        break;
      case 'owner_verified':
        navigate('/web/pro/wallet');
        break;
      case 'owner_verification_rejected':
        navigate('/web/pro/verification');
        break;
      case 'suppression_annonce_approuvee':
      case 'suppression_annonce_rejetee':
      case 'suppression_annonce_demandee':
        navigate('/web/pro/annonces');
        break;
      default:
        // Fallback : annonce si related_id, sinon tableau de bord
        if (n.related_id) {
          navigate(`/web/annonce/${n.related_id}`);
        } else if (role === 'proprietaire') {
          navigate('/web/pro/dashboard');
        } else if (role === 'locataire') {
          navigate('/web/dashboard');
        } else if (role === 'agence') {
          navigate('/web/agence/dashboard');
        }
        break;
    }
  };

  const handleQuickMarkRead = async (e: React.MouseEvent, nId: string) => {
    e.stopPropagation();
    await markRead(nId);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-[var(--imx-accent)] uppercase tracking-wider">
              Messagerie & Alertes
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Centre de notifications
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivez l'activité de vos baux, loyers, règlements et demandes en temps réel.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border transition-colors bg-white hover:bg-gray-50 text-[var(--imx-accent)] shadow-2xs"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <CheckCheck size={14} /> Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            filter === 'all'
              ? 'bg-[#17132B] text-white shadow-xs'
              : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
          style={filter !== 'all' ? { borderColor: 'var(--imx-border)' } : undefined}
        >
          Toutes ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-[var(--imx-accent)] text-white shadow-xs'
              : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
          style={filter !== 'unread' ? { borderColor: 'var(--imx-border)' } : undefined}
        >
          Non lues
          {unreadCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              filter === 'unread' ? 'bg-white/20 text-white' : 'bg-purple-100 text-[var(--imx-accent)]'
            }`}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : groupedNotifications.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border bg-white shadow-2xs" style={{ borderColor: 'var(--imx-border)' }}>
          <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3 text-[var(--imx-accent)]">
            <Bell size={28} />
          </div>
          <h3 className="text-base font-bold text-gray-800 mb-1">
            {filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification reçue'}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {filter === 'unread'
              ? 'Vous êtes parfaitement à jour ! Toutes vos alertes ont été consultées.'
              : 'Vous recevrez ici les confirmations de vos transactions, alertes de loyer et demandes de locataires.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedNotifications.map(([period, notifs]) => (
            <div key={period} className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-gray-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {period}
                </h2>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              <div className="rounded-2xl border bg-white overflow-hidden shadow-xs divide-y" style={{ borderColor: 'var(--imx-border)' }}>
                {notifs.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-4 sm:p-5 flex items-start gap-4 cursor-pointer transition-colors group hover:bg-gray-50/80 ${
                      !n.is_read ? 'bg-purple-50/20' : ''
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-2xs"
                      style={{ background: !n.is_read ? '#F1EBFF' : '#F8F7FC' }}
                    >
                      {getIcon(n.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            n.type === 'nouveau_versement' || n.type === 'confirmation'
                              ? 'bg-emerald-50 text-emerald-700'
                              : n.type === 'nouvelle_demande_contact'
                              ? 'bg-purple-50 text-[var(--imx-accent)]'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {getBadgeLabel(n.type)}
                          </span>
                          <h4 className={`text-sm ${!n.is_read ? 'font-black text-[#17132B]' : 'font-semibold text-gray-700'}`}>
                            {n.title}
                          </h4>
                        </div>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed">
                        {n.body}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 self-center">
                      {!n.is_read ? (
                        <button
                          onClick={(e) => handleQuickMarkRead(e, n.id)}
                          title="Marquer comme lu"
                          className="p-1.5 rounded-lg border bg-white text-gray-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
                          style={{ borderColor: 'var(--imx-border)' }}
                        >
                          <Check size={14} />
                        </button>
                      ) : (
                        <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-600 transition-colors" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

