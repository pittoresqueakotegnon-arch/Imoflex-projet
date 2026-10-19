import { jsPDF } from 'jspdf';

export interface InspectionItemPdfData {
  roomName: string;
  elementName: string;
  conditionState: string;
  comment?: string | null;
  photoCount?: number;
}

export interface InspectionPdfData {
  inspectionType: 'entree' | 'sortie';
  inspectionDate: string;
  contractNumber?: string;
  
  // Parties
  ownerName: string;
  ownerSignatureImage?: string | null;
  ownerConfirmedAt?: string | null;
  
  tenantName: string;
  tenantSignatureImage?: string | null;
  tenantConfirmedAt?: string | null;
  
  // Logement
  propertyName: string;
  propertyAddress: string;
  
  // Compteurs & clés
  waterMeterReading?: string | null;
  electricMeterReading?: string | null;
  keysHandedCount: number;
  keysDescription?: string | null;
  generalObservations?: string | null;
  tenantReserves?: string | null;
  
  // Éléments
  items: InspectionItemPdfData[];
  
  // Intégrité
  documentHash?: string | null;
}

const CONDITION_LABELS: Record<string, string> = {
  neuf: 'NEUF',
  bon: 'BON ÉTAT',
  moyen: 'ÉTAT D’USAGE',
  mauvais: 'MAUVAIS ÉTAT',
  degrade: 'DÉGRADÉ',
};

export const generateInspectionReportPDF = (data: InspectionPdfData): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      drawHeaderSmall();
    }
  };

  const drawHeaderSmall = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`ImoFlex — État des lieux (${data.inspectionType === 'entree' ? 'Entrée' : 'Sortie'})`, margin, 12);
    doc.text(data.propertyName, pageWidth - margin, 12, { align: 'right' });
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, 14, pageWidth - margin, 14);
  };

  // --- ENTÊTE PRINCIPALE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(23, 19, 43);
  doc.text('Imo', margin, y + 8);
  doc.setTextColor(123, 63, 228);
  doc.text('Flex', margin + 14, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110, 110, 110);
  doc.text(`Date : ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(data.inspectionDate))}`, pageWidth - margin, y + 6, { align: 'right' });

  y += 18;

  // Titre encadré
  const typeLabel = data.inspectionType === 'entree' ? "ÉTAT DES LIEUX CONTRADICTOIRE D'ENTRÉE" : "ÉTAT DES LIEUX CONTRADICTOIRE DE SORTIE";
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');
  doc.setDrawColor(123, 63, 228);
  doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(23, 19, 43);
  doc.text(typeLabel, pageWidth / 2, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text("Établi conformément à la loi béninoise n° 2022-30 relative au bail d'habitation", pageWidth / 2, y + 13, { align: 'center' });

  y += 24;

  // --- LOGEMENT & PARTIES ---
  doc.setFillColor(252, 252, 254);
  doc.setDrawColor(220, 220, 230);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`LOGEMENT : ${data.propertyName}`, margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Adresse : ${data.propertyAddress}`, margin + 4, y + 11);
  doc.text(`Bailleur : ${data.ownerName}`, margin + 4, y + 16);
  doc.text(`Preneur : ${data.tenantName}`, margin + contentWidth / 2, y + 16);
  if (data.contractNumber) {
    doc.text(`Contrat de bail associé : ${data.contractNumber}`, margin + 4, y + 21);
  }

  y += 30;

  // --- COMPTEURS ET CLÉS ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(123, 63, 228);
  doc.text("1. RELEVÉS DES COMPTEURS & REMISE DES CLÉS", margin, y);
  y += 5;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 220, 230);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text(`Compteur Eau (SONEB) :`, margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(data.waterMeterReading ? `${data.waterMeterReading} m³` : 'Non renseigné', margin + 45, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text(`Compteur Électricité (SBEÉ) :`, margin + 4, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(data.electricMeterReading ? `${data.electricMeterReading} kWh / Index` : 'Non renseigné', margin + 45, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.text(`Nombre de clés remises :`, margin + contentWidth / 2, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.keysHandedCount} clé(s)${data.keysDescription ? ' (' + data.keysDescription + ')' : ''}`, margin + contentWidth / 2 + 38, y + 6);

  y += 24;

  // --- TABLEAU DES CONSTATS PAR PIÈCE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(123, 63, 228);
  doc.text("2. CONSTAT DÉTAILLÉ PAR PIÈCE & ÉQUIPEMENT", margin, y);
  y += 5;

  // En-tête tableau
  doc.setFillColor(240, 238, 252);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(23, 19, 43);
  doc.text("PIÈCE", margin + 3, y + 5);
  doc.text("ÉLÉMENT VÉRIFIÉ", margin + 35, y + 5);
  doc.text("ÉTAT CONSTATÉ", margin + 85, y + 5);
  doc.text("OBSERVATIONS & PHOTOS", margin + 125, y + 5);
  y += 7;

  // Lignes
  data.items.forEach((item, index) => {
    checkPageBreak(12);

    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : 250, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.rect(margin, y, contentWidth, 8, 'F');
    doc.setDrawColor(240, 240, 245);
    doc.line(margin, y + 8, margin + contentWidth, y + 8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 30, 30);
    doc.text(item.roomName, margin + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.text(item.elementName, margin + 35, y + 5);

    // État avec couleur
    const stateLabel = CONDITION_LABELS[item.conditionState] || item.conditionState.toUpperCase();
    if (item.conditionState === 'neuf' || item.conditionState === 'bon') {
      doc.setTextColor(16, 185, 129); // vert
    } else if (item.conditionState === 'moyen') {
      doc.setTextColor(217, 119, 6); // orange
    } else {
      doc.setTextColor(239, 68, 68); // rouge
    }
    doc.setFont('helvetica', 'bold');
    doc.text(stateLabel, margin + 85, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const obs = item.comment || (item.photoCount ? `[${item.photoCount} photo(s) horodatée(s)]` : 'RAS');
    doc.text(doc.splitTextToSize(obs, contentWidth - 128), margin + 125, y + 5);

    y += 8;
  });

  y += 4;

  // --- OBSERVATIONS GÉNÉRALES & RÉSERVES ---
  if (data.generalObservations || data.tenantReserves) {
    checkPageBreak(25);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(23, 19, 43);
    doc.text("3. REMARQUES GÉNÉRALES & RÉSERVES DU LOCATAIRE", margin, y);
    y += 5;

    if (data.generalObservations) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(`Observations générales : ${data.generalObservations}`, contentWidth);
      doc.text(lines, margin + 2, y);
      y += lines.length * 4 + 2;
    }

    if (data.tenantReserves) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(220, 38, 38);
      doc.text("Réserves formulées par le locataire :", margin + 2, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const resLines = doc.splitTextToSize(data.tenantReserves, contentWidth - 4);
      doc.text(resLines, margin + 4, y);
      y += resLines.length * 4 + 3;
    }
  }

  // --- SIGNATURES CONTRADICTOIRES ---
  checkPageBreak(46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(23, 19, 43);
  doc.text("ACCORD CONTRADICTOIRE & SIGNATURES :", margin, y);
  y += 5;

  const colWidth = (contentWidth - 6) / 2;

  // Propriétaire
  doc.setDrawColor(210, 210, 220);
  doc.setFillColor(252, 252, 254);
  doc.roundedRect(margin, y, colWidth, 38, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text("LE BAILLEUR (Propriétaire)", margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Nom: ${data.ownerName}`, margin + 4, y + 10);

  if (data.ownerConfirmedAt) {
    const d = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.ownerConfirmedAt));
    doc.setTextColor(16, 185, 129);
    doc.text(`✓ Confirmé contradictoirement le ${d}`, margin + 4, y + 14);
    if (data.ownerSignatureImage) {
      try {
        doc.addImage(data.ownerSignatureImage, 'PNG', margin + 4, y + 16, colWidth - 8, 20, undefined, 'FAST');
      } catch {
        doc.text("[Signature enregistrée]", margin + 4, y + 22);
      }
    }
  } else {
    doc.setTextColor(239, 68, 68);
    doc.text("En attente de confirmation", margin + 4, y + 14);
  }

  // Locataire
  doc.setDrawColor(210, 210, 220);
  doc.setFillColor(252, 252, 254);
  doc.roundedRect(margin + colWidth + 6, y, colWidth, 38, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text("LE PRENEUR (Locataire)", margin + colWidth + 10, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Nom: ${data.tenantName}`, margin + colWidth + 10, y + 10);

  if (data.tenantConfirmedAt) {
    const d = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.tenantConfirmedAt));
    doc.setTextColor(16, 185, 129);
    doc.text(`✓ Confirmé contradictoirement le ${d}`, margin + colWidth + 10, y + 14);
    if (data.tenantSignatureImage) {
      try {
        doc.addImage(data.tenantSignatureImage, 'PNG', margin + colWidth + 10, y + 16, colWidth - 8, 20, undefined, 'FAST');
      } catch {
        doc.text("[Signature enregistrée]", margin + colWidth + 10, y + 22);
      }
    }
  } else {
    doc.setTextColor(239, 68, 68);
    doc.text("En attente de confirmation", margin + colWidth + 10, y + 14);
  }

  y += 42;

  // --- MENTION LÉGALE & EMPREINTE ---
  checkPageBreak(14);
  doc.setFontSize(6.5);
  doc.setTextColor(130, 130, 130);
  doc.setFont('helvetica', 'italic');
  doc.text("L'état des lieux contradictoire fait foi entre les parties de l'état du logement à la date de remise ou de restitution des clés (loi béninoise n° 2022-30). Les photographies prises sur place et l'horodatage sont conservés pour prévenir tout litige lors du décompte final de caution.", margin, y);
  y += 4;

  if (data.documentHash) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Empreinte d'intégrité numérique SHA-256 : ${data.documentHash}`, margin, y);
  }

  // Numérotation des pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} sur ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  return doc;
};
