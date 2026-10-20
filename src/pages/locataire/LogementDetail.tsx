import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, AlertCircle, Clock, CreditCard, CheckCircle2, MapPin, SearchX, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { supabase, Payment, LeaseContract, PropertyInspection } from '../../lib/supabase';
import { formatMontant, daysUntilDeadline, getMonthName, operatorLabel } from '../../lib/utils';
import { haptics } from '../../lib/haptics';
import { ContractCard } from '../../components/ContractCard';
import { InspectionCard } from '../../components/InspectionCard';
import { CompareInspectionsModal } from '../../components/CompareInspectionsModal';
import { fetchLeaseContract, fetchInspections } from '../../lib/leaseDocumentsService';

interface RentPeriodLite {
  id: string;
  amount_due: number;
  amount_paid: number;
  deadline_date: string;
}

export default function LogementDetail() {
  const navigate = useNavigate();
  const { leaseId } = useParams<{ leaseId: string }>();
  const { profile } = useAuth();

  const [propertyName, setPropertyName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [monthlyRent, setMonthlyRent] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [ownerName, setOwnerName] = useState('Bailleur');
  const [ownerPhone, setOwnerPhone] = useState<string | undefined>(undefined);
  const [currentPeriod, setCurrentPeriod] = useState<RentPeriodLite | null>(null);
  const [leasePayments, setLeasePayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Documents
  const [contract, setContract] = useState<LeaseContract | null>(null);
  const [inspections, setInspections] = useState<PropertyInspection[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  const loadDocuments = useCallback(async (lId: string) => {
    try {
      const [c, insps] = await Promise.all([
        fetchLeaseContract(lId),
        fetchInspections(lId),
      ]);
      setContract(c);
      setInspections(insps);
    } catch (err) {
      console.warn('Erreur chargement documents locataire:', err);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!profile?.id || !leaseId) return;

      try {
        const { data: leaseData, error: leaseError } = await supabase
          .from('leases')
          .select('id, tenant_id, start_date, status, properties:property_id(name, address, monthly_rent, owner_id)')
          .eq('id', leaseId)
          .eq('tenant_id', profile.id)
          .eq('status', 'actif')
          .maybeSingle();

        if (leaseError) throw leaseError;

        if (!leaseData) {
          setNotFound(true);
          return;
        }

        const prop = (leaseData as any).properties;
        setPropertyName(prop?.name || 'Logement');
        setPropertyAddress(prop?.address || '');
        setMonthlyRent(prop?.monthly_rent || 0);
        setStartDate(leaseData.start_date || '');

        // Récupérer le nom du propriétaire
        if (prop?.owner_id) {
          const { data: ownerData } = await supabase
            .from('users')
            .select('full_name, phone')
            .eq('id', prop.owner_id)
            .maybeSingle();

          if (ownerData) {
            setOwnerName(ownerData.full_name || 'Bailleur');
            setOwnerPhone(ownerData.phone || undefined);
          }
        }

        const now = new Date();
        const { data: periodData, error: periodError } = await supabase
          .from('rent_periods')
          .select('id, amount_due, amount_paid, deadline_date')
          .eq('lease_id', leaseId)
          .eq('period_month', now.getMonth() + 1)
          .eq('period_year', now.getFullYear())
          .maybeSingle();

        if (periodError && periodError.code !== 'PGRST116') throw periodError;
        setCurrentPeriod(periodData || null);

        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('id, amount, status, created_at, operator, fedapay_transaction_id, rent_periods!inner(lease_id)')
          .eq('tenant_id', profile.id)
          .eq('rent_periods.lease_id', leaseId)
          .eq('is_test_data', false)
          .order('created_at', { ascending: false })
          .limit(5);

        if (paymentsError) throw paymentsError;
        const cleaned: Payment[] = (paymentsData || []).map((row: any) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { rent_periods, ...rest } = row;
          return rest as Payment;
        });
        setLeasePayments(cleaned);

        // Charger documents (contrat et états des lieux)
        await loadDocuments(leaseId);
      } catch (err) {
        console.error('[LogementDetail] Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile?.id, leaseId, loadDocuments]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7FC] flex flex-col pt-8 px-6 pb-24">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex-1">
            <div className="h-6 bg-gray-200 rounded-md w-3/4 mb-2 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded-md w-1/2 animate-pulse" />
          </div>
        </div>
        <div className="h-48 bg-gray-200 rounded-[28px] animate-pulse mb-8" />
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4 animate-pulse" />
        <div className="space-y-4">
          <div className="h-16 bg-gray-200 rounded-2xl animate-pulse" />
          <div className="h-16 bg-gray-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F8F7FC] flex flex-col items-center justify-center p-6">
        <SearchX size={64} className="text-gray-300 mb-4" />
        <h2 className="font-nunito font-900 text-xl text-gray-800 mb-2">Logement introuvable</h2>
        <p className="text-gray-500 font-space-grotesk text-center mb-8">Ce logement n'existe pas ou n'est plus actif.</p>
        <button onClick={() => { haptics.light(); navigate('/dashboard'); }}
          className="bg-white border border-gray-200 shadow-sm px-6 py-3 rounded-2xl font-nunito font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 active:scale-95 transition-all">
          <ChevronLeft size={20} /> Retour à l'accueil
        </button>
      </div>
    );
  }

  const now = new Date();
  const paid = currentPeriod?.amount_paid || 0;
  const due = currentPeriod?.amount_due || 0;
  const remaining = Math.max(due - paid, 0);
  const percentage = due > 0 ? Math.min((paid / due) * 100, 100) : 0;
  const daysUntil = currentPeriod ? daysUntilDeadline(currentPeriod.deadline_date) : 0;
  const isLate = daysUntil < 0 && remaining > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7FC]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px)+32px)' }}>
      {/* HEADER SECTION */}
      <div className="px-6 pb-6 pt-8 bg-white border-b border-gray-100 shadow-sm relative z-10" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px)+24px)' }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { haptics.light(); navigate('/dashboard'); }}
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center flex-shrink-0 border border-gray-100 active:scale-95 transition-transform">
            <ChevronLeft size={22} className="text-gray-700" />
          </button>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F5F3FF] border border-[#EBE5FF]">
            <ShieldCheck size={12} className="text-[#7B3FE4]" />
            <span className="text-[10px] font-space-grotesk font-bold text-[#7B3FE4] uppercase tracking-wider">Logement Actif</span>
          </div>
        </div>
        
        <div>
          <h1 className="font-nunito font-900 text-[22px] text-[#17132B] leading-tight mb-2" style={{ wordBreak: 'break-word' }}>
            {propertyName}
          </h1>
          {propertyAddress && (
            <p className="text-gray-500 text-[13px] font-space-grotesk flex items-start gap-1.5 leading-snug">
              <MapPin size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />
              <span>{propertyAddress}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 px-5 py-6 flex flex-col gap-8">
        {/* CARD LOYER */}
        {currentPeriod ? (
          <div className="relative rounded-[28px] p-6 shadow-xl overflow-hidden transition-all"
            style={{ 
              background: 'linear-gradient(135deg, #3B0E8C 0%, #7B3FE4 60%, #A855F7 100%)',
              boxShadow: '0 20px 40px -12px rgba(123, 63, 228, 0.4)'
            }}>
            {/* Decor éléments */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />
            
            <div className="relative z-10 flex items-center justify-between mb-5">
              <p className="text-white/80 text-[11px] font-space-grotesk font-bold uppercase tracking-[0.15em] flex items-center gap-2">
                <Clock size={14} className="opacity-70" /> Loyer {getMonthName(now.getMonth() + 1, now.getFullYear())}
              </p>
              {remaining > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
                  {isLate ? <AlertCircle size={12} className="text-[#FF8080]" /> : <div className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />}
                  <span className="text-[10px] font-bold text-white font-space-grotesk">
                    {isLate ? `Retard ${Math.abs(daysUntil)}j` : `${daysUntil} jours restants`}
                  </span>
                </div>
              )}
            </div>

            <div className="relative z-10 mb-6">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-nunito font-900 text-white text-[2.5rem] leading-none tracking-tight">
                  {paid.toLocaleString('fr-FR')}
                </span>
                <span className="text-white/80 font-space-grotesk font-semibold text-[1.1rem]">FCFA</span>
              </div>
              <p className="text-white/70 text-[13px] font-space-grotesk flex items-center gap-1.5">
                Payé sur un total de <strong className="text-white font-nunito text-[14px]">{formatMontant(due)}</strong>
              </p>
            </div>

            <div className="relative z-10 mb-6 bg-white/10 p-4 rounded-[20px] backdrop-blur-sm border border-white/10">
              <div className="flex justify-between mb-2 text-[11px] font-bold font-space-grotesk">
                <span className="text-white flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-400" /> {Math.round(percentage)}% payé</span>
                <span className="text-white/70">{Math.round(100 - percentage)}% restant</span>
              </div>
              <div className="h-2.5 rounded-full w-full bg-black/20 overflow-hidden shadow-inner">
                <div className="h-full rounded-full transition-all duration-1000 ease-out relative" 
                  style={{ width: `${percentage}%`, background: isLate ? 'linear-gradient(90deg, #F87171, #EF4444)' : 'linear-gradient(90deg, #34D399, #10B981)' }}>
                  <div className="absolute inset-0 bg-white/20" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }} />
                </div>
              </div>
            </div>

            <button
              onClick={() => { haptics.medium(); navigate(`/payer/${leaseId}`); }}
              disabled={remaining === 0}
              className="w-full text-[#7B3FE4] font-nunito font-900 rounded-[20px] py-4 flex items-center justify-center gap-2 relative z-10 disabled:opacity-60 disabled:bg-white/50 bg-white shadow-lg shadow-black/10 active:scale-[0.98] transition-all text-[15px] hover:bg-gray-50"
            >
              {remaining === 0 ? <CheckCircle2 size={20} className="text-green-500" /> : <CreditCard size={20} />}
              {remaining === 0 ? 'Loyer intégralement soldé' : 'Effectuer un versement'}
            </button>
          </div>
        ) : (
          <div className="rounded-[24px] p-8 mb-6 flex flex-col items-center justify-center text-center bg-white border border-gray-100 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-[#F5F3FF] flex items-center justify-center mb-4">
              <CheckCircle2 size={32} className="text-[#7B3FE4]" />
            </div>
            <h3 className="font-nunito font-900 text-[18px] text-[#17132B] mb-2">Tout est en ordre</h3>
            <p className="text-gray-500 text-[14px] font-space-grotesk">
              Aucune période de loyer n'est actuellement exigible pour ce logement.
            </p>
          </div>
        )}

        {/* SECTION : DOCUMENTS & CONTRAT DE BAIL (LOCATAIRE) */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-nunito font-900 text-[#17132B] text-[18px]">Documents & Bail</h2>
            <span className="text-[12px] font-space-grotesk text-[#7B3FE4] font-bold bg-[#F5F3FF] px-2.5 py-1 rounded-full">Loi n° 2022-30</span>
          </div>

          <ContractCard
            leaseId={leaseId!}
            contract={contract}
            userRole="locataire"
            userName={profile?.full_name || 'Locataire'}
            propertyName={propertyName}
            propertyAddress={propertyAddress}
            monthlyRent={monthlyRent}
            startDate={startDate}
            ownerName={ownerName}
            tenantName={profile?.full_name || 'Locataire'}
            ownerPhone={ownerPhone}
            tenantPhone={profile?.phone || undefined}
            onRefresh={() => loadDocuments(leaseId!)}
          />

          <InspectionCard
            leaseId={leaseId!}
            inspections={inspections}
            userRole="locataire"
            userName={profile?.full_name || 'Locataire'}
            propertyName={propertyName}
            propertyAddress={propertyAddress}
            ownerName={ownerName}
            tenantName={profile?.full_name || 'Locataire'}
            contractNumber={contract?.contract_number}
            onRefresh={() => loadDocuments(leaseId!)}
            onOpenCompareModal={() => setIsCompareOpen(true)}
          />
        </div>

        {/* VERSEMENTS LIST */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="font-nunito font-900 text-[#17132B] text-[18px]">Historique récent</h2>
            <span className="text-[12px] font-space-grotesk text-[#7B3FE4] font-bold bg-[#F5F3FF] px-2.5 py-1 rounded-full">Derniers paiements</span>
          </div>
          
          {leasePayments.length === 0 ? (
            <div className="bg-white rounded-[24px] border border-gray-100 p-8 flex flex-col items-center text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                <CreditCard size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-500 text-[14px] font-space-grotesk">Aucun versement n'a été effectué pour ce logement pour le moment.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {leasePayments.map((payment) => {
                const op = payment.operator || 'mtn';
                const isMTN = op === 'mtn';
                const isMoov = op === 'moov';
                const opColor = isMTN ? '#FBBF24' : isMoov ? '#3B82F6' : '#10B981';
                const opBg = isMTN ? '#FFFBEB' : isMoov ? '#EFF6FF' : '#ECFDF5';
                
                return (
                  <div key={payment.id} onClick={() => navigate(`/recu/${payment.id}`)}
                    className="bg-white rounded-[20px] p-4 flex items-center justify-between border border-gray-100 shadow-sm active:scale-[0.98] transition-transform cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ background: opBg }}>
                        <div className="w-4 h-4 rounded-full shadow-sm" style={{ background: opColor }} />
                      </div>
                      <div>
                        <p className="text-[15px] font-900 text-[#17132B] mb-0.5 font-nunito flex items-center gap-1.5">
                          {operatorLabel(op)}
                          {payment.status === 'valide' && <ShieldCheck size={12} className="text-green-500" />}
                        </p>
                        <p className="text-gray-400 text-[12px] font-space-grotesk font-medium">
                          {new Date(payment.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[#17132B] font-900 text-[16px] font-nunito bg-gray-50 px-3 py-1.5 rounded-full">
                        {formatMontant(payment.amount)}
                      </p>
                      <ArrowRight size={16} className="text-gray-300" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CompareInspectionsModal
        isOpen={isCompareOpen}
        onClose={() => setIsCompareOpen(false)}
        entryInspection={inspections.find(i => i.inspection_type === 'entree')}
        exitInspection={inspections.find(i => i.inspection_type === 'sortie')}
      />
    </div>
  );
}
