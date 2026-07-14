import React, { useState, useEffect } from 'react';
import { Search, Filter, Shield, MoreVertical, X, Check, Eye } from 'lucide-react';
import { supabase, UserProfile } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../hooks/useAuth';
import { logAction } from '../../lib/audit';

const AdminUtilisateurs: React.FC = () => {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [toggling, setToggling] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    userId: string;
    newStatus: 'actif' | 'suspendu' | 'banni';
    label: string;
    color: string;
  } | null>(null);

  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, account_status, is_active, created_at, properties(count), leases(count)')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setUsers((data || []) as UserProfile[]);
    } catch (error) {
      console.error('Error fetching users:', error);
      showToast('Erreur lors du chargement des utilisateurs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeStatus = async (userId: string, newStatus: 'actif' | 'suspendu' | 'banni') => {
    if (newStatus === 'banni' || newStatus === 'suspendu') {
      const labels: Record<string, { label: string; color: string }> = {
        banni: { label: 'Bannir cet utilisateur ?', color: '#EF4444' },
        suspendu: { label: 'Suspendre cet utilisateur ?', color: '#FBBF24' },
      };
      setConfirmModal({ userId, newStatus, label: labels[newStatus].label, color: labels[newStatus].color });
      return;
    }
    await doChangeStatus(userId, newStatus);
  };

  const doChangeStatus = async (userId: string, newStatus: 'actif' | 'suspendu' | 'banni') => {
    setConfirmModal(null);
    setToggling(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ account_status: newStatus, is_active: newStatus === 'actif' })
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map(u =>
        u.id === userId ? { ...u, account_status: newStatus, is_active: newStatus === 'actif' } as any : u
      ));

      const labels: Record<string, string> = { actif: 'réactivé', suspendu: 'suspendu', banni: 'banni' };
      showToast(`Utilisateur ${labels[newStatus]}`, 'success');

      if (profile) {
        logAction({
          userId: profile.id,
          action: newStatus === 'banni' ? 'suppression_compte' : newStatus === 'suspendu' ? 'suspension_compte' : 'reactivation_compte',
          entityType: 'users',
          entityId: userId,
          details: { status: newStatus }
        });
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      showToast('Erreur lors de la mise à jour', 'error');
    } finally {
      setToggling(null);
    }
  };

  const handleChangeRole = async (userId: string, currentRole: string, newRole: string) => {
    if (currentRole === newRole) return;
    // Just update directly without confirm for role changes (less destructive)
    setToggling(userId);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
      showToast(`Rôle mis à jour avec succès`, 'success');

      if (profile) {
        logAction({
          userId: profile.id,
          action: 'changement_role',
          entityType: 'users',
          entityId: userId,
          details: { oldRole: currentRole, newRole }
        });
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      showToast('Erreur lors de la mise à jour du rôle', 'error');
    } finally {
      setToggling(null);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'locataire':
        return 'bg-blue-500/10 text-blue-400';
      case 'proprietaire':
        return 'bg-violet/10 text-violet-light';
      case 'admin':
        return 'bg-amber-500/10 text-amber-400';
      default:
        return 'bg-text-dim/10 text-text-dim';
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      locataire: 'Locataire',
      proprietaire: 'Propriétaire',
      admin: 'Admin',
    };
    return labels[role] || role;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  if (loading && page === 1) {
    return (
      <div className="w-full">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border h-24 animate-pulse" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-6" style={{ color: 'var(--adm-text)' }}>Gestion des utilisateurs</h1>

        <div className="space-y-2">
          {users.map(user => (
            <div key={user.id} className="rounded-xl border p-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--adm-accent)' }}>
                  <span className="font-nunito font-700 text-sm" style={{ color: '#ffffff' }}>
                    {getInitials(user.full_name)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate" style={{ color: 'var(--adm-text)' }}>{user.full_name}</h3>
                  <div className="flex items-center gap-2 text-xs mt-0.5 truncate" style={{ color: 'var(--adm-text-dim)' }}>
                    <span>{user.email || 'N/A'}</span>
                    {user.role === 'proprietaire' && (user as any).properties?.[0]?.count !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 font-semibold" style={{ fontSize: '10px' }}>
                        {(user as any).properties[0].count} propriété{(user as any).properties[0].count !== 1 ? 's' : ''}
                      </span>
                    )}
                    {user.role === 'locataire' && (user as any).leases?.[0]?.count !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-400 font-semibold" style={{ fontSize: '10px' }}>
                        {(user as any).leases[0].count} logement{(user as any).leases[0].count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <select
                    value={user.role}
                    onChange={(e) => handleChangeRole(user.id, user.role, e.target.value)}
                    disabled={toggling === user.id}
                    className={`badge text-xs cursor-pointer outline-none border-none appearance-none ${getRoleColor(user.role)}`}
                    style={{ paddingRight: '1rem' }}
                  >
                    <option value="locataire">Locataire</option>
                    <option value="proprietaire">Propriétaire</option>
                    <option value="admin">Admin</option>
                  </select>

                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      (user as any).account_status === 'actif' || (!('account_status' in (user as any)) && user.is_active)
                        ? 'bg-green-500/20 text-green-400'
                        : (user as any).account_status === 'banni'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {(user as any).account_status === 'banni' ? 'Banni' : (user as any).account_status === 'suspendu' ? 'Suspendu' : 'Actif'}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  {((user as any).account_status === 'suspendu' || (user as any).account_status === 'banni') && (
                    <button
                      onClick={() => handleChangeStatus(user.id, 'actif')}
                      disabled={toggling === user.id}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition disabled:opacity-50 bg-green-500/20 hover:bg-green-500/30 text-green-400"
                    >
                      Activer
                    </button>
                  )}
                  {((user as any).account_status === 'actif' || (!('account_status' in (user as any)) && user.is_active)) && (
                    <button
                      onClick={() => handleChangeStatus(user.id, 'suspendu')}
                      disabled={toggling === user.id}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition disabled:opacity-50 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400"
                    >
                      Suspendre
                    </button>
                  )}
                  {(user as any).account_status !== 'banni' && user.role !== 'admin' && (
                    <button
                      onClick={() => handleChangeStatus(user.id, 'banni')}
                      disabled={toggling === user.id}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition disabled:opacity-50 bg-red-500/20 hover:bg-red-500/30 text-red-400"
                    >
                      Bannir
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {users.length > 0 && (
          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="btn-ghost btn-sm disabled:opacity-50"
            >
              Précédent
            </button>

            <span className="text-sm text-text-dim">Page {page}</span>

            <button
              onClick={() => setPage(page + 1)}
              disabled={users.length < PAGE_SIZE}
              className="btn-ghost btn-sm disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        )}
      </div>

      {/* Confirm Modal (Suspendre / Bannir) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="rounded-2xl border p-6 w-full max-w-sm" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
              style={{ background: `${confirmModal.color}18`, border: `1px solid ${confirmModal.color}40` }}
            >
              {confirmModal.newStatus === 'banni' ? '🚫' : '⚠️'}
            </div>
            <h3 className="font-nunito font-900 text-lg text-center mb-4" style={{ color: 'var(--adm-text)' }}>
              {confirmModal.label}
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition"
                style={{ background: 'var(--adm-surface-alt)', color: 'var(--adm-text-muted)', borderColor: 'var(--adm-border)' }}
              >
                Annuler
              </button>
              <button
                onClick={() => doChangeStatus(confirmModal.userId, confirmModal.newStatus)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition"
                style={{ background: `${confirmModal.color}20`, color: confirmModal.color, border: `1px solid ${confirmModal.color}40` }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUtilisateurs;
