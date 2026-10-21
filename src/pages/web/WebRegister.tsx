import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, ArrowRight, User, Building2, Home, Check } from 'lucide-react';
import { useAuth, SignUpParams } from '../../hooks/useAuth';

/* ─────────────────────────────────────────────────────────────
   WebRegister — Inscription web ImoFlex
   Réutilise les mêmes hooks et Supabase Auth que la version mobile
───────────────────────────────────────────────────────────── */

type Step = 'role' | 'form' | 'otp' | 'done';
type Role = 'locataire' | 'proprietaire' | 'agence';

const ROLES = [
  {
    value: 'locataire' as Role,
    icon: <Home size={28} />,
    title: 'Locataire',
    desc: 'Je cherche un logement à louer et veux payer mon loyer facilement.',
    color: '#3B82F6',
    bg: '#EFF6FF',
  },
  {
    value: 'proprietaire' as Role,
    icon: <User size={28} />,
    title: 'Propriétaire',
    desc: 'Je possède des biens et veux les gérer, louer et percevoir mes loyers.',
    color: '#7B3FE4',
    bg: '#F1EBFF',
  },
  {
    value: 'agence' as Role,
    icon: <Building2 size={28} />,
    title: 'Agence immobilière',
    desc: 'Je gère des biens pour le compte de propriétaires et publie des annonces.',
    color: '#10B981',
    bg: '#ECFDF5',
  },
];

function PasswordStrength({ password }: { password: string }) {
  const getLevel = () => {
    if (!password) return 0;
    let level = 0;
    if (password.length >= 8) level++;
    if (/\d/.test(password)) level++;
    if (/[a-zA-Z]/.test(password)) level++;
    if (/[^a-zA-Z0-9]/.test(password)) level++;
    return level;
  };
  const level = getLevel();
  const labels = ['', 'Faible', 'Moyen', 'Bon', 'Fort'];
  const colors = ['', '#EF4444', '#F59E0B', '#84CC16', '#22C55E'];
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-colors" style={{ background: i <= level ? colors[level] : 'var(--imx-border)' }} />
        ))}
      </div>
      <p className="text-[11px]" style={{ color: colors[level] }}>{labels[level]}</p>
    </div>
  );
}

export default function WebRegister() {
  const navigate = useNavigate();
  const { signUp, verifySignupOtp, resendSignupOtp } = useAuth();

  const [step, setStep] = useState<Step>('role');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nomAgence, setNomAgence] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  // OTP
  const [otp, setOtp] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setStep('form');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (!acceptTerms) { setError('Veuillez accepter les CGU pour continuer.'); return; }
    setLoading(true);
    setError(null);
    try {
      const params: SignUpParams = {
        email: email.trim().toLowerCase(),
        password,
        full_name: fullName.trim(),
        phone: phone.replace(/\s/g, ''),
        role: selectedRole,
        ...(selectedRole === 'agence' ? { nom_agence: nomAgence.trim() } : {}),
      };
      const data = await signUp(params);
      setRegisteredEmail(email.trim().toLowerCase());

      if (data?.session) {
        // Email confirmation disabled — user is immediately logged in
        const redirects: Record<Role, string> = {
          locataire: '/web/dashboard',
          proprietaire: '/web/pro/dashboard',
          agence: '/web/agence/dashboard',
        };
        navigate(redirects[selectedRole], { replace: true });
      } else {
        setStep('otp');
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpLoading(true);
    setError(null);
    try {
      await verifySignupOtp(registeredEmail, otp.trim());
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Code invalide ou expiré.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await resendSignupOtp(registeredEmail);
    } catch {}
    setResendLoading(false);
  };

  const InputField = ({ label, type = 'text', value, onChange, placeholder, required = false }: any) => (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-colors"
        style={{
          background: 'var(--imx-surface)',
          border: '1.5px solid var(--imx-border)',
          color: 'var(--imx-text-primary)',
          fontFamily: 'Space Grotesk',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--imx-accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--imx-border)')}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4" style={{ background: 'var(--imx-bg-app)' }}>
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ background: '#F1EBFF' }}>
            <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
          </div>
          <span className="font-black text-lg" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>ImoFlex</span>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* ── STEP: Choose role ── */}
        {step === 'role' && (
          <div>
            <h1 className="text-2xl font-black mb-1" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
              Créer un compte
            </h1>
            <p className="text-sm mb-7" style={{ color: 'var(--imx-text-muted)' }}>
              Déjà inscrit ?{' '}
              <Link to="/web/login" className="font-semibold underline" style={{ color: 'var(--imx-accent)' }}>
                Se connecter
              </Link>
            </p>
            <p className="text-sm font-semibold mb-4" style={{ color: 'var(--imx-text-primary)' }}>
              Je suis…
            </p>
            <div className="space-y-3">
              {ROLES.map(r => (
                <button
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  className="flex items-center gap-4 w-full p-4 rounded-2xl text-left transition-all hover:-translate-y-0.5"
                  style={{
                    background: 'var(--imx-surface)',
                    border: '1.5px solid var(--imx-border)',
                    boxShadow: 'var(--imx-card-shadow-sm)',
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: r.bg, color: r.color }}
                  >
                    {r.icon}
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: 'var(--imx-text-primary)' }}>{r.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--imx-text-muted)' }}>{r.desc}</p>
                  </div>
                  <ArrowRight size={18} className="ml-auto flex-shrink-0" style={{ color: 'var(--imx-text-muted)' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Form ── */}
        {step === 'form' && selectedRole && (
          <div>
            <button
              onClick={() => { setStep('role'); setError(null); }}
              className="flex items-center gap-1 text-sm mb-5"
              style={{ color: 'var(--imx-text-muted)' }}
            >
              ← Retour
            </button>
            <h1 className="text-2xl font-black mb-1" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
              Vos informations
            </h1>
            <p className="text-sm mb-7" style={{ color: 'var(--imx-text-muted)' }}>
              Compte <span className="font-semibold" style={{ color: 'var(--imx-accent)' }}>
                {ROLES.find(r => r.value === selectedRole)?.title}
              </span>
            </p>

            <form onSubmit={handleRegister} className="space-y-4">
              <InputField label="Nom complet" value={fullName} onChange={setFullName} placeholder="Jean Dupont" required />

              {selectedRole === 'agence' && (
                <InputField label="Nom de l'agence" value={nomAgence} onChange={setNomAgence} placeholder="Agence Immo Plus" required />
              )}

              <InputField label="Adresse e-mail" type="email" value={email} onChange={setEmail} placeholder="votre@email.com" required />

              <InputField label="Numéro de téléphone" type="tel" value={phone} onChange={setPhone} placeholder="+229 01 23 45 67" required />

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none"
                    style={{
                      background: 'var(--imx-surface)',
                      border: '1.5px solid var(--imx-border)',
                      color: 'var(--imx-text-primary)',
                      fontFamily: 'Space Grotesk',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--imx-accent)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--imx-border)')}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--imx-text-muted)' }}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{
                    background: 'var(--imx-surface)',
                    border: `1.5px solid ${confirmPassword && password !== confirmPassword ? '#EF4444' : 'var(--imx-border)'}`,
                    color: 'var(--imx-text-primary)',
                    fontFamily: 'Space Grotesk',
                  }}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[11px] mt-1 text-red-400">Les mots de passe ne correspondent pas.</p>
                )}
              </div>

              {/* Terms */}
              <button
                type="button"
                onClick={() => setAcceptTerms(!acceptTerms)}
                className="flex items-start gap-3 w-full text-left"
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                  style={{
                    background: acceptTerms ? 'var(--imx-accent)' : 'transparent',
                    border: acceptTerms ? 'none' : '1.5px solid var(--imx-border)',
                  }}
                >
                  {acceptTerms && <Check size={12} className="text-white" />}
                </div>
                <span className="text-xs" style={{ color: 'var(--imx-text-muted)' }}>
                  J'accepte les{' '}
                  <Link to="/cgu" className="underline" style={{ color: 'var(--imx-accent)' }} onClick={e => e.stopPropagation()}>
                    Conditions d'utilisation
                  </Link>
                  {' '}et la{' '}
                  <Link to="/politique-confidentialite" className="underline" style={{ color: 'var(--imx-accent)' }} onClick={e => e.stopPropagation()}>
                    Politique de confidentialité
                  </Link>
                </span>
              </button>

              <button
                type="submit"
                disabled={loading || !fullName || !email || !phone || !password || password !== confirmPassword || !acceptTerms}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:opacity-90"
                style={{
                  background: 'var(--imx-accent)',
                  fontFamily: 'Space Grotesk',
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>Créer mon compte <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP: OTP verification ── */}
        {step === 'otp' && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--imx-accent-xlight)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#7B3FE4" strokeWidth={2} className="w-8 h-8">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-black mb-2" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
              Vérification e-mail
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--imx-text-muted)' }}>
              Un code a été envoyé à <strong style={{ color: 'var(--imx-text-primary)' }}>{registeredEmail}</strong>
            </p>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Code à 6 ou 8 chiffres"
                className="w-full px-4 py-4 rounded-xl text-center text-2xl tracking-widest outline-none"
                style={{
                  background: 'var(--imx-surface)',
                  border: '1.5px solid var(--imx-border)',
                  color: 'var(--imx-text-primary)',
                  fontFamily: 'Space Grotesk',
                  letterSpacing: '0.3em',
                }}
              />
              <button
                type="submit"
                disabled={otpLoading || otp.length < 6}
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'var(--imx-accent)', opacity: otpLoading ? 0.7 : 1 }}
              >
                {otpLoading ? <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : 'Confirmer'}
              </button>
            </form>

            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="mt-4 text-sm"
              style={{ color: 'var(--imx-accent)' }}
            >
              {resendLoading ? 'Envoi…' : 'Renvoyer le code'}
            </button>
          </div>
        )}

        {/* ── STEP: Done ── */}
        {step === 'done' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#ECFDF5' }}>
              <Check size={36} style={{ color: '#10B981' }} />
            </div>
            <h1 className="text-2xl font-black mb-2" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
              Compte créé !
            </h1>
            <p className="text-sm mb-8" style={{ color: 'var(--imx-text-muted)' }}>
              Votre compte est confirmé et actif. Bienvenue sur ImoFlex.
            </p>
            <Link
              to="/web/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-white"
              style={{ background: 'var(--imx-accent)' }}
            >
              Se connecter <ArrowRight size={15} />
            </Link>
          </div>
        )}

        {step === 'role' && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--imx-text-muted)' }}>
            Déjà inscrit ?{' '}
            <Link to="/web/login" className="underline font-medium" style={{ color: 'var(--imx-accent)' }}>
              Se connecter
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
