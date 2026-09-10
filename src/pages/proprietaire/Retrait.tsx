import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Check, ArrowRight, Wallet2, Phone, AlertTriangle, Copy } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useWallet } from "../../hooks/useWallet";
import { requestWithdrawal, normalizeBjPhone } from "../../lib/fedapay";
import { formatMontant } from "../../lib/utils";
import { useToast } from "../../components/Toast";
import { Operator } from "../../lib/supabase";
import { logAction } from "../../lib/audit";
import { haptics } from "../../lib/haptics";

type Step = "form" | "confirm" | "success";

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

interface SuccessData {
  withdrawalId: string;
  fedapayPayoutId?: string;
  amount: number;
  operator: Operator;
  phone: string;
  status: string;
}

const Retrait: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { wallet, ensureWallet } = useWallet(profile?.id);
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("form");
  const [amountStr, setAmountStr] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<Operator>("mtn");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const withdrawalIdempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (profile?.mobile_money_number) {
      setPhoneNumber(profile.mobile_money_number);
    } else if (profile?.phone) {
      setPhoneNumber(profile.phone);
    }
  }, [profile]);

  useEffect(() => {
    const init = async () => {
      try { await ensureWallet(); }
      catch (err) { console.error("Error ensuring wallet:", err); showToast("Erreur lors de l'initialisation du wallet", "error"); }
    };
    init();
  }, [profile?.id, ensureWallet, showToast]);

  // Auto-detection operateur
  useEffect(() => {
    let clean = phoneNumber.replace(/[\s\-().]/g, "").replace(/^\+/, "");
    if (clean.startsWith("229")) clean = clean.slice(3);
    if (clean.length === 8) clean = "01" + clean;
    if (clean.length >= 4 && clean.startsWith("01")) {
      const prefix = clean.substring(2, 4);
      if (["97","96","67","66","61","62","51","52","53","54","42","46","91"].includes(prefix)) setSelectedOperator("mtn");
      else if (["95","94","65","64","60","55","44","58"].includes(prefix)) setSelectedOperator("moov");
      else if (["90","40","41","43"].includes(prefix)) setSelectedOperator("celtiis");
    }
  }, [phoneNumber]);

  const availableBalance = wallet?.available_balance ?? 0;
  const parsedAmount = parseInt(amountStr) || 0;
  const fees = 0; // frais actuellement gratuits
  const amountReceived = parsedAmount - fees;

  const validateForm = (): string | null => {
    if (parsedAmount < 100) return "Le montant minimum est 100 FCFA";
    if (!wallet) return "Wallet non trouve";
    if (parsedAmount > availableBalance) return `Solde insuffisant. Disponible : ${formatMontant(availableBalance)} FCFA`;
    const cleanPhone = normalizeBjPhone(phoneNumber);
    if (!cleanPhone || cleanPhone.length !== 10) return "Numero invalide. Entrez 10 chiffres locaux (ex: 01 97 00 00 00)";
    return null;
  };

  const handleContinue = () => {
    const err = validateForm();
    if (err) { setError(err); return; }
    setError(null);
    haptics.light();
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!wallet || !profile?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestWithdrawal({
        wallet_id: wallet.id,
        amount: parsedAmount,
        operator: selectedOperator,
        destination_phone: phoneNumber,
        idempotency_key: withdrawalIdempotencyKey.current,
      });

      logAction({
        userId: profile.id,
        action: "retrait",
        entityType: "withdrawals",
        details: { amount: parsedAmount, operator: selectedOperator, phone: phoneNumber },
      });

      setSuccessData({
        withdrawalId: result.withdrawal_id,
        fedapayPayoutId: result.fedapay_payout_id,
        amount: parsedAmount,
        operator: selectedOperator,
        phone: normalizeBjPhone(phoneNumber),
        status: result.status || "en_attente",
      });
      haptics.success();
      setStep("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la demande de retrait";
      if (!/Failed to fetch|network|reseau/i.test(message)) {
        withdrawalIdempotencyKey.current = crypto.randomUUID();
      }
      setError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  /* ====== SUCCESS ====== */
  if (step === "success" && successData) {
    const opCfg = OPERATOR_CONFIG[successData.operator];
    const cleanRef = successData.withdrawalId.slice(0, 8).toUpperCase();
    return (
      <div className="min-h-screen bg-white flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
        <div className="relative bg-[#7B3FE4] flex flex-col items-center" style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+56px)", paddingBottom: "80px" }}>
          <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mb-4 shadow-lg">
            <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center">
              <Check size={28} className="text-[#7B3FE4]" strokeWidth={3} />
            </div>
          </div>
          <h1 className="font-nunito font-900 text-white text-[24px] text-center leading-tight mb-2 px-6">
            Retrait demande avec succes
          </h1>
          <p className="font-space-grotesk text-white/80 text-[14px] text-center px-8">
            <strong className="text-white">{formatMontant(successData.amount)} FCFA</strong> en cours de traitement vers {opCfg.label}
          </p>
          <div className="absolute -bottom-1 left-0 right-0 h-10">
            <svg viewBox="0 0 500 40" preserveAspectRatio="none" className="w-full h-full fill-white">
              <path d="M0,40 C125,0 375,0 500,40 Z" />
            </svg>
          </div>
        </div>

        <div className="flex-1 px-6 pt-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: opCfg.bg }}>
              <div className="w-4 h-4 rounded-full" style={{ background: opCfg.color }} />
            </div>
            <div>
              <p className="font-nunito font-900 text-[#17132B] text-[15px]">{opCfg.label}</p>
              <p className="text-gray-500 text-[12px] font-space-grotesk">+229 {successData.phone}</p>
            </div>
          </div>

          <div className="bg-[#FAFAFA] rounded-[20px] border border-gray-100 p-5 mb-8">
            <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
              <span className="font-space-grotesk text-[12px] text-gray-500">Montant</span>
              <span className="font-space-grotesk font-900 text-[13px] text-[#7B3FE4]">{formatMontant(successData.amount)} FCFA</span>
            </div>
            <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
              <span className="font-space-grotesk text-[12px] text-gray-500">Statut</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="font-space-grotesk font-semibold text-[12px] text-amber-600 capitalize">En attente</span>
              </div>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="font-space-grotesk text-[12px] text-gray-500">Reference</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-[#17132B] font-semibold">{cleanRef}</span>
                <button onClick={async () => { try { await navigator.clipboard.writeText(successData.withdrawalId); showToast("Reference copiee", "success"); } catch {} }}
                  className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center active:bg-gray-200">
                  <Copy size={11} className="text-gray-500" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 flex flex-col gap-3">
          <button onClick={() => { haptics.light(); navigate("/pro/wallet"); }}
            className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[15px] rounded-2xl py-4 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/30">
            Voir mes retraits
          </button>
          <button onClick={() => { haptics.light(); navigate("/pro/dashboard"); }}
            className="w-full border-2 border-gray-200 text-[#17132B] font-nunito font-800 text-[14px] rounded-2xl py-3 active:opacity-60">
            Retour au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  /* ====== CONFIRM ====== */
  if (step === "confirm") {
    const opCfg = OPERATOR_CONFIG[selectedOperator];
    const cleanPhone = normalizeBjPhone(phoneNumber);
    return (
      <div className="min-h-screen bg-white flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
        <div className="px-6 pb-4 border-b border-gray-100 flex items-center gap-4" style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+20px)" }}>
          <button onClick={() => { haptics.light(); setStep("form"); }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0">
            <ChevronLeft size={20} className="text-[#17132B]" />
          </button>
          <h1 className="font-nunito font-900 text-[18px] text-[#17132B]">Confirmer votre retrait</h1>
        </div>

        <div className="flex-1 px-6 py-6 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-[#7B3FE4] rounded-[24px] p-6 text-center shadow-xl shadow-[#7B3FE4]/20">
            <p className="font-space-grotesk text-white/70 text-[11px] font-bold uppercase tracking-widest mb-2">Vous allez retirer</p>
            <p className="font-nunito font-900 text-white text-[38px] leading-none">{formatMontant(parsedAmount)}</p>
            <p className="font-space-grotesk text-white/80 text-[14px] mt-1">FCFA</p>
          </div>

          <div className="bg-[#FAFAFA] rounded-[20px] border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: opCfg.bg }}>
                <div className="w-3 h-3 rounded-full" style={{ background: opCfg.color }} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Operateur</p>
                <p className="font-nunito font-800 text-[14px] text-[#17132B]">{opCfg.label}</p>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Phone size={15} className="text-gray-500" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Numero de reception</p>
                <p className="font-space-grotesk font-semibold text-[14px] text-[#17132B]">+229 {maskPhone(cleanPhone)}</p>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <span className="text-[12px] text-gray-400 font-space-grotesk">Montant demande</span>
              <span className="font-nunito font-900 text-[15px] text-[#17132B]">{formatMontant(parsedAmount)} FCFA</span>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
              <span className="text-[12px] text-gray-400 font-space-grotesk">Frais de retrait</span>
              <span className="font-space-grotesk font-bold text-[12px] text-[#10B981]">Gratuit</span>
            </div>
            <div className="px-5 py-3 flex justify-between items-center">
              <span className="font-space-grotesk font-semibold text-[13px] text-[#17132B]">Vous recevrez</span>
              <span className="font-nunito font-900 text-[16px] text-[#7B3FE4]">{formatMontant(amountReceived)} FCFA</span>
            </div>
          </div>

          {error && (
            <div className="rounded-[16px] p-4 flex items-start gap-3 bg-red-50 border border-red-200">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="font-space-grotesk text-[13px] text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-3">
          <button onClick={handleConfirm} disabled={loading}
            className="w-full bg-[#7B3FE4] text-white font-nunito font-900 text-[16px] rounded-2xl py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-[#7B3FE4]/30 disabled:opacity-60">
            {loading ? (
              <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Traitement en cours...</>
            ) : "Confirmer le retrait"}
          </button>
          {!loading && (
            <button onClick={() => { haptics.light(); setStep("form"); }}
              className="w-full text-[#17132B] font-nunito font-800 text-[15px] rounded-2xl py-3 active:opacity-60 transition-opacity text-center">
              Modifier
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ====== FORM ====== */
  return (
    <div className="min-h-screen bg-[#F8F7FF] flex flex-col" style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px)+32px)" }}>
      {/* Header */}
      <div className="bg-white px-6 pb-4 border-b border-gray-100 flex items-center gap-4" style={{ paddingTop: "calc(env(safe-area-inset-top,0px)+20px)" }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0">
          <ChevronLeft size={20} className="text-[#17132B]" />
        </button>
        <div>
          <h1 className="font-nunito font-900 text-[18px] text-[#17132B]">Retirer des fonds</h1>
          <p className="font-space-grotesk text-[11px] text-gray-500">Vers votre compte Mobile Money</p>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 flex flex-col gap-5 overflow-y-auto">
        {/* Carte solde disponible */}
        <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F3FF] flex items-center justify-center">
              <Wallet2 size={20} className="text-[#7B3FE4]" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-space-grotesk font-bold uppercase tracking-wide">Solde disponible</p>
              <p className="font-nunito font-900 text-[22px] text-[#17132B] leading-tight">{formatMontant(availableBalance)} <span className="text-[14px] text-gray-400 font-space-grotesk font-medium">FCFA</span></p>
            </div>
          </div>
          <p className="font-space-grotesk text-[11px] text-gray-400">Montant disponible pour retrait immediat</p>
        </div>

        {/* Zone montant */}
        <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-sm">
          <p className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Combien souhaitez-vous retirer ?</p>
          <div className="flex items-baseline justify-center gap-2 mb-4">
            <span className="font-nunito font-900 text-[18px] text-[#7B3FE4]">FCFA</span>
            {(() => {
              const displayValue = parsedAmount ? new Intl.NumberFormat("fr-FR").format(parsedAmount) : "";
              return (
                <input inputMode="numeric" type="text" value={displayValue}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    const val = parseInt(raw) || 0;
                    setAmountStr(val > 0 ? String(val) : "");
                  }}
                  placeholder="0"
                  style={{ width: `${Math.min(Math.max(displayValue.length, 1) + 0.5, 10)}ch`, maxWidth: "100%", fontSize: "clamp(2rem, 10vw, 2.8rem)", letterSpacing: "-1px", caretColor: "#7B3FE4" }}
                  className="bg-transparent border-none outline-none font-nunito font-900 text-[#17132B] text-center tabular-nums min-w-0"
                />
              );
            })()}
          </div>

          {/* Feedback */}
          {parsedAmount > availableBalance && availableBalance > 0 && (
            <p className="text-red-500 text-[12px] font-space-grotesk font-bold flex items-center justify-center gap-1 mb-3">
              <AlertTriangle size={12} /> Montant superieur au solde disponible
            </p>
          )}
          {parsedAmount > 0 && parsedAmount <= availableBalance && (
            <p className="text-[#10B981] text-[12px] font-space-grotesk font-semibold text-center mb-3">
              Solde apres retrait : {formatMontant(availableBalance - parsedAmount)} FCFA
            </p>
          )}

          {/* Raccourcis */}
          {availableBalance > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {([0.25, 0.5, 0.75, 1] as const).map((ratio) => {
                const quickValue = Math.floor(availableBalance * ratio);
                const isSelected = parsedAmount === quickValue && amountStr !== "";
                return (
                  <button key={ratio} onClick={() => { haptics.light(); setAmountStr(String(quickValue)); }}
                    className="py-3 rounded-[14px] font-space-grotesk font-bold text-[12px] transition-all active:scale-95"
                    style={{
                      background: isSelected ? "#7B3FE4" : "#F5F3FF",
                      color: isSelected ? "white" : "#7B3FE4",
                      border: isSelected ? "1.5px solid #7B3FE4" : "1.5px solid transparent",
                    }}>
                    {ratio === 1 ? "Tout" : `${ratio * 100}%`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selecteur operateur */}
        <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-sm">
          <p className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Recevoir sur</p>
          <div className="grid grid-cols-3 gap-3">
            {(["mtn", "moov", "celtiis"] as Operator[]).map((op) => {
              const opCfg = OPERATOR_CONFIG[op];
              const isSelected = selectedOperator === op;
              return (
                <button key={op} onClick={() => { haptics.light(); setSelectedOperator(op); }}
                  className="py-4 rounded-[18px] flex flex-col items-center justify-center gap-2 font-space-grotesk font-bold text-[13px] transition-all active:scale-95"
                  style={{
                    background: isSelected ? opCfg.bg : "#F8F7FF",
                    border: isSelected ? `2px solid ${opCfg.color}` : "1.5px solid #E5E7EB",
                    color: isSelected ? opCfg.color : "#9CA3AF",
                    boxShadow: isSelected ? `0 4px 16px ${opCfg.color}25` : "none",
                  }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: opCfg.color }} />
                  {op === "mtn" ? "MTN" : op === "moov" ? "Moov" : "Celtiis"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Numero Mobile Money */}
        <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-sm">
          <p className="font-space-grotesk text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Numero Mobile Money</p>
          <div className="flex items-center gap-2 rounded-[16px] border border-gray-200 focus-within:border-[#7B3FE4] transition-colors overflow-hidden px-4 py-3.5">
            <span className="font-space-grotesk text-[14px] text-gray-500 font-semibold flex-shrink-0">+229</span>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1 bg-transparent outline-none font-space-grotesk text-[15px] text-[#17132B] font-semibold"
              placeholder="01 97 00 00 00" />
          </div>
          <p className="font-space-grotesk text-[11px] text-gray-400 mt-2">Verifiez bien ce numero avant de confirmer.</p>
        </div>

        {/* Recapitulatif */}
        <div className="bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex justify-between items-center">
            <span className="font-space-grotesk text-[12px] text-gray-500">Montant demande</span>
            <span className="font-nunito font-900 text-[14px] text-[#17132B]">{parsedAmount > 0 ? `${formatMontant(parsedAmount)} FCFA` : "—"}</span>
          </div>
          <div className="px-5 py-3 border-b border-gray-50 flex justify-between items-center">
            <span className="font-space-grotesk text-[12px] text-gray-500">Frais de retrait</span>
            <span className="font-space-grotesk font-bold text-[12px] text-[#10B981]">Gratuit</span>
          </div>
          <div className="px-5 py-3 flex justify-between items-center">
            <span className="font-space-grotesk font-semibold text-[13px] text-[#17132B]">Vous recevrez</span>
            <span className="font-nunito font-900 text-[16px] text-[#7B3FE4]">{parsedAmount > 0 ? `${formatMontant(amountReceived)} FCFA` : "—"}</span>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="rounded-[16px] p-4 flex items-start gap-3 bg-red-50 border border-red-200">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="font-space-grotesk text-[13px] text-red-600">{error}</p>
          </div>
        )}
      </div>

      {/* Bouton principal */}
      <div className="px-5 pt-3">
        <button onClick={handleContinue}
          disabled={parsedAmount < 100 || parsedAmount > availableBalance || !phoneNumber}
          className="w-full rounded-[18px] py-4 font-nunito font-900 text-[16px] text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-40 shadow-lg shadow-[#7B3FE4]/30"
          style={{ background: "linear-gradient(135deg, #7B3FE4, #5B2DC7)" }}>
          Continuer <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default Retrait;
