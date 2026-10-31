import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  Search,
  ArrowLeft,
  FileCheck2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VerifiedDocInfo {
  ref: string;
  type: 'quittance' | 'contrat';
  isValid: boolean;
  amount?: number;
  periodLabel?: string;
  propertyName?: string;
  propertyAddress?: string;
  tenantName?: string;
  ownerName?: string;
  ownerVerified: boolean;
  date: string;
  operator?: string;
  transactionRef?: string;
  status: string;
  pdfSha256?: string | null;
  documentHash?: string | null;
}

export const VerifierDocument: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialRef = searchParams.get('ref') || '';

  const [refInput, setRefInput] = useState(initialRef);
  const [loading, setLoading] = useState(false);
  const [docInfo, setDocInfo] = useState<VerifiedDocInfo | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (initialRef) {
      verifyReference(initialRef);
    }
  }, [initialRef]);

  const verifyReference = async (ref: string) => {
    const cleanRef = ref.trim().toUpperCase();
    if (!cleanRef) return;

    setLoading(true);
    setSearched(true);
    setDocInfo(null);

    try {
      // Le serveur valide la référence complète et ne renvoie que des faits
      // financiers non identifiants. Une référence partielle ambiguë est refusée.
      const { data: receiptCheck, error: receiptCheckError } = await supabase.rpc(
        'verify_public_payment_receipt',
        { p_reference: cleanRef },
      );
      if (receiptCheckError) throw receiptCheckError;
      if (receiptCheck?.found && receiptCheck?.verified) {
        const months = [
          'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
        ];
        setDocInfo({
          ref: receiptCheck.reference,
          type: 'quittance',
          isValid: true,
          amount: Number(receiptCheck.amount),
          periodLabel: `${months[Number(receiptCheck.period_month) - 1] || ''} ${receiptCheck.period_year}`.trim(),
          ownerVerified: false,
          date: receiptCheck.date,
          operator: receiptCheck.operator || undefined,
          transactionRef: String(receiptCheck.record_sha256 || '').slice(0, 16),
          status: Number(receiptCheck.remaining_due) === 0
            ? 'PAIEMENT ENREGISTRÉ — SOLDE NUL AU REGISTRE'
            : 'PAIEMENT ENREGISTRÉ — SOLDE RESTANT',
          documentHash: receiptCheck.record_sha256,
        });
        setLoading(false);
        return;
      }

      // La vérification publique recalcule côté serveur l'empreinte des octets
      // PDF conservés et la compare à l'enregistrement signé lié.
      const { data: pdfCheck, error: pdfCheckError } = await supabase.rpc('verify_public_contract_pdf', {
        p_contract_number: cleanRef,
      });
      if (pdfCheckError) throw pdfCheckError;
      if (pdfCheck?.found) {
        const isValid = pdfCheck.verified === true;
        setDocInfo({
          ref: pdfCheck.contract_number || cleanRef,
          type: 'contrat',
          isValid,
          ownerVerified: false,
          date: pdfCheck.sealed_at || new Date().toISOString(),
          status: isValid
            ? 'PDF FINAL ET EMPREINTE VÉRIFIÉS CÔTÉ SERVEUR'
            : pdfCheck.pdf_sha256 ? 'EMPREINTE DU PDF INVALIDE' : 'PDF FINAL NON SCELLÉ',
          pdfSha256: pdfCheck.pdf_sha256 || null,
          documentHash: pdfCheck.document_hash || null,
        });
        setLoading(false);
        return;
      }

      // Aucun résultat
      setDocInfo({
        ref: cleanRef,
        type: 'quittance',
        isValid: false,
        ownerVerified: false,
        date: new Date().toISOString(),
        status: 'NON RECONNU',
      });
    } catch (err) {
      console.error('Erreur vérification:', err);
      setDocInfo({
        ref: cleanRef,
        type: 'quittance',
        isValid: false,
        ownerVerified: false,
        date: new Date().toISOString(),
        status: 'ERREUR_RECHERCHE',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    verifyReference(refInput);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto w-full">
        {/* Navigation retour */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#7B3FE4] transition-colors"
          >
            <ArrowLeft size={16} />
            Retour à l'accueil ImoFlex
          </Link>

          <span className="text-xs font-semibold text-gray-400">
            Portail de vérification des documents
          </span>
        </div>

        {/* Hero Card */}
        <div className="rounded-3xl bg-white border border-gray-200 p-6 sm:p-8 shadow-sm mb-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 text-[#7B3FE4] flex items-center justify-center mx-auto mb-4 shadow-sm border border-purple-100">
            <FileCheck2 size={32} />
          </div>

          <h1 className="text-2xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
            Vérification de Document Officiel
          </h1>
          <p className="text-xs text-gray-500 mt-1.5 max-w-md mx-auto">
            Vérifiez l’enregistrement d’un paiement ou l’intégrité des octets d’un contrat scellé par ImoFlex Bénin.
          </p>

          {/* Formulaire de recherche */}
          <form onSubmit={handleSubmit} className="mt-6 flex gap-2 max-w-md mx-auto">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                placeholder="Ex : QUIT-533336A1B2C3 ou CTR-2026-..."
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 text-sm font-semibold outline-none focus:border-[#7B3FE4] transition-colors uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !refInput.trim()}
              className="px-6 py-3 rounded-2xl bg-[#7B3FE4] text-white font-bold text-sm shadow-md hover:bg-[#6D28D9] transition-all disabled:opacity-50"
            >
              {loading ? 'Vérification…' : 'Vérifier'}
            </button>
          </form>
        </div>

        {/* Résultat de la vérification */}
        {searched && docInfo && (
          <div className="rounded-3xl bg-white border border-gray-200 overflow-hidden shadow-lg transition-all animate-in fade-in">
            {docInfo.isValid ? (
              <div>
                {/* Header résultat succès */}
                <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck size={26} className="text-white" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">
                        {docInfo.type === 'contrat' ? 'Empreinte recalculée côté serveur' : 'Enregistrement reconnu par ImoFlex'}
                      </span>
                      <h2 className="text-lg font-black">{docInfo.status}</h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs font-bold bg-white/20 px-2.5 py-1 rounded-lg">
                      {docInfo.ref}
                    </span>
                  </div>
                </div>

                {/* Contenu détaillé du certificat */}
                <div className="p-6 space-y-5">
                  {docInfo.type === 'contrat' ? (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-700">Le serveur a recalculé le SHA-256 des octets du PDF conservés et l’a comparé à l’empreinte scellée, liée à l’empreinte de l’enregistrement signé.</p>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SHA-256 des octets PDF</p>
                        <code className="mt-1 block break-all text-xs text-slate-800">{docInfo.pdfSha256}</code>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">SHA-256 de l’enregistrement signé lié</p>
                        <code className="mt-1 block break-all text-xs text-slate-800">{docInfo.documentHash}</code>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-500">Cette vérification détecte une modification des octets après scellement. Les traits manuscrits affichés dans le PDF restent des images ; ils ne sont pas, à eux seuls, des signatures cryptographiques ni des certificats d’identité.</p>
                    </div>
                  ) : (
                    <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                        Montant réglé
                      </p>
                      <p className="font-black text-xl text-[#7B3FE4]">
                        {new Intl.NumberFormat('fr-FR').format(docInfo.amount || 0)} <span className="text-xs font-bold text-gray-500">FCFA</span>
                      </p>
                      {docInfo.periodLabel && (
                        <p className="text-xs text-gray-500 mt-0.5">Période : {docInfo.periodLabel}</p>
                      )}
                    </div>
                  </div>
                  {docInfo.operator && (
                    <p className="text-xs text-gray-500">Opérateur enregistré : {docInfo.operator} · {new Date(docInfo.date).toLocaleString('fr-FR')}</p>
                  )}
                  <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-500 leading-relaxed">
                    <p className="font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-600" />
                      Empreinte des faits financiers du registre
                    </p>
                    <code className="block break-all mt-1">{docInfo.documentHash}</code>
                    Cette empreinte vérifie les faits financiers enregistrés, pas les octets d’un PDF ni l’identité d’un signataire.
                  </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* Écran échec */
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={28} />
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-1">{docInfo.type === 'contrat' ? docInfo.status : 'Document introuvable'}</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                  {docInfo.type === 'contrat'
                    ? 'Le contrat est enregistré, mais son PDF final n’est pas scellé ou son empreinte ne correspond plus. Ne traitez pas cette référence comme un PDF vérifié.'
                    : <>Aucun enregistrement correspondant à la référence <strong>« {docInfo.ref} »</strong> n'a été trouvé dans ImoFlex.</>}
                </p>
                <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs inline-block text-left">
                  ⚠️ Vérifiez que la référence a été saisie correctement sans espace superflu.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 mt-12">
        <p>© {new Date().getFullYear()} ImoFlex Bénin — Plateforme de Gestion Locative Sécurisée</p>
        <p className="mt-1">Conforme aux dispositions des lois n° 2017-20 et 2022-30 de la République du Bénin.</p>
      </footer>
    </div>
  );
};

export default VerifierDocument;

