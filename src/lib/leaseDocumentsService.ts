import { supabase, LeaseContract, PropertyInspection, PropertyInspectionItem } from './supabase';

/**
 * Calcule l'empreinte SHA-256 d'une chaîne de caractères (Web Crypto API)
 */
export async function calculateSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Récupère ou génère une URL signée temporaire pour un document ou une photo privée
 */
export async function getSecureDocumentUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!storagePath) return null;
  // Si c'est déjà une URL http externe (ex: fallback)
  if (storagePath.startsWith('http')) return storagePath;

  try {
    const { data, error } = await supabase.storage
      .from('lease-documents')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      console.warn('Erreur génération signedUrl:', error.message);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error('Erreur getSecureDocumentUrl:', err);
    return null;
  }
}

/**
 * Téléverse un Blob PDF vers le bucket privé lease-documents
 */
export async function uploadLeasePdf(
  leaseId: string,
  fileName: string,
  pdfBlob: Blob
): Promise<string | null> {
  const storagePath = `${leaseId}/${fileName}`;
  try {
    const { error } = await supabase.storage
      .from('lease-documents')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error('Erreur uploadLeasePdf:', error);
      return null;
    }
    return storagePath;
  } catch (err) {
    console.error('Erreur uploadLeasePdf exception:', err);
    return null;
  }
}

/**
 * Téléverse une photo d'état des lieux vers le bucket privé
 */
export async function uploadInspectionPhoto(
  leaseId: string,
  inspectionId: string,
  file: File
): Promise<string | null> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
  const storagePath = `${leaseId}/inspections/${inspectionId}/${fileName}`;

  try {
    const { error } = await supabase.storage
      .from('lease-documents')
      .upload(storagePath, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      console.error('Erreur uploadInspectionPhoto:', error);
      return null;
    }
    return storagePath;
  } catch (err) {
    console.error('Erreur uploadInspectionPhoto exception:', err);
    return null;
  }
}

/**
 * Récupère le contrat de bail associé à un leaseId
 */
export async function fetchLeaseContract(leaseId: string): Promise<LeaseContract | null> {
  try {
    const { data, error } = await supabase
      .from('lease_contracts')
      .select('*')
      .eq('lease_id', leaseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data as LeaseContract | null;
  } catch (err) {
    console.error('Erreur fetchLeaseContract:', err);
    return null;
  }
}

/**
 * Crée ou met à jour le contrat de bail (Propriétaire)
 */
export async function saveLeaseContract(params: Partial<LeaseContract> & { lease_id: string }): Promise<LeaseContract | null> {
  try {
    const existing = await fetchLeaseContract(params.lease_id);

    if (existing) {
      // Si déjà signé, on ne peut plus modifier directement (exige nouvel avenant ou version)
      if (existing.status === 'signe') {
        throw new Error('Ce contrat est déjà signé et scellé. Une modification exige un avenant.');
      }

      const { data, error } = await supabase
        .from('lease_contracts')
        .update({
          ...params,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data as LeaseContract;
    } else {
      // Création initiale
      const contractNumber = `BAIL-${new Date().getFullYear()}-${params.lease_id.slice(0, 6).toUpperCase()}`;
      const { data, error } = await supabase
        .from('lease_contracts')
        .insert({
          ...params,
          contract_number: contractNumber,
          version: 1,
          status: 'brouillon',
        })
        .select()
        .single();

      if (error) throw error;
      return data as LeaseContract;
    }
  } catch (err) {
    console.error('Erreur saveLeaseContract:', err);
    throw err;
  }
}

/**
 * Signe le contrat de bail (Propriétaire ou Locataire)
 */
export async function signLeaseContract(
  contractId: string,
  role: 'owner' | 'tenant',
  signatureSvg: string,
  signerName: string
): Promise<LeaseContract | null> {
  try {
    // 1. Récupérer l'état actuel du contrat
    const { data: current, error: fetchErr } = await supabase
      .from('lease_contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (fetchErr || !current) throw fetchErr || new Error('Contrat non trouvé');

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (role === 'owner') {
      updatePayload.owner_consent = true;
      updatePayload.owner_signed_at = new Date().toISOString();
      updatePayload.owner_signature_svg = signatureSvg;
      updatePayload.owner_signer_name = signerName;
      // Statut suivant
      updatePayload.status = current.tenant_signed_at ? 'signe' : 'en_attente_locataire';
    } else {
      updatePayload.tenant_consent = true;
      updatePayload.tenant_signed_at = new Date().toISOString();
      updatePayload.tenant_signature_svg = signatureSvg;
      updatePayload.tenant_signer_name = signerName;
      // Statut suivant
      updatePayload.status = current.owner_signed_at ? 'signe' : 'en_attente_proprietaire';
    }

    // Si les deux signatures sont désormais présentes : calcul du hash d'intégrité final
    if (
      (role === 'owner' && current.tenant_signed_at) ||
      (role === 'tenant' && current.owner_signed_at)
    ) {
      const integrityContent = `${current.contract_number}_${current.monthly_rent}_${current.start_date}_OWNER:${role === 'owner' ? signerName : current.owner_signer_name}_TENANT:${role === 'tenant' ? signerName : current.tenant_signer_name}`;
      updatePayload.document_hash = await calculateSha256(integrityContent);
    }

    const { data, error } = await supabase
      .from('lease_contracts')
      .update(updatePayload)
      .eq('id', contractId)
      .select()
      .single();

    if (error) throw error;
    return data as LeaseContract;
  } catch (err) {
    console.error('Erreur signLeaseContract:', err);
    throw err;
  }
}

/**
 * Récupère les états des lieux (entrée et sortie) d'un bail avec leurs items
 */
export async function fetchInspections(leaseId: string): Promise<PropertyInspection[]> {
  try {
    const { data: inspections, error } = await supabase
      .from('property_inspections')
      .select('*')
      .eq('lease_id', leaseId)
      .order('inspection_date', { ascending: false });

    if (error) throw error;
    if (!inspections || inspections.length === 0) return [];

    // Récupérer les items pour chaque inspection
    const inspectionIds = inspections.map(i => i.id);
    const { data: items, error: itemsError } = await supabase
      .from('property_inspection_items')
      .select('*')
      .in('inspection_id', inspectionIds)
      .order('display_order', { ascending: true });

    if (itemsError) throw itemsError;

    const itemsMap: Record<string, PropertyInspectionItem[]> = {};
    (items || []).forEach(it => {
      if (!itemsMap[it.inspection_id]) itemsMap[it.inspection_id] = [];
      itemsMap[it.inspection_id].push(it as PropertyInspectionItem);
    });

    return inspections.map(i => ({
      ...i,
      items: itemsMap[i.id] || [],
    })) as PropertyInspection[];
  } catch (err) {
    console.error('Erreur fetchInspections:', err);
    return [];
  }
}

/**
 * Crée un état des lieux (entrée ou sortie)
 */
export async function createInspection(
  leaseId: string,
  type: 'entree' | 'sortie',
  conductedById: string,
  waterMeter?: string,
  electricMeter?: string,
  keysCount = 1,
  keysDesc?: string,
  generalObs?: string
): Promise<PropertyInspection | null> {
  try {
    const { data, error } = await supabase
      .from('property_inspections')
      .insert({
        lease_id: leaseId,
        inspection_type: type,
        conducted_by_id: conductedById,
        water_meter_reading: waterMeter || null,
        electric_meter_reading: electricMeter || null,
        keys_handed_count: keysCount,
        keys_description: keysDesc || null,
        general_observations: generalObs || null,
        status: 'brouillon',
      })
      .select()
      .single();

    if (error) throw error;
    return data as PropertyInspection;
  } catch (err) {
    console.error('Erreur createInspection:', err);
    throw err;
  }
}

/**
 * Ajoute un constat de pièce dans l'état des lieux
 */
export async function addInspectionItem(
  inspectionId: string,
  roomName: string,
  elementName: string,
  conditionState: 'neuf' | 'bon' | 'moyen' | 'mauvais' | 'degrade',
  comment?: string,
  photoPaths: string[] = []
): Promise<PropertyInspectionItem | null> {
  try {
    const { data, error } = await supabase
      .from('property_inspection_items')
      .insert({
        inspection_id: inspectionId,
        room_name: roomName,
        element_name: elementName,
        condition_state: conditionState,
        comment: comment || null,
        photo_paths: photoPaths,
      })
      .select()
      .single();

    if (error) throw error;
    return data as PropertyInspectionItem;
  } catch (err) {
    console.error('Erreur addInspectionItem:', err);
    throw err;
  }
}

/**
 * Confirme l'état des lieux contradictoirement
 */
export async function confirmInspection(
  inspectionId: string,
  role: 'owner' | 'tenant',
  signatureSvg: string,
  reserves?: string
): Promise<PropertyInspection | null> {
  try {
    const { data: current, error: fetchErr } = await supabase
      .from('property_inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();

    if (fetchErr || !current) throw fetchErr || new Error('État des lieux non trouvé');

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (role === 'owner') {
      updatePayload.owner_confirmed_at = new Date().toISOString();
      updatePayload.owner_signature_svg = signatureSvg;
      updatePayload.status = current.tenant_confirmed_at ? 'valide' : 'en_attente_validation';
    } else {
      updatePayload.tenant_confirmed_at = new Date().toISOString();
      updatePayload.tenant_signature_svg = signatureSvg;
      if (reserves && reserves.trim()) {
        updatePayload.tenant_reserves = reserves.trim();
        updatePayload.status = 'conteste';
      } else {
        updatePayload.status = current.owner_confirmed_at ? 'valide' : 'en_attente_validation';
      }
    }

    const { data, error } = await supabase
      .from('property_inspections')
      .update(updatePayload)
      .eq('id', inspectionId)
      .select()
      .single();

    if (error) throw error;
    return data as PropertyInspection;
  } catch (err) {
    console.error('Erreur confirmInspection:', err);
    throw err;
  }
}
