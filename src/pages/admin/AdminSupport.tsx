import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Headset, CheckCircle2, Clock, AlertCircle, Search, Filter, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Ticket {
  id: string;
  user_id: string | null;
  role: string;
  category: string;
  message: string;
  status: 'nouveau' | 'en_cours' | 'resolu';
  page_context: string | null;
  listing_id: string | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  users?: {
    full_name: string;
    phone: string;
  } | null;
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'tous' | 'nouveau' | 'en_cours' | 'resolu'>('tous');
  const [search, setSearch] = useState('');

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select(`
          *,
          users:user_id (full_name, phone)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data as Ticket[]);
    } catch (err) {
      console.error('Erreur chargement tickets:', err);
      toast.error('Impossible de charger les tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();

    // Abonnement temps réel
    const subscription = supabase
      .channel('support_tickets_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_tickets' },
        (payload) => {
          toast('Nouveau ticket reçu !', {
            description: payload.new.category,
            icon: <Headset size={16} className="text-[#7B3FE4]" />,
          });
          // On recharge tout pour avoir les infos jointes (users)
          fetchTickets();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      setTickets(prev => 
        prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t)
      );
      toast.success('Statut mis à jour');
    } catch (err) {
      console.error('Erreur maj statut:', err);
      toast.error('Impossible de mettre à jour le statut');
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const matchStatus = statusFilter === 'tous' || t.status === statusFilter;
      const term = search.toLowerCase();
      const matchSearch = 
        t.category.toLowerCase().includes(term) ||
        t.message.toLowerCase().includes(term) ||
        t.contact_email?.toLowerCase().includes(term) ||
        t.users?.full_name?.toLowerCase().includes(term);
      return matchStatus && matchSearch;
    });
  }, [tickets, statusFilter, search]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'nouveau':
        return <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-[11px] font-bold flex items-center gap-1 w-fit"><AlertCircle size={12}/> Nouveau</span>;
      case 'en_cours':
        return <span className="px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center gap-1 w-fit"><Clock size={12}/> En cours</span>;
      case 'resolu':
        return <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center gap-1 w-fit"><CheckCircle2 size={12}/> Résolu</span>;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black mb-1" style={{ fontFamily: 'Nunito' }}>Support & Signalements</h1>
          <p className="text-sm" style={{ color: 'var(--adm-text-muted)' }}>Gérez les tickets des utilisateurs et visiteurs</p>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border mb-6 flex flex-col sm:flex-row gap-4" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--adm-text-muted)' }} />
          <input
            type="text"
            placeholder="Rechercher un ticket, email, catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors"
            style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)', border: '1px solid var(--adm-border)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} style={{ color: 'var(--adm-text-muted)' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
            style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)', border: '1px solid var(--adm-border)' }}
          >
            <option value="tous">Tous les statuts</option>
            <option value="nouveau">Nouveaux</option>
            <option value="en_cours">En cours</option>
            <option value="resolu">Résolus</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--adm-accent)', borderTopColor: 'transparent' }} />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
          <Headset size={40} className="mx-auto mb-4 opacity-50" style={{ color: 'var(--adm-text-muted)' }} />
          <p className="font-semibold mb-1">Aucun ticket trouvé</p>
          <p className="text-sm" style={{ color: 'var(--adm-text-dim)' }}>Tous les problèmes semblent résolus.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredTickets.map(ticket => (
            <div key={ticket.id} className="p-5 rounded-2xl border transition-all" style={{ background: 'var(--adm-surface)', borderColor: 'var(--adm-border)' }}>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusBadge(ticket.status)}
                    <span className="text-[12px] uppercase font-bold" style={{ color: 'var(--adm-text-dim)', letterSpacing: '0.5px' }}>{ticket.role}</span>
                    <span className="text-[12px]" style={{ color: 'var(--adm-text-muted)' }}>
                      {new Date(ticket.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg">{ticket.category}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
                    <span style={{ color: 'var(--adm-text-muted)' }}>De :</span>
                    {ticket.users ? (
                      <span className="font-semibold">{ticket.users.full_name} ({ticket.users.phone})</span>
                    ) : (
                      <span className="font-semibold italic">{ticket.contact_email || 'Visiteur anonyme'}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={ticket.status}
                    onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold outline-none cursor-pointer border"
                    style={{ background: 'var(--adm-bg)', color: 'var(--adm-text)', borderColor: 'var(--adm-border)' }}
                  >
                    <option value="nouveau">Marquer Nouveau</option>
                    <option value="en_cours">Marquer En cours</option>
                    <option value="resolu">Marquer Résolu</option>
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl text-sm leading-relaxed mb-4" style={{ background: 'var(--adm-bg)' }}>
                {ticket.message}
              </div>

              {ticket.page_context && (
                <div className="flex items-center gap-2 text-[12px]">
                  <span style={{ color: 'var(--adm-text-dim)' }}>Contexte :</span>
                  <a href={ticket.page_context} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline" style={{ color: 'var(--adm-accent)' }}>
                    {ticket.page_context} <ExternalLink size={12} />
                  </a>
                  {ticket.listing_id && (
                    <span className="ml-2 font-mono text-[10px] bg-black/10 px-2 py-0.5 rounded">ID: {ticket.listing_id.split('-')[0]}...</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
