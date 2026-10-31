import { supabase, LeaseContract, PropertyInspection, PropertyInspectionItem } from './supabase';

export type SignedDocumentType = 'lease_contract' | 'property_inspection';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

export async function sealSignedDocumentPdf(
  documentType: SignedDocumentType,
  documentId: string,
  pdfBytes: ArrayBuffer
): Promise<string> {
  const { data, error } = await supabase.rpc('seal_signed_document_pdf', {
    p_document_type: documentType,
    p_document_id: documentId,
    p_pdf_base64: arrayBufferToBase64(pdfBytes),
  });
  if (error) throw error;
  return data as string;
}

export interface SignedPdfVerification {
  verified: boolean;
  pdf_sha256: string | null;
  document_hash: string | null;
  sealed_at: string | null;
}

export async function verifySignedDocumentPdf(
  documentType: SignedDocumentType,
  documentId: string
): Promise<SignedPdfVerification> {
  const { data, error } = await supabase.rpc('verify_signed_document_pdf', {
    p_document_type: documentType,
    p_document_id: documentId,
  });
  if (error) throw error;
  return data as SignedPdfVerification;
}

export async function downloadSignedDocumentPdf(
  documentType: SignedDocumentType,
  documentId: string
): Promise<Blob> {
  const { data, error } = await supabase.rpc('download_signed_document_pdf', {
    p_document_type: documentType,
    p_document_id: documentId,
  });
  if (error) throw error;
  const binary = atob(data as string);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

export function savePdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  signatureData: string
): Promise<LeaseContract | null> {
  try {
    const { data, error } = await supabase.rpc('sign_lease_contract', {
      p_contract_id: contractId,
      p_signature_data: signatureData,
    });
    if (error) throw error;
    return data as LeaseContract;
  } catch (err: any) {
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
  signatureData: string,
  reserves?: string
): Promise<PropertyInspection | null> {
  try {
    const { data, error } = await supabase.rpc('confirm_property_inspection', {
      p_inspection_id: inspectionId,
      p_signature_data: signatureData,
      p_tenant_reserves: reserves?.trim() || null,
    });
    if (error) throw error;
    return data as PropertyInspection;
  } catch (err: any) {
    console.error('Erreur confirmInspection:', err);
    throw err;
  }
}
