import React, { useRef, useState, useEffect } from 'react';
import { X, Check, RotateCcw, ShieldCheck, AlertCircle, AlertTriangle } from 'lucide-react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  documentTitle: string;
  signerName: string;
  signerRole: 'Propriétaire' | 'Locataire';
  allowReserves?: boolean;
  onConfirm: (signatureData: {
    signatureSvg: string;
    signerName: string;
    consent: boolean;
    timestamp: string;
    reserves?: string;
  }) => Promise<void>;
  loading?: boolean;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  title,
  documentTitle,
  signerName,
  signerRole,
  allowReserves = false,
  onConfirm,
  loading = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [name, setName] = useState(signerName);
  const [tenantReserves, setTenantReserves] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(signerName);
      setHasDrawn(false);
      setConsentGiven(false);
      setTenantReserves('');
      setError(null);
      // Initialiser le canvas après affichage du modal
      setTimeout(initCanvas, 150);
    }
  }, [isOpen, signerName]);

  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Adapter pour les écrans haute densité (Retina)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = '#1e1b4b'; // Encre bleue sombre officielle
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
    setError(null);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Veuillez renseigner votre nom complet.');
      return;
    }
    if (!consentGiven) {
      setError('Vous devez cocher la case d’acceptation et de consentement éclairé.');
      return;
    }
    if (!hasDrawn) {
      setError('Veuillez apposer votre signature manuscrite dans le cadre.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Récupérer la signature en DataURL (image png)
    const signatureDataUrl = canvas.toDataURL('image/png');

    await onConfirm({
      signatureSvg: signatureDataUrl,
      signerName: name.trim(),
      consent: true,
      timestamp: new Date().toISOString(),
      reserves: allowReserves && tenantReserves.trim() ? tenantReserves.trim() : undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[var(--imx-surface-1)] border border-[var(--imx-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="px-5 py-4 border-b border-[var(--imx-border)] flex items-center justify-between bg-[var(--imx-surface-2)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet/10 text-violet flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-nunito font-900 text-base text-[var(--imx-text-primary)] leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-[var(--imx-text-secondary)] font-space-grotesk mt-0.5">
                {documentTitle} • En qualité de {signerRole}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-full hover:bg-[var(--imx-surface-3)] text-[var(--imx-text-muted)] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Corps */}
        <div className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nom du signataire */}
          <div>
            <label className="label block mb-1 text-xs">NOM COMPLET DU SIGNATAIRE</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm font-bold"
              placeholder="Ex: Koffi Mensah Jean"
              disabled={loading}
            />
          </div>

          {/* Option réserves locataire */}
          {allowReserves && signerRole === 'Locataire' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-400" />
                <span>RÉSERVES OU DÉGRADATIONS NON MENTIONNÉES (OPTIONNEL)</span>
              </label>
              <textarea
                value={tenantReserves}
                onChange={(e) => setTenantReserves(e.target.value)}
                className="input-field text-xs h-16 resize-none"
                placeholder="Ex: Robinet salle de bain présentant une micro-fuite..."
                disabled={loading}
              />
              <p className="text-[10px] text-amber-400/80 italic">
                Toute réserve sera actée contradictoirement pour protéger la restitution de votre caution.
              </p>
            </div>
          )}

          {/* Cadre de signature manuscrite tactile */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label text-xs">VOTRE SIGNATURE MANUSCRITE DESSINÉE</label>
              <button
                type="button"
                onClick={clearCanvas}
                disabled={loading || !hasDrawn}
                className="text-[11px] text-[var(--imx-text-secondary)] hover:text-red-400 flex items-center gap-1 transition"
              >
                <RotateCcw size={12} />
                <span>Effacer</span>
              </button>
            </div>
            <div className="relative border-2 border-dashed border-[var(--imx-border)] rounded-2xl bg-white overflow-hidden touch-none shadow-inner">
              <canvas
                ref={canvasRef}
                className="w-full h-36 cursor-crosshair block"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
              {!hasDrawn && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-gray-400 text-xs">
                  <span className="font-medium">Signez du doigt ou de la souris ici</span>
                  <span className="text-[10px] text-gray-400 mt-0.5 font-space-grotesk">Zone tactile certifiée conforme</span>
                </div>
              )}
            </div>
          </div>

          {/* Mention de consentement éclairé (Loi Bénin 2017-20) */}
          <div className="p-3.5 rounded-2xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)]">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-violet cursor-pointer"
                disabled={loading}
              />
              <span className="text-[11px] text-[var(--imx-text-secondary)] leading-relaxed">
                Je confirme avoir lu et vérifié l'intégralité du document. J'appose ma signature et donne mon consentement exprès et ferme aux engagements prévus par la législation béninoise.
              </span>
            </label>
          </div>

          {/* Avertissement de transparence juridique */}
          <p className="text-[10px] text-[var(--imx-text-muted)] italic font-space-grotesk text-center px-2">
            La signature manuscrite tracée, l'horodatage UTC et l'adresse IP sont scellés numériquement pour garantir l'intégrité du document conformément au Code du numérique béninois.
          </p>
        </div>

        {/* Boutons d'action */}
        <div className="p-4 border-t border-[var(--imx-border)] bg-[var(--imx-surface-2)] flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 px-4 rounded-xl border border-[var(--imx-border)] text-[var(--imx-text-secondary)] text-sm font-semibold hover:bg-[var(--imx-surface-3)] transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !hasDrawn || !consentGiven || !name.trim()}
            className="flex-1 py-3 px-4 rounded-xl bg-violet text-white text-sm font-bold shadow-lg hover:bg-violet-dark transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Valider et signer</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
