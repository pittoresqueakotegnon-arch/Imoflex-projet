import { jsPDF } from 'jspdf';
import { formatMontant } from './utils';

export interface QuittanceData {
  id: string; // ID du paiement ou de la quittance
  fedapay_transaction_id?: string | null;
  amount: number;
  date: Date;
  periodLabel: string;
  propertyName: string;
  propertyLocation?: string | null;
  tenantName: string;
  ownerName: string;
  operator: string;
}

const OPERATOR_LABELS: Record<string, string> = {
  mtn: 'MTN Mobile Money',
  moov: 'Moov Africa',
  celtiis: 'Celtiis Pay',
};

export const generateQuittancePDF = (data: QuittanceData) => {
  // Create a new PDF document (A4 size, portrait)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Set default font to Helvetica
  doc.setFont('helvetica');

  // --- HEADER ---
  // ImoFlex Logo (Text-based)
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(23, 19, 43); // #17132B
  doc.text('Imo', 20, 30);
  doc.setTextColor(123, 63, 228); // #7B3FE4
  doc.text('Flex', 34, 30);

  // Document Title
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text('QUITTANCE DE LOYER', pageWidth / 2, 30, { align: 'center' });

  // Date and Reference
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(data.date);
  doc.text(`Fait le : ${formattedDate}`, pageWidth - 20, 25, { align: 'right' });
  doc.text(`Ref : ${data.id.slice(0, 8).toUpperCase()}`, pageWidth - 20, 31, { align: 'right' });

  // Draw a separator line
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.line(20, 40, pageWidth - 20, 40);

  // --- PARTIES INFORMATION ---
  let cursorY = 55;

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  // Bailleur
  doc.setFont('helvetica', 'bold');
  doc.text('BAILLEUR / AGENCE :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.ownerName, 70, cursorY);
  
  cursorY += 10;
  
  // Locataire
  doc.setFont('helvetica', 'bold');
  doc.text('LOCATAIRE :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.tenantName, 70, cursorY);

  cursorY += 10;

  // Bien loué
  doc.setFont('helvetica', 'bold');
  doc.text('BIEN LOUE :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  const locationText = data.propertyLocation ? ` - ${data.propertyLocation}` : '';
  doc.text(`${data.propertyName}${locationText}`, 70, cursorY);

  // Draw another separator line
  cursorY += 15;
  doc.line(20, cursorY, pageWidth - 20, cursorY);
  cursorY += 15;

  // --- PAYMENT DETAILS ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILS DU PAIEMENT', 20, cursorY);
  cursorY += 15;

  doc.setFontSize(12);
  
  // Période
  doc.setFont('helvetica', 'bold');
  doc.text('Periode concernee :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.text(data.periodLabel, 80, cursorY);
  
  cursorY += 10;
  
  // Montant
  doc.setFont('helvetica', 'bold');
  doc.text('Montant paye :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(123, 63, 228); // #7B3FE4
  doc.text(`${formatMontant(data.amount)} FCFA`, 80, cursorY);
  doc.setTextColor(0, 0, 0);
  
  cursorY += 10;

  // Moyen de paiement
  doc.setFont('helvetica', 'bold');
  doc.text('Moyen de paiement :', 20, cursorY);
  doc.setFont('helvetica', 'normal');
  const opLabel = OPERATOR_LABELS[data.operator] || data.operator;
  doc.text(`Mobile Money (${opLabel})`, 80, cursorY);

  cursorY += 10;

  // Ref transaction si dispo
  if (data.fedapay_transaction_id) {
    doc.setFont('helvetica', 'bold');
    doc.text('Ref. Transaction :', 20, cursorY);
    doc.setFont('helvetica', 'normal');
    doc.text(data.fedapay_transaction_id.toString(), 80, cursorY);
    cursorY += 10;
  }

  // --- FOOTER ---
  cursorY += 20;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  
  const footerText = "Ce document atteste du paiement du montant susmentionne pour la periode indiquee. Il a ete genere de maniere automatique suite a une transaction validee sur la plateforme ImoFlex.";
  
  // split text to fit page width
  const splitTitle = doc.splitTextToSize(footerText, pageWidth - 40);
  doc.text(splitTitle, 20, cursorY);

  cursorY += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Genere par ImoFlex — Trouvez. Choisissez. Habitez.', pageWidth / 2, 280, { align: 'center' });

  // Save the PDF
  doc.save(`Quittance_ImoFlex_${data.id.slice(0, 8).toUpperCase()}.pdf`);
};
