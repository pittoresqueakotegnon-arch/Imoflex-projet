import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, FileText, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOwnerVerification } from '../../hooks/useOwnerVerification';
import { OwnerIdentityDocumentType } from '../../lib/supabase';
import {
  OWNER_VERIFICATION_STATUS_META,
  submitOwnerVerification,
  validateVerificationFile,
} from '../../lib/ownerVerification';
import { useToast } from '../../components/Toast';

const documentOptions: Array<{ value: OwnerIdentityDocumentType; label: string }> = [
  { value: 'cni', label: 'Carte nationale d’identité' },
  { value: 'passeport', label: 'Passeport' },
  { value: 'permis_conduire', label: 'Permis de conduire' },
];

function FileInput({
  id,
  label,
  hint,
  file,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label htmlFor={id} className="block cursor-pointer rounded-2xl border border-dashed p-4 transition-colors hover:border-[var(--imx-accent)]" style={{ background: 'var(--imx-surface-2)', borderColor: file ? 'var(--imx-accent)' : 'var(--imx-border)' }}>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)' }}>
          {file ? <CheckCircle2 size={19} /> : <UploadCloud size={19} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-[var(--imx-text-primary)]">{label}</span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
            {file ? file.name : hint}
          </span>
        </span>
      </div>
    </label>
  );
}

export default function VerificationProprietaire() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const { verification, loading, error, refetch } = useOwnerVerification(profile?.role === 'proprietaire');

  const [legalName, setLegalName] = useState('');
  const [documentType, setDocumentType] = useState<OwnerIdentityDocumentType>('cni');
  const [documentNumber, setDocumentNumber] = useState('');
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.full_name && !legalName) setLegalName(profile.full_name);
  }, [profile?.full_name, legalName]);

  const status = verification.verification_status || 'non_verifie';
  const meta = OWNER_VERIFICATION_STATUS_META[status];
  const rejected = status === 'refuse';
  const canSubmit = status === 'non_verifie' || rejected;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile?.id || submitting) return;

    const cleanName = legalName.trim().replace(/\s+/g, ' ');
    const cleanNumber = documentNumber.replace(/[^a-zA-Z0-9]/g, '');
    const frontError = validateVerificationFile(front, 'Le recto de la pièce');
    const backError = validateVerificationFile(back, 'Le verso ou la seconde page');
    if (cleanName.length < 2 || cleanName.length > 150) {
      setFormError('Saisissez le nom complet figurant sur votre pièce d’identité.');
      return;
    }
    if (cleanNumber.length < 4 || cleanNumber.length > 40) {
      setFormError('Saisissez un numéro de pièce d’identité valide.');
      return;
    }
    if (frontError || backError || !front || !back) {
      setFormError(frontError || backError || 'Les deux documents sont requis.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await submitOwnerVerification({
        ownerId: profile.id,
        legalName: cleanName,
        documentType,
        documentNumber: cleanNumber,
        front,
        back,
      });
      setDocumentNumber('');
      setFront(null);
      setBack(null);
      await Promise.all([refetch(), refreshProfile()]);
      showToast('Votre dossier est envoyé. Nous vous notifierons après examen.', 'success');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Impossible d’envoyer votre dossier.';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container premium-page flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--imx-accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-container premium-page">
      <header className="premium-header flex items-center gap-3 px-5 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <button onClick={() => navigate(-1)} aria-label="Retour" className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--imx-surface-2)', color: 'var(--imx-text-primary)' }}>
          <ArrowLeft size={19} />
        </button>
        <div>
          <h1 className="font-nunito text-[20px] font-black text-[var(--imx-text-primary)]">Vérification propriétaire</h1>
          <p className="mt-0.5 text-[11px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>Indispensable avant un retrait</p>
        </div>
      </header>

      <main className="space-y-5 px-5 pb-10">
        <section className="relative overflow-hidden rounded-[24px] p-5 text-white" style={{ background: status === 'verifie' ? 'linear-gradient(135deg, #0F766E, #115E59)' : 'linear-gradient(135deg, #7C3AED, #4C1D95)' }}>
          <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full border border-white/10 bg-white/10" />
          <div className="relative z-10 flex items-start gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
              {status === 'verifie' ? <ShieldCheck size={22} /> : status === 'en_attente' ? <Clock3 size={22} /> : status === 'refuse' ? <XCircle size={22} /> : <FileText size={22} />}
            </span>
            <div>
              <p className="font-nunito text-[17px] font-black">{meta.label}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-white/75" style={{ fontFamily: 'Space Grotesk' }}>{meta.description}</p>
            </div>
          </div>
        </section>

        {error && <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-[13px] text-red-700">{error}</p>}

        {status === 'verifie' && (
          <section className="rounded-[22px] border p-5" style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}>
            <div className="flex items-center gap-3">
              <ShieldCheck size={22} color="var(--imx-accent)" />
              <div>
                <h2 className="font-nunito text-[16px] font-black text-[var(--imx-text-primary)]">Badge de confiance activé</h2>
                <p className="mt-1 text-[12px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>Votre profil peut afficher le badge « Propriétaire vérifié ».</p>
              </div>
            </div>
            <Link to="/pro/wallet" className="btn-primary mt-5 flex w-full items-center justify-center">Accéder à mes retraits</Link>
          </section>
        )}

        {status === 'en_attente' && (
          <section className="rounded-[22px] border p-5" style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}>
            <p className="text-[13px] leading-relaxed text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
              Aucun retrait ne peut être demandé tant que la vérification est en attente. Vous recevrez une notification lorsque l’équipe aura statué sur votre dossier.
            </p>
          </section>
        )}

        {rejected && (
          <section className="rounded-[22px] border border-red-200 bg-red-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-500" style={{ fontFamily: 'Space Grotesk' }}>Motif du refus</p>
            <p className="mt-2 text-[13px] leading-relaxed text-red-700">{verification.rejection_reason || 'Votre dossier ne peut pas être validé dans son état actuel.'}</p>
          </section>
        )}

        {canSubmit && (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-[24px] border p-5" style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}>
            <div>
              <h2 className="font-nunito text-[17px] font-black text-[var(--imx-text-primary)]">Soumettre mon identité</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
                Vos documents restent privés et sont consultables uniquement par vous et les administrateurs habilités d’ImoFlex.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>Nom légal</label>
              <input value={legalName} onChange={(event) => setLegalName(event.target.value)} maxLength={150} required className="input-field w-full" autoComplete="name" placeholder="Nom figurant sur la pièce" />
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>Type de pièce</label>
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as OwnerIdentityDocumentType)} className="input-field w-full">
                {documentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>Numéro de pièce</label>
              <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} required maxLength={40} className="input-field w-full" placeholder="Ex. AB123456" />
              <p className="mt-1.5 text-[10px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>Seules les quatre dernières positions sont conservées dans votre dossier.</p>
            </div>

            <div className="space-y-3">
              <FileInput id="verification-front" label="Recto de la pièce" hint="JPG, PNG, WEBP ou PDF · 10 Mo max" file={front} onChange={setFront} />
              <FileInput id="verification-back" label="Verso ou seconde page" hint="JPG, PNG, WEBP ou PDF · 10 Mo max" file={back} onChange={setBack} />
            </div>

            {verification.fee_required && (
              <p className="rounded-xl p-3 text-[12px] text-[var(--imx-text-secondary)]" style={{ background: 'var(--imx-surface-2)', fontFamily: 'Space Grotesk' }}>
                Des frais de vérification sont requis. Le paiement doit être confirmé avant l’envoi du dossier.
              </p>
            )}

            {formError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{formError}</p>}

            <button type="submit" disabled={submitting} className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-60">
              {submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Envoi sécurisé…</> : <><ShieldCheck size={17} /> Envoyer pour vérification</>}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
