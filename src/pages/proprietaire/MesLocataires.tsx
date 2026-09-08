import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { formatMontant, getCurrentMonth } from '../../lib/utils';
import BottomNav from '../../components/BottomNav';
import EmptyState from '../../components/EmptyState';
import ProgressBar from '../../components/ProgressBar';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';

interface TenantData {
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  amountPaid: number;
  amountDue: number;
  status: string;
}

interface GroupedTenants {
  [propertyId: string]: {
    propertyName: string;
    tenants: TenantData[];
  };
}

const MesLocataires: React.FC = () => {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [tenants, setTenants] = useState<GroupedTenants>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;

    const fetchTenants = async () => {
      try {
        // Get owner's properties
        const { data: properties, error: propertiesError } = await supabase
          .from('properties')
          .select('id, name, monthly_rent, payment_deadline_day')
          .eq('owner_id', profile.id)
          .eq('is_active', true);

        if (propertiesError) throw propertiesError;

        const { month, year } = getCurrentMonth();
        const grouped: GroupedTenants = {};
        const propertyList = properties || [];

        for (const property of propertyList) {
          grouped[property.id] = { propertyName: property.name, tenants: [] };
        }

        if (propertyList.length === 0) {
          setTenants(grouped);
          return;
        }

        // 1 requête pour tous les baux actifs de toutes les propriétés du propriétaire
        // (remplace un aller-retour par propriété — N+1 sur properties.length)
        const propertyIds = propertyList.map((p) => p.id);
        const { data: leases, error: leasesError } = await supabase
          .from('leases')
          .select('id, tenant_id, property_id')
          .in('property_id', propertyIds)
          .eq('status', 'actif');

        if (leasesError) throw leasesError;
        const activeLeases = leases || [];

        if (activeLeases.length === 0) {
          setTenants(grouped);
          return;
        }

        const tenantIds = [...new Set(activeLeases.map((l) => l.tenant_id))];
        const leaseIds = activeLeases.map((l) => l.id);
        const propertyById = new Map(propertyList.map((p) => [p.id, p]));

        // 1 requête pour tous les locataires + 1 requête pour toutes les périodes en cours
        // (remplace deux allers-retours par bail — N+1 sur leases.length)
        const [{ data: users, error: usersError }, { data: rentPeriods, error: rpError }] = await Promise.all([
          supabase.from('users').select('id, full_name, phone').in('id', tenantIds),
          supabase
            .from('rent_periods')
            .select('lease_id, amount_paid, amount_due, status')
            .in('lease_id', leaseIds)
            .eq('period_month', month)
            .eq('period_year', year),
        ]);

        if (usersError) throw usersError;
        if (rpError) throw rpError;

        const userById = new Map((users || []).map((u) => [u.id, u]));
        const rentPeriodByLeaseId = new Map((rentPeriods || []).map((rp) => [rp.lease_id, rp]));

        // Génération contrôlée côté base : le navigateur ne choisit ni montant,
        // ni échéance, ni statut d'une période de loyer.
        const leasesMissingPeriod = activeLeases.filter((l) => {
          const property = propertyById.get(l.property_id);
          return !rentPeriodByLeaseId.has(l.id) && property?.monthly_rent;
        });

        if (leasesMissingPeriod.length > 0) {
          const results = await Promise.all(
            leasesMissingPeriod.map((lease) => supabase.rpc('ensure_current_rent_period', { p_lease_id: lease.id }))
          );
          for (const { data: period, error: insertError } of results) {
            if (!insertError && period) {
              rentPeriodByLeaseId.set(period.lease_id, period);
            }
          }
        }

        for (const lease of activeLeases) {
          const property = propertyById.get(lease.property_id);
          const user = userById.get(lease.tenant_id);
          const currentRentPeriod = rentPeriodByLeaseId.get(lease.id);

          if (property && user && currentRentPeriod) {
            grouped[property.id].tenants.push({
              propertyId: property.id,
              propertyName: property.name,
              tenantId: lease.tenant_id,
              tenantName: user.full_name,
              tenantPhone: user.phone,
              amountPaid: currentRentPeriod.amount_paid || 0,
              amountDue: currentRentPeriod.amount_due || 0,
              status: currentRentPeriod.status,
            });
          }
        }

        setTenants(grouped);
      } catch (error) {
        console.error('Error fetching tenants:', error);
        showToast('Erreur lors du chargement des locataires', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, [profile?.id, showToast]);

  const totalTenants = Object.values(tenants).reduce(
    (sum, prop) => sum + prop.tenants.length,
    0
  );

  if (loading) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card h-20 animate-pulse"></div>
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  if (totalTenants === 0) {
    return (
      <div className="page-container">
        <div className="px-4 pt-6 mb-6">
          <h1 className="text-2xl font-nunito font-900">Mes locataires</h1>
        </div>
        <EmptyState
          title="Aucun locataire actif"
          description="Vos locataires apparaîtront ici"
        />
        <BottomNav />
      </div>
    );
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="page-container">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-nunito font-900 mb-6">Mes locataires</h1>

        <div className="space-y-6">
          {Object.values(tenants).map(property => {
            if (property.tenants.length === 0) return null;

            return (
              <div key={property.propertyName}>
                <h2 className="section-title text-sm mb-3">{property.propertyName}</h2>
                <div className="space-y-3">
                  {property.tenants.map(tenant => (
                    <div key={tenant.tenantId} className="card p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-violet flex items-center justify-center">
                          <span className="font-nunito font-700 text-white text-sm">
                            {getInitials(tenant.tenantName)}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--imx-text-primary)]">{tenant.tenantName}</p>
                          <p className="text-xs text-text-dim font-mono">{tenant.tenantPhone}</p>
                        </div>
                      </div>

                      <ProgressBar current={tenant.amountPaid} total={tenant.amountDue} />

                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="text-xs text-text-dim">
                            <span className="font-semibold text-[var(--imx-text-primary)]">{formatMontant(tenant.amountPaid)}</span>
                            {' '} / {formatMontant(tenant.amountDue)}
                          </p>
                        </div>
                        <StatusBadge status={tenant.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default MesLocataires;
