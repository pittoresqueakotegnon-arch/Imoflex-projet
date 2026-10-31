import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  CheckCircle2, Building2, User,
  Download, ArrowLeft, Copy, ShieldCheck, MapPin
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { useToast } from '../../../components/Toast';
import { formatMontant } from '../../../lib/utils';
import { generateQuittancePDF } from '../../../lib/pdf';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const OPERATOR_LABELS: Record<string, string> = {
  mtn: 'MTN Mobile Money',
  moov: 'Moov Africa Money',
  celtiis: 'Celtiis Cash',
};

interface ReceiptData {
  id: string;
  amount: number;
  status: string;
  operator: string;
  created_at: string;
  fedapay_transaction_id: string | null;
  payment_method: string;
  tenantName: string;
  tenantPhone: string;
  ownerId?: string;
  ownerName: string;
  ownerPhone: string;
  ownerVerificationStatus?: string;
  propertyName: string;
  propertyLocation: string;
  periodLabel: string;
  monthlyRent: number;
}

export default function WebRecu() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchReceipt = async () => {
      if (!profile?.id || !paymentId) return;

      try {
        const { data, error: fetchError } = await supabase
          .from('payments')
          .select(`
            id, amount, status, operator, created_at, fedapay_transaction_id, payment_method,
            rent_periods:rent_period_id (
              period_month, period_year, amount_due,
              leases:lease_id (
                id, tenant_id,
                properties:property_id (
                  name, address, monthly_rent, owner_id
                )
              )
            )
          `)
          .eq('id', paymentId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!data) {
          setError('Reçu introuvable ou accès non autorisé.');
          return;
        }

        const rp = (data as any).rent_periods;
        const lease = rp?.leases;
        const prop = lease?.properties;

        let ownerName = 'Propriétaire';
        const ownerPhone = '';
        let isOwnerVerified = false;

        if (prop?.owner_id) {
          try {
            const { data: isVerif } = await supabase.rpc('is_owner_verified', {
              p_owner_id: prop.owner_id,
            });
            isOwnerVerified = !!isVerif;
          } catch (_err) {
            // RPC vérification propriétaire non déployée
          }

          try {
            const { data: oName } = await supabase.rpc('get_active_lease_owner_name', {
              p_lease_id: lease?.id,
            });
            if (oName) ownerName = oName;
          } catch (_err) {
            // RPC nom propriétaire non déployée
          }
        }

        const periodLabel = rp
          ? `${MONTH_NAMES[(rp.period_month ?? 1) - 1]} ${rp.period_year}`
          : '';

        setReceipt({
          id: data.id,
          amount: data.amount,
          status: data.status,
          operator: data.operator || '',
          created_at: data.created_at,
          fedapay_transaction_id: data.fedapay_transaction_id || null,
          payment_method: data.payment_method || 'mobile_money',
          tenantName: profile.full_name || 'Locataire',
          tenantPhone: profile.mobile_money_number || profile.phone || '',
          ownerId: prop?.owner_id,
          ownerName,
          ownerPhone,
          ownerVerificationStatus: isOwnerVerified ? 'verifie' : 'non_verifie',
          propertyName: prop?.name || 'Logement',
          propertyLocation: prop?.address || '',
          periodLabel,
          monthlyRent: prop?.monthly_rent || data.amount,
        });
      } catch (err) {
        console.error('[WebRecu] Error:', err);
        setError('Impossible de charger les données du reçu.');
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [paymentId, profile?.id, profile?.full_name, profile?.mobile_money_number, profile?.phone]);

  const handleCopy = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    showToast(msg, 'success');
  };

  const handleDownloadQuittance = async () => {
    if (!receipt) return;
    try {
      await generateQuittancePDF({
        id: receipt.id,
        fedapay_transaction_id: receipt.fedapay_transaction_id,
        amount: receipt.amount,
        date: new Date(receipt.created_at),
        periodLabel: receipt.periodLabel,
        propertyName: receipt.propertyName,
        propertyLocation: receipt.propertyLocation,
        tenantName: receipt.tenantName,
        tenantPhone: receipt.tenantPhone,
        ownerId: receipt.ownerId,
        ownerName: receipt.ownerName,
        ownerPhone: receipt.ownerPhone,
        ownerVerificationStatus: receipt.ownerVerificationStatus,
        operator: receipt.operator,
        rentAmount: receipt.monthlyRent,
      });
      showToast('Quittance officielle PDF téléchargée !', 'success');
    } catch (err) {
      console.error('PDF error:', err);
      showToast('Erreur lors de la génération du PDF', 'error');
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-3 border-t-transparent animate-spin mb-3" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Chargement du reçu…</p>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-3xl border bg-white shadow-sm space-y-4" style={{ borderColor: 'var(--imx-border)' }}>
          <p className="text-base font-bold text-gray-800">{error || 'Reçu introuvable.'}</p>
          <Link
            to="/web/paiements"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ background: 'var(--imx-accent)' }}
          >
            <ArrowLeft size={16} />
            Retour à mes paiements
          </Link>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(receipt.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fadeIn">
      {/* Navigation retour */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 bg-white border shadow-2xs hover:bg-gray-50 transition-colors"
          style={{ borderColor: 'var(--imx-border)' }}
        >
          <ArrowLeft size={14} />
          Retour
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadQuittance}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all hover:opacity-90"
            style={{ background: 'var(--imx-accent)' }}
          >
            <Download size={14} />
            Télécharger la quittance PDF
          </button>
        </div>
      </div>

      {/* Carte Principale du Reçu (Format SaaS Web) */}
      <div className="rounded-3xl border bg-white shadow-sm overflow-hidden" style={{ borderColor: 'var(--imx-border)' }}>
        
        {/* En-tête Violet avec Montant & Statut */}
        <div
          className="p-8 sm:p-10 text-center text-white relative"
          style={{ background: 'linear-gradient(135deg, #7B3FE4 0%, #6828DC 100%)' }}
        >
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-inner">
            <CheckCircle2 size={32} className="text-white" strokeWidth={2.5} />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[11px] font-bold uppercase tracking-wider text-white mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Paiement Confirmé</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-1" style={{ fontFamily: 'Sora' }}>
            {formatMontant(receipt.amount)}
          </h1>
          <p className="text-sm text-purple-100 font-medium">
            Loyer d'habitation — {receipt.periodLabel}
          </p>
        </div>

        {/* Détails structurés */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b" style={{ borderColor: 'var(--imx-border)' }}>
            
            {/* Colonne 1 : Logement */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                Logement concerné
              </h3>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-[var(--imx-accent)] flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{receipt.propertyName}</p>
                  {receipt.propertyLocation && (
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                      <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                      <span>{receipt.propertyLocation}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Colonne 2 : Parties */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                Parties au contrat
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <User size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">Locataire :</span>
                  <strong className="text-gray-900">{receipt.tenantName}</strong>
                </div>
                <div className="flex items-center gap-2.5 text-xs">
                  <ShieldCheck size={15} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-500">Bailleur :</span>
                  <strong className="text-gray-900">{receipt.ownerName}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Données de transaction */}
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
              Détails de la transaction FedaPay
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-[11px] text-gray-400 block mb-1">Opérateur réseau</span>
                <span className="text-xs font-bold text-gray-900">
                  {OPERATOR_LABELS[receipt.operator] || receipt.operator.toUpperCase()}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-gray-400 block mb-1">Réf. Transaction</span>
                  <span className="text-xs font-bold font-mono text-gray-900">
                    {receipt.fedapay_transaction_id ? `#${receipt.fedapay_transaction_id}` : receipt.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(receipt.fedapay_transaction_id || receipt.id, 'Référence copiée !')}
                  className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Copier"
                >
                  <Copy size={13} />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-[11px] text-gray-400 block mb-1">Date & Heure</span>
                <span className="text-xs font-bold text-gray-900">{formattedDate}</span>
              </div>
            </div>
          </div>

          {/* Bannière Quittance Officielle */}
          <div className="p-5 rounded-2xl bg-purple-50/70 border border-purple-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-gray-900 mb-0.5" style={{ fontFamily: 'Sora' }}>
                Besoin du document légal officiel ?
              </h4>
              <p className="text-xs text-gray-600">
                Téléchargez la quittance certifiée conforme générée automatiquement par ImoFlex.
              </p>
            </div>
            <button
              onClick={handleDownloadQuittance}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 flex-shrink-0"
              style={{ background: 'var(--imx-accent)' }}
            >
              <Download size={14} />
              Télécharger PDF
            </button>
          </div>
        </div>

        {/* Pied de carte */}
        <div className="px-8 py-4 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400" style={{ borderColor: 'var(--imx-border)' }}>
          <span>ImoFlex Technologies Bénin • Quittance électronique</span>
          <span>Réf : QUIT-{(receipt.fedapay_transaction_id || receipt.id).slice(-8).toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
