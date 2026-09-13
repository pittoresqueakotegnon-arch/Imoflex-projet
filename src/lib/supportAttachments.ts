import { supabase } from './supabase';

const BUCKET = 'support_attachments';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type SupportAttachmentMessage = {
  screenshot_url?: string | null;
};

export function assertSupportedSupportImage(file: File): string {
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Format non pris en charge. Utilisez JPG, PNG ou WebP.');
  }
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('L’image doit peser au maximum 5 Mo.');
  }
  return extension;
}

export async function uploadSupportAttachment(
  path: string,
  file: File,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
}

export async function resolveSupportAttachmentUrl(pathOrUrl?: string | null): Promise<string | undefined> {
  if (!pathOrUrl) return undefined;
  // Les URLs historiques publiques restent visibles tant que la migration SQL
  // n'a pas transformé leur valeur en chemin de bucket.
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(pathOrUrl, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export async function resolveSupportMessageAttachments<T extends SupportAttachmentMessage>(messages: T[]): Promise<T[]> {
  return Promise.all(messages.map(async (message) => {
    if (!message.screenshot_url) return message;
    try {
      const signedUrl = await resolveSupportAttachmentUrl(message.screenshot_url);
      return { ...message, screenshot_url: signedUrl };
    } catch {
      // Un fichier supprimé ou antérieur à la migration ne doit pas empêcher
      // la lecture des messages textuels de la conversation.
      return { ...message, screenshot_url: undefined };
    }
  }));
}
