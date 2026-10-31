import { supabase, AgenceMandat } from './supabase';

/** Accorde un mandat depuis la session propriétaire; l'identité du propriétaire est dérivée côté SQL. */
export async function grantAgencyMandate(input: {
  agencyId: string;
  listingId?: string | null;
  propertyId?: string | null;
  commissionRate?: number;
  notes?: string | null;
}): Promise<AgenceMandat> {
  const { data, error } = await supabase.rpc('grant_agence_mandat', {
    p_agence_id: input.agencyId,
    p_listing_id: input.listingId ?? null,
    p_property_id: input.propertyId ?? null,
    p_commission_rate: input.commissionRate ?? 10,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as AgenceMandat;
}

export async function terminateAgencyMandate(mandateId: string): Promise<void> {
  const { data, error } = await supabase.rpc('terminate_agence_mandat', {
    p_mandat_id: mandateId,
  });
  if (error) throw error;
  if (!data) throw new Error('Mandat introuvable ou déjà terminé.');
}

/** Accepte une proposition non consentie en dérivant l’identité du propriétaire côté SQL. */
export async function acceptAgencyMandate(mandateId: string): Promise<AgenceMandat> {
  const { data, error } = await supabase.rpc('accept_agence_mandat', {
    p_mandat_id: mandateId,
  });
  if (error) throw error;
  return data as AgenceMandat;
}
