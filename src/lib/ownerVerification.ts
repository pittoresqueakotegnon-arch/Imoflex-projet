import { supabase, OwnerIdentityDocumentType, OwnerVerificationStatus, OwnerVerificationSummary } from './supabase';

export const OWNER_VERIFICATION_BUCKET = 'owner-verification-documents';
export const MAX_OWNER_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_OWNER_VERIFICATION_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const OWNER_VERIFICATION_STATUS_META: Record<OwnerVerificationStatus, {
  label: string;
  description: string;
}> = {
  non_verifie: {
    label: 'Identité non vérifiée',
    description: 'La vérification de votre identité est requise avant votre premier retrait.',
  },
  en_attente: {
    label: 'Vérification en attente',
    description: 'Votre dossier est en cours d’examen par l’équipe ImoFlex.',
  },
  verifie: {
    label: 'Propriétaire vérifié',
    description: 'Votre identité est validée et vos retraits sont autorisés.',
  },
  refuse: {
    label: 'Vérification à corriger',
    description: 'Votre dossier doit être corrigé puis soumis à nouveau.',
  },
};

const defaultSummary: OwnerVerificationSummary = {
  verification_status: 'non_verifie',
};

export function getFileExtension(file: File): string | null {
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return byMime[file.type] ?? null;
}

export function validateVerificationFile(file: File | null, label: string): string | null {
  if (!file) return `${label} est requis.`;
  if (!ACCEPTED_OWNER_VERIFICATION_FILE_TYPES.includes(file.type as typeof ACCEPTED_OWNER_VERIFICATION_FILE_TYPES[number])) {
    return `${label} doit être une image JPG, PNG, WEBP ou un PDF.`;
  }
  if (file.size < 1 || file.size > MAX_OWNER_VERIFICATION_FILE_SIZE) {
    return `${label} ne doit pas dépasser 10 Mo.`;
  }
  return null;
}

export async function fetchMyOwnerVerification(): Promise<OwnerVerificationSummary> {
  const { data, error } = await supabase.rpc('get_my_owner_verification');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as OwnerVerificationSummary | null) ?? defaultSummary;
}

interface DraftResult {
  request_id: string;
  fee_required: boolean;
  fee_amount: number;
  fee_status: OwnerVerificationSummary['fee_status'];
}

export async function submitOwnerVerification(params: {
  ownerId: string;
  legalName: string;
  documentType: OwnerIdentityDocumentType;
  documentNumber: string;
  front: File;
  back: File;
}): Promise<void> {
  const frontError = validateVerificationFile(params.front, 'Le recto de la pièce');
  const backError = validateVerificationFile(params.back, 'Le verso ou la seconde page');
  const validationError = frontError ?? backError;
  if (validationError) throw new Error(validationError);

  const frontExtension = getFileExtension(params.front);
  const backExtension = getFileExtension(params.back);
  if (!frontExtension || !backExtension) throw new Error('Format de document non autorisé.');

  const { data: draftData, error: draftError } = await supabase.rpc('create_owner_verification_draft', {
    p_legal_name: params.legalName,
    p_document_type: params.documentType,
    p_document_number: params.documentNumber,
  });
  if (draftError) throw draftError;

  const draft = (Array.isArray(draftData) ? draftData[0] : draftData) as DraftResult | null;
  if (!draft?.request_id) throw new Error('Impossible de préparer le dossier de vérification.');
  if (draft.fee_required && !['paid', 'waived'].includes(draft.fee_status || '')) {
    throw new Error('Le paiement de la vérification doit être réglé avant la soumission.');
  }

  const basePath = `${params.ownerId}/${draft.request_id}`;
  const frontPath = `${basePath}/identity_front.${frontExtension}`;
  const backPath = `${basePath}/identity_back.${backExtension}`;
  const bucket = supabase.storage.from(OWNER_VERIFICATION_BUCKET);

  // Réessayer après un upload interrompu ne nécessite pas une nouvelle demande.
  await bucket.remove([frontPath, backPath]);

  const [frontUpload, backUpload] = await Promise.all([
    bucket.upload(frontPath, params.front, { contentType: params.front.type, upsert: false }),
    bucket.upload(backPath, params.back, { contentType: params.back.type, upsert: false }),
  ]);
  if (frontUpload.error || backUpload.error) {
    await bucket.remove([frontPath, backPath]);
    throw frontUpload.error || backUpload.error || new Error('Impossible d’envoyer les documents.');
  }

  const { error: submitError } = await supabase.rpc('submit_owner_verification', {
    p_request_id: draft.request_id,
    p_identity_front_path: frontPath,
    p_identity_back_path: backPath,
  });
  if (submitError) {
    // Le brouillon reste accessible : l'utilisateur peut corriger puis envoyer.
    throw submitError;
  }
}

export async function getPrivateVerificationDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(OWNER_VERIFICATION_BUCKET)
    .createSignedUrl(path, 10 * 60);
  if (error || !data?.signedUrl) throw error || new Error('Impossible d’ouvrir ce document.');
  return data.signedUrl;
}
