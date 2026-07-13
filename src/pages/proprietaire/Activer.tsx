import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, Listing } from '../../lib/supabase';
import { generateUniqueAccessCode } from '../../lib/utils';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../hooks/useAuth';

const Activer: React.FC = () => {
  const navigate = useNavigate();
  const { listing_id } = useParams<{ listing_id: string }>();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState('5');
  const [copied, setCopied] = useState(false);

  const ownerId = profile?.id;

  useEffect(() => {
    if (!listing_id || !ownerId) return;

    const fetchListing = async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select('id, title, address, monthly_rent')
          .eq('id', listing_id)
          .eq('owner_id', ownerId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          showToast('Annonce non trouvée', 'error');
          navigate('/pro/annonces');
          return;
        }

        setListing(data as Listing);
      } catch (error) {
        console.error('Error fetching listing:', error);
        showToast('Erreur lors du chargement', 'error');
        navigate('/pro/annonces');
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [listing_id, ownerId, showToast, navigate]);

  const handleGenerateCode = async () => {
    if (!listing || !ownerId || !selectedDay) return;

    setGenerating(true);
    try {
      const code = await generateUniqueAccessCode();

      // Create property
      const { error: propertyError } = await supabase
        .from('properties')
        .insert({
          listing_id,
          owner_id: ownerId,
          name: listing.title,
          address: listing.address,
          monthly_rent: listing.monthly_rent,
          payment_deadline_day: parseInt(selectedDay),
          access_code: code,
          is_active: true,
        });

      if (propertyError) throw propertyError;

      // Update listing availability
      const { error: updateError } = await supabase
        .from('listings')
        .update({ availability_status: 'occupe' })
        .eq('id', listing_id);

      if (updateError) throw updateError;

      setGeneratedCode(code);
      showToast('Code généré avec succès !', 'success');
    } catch (error) {
      console.error('Error generating code:', error);
      const message = error instanceof Error ? error.message : 'Erreur lors de la génération du code';
      showToast(message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Code copié !', 'success');
    }
  };

  const handleWhatsApp = () => {
    if (generatedCode) {
      const message = `Voici votre code d'accès ImoFlex pour le logement « ${listing?.title} » : ${generatedCode}`;
      const encoded = encodeURIComponent(message);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6">
          <div className="h-40 bg-[#1A1240] rounded-3xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6">
          <p className="text-red-400">Annonce non trouvée</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col px-5 pt-12 pb-8">
      {/* Header */}
      <button
        onClick={() => navigate('/pro/annonces')}
        className="flex items-center gap-1.5 text-[#A855F7] text-sm mb-8 w-fit"
        style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Logement occupé
      </button>

      {generatedCode ? (
        <div className="space-y-6 flex-1 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Listing Card */}
            <div className="card p-4">
              <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">ANNONCE</p>
              <h3 className="font-nunito font-700 text-white text-base">{listing.title}</h3>
              <p className="text-xs text-[#8B7BB5] mt-1" style={{ fontFamily: 'Space Grotesk' }}>{listing.city}</p>
            </div>

            {/* Generated Code Display */}
            <div>
              <p className="label block mb-2 text-center">CODE GÉNÉRÉ</p>
              <div className="code-display">
                <p className="code-text glow-violet">{generatedCode}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              onClick={handleCopyCode}
              className="btn-ghost flex items-center justify-center gap-2 text-sm"
              style={{ height: '48px' }}
            >
              <span>📋</span> {copied ? 'Copié !' : 'Copier'}
            </button>

            <button
              onClick={handleWhatsApp}
              className="btn-primary flex items-center justify-center gap-2 text-sm"
              style={{ background: '#22C55E', boxShadow: '0 4px 16px rgba(34,197,94,0.3)', height: '48px' }}
            >
              <span>💬</span> WhatsApp
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 flex-1 flex flex-col justify-between">
          <div className="space-y-5">
            {/* Listing Card */}
            <div className="card p-4">
              <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">ANNONCE</p>
              <h3 className="font-nunito font-700 text-white text-base">{listing.title}</h3>
              <p className="text-xs text-[#8B7BB5] mt-1" style={{ fontFamily: 'Space Grotesk' }}>{listing.city}</p>
            </div>

            {/* Payment Deadline Day */}
            <div>
              <label className="label block mb-2">DATE LIMITE DE PAIEMENT (JOUR DU MOIS)</label>
              <select
                value={selectedDay}
                onChange={e => setSelectedDay(e.target.value)}
                className="input-field"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                  <option key={day} value={day}>
                    Le {day} de chaque mois
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#8B7BB5] mt-2 italic" style={{ fontFamily: 'Space Grotesk' }}>
                💡 Conseil : Le 5 de chaque mois
              </p>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerateCode}
            disabled={generating}
            className="btn-primary w-full"
          >
            {generating ? 'Génération...' : "Générer le code d'accès"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Activer;
