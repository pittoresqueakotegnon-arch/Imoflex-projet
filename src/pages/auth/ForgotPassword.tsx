import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (resetError) throw new Error(resetError.message);

      setSent(true);
      showToast('Email envoyé avec succès !', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'envoi du lien';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center mb-12">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-[#1E1545] rounded-lg transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      </div>

      {/* Content */}
      {!sent ? (
        <>
          <h1 className="font-nunito font-900 text-3xl mb-2">Réinitialiser le mot de passe</h1>
          <p className="text-[#8B7BB5] mb-12">
            Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
          </p>

          <form onSubmit={handleSubmit} className="flex-1">
            {/* Email Input */}
            <div className="mb-8">
              <label className="block text-[#E8E0FF] font-space-grotesk font-500 mb-3">
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="input-field w-full"
                placeholder="vous@exemple.com"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-[#EF4444] bg-opacity-10 border border-[#EF4444] text-[#EF4444] p-3 rounded-lg mb-6 text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Envoi en cours...
                </span>
              ) : (
                'Envoyer le lien'
              )}
            </button>
          </form>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1">
          <div className="w-20 h-20 rounded-full bg-[#7B3FE4] bg-opacity-20 flex items-center justify-center mb-8">
            <Mail size={40} className="text-[#A855F7]" />
          </div>

          <h2 className="font-nunito font-900 text-2xl mb-3 text-center">Email envoyé !</h2>
          <p className="text-[#8B7BB5] text-center mb-12 max-w-sm">
            Vérifiez votre boîte mail. Nous vous avons envoyé un lien pour réinitialiser votre mot de passe.
          </p>

          <button
            onClick={() => navigate('/login')}
            className="btn-primary w-full"
          >
            Retour à la connexion
          </button>

          <button
            onClick={() => setSent(false)}
            className="btn-ghost w-full mt-3"
          >
            Renvoyer l'email
          </button>
        </div>
      )}
    </div>
  );
}
