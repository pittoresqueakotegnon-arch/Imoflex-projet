import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Download, Shield } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { formatMontant } from '../../../lib/utils';

export default function WebLocataireDocuments() {
  const { profile } = useAuth();
  const [leases, setLeases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: leasesData } = await supabase
        .from('leases')
        .select(`
          id,
          status,
          created_at,
          start_date,
          end_date,
          properties:property_id (
            id,
            name,
            address,
            city,
            monthly_rent
          )
        `)
        .eq('tenant_id', profile.id);

      setLeases(leasesData || []);

      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          status,
          created_at,
          rent_period_id,
          rent_periods:rent_period_id (
            period_month,
            period_year,
            leases:lease_id (
              properties:property_id (name)
            )
          )
        `)
        .eq('tenant_id', profile.id)
        .eq('status', 'valide')
        .order('created_at', { ascending: false });

      setPayments(paymentsData || []);
    } catch (err) {
      console.error('[WebLocataireDocuments] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-black" style={{ fontFamily: 'Sora', color: 'var(--imx-text-primary)' }}>
          Mes Documents & Contrats
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--imx-text-muted)' }}>
          Retrouvez vos contrats de bail officiels, états des lieux et quittances de paiement numériques.
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--imx-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Leases & Contracts */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Contrats de bail en cours
            </h2>

            {leases.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
                Aucun contrat de bail actif associé à votre compte.
              </div>
            ) : (
              leases.map((lease) => (
                <div
                  key={lease.id}
                  className="p-5 rounded-2xl border bg-white shadow-sm"
                  style={{ borderColor: 'var(--imx-border)' }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-base text-[#17132B]">{lease.properties?.name}</h3>
                      <p className="text-xs text-gray-500">{lease.properties?.address}, {lease.properties?.city}</p>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600">
                      Bail {lease.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 py-3 border-y my-3" style={{ borderColor: 'var(--imx-border)' }}>
                    <div>
                      <span className="text-gray-400 block">Loyer mensuel</span>
                      <strong className="text-gray-800">{formatMontant(lease.properties?.monthly_rent || 0)}</strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Début du bail</span>
                      <strong className="text-gray-800">{lease.start_date || 'Non spécifié'}</strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Conformité</span>
                      <strong className="text-emerald-600 flex items-center gap-1">
                        <Shield size={12} /> Loi béninoise 2022-30
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Link
                      to={`/logement/${lease.id}`}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border bg-gray-50 hover:bg-gray-100 transition-colors text-gray-700"
                      style={{ borderColor: 'var(--imx-border)' }}
                    >
                      <FileText size={14} className="text-[#7B3FE4]" />
                      Consulter les détails du bail
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Receipts */}
          <div className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Quittances & Reçus de loyer ({payments.length})
            </h2>

            {payments.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
                Aucune quittance disponible pour l'instant.
              </div>
            ) : (
              <div className="rounded-2xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: 'var(--imx-border)' }}>
                <div className="divide-y" style={{ borderColor: 'var(--imx-border)' }}>
                  {payments.map((p) => {
                    const period = p.rent_periods;
                    const propName = period?.leases?.properties?.name || 'Logement';
                    return (
                      <div key={p.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{propName}</p>
                          <p className="text-gray-400 mt-0.5">
                            Période {period?.period_month}/{period?.period_year} · {formatMontant(p.amount)}
                          </p>
                        </div>
                        <Link
                          to={`/web/recu/${p.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold text-xs"
                          style={{ borderColor: 'var(--imx-border)' }}
                        >
                          <Download size={13} />
                          Reçu
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
