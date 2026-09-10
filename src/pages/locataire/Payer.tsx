import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sparkles, AlertTriangle, Smartphone, ChevronLeft, Check, Building2, Calendar, User, CreditCard, Phone, ArrowRight } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { supabase, RentPeriod, Operator } from "../../lib/supabase";
import { initiatePayment, normalizeBjPhone } from "../../lib/fedapay";
import { diagnoseAndShowError, showPaymentStatusError, showUssdTimeoutError } from "../../utils/errorDiagnostics";
import { useToast } from "../../components/Toast";
import { BackButton } from "../../components/BackButton";
import { haptics } from "../../lib/haptics";
import { formatMontant } from "../../lib/utils";

type Step = "form" | "confirm" | "success";

const MONTH_NAMES = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

const OPERATOR_CONFIG: Record<Operator, { label: string; color: string; bg: string }> = {
  mtn:     { label: "MTN Mobile Money", color: "#FBBF24", bg: "#FFFBEB" },
  moov:    { label: "Moov Africa",      color: "#3B82F6", bg: "#EFF6FF" },
  celtiis: { label: "Celtiis Pay",      color: "#10B981", bg: "#ECFDF5" },
};

function maskPhone(phone: string): string {
  const clean = phone.replace(/\s/g, "");
  if (clean.length <= 4) return clean;
  return clean.slice(0, 2) + " *** *** " + clean.slice(-2);
}

export default function Payer() {
  const navigate = useNavigate();
  const { leaseId } = useParams<{ leaseId: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("form");

  const [currentRentPeriod, setCurrentRentPeriod] = useState<RentPeriod | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [amount, setAmount] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [pollingPaymentId, setPollingPaymentId] = useState<string | null>(null);

  const [successData, setSuccessData] = useState<{
    amount: number;
    paymentId: string;
    recipientName: string;
    propertyName: string;
    periodLabel: string;
    transactionId: string;
    date: string;
    operator: Operator;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setPhoneNumber(profile.mobile_money_number || profile.phone || "");
    }
  }, [profile]);

  useEffect(() => {
    const cleanNumber = phoneNumber.replace(/\s+/g, "").replace(/^\+229/, "");
    if (cleanNumber.length >= 2) {
      const prefix = cleanNumber.substring(0, 2);
      if (["97","96","67","66","61","62","51","52","53","54","42","46","91"].includes(prefix)) {
        setSelectedOperator("mtn");
      } else if (["95","94","65","64","60","55","44","58"].includes(prefix)) {
        setSelectedOperator("moov");
      } else if (["90","40","41","43"].includes(prefix)) {
        setSelectedOperator("celtiis");
      }
    }
  }, [phoneNumber]);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id) return;
      if (!leaseId) { navigate("/dashboard"); return; }

      try {
        const { data: leaseData, error: leaseError } = await supabase
          .from("leases")
          .select("id, tenant_id, status, properties:property_id(id, name, address, monthly_rent, owner_id)")
          .eq("id", leaseId)
          .eq("tenant_id", profile.id)
          .eq("status", "actif")
          .maybeSingle();

        if (leaseError) throw leaseError;
        if (!leaseData) { showToast("Logement introuvable ou inactif", "error"); navigate("/dashboard"); return; }

        const prop = (leaseData as any)?.properties;
        setPropertyName(prop?.name || "Logement");
        if (prop?.address) {
          setPropertyLocation(prop.address);
        }

        if (prop?.owner_id) {
          try {
            const { data: ownerData } = await supabase
              .from("users").select("full_name").eq("id", prop.owner_id).maybeSingle();
            if (ownerData?.full_name) setOwnerName(ownerData.full_name);
          } catch {
            // RLS fallback
            setOwnerName("Propriétaire");
          }
        }

        // 1. Chercher la période non soldée (priorité à la plus ancienne en retard ou en cours)
        let { data: periodData, error: periodError } = await supabase
          .from("rent_periods")
          .select("*")
          .eq("lease_id", leaseData.id)
          .in("status", ["retard", "en_cours"])
          .order("period_year", { ascending: true })
          .order("period_month", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (periodError && periodError.code !== "PGRST116") {
          console.warn("Period query warning:", periodError);
        }

        // 2. Si aucune période en cours/retard trouvée, assurer la période du mois actuel
        if (!periodData) {
          try {
            const { data: generatedPeriod } = await supabase
              .rpc("ensure_current_rent_period", { p_lease_id: leaseData.id });
            if (generatedPeriod) {
              periodData = generatedPeriod;
            }
          } catch (rpcErr) {
            console.warn("ensure_current_rent_period error:", rpcErr);
          }

          if (!periodData) {
            const now = new Date();
            const { data: currentPeriod } = await supabase
              .from("rent_periods")
              .select("*")
              .eq("lease_id", leaseData.id)
              .eq("period_month", now.getMonth() + 1)
              .eq("period_year", now.getFullYear())
              .maybeSingle();
            periodData = currentPeriod;
          }
        }

        if (periodData) {
          setCurrentRentPeriod(periodData);
          setAmount(Math.max(periodData.amount_due - periodData.amount_paid, 0));
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        showToast("Erreur lors du chargement des donnees", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [profile?.id, leaseId, navigate, showToast]);

  const handleQuickAmount = (value: number | "all") => {
    if (!currentRentPeriod) return;
    const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
    setUserHasInteracted(true);
    setAmount(value === "all" ? remaining : Math.min(value as number, remaining));
  };

  useEffect(() => {
    if (!pollingPaymentId) return;

    const channel = supabase
      .channel(`payment-status-${pollingPaymentId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${pollingPaymentId}` },
        (payload) => {
          const updated = payload.new as any;
          clearTimeout(timeoutId);
          supabase.removeChannel(channel);
          setPollingPaymentId(null);
          setProcessing(false);

          if (updated.status === "valide") {
            const period = currentRentPeriod;
            const periodLabel = period ? `${MONTH_NAMES[(period.period_month ?? 1) - 1]} ${period.period_year}` : "";
            setSuccessData({
              amount: updated.amount || amount,
              paymentId: updated.id,
              recipientName: ownerName || "Proprietaire",
              propertyName: propertyName,
              periodLabel,
              transactionId: updated.fedapay_transaction_id || updated.id,
              date: updated.created_at || new Date().toISOString(),
              operator: updated.operator || selectedOperator || "mtn",
            });
            haptics.success();
            setStep("success");
          } else if (["echoue","canceled","declined"].includes(updated.status)) {
            showPaymentStatusError(updated.status, updated.failure_reason);
            setStep("confirm");
          }
        }
      ).subscribe();

    const timeoutId = setTimeout(() => {
      supabase.removeChannel(channel);
      setPollingPaymentId(null);
      setProcessing(false);
      showUssdTimeoutError();
      setStep("confirm");
    }, 45000);

    return () => { clearTimeout(timeoutId); supabase.removeChannel(channel); };
  }, [pollingPaymentId]);

  const handlePay = async () => {
    setError("");
    setProcessing(true);
    try {
      const result = await initiatePayment({
        amount,
        operator: selectedOperator!,
        rent_period_id: currentRentPeriod!.id,
        phone_number: phoneNumber,
      });

      if (selectedOperator === "celtiis" && result.payment_url) {
        window.open(result.payment_url, "_blank");
        showToast("Finalisez le paiement dans l'onglet Fedapay ouvert", "success");
        setProcessing(false);
        navigate("/historique");
      } else {
        setPollingPaymentId(result.payment_id);
      }
    } catch (err) {
      diagnoseAndShowError(err, "Paiement FedaPay");
      setProcessing(false);
    }
  };

  const validateForm = (): string | null => {
    if (amount < 100) return "Le montant minimum est 100 FCFA";
    if (!currentRentPeriod) return "Impossible de trouver la periode de loyer";
    const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
    if (amount > remaining) return `Montant superieur au solde du (${formatMontant(remaining)} FCFA max)`;
    if (amount > 300000) return "Le plafond est de 300 000 FCFA par transaction";
    if (!selectedOperator) return "Veuillez selectionner un operateur";
    const cleanedPhone = normalizeBjPhone(phoneNumber);
    if (!cleanedPhone || cleanedPhone.length !== 10) return "Numero invalide. Entrez 10 chiffres (ex: 01 97 00 00 00)";
    return null;
  };

  const handleContinue = () => {
    const err = validateForm();
    if (err) { setError(err); return; }
    setError("");
    haptics.light();
    setStep("confirm");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[var(--imx-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentRentPeriod) {
    return (
      <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] p-6 flex flex-col">
        <div className="mb-6"><BackButton /></div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--imx-text-secondary)]">Aucune periode de loyer active pour ce logement</p>
        </div>
      </div>
    );
  }

  const remaining = currentRentPeriod.amount_due - currentRentPeriod.amount_paid;
  const periodLabel = `${MONTH_NAMES[(currentRentPeriod.period_month ?? 1) - 1]} ${currentRentPeriod.period_year}`;

  /* SUCCESS */
  if (step === "success" && successData) {
    const opCfg = OPERATOR_CONFIG[successData.operator] || OPERATOR_CONFIG.mtn;
    const formattedDate = new Date(successData.date).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    return (
      <div className="min-h-screen bg-white flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
        <div className="relative bg-[#7B3FE4] flex flex-col items-center" style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+56px)", paddingBottom: "80px" }}>
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4 shadow-lg">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
              <Check size={28} className="text-[#7B3FE4]" strokeWidth={3} />
            </div>
          </div>
          <h1 className="font-nunito font-900 text-white text-[24px] text-center leading-tight mb-2 px-6">
            Versement effectue avec succes
          </h1>
          <p className="font-space-grotesk text-white/80 text-[14px] text-center px-8">
            Votre loyer de <strong className="text-white">{formatMontant(successData.amount)} FCFA</strong> pour <strong className="text-white">{successData.periodLabel}</strong> a ete paye avec succes.
          </p>
          <div className="absolute -bottom-1 left-0 right-0 h-10">
            <svg viewBox="0 0 500 40" preserveAspectRatio="none" className="w-full h-full fill-white">
              <path d="M0,40 C125,0 375,0 500,40 Z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 px-6 pt-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#F5F3FF] flex items-center justify-center flex-shrink-0">
              <Building2 size={20} className="text-[#7B3FE4]" />
            </div>
            <div>
              <p className="font-nunito font-900 text-[#17132B] text-[15px]">{successData.propertyName}</p>
              {propertyLocation ? <p className="text-gray-500 text-[12px] font-space-grotesk">{propertyLocation}</p> : null}
            </div>
          </div>

          <div className="bg-[#FAFAFA] rounded-[20px] border border-gray-100 p-5 mb-8">
            {[
              { label: "Reference", value: successData.paymentId.slice(0, 8).toUpperCase(), mono: true },
              { label: "Date", value: formattedDate },
              { label: "Operateur", value: opCfg.label },
              { label: "Montant", value: `${formatMontant(successData.amount)} FCFA`, bold: true },
            ].map(({ label, value, mono, bold }) => (
              <div key={label} className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                <span className="font-space-grotesk text-[12px] text-gray-500 font-medium">{label}</span>
                <span className={`font-space-grotesk text-[13px] text-[#17132B] ${bold ? "font-900 text-[#7B3FE4]" : "font-semibold"} ${mono ? "font-mono" : ""}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 flex flex-col gap-3">
          <button onClick={() => { haptics.light(); navigate(`/recu/${successData.paymentId}`); }}
            className="w-full border-2 border-[#7B3FE4] text-[#7B3FE4] font-nunito font-900 text-[15px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
            Voir le recu <ArrowRight size={18} />
          </button>
          <button onClick={() => { haptics.medium(); navigate("/dashboard"); }}
            className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[15px] rounded-2xl py-4 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/30">
            Retour a mon espace
          </button>
        </div>
      </div>
    );
  }

  /* CONFIRM */
  if (step === "confirm") {
    const opCfg = selectedOperator ? OPERATOR_CONFIG[selectedOperator] : null;
    const cleanPhone = normalizeBjPhone(phoneNumber);
    return (
      <div className="min-h-screen bg-white flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
        <div className="px-6 pb-4 border-b border-gray-100 flex items-center gap-4" style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+20px)" }}>
          <button onClick={() => { haptics.light(); setStep("form"); }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors flex-shrink-0">
            <ChevronLeft size={20} className="text-[#17132B]" />
          </button>
          <h1 className="font-nunito font-900 text-[18px] text-[#17132B]">Confirmation du versement</h1>
        </div>

        <div className="flex-1 px-6 py-6 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-[#7B3FE4] rounded-[24px] p-6 text-center shadow-xl shadow-[#7B3FE4]/20">
            <p className="font-space-grotesk text-white/70 text-[11px] font-bold uppercase tracking-widest mb-2">Total a payer</p>
            <p className="font-nunito font-900 text-white text-[38px] leading-none">{formatMontant(amount)}</p>
            <p className="font-space-grotesk text-white/80 text-[14px] mt-1">FCFA</p>
          </div>

          <div className="bg-[#FAFAFA] rounded-[20px] border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#F5F3FF] flex items-center justify-center flex-shrink-0">
                <User size={15} className="text-[#7B3FE4]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Proprietaire</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B] truncate">{ownerName || "�"}</p>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                <Building2 size={15} className="text-[#3B82F6]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Bien</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B] truncate">{propertyName || "�"}</p>
                {propertyLocation ? <p className="text-[11px] text-gray-500 font-space-grotesk">{propertyLocation}</p> : null}
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] flex items-center justify-center flex-shrink-0">
                <Calendar size={15} className="text-[#10B981]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Periode</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B]">{periodLabel}</p>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] flex items-center justify-center flex-shrink-0">
                  <CreditCard size={15} className="text-[#F59E0B]" />
                </div>
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Versement</p>
              </div>
              <p className="font-nunito font-900 text-[16px] text-[#17132B]">{formatMontant(amount)} FCFA</p>
            </div>
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-[12px] text-gray-400 font-space-grotesk font-medium">Frais de transaction</p>
              <span className="text-[#10B981] font-space-grotesk font-bold text-[12px]">Gratuit</span>
            </div>
          </div>

          {opCfg && (
            <div className="rounded-[20px] border border-gray-100 overflow-hidden" style={{ background: opCfg.bg }}>
              <div className="px-5 py-3 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: opCfg.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Moyen de paiement</p>
                  <p className="font-nunito font-800 text-[14px] text-[#17132B]">{opCfg.label}</p>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-gray-100/50 flex items-center gap-3">
                <Phone size={15} className="text-gray-400 flex-shrink-0" />
                <p className="font-space-grotesk text-[13px] text-[#17132B] font-semibold">+229 {maskPhone(cleanPhone)}</p>
              </div>
            </div>
          )}

          <div className="px-5 py-3 rounded-[16px] bg-gray-50 border border-gray-100">
            <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide mb-1">Reference periode</p>
            <p className="font-mono text-[12px] text-gray-500">{currentRentPeriod.id.slice(0, 16)}...</p>
          </div>
        </div>

        <div className="px-6 flex flex-col gap-3">
          <button onClick={() => { haptics.medium(); handlePay(); }} disabled={processing}
            className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[16px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/30 disabled:opacity-60">
            {processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {pollingPaymentId ? "En attente de confirmation..." : "Traitement en cours..."}
              </>
            ) : "PAYER"}
          </button>
          {pollingPaymentId && (
            <p className="text-gray-500 text-[11px] font-space-grotesk text-center flex items-center justify-center gap-1.5 animate-pulse">
              <Smartphone size={13} /> Verifiez votre telephone et entrez votre code PIN Mobile Money
            </p>
          )}
          {!processing && (
            <button onClick={() => { haptics.light(); setStep("form"); }}
              className="w-full text-[#17132B] font-nunito font-800 text-[15px] rounded-2xl py-3 active:opacity-60 transition-opacity text-center">
              Modifier
            </button>
          )}
        </div>
      </div>
    );
  }

  /* FORM */
  return (
    <div className="min-h-screen bg-[var(--imx-bg-app)] text-[var(--imx-text-primary)] flex flex-col"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
      <div className="px-6 flex-1 flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
        <div className="mb-5"><BackButton /></div>
        <h1 className="font-nunito font-900 text-[22px] text-[var(--imx-text-primary)] mb-1">Effectuer un versement</h1>
        {propertyName ? (
          <p className="text-[var(--imx-text-secondary)] text-[12px] mb-7 font-space-grotesk">Pour : {propertyName}</p>
        ) : (<div className="mb-7" />)}

        <div className="flex-1 flex flex-col">
          <div className="mb-6 flex flex-col items-center rounded-3xl py-8 px-4 shadow-sm relative overflow-hidden"
            style={{ background: "var(--imx-surface)", border: "1px solid var(--imx-border)", boxShadow: "var(--imx-card-shadow-sm)" }}>
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg, var(--imx-accent) 0%, var(--imx-accent-light) 100%)" }} />
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[var(--imx-text-muted)] text-[10px] font-space-grotesk font-bold uppercase tracking-widest">MONTANT DU VERSEMENT</span>
            </div>
            <div className="flex items-center justify-center gap-2 mb-3 w-full px-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold font-nunito bg-[var(--imx-surface-2)] text-[var(--imx-accent-light)] border border-[var(--imx-border)] flex-shrink-0">FCFA</span>
              {(() => {
                const displayValue = amount ? new Intl.NumberFormat("fr-FR").format(amount) : "";
                return (
                  <input inputMode="numeric" type="text" value={displayValue}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      const val = parseInt(raw) || 0;
                      setUserHasInteracted(true);
                      setAmount(Math.min(val, remaining));
                    }}
                    placeholder="0" disabled={processing}
                    style={{ width: `${Math.min(Math.max(displayValue.length, 1) + 0.5, 10)}ch`, maxWidth: "100%" }}
                    className={`font-nunito font-black leading-none text-[var(--imx-text-primary)] bg-transparent text-center outline-none transition-colors disabled:opacity-50 tabular-nums min-w-0 ${amount >= 1000000 ? "text-[2rem]" : amount >= 100000 ? "text-[2.4rem]" : "text-[2.8rem]"}`}
                  />
                );
              })()}
            </div>
            {!userHasInteracted ? (
              <p className="text-[var(--imx-text-muted)] text-[12px] font-space-grotesk">
                Solde restant : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat("fr-FR").format(remaining)} FCFA</strong>
              </p>
            ) : amount > 0 && amount === remaining ? (
              <p className="text-[#22C55E] text-[12px] font-space-grotesk font-bold flex items-center justify-center gap-1">
                <Sparkles size={12} /> Ce versement soldera l'integralite de votre loyer
              </p>
            ) : amount > remaining ? (
              <p className="text-red-500 text-[12px] font-space-grotesk font-bold flex items-center gap-1">
                <AlertTriangle size={12} /> Montant superieur au solde du ({new Intl.NumberFormat("fr-FR").format(remaining)} FCFA max)
              </p>
            ) : amount > 300000 ? (
              <p className="text-red-500 text-[12px] font-space-grotesk font-bold text-center mt-1 max-w-[280px] flex items-center justify-center gap-1">
                <AlertTriangle size={12} /> Plafond maximal de 300 000 FCFA par transaction.
              </p>
            ) : (
              <p className="text-[var(--imx-text-muted)] text-[12px] font-space-grotesk">
                {amount > 0 ? <>A regler apres versement : <strong className="text-[var(--imx-text-primary)]">{new Intl.NumberFormat("fr-FR").format(remaining - amount)} FCFA</strong></> : <>Solde restant : <strong>{new Intl.NumberFormat("fr-FR").format(remaining)} FCFA</strong></>}
              </p>
            )}
          </div>

          <div className="mb-6">
            <div className="grid grid-cols-4 gap-2">
              {[500, 5000, 10000].map((val) => (
                <button key={val} onClick={() => handleQuickAmount(val)} disabled={processing}
                  className={`py-3.5 px-1 rounded-2xl font-space-grotesk font-bold text-[12px] transition-all disabled:opacity-50 active:scale-95 ${amount === val ? "text-white shadow-sm" : "bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)]"}`}
                  style={amount === val ? { background: "var(--imx-accent)" } : undefined}>
                  {new Intl.NumberFormat("fr-FR").format(val)}
                </button>
              ))}
              <button onClick={() => handleQuickAmount("all")} disabled={processing}
                className={`py-3.5 px-1 rounded-2xl font-space-grotesk font-bold text-[12px] transition-all disabled:opacity-50 active:scale-95 ${amount === remaining ? "text-white shadow-sm" : "bg-[var(--imx-surface)] text-[var(--imx-text-secondary)] border border-[var(--imx-border)]"}`}
                style={amount === remaining ? { background: "var(--imx-accent)" } : undefined}>
                Tout
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-3">OPERATEUR</label>
            <div className="grid grid-cols-3 gap-3">
              {(["mtn", "moov", "celtiis"] as Operator[]).map((op) => {
                const opCfg = OPERATOR_CONFIG[op];
                const isSelected = selectedOperator === op;
                return (
                  <button key={op} onClick={() => { haptics.light(); setSelectedOperator(op); }} disabled={processing}
                    className="py-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 font-space-grotesk font-bold text-[13px] transition-all disabled:opacity-50 active:scale-95"
                    style={{ background: isSelected ? "var(--imx-surface)" : "var(--imx-surface-2)", color: isSelected ? "var(--imx-text-primary)" : "var(--imx-text-secondary)", border: isSelected ? "2px solid var(--imx-accent)" : "1px solid var(--imx-border)", boxShadow: isSelected ? "var(--imx-card-shadow-sm)" : "none" }}>
                    <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ background: opCfg.color }} />
                    {op === "mtn" ? "MTN" : op === "moov" ? "Moov" : "Celtiis"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-[var(--imx-text-muted)] text-[11px] font-space-grotesk font-bold uppercase tracking-widest mb-3">NUMERO MOBILE MONEY</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={processing}
              className="w-full bg-[var(--imx-surface)] text-[var(--imx-text-primary)] font-nunito font-bold text-[15px] py-4 px-5 rounded-2xl outline-none border border-[var(--imx-border)] focus:border-[var(--imx-accent)] transition-all"
              placeholder="Ex: 90 00 00 00" />
          </div>

          <div className="mt-auto">
            <div className="rounded-3xl p-5 mb-5" style={{ background: "var(--imx-surface)", border: "1px solid var(--imx-border)", boxShadow: "var(--imx-card-shadow-sm)" }}>
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-[var(--imx-text-muted)] font-space-grotesk font-medium text-[12px]">Versement</span>
                <span className="text-[var(--imx-text-primary)] font-nunito font-bold text-[14px]">{new Intl.NumberFormat("fr-FR").format(amount)} FCFA</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--imx-text-muted)] font-space-grotesk font-medium text-[12px]">Frais de transaction</span>
                <span className="text-[#10B981] font-space-grotesk font-bold text-[12px]">Gratuit</span>
              </div>
              <div className="h-[1px] bg-[var(--imx-border)] w-full my-3" />
              <div className="flex justify-between items-center">
                <span className="text-[var(--imx-text-secondary)] font-space-grotesk font-semibold text-[13px]">Solde apres versement</span>
                <span className={`font-nunito font-900 text-[16px] ${remaining - amount === 0 ? "text-[#10B981]" : "text-[var(--imx-accent-light)]"}`}>
                  {new Intl.NumberFormat("fr-FR").format(Math.max(remaining - amount, 0))} FCFA
                </span>
              </div>
            </div>
            {error && (
              <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-4 rounded-2xl mb-4 text-sm text-center">{error}</div>
            )}
            <button onClick={() => { haptics.light(); handleContinue(); }}
              disabled={amount < 100 || amount > remaining || amount > 300000 || !selectedOperator}
              className="w-full text-white font-nunito font-900 text-[16px] rounded-2xl py-4 flex items-center justify-center gap-2 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 shadow-md"
              style={{ background: "var(--imx-accent)" }}>
              Continuer <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
