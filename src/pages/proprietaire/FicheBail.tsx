import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Phone, Calendar, MapPin, CreditCard, AlertTriangle, CheckCircle2, Clock3, MessageCircle, WalletCards } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { getCurrentMonth, getMonthName } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import { BackButton } from '../../components/BackButton';

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

const ProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;
  return (
    <div className="h-[6px] rounded-full w-full mt-3 mb-2" style={{ background: 'var(--imx-border)' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: 'var(--imx-accent)',
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
                status,
                is_test_data
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
      <div className="page-container premium-page flex flex-col min-h-screen">
        <div className="px-4 py-6">
          <div className="h-6 w-8 bg-[var(--imx-surface)] rounded animate-pulse mb-6"></div>
          <div className="h-40 bg-[var(--imx-surface)] rounded-2xl animate-pulse mb-4"></div>
          <div className="h-32 bg-[var(--imx-surface)] rounded-2xl animate-pulse"></div>
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
  const isSolde = Boolean(
    currentPeriod?.status === 'solde'
      || (currentPeriod && currentPeriod.amount_paid >= currentPeriod.amount_due && currentPeriod.amount_due > 0)
  );

  // Flatten and sort payments from newest to oldest
  const allPayments = lease.rent_periods
    .flatMap((rp) => rp.payments ?? [])
    .filter((p: any) => p.is_test_data === false)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Indicateurs strictement limités au bail ouvert : aucun score opaque ni donnée privée du profil.
  const currentMonthDate = new Date(year, month - 1, 1);
  const duePeriods = lease.rent_periods.filter((period) => {
    const periodDate = new Date(period.period_year, period.period_month - 1, 1);
    return period.amount_due > 0 && periodDate <= currentMonthDate;
  });
  const settledPeriods = duePeriods.filter(
    (period) => period.status === 'solde' || period.amount_paid >= period.amount_due
  );
  const overduePeriods = duePeriods.filter((period) => period.status === 'retard');
  const currentBalance = currentPeriod
    ? Math.max(currentPeriod.amount_due - currentPeriod.amount_paid, 0)
    : 0;
  const lastValidatedPayment = allPayments.find((payment) => payment.status === 'valide');
  const formatAmount = (amount: number) => new Intl.NumberFormat('fr-FR').format(amount);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  const reminderMessage = currentPeriod
    ? `Bonjour ${lease.tenant?.full_name || ''}, le loyer de ${getMonthName(month, year)} présente un solde de ${formatAmount(currentBalance)} FCFA. Merci de nous contacter.`
    : `Bonjour ${lease.tenant?.full_name || ''}, merci de nous contacter au sujet de votre bail ImoFlex.`;
  const reminderHref = lease.tenant?.phone
    ? `sms:${lease.tenant.phone}?body=${encodeURIComponent(reminderMessage)}`
    : undefined;

  const tenantInitial = lease.tenant?.full_name
    ? lease.tenant.full_name.charAt(0).toUpperCase()
    : '?';

  return (
    <div className="page-container premium-page flex flex-col min-h-screen pb-24">
      {/* ── HEADER ── */}
      <div className="premium-header px-4 pt-6 pb-4 flex items-center justify-between">
        <BackButton />
        <h1 className="text-lg font-nunito font-black text-[var(--imx-text-primary)]">Dossier locataire</h1>
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>

      <div className="px-4 space-y-5">
        {/* INDICATEUR DE RETARD */}
        {isRetard && (
          <div className="rounded-[16px] px-4 py-3 flex items-center gap-3" style={{ background: 'var(--imx-surface)', border: '1px solid rgba(239, 68, 68, 0.32)', boxShadow: '0 4px 14px rgba(35, 23, 67, 0.04)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239, 68, 68, 0.10)' }}>
              <AlertTriangle size={18} className="text-red-500" />
            </div>
            <div>
              <p className="font-nunito font-black text-[var(--imx-text-primary)] text-[14px]">Loyer en retard</p>
              <p className="text-[11px]" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                Le paiement pour la période en cours n'a pas été reçu.
              </p>
            </div>
          </div>
        )}

        {/* VUE D'ENSEMBLE — limitée aux informations de ce bail */}
        <section className="rounded-[24px] p-5 overflow-hidden" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: 'var(--imx-card-shadow)' }}>
          <div className="flex items-start gap-4 mb-5">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #7B3FE4, #A855F7)' }}>
              {lease.tenant?.avatar_url ? (
                <img src={lease.tenant.avatar_url} alt={lease.tenant.full_name} className="w-full h-full object-cover" />
              ) : (
                tenantInitial
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-nunito font-black text-[var(--imx-text-primary)] text-[18px] truncate">
                  {lease.tenant?.full_name || 'Locataire'}
                </h2>
                <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full" style={{ color: 'var(--imx-accent)', background: 'var(--imx-accent-xlight)', fontFamily: 'Space Grotesk' }}>
                  BAIL ACTIF
                </span>
              </div>
              <p className="text-[12px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                Locataire depuis le {formatDate(lease.start_date)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-xl px-3 py-3" style={{ background: 'var(--imx-surface-2)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Logement</p>
              <p className="text-[12px] font-bold truncate text-[var(--imx-text-primary)]">{lease.property?.name || '—'}</p>
            </div>
            <div className="rounded-xl px-3 py-3" style={{ background: 'var(--imx-surface-2)' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Échéance</p>
              <p className="text-[12px] font-bold text-[var(--imx-text-primary)]">Le {lease.property?.payment_deadline_day ?? '—'} du mois</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2" style={{ gridTemplateColumns: isRetard && reminderHref ? '1fr 1fr' : '1fr' }}>
            <a
              href={lease.tenant?.phone ? `tel:${lease.tenant.phone}` : undefined}
              aria-disabled={!lease.tenant?.phone}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13px] transition-opacity hover:opacity-90"
              style={{
                background: lease.tenant?.phone ? 'linear-gradient(135deg, #7B3FE4, #A855F7)' : 'var(--imx-border)',
                color: '#FFFFFF',
                pointerEvents: lease.tenant?.phone ? 'auto' : 'none'
              }}
            >
              <Phone size={16} />
              {lease.tenant?.phone ? 'Appeler' : 'Numéro non disponible'}
            </a>
            {isRetard && reminderHref && (
              <a
                href={reminderHref}
                className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13px] transition-opacity hover:opacity-90"
                style={{ background: 'var(--imx-surface)', border: '1px solid rgba(123, 63, 228, 0.38)', color: 'var(--imx-accent)' }}
              >
                <MessageCircle size={16} />
                Relancer
              </a>
            )}
          </div>
          <p className="text-[10px] mt-3 text-center" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>
            Informations limitées à ce bail pour préserver la vie privée du locataire.
          </p>
        </section>

        {/* SUIVI FACTUEL DES PAIEMENTS — pas de score de locataire */}
        <section>
          <div className="flex items-center justify-between mb-3 ml-1">
            <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px]">Suivi du paiement</h3>
            <span className="text-[10px]" style={{ color: 'var(--imx-text-muted)', fontFamily: 'Space Grotesk' }}>Ce bail uniquement</span>
          </div>
          <div className="rounded-[20px] overflow-hidden grid grid-cols-3" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)', boxShadow: '0 6px 18px rgba(35, 23, 67, 0.04)' }}>
            <div className="min-w-0 p-4">
              {isRetard ? <AlertTriangle size={17} color="#EF4444" /> : isSolde ? <CheckCircle2 size={17} color="var(--imx-accent)" /> : <Clock3 size={17} color="var(--imx-accent)" />}
              <p className="text-[10px] mt-2" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>Mois en cours</p>
              <p className="font-nunito font-black text-[12px] mt-0.5 text-[var(--imx-text-primary)] truncate">
                {!currentPeriod ? 'À venir' : isSolde ? 'Soldé' : currentBalance > 0 ? `${formatAmount(currentBalance)} F` : 'En cours'}
              </p>
            </div>
            <div className="min-w-0 p-4" style={{ borderLeft: '1px solid var(--imx-border)' }}>
              <WalletCards size={17} color="var(--imx-accent-light)" />
              <p className="text-[10px] mt-2" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>Périodes soldées</p>
              <p className="font-nunito font-black text-[12px] mt-0.5 text-[var(--imx-text-primary)]">
                {duePeriods.length ? `${settledPeriods.length} / ${duePeriods.length}` : '—'}
              </p>
            </div>
            <div className="min-w-0 p-4" style={{ borderLeft: '1px solid var(--imx-border)' }}>
              <CreditCard size={17} color="var(--imx-accent-light)" />
              <p className="text-[10px] mt-2" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>Dernier versement</p>
              <p className="font-nunito font-black text-[12px] mt-0.5 text-[var(--imx-text-primary)] truncate">
                {lastValidatedPayment ? formatDate(lastValidatedPayment.created_at) : 'Aucun'}
              </p>
            </div>
          </div>
          {overduePeriods.length > 0 && !isRetard && (
            <p className="text-[11px] mt-2 ml-1" style={{ color: '#FBBF24', fontFamily: 'Space Grotesk' }}>
              {overduePeriods.length} période{overduePeriods.length > 1 ? 's' : ''} antérieure{overduePeriods.length > 1 ? 's' : ''} à régulariser.
            </p>
          )}
        </section>

        {/* SECTION 2: INFORMATIONS DU BAIL */}
        <div>
          <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px] mb-3 ml-1">Le bail</h3>
          <div className="rounded-[20px] p-5 space-y-4" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            
            {/* Loyer mensuel */}
            <div className="flex justify-between items-end pb-4" style={{ borderBottom: '1px solid var(--imx-border)' }}>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                  Loyer mensuel attendu
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="font-nunito font-black text-[var(--imx-text-primary)] text-[24px]">
                    {new Intl.NumberFormat('fr-FR').format(lease.property?.monthly_rent ?? 0)}
                  </span>
                  <span className="text-[12px] text-[var(--imx-text-secondary)]">FCFA</span>
                </div>
              </div>
              <span className="text-[10px] font-bold rounded-md px-2.5 py-1 uppercase" style={{ background: 'var(--imx-accent-xlight)', color: 'var(--imx-accent)', fontFamily: 'Space Grotesk', letterSpacing: '0.04em' }}>
                ACTIF
              </span>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(123, 63, 228, 0.1)' }}>
                <MapPin size={16} color="var(--imx-accent-light)" />
              </div>
              <div className="min-w-0">
                <p className="font-nunito font-bold text-[var(--imx-text-primary)] text-[14px] truncate">{lease.property?.name || '—'}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                  {lease.property?.address || '—'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(123, 63, 228, 0.1)' }}>
                <Calendar size={16} color="var(--imx-accent-light)" />
              </div>
              <div className="min-w-0 flex-1 flex justify-between items-center">
                <div>
                  <p className="font-nunito font-bold text-[var(--imx-text-primary)] text-[14px]">Début du bail</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                    {lease.start_date ? new Date(lease.start_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-nunito font-bold text-[var(--imx-text-primary)] text-[14px]">Limite</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                    Le {lease.property?.payment_deadline_day ?? '—'} du mois
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: HISTORIQUE DES VERSEMENTS */}
        <div>
          <h3 className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px] mb-3 ml-1">Historique des paiements</h3>
          
          <div className="rounded-[20px] p-5" style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}>
            
            {/* Barre de progression du mois en cours */}
            {currentPeriod && (
              <div className="mb-6 pb-5" style={{ borderBottom: '1px solid var(--imx-border)' }}>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[12px] font-bold text-[var(--imx-text-primary)] uppercase tracking-wide" style={{ fontFamily: 'Space Grotesk' }}>
                    Mois en cours ({getMonthName(month, year)})
                  </p>
                  <span
                    className="text-[9px] font-bold rounded-md px-2 py-0.5 uppercase"
                    style={{
                      fontFamily: 'Space Grotesk',
                      background: isRetard ? 'rgba(239,68,68,0.10)' : 'var(--imx-accent-xlight)',
                      color: isRetard ? '#EF4444' : 'var(--imx-accent)',
                    }}
                  >
                    {isSolde ? 'SOLDÉ' : isRetard ? 'RETARD' : 'EN COURS'}
                  </span>
                </div>
                
                <ProgressBar
                  current={currentPeriod.amount_paid}
                  total={currentPeriod.amount_due}
                />
                
                <div className="flex justify-between text-[11px]" style={{ fontFamily: 'Space Grotesk' }}>
                  <span style={{ color: isRetard ? '#EF4444' : 'var(--imx-accent)' }}>
                    {new Intl.NumberFormat('fr-FR').format(currentPeriod.amount_paid)} F reçus
                  </span>
                  <span style={{ color: 'var(--imx-text-muted)' }}>
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
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isEchoue ? 'rgba(239,68,68,0.10)' : 'var(--imx-accent-xlight)' }}>
                          <CreditCard size={16} color={isEchoue ? '#EF4444' : 'var(--imx-accent)'} />
                        </div>
                        <div>
                          <p className="font-nunito font-bold text-[var(--imx-text-primary)] text-[14px]">Paiement Mobile Money</p>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
                            {new Date(payment.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-nunito font-black text-[var(--imx-text-primary)] text-[15px]">
                          {new Intl.NumberFormat('fr-FR').format(payment.amount)} F
                        </p>
                        <p
                          className="text-[10px] font-bold mt-0.5"
                          style={{
                            fontFamily: 'Space Grotesk',
                            color: isEchoue ? '#EF4444' : isValide ? 'var(--imx-accent)' : 'var(--imx-text-secondary)'
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
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: 'var(--imx-border)' }}>
                  <CreditCard size={20} color="var(--imx-text-secondary)" />
                </div>
                <p className="text-[13px] font-bold text-[var(--imx-text-primary)]">Aucun paiement effectué</p>
                <p className="text-[11px] mt-1" style={{ color: 'var(--imx-text-secondary)', fontFamily: 'Space Grotesk' }}>
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
