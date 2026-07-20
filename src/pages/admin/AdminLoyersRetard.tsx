import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Phone, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

interface LateRentInfo {
  id: string;
  amount_due: number;
  amount_paid: number;
  deadline_date: string;
  property_name: string;
  property_address: string;
  tenant_name: string;
  tenant_phone: string;
  owner_name: string;
  owner_phone: string;
}

const AdminLoyersRetard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lateRents, setLateRents] = useState<LateRentInfo[]>([]);

  useEffect(() => {
    const fetchLateRents = async () => {
      try {
        const { data, error } = await supabase
          .from('rent_periods')
          .select(`
            id,
            amount_due,
            amount_paid,
            deadline_date,
            leases (
              tenant_id,
              properties (
                name,
                address,
                owner_id
              )
            )
          `)
          .eq('status', 'retard');

        if (error) throw error;

        // Fetch user details for tenants and owners
        const userIds = new Set<string>();
        data?.forEach(rp => {
          if ((rp.leases as any)?.tenant_id) userIds.add((rp.leases as any).tenant_id);
          if ((rp.leases as any)?.properties?.owner_id) userIds.add((rp.leases as any).properties.owner_id);
        });

        let usersMap: Record<string, { full_name: string, phone: string }> = {};
        if (userIds.size > 0) {
          const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, phone')
            .in('id', Array.from(userIds));
            
          if (usersError) throw usersError;
          
          users?.forEach(u => {
            usersMap[u.id] = { full_name: u.full_name, phone: u.phone };
          });
        }

        const formattedData: LateRentInfo[] = (data || []).map(rp => {
          const l = rp.leases as any;
          const tenantId = l?.tenant_id;
          const ownerId = l?.properties?.owner_id;
          
          return {
            id: rp.id,
            amount_due: rp.amount_due,
            amount_paid: rp.amount_paid,
            deadline_date: rp.deadline_date,
            property_name: l?.properties?.name || 'Inconnu',
            property_address: l?.properties?.address || 'Inconnu',
            tenant_name: tenantId && usersMap[tenantId] ? usersMap[tenantId].full_name : 'Inconnu',
            tenant_phone: tenantId && usersMap[tenantId] ? usersMap[tenantId].phone : '',
            owner_name: ownerId && usersMap[ownerId] ? usersMap[ownerId].full_name : 'Inconnu',
            owner_phone: ownerId && usersMap[ownerId] ? usersMap[ownerId].phone : '',
          };
        });

        setLateRents(formattedData);
      } catch (err) {
        console.error('Error fetching late rents:', err);
        showToast('Erreur lors du chargement des loyers en retard', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchLateRents();
  }, [showToast]);

  const calculateDaysLate = (deadline: string) => {
    const diff = new Date().getTime() - new Date(deadline).getTime();
    const days = Math.floor(diff / (1000 * 3600 * 24));
    return days > 0 ? days : 0;
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/admin')}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ChevronLeft size={24} className="text-white" />
        </button>
        <div>
          <h1 className="text-2xl font-nunito font-900 text-white flex items-center gap-2">
            <AlertTriangle className="text-red-500" />
            Loyers en retard
          </h1>
          <p className="text-[#8B7BB5] text-sm mt-1" style={{ fontFamily: 'Space Grotesk' }}>
            {lateRents.length} loyer(s) nécessitant une attention
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : lateRents.length === 0 ? (
        <div className="card p-8 text-center border border-dashed border-[#261C55] bg-transparent">
          <p className="text-[#8B7BB5]">Aucun loyer en retard actuellement.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lateRents.map(rent => {
            const remaining = rent.amount_due - rent.amount_paid;
            const daysLate = calculateDaysLate(rent.deadline_date);

            return (
              <div key={rent.id} className="card p-5 border border-red-500/20">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-nunito font-bold text-white text-lg">
                      {rent.property_name}
                    </h3>
                    <p className="text-[#8B7BB5] text-xs line-clamp-1">{rent.property_address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold font-nunito">{new Intl.NumberFormat('fr-FR').format(remaining)} FCFA</p>
                    <p className="text-xs text-red-400/70">{daysLate} jours de retard</p>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="bg-[#181135] p-3 rounded-xl">
                    <p className="text-[10px] text-[#8B7BB5] uppercase font-bold tracking-wider mb-1">Locataire</p>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-white font-medium">{rent.tenant_name}</p>
                      {rent.tenant_phone && (
                        <a href={`tel:${rent.tenant_phone}`} className="p-2 bg-[#2A1E5C] text-[#A855F7] rounded-lg hover:bg-[#3D2C85] transition-colors">
                          <Phone size={14} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#181135] p-3 rounded-xl">
                    <p className="text-[10px] text-[#8B7BB5] uppercase font-bold tracking-wider mb-1">Propriétaire</p>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-white font-medium">{rent.owner_name}</p>
                      {rent.owner_phone && (
                        <a href={`tel:${rent.owner_phone}`} className="p-2 bg-[#2A1E5C] text-[#A855F7] rounded-lg hover:bg-[#3D2C85] transition-colors">
                          <Phone size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminLoyersRetard;
