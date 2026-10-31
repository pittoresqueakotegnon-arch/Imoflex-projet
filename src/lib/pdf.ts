import { jsPDF } from 'jspdf';
import { supabase } from './supabase';
import { generateQrCodeDataUrl } from './pdfStamp';

/** Client values identify the payment only; all displayed facts come from the server. */
export interface QuittanceData {
  id: string;
  fedapay_transaction_id?: string | null;
  amount: number;
  date: Date;
  periodLabel: string;
  propertyName: string;
  propertyLocation?: string | null;
  tenantName: string;
  tenantPhone?: string | null;
  tenantSignatureImage?: string | null;
  ownerName: string;
  ownerPhone?: string | null;
  ownerId?: string;
  ownerSignatureImage?: string | null;
  ownerSignedAt?: string | null;
  ownerVerificationStatus?: string;
  operator: string;
  rentAmount?: number;
  chargesAmount?: number;
  remainingDue?: number;
  includeDirectorSignature?: boolean;
  directorName?: string;
  directorTitle?: string;
  directorSignatureImage?: string | null;
  verificationUrl?: string;
}

interface PaymentReceiptFacts {
  payment_id: string;
  amount: number;
  status: string;
  operator: string | null;
  fedapay_transaction_id: string | null;
  created_at: string;
  period_month: number;
  period_year: number;
  amount_due: number;
  amount_paid: number;
  remaining_due: number;
  property_name: string;
  property_location: string | null;
  tenant_name: string;
  tenant_phone: string | null;
  owner_name: string;
  owner_phone: string | null;
  owner_verification_status: string;
  record_sha256: string;
}

function formatFCFA(value: number): string {
  const rounded = Math.round(value || 0).toString();
  return `${rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;
}

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const generateQuittancePDF = async (data: QuittanceData): Promise<jsPDF> => {
  const { data: facts, error } = await supabase.rpc('get_payment_receipt_data', {
    p_payment_id: data.id,
  });
  if (error) throw error;
  const payment = facts as PaymentReceiptFacts | null;
  if (!payment || payment.payment_id !== data.id || payment.status !== 'valide') {
    throw new Error('Le serveur ne confirme pas ce paiement. Aucun reçu ne peut être généré.');
  }
  if (!/^[0-9a-f]{64}$/i.test(payment.record_sha256)) {
    throw new Error('Empreinte des faits de paiement invalide.');
  }

  const reference = `QUIT-${payment.payment_id.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const origin = typeof window === 'undefined' ? 'https://imoflex.immo' : window.location.origin;
  const verificationUrl = data.verificationUrl || `${origin}/verifier-document?ref=${reference}&type=quittance`;
  const qrCode = await generateQrCodeDataUrl(verificationUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = width - margin * 2;
  const purple: [number, number, number] = [109, 40, 217];
  const dark: [number, number, number] = [24, 24, 27];
  const muted: [number, number, number] = [100, 116, 139];
  const border: [number, number, number] = [226, 232, 240];
  const light: [number, number, number] = [248, 250, 252];
  const period = `${MONTHS[payment.period_month - 1] || ''} ${payment.period_year}`.trim();
  const date = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(payment.created_at));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...dark);
  doc.text('Imo', margin, 25);
  doc.setTextColor(...purple);
  doc.text('Flex', margin + 14, 25);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Reçu établi depuis un paiement confirmé dans ImoFlex', margin, 31);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(reference, width - margin, 23, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(date, width - margin, 29, { align: 'right' });
  doc.setDrawColor(...border);
  doc.line(margin, 37, width - margin, 37);

  doc.setFillColor(...light);
  doc.roundedRect(margin, 44, contentWidth, 15, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...purple);
  doc.text('REÇU DE PAIEMENT', margin + 6, 53);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(`Période : ${period}`, width - margin - 6, 53, { align: 'right' });

  let y = 71;
  const label = (title: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(title.toUpperCase(), margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(value || '—', margin, y + 6);
    y += 16;
  };
  label('Propriétaire enregistré', payment.owner_name);
  label('Locataire enregistré', payment.tenant_name);
  label('Bien concerné', payment.property_name);
  if (payment.property_location) label('Adresse', payment.property_location);

  y += 3;
  doc.setDrawColor(...border);
  doc.line(margin, y, width - margin, y);
  y += 10;
  const paymentRows: Array<[string, string]> = [
    ['Paiement confirmé', formatFCFA(payment.amount)],
    ['Loyer et charges dus pour la période', formatFCFA(payment.amount_due)],
    ['Total enregistré comme payé pour la période', formatFCFA(payment.amount_paid)],
    ['Solde restant enregistré', formatFCFA(payment.remaining_due)],
  ];
  for (const [title, amount] of paymentRows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.text(amount, width - margin, y, { align: 'right' });
    doc.setDrawColor(...border);
    doc.line(margin, y + 4, width - margin, y + 4);
    y += 12;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('OPÉRATEUR', margin, y + 3);
  doc.text('RÉFÉRENCE DE TRANSACTION', margin + 65, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(payment.operator || 'Non indiqué', margin, y + 9);
  doc.text(payment.fedapay_transaction_id || 'Non disponible', margin + 65, y + 9);

  const footerY = height - 36;
  doc.setDrawColor(...border);
  doc.line(margin, footerY - 4, width - margin, footerY - 4);
  if (qrCode) doc.addImage(qrCode, 'PNG', margin, footerY, 18, 18, undefined, 'FAST');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...dark);
  doc.text('Vérification du paiement dans le registre ImoFlex', margin + 23, footerY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...muted);
  doc.text(`Référence : ${reference}`, margin + 23, footerY + 9);
  doc.text(`SHA-256 des faits de paiement enregistrés : ${payment.record_sha256}`, margin + 23, footerY + 14);
  doc.text('Cette empreinte porte sur les données du registre, pas sur les octets de ce PDF.', margin + 23, footerY + 18);
  doc.text('Ce reçu ne contient pas de signature cryptographique des parties.', margin + 23, footerY + 22);

  const fileName = `Recu_Paiement_${reference}_${period.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
  return doc;
};
