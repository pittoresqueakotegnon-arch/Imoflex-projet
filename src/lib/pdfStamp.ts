import QRCode from 'qrcode';
import { supabase } from './supabase';

export interface DirectorConfig {
  name: string;
  title: string;
  signatureUrl: string | null;
  enabled: boolean;
}

export const DEFAULT_DIRECTOR_CONFIG: DirectorConfig = {
  name: 'Alain TOSSOU',
  title: 'Directeur Général & Fondateur',
  signatureUrl: null,
  enabled: true,
};

/**
 * Génère le cachet rond officiel ImoFlex en haute résolution via HTML5 Canvas.
 * Le cachet arbore la charte violette d'ImoFlex (#7B3FE4), le nom de la plateforme,
 * et la mention officielle « Gestion locative – Bénin ».
 */
export const generateOfficialStampDataUrl = (options?: {
  refCode?: string;
  date?: Date;
  statusText?: string;
}): string => {
  if (typeof document === 'undefined') {
    return '';
  }

  const canvas = document.createElement('canvas');
  const size = 400; // 400x400 pour un rendu haute résolution (Retina)
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx = size / 2;
  const cy = size / 2;
  const primaryColor = '#7B3FE4';
  const textColor = '#5B21B6';
  const dateStr = (options?.date || new Date()).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const ref = options?.refCode ? options.refCode.toUpperCase() : 'IMX-OFFICIEL';
  const status = options?.statusText || 'CERTIFIÉ CONFORME';

  ctx.clearRect(0, 0, size, size);

  // Cercle extérieur épais
  ctx.beginPath();
  ctx.arc(cx, cy, 185, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // Deuxième cercle fin extérieur
  ctx.beginPath();
  ctx.arc(cx, cy, 175, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // Cercle intérieur avec pointillé de sécurité
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = primaryColor;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // Fonction pour dessiner du texte courbé sur un arc
  const drawCurvedText = (
    text: string,
    radius: number,
    startAngle: number,
    endAngle: number,
    inward: boolean = true
  ) => {
    ctx.save();
    ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const characters = text.split('');
    const angleRange = endAngle - startAngle;
    const step = angleRange / (characters.length - 1 || 1);

    characters.forEach((char, i) => {
      const angle = startAngle + i * step;
      ctx.save();
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.translate(x, y);
      ctx.rotate(angle + (inward ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });

    ctx.restore();
  };

  // Texte haut courbé : « ★ IMOFLEX • GESTION LOCATIVE ★ »
  drawCurvedText('★ IMOFLEX • GESTION LOCATIVE ★', 148, -Math.PI * 0.82, -Math.PI * 0.18, true);

  // Texte bas courbé : « ★ RÉPUBLIQUE DU BÉNIN ★ »
  drawCurvedText('★ RÉPUBLIQUE DU BÉNIN ★', 148, Math.PI * 0.80, Math.PI * 0.20, false);

  // Éléments du centre
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Petite icône ou symbole de toit au centre haut
  ctx.beginPath();
  ctx.moveTo(cx, cy - 65);
  ctx.lineTo(cx - 24, cy - 45);
  ctx.lineTo(cx + 24, cy - 45);
  ctx.closePath();
  ctx.fillStyle = primaryColor;
  ctx.fill();

  // Nom central "ImoFlex"
  ctx.font = '900 28px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#17132B';
  ctx.fillText('Imo', cx - 22, cy - 25);
  ctx.fillStyle = primaryColor;
  ctx.fillText('Flex', cx + 24, cy - 25);

  // Mention "Gestion locative – Bénin"
  ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText('GESTION LOCATIVE — BÉNIN', cx, cy - 5);

  // Ligne de séparation centrale
  ctx.beginPath();
  ctx.moveTo(cx - 70, cy + 8);
  ctx.lineTo(cx + 70, cy + 8);
  ctx.lineWidth = 1;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();

  // Cadre statut "CERTIFIÉ CONFORME"
  ctx.fillStyle = primaryColor;
  ctx.beginPath();
  const badgeW = 150;
  const badgeH = 22;
  const badgeX = cx - badgeW / 2;
  const badgeY = cy + 16;
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();

  ctx.font = 'bold 10px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(status, cx, cy + 27);

  // Date et Réf sous le statut
  ctx.font = 'bold 9px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#374151';
  ctx.fillText(`Réf: ${ref}`, cx, cy + 50);

  ctx.font = '8px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(`Fait le ${dateStr}`, cx, cy + 64);

  // Étoiles de sécurité décoratives latérales
  ctx.font = '12px Arial, sans-serif';
  ctx.fillStyle = primaryColor;
  ctx.fillText('✦', cx - 95, cy);
  ctx.fillText('✦', cx + 95, cy);

  ctx.restore();

  return canvas.toDataURL('image/png');
};

/**
 * Génère le QR Code officiel de vérification d'authenticité.
 */
export const generateQrCodeDataUrl = async (verificationUrl: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(verificationUrl, {
      width: 200,
      margin: 1,
      color: {
        dark: '#17132B',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Erreur génération QR code:', err);
    return '';
  }
};

/**
 * Récupère la configuration de la signature du Directeur / Fondateur.
 * Combine les paramètres distants d'app_config (si existants) et le stockage local.
 */
export const getDirectorConfig = async (): Promise<DirectorConfig> => {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', [
        'director_name',
        'director_title',
        'director_signature_url',
        'director_signature_enabled',
      ]);

    if (!error && data && data.length > 0) {
      const map = new Map(data.map((r) => [r.key, r.value]));
      return {
        name: map.get('director_name') || DEFAULT_DIRECTOR_CONFIG.name,
        title: map.get('director_title') || DEFAULT_DIRECTOR_CONFIG.title,
        signatureUrl: map.get('director_signature_url') || localStorage.getItem('imoflex_director_signature') || null,
        enabled: map.get('director_signature_enabled') !== 'false',
      };
    }
  } catch {
    // Fallback local
  }

  const localSig = typeof localStorage !== 'undefined' ? localStorage.getItem('imoflex_director_signature') : null;
  const localName = typeof localStorage !== 'undefined' ? localStorage.getItem('imoflex_director_name') : null;
  const localTitle = typeof localStorage !== 'undefined' ? localStorage.getItem('imoflex_director_title') : null;

  return {
    name: localName || DEFAULT_DIRECTOR_CONFIG.name,
    title: localTitle || DEFAULT_DIRECTOR_CONFIG.title,
    signatureUrl: localSig || DEFAULT_DIRECTOR_CONFIG.signatureUrl,
    enabled: true,
  };
};

/**
 * Enregistre la configuration de la signature du Directeur / Fondateur.
 */
export const saveDirectorConfig = async (config: DirectorConfig): Promise<void> => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('imoflex_director_name', config.name);
    localStorage.setItem('imoflex_director_title', config.title);
    if (config.signatureUrl) {
      localStorage.setItem('imoflex_director_signature', config.signatureUrl);
    }
    localStorage.setItem('imoflex_director_signature_enabled', String(config.enabled));
  }

  // Tenter de synchroniser sur app_config si l'utilisateur est admin
  try {
    const updates = [
      { key: 'director_name', value: config.name },
      { key: 'director_title', value: config.title },
      { key: 'director_signature_url', value: config.signatureUrl || '' },
      { key: 'director_signature_enabled', value: String(config.enabled) },
    ];
    for (const item of updates) {
      await supabase.from('app_config').upsert(item, { onConflict: 'key' });
    }
  } catch {
    // Les non-admins utiliseront le cache local/défaut
  }
};

/**
 * Récupère la signature enregistrée pour un utilisateur (Propriétaire ou Locataire).
 */
export const getUserSignature = (userId?: string): string | null => {
  if (!userId || typeof localStorage === 'undefined') return null;
  return localStorage.getItem(`imoflex_user_signature_${userId}`) || null;
};

/**
 * Enregistre la signature manuscrite d'un utilisateur.
 */
export const saveUserSignature = async (
  userId: string,
  signatureDataUrl: string
): Promise<void> => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`imoflex_user_signature_${userId}`, signatureDataUrl);
  }

  try {
    await supabase.auth.updateUser({
      data: { signature_url: signatureDataUrl },
    });
  } catch {
    // silencieux
  }

  try {
    await supabase
      .from('users')
      .update({ signature_url: signatureDataUrl } as any)
      .eq('id', userId);
  } catch {
    // Toléré si la colonne n'est pas encore ajoutée
  }
};

