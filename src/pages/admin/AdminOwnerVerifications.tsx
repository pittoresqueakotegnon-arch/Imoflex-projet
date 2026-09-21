import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Eye, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { OwnerVerificationRequest, OwnerVerificationRequestStatus, supabase } from '../../lib/supabase';
import { getPrivateVerificationDocumentUrl } from '../../lib/ownerVerification';
import { formatDate } from '../../lib/utils';
import { useToast } from '../../components/Toast';

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

interface AdminVerificationRequest extends OwnerVerificationRequest {
  owner?: { id: string; full_name: string; email?: string | null; phone?: string | null; avatar_url?: string | null } | null;
}

type AdminVerificationQueryRow = Omit<AdminVerificationRequest, 'owner'> & {
  owner?: AdminVerificationRequest['owner'] | NonNullable<AdminVerificationRequest['owner']>[];
};

const requestStatusMeta: Record<Exclude<OwnerVerificationRequestStatus, 'draft'>, { label: string; color: string; background: string }> = {
  pending: { label: 'À examiner', color: '#D97706', background: 'rgba(217,119,6,0.12)' },
  approved: { label: 'Validée', color: '#10B981', background: 'rgba(16,185,129,0.12)' },
  rejected: { label: 'Refusée', color: '#EF4444', background: 'rgba(239,68,68,0.12)' },
};

const documentLabels: Record<string, string> = {
  cni: 'Carte nationale d’identité',
  passeport: 'Passeport',
  permis_conduire: 'Permis de conduire',
};

function StatusPill({ status }: { status: Exclude<OwnerVerificationRequestStatus, 'draft'> }) {
  const meta = requestStatusMeta[status];
  return <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ background: meta.background, color: meta.color }}>{meta.label}</span>;
}

function DocumentPreview({ url, title }: { url: string | null; title: string }) {
  if (!url) {
    return <div className="flex h-44 items-center justify-center rounded-xl border text-xs" style={{ borderColor: 'var(--adm-border)', color: 'var(--adm-text-dim)' }}>Document indisponible</div>;
  }
  const isPdf = url.toLowerCase().includes('.pdf');
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--adm-border)' }}>
      {isPdf ? (
        <iframe title={title} src={url} className="h-52 w-full" />
      ) : (
        <img src={url} alt={title} className="h-52 w-full object-contain" style={{ background: 'var(--adm-surface-alt)' }} />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="block border-t px-3 py-2 text-center text-xs font-semibold" style={{ borderColor: 'var(--adm-border)', color: 'var(--adm-accent)' }}>
        Ouvrir {title.toLowerCase()}
      </a>
    </div>
  );
}

export default function AdminOwnerVerifications() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [requests, setRequests] = useState<AdminVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminVerificationRequest | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminNote, setAdminNote] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('owner_verification_requests')
        .select('id, owner_id, status, legal_name, document_type, document_number_last4, identity_front_path, identity_back_path, fee_required, fee_amount, fee_status, fee_payment_reference, fee_paid_at, submitted_at, reviewed_at, reviewed_by, rejection_reason, admin_note, created_at, updated_at, owner:users!owner_id(id, full_name, email, phone, avatar_url)')
        .neq('status', 'draft')
        .order('submitted_at', { ascending: true });
      if (filter !== 'all') query = query.eq('status', filter);
      const { data, error } = await query;
      if (error) throw error;
      const normalizedRequests = ((data || []) as unknown as AdminVerificationQueryRow[]).map(({ owner, ...request }) => ({
        ...request,
        owner: Array.isArray(owner) ? owner[0] ?? null : owner ?? null,
      }));
      setRequests(normalizedRequests);
    } catch (fetchError) {
      console.error('[AdminOwnerVerifications] fetch error:', fetchError);
      showToast('Impossible de charger les vérifications propriétaires.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((request) => request.status === 'pending').length,
    approved: requests.filter((request) => request.status === 'approved').length,
    rejected: requests.filter((request) => request.status === 'rejected').length,
  }), [requests]);

  const openRequest = async (request: AdminVerificationRequest) => {
    setSelected(request);
    setRejectionReason('');
    setAdminNote('');
    setFrontUrl(null);
    setBackUrl(null);
    if (!request.identity_front_path || !request.identity_back_path) return;
    setDocumentsLoading(true);
    try {
      const [front, back] = await Promise.all([
        getPrivateVerificationDocumentUrl(request.identity_front_path),
        getPrivateVerificationDocumentUrl(request.identity_back_path),
      ]);
      setFrontUrl(front);
      setBackUrl(back);
    } catch (documentError) {
      console.error('[AdminOwnerVerifications] document access error:', documentError);
      showToast('Impossible d’ouvrir un ou plusieurs documents privés.', 'error');
    } finally {
      setDocumentsLoading(false);
    }
  };

  const closeModal = () => {
    if (reviewing) return;
    setSelected(null);
    setFrontUrl(null);
    setBackUrl(null);
  };

  const review = async (decision: 'approved' | 'rejected') => {
    if (!selected || reviewing) return;
    if (decision === 'rejected' && rejectionReason.trim().length < 5) {
      showToast('Un motif de refus clair est obligatoire.', 'error');
      return;
    }
    setReviewing(true);
    try {
      const { error } = await supabase.rpc('admin_review_owner_verification', {
        p_request_id: selected.id,
        p_decision: decision,
        p_rejection_reason: decision === 'rejected' ? rejectionReason.trim() : null,
        p_admin_note: adminNote.trim() || null,
      });
      if (error) throw error;
      showToast(decision === 'approved' ? 'Propriétaire vérifié et retraits débloqués.' : 'Dossier refusé. Le propriétaire a été notifié.', 'success');
      closeModal();
      await fetchRequests();
    } catch (reviewError) {
      const message = reviewError instanceof Error ? reviewError.message : 'Impossible de traiter cette demande.';
      showToast(message, 'error');
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="w-full space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: 'Space Grotesk', color: 'var(--adm-text)' }}>Vérifications propriétaires</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--adm-text-muted)' }}>Contrôlez les dossiers d’identité avant d’autoriser les retraits.</p>
        </div>
        <button onClick={fetchRequests} disabled={loading} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)', color: 'var(--adm-accent)' }}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      <section className="rounded-2xl border p-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'Toutes'],
            ['pending', 'À examiner'],
            ['approved', 'Validées'],
            ['rejected', 'Refusées'],
          ] as Array<[Filter, string]>).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} className="rounded-lg border px-3 py-2 text-xs font-semibold transition-colors" style={{ background: filter === value ? 'rgba(124,58,237,0.16)' : 'var(--adm-surface-alt)', borderColor: filter === value ? 'rgba(124,58,237,0.35)' : 'var(--adm-border)', color: filter === value ? 'var(--adm-accent)' : 'var(--adm-text-muted)' }}>
              {label} {filter === value ? `(${counts[value]})` : ''}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }} />)}</div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border px-6 py-14 text-center" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <ShieldCheck size={32} className="mx-auto mb-3" style={{ color: 'var(--adm-accent)' }} />
          <p className="font-semibold" style={{ color: 'var(--adm-text)' }}>Aucun dossier dans cette vue</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--adm-text-dim)' }}>Les nouvelles soumissions apparaîtront ici.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const status = request.status as Exclude<OwnerVerificationRequestStatus, 'draft'>;
            return (
              <button key={request.id} onClick={() => openRequest(request)} className="w-full rounded-2xl border p-4 text-left transition-transform hover:scale-[1.002]" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold" style={{ color: 'var(--adm-text)' }}>{request.owner?.full_name || request.legal_name}</p>
                      <StatusPill status={status} />
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--adm-text-muted)' }}>{documentLabels[request.document_type]} · •••• {request.document_number_last4}</p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--adm-text-dim)' }}>Soumis le {request.submitted_at ? formatDate(request.submitted_at) : formatDate(request.created_at)}</p>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--adm-accent)' }}><Eye size={14} /> Examiner</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm lg:items-center" onClick={closeModal}>
          <div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-2xl border p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><h2 className="text-lg font-bold" style={{ color: 'var(--adm-text)', fontFamily: 'Space Grotesk' }}>{selected.owner?.full_name || selected.legal_name}</h2><StatusPill status={selected.status as Exclude<OwnerVerificationRequestStatus, 'draft'>} /></div>
                <p className="mt-1 text-xs" style={{ color: 'var(--adm-text-muted)' }}>{selected.owner?.email || 'E-mail non renseigné'} · {selected.owner?.phone || 'Téléphone non renseigné'}</p>
              </div>
              <button onClick={closeModal} aria-label="Fermer" className="rounded-lg p-2" style={{ color: 'var(--adm-text-muted)', background: 'var(--adm-surface-alt)' }}><XCircle size={18} /></button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border p-4" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface-alt)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--adm-text-dim)' }}>Informations déclarées</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt style={{ color: 'var(--adm-text-muted)' }}>Nom légal</dt><dd className="text-right font-semibold" style={{ color: 'var(--adm-text)' }}>{selected.legal_name}</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: 'var(--adm-text-muted)' }}>Pièce</dt><dd className="text-right font-semibold" style={{ color: 'var(--adm-text)' }}>{documentLabels[selected.document_type]}</dd></div>
                  <div className="flex justify-between gap-3"><dt style={{ color: 'var(--adm-text-muted)' }}>N° enregistré</dt><dd className="font-mono font-semibold" style={{ color: 'var(--adm-text)' }}>•••• {selected.document_number_last4}</dd></div>
                  {selected.fee_required && <div className="flex justify-between gap-3"><dt style={{ color: 'var(--adm-text-muted)' }}>Frais</dt><dd className="font-semibold" style={{ color: selected.fee_status === 'paid' || selected.fee_status === 'waived' ? '#10B981' : '#EF4444' }}>{selected.fee_status} · {selected.fee_amount} FCFA</dd></div>}
                </dl>
              </section>
              <section className="rounded-xl border p-4" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface-alt)' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--adm-text-dim)' }}>Décision</p>
                {selected.status === 'rejected' ? <p className="mt-3 text-sm text-red-400">{selected.rejection_reason || 'Motif non renseigné'}</p> : selected.status === 'approved' ? <p className="mt-3 flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={16} /> Validée le {selected.reviewed_at ? formatDate(selected.reviewed_at) : '—'}</p> : <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--adm-text-muted)' }}><Clock3 size={16} /> Aucune décision enregistrée</p>}
                {selected.admin_note && <p className="mt-3 border-t pt-3 text-xs" style={{ borderColor: 'var(--adm-border)', color: 'var(--adm-text-muted)' }}>{selected.admin_note}</p>}
              </section>
            </div>

            <section className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--adm-text-dim)' }}>Documents privés</p>
              {documentsLoading ? <div className="grid gap-3 md:grid-cols-2"><div className="h-52 animate-pulse rounded-xl" style={{ background: 'var(--adm-surface-alt)' }} /><div className="h-52 animate-pulse rounded-xl" style={{ background: 'var(--adm-surface-alt)' }} /></div> : <div className="grid gap-3 md:grid-cols-2"><DocumentPreview title="Recto" url={frontUrl} /><DocumentPreview title="Verso / seconde page" url={backUrl} /></div>}
            </section>

            {selected.status === 'pending' && (
              <section className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--adm-border)', background: 'var(--adm-surface-alt)' }}>
                <label className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--adm-text-muted)' }}>Note interne (facultative)</label>
                <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} maxLength={2000} rows={2} className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm outline-none" style={{ borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }} />
                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--adm-text-muted)' }}>Motif de refus (obligatoire seulement en cas de refus)</label>
                <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={3} placeholder="Expliquez clairement ce qui doit être corrigé." className="mt-2 w-full rounded-lg border bg-transparent p-3 text-sm outline-none" style={{ borderColor: 'var(--adm-border)', color: 'var(--adm-text)' }} />
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button onClick={() => review('rejected')} disabled={reviewing || documentsLoading} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold text-red-400 disabled:opacity-50">Refuser</button>
                  <button onClick={() => review('approved')} disabled={reviewing || documentsLoading} className="rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: 'var(--adm-accent)' }}>{reviewing ? 'Traitement…' : 'Valider la vérification'}</button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
