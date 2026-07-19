import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Calendar, MapPin, CreditCard } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { getCurrentMonth, getMonthName } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';

interface LeaseDetails {
  id: string;
  start_date: string;
  end_date: string | null;
  status: string;
  property: {
    name: string;
    address: string;
    monthly_rent: number;
    payment_deadline_day: number;
  };
  tenant: {
    full_name: string;
    phone: string;
    avatar_url?: string;
  };
  rent_periods: Array<{
    id: string;
    period_month: number;
    period_year: number;
    amount_due: number;
    amount_paid: number;
    status: string;
    payments: Array<{
      id: string;
      amount: number;
      created_at: string;
      status: string;
    }>;
  }>;
}

const ProgressBar: React.FC<{ current: number; total: number; isSolde: boolean }> = ({ current, total, isSolde }) => {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div className="h-[6px] rounded-full w-full mt-3 mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: isSolde
            ? 'linear-gradient(90deg, #16A34A, #22C55E)'
            : 'linear-gradient(90deg, #7B3FE4, #C084FC)',
        }}
      />
    </div>
  );
};

const FicheBail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [lease, setLease] = useState<LeaseDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchLease = async () => {
      try {
        // Step 1: Fetch the lease with property and rent periods
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select(`
            id,
            tenant_id,
            start_date,
            end_date,
            status,
            property:properties(name, address, monthly_rent, payment_deadline_day),
            rent_periods(
              id,
              period_month,
              period_year,
              amount_due,
              amount_paid,
              status,
              payments(
                id,
                amount,
                created_at,
                status
              )
            )
          `)
          .eq('id', id)
          .single();

        if (leaseError) throw leaseError;

        // Step 2: Fetch tenant info separately (avoids FK hint issues + RLS workaround)
        const tenantId = (leaseData as any).tenant_id;
        const { data: tenantData, error: tenantError } = await supabase
          .from('users')
          .select('full_name, phone, avatar_url')
          .eq('id', tenantId)
          .single();

        if (tenantError) {
          console.warn('Impossible de charger les infos du locataire (RLS?):', tenantError);
        }

        // Normalize property (Supabase can return array or object for FK relations)
        let propertyData = (leaseData as any).property;
        if (Array.isArray(propertyData)) propertyData = propertyData[0];

        setLease({
          id: leaseData.id,
          start_date: leaseData.start_date,
          end_date: leaseData.end_date,
          status: leaseData.status,
          property: propertyData ?? { name: '—', address: '—', monthly_rent: 0, payment_deadline_day: 1 },
          tenant: tenantData ?? { full_name: 'Locataire', phone: '' },
          rent_periods: (leaseData as any).rent_periods ?? [],
        });
      } catch (err: any) {
        console.error('Erreur FicheBail:', err);
        showToast('Impossible de charger les informations du bail.', 'error');
        navigate('/pro/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchLease();
  }, [id, navigate, showToast]);

  if (loading) {
    return (
      <div className="page-container flex flex-col min-h-screen">
        <div className="px-4 py-6">
          <div className="h-6 w-8 bg-[#1A1240] rounded animate-pulse mb-6"></div>
          <div className="h-40 bg-[#1A1240] rounded-2xl animate-pulse mb-4"></div>
          <div className="h-32 bg-[#1A1240] rounded-2xl animate-pulse"></div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (!lease) {
    return null;
  }

  const { month, year } = getCurrentMonth();
  
  // Find current rent period
  const currentPeriod = lease.rent_periods.find(
    (rp) => rp.period_month === month && rp.period_year === year
  );
  
  const isRetard = currentPeriod?.status === 'retard';
  const isSolde = currentPeriod?.status === 'solde' || (currentPeriod && currentPeriod.amount_paid >= currentPeriod.amount_due && currentPeriod.amount_due > 0);

  // Flatten and sort payments from newest to oldest
  const allPayments = lease.rent_periods
    .flatMap((rp) => rp.payments ?? [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const tenantInitial = lease.tenant?.full_name
    ? lease.tenant.full_name.charAt(0).toUpperCase()
    : '?';

  return (
    <div className="page-container flex flex-col min-h-screen pb-24">
      {/* ── HEADER ── */}
      <div className="px-4 pt-6 pb-4 flex items-center justify-between sticky top-0 z-40" style={{ background: '#0B0819' }}>
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h1 className="text-lg font-nunito font-black text-white">Détails du bail</h1>
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>

      <div className="px-4 space-y-5">
        {/* INDICATEUR DE RETARD */}
        {isRetard && (
          <div className="rounded-[16px] px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="font-nunito font-black text-red-500 text-[14px]">Loyer en retard</p>
              <p className="text-[11px] text-red-400" style={{ fontFamily: 'Space Grotesk' }}>
                Le paiement pour la période en cours n'a pas été reçu.
              </p>
            </div>
          </div>
        )}

        {/* SECTION 1: LOCATAIRE */}
        <div className="rounded-[20px] p-5" style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}>
              {lease.tenant?.avatar_url ? (
                <img src={lease.tenant.avatar_url} alt={lease.tenant.full_name} className="w-full h-full object-cover" />
              ) : (
                tenantInitial
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-nunito font-black text-white text-[18px] truncate">
                {lease.tenant?.full_name || 'Locataire'}
              </h2>
              <p className="text-[13px] mt-0.5" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                {lease.tenant?.phone || 'Numéro non renseigné'}
              </p>
            </div>
          </div>

          <a
            href={lease.tenant?.phone ? `tel:${lease.tenant.phone}` : '#'}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[14px] transition-opacity hover:opacity-90"
            style={{ 
              background: lease.tenant?.phone ? 'linear-gradient(135deg, #7B3FE4, #A855F7)' : 'rgba(255,255,255,0.05)', 
              color: '#FFFFFF', 
              border: lease.tenant?.phone ? 'none' : '1px solid rgba(255,255,255,0.1)' 
            }}
          >
            <Phone size={16} />
            {lease.tenant?.phone ? 'Appeler le locataire' : 'Numéro non disponible'}
          </a>
        </div>

        {/* SECTION 2: INFORMATIONS DU BAIL */}
        <div>
          <h3 className="font-nunito font-black text-white text-[15px] mb-3 ml-1">Informations du Bail</h3>
          <div className="rounded-[20px] p-5 space-y-4" style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}>
            
            {/* Loyer mensuel */}
            <div className="flex justify-between items-end pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                  Loyer Mensuel Attendu
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="font-nunito font-black text-white text-[24px]">
                    {new Intl.NumberFormat('fr-FR').format(lease.property?.monthly_rent ?? 0)}
                  </span>
                  <span className="text-[12px] text-white">FCFA</span>
                </div>
              </div>
              <span className="text-[10px] font-bold rounded-md px-2.5 py-1 uppercase" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80', fontFamily: 'Space Grotesk', letterSpacing: '0.04em' }}>
                ACTIF
              </span>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(123, 63, 228, 0.1)' }}>
                <MapPin size={16} color="#A855F7" />
              </div>
              <div className="min-w-0">
                <p className="font-nunito font-bold text-white text-[14px] truncate">{lease.property?.name || '—'}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                  {lease.property?.address || '—'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(123, 63, 228, 0.1)' }}>
                <Calendar size={16} color="#A855F7" />
              </div>
              <div className="min-w-0 flex-1 flex justify-between items-center">
                <div>
                  <p className="font-nunito font-bold text-white text-[14px]">Début du bail</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                    {lease.start_date ? new Date(lease.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-nunito font-bold text-white text-[14px]">Limite</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                    Le {lease.property?.payment_deadline_day ?? '—'} du mois
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: HISTORIQUE DES VERSEMENTS */}
        <div>
          <h3 className="font-nunito font-black text-white text-[15px] mb-3 ml-1">Historique des paiements</h3>
          
          <div className="rounded-[20px] p-5" style={{ background: '#1A1240', border: '1px solid rgba(255,255,255,0.07)' }}>
            
            {/* Barre de progression du mois en cours */}
            {currentPeriod && (
              <div className="mb-6 pb-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[12px] font-bold text-white uppercase tracking-wide" style={{ fontFamily: 'Space Grotesk' }}>
                    Mois en cours ({getMonthName(month, year)})
                  </p>
                  <span
                    className="text-[9px] font-bold rounded-md px-2 py-0.5 uppercase"
                    style={{
                      fontFamily: 'Space Grotesk',
                      background: isSolde ? 'rgba(34,197,94,0.15)' : isRetard ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                      color: isSolde ? '#4ADE80' : isRetard ? '#F87171' : '#FBBF24',
                    }}
                  >
                    {isSolde ? 'SOLDÉ' : isRetard ? 'RETARD' : 'EN COURS'}
                  </span>
                </div>
                
                <ProgressBar
                  current={currentPeriod.amount_paid}
                  total={currentPeriod.amount_due}
                  isSolde={isSolde || false}
                />
                
                <div className="flex justify-between text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                  <span style={{ color: isSolde ? '#4ADE80' : isRetard ? '#F87171' : '#A855F7' }}>
                    {new Intl.NumberFormat('fr-FR').format(currentPeriod.amount_paid)} F reçus
                  </span>
                  <span style={{ color: '#4A3D7A' }}>
                    / {new Intl.NumberFormat('fr-FR').format(currentPeriod.amount_due)}
                  </span>
                </div>
              </div>
            )}

            {/* Liste des paiements */}
            {allPayments.length > 0 ? (
              <div className="space-y-4">
                {allPayments.map(payment => {
                  const isValide = payment.status === 'valide';
                  const isEchoue = payment.status === 'echoue';
                  return (
                    <div key={payment.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isValide ? 'rgba(34,197,94,0.1)' : isEchoue ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}>
                          <CreditCard size={16} color={isValide ? '#4ADE80' : isEchoue ? '#F87171' : '#FBBF24'} />
                        </div>
                        <div>
                          <p className="font-nunito font-bold text-white text-[14px]">Paiement Mobile Money</p>
                          <p className="text-[11px] mt-0.5" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                            {new Date(payment.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-nunito font-black text-white text-[15px]">
                          {new Intl.NumberFormat('fr-FR').format(payment.amount)} F
                        </p>
                        <p
                          className="text-[10px] font-bold mt-0.5"
                          style={{
                            fontFamily: 'Space Grotesk',
                            color: isValide ? '#4ADE80' : isEchoue ? '#F87171' : '#FBBF24'
                          }}
                        >
                          {isValide ? 'Validé' : isEchoue ? 'Échoué' : 'En attente'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <CreditCard size={20} color="#8B7BB5" />
                </div>
                <p className="text-[13px] font-bold text-white">Aucun paiement effectué</p>
                <p className="text-[11px] mt-1" style={{ color: '#8B7BB5', fontFamily: 'Space Grotesk' }}>
                  L'historique des versements apparaîtra ici.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <BottomNav />
    </div>
  );
};

export default FicheBail;
