import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Building2, User, Calendar, CreditCard, Phone, Share2, ChevronLeft, Copy, Download } from "lucide-react";
import { Share } from "@capacitor/share";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../components/Toast";
import { formatMontant } from "../../lib/utils";
import { haptics } from "../../lib/haptics";
import { generateQuittancePDF } from "../../lib/pdf";

const MONTH_NAMES = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const OPERATOR_LABELS: Record<string, string> = {
  mtn:     "MTN Mobile Money",
  moov:    "Moov Africa",
  celtiis: "Celtiis Pay",
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
  ownerName: string;
  propertyName: string;
  propertyLocation: string;
  periodLabel: string;
}

export default function Recu() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchReceipt = async () => {
      if (!profile?.id || !paymentId) return;

      try {
        const { data, error: fetchError } = await supabase
          .from("payments")
          .select(`
            id, amount, status, operator, created_at, fedapay_transaction_id, payment_method,
            rent_periods:rent_period_id (
              period_month, period_year,
              leases:lease_id (
                tenant_id,
                properties:property_id (
                  name, address, owner_id
                )
              )
            )
          `)
          .eq("id", paymentId)
          .eq("tenant_id", profile.id)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!data) { setError("Recu introuvable ou acces refuse."); return; }

        const rp = (data as any).rent_periods;
        const lease = rp?.leases;
        const prop = lease?.properties;
        let ownerName = "Proprietaire";
        if (prop?.owner_id) {
          try {
            const { data: ownerData } = await supabase
              .from("users").select("full_name").eq("id", prop.owner_id).maybeSingle();
            if (ownerData?.full_name) ownerName = ownerData.full_name;
          } catch {
            // fallback
          }
        }
        const periodLabel = rp
          ? `${MONTH_NAMES[(rp.period_month ?? 1) - 1]} ${rp.period_year}`
          : "";

        setReceipt({
          id: data.id,
          amount: data.amount,
          status: data.status,
          operator: data.operator || "",
          created_at: data.created_at,
          fedapay_transaction_id: data.fedapay_transaction_id || null,
          payment_method: data.payment_method || "mobile_money",
          tenantName: profile.full_name || "Locataire",
          tenantPhone: profile.mobile_money_number || profile.phone || "",
          ownerName,
          propertyName: prop?.name || "Logement",
          propertyLocation: prop?.address || "",
          periodLabel,
        });
      } catch (err) {
        console.error("Receipt fetch error:", err);
        setError("Impossible de charger le recu.");
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [paymentId, profile?.id]);

  const handleShare = async () => {
    if (!receipt) return;
    haptics.light();
    const formattedDate = new Date(receipt.created_at).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    const text = [
      "--- RECU DE PAIEMENT IMOFLEX ---",
      `Statut       : PAYE`,
      `Montant      : ${formatMontant(receipt.amount)} FCFA`,
      `Periode      : ${receipt.periodLabel}`,
      `Bien         : ${receipt.propertyName}`,
      `Locataire    : ${receipt.tenantName}`,
      `Proprietaire : ${receipt.ownerName}`,
      `Operateur    : ${OPERATOR_LABELS[receipt.operator] || receipt.operator}`,
      `Date         : ${formattedDate}`,
      `Ref ImoFlex  : ${receipt.id.slice(0, 8).toUpperCase()}`,
      receipt.fedapay_transaction_id ? `Ref Fedapay  : ${receipt.fedapay_transaction_id}` : "",
      "--- ImoFlex - Trouvez. Choisissez. Habitez. ---",
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ title: "Recu de paiement ImoFlex", text });
      } else {
        await Share.share({ title: "Recu de paiement ImoFlex", text, dialogTitle: "Partager le recu" });
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Recu copie dans le presse-papier", "success");
      } catch {
        showToast("Impossible de partager le recu.", "error");
      }
    }
  };

  const handleCopyRef = async (ref: string) => {
    haptics.light();
    try {
      await navigator.clipboard.writeText(ref);
      showToast("Reference copiee", "success");
    } catch { /* ignore */ }
  };

  const handleDownloadQuittance = () => {
    if (!receipt) return;
    haptics.light();
    try {
      generateQuittancePDF({
        id: receipt.id,
        fedapay_transaction_id: receipt.fedapay_transaction_id,
        amount: receipt.amount,
        date: new Date(receipt.created_at),
        periodLabel: receipt.periodLabel,
        propertyName: receipt.propertyName,
        propertyLocation: receipt.propertyLocation,
        tenantName: receipt.tenantName,
        ownerName: receipt.ownerName,
        operator: receipt.operator,
      });
      showToast("Quittance PDF téléchargée !", "success");
    } catch (err) {
      console.error("PDF generation error:", err);
      showToast("Erreur lors de la génération du PDF", "error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#7B3FE4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 gap-4">
        <p className="text-gray-500 font-space-grotesk text-center">{error || "Recu introuvable."}</p>
        <button onClick={() => navigate(-1)} className="text-[#7B3FE4] font-nunito font-900 underline">Retour</button>
      </div>
    );
  }

  const formattedDate = new Date(receipt.created_at).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-[#F8F7FF] flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
      {/* Header */}
      <div className="bg-white px-6 pb-4 border-b border-gray-100 flex items-center justify-between"
        style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+20px)" }}>
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
          <ChevronLeft size={20} className="text-[#17132B]" />
        </button>
        <span className="font-nunito font-900 text-[16px] text-[#17132B]">Recu de paiement</span>
        <button onClick={handleShare}
          className="w-9 h-9 rounded-full bg-[#F5F3FF] flex items-center justify-center active:bg-[#EDE9FE] transition-colors">
          <Share2 size={18} className="text-[#7B3FE4]" />
        </button>
      </div>

      <div className="flex-1 px-4 py-6 flex flex-col gap-4">
        {/* Card principale */}
        <div className="bg-white rounded-[24px] overflow-hidden shadow-sm border border-gray-100">
          {/* En-tete violet */}
          <div className="bg-[#7B3FE4] px-6 py-6 text-center relative">
            <div className="flex items-center justify-center mb-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-white" strokeWidth={2.5} />
              </div>
            </div>
            <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 mb-3">
              <div className="w-2 h-2 rounded-full bg-[#4ADE80]" />
              <span className="font-space-grotesk text-white font-bold text-[11px] uppercase tracking-wider">PAYE</span>
            </div>
            <p className="font-nunito font-900 text-white text-[32px] leading-none">{formatMontant(receipt.amount)}</p>
            <p className="font-space-grotesk text-white/70 text-[13px] mt-1">FCFA</p>
            <p className="font-space-grotesk text-white/90 text-[13px] mt-2">Loyer � {receipt.periodLabel}</p>
          </div>

          {/* Logo ImoFlex */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-center">
            <span className="font-nunito font-900 text-[20px] leading-none">
              <span className="text-[#17132B]">Imo</span><span className="text-[#7B3FE4]">Flex</span>
            </span>
          </div>

          {/* Lignes de detail */}
          <div className="px-6 divide-y divide-gray-50">
            <div className="py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                <Building2 size={15} className="text-[#3B82F6]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Bien</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B] truncate">{receipt.propertyName}</p>
                {receipt.propertyLocation ? <p className="text-[11px] text-gray-500 font-space-grotesk">{receipt.propertyLocation}</p> : null}
              </div>
            </div>

            <div className="py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F5F3FF] flex items-center justify-center flex-shrink-0">
                <User size={15} className="text-[#7B3FE4]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Locataire</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B] truncate">{receipt.tenantName}</p>
              </div>
            </div>

            <div className="py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] flex items-center justify-center flex-shrink-0">
                <User size={15} className="text-[#10B981]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Proprietaire / Agence</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B] truncate">{receipt.ownerName}</p>
              </div>
            </div>

            <div className="py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] flex items-center justify-center flex-shrink-0">
                <Phone size={15} className="text-[#F59E0B]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Operateur</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B]">{OPERATOR_LABELS[receipt.operator] || receipt.operator}</p>
              </div>
            </div>

            <div className="py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Calendar size={15} className="text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Date et heure</p>
                <p className="font-space-grotesk font-semibold text-[13px] text-[#17132B]">{formattedDate}</p>
              </div>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#F5F3FF] flex items-center justify-center flex-shrink-0">
                  <CreditCard size={15} className="text-[#7B3FE4]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Ref. ImoFlex</p>
                  <p className="font-mono text-[12px] text-[#17132B] font-semibold">{receipt.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
              <button onClick={() => handleCopyRef(receipt.id)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0">
                <Copy size={13} className="text-gray-500" />
              </button>
            </div>

            {receipt.fedapay_transaction_id && (
              <div className="py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <CreditCard size={15} className="text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Ref. Fedapay</p>
                    <p className="font-mono text-[12px] text-[#17132B] font-semibold truncate">{receipt.fedapay_transaction_id}</p>
                  </div>
                </div>
                <button onClick={() => handleCopyRef(receipt.fedapay_transaction_id!)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0">
                  <Copy size={13} className="text-gray-500" />
                </button>
              </div>
            )}

            <div className="py-3.5 flex items-center justify-between">
              <span className="text-[12px] text-gray-400 font-space-grotesk font-medium">Frais</span>
              <span className="text-[#10B981] font-space-grotesk font-bold text-[12px]">0 FCFA (Gratuit)</span>
            </div>
          </div>
        </div>

        {/* Actions : Quittance PDF & Partager */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleDownloadQuittance}
            className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[15px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/30"
          >
            <Download size={18} /> Télécharger la quittance (PDF)
          </button>

          <button
            onClick={handleShare}
            className="w-full bg-white border border-[#7B3FE4]/20 text-[#7B3FE4] font-nunito font-800 text-[15px] rounded-2xl py-3.5 flex items-center justify-center gap-2 active:bg-[#F5F3FF] transition-all"
          >
            <Share2 size={18} /> Partager le reçu
          </button>
        </div>

        <p className="text-center text-gray-400 text-[11px] font-space-grotesk">
          ImoFlex - Trouvez. Choisissez. Habitez.
        </p>
      </div>
    </div>
  );
}
