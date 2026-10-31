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
    badge: 'Recherche & Vie au logement',
    desc: 'Je cherche un logement à louer et souhaite payer mon loyer simplement en ligne.',
    features: [
      'Recherche et alertes en direct',
      'Paiement Mobile Money sécurisé',
      'Quittances et reçus automatiques',
    ],
    color: '#3B82F6',
    borderHover: '#3B82F6',
    bg: '#EFF6FF',
    accentBadgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    buttonClass: 'bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white',
  },
  {
    value: 'proprietaire' as Role,
    icon: <User size={28} />,
    title: 'Propriétaire',
    badge: 'Patrimoine & Rendement',
    desc: 'Je possède des biens et veux les louer, suivre mes locataires et percevoir mes loyers.',
    features: [
      'Suivi des encaissements en temps réel',
      'Portefeuille & retraits bancaires/MoMo',
      'Gestion simplifiée des baux actifs',
    ],
    color: '#7B3FE4',
    borderHover: '#7B3FE4',
    bg: '#F1EBFF',
    accentBadgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
    buttonClass: 'bg-purple-50 text-purple-700 group-hover:bg-[#7B3FE4] group-hover:text-white',
  },
  {
    value: 'agence' as Role,
    icon: <Building2 size={28} />,
    title: 'Agence immobilière',
    badge: 'Multi-mandats Professionnels',
    desc: 'Je gère un parc de biens pour plusieurs propriétaires et publie des annonces.',
    features: [
      'Gestion centralisée multi-mandats',
      'Publication & visibilité maximale',
      'Tableau de bord agence dédié',
    ],
    color: '#10B981',
    borderHover: '#10B981',
    bg: '#ECFDF5',
    accentBadgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    buttonClass: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white',
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
    } catch (_err) {
      // Échec silencieux du renvoi OTP
    }
    setResendLoading(false);
  };

  const selectedRoleObj = ROLES.find(r => r.value === selectedRole);

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
          fontFamily: 'Inter, sans-serif',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--imx-accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--imx-border)')}
      />
    </div>
  );

  return (
    <div className="w-full flex justify-center py-8 sm:py-12 px-4 sm:px-6">
      <div className={`w-full transition-all duration-300 ${step === 'role' ? 'max-w-5xl' : 'max-w-xl'}`}>

        {/* Header / Logo */}
        {step !== 'role' && (
          <div className="flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-xl overflow-hidden" style={{ background: '#F1EBFF' }}>
              <img src="/assets/logo-icon-transparent-recadre.png" alt="ImoFlex" className="w-full h-full object-cover" />
            </div>
            <span className="font-black text-lg" style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}>ImoFlex</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3.5 rounded-2xl mb-6 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP: Choose role ── */}
        {step === 'role' && (
          <div className="animate-fadeIn">
            {/* Header centré élégant */}
            <div className="text-center max-w-2xl mx-auto mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-50 text-[var(--imx-accent)] border border-purple-100 mb-3 shadow-2xs">
                <span>Étape 1 sur 2</span>
                <span className="w-1 h-1 rounded-full bg-[var(--imx-accent)]" />
                <span>Choix du profil</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-[#17132B] tracking-tight mb-2.5" style={{ fontFamily: 'Sora' }}>
                Comment souhaitez-vous utiliser ImoFlex ?
              </h1>
              <p className="text-sm text-gray-500 max-w-lg mx-auto">
                Sélectionnez votre profil d'usage pour accéder à un tableau de bord et des fonctionnalités adaptés à vos besoins.
              </p>
            </div>

            {/* Grille 3 colonnes SaaS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ROLES.map(r => (
                <div
                  key={r.value}
                  onClick={() => handleRoleSelect(r.value)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRoleSelect(r.value); }}
                  className="group relative rounded-3xl p-6 sm:p-7 flex flex-col justify-between text-left transition-all duration-200 cursor-pointer hover:-translate-y-1.5 hover:shadow-xl bg-white border-2 border-gray-200/80 hover:border-purple-300 shadow-2xs"
                >
                  <div>
                    {/* Top: Icon + Badge */}
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shadow-2xs"
                        style={{ background: r.bg, color: r.color }}
                      >
                        {r.icon}
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${r.accentBadgeBg}`}>
                        {r.badge}
                      </span>
                    </div>

                    {/* Title & Desc */}
                    <h3 className="text-xl font-black text-[#17132B] mb-2 group-hover:text-[var(--imx-accent)] transition-colors" style={{ fontFamily: 'Sora' }}>
                      {r.title}
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed mb-6">
                      {r.desc}
                    </p>

                    {/* Features list */}
                    <div className="space-y-2.5 pt-4 border-t border-gray-100 mb-6">
                      {r.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs text-gray-600">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: r.bg, color: r.color }}
                          >
                            <Check size={11} strokeWidth={3} />
                          </div>
                          <span className="font-medium">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Button Action */}
                  <div
                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 ${r.buttonClass}`}
                  >
                    <span>Choisir ce profil</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-center mt-8 text-gray-400">
              Déjà inscrit ?{' '}
              <Link to="/web/login" className="font-bold underline text-[var(--imx-accent)] hover:opacity-85">
                Se connecter à mon compte
              </Link>
            </p>
          </div>
        )}

        {/* ── STEP: Form ── */}
        {step === 'form' && selectedRole && (
          <div className="animate-fadeIn">
            {/* Bannière profil sélectionné */}
            <div className="p-3 sm:p-4 rounded-2xl border bg-white mb-6 flex items-center gap-3 shadow-2xs flex-wrap" style={{ borderColor: 'var(--imx-border)' }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: selectedRoleObj?.bg, color: selectedRoleObj?.color }}
                >
                  {selectedRoleObj?.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Profil sélectionné</p>
                  <h3 className="text-sm font-black text-[#17132B] truncate" style={{ fontFamily: 'Sora' }}>
                    {selectedRoleObj?.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setStep('role'); setError(null); }}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold text-[var(--imx-accent)] hover:bg-purple-50 transition-colors border border-purple-200"
              >
                Changer de profil
              </button>
            </div>

            <h1 className="text-2xl font-black mb-1 text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Finalisez votre inscription
            </h1>
            <p className="text-sm mb-6 text-gray-500">
              Remplissez vos informations personnelles pour créer votre accès sécurisé.
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
                      fontFamily: 'Inter, sans-serif',
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
                    fontFamily: 'Inter, sans-serif',
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
                  <Link to="/web/cgu" className="underline" style={{ color: 'var(--imx-accent)' }} onClick={e => e.stopPropagation()}>
                    Conditions d'utilisation
                  </Link>
                  {' '}et la{' '}
                  <Link to="/web/politique-confidentialite" className="underline" style={{ color: 'var(--imx-accent)' }} onClick={e => e.stopPropagation()}>
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
                  fontFamily: 'Inter, sans-serif',
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
                  fontFamily: 'Inter, sans-serif',
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
      </div>
    </div>
  );
}
