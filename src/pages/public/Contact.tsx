import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useListing } from '../../hooks/useListings';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { formatMontant } from '../../lib/utils';
import { Building2 } from 'lucide-react';

const Contact: React.FC = () => {
  const { listing_id } = useParams<{ listing_id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const { listing, loading: listingLoading } = useListing(listing_id!);

  const [message, setMessage] = useState(
    'Bonjour, je suis intéressé(e) par ce logement. Serait-il possible de le visiter cette semaine ?'
  );
  const [phone, setPhone] = useState(profile?.phone || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  if (!user) return null;

  const isFormValid = message.trim().length >= 3 && phone.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid || !user || !listing_id) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('contact_requests').insert([{
        listing_id,
        requester_id: user.id,
        message: message.trim(),
        contact_phone: phone.trim(),
        status: 'nouvelle',
      }]);
      if (error) throw error;
      setSubmitted(true);
      showToast('Demande envoyée avec succès!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de l\'envoi', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const coverPhoto = listing?.listing_photos?.find(p => p.is_cover) || listing?.listing_photos?.[0];

  /* ── Succès ─────────────────────────────────────────── */
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: '#120D2A' }}>
        {/* Icône succès */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-8"
          style={{
            background: 'linear-gradient(135deg, #22C55E, #16A34A)',
            boxShadow: '0 8px 32px rgba(34, 197, 94, 0.4)',
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 className="font-nunito font-900 text-2xl text-[#E8E0FF] text-center mb-3">
          Demande envoyée !
        </h1>
        <p className="text-[#8B7BB5] text-sm text-center mb-10 max-w-[280px] leading-relaxed">
          Le propriétaire de «&nbsp;{listing?.title}&nbsp;» a reçu votre demande et vous contactera bientôt.
        </p>

        <div className="w-full space-y-3">
          <button onClick={() => navigate('/mes-demandes')} className="btn-primary w-full">
            Voir mes demandes
          </button>
          <button onClick={() => navigate('/')} className="btn-ghost w-full">
            Continuer à explorer
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading ────────────────────────────────────────── */
  if (listingLoading) {
    return (
      <div className="page-container">
        <header className="sticky-header px-4 py-3.5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-[#E8E0FF] p-1 -ml-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 className="font-nunito font-800 text-lg text-[#E8E0FF]">Contacter le propriétaire</h1>
        </header>
        <div className="px-4 py-6 space-y-4">
          <div className="h-20 bg-[#1A1240] rounded-2xl animate-pulse" />
          <div className="h-32 bg-[#1A1240] rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  /* ── Form ───────────────────────────────────────────── */
  return (
    <div className="page-container pb-24">
      {/* Header */}
      <header className="sticky-header px-4 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#E8E0FF] p-1 -ml-1">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="font-nunito font-800 text-lg text-[#E8E0FF]">Contacter le propriétaire</h1>
      </header>

      <div className="px-4 py-5 space-y-5 flex-1">
        {/* Card annonce */}
        {listing && (
          <div className="card p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden bg-[#261C55]">
              {coverPhoto?.photo_url ? (
                <img src={coverPhoto.photo_url} alt={listing.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#4A3D7A]">
                  <Building2 size={24} />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-nunito font-700 text-[#E8E0FF] text-sm line-clamp-1">{listing.title}</h3>
              <p className="font-nunito font-900 text-[#A855F7] text-xs mt-0.5">{formatMontant(listing.monthly_rent)} F/mois</p>
            </div>
          </div>
        )}

        {/* Message */}
        <div>
          <label className="label block mb-2">VOTRE MESSAGE</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Écrivez votre message..."
            className="input-field resize-none"
          />
        </div>

        {/* Téléphone */}
        <div>
          <label className="label block mb-2">VOTRE NUMÉRO DE CONTACT</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+229 01 00 00 00"
            className="input-field"
          />
        </div>
      </div>

      {/* Bouton bas fixe */}
      <div
        className="fixed bottom-0 p-4"
        style={{
          left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '390px',
          background: 'rgba(18,13,42,0.97)',
          borderTop: '1px solid rgba(123,63,228,0.15)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          className="btn-primary w-full"
        >
          {isSubmitting && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Envoyer la demande
        </button>
      </div>
    </div>
  );
};

export default Contact;
