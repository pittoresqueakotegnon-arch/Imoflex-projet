import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Eye, EyeOff, Lock, Mail, Phone, User, ShieldCheck,
  Check, Search, Building2, ArrowLeft, ChevronDown
} from 'lucide-react';
import { useAuth, SignUpParams } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { diagnoseAndShowError } from '../../utils/errorDiagnostics';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Register — Inscription ImoFlex
//
// 4 étapes : form → role → waiting → success
//
// Futures extensions :
//   - Rôle "Agence immobilière" (actuellement hors MVP)
//   - Vérification numéro de téléphone par SMS/OTP
//   - Connexion via réseau social (Facebook, LinkedIn)
//   - Multi-pays / multi-langue
// ─────────────────────────────────────────────────────────────────────────────

type Step = 'form' | 'role' | 'otp' | 'success';
type UserRole = 'locataire' | 'proprietaire';

// Indicatifs pays africains (+ France) pour le sélecteur téléphone
const COUNTRY_CODES = [
  { code: '+229', flag: '🇧🇯', name: 'Bénin' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: '+223', flag: '🇲🇱', name: 'Mali' },
  { code: '+226', flag: '🇧🇫', name: 'Burkina Faso' },
  { code: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: '+224', flag: '🇬🇳', name: 'Guinée' },
  { code: '+228', flag: '🇹🇬', name: 'Togo' },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: '+243', flag: '🇨🇩', name: 'Congo RDC' },
  { code: '+33',  flag: '🇫🇷', name: 'France' },
];

// Indicateur de robustesse du mot de passe
function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: '' };
  const hasLength = password.length >= 8;
  const hasDigit = /\d/.test(password);
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  if (!hasLength) return { level: 1, label: 'Faible', color: '#EF4444' };
  if (hasLength && (!hasDigit || !hasLetter)) return { level: 2, label: 'Moyen', color: '#F59E0B' };
  if (hasLength && hasDigit && hasLetter && !hasSymbol) return { level: 3, label: 'Bon', color: '#84CC16' };
  return { level: 4, label: 'Fort', color: '#22C55E' };
}

export default function Register() {
  const navigate = useNavigate();
  const { signUp, verifySignupOtp, resendSignupOtp, user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resending, setResending] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const OTP_LENGTH = 8;
  const [otpDigits, setOtpDigits] = useState<string[]>(new Array(OTP_LENGTH).fill(''));
  const [otpVerifying, setOtpVerifying] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [mounted, setMounted] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Bouton Google gelé temporairement à la demande de l'utilisateur (en attente de config Supabase / Google Cloud)
  const [googleVisible] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    acceptPrivacy: false,
  });

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Détection confirmation email
  useEffect(() => {
    if (step === 'otp' && user) setStep('success');
  }, [user, step]);

  const strength = getPasswordStrength(formData.password);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.full_name.trim()) newErrors.full_name = 'Nom complet requis';
    if (!formData.phone.trim()) newErrors.phone = 'Numéro de téléphone requis';
    if (!formData.email.trim()) newErrors.email = "L'email est requis";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Email invalide';
    if (!formData.password) newErrors.password = 'Mot de passe requis';
    else if (strength.level < 2) newErrors.password = 'Mot de passe trop faible (min. 8 caractères)';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Les mots de passe ne correspondent pas';
    if (!formData.acceptTerms) newErrors.acceptTerms = "Vous devez accepter les conditions d'utilisation";
    if (!formData.acceptPrivacy) newErrors.acceptPrivacy = 'Vous devez accepter la politique de confidentialité';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) setStep('role');
  };

  const handleSubmit = async () => {
    if (!selectedRole) {
      setErrors({ role: 'Choisissez votre profil' });
      return;
    }
    setLoading(true);
    try {
      const params: SignUpParams = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: `${selectedCountry.code}${formData.phone}`,
        role: selectedRole,
      };
      const res = await signUp(params);
      
      // Si la confirmation d'email est désactivée dans Supabase Dashboard, Supabase crée une session active immédiatement
      if (res?.session) {
        showToast('Compte créé avec succès !', 'success');
        navigate(selectedRole === 'proprietaire' ? '/pro/dashboard' : '/dashboard', { replace: true });
        return;
      }
      setStep('otp');
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendSignupOtp(formData.email);
      showToast('Nouveau code envoyé !', 'success');
      setOtpDigits(new Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
    } finally {
      setResending(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value;
    setOtpDigits(newDigits);
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasteData) return;
    const newDigits = new Array(OTP_LENGTH).fill('');
    pasteData.split('').forEach((char, i) => { newDigits[i] = char; });
    setOtpDigits(newDigits);
    const nextEmpty = newDigits.findIndex(d => !d);
    const focusIdx = nextEmpty === -1 ? OTP_LENGTH - 1 : nextEmpty;
    setTimeout(() => otpRefs.current[focusIdx]?.focus(), 0);
  };

  const handleOtpVerify = async () => {
    const token = otpDigits.join('');
    if (token.length < OTP_LENGTH) {
      showToast(`Entrez les ${OTP_LENGTH} chiffres du code`, 'error');
      return;
    }
    setOtpVerifying(true);
    try {
      await verifySignupOtp(formData.email, token);
      setStep('success');
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
      setOtpDigits(new Array(OTP_LENGTH).fill(''));
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) showToast('Connexion Google non disponible pour l\'instant', 'info');
    } catch {
      showToast('Connexion Google non disponible pour l\'instant', 'info');
    } finally {
      setGoogleLoading(false);
    }
  };

  const update = (field: string, value: string | boolean) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const fadeStyle = (delay = 0) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(20px)',
    transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms`,
  });

  // ── ÉCRAN OTP ─────────────────────────────────────────────────────────────
  if (step === 'otp') {
    const otpComplete = otpDigits.every(d => d !== '');
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-8 bg-[var(--imx-bg-app)]"
      >
        {/* Icône */}
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
          style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 0 40px rgba(168,85,247,0.2)' }}
        >
          <Mail size={32} style={{ color: 'var(--imx-accent-light)' }} />
        </div>

        <h1
          className="text-2xl mb-2 text-center"
          style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}
        >
          Code de confirmation
        </h1>
        <p className="text-sm text-center mb-1 max-w-xs" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
          Nous avons envoyé un code à
        </p>
        <p className="text-sm font-semibold mb-1" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-primary)' }}>
          {formData.email}
        </p>
        <p className="text-xs text-center mb-8 max-w-xs" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
          Si vous ne le trouvez pas, vérifiez votre dossier{' '}
          <strong style={{ color: 'var(--imx-accent-light)' }}>Spam / Courrier indésirable</strong>.
        </p>

        {/* Cases OTP */}
        <div className="flex gap-2 mb-6 w-full max-w-xs justify-center" onPaste={handleOtpPaste}>
          {otpDigits.map((digit, i) => (
            <input
              key={i}
              ref={el => { otpRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              pattern="\d"
              maxLength={1}
              value={digit}
              onChange={e => handleOtpChange(i, e.target.value)}
              onKeyDown={e => handleOtpKeyDown(i, e)}
              autoFocus={i === 0}
              className="w-10 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all"
              style={{
                background: 'rgba(168,85,247,0.08)',
                borderColor: digit ? 'var(--imx-accent-light)' : 'rgba(168,85,247,0.3)',
                color: 'var(--imx-text-primary)',
                fontFamily: 'Space Grotesk',
                boxShadow: digit ? '0 0 12px rgba(168,85,247,0.3)' : 'none',
              }}
            />
          ))}
        </div>

        {/* Bouton confirmer */}
        <button
          onClick={handleOtpVerify}
          disabled={!otpComplete || otpVerifying}
          className="btn-primary w-full max-w-xs mb-4"
          style={{ opacity: otpComplete ? 1 : 0.5 }}
        >
          {otpVerifying ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Vérification...
            </span>
          ) : 'Confirmer mon compte'}
        </button>

        {/* Renvoyer */}
        <button
          onClick={handleResend}
          disabled={resending}
          className="btn-ghost w-full max-w-xs text-sm"
        >
          {resending ? 'Envoi...' : "Je n'ai pas reçu de code — Renvoyer"}
        </button>
      </div>
    );
  }

  // ── ÉCRAN SUCCESS ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8 bg-[var(--imx-bg-app)]">
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', animation: 'scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(34,197,94,0.2)' }}>
            <Check size={36} style={{ color: '#22C55E' }} />
          </div>
        </div>
        <h1 className="text-3xl mb-3 text-center" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
          Compte créé !
        </h1>
        <p className="text-sm text-center mb-2 max-w-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
          Bienvenue sur ImoFlex. Votre compte est activé, vous pouvez commencer dès maintenant.
        </p>
        <p className="text-sm text-center mb-12 max-w-xs" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
          Explorez la plateforme et publiez ou trouvez votre logement idéal.
        </p>
        <button onClick={() => navigate('/')} className="btn-primary w-full max-w-xs">
          Explorer ImoFlex
        </button>
        <style>{`@keyframes scaleIn { from{transform:scale(0);opacity:0} to{transform:scale(1);opacity:1} }`}</style>
      </div>
    );
  }

  // ── ÉCRAN CHOIX DU RÔLE ───────────────────────────────────────────────────
  if (step === 'role') {
    const roles = [
      {
        id: 'locataire' as UserRole,
        icon: <Search size={28} className="text-white" />,
        label: 'Locataire',
        description: 'Je recherche un logement et je souhaite gérer mes paiements.',
        accent: 'var(--imx-accent)',
        gradient: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)',
      },
      {
        id: 'proprietaire' as UserRole,
        icon: <Building2 size={28} style={{ color: 'var(--imx-bg-deep)' }} />,
        label: 'Propriétaire',
        description: 'Je souhaite publier et gérer mes biens immobiliers.',
        accent: '#F59E0B',
        gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
      },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-[var(--imx-bg-app)]">
        <div className="px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
          <button onClick={() => setStep('form')}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--imx-border)', border: '1px solid var(--imx-border)' }}>
            <ArrowLeft size={18} style={{ color: 'var(--imx-text-secondary)' }} />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-5 pt-8 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
            Vous êtes…
          </h1>
          <p className="text-sm mb-8" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
            Choisissez le profil qui correspond à votre situation.
          </p>

          <div className="flex flex-col gap-4 mb-8">
            {roles.map((role) => {
              const isSelected = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className="relative flex items-start gap-4 p-5 rounded-3xl text-left transition-all duration-200"
                  style={{
                    background: isSelected ? `${role.accent}14` : 'var(--imx-border)',
                    border: `1.5px solid ${isSelected ? role.accent : 'var(--imx-border)'}`,
                    boxShadow: isSelected ? `0 0 24px ${role.accent}25` : 'none',
                  }}
                >
                  {/* Icône */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: role.gradient }}>
                    {role.icon}
                  </div>
                  {/* Texte */}
                  <div className="flex-1 pt-1">
                    <p className="font-bold text-base mb-1"
                      style={{ fontFamily: 'Sora', color: isSelected ? 'var(--imx-text-primary)' : '#C8BFF0' }}>
                      {role.label}
                    </p>
                    <p className="text-sm leading-relaxed"
                      style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
                      {role.description}
                    </p>
                  </div>
                  {/* Indicateur sélection */}
                  {isSelected && (
                    <div className="absolute top-4 right-4 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: role.accent }}>
                      <Check size={11} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {errors.role && (
            <p className="text-sm mb-4 text-center" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>
              {errors.role}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !selectedRole}
            className="btn-primary w-full"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Créer mon compte'
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── ÉCRAN FORMULAIRE ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[var(--imx-bg-app)]">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--imx-border)', border: '1px solid var(--imx-border)' }}>
          <ArrowLeft size={18} style={{ color: 'var(--imx-text-secondary)' }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-6 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        <div style={fadeStyle(0)}>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'Sora', fontWeight: 900, color: 'var(--imx-text-primary)' }}>
            Créer un compte
          </h1>
          <p className="text-sm mb-8" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
            Rejoignez ImoFlex gratuitement
          </p>
        </div>

        <form onSubmit={handleContinue} className="flex flex-col gap-4" style={fadeStyle(80)}>
          {/* Nom complet */}
          <div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                <User size={18} />
              </div>
              <input type="text" value={formData.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                disabled={loading}
                className={`input-field w-full pl-11 ${errors.full_name ? 'border-red-500' : ''}`}
                placeholder="Nom complet" autoComplete="name" />
            </div>
            {errors.full_name && <p className="text-xs mt-1 ml-1" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.full_name}</p>}
          </div>

          {/* Téléphone avec sélecteur pays */}
          <div>
            <div className="flex gap-2">
              {/* Sélecteur pays */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCountryPicker(!showCountryPicker)}
                  className="input-field flex items-center gap-1.5 pr-2 whitespace-nowrap"
                  style={{ minWidth: '90px', height: '54px', paddingLeft: '12px', paddingRight: '8px' }}
                >
                  <span>{selectedCountry.flag}</span>
                  <span className="text-sm" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-primary)' }}>{selectedCountry.code}</span>
                  <ChevronDown size={14} style={{ color: '#6B5F8F' }} />
                </button>

                {/* Dropdown pays */}
                {showCountryPicker && (
                  <div
                    className="absolute top-full left-0 mt-1 w-56 rounded-2xl overflow-hidden z-30"
                    style={{ background: 'var(--imx-surface-2)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
                  >
                    <div className="max-h-52 overflow-y-auto">
                      {COUNTRY_CODES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => { setSelectedCountry(c); setShowCountryPicker(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                        >
                          <span>{c.flag}</span>
                          <span className="text-sm flex-1" style={{ fontFamily: 'Space Grotesk', color: '#C8BFF0' }}>{c.name}</span>
                          <span className="text-xs" style={{ color: '#6B5F8F' }}>{c.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Numéro */}
              <div className="flex-1 relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                  <Phone size={18} />
                </div>
                <input type="tel" value={formData.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  disabled={loading}
                  className={`input-field w-full pl-11 ${errors.phone ? 'border-red-500' : ''}`}
                  placeholder="Numéro de téléphone" autoComplete="tel" />
              </div>
            </div>
            {errors.phone && <p className="text-xs mt-1 ml-1" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                <Mail size={18} />
              </div>
              <input type="email" value={formData.email}
                onChange={(e) => update('email', e.target.value)}
                disabled={loading}
                className={`input-field w-full pl-11 ${errors.email ? 'border-red-500' : ''}`}
                placeholder="Adresse e-mail" autoComplete="email" />
            </div>
            {errors.email && <p className="text-xs mt-1 ml-1" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.email}</p>}
          </div>

          {/* Mot de passe + robustesse */}
          <div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                <Lock size={18} />
              </div>
              <input type={showPassword ? 'text' : 'password'} value={formData.password}
                onChange={(e) => update('password', e.target.value)}
                disabled={loading}
                className={`input-field w-full pl-11 pr-12 ${errors.password ? 'border-red-500' : ''}`}
                placeholder="Mot de passe" autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: showPassword ? 'var(--imx-accent-light)' : '#6B5F8F' }}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Indicateur robustesse */}
            {formData.password && (
              <div className="mt-2 px-1">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                      style={{ background: i <= strength.level ? strength.color : 'var(--imx-border)' }} />
                  ))}
                </div>
                <p className="text-xs" style={{ fontFamily: 'Space Grotesk', color: strength.color }}>
                  {strength.label}
                </p>
              </div>
            )}
            {errors.password && <p className="text-xs mt-1 ml-1" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.password}</p>}
          </div>

          {/* Confirmation mot de passe */}
          <div>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#6B5F8F' }}>
                <ShieldCheck size={18} />
              </div>
              <input type={showConfirm ? 'text' : 'password'} value={formData.confirmPassword}
                onChange={(e) => update('confirmPassword', e.target.value)}
                disabled={loading}
                className={`input-field w-full pl-11 pr-12 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                placeholder="Confirmer le mot de passe" autoComplete="new-password" />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: showConfirm ? 'var(--imx-accent-light)' : '#6B5F8F' }}>
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs mt-1 ml-1" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.confirmPassword}</p>}
          </div>

          {/* Acceptations légales */}
          <div className="flex flex-col gap-3 mt-2" style={fadeStyle(160)}>
            {/* CGU */}
            <label className="flex items-start gap-3 cursor-pointer"
              onClick={() => update('acceptTerms', !formData.acceptTerms)}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                style={{
                  background: formData.acceptTerms ? 'var(--imx-accent)' : 'transparent',
                  border: `1.5px solid ${formData.acceptTerms ? 'var(--imx-accent)' : 'rgba(255,255,255,0.15)'}`,
                }}>
                {formData.acceptTerms && <Check size={11} className="text-white" />}
              </div>
              <span className="text-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
                J'accepte les{' '}
                <a href="#" onClick={(e) => e.stopPropagation()}
                  className="underline" style={{ color: 'var(--imx-accent-light)' }}>
                  Conditions d'utilisation
                </a>
              </span>
            </label>
            {errors.acceptTerms && <p className="text-xs -mt-2 ml-8" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.acceptTerms}</p>}

            {/* Politique */}
            <label className="flex items-start gap-3 cursor-pointer"
              onClick={() => update('acceptPrivacy', !formData.acceptPrivacy)}>
              <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                style={{
                  background: formData.acceptPrivacy ? 'var(--imx-accent)' : 'transparent',
                  border: `1.5px solid ${formData.acceptPrivacy ? 'var(--imx-accent)' : 'rgba(255,255,255,0.15)'}`,
                }}>
                {formData.acceptPrivacy && <Check size={11} className="text-white" />}
              </div>
              <span className="text-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-secondary)' }}>
                J'accepte la{' '}
                <a href="#" onClick={(e) => e.stopPropagation()}
                  className="underline" style={{ color: 'var(--imx-accent-light)' }}>
                  Politique de confidentialité
                </a>
              </span>
            </label>
            {errors.acceptPrivacy && <p className="text-xs -mt-2 ml-8" style={{ color: '#EF4444', fontFamily: 'Space Grotesk' }}>{errors.acceptPrivacy}</p>}
          </div>

          {/* Bouton continuer */}
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            Continuer
          </button>
        </form>

        {/* Google */}
        {googleVisible && (
          <>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'var(--imx-border)' }} />
              <span className="text-xs" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-text-muted)' }}>ou</span>
              <div className="flex-1 h-px" style={{ background: 'var(--imx-border)' }} />
            </div>
            <button onClick={handleGoogleSignIn} disabled={googleLoading}
              className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 transition-all"
              style={{
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                fontFamily: 'Space Grotesk',
                fontWeight: 600,
                fontSize: '0.9375rem',
                color: '#1C1E21',
              }}>
              {googleLoading ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continuer avec Google
                </>
              )}
            </button>
          </>
        )}

        {/* Lien connexion */}
        <div className="text-center mt-6">
          <span className="text-sm" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
            Déjà un compte ?{' '}
          </span>
          <Link to="/login" className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk', color: 'var(--imx-accent-light)' }}>
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
