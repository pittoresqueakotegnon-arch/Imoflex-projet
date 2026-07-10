import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Search, KeyRound, Mail } from 'lucide-react';
import { useAuth, SignUpParams } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';

type UserRole = 'locataire' | 'proprietaire';

export default function Register() {
  const navigate = useNavigate();
  const { signUp, resendSignupOtp, user } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<'form' | 'waiting' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resending, setResending] = useState(false);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: '',
  });

  // Détection automatique : dès que la personne clique sur le lien reçu par
  // email (même dans un autre onglet), Supabase crée la session et `user`
  // devient non-nul ici — on bascule alors direct sur l'écran de succès,
  // sans que la personne ait à revenir taper quoi que ce soit.
  useEffect(() => {
    if (step === 'waiting' && user) {
      setStep('success');
    }
  }, [user, step]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!selectedRole) {
      newErrors.role = 'Choisissez votre profil';
    }
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Le nom complet est requis';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Le téléphone est requis';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }
    if (!formData.password) {
      newErrors.password = 'Le mot de passe est requis';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Le mot de passe doit faire au moins 8 caractères';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const params: SignUpParams = {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone: formData.phone,
        role: selectedRole!,
      };

      await signUp(params);
      setStep('waiting');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du compte';
      showToast(message, 'error');
      setErrors({ form: message });
    } finally {
      setLoading(false);
    }
  };

  const handleResendLink = async () => {
    setResending(true);
    try {
      await resendSignupOtp(formData.email);
      showToast('Email de confirmation renvoyé', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du renvoi';
      showToast(message, 'error');
    } finally {
      setResending(false);
    }
  };

  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
        <div className="flex items-center mb-6">
          <button
            onClick={() => setStep('form')}
            className="p-2 -ml-2 hover:bg-[#1E1545] rounded-lg transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
        </div>

        <div className="flex flex-col items-center text-center mt-8">
          <div className="w-16 h-16 rounded-full bg-[#1E1545] flex items-center justify-center mb-6">
            <Mail size={28} className="text-[#A855F7]" />
          </div>

          <h1 className="font-nunito font-900 text-2xl mb-2">Vérifiez votre email</h1>
          <p className="text-[#8B7BB5] mb-1 max-w-sm">
            On vient d'envoyer un lien de confirmation à
          </p>
          <p className="text-[#E8E0FF] font-700 mb-8">{formData.email}</p>

          <p className="text-[#8B7BB5] text-sm max-w-sm mb-8">
            Ouvrez cet email et cliquez sur le lien — vous serez connecté(e) automatiquement,
            pas besoin de revenir ici ni de retaper votre mot de passe.
          </p>

          <div className="flex items-center gap-2 text-[#8B7BB5] text-xs mb-8">
            <div className="w-3 h-3 border-2 border-[#A855F7] border-t-transparent rounded-full animate-spin"></div>
            En attente de confirmation...
          </div>

          <button
            onClick={handleResendLink}
            disabled={resending}
            className="text-[#A855F7] text-sm hover:opacity-80 transition-opacity"
          >
            {resending ? 'Envoi...' : "Je n'ai rien reçu — renvoyer l'email"}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col items-center justify-center p-6">
        <div
          className="w-20 h-20 rounded-full bg-[#22C55E] flex items-center justify-center mb-8"
          style={{ animation: 'scaleIn 0.6s ease-out forwards' }}
        >
          <Check size={40} className="text-white" />
        </div>

        <h1 className="font-nunito font-900 text-3xl mb-3 text-center">Compte créé !</h1>
        <p className="text-[#8B7BB5] text-center mb-12 max-w-sm">
          Vous êtes maintenant connecté(e). Explorez la marketplace !
        </p>

        <button onClick={() => navigate('/')} className="btn-primary w-full">
          Continuer
        </button>

        <style>{`
          @keyframes scaleIn {
            from { transform: scale(0); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-[#1E1545] rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <h1 className="font-nunito font-900 text-3xl mb-2">Créer un compte</h1>
        <p className="text-[#8B7BB5] mb-6">Quel est votre profil ?</p>

        {/* Role selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            type="button"
            onClick={() => setSelectedRole('locataire')}
            className={`card p-5 transition-all cursor-pointer ${
              selectedRole === 'locataire'
                ? 'border-2 border-[#7B3FE4] bg-[#7B3FE4] bg-opacity-10'
                : 'border border-[#261C55] hover:border-[#7B3FE4]'
            }`}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}
            >
              <Search size={20} className="text-white" />
            </div>
            <p className="font-nunito font-700 text-sm mb-1">Locataire</p>
            <p className="text-[#8B7BB5] text-xs">Je cherche un logement</p>
          </button>

          <button
            type="button"
            onClick={() => setSelectedRole('proprietaire')}
            className={`card p-5 transition-all cursor-pointer ${
              selectedRole === 'proprietaire'
                ? 'border-2 border-[#7B3FE4] bg-[#7B3FE4] bg-opacity-10'
                : 'border border-[#261C55] hover:border-[#7B3FE4]'
            }`}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
              style={{ background: 'linear-gradient(135deg, #FBBF24, #F59E0B)' }}
            >
              <KeyRound size={20} className="text-[#0D0720]" />
            </div>
            <p className="font-nunito font-700 text-sm mb-1">Propriétaire</p>
            <p className="text-[#8B7BB5] text-xs">Je mets en location</p>
          </button>
        </div>
        {errors.role && <p className="text-[#EF4444] text-xs mb-4">{errors.role}</p>}

        <p className="text-[#8B7BB5] text-sm mb-4">Vos informations personnelles</p>

        {/* Full Name */}
        <div className="mb-5">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 text-sm mb-2">
            NOM COMPLET
          </label>
          <input
            type="text"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            disabled={loading}
            className={`input-field w-full ${errors.full_name ? 'border-[#EF4444]' : ''}`}
            placeholder="Jean Dupont"
          />
          {errors.full_name && <p className="text-[#EF4444] text-xs mt-1">{errors.full_name}</p>}
        </div>

        {/* Phone */}
        <div className="mb-5">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 text-sm mb-2">
            TÉLÉPHONE
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#8B7BB5] text-sm">
              🇧🇯 +229
            </span>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              disabled={loading}
              className={`input-field w-full pl-20 ${errors.phone ? 'border-[#EF4444]' : ''}`}
              placeholder="90 00 00 00"
            />
          </div>
          {errors.phone && <p className="text-[#EF4444] text-xs mt-1">{errors.phone}</p>}
        </div>

        {/* Email */}
        <div className="mb-5">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 text-sm mb-2">
            EMAIL
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={loading}
            className={`input-field w-full ${errors.email ? 'border-[#EF4444]' : ''}`}
            placeholder="vous@exemple.com"
          />
          {errors.email && <p className="text-[#EF4444] text-xs mt-1">{errors.email}</p>}
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-[#E8E0FF] font-space-grotesk font-500 text-sm mb-2">
            MOT DE PASSE
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={loading}
            className={`input-field w-full ${errors.password ? 'border-[#EF4444]' : ''}`}
            placeholder="••••••••"
          />
          <p className="text-[#8B7BB5] text-xs mt-1">Min. 8 caractères</p>
          {errors.password && <p className="text-[#EF4444] text-xs mt-1">{errors.password}</p>}
        </div>

        {errors.form && (
          <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-3 rounded-lg mb-6 text-sm">
            {errors.form}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Création en cours...
            </span>
          ) : (
            'Créer mon compte'
          )}
        </button>
      </form>
    </div>
  );
}
