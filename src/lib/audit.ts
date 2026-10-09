import { supabase } from './supabase';

interface LogActionParams {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
}

export async function logAction({
  userId,
  action,
  entityType,
  entityId,
  details = {},
}: LogActionParams) {
  try {
    // Insertion dans audit_logs (l'adresse IP n'est plus demandée à un service tiers :
    // elle doit être enregistrée côté serveur)
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: {
        ...details,
        user_agent: navigator.userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}
