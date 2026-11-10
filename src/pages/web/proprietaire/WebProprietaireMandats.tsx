import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, FileText, Loader2, Plus, ShieldCheck, XCircle } from 'lucide-react';
import { supabase, AgenceMandat, PublicAgencyDirectoryEntry } from '../../../lib/supabase';
import { acceptAgencyMandate, grantAgencyMandate, terminateAgencyMandate } from '../../../lib/agencyMandates';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../components/Toast';

interface OwnedProperty { id: string; name: string; address: string; listing_id: string | null; }
interface OwnedListing { id: string; title: string; city: string; }
interface MandateRow {
  id: string;
  agence_id: string;
  listing_id: string | null;
  property_id: string | null;
  status: AgenceMandat['status'];
  commission_rate: number;
  owner_consented_at: string | null;
  created_at: string;
}

export default function WebProprietaireMandats() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [agencies, setAgencies] = useState<PublicAgencyDirectoryEntry[]>([]);
  const [properties, setProperties] = useState<OwnedProperty[]>([]);
  const [listings, setListings] = useState<OwnedListing[]>([]);
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [agencyId, setAgencyId] = useState('');
  const [resourceKey, setResourceKey] = useState('');
  const [commission, setCommission] = useState('10');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const resources = useMemo(() => [
    ...properties.map((item) => ({ key: `property:${item.id}`, id: item.id, propertyId: item.id, listingId: null as string | null, label: `${item.name} — ${item.address}` })),
    ...listings.map((item) => ({ key: `listing:${item.id}`, id: item.id, propertyId: null as string | null, listingId: item.id, label: `${item.title} — ${item.city}` })),
  ], [properties, listings]);
  const agencyNames = useMemo(() => new Map(agencies.map((agency) => [agency.id, agency.nom_agence])), [agencies]);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [agencyResult, propertyResult, listingResult, mandateResult] = await Promise.all([
      supabase.rpc('list_active_agencies'),
      supabase.from('properties').select('id,name,address,listing_id').eq('owner_id', user.id).order('name'),
      supabase.from('listings').select('id,title,city').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('agence_mandats')
        .select('id,agence_id,listing_id,property_id,status,commission_rate,owner_consented_at,created_at')
        .eq('owner_id', user.id).order('created_at', { ascending: false }),
    ]);
    const error = agencyResult.error || propertyResult.error || listingResult.error || mandateResult.error;
    if (error) showToast(`Impossible de charger les mandats : ${error.message}`, 'error');
    setAgencies((agencyResult.data || []) as PublicAgencyDirectoryEntry[]);
    setProperties((propertyResult.data || []) as OwnedProperty[]);
    setListings((listingResult.data || []) as OwnedListing[]);
    setMandates((mandateResult.data || []) as MandateRow[]);
    setLoading(false);
  }, [showToast, user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!agencyId || !resourceKey || !consent) {
      showToast('Choisissez une agence et un bien, puis confirmez explicitement le consentement.', 'error');
      return;
    }
    const selected = resources.find((resource) => resource.key === resourceKey);
    if (!selected) return;
    const rate = Number(commission);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      showToast('Le taux de commission doit être compris entre 0 et 100 %.', 'error');
      return;
    }
    setSaving(true);
    try {
      await grantAgencyMandate({
        agencyId,
        listingId: selected.listingId,
        propertyId: selected.propertyId,
        commissionRate: rate,
        notes: notes.trim() || null,
      });
      setAgencyId('');
      setResourceKey('');
      setCommission('10');
      setNotes('');
      setConsent(false);
      showToast('Mandat consenti et enregistré. L’identité du propriétaire et la date sont tracées côté serveur.', 'success');
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Le mandat n’a pas pu être créé.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTerminate = async (mandateId: string) => {
    if (!window.confirm('Terminer ce mandat ? Cette action sera enregistrée et ne supprimera aucune donnée.')) return;
    setEndingId(mandateId);
    try {
      await terminateAgencyMandate(mandateId);
      showToast('Mandat terminé.', 'success');
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Le mandat n’a pas pu être terminé.', 'error');
    } finally {
      setEndingId(null);
    }
  };

  const handleAccept = async (mandate: MandateRow, agencyName: string, resourceName: string) => {
    const confirmed = window.confirm(`Confirmez-vous explicitement accepter le mandat proposé par ${agencyName} pour « ${resourceName} » au taux de ${mandate.commission_rate} % ?`);
    if (!confirmed) return;
    setEndingId(mandate.id);
    try {
      await acceptAgencyMandate(mandate.id);
      showToast('Votre consentement au mandat a été enregistré côté serveur.', 'success');
      await reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Le mandat n’a pas pu être accepté.', 'error');
    } finally {
      setEndingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Gestion propriétaire</p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">Mandats d’agence</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Choisissez l’agence et le bien concernés. Un mandat n’est enregistré qu’après votre confirmation explicite ; l’agence ne peut pas le créer en votre nom.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-violet-50 p-2 text-violet-700"><Plus size={20} /></div>
          <div><h2 className="font-bold text-slate-900">Créer un mandat</h2><p className="text-xs text-slate-500">Le mandat devient actif après votre confirmation.</p></div>
        </div>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">Agence
              <select className="mandate-select mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" value={agencyId} onChange={(event) => setAgencyId(event.target.value)} required>
                <option value="">Sélectionner une agence</option>
                {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.nom_agence}{agency.ville ? ` — ${agency.ville}` : ''}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Bien ou annonce
              <select className="mandate-select mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" value={resourceKey} onChange={(event) => setResourceKey(event.target.value)} required>
                <option value="">Sélectionner un bien ou une annonce</option>
                {properties.length > 0 && <optgroup label="Biens en gestion">{properties.map((item) => <option key={`property:${item.id}`} value={`property:${item.id}`}>{item.name} — {item.address}</option>)}</optgroup>}
                {listings.length > 0 && <optgroup label="Annonces">{listings.map((item) => <option key={`listing:${item.id}`} value={`listing:${item.id}`}>{item.title} — {item.city}</option>)}</optgroup>}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Commission (%)
              <input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" required />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Notes (facultatif)
              <input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="Conditions ou précisions" />
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-4 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 accent-violet-700" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>Je confirme explicitement confier à l’agence sélectionnée la mission liée au bien choisi, au taux de commission affiché. Je comprends que mon compte authentifié et l’heure du consentement seront enregistrés côté serveur.</span>
          </label>
          <button type="submit" disabled={saving || loading || !agencies.length || !resources.length} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
            {saving ? 'Enregistrement…' : 'Confirmer mon consentement et créer le mandat'}
          </button>
          {!loading && agencies.length === 0 && <p className="text-sm text-amber-700">Aucune agence active n’est disponible pour le moment.</p>}
          {!loading && resources.length === 0 && <p className="text-sm text-amber-700">Ajoutez d’abord un bien ou une annonce à votre compte.</p>}
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center gap-3"><ShieldCheck className="text-emerald-600" size={21} /><h2 className="font-bold text-slate-900">Mandats enregistrés</h2></div>
        {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" size={16} />Chargement…</div> : mandates.length === 0 ? <p className="py-6 text-sm text-slate-500">Aucun mandat n’est associé à votre compte.</p> : (
          <div className="divide-y divide-slate-100">
            {mandates.map((mandate) => {
              const resource = properties.find((item) => item.id === mandate.property_id)?.name || listings.find((item) => item.id === mandate.listing_id)?.title || 'Bien';
              return <article key={mandate.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Building2 size={17} /></div>
                  <div><h3 className="text-sm font-bold text-slate-900">{agencyNames.get(mandate.agence_id) || 'Agence'}</h3><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600"><FileText size={13} />{resource} · Commission {mandate.commission_rate}%</p><p className="mt-1 text-[11px] text-slate-500">{mandate.owner_consented_at ? `Consentement enregistré le ${new Date(mandate.owner_consented_at).toLocaleString('fr-FR')}` : 'Ancien mandat sans consentement vérifiable'}</p></div>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${mandate.status === 'actif' && mandate.owner_consented_at ? 'bg-emerald-50 text-emerald-700' : mandate.status === 'termine' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{mandate.owner_consented_at ? mandate.status : 'à confirmer'}</span>
                  {!mandate.owner_consented_at && mandate.status !== 'termine' && <button type="button" onClick={() => void handleAccept(mandate, agencyNames.get(mandate.agence_id) || 'cette agence', resource)} disabled={endingId === mandate.id} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50">{endingId === mandate.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Examiner et accepter</button>}
                  {mandate.status === 'actif' && mandate.owner_consented_at && <button type="button" onClick={() => void handleTerminate(mandate.id)} disabled={endingId === mandate.id} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50">{endingId === mandate.id ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />}Terminer</button>}
                </div>
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
