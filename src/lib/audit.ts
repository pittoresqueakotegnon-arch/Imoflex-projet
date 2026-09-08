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
    // 1. Get IP address (fallback to unknown if blocked by adblockers/network)
    let ip = 'unknown';
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      if (data && data.ip) {
        ip = data.ip;
      }
    } catch (e) {
      console.warn('Could not fetch IP address:', e);
    }

    // 2. Insert into audit_logs
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: {
        ...details,
        ip_address: ip,
        user_agent: navigator.userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
}
