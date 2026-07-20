import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import EmptyState from '../../components/EmptyState';

const TYPE_CONFIG: Record<string, { icon: string; bg: string }> = {
  rappel: { icon: '⏳', bg: 'rgba(245, 158, 11, 0.15)' },
  confirmation: { icon: '✅', bg: 'rgba(34, 197, 94, 0.15)' },
  retard: { icon: '⏳', bg: 'rgba(239, 68, 68, 0.15)' },
  nouveau_versement: { icon: '✅', bg: 'rgba(123, 63, 228, 0.15)' },
  nouveau_locataire: { icon: '💬', bg: 'rgba(34, 197, 94, 0.15)' },
  nouvelle_demande_contact: { icon: '💬', bg: 'rgba(139, 123, 181, 0.15)' },
  retrait_complete: { icon: '✅', bg: 'rgba(251, 191, 36, 0.15)' },
  retrait_echoue: { icon: '❌', bg: 'rgba(239, 68, 68, 0.15)' },
};

function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
}

export default function Notifications() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const { notifications, unreadCount, loading, markAllRead, markRead } = useNotifications(
    profile?.id
  );

  const handleNotificationClick = async (notif: any) => {
    if (!notif.is_read) {
      await markRead(notif.id);
    }
    
    if (notif.related_id) {
      if (['nouveau_versement', 'confirmation', 'retard'].includes(notif.type)) {
        if (role === 'proprietaire') {
          // Sur le dashboard pro, on pourrait aller vers un détail, pour l'instant vers dashboard ou une modale
          navigate('/pro/dashboard'); 
        } else {
          // Côté locataire, on redirige vers l'historique
          navigate('/historique');
        }
      } else if (notif.type === 'nouvelle_demande_contact') {
        navigate(role === 'proprietaire' ? '/pro/demandes' : '/mes-demandes');
      } else if (['retrait_complete', 'retrait_echoue'].includes(notif.type)) {
        navigate('/pro/wallet');
      }
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <header className="sticky-header px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="text-[#E8E0FF] hover:text-[#A855F7] p-1 -ml-1 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 className="font-nunito font-900 text-lg text-white">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <button
            className="text-[#A855F7] text-xs font-semibold"
            style={{ fontFamily: 'Space Grotesk' }}
            onClick={markAllRead}
          >
            Tout lire
          </button>
        )}
      </header>

      <div className="px-4 py-4 space-y-3 flex-1 pb-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="card h-20 animate-pulse"
              />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title="Aucune notification"
            description="Vos alertes et confirmations apparaîtront ici."
          />
        ) : (
          <div className="space-y-2.5">
            {notifications.map(notif => {
              const cfg = TYPE_CONFIG[notif.type] || { icon: '🔔', bg: 'rgba(38, 28, 85, 0.6)' };
              return (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className="card p-3 flex gap-3 cursor-pointer items-start transition-all hover:opacity-90"
                  style={{ opacity: notif.is_read ? 0.6 : 1 }}
                >
                  {/* Icon with dark circle background */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                    style={{ background: '#1E1545' }}
                  >
                    <span>{cfg.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-sm text-[#E8E0FF] leading-tight ${notif.is_read ? 'font-medium' : 'font-bold'}`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#A855F7] flex-shrink-0 mt-1"></div>
                      )}
                    </div>
                    <p className="text-xs text-[#8B7BB5] mt-1" style={{ fontFamily: 'Space Grotesk' }}>
                      {getRelativeTime(notif.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
