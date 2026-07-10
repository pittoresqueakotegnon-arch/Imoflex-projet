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
          .select('id, name')
          .eq('owner_id', profile.id)
          .eq('is_active', true);

        if (propertiesError) throw propertiesError;

        const { month, year } = getCurrentMonth();
        const grouped: GroupedTenants = {};

        for (const property of properties || []) {
          // Get active leases for property
          const { data: leases, error: leasesError } = await supabase
            .from('leases')
            .select('id, tenant_id')
            .eq('property_id', property.id)
            .eq('status', 'actif');

          if (leasesError) throw leasesError;

          grouped[property.id] = {
            propertyName: property.name,
            tenants: [],
          };

          for (const lease of leases || []) {
            // Get tenant info
            const { data: user } = await supabase
              .from('users')
              .select('full_name, phone')
              .eq('id', lease.tenant_id)
              .maybeSingle();

            // Get current rent period
            const { data: rentPeriods } = await supabase
              .from('rent_periods')
              .select('amount_paid, amount_due, status')
              .eq('lease_id', lease.id)
              .eq('period_month', month)
              .eq('period_year', year)
              .maybeSingle();

            if (user && rentPeriods) {
              grouped[property.id].tenants.push({
                propertyId: property.id,
                propertyName: property.name,
                tenantId: lease.tenant_id,
                tenantName: user.full_name,
                tenantPhone: user.phone,
                amountPaid: rentPeriods.amount_paid || 0,
                amountDue: rentPeriods.amount_due || 0,
                status: rentPeriods.status,
              });
            }
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
                          <p className="font-semibold text-white">{tenant.tenantName}</p>
                          <p className="text-xs text-text-dim font-mono">{tenant.tenantPhone}</p>
                        </div>
                      </div>

                      <ProgressBar current={tenant.amountPaid} total={tenant.amountDue} />

                      <div className="flex items-center justify-between mt-2">
                        <div>
                          <p className="text-xs text-text-dim">
                            <span className="font-semibold text-white">{formatMontant(tenant.amountPaid)}</span>
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
