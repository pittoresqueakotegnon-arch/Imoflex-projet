import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';
import EmptyState from '../../components/EmptyState';
import { useToast } from '../../components/Toast';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  created_at: string;
  userName?: string;
  userRole?: string;
}

const AdminLogs: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Filters
  const [filterAction, setFilterAction] = useState<string>('all');
  
  const ACTION_TYPES = [
    { value: 'all', label: 'Toutes les actions' },
    { value: 'connexion', label: 'Connexion' },
    { value: 'inscription', label: 'Inscription' },
    { value: 'publication_annonce', label: 'Publication Annonce' },
    { value: 'validation_annonce', label: 'Validation Annonce' },
    { value: 'rejet_annonce', label: 'Rejet Annonce' },
    { value: 'paiement', label: 'Paiement' },
    { value: 'retrait', label: 'Retrait' },
    { value: 'echec_retrait', label: 'Échec Retrait' },
    { value: 'suspension_compte', label: 'Suspension Compte' },
    { value: 'suppression_compte', label: 'Suppression Compte' },
    { value: 'changement_role', label: 'Changement Rôle' },
  ];

  useEffect(() => {
    fetchLogs();
  }, [page, filterAction]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          users (
            full_name,
            role
          )
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filterAction !== 'all') {
        query = query.eq('action', filterAction);
      }

      const { data, error } = await query;

      if (error) throw error;

      const enriched: AuditLog[] = (data || []).map((log: any) => ({
        ...log,
        userName: log.users?.full_name || 'Système / Inconnu',
        userRole: log.users?.role || 'N/A',
      }));

      setLogs(enriched);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      showToast('Erreur lors du chargement des logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getActionColor = (action: string) => {
    if (['suppression_compte', 'rejet_annonce', 'echec_retrait', 'suspension_compte'].includes(action)) {
      return 'text-red-400 bg-red-400/10 border-red-400/20';
    }
    if (['connexion', 'inscription', 'publication_annonce', 'paiement'].includes(action)) {
      return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    }
    if (['validation_annonce', 'retrait', 'reactivation_compte', 'changement_role'].includes(action)) {
      return 'text-green-400 bg-green-400/10 border-green-400/20';
    }
    return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
  };

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-2" style={{ color: 'var(--adm-text)' }}>Logs système</h1>
        <p className="text-xs font-space-grotesk mb-6" style={{ color: 'var(--adm-text-muted)' }}>
          Traçabilité complète des actions du système.
        </p>

        {/* Filters */}
        <div className="mb-6 flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {ACTION_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => { setFilterAction(type.value); setPage(1); }}
              className="whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold font-space-grotesk transition-colors border"
              style={{
                background: filterAction === type.value ? 'var(--adm-accent)' : 'var(--adm-surface-alt)',
                color: filterAction === type.value ? '#ffffff' : 'var(--adm-text-muted)',
                borderColor: filterAction === type.value ? 'transparent' : 'var(--adm-border)',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && logs.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border h-32 animate-pulse" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}></div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="Aucun journal d'audit"
            description="Le système n'a enregistré aucune action correspondant à ces critères."
          />
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              // Extraire l'IP et l'User Agent des détails
              const ip = log.details?.ip_address || 'Inconnue';
              const ua = log.details?.user_agent || 'N/A';
              
              // Cloner les détails pour retirer l'IP et l'UA de l'affichage JSON
              const cleanDetails = { ...log.details };
              delete cleanDetails.ip_address;
              delete cleanDetails.user_agent;

              return (
                <div key={log.id} className="rounded-xl p-4 border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold" style={{ color: 'var(--adm-text)' }}>{log.userName}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--adm-surface-alt)', color: 'var(--adm-text-muted)' }}>
                          {log.userRole}
                        </span>
                      </div>
                      <span className="text-[10px] font-space-grotesk flex items-center gap-2" style={{ color: 'var(--adm-text-dim)' }}>
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-1 rounded border ${getActionColor(log.action)}`}>
                      {formatAction(log.action)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-space-grotesk mb-3">
                    <div className="p-2 rounded border" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                      <span className="block mb-0.5" style={{ color: 'var(--adm-text-muted)' }}>Adresse IP</span>
                      <span className="font-mono" style={{ color: 'var(--adm-text)' }}>{ip}</span>
                    </div>
                    <div className="p-2 rounded border" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)' }}>
                      <span className="block mb-0.5" style={{ color: 'var(--adm-text-muted)' }}>Cible</span>
                      <span className="truncate block" style={{ color: 'var(--adm-text)' }}>{log.entity_type} ({log.entity_id?.slice(0, 8) || 'N/A'})</span>
                    </div>
                  </div>

                  {Object.keys(cleanDetails).length > 0 && (
                    <div className="p-2.5 rounded-lg text-[10px] font-mono overflow-x-auto border" style={{ background: 'var(--adm-surface-alt)', borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }}>
                      <pre>{JSON.stringify(cleanDetails, null, 2)}</pre>
                    </div>
                  )}
                  
                  {ua !== 'N/A' && (
                    <div className="mt-2 text-[9px] truncate" title={ua} style={{ color: 'var(--adm-text-dim)' }}>
                      {ua}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: 'var(--adm-divider)' }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
                className="btn-ghost btn-sm disabled:opacity-50"
              >
                Précédent
              </button>

              <span className="text-sm font-space-grotesk" style={{ color: 'var(--adm-text-muted)' }}>
                Page {page}
              </span>

              <button
                onClick={() => setPage(page + 1)}
                disabled={logs.length < PAGE_SIZE || loading}
                className="btn-ghost btn-sm disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLogs;
