import React, { useState, useEffect } from 'react';
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

type Step = 'form' | 'role' | 'waiting' | 'success';
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
  const { signUp, resendSignupOtp, user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resending, setResending] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
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
    if (step === 'waiting' && user) setStep('success');
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
      setStep('waiting');
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
      showToast('Email de confirmation renvoyé', 'success');
    } catch (err) {
      diagnoseAndShowError(err, 'Authentification');
    } finally {
      setResending(false);
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

  // ── ÉCRAN WAITING ──────────────────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8"
        style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 40%, #120D2A 100%)' }}>
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8"
          style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', boxShadow: '0 0 40px rgba(168,85,247,0.2)' }}>
          <Mail size={32} style={{ color: '#A855F7' }} />
        </div>
        <h1 className="text-2xl mb-3 text-center" style={{ fontFamily: 'Nunito', fontWeight: 900, color: '#E8E0FF' }}>
          Vérifiez votre boîte mail
        </h1>
        <p className="text-sm text-center mb-2 max-w-xs" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
          Un lien de confirmation a été envoyé à
        </p>
        <p className="text-base font-semibold mb-8" style={{ fontFamily: 'Space Grotesk', color: '#E8E0FF' }}>
          {formData.email}
        </p>
        <p className="text-sm text-center mb-10 max-w-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
          Cliquez sur le lien dans l'email pour activer votre compte. Vous serez connecté automatiquement.
        </p>
        <div className="flex items-center gap-2 mb-8" style={{ color: '#6B5F8F' }}>
          <div className="w-4 h-4 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm" style={{ fontFamily: 'Space Grotesk' }}>En attente de confirmation…</span>
        </div>
        <button onClick={handleResend} disabled={resending}
          className="btn-ghost w-full max-w-xs">
          {resending ? 'Envoi…' : "Je n'ai rien reçu — Renvoyer"}
        </button>
      </div>
    );
  }

  // ── ÉCRAN SUCCESS ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8"
        style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 40%, #120D2A 100%)' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-8"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', animation: 'scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(34,197,94,0.2)' }}>
            <Check size={36} style={{ color: '#22C55E' }} />
          </div>
        </div>
        <h1 className="text-3xl mb-3 text-center" style={{ fontFamily: 'Nunito', fontWeight: 900, color: '#E8E0FF' }}>
          Compte créé !
        </h1>
        <p className="text-sm text-center mb-2 max-w-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
          Bienvenue sur ImoFlex. Vérifiez votre email pour activer votre compte.
        </p>
        <p className="text-sm text-center mb-12 max-w-xs" style={{ fontFamily: 'Space Grotesk', color: '#6B5F8F' }}>
          Vous pouvez explorer la plateforme pendant ce temps.
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
        accent: '#7B3FE4',
        gradient: 'linear-gradient(135deg, #7B3FE4 0%, #A855F7 100%)',
      },
      {
        id: 'proprietaire' as UserRole,
        icon: <Building2 size={28} style={{ color: '#0D0720' }} />,
        label: 'Propriétaire',
        description: 'Je souhaite publier et gérer mes biens immobiliers.',
        accent: '#F59E0B',
        gradient: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
      },
    ];

    return (
      <div className="min-h-screen flex flex-col"
        style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 40%, #120D2A 100%)' }}>
        <div className="px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
          <button onClick={() => setStep('form')}
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <ArrowLeft size={18} style={{ color: '#8B7BB5' }} />
          </button>
        </div>

        <div className="flex-1 flex flex-col px-5 pt-8 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <h1 className="text-3xl mb-2" style={{ fontFamily: 'Nunito', fontWeight: 900, color: '#E8E0FF' }}>
            Vous êtes…
          </h1>
          <p className="text-sm mb-8" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
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
                    background: isSelected ? `${role.accent}14` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${isSelected ? role.accent : 'rgba(255,255,255,0.08)'}`,
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
                      style={{ fontFamily: 'Nunito', color: isSelected ? '#E8E0FF' : '#C8BFF0' }}>
                      {role.label}
                    </p>
                    <p className="text-sm leading-relaxed"
                      style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
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
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(160deg, #0D0720 0%, #1E1545 40%, #120D2A 100%)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-safe" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ArrowLeft size={18} style={{ color: '#8B7BB5' }} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-5 pt-6 pb-safe" style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}>
        <div style={fadeStyle(0)}>
          <h1 className="text-3xl mb-1" style={{ fontFamily: 'Nunito', fontWeight: 900, color: '#E8E0FF' }}>
            Créer un compte
          </h1>
          <p className="text-sm mb-8" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
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
                  <span className="text-sm" style={{ fontFamily: 'Space Grotesk', color: '#E8E0FF' }}>{selectedCountry.code}</span>
                  <ChevronDown size={14} style={{ color: '#6B5F8F' }} />
                </button>

                {/* Dropdown pays */}
                {showCountryPicker && (
                  <div
                    className="absolute top-full left-0 mt-1 w-56 rounded-2xl overflow-hidden z-30"
                    style={{ background: '#1E1545', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
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
                style={{ color: showPassword ? '#A855F7' : '#6B5F8F' }}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Indicateur robustesse */}
            {formData.password && (
              <div className="mt-2 px-1">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                      style={{ background: i <= strength.level ? strength.color : 'rgba(255,255,255,0.08)' }} />
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
                style={{ color: showConfirm ? '#A855F7' : '#6B5F8F' }}>
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
                  background: formData.acceptTerms ? '#7B3FE4' : 'transparent',
                  border: `1.5px solid ${formData.acceptTerms ? '#7B3FE4' : 'rgba(255,255,255,0.15)'}`,
                }}>
                {formData.acceptTerms && <Check size={11} className="text-white" />}
              </div>
              <span className="text-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
                J'accepte les{' '}
                <a href="#" onClick={(e) => e.stopPropagation()}
                  className="underline" style={{ color: '#A855F7' }}>
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
                  background: formData.acceptPrivacy ? '#7B3FE4' : 'transparent',
                  border: `1.5px solid ${formData.acceptPrivacy ? '#7B3FE4' : 'rgba(255,255,255,0.15)'}`,
                }}>
                {formData.acceptPrivacy && <Check size={11} className="text-white" />}
              </div>
              <span className="text-xs leading-relaxed" style={{ fontFamily: 'Space Grotesk', color: '#8B7BB5' }}>
                J'accepte la{' '}
                <a href="#" onClick={(e) => e.stopPropagation()}
                  className="underline" style={{ color: '#A855F7' }}>
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
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <span className="text-xs" style={{ fontFamily: 'Space Grotesk', color: '#4A3D7A' }}>ou</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
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
          <Link to="/login" className="text-sm font-semibold" style={{ fontFamily: 'Space Grotesk', color: '#A855F7' }}>
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
