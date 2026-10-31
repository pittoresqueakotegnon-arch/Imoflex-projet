import React, { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Mail, Phone, MessageSquare, CheckCircle2, ArrowLeft, Building2, MapPin, LogIn } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useListing } from '../../hooks/useListings';
import { supabase } from '../../lib/supabase';
import { formatMontant, getOptimizedUrl } from '../../lib/utils';

export default function WebContact() {
  const { listing_id } = useParams<{ listing_id?: string }>();
  const location = useLocation();
  const isListingContact = Boolean(listing_id && listing_id !== 'general');
  const { user, profile } = useAuth();

  const { listing, loading: listingLoading } = useListing(isListingContact ? listing_id! : '');

  const [name, setName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [message, setMessage] = useState(
    isListingContact
      ? 'Bonjour, je suis très intéressé(e) par ce bien. Serait-il possible d\'organiser une visite prochainement ?'
      : ''
  );
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      if (profile.full_name && !name) setName(profile.full_name);
      if (profile.phone && !phone) setPhone(profile.phone);
      if (profile.email && !email) setEmail(profile.email);
    }
  }, [profile, name, phone, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !phone.trim()) return;

    setLoading(true);
    setError(null);

    try {
      if (isListingContact && listing_id) {
        if (!user?.id) {
          setError('Veuillez vous connecter pour envoyer votre demande au propriétaire.');
          setLoading(false);
          return;
        }
        // Enregistrement d'une demande de contact locataire pour cette annonce
        const { error: insertError } = await supabase.from('contact_requests').insert([
          {
            listing_id,
            requester_id: user.id,
            message: message.trim(),
            contact_phone: phone.trim(),
            status: 'nouvelle',
          },
        ]);
        if (insertError) throw insertError;
      } else {
        // Message de contact général / support
        const { error: supportError } = await supabase.from('support_tickets').insert([
          {
            user_id: user?.id || null,
            user_email: email.trim(),
            subject: 'Contact Web ImoFlex',
            message: `Nom: ${name}\nTéléphone: ${phone}\n\n${message.trim()}`,
            category: 'general',
            status: 'ouvert',
          },
        ]);
        if (supportError) {
          // Si la table support_tickets n'a pas cette signature exacte, fallback silencieux
          console.warn('Notice contact général:', supportError);
        }
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'envoi du message.');
    } finally {
      setLoading(false);
    }
  };

  const cover = listing?.listing_photos?.find((p) => p.is_cover) || listing?.listing_photos?.[0];
  const coverUrl = cover ? getOptimizedUrl(cover.photo_url, 'medium') : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <Link
        to={isListingContact && listing_id ? `/web/annonce/${listing_id}` : '/web'}
        className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors"
        style={{ color: 'var(--imx-text-muted)' }}
      >
        <ArrowLeft size={14} />
        {isListingContact ? "Retour à l'annonce" : "Retour à l'accueil"}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form */}
        <div className="lg:col-span-7">
          <div
            className="rounded-2xl p-6 sm:p-8 border shadow-sm"
            style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
          >
            {submitted ? (
              <div className="text-center py-8">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: '#ECFDF5', color: '#10B981' }}
                >
                  <CheckCircle2 size={32} />
                </div>

                <h2
                  className="text-2xl font-black mb-2"
                  style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
                >
                  Message envoyé !
                </h2>

                <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                  {isListingContact
                    ? "Votre demande a bien été transmise au propriétaire. Il prendra contact avec vous dans les plus brefs délais."
                    : "Votre message a bien été reçu par notre équipe. Nous vous répondrons rapidement."}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {user && (
                    <Link
                      to="/web/mes-demandes"
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: 'var(--imx-accent)' }}
                    >
                      Voir mes demandes
                    </Link>
                  )}
                  <Link
                    to="/web/annonces"
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-gray-50"
                    style={{ borderColor: 'var(--imx-border)', color: 'var(--imx-text-primary)' }}
                  >
                    Explorer d'autres biens
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <h1
                  className="text-2xl font-black mb-2"
                  style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
                >
                  {isListingContact ? 'Contacter le propriétaire' : 'Contactez ImoFlex'}
                </h1>
                <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--imx-text-secondary)' }}>
                  {isListingContact
                    ? 'Envoyez un message direct pour convenir d\'une visite ou poser vos questions sur ce logement.'
                    : 'Une question, un partenariat ou besoin d\'assistance ? Remplissez le formulaire ci-dessous.'}
                </p>

                {error && (
                  <div className="p-3 rounded-xl mb-4 text-sm bg-red-50 text-red-600 border border-red-200">
                    {error}
                  </div>
                )}

                {isListingContact && !user && (
                  <div className="p-4 rounded-xl mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-purple-50 border border-purple-100 text-xs">
                    <div>
                      <p className="font-bold text-sm text-[var(--imx-accent)] mb-0.5">Connexion recommandée</p>
                      <p className="text-gray-600">Pour transmettre cette demande au propriétaire et suivre son statut, connectez-vous.</p>
                    </div>
                    <Link
                      to={`/web/login?from=${encodeURIComponent(location.pathname)}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs text-white self-start sm:self-auto shadow-2xs hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--imx-accent)' }}
                    >
                      <LogIn size={13} />
                      <span>Se connecter</span>
                    </Link>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                      Nom complet
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Jean Houndékon"
                      required
                      className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                      style={{ background: 'var(--imx-surface-2)', borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                        Téléphone (WhatsApp)
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+229 01 02 03 04"
                        required
                        className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                        style={{ background: 'var(--imx-surface-2)', borderColor: 'var(--imx-border)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                        E-mail
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="jean@exemple.com"
                        className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
                        style={{ background: 'var(--imx-surface-2)', borderColor: 'var(--imx-border)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--imx-text-primary)' }}>
                      Votre message
                    </label>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      placeholder="Précisez vos disponibilités pour une visite ou vos questions..."
                      className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors resize-none"
                      style={{ background: 'var(--imx-surface-2)', borderColor: 'var(--imx-border)' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !phone.trim() || !message.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all shadow-md hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'var(--imx-accent)' }}
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <MessageSquare size={16} />
                        Envoyer ma demande
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Right Column: Listing Recap or ImoFlex Contact Details */}
        <div className="lg:col-span-5 space-y-4">
          {isListingContact && listing ? (
            <div
              className="rounded-2xl p-5 border shadow-sm"
              style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Logement concerné
              </h3>

              <div className="rounded-xl overflow-hidden aspect-video bg-gray-100 mb-3">
                {coverUrl ? (
                  <img src={coverUrl} alt={listing.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <Building2 size={36} />
                  </div>
                )}
              </div>

              <h4 className="font-bold text-base text-[#17132B] line-clamp-1 mb-1">
                {listing.title}
              </h4>

              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                <MapPin size={13} className="text-[#7B3FE4]" />
                <span>{listing.neighborhood ? `${listing.neighborhood}, ` : ''}{listing.city}</span>
              </div>

              <div className="pt-3 border-t flex items-baseline justify-between" style={{ borderColor: 'var(--imx-border)' }}>
                <span className="text-xs text-gray-500 font-medium">Loyer mensuel</span>
                <span className="text-lg font-black" style={{ color: 'var(--imx-accent)', fontFamily: 'Sora' }}>
                  {formatMontant(listing.monthly_rent)}
                </span>
              </div>
            </div>
          ) : isListingContact && listingLoading ? (
            <div className="rounded-2xl p-6 border bg-white animate-pulse h-48" style={{ borderColor: 'var(--imx-border)' }} />
          ) : (
            <div
              className="rounded-2xl p-6 border shadow-sm space-y-4"
              style={{ background: 'var(--imx-surface)', borderColor: 'var(--imx-border)' }}
            >
              <h3 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
                Support ImoFlex
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Notre équipe est disponible pour vous accompagner dans votre recherche de logement, la gestion de vos biens ou le paiement de loyers par Mobile Money.
              </p>

              <div className="pt-2 space-y-3 text-xs">
                <div className="flex items-center gap-3 text-gray-700">
                  <div className="w-8 h-8 rounded-lg bg-[#F1EBFF] text-[#7B3FE4] flex items-center justify-center">
                    <Phone size={15} />
                  </div>
                  <div>
                    <p className="font-semibold">Téléphone / WhatsApp</p>
                    <p className="text-gray-500">+229 01 99 00 00</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-gray-700">
                  <div className="w-8 h-8 rounded-lg bg-[#F1EBFF] text-[#7B3FE4] flex items-center justify-center">
                    <Mail size={15} />
                  </div>
                  <div>
                    <p className="font-semibold">Courriel</p>
                    <p className="text-gray-500">contact@imoflex.bj</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
