import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, SignUpParams } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';

type UserRole = 'locataire' | 'proprietaire';

export default function Register() {
  const navigate = useNavigate();
  const { signUp, verifySignupOtp, resendSignupOtp } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [resending, setResending] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
  });

  /* ── Validation ──────────────────────────────────── */
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedRole) newErrors.role = 'Choisissez votre profil';
    if (!formData.full_name.trim()) newErrors.full_name = 'Le nom complet est requis';
    if (!formData.phone.trim()) newErrors.phone = 'Le téléphone est requis';
    if (!formData.email.trim()) newErrors.email = 'L\'email est requis';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (!formData.password) newErrors.password = 'Le mot de passe est requis';
    else if (formData.password.length < 8) newErrors.password = 'Min. 8 caractères';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ── Submit form ─────────────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(true);
    try {
      await signUp({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: formData.phone,
        role: selectedRole!,
      } as SignUpParams);
      setStep('otp');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du compte';
      showToast(message, 'error');
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP gestion ─────────────────────────────────── */
  const handleOtpChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[idx] = digit;
    setOtpDigits(newDigits);
    if (digit && idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(''));
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      setOtpError('Le code doit contenir 6 chiffres');
      return;
    }
    setLoading(true);
    setOtpError('');
    try {
      await verifySignupOtp(formData.email, code);
      setStep('success');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Code invalide ou expiré');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setResending(true);
    try {
      await resendSignupOtp(formData.email);
      showToast('Nouveau code envoyé', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur lors du renvoi', 'error');
    } finally {
      setResending(false);
    }
  };

  /* ── Écran OTP ───────────────────────────────────── */
  if (step === 'otp') {
    const otpCode = otpDigits.join('');
    return (
      <div className="min-h-screen flex flex-col px-5 pt-12 pb-8" style={{ background: '#120D2A', color: '#E8E0FF' }}>
        <button
          onClick={() => setStep('form')}
          className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-10 w-fit"
          style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Retour
        </button>

        {/* Icône téléphone */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-5">📱</div>
          <h1 className="font-nunito font-900 text-2xl text-[#E8E0FF] mb-2">Vérifiez votre numéro</h1>
          <p className="text-[#8B7BB5] text-sm" style={{ fontFamily: 'Space Grotesk' }}>
            Code envoyé à <span className="text-[#E8E0FF]">{formData.email}</span>
          </p>
        </div>

        {/* 6 boxes OTP */}
        <form onSubmit={handleVerifyOtp} className="flex-1 flex flex-col">
          <div className="flex justify-center gap-2.5 mb-3" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { otpRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(idx, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                disabled={loading}
                className={`otp-box ${digit ? 'filled' : ''}`}
              />
            ))}
          </div>

          {otpError && (
            <p className="text-red-400 text-xs text-center mb-3" style={{ fontFamily: 'Space Grotesk' }}>{otpError}</p>
          )}

          <p className="text-[#8B7BB5] text-xs text-center mb-8" style={{ fontFamily: 'Space Grotesk' }}>
            Renseignez le code dans 0:48
          </p>

          <button
            type="submit"
            disabled={loading || otpCode.length !== 6}
            className="btn-primary w-full"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Vérification...
              </>
            ) : 'Vérifier'}
          </button>

          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resending}
            className="w-full text-center text-[#A855F7] text-sm mt-4 font-semibold"
            style={{ fontFamily: 'Space Grotesk' }}
          >
            {resending ? 'Envoi...' : 'Renvoyer le code'}
          </button>
        </form>
      </div>
    );
  }

  /* ── Écran succès ────────────────────────────────── */
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-8" style={{ background: '#120D2A', color: '#E8E0FF' }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
          style={{ background: 'linear-gradient(135deg, #22C55E, #16A34A)', boxShadow: '0 8px 32px rgba(34,197,94,0.4)' }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 className="font-nunito font-900 text-2xl text-center mb-3">Compte créé !</h1>
        <p className="text-[#8B7BB5] text-sm text-center mb-10" style={{ fontFamily: 'Space Grotesk' }}>
          Vous êtes maintenant connecté(e). Explorez la marketplace !
        </p>
        <button onClick={() => navigate('/')} className="btn-primary w-full">Continuer</button>
      </div>
    );
  }

  /* ── Formulaire principal ────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col px-5 pt-12 pb-8" style={{ background: '#120D2A', color: '#E8E0FF' }}>
      {/* ← Retour */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-8 w-fit"
        style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Retour
      </button>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        <h1 className="font-nunito font-900 text-2xl text-[#E8E0FF] mb-1">Créer un compte</h1>
        <p className="text-[#8B7BB5] text-sm mb-5" style={{ fontFamily: 'Space Grotesk' }}>Quel est votre profil ?</p>

        {/* Rôles */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            type="button"
            onClick={() => setSelectedRole('locataire')}
            className={`role-card ${selectedRole === 'locataire' ? 'selected' : ''}`}
          >
            <div className="role-icon" style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div>
              <p className="font-nunito font-700 text-[#E8E0FF] text-sm">Locataire</p>
              <p className="text-[#8B7BB5] text-xs mt-0.5">Je cherche un logement</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRole('proprietaire')}
            className={`role-card ${selectedRole === 'proprietaire' ? 'selected' : ''}`}
          >
            <div className="role-icon" style={{ background: 'linear-gradient(135deg, #FBBF24, #F59E0B)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0D0720" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
            </div>
            <div>
              <p className="font-nunito font-700 text-[#E8E0FF] text-sm">Propriétaire</p>
              <p className="text-[#8B7BB5] text-xs mt-0.5">Je mets en location</p>
            </div>
          </button>
        </div>
        {errors.role && <p className="text-red-400 text-xs mb-4">{errors.role}</p>}

        {/* Nom complet */}
        <div className="mb-4">
          <label className="label block mb-2">NOM COMPLET</label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            disabled={loading}
            className={`input-field ${errors.full_name ? 'border-red-500/50' : ''}`}
            placeholder="Votre nom"
          />
          {errors.full_name && <p className="text-red-400 text-xs mt-1">{errors.full_name}</p>}
        </div>

        {/* Téléphone */}
        <div className="mb-4">
          <label className="label block mb-2">TÉLÉPHONE</label>
          <div className="relative">
            <span
              className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#8B7BB5] select-none"
              style={{ fontFamily: 'Space Grotesk' }}
            >
              🇧🇯 +229
            </span>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={loading}
              className={`input-field pl-[90px] ${errors.phone ? 'border-red-500/50' : ''}`}
              placeholder="01 XX XX XX"
            />
          </div>
          {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="label block mb-2">EMAIL</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={loading}
            className={`input-field ${errors.email ? 'border-red-500/50' : ''}`}
            placeholder="vous@exemple.com"
          />
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
        </div>

        {/* Mot de passe */}
        <div className="mb-6">
          <label className="label block mb-2">MOT DE PASSE</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={loading}
            className={`input-field ${errors.password ? 'border-red-500/50' : ''}`}
            placeholder="Min. 8 caractères"
          />
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
        </div>

        {errors.form && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-5" style={{ fontFamily: 'Space Grotesk' }}>
            {errors.form}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Création...
            </>
          ) : 'Créer mon compte'}
        </button>
      </form>
    </div>
  );
}
