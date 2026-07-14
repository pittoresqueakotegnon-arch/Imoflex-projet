import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Property } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { formatMontant, getCurrentMonth, getDeadlineDate, calculateProrataAmount } from '../../lib/utils';

type Step = 'input' | 'confirmation' | 'complete';

export default function Rejoindre() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('input');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [property, setProperty] = useState<Property | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value.toUpperCase());
  };

  const handleInputSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!code.trim()) {
        throw new Error('Veuillez entrer un code');
      }

      // Check if property exists with this code
      const { data: propData, error: propError } = await supabase
        .from('properties')
        .select('id, name, address, monthly_rent, payment_deadline_day, listing_id')
        .eq('access_code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (propError) throw propError;
      if (!propData) {
        throw new Error('Code invalide ou inexistant');
      }

      // Check if property already has active lease
      const { data: existingLease, error: leaseCheckError } = await supabase
        .from('leases')
        .select('id')
        .eq('property_id', propData.id)
        .eq('status', 'actif')
        .maybeSingle();

      if (leaseCheckError && leaseCheckError.code !== 'PGRST116') throw leaseCheckError;
      if (existingLease) {
        throw new Error('Ce logement est déjà occupé');
      }



      setProperty(propData);
      setStep('confirmation');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la vérification du code';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmation = async () => {
    if (!property || !profile?.id) return;

    setError('');
    setLoading(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const { month, year } = getCurrentMonth();

      // Create lease
      const { data: leaseData, error: leaseInsertError } = await supabase
        .from('leases')
        .insert({
          tenant_id: profile.id,
          property_id: property.id,
          start_date: today,
          status: 'actif',
        })
        .select('id')
        .single();

      if (leaseInsertError) throw leaseInsertError;

      // Create rent period
      const deadlineDate = getDeadlineDate(property.payment_deadline_day);
      const prorataAmount = calculateProrataAmount(property.monthly_rent, today, property.payment_deadline_day);

      const { error: periodInsertError } = await supabase
        .from('rent_periods')
        .insert({
          lease_id: leaseData.id,
          period_month: month,
          period_year: year,
          amount_due: prorataAmount,
          amount_paid: 0,
          deadline_date: deadlineDate,
          status: 'en_cours',
        });

      if (periodInsertError) throw periodInsertError;

      // Update listing availability
      if (property.listing_id) {
        const { error: updateError } = await supabase
          .from('listings')
          .update({ availability_status: 'occupe' })
          .eq('id', property.listing_id);
          
        if (updateError) {
          console.error('Error updating listing status:', updateError);
        }
      }

      setStep('complete');
      showToast('Bienvenue dans votre logement !', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création du bail';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#120D2A] text-[#E8E0FF] flex flex-col px-5 pt-12 pb-8">
      {/* Header / Back */}
      <div className="flex items-center gap-4 mb-12 w-full">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition"
          style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B7BB5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <h1 className="text-white font-nunito font-black text-xl">Rejoindre un logement</h1>
      </div>

      {step === 'input' && (
        <div className="flex flex-col flex-1">
          <div className="text-center mb-10 flex flex-col items-center">
            {/* Key Icon */}
            <span className="text-5xl mb-5">🔑</span>
            <p className="text-[#8B7BB5] text-[13px] max-w-[280px] leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
              Le code vous a été communiqué par le propriétaire après votre accord de location.
            </p>
          </div>

          <form onSubmit={handleInputSubmit} className="flex-1 flex flex-col justify-between pb-4">
            <div>
              <label className="text-[10px] font-space-grotesk font-semibold text-[#8B7BB5] uppercase tracking-wider block mb-2 px-1">
                CODE D'ACCÈS
              </label>
              <input
                type="text"
                value={code}
                onChange={handleInputChange}
                disabled={loading}
                placeholder="IMO-4728"
                maxLength={8}
                className="w-full h-16 rounded-2xl text-center text-[22px] font-nunito font-black tracking-widest uppercase mb-4 focus:outline-none"
                style={{ 
                  background: '#261C55', 
                  border: '1px solid rgba(168,85,247,0.3)',
                  color: '#C084FC'
                }}
              />

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4" style={{ fontFamily: 'Space Grotesk' }}>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 5}
              className="w-full text-white font-bold rounded-2xl py-[18px]"
              style={{ background: '#A855F7', fontFamily: 'Nunito', fontSize: '15px' }}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Vérification...</span>
                </div>
              ) : (
                'Rejoindre'
              )}
            </button>
          </form>
        </div>
      )}

      {step === 'confirmation' && property && (
        <>
          <h1 className="font-nunito font-900 text-2xl mb-1.5 text-white">Confirmer le logement</h1>
          <p className="text-[#8B7BB5] text-xs mb-6" style={{ fontFamily: 'Space Grotesk' }}>Vérifiez les informations avant de confirmer</p>

          <div className="flex-1">
            {/* Confirmation Card */}
            <div className="card p-5 space-y-4 mb-6">
              <div>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-0.5">Nom du logement</p>
                <p className="font-nunito font-700 text-[#E8E0FF] text-base">{property.name}</p>
              </div>

              <div>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-0.5">Adresse</p>
                <p className="font-nunito font-700 text-[#E8E0FF] text-base">{property.address}</p>
              </div>

              <div>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-0.5">Loyer mensuel</p>
                <p className="font-nunito font-900 text-2xl amount text-[#A855F7]">{property.monthly_rent.toLocaleString('fr-FR')} <span className="text-sm font-normal text-[#8B7BB5]">FCFA</span></p>
              </div>

              <div>
                <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-0.5">Échéance de paiement</p>
                <p className="font-nunito font-700 text-[#E8E0FF] text-base">Le {property.payment_deadline_day} de chaque mois</p>
              </div>
              
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const prorata = calculateProrataAmount(property.monthly_rent, todayStr, property.payment_deadline_day);
                if (prorata < property.monthly_rent) {
                  return (
                    <div className="bg-[#A855F7]/10 border border-[#A855F7]/30 rounded-xl p-3 mt-4">
                      <p className="text-[#8B7BB5] text-[10px] font-space-grotesk font-semibold uppercase tracking-wider mb-1">Premier mois (Prorata)</p>
                      <p className="font-nunito font-700 text-[#E8E0FF] text-sm">
                        Vous ne payez que <span className="text-[#A855F7] font-black">{prorata.toLocaleString('fr-FR')} FCFA</span> pour ce premier mois, calculé au prorata de votre date d'arrivée.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4" style={{ fontFamily: 'Space Grotesk' }}>
                {error}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handleConfirmation}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Création...
                </>
              ) : (
                'Confirmer et rejoindre'
              )}
            </button>
            <button
              onClick={() => {
                setStep('input');
                setCode('');
                setProperty(null);
              }}
              className="btn-ghost w-full"
            >
              Annuler
            </button>
          </div>
        </>
      )}

      {step === 'complete' && (
        <div className="flex flex-col items-center justify-center flex-1 py-8">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
            style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.05))', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            <span className="text-4xl">🏠</span>
          </div>
          <h1 className="font-nunito font-900 text-2xl text-center mb-3">
            Logement ajouté !<br />
            <span style={{ color: '#A855F7' }}>Avec succès.</span>
          </h1>
          <p className="text-[#8B7BB5] text-sm text-center mb-3 max-w-[260px] leading-relaxed font-space-grotesk">
            <strong className="text-[#E8E0FF]">{property?.name}</strong> fait maintenant partie de vos logements.
            Retrouvez-le dans votre espace et gérez vos paiements en toute simplicité.
          </p>

          <div
            className="w-full rounded-2xl p-4 mb-10"
            style={{ background: 'rgba(168, 85, 247, 0.07)', border: '1px solid rgba(168, 85, 247, 0.15)' }}
          >
            <p className="text-[10px] font-space-grotesk font-bold uppercase tracking-wider text-[#8B7BB5] mb-1">Adresse</p>
            <p className="font-nunito font-700 text-[#E8E0FF] text-sm">{property?.address}</p>
          </div>

          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary w-full"
          >
            Voir mes logements
          </button>
        </div>
      )}
    </div>
  );
}
