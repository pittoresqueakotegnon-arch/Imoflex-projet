import { jsPDF } from 'jspdf';
import { formatMontant } from './utils';

export interface ContractPdfData {
  contractNumber: string;
  version: number;
  dateGenerated: Date;
  
  // Bailleur
  ownerName: string;
  ownerPhone?: string;
  ownerAddress?: string;
  ownerSignatureImage?: string | null;
  ownerSignedAt?: string | null;
  
  // Preneur (Locataire)
  tenantName: string;
  tenantPhone?: string;
  tenantAddress?: string;
  tenantSignatureImage?: string | null;
  tenantSignedAt?: string | null;
  
  // Logement
  propertyName: string;
  propertyAddress: string;
  city?: string;
  propertyUsage: string;
  
  // Termes financiers et temporels
  monthlyRent: number;
  depositAmount: number;
  advanceAmount: number;
  chargesAmount: number;
  paymentDeadlineDay: number;
  startDate: string;
  endDate?: string | null;
  durationMonths: number;
  noticePeriodMonths: number;
  specialClauses?: string | null;
  
  // Intégrité
  documentHash?: string | null;
}

export const generateLeaseContractPDF = (data: ContractPdfData): jsPDF => {
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
    doc.text(`ImoFlex — Contrat N° ${data.contractNumber}`, margin, 12);
    doc.text('Loi béninoise n° 2022-30 (Bail d’habitation)', pageWidth - margin, 12, { align: 'right' });
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, 14, pageWidth - margin, 14);
  };

  // --- ENTÊTE PRINCIPALE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(23, 19, 43); // #17132B
  doc.text('Imo', margin, y + 8);
  doc.setTextColor(123, 63, 228); // #7B3FE4
  doc.text('Flex', margin + 14, y + 8);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110, 110, 110);
  doc.text(`Réf: ${data.contractNumber} (v${data.version})`, pageWidth - margin, y + 4, { align: 'right' });
  doc.text(`Date: ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(data.dateGenerated)}`, pageWidth - margin, y + 9, { align: 'right' });

  y += 18;

  // Titre encadré
  doc.setFillColor(248, 246, 255);
  doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');
  doc.setDrawColor(123, 63, 228);
  doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(23, 19, 43);
  doc.text("CONTRAT DE BAIL À USAGE D'HABITATION DOMESTIQUE", pageWidth / 2, y + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text("Régime légal de la République du Bénin — Loi n° 2022-30 du 20 décembre 2022", pageWidth / 2, y + 13, { align: 'center' });

  y += 24;

  // --- PARTIES AU CONTRAT ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(123, 63, 228);
  doc.text("ENTRE LES SOUSSIGNÉS :", margin, y);
  y += 6;

  // Bailleur
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text("1. LE BAILLEUR (Propriétaire) :", margin, y);
  doc.setFont('helvetica', 'normal');
  y += 4.5;
  doc.text(`M./Mme : ${data.ownerName}`, margin + 4, y);
  if (data.ownerPhone) {
    y += 4;
    doc.text(`Téléphone : ${data.ownerPhone}`, margin + 4, y);
  }
  y += 4;
  doc.text("Dénommé ci-après « le Bailleur », d'une part,", margin + 4, y);

  y += 7;

  // Preneur
  doc.setFont('helvetica', 'bold');
  doc.text("2. LE PRENEUR (Locataire) :", margin, y);
  doc.setFont('helvetica', 'normal');
  y += 4.5;
  doc.text(`M./Mme : ${data.tenantName}`, margin + 4, y);
  if (data.tenantPhone) {
    y += 4;
    doc.text(`Téléphone : ${data.tenantPhone}`, margin + 4, y);
  }
  y += 4;
  doc.text("Dénommé ci-après « le Preneur », d'autre part.", margin + 4, y);

  y += 8;

  // --- CLAUSES ---
  const addArticle = (num: string, title: string, text: string) => {
    const lines = doc.splitTextToSize(text, contentWidth - 4);
    const boxHeight = 7 + lines.length * 4;
    checkPageBreak(boxHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(23, 19, 43);
    doc.text(`${num}. ${title.toUpperCase()}`, margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(lines, margin + 4, y);
    y += lines.length * 4 + 3;
  };

  addArticle(
    "ARTICLE 1",
    "Objet et désignation des lieux",
    `Par le présent contrat, le Bailleur donne en location à usage exclusif d'habitation au Preneur, qui accepte, le bien immobilier dénommé « ${data.propertyName} » situé à l'adresse suivante : ${data.propertyAddress}${data.city ? ', ' + data.city : ''}. Le Preneur déclare bien connaître les lieux pour les avoir visités.`
  );

  addArticle(
    "ARTICLE 2",
    "Durée et prise d'effet",
    `Le présent bail est consenti et accepté pour une durée déterminée de ${data.durationMonths} mois, commençant à courir le ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(data.startDate))}${data.endDate ? ' pour se terminer le ' + new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(data.endDate)) : ''}. À son expiration, le bail pourra être reconduit tacitement pour des périodes équivalentes, sauf congé délivré dans les formes et délais légaux.`
  );

  addArticle(
    "ARTICLE 3",
    "Loyer et modalités de règlement",
    `Le loyer mensuel est fixé à la somme de ${formatMontant(data.monthlyRent)} FCFA${data.chargesAmount > 0 ? ' (dont ' + formatMontant(data.chargesAmount) + ' FCFA de charges forfaitaires)' : ''}. Le Preneur s'engage expressément à payer ce loyer au plus tard le ${data.paymentDeadlineDay} de chaque mois. Conformément aux dispositions pratiques convenues, les règlements sont effectués via la plateforme ImoFlex par Mobile Money ou tout moyen sécurisé convenu.`
  );

  const depositText = data.depositAmount > 0
    ? `À titre de garantie pour l'exécution de ses obligations, le Preneur verse la somme de ${formatMontant(data.depositAmount)} FCFA représentant la caution (dans la limite du plafond légal de 3 mois de loyer fixé par la loi béninoise n° 2022-30). Cette somme sera restituée au Preneur en fin de bail, déduction faite des éventuelles sommes restant dues ou des réparations locatives justifiées par l'état des lieux de sortie.${data.advanceAmount > 0 ? ' Une avance de loyer de ' + formatMontant(data.advanceAmount) + ' FCFA a été réglée.' : ''}`
    : "Aucun dépôt de garantie particulier n'a été exigé à la signature.";
  addArticle("ARTICLE 4", "Dépôt de garantie et avance", depositText);

  addArticle(
    "ARTICLE 5",
    "État des lieux contradictoire",
    "Conformément à la législation en vigueur, un état des lieux contradictoire d'entrée est impérativement établi lors de la remise des clés, accompagné de photographies horodatées sur ImoFlex. Un état des lieux de sortie sera dressé selon les mêmes modalités lors de la restitution des clés pour apprécier les dégradations éventuelles."
  );

  addArticle(
    "ARTICLE 6",
    "Charges, eau et électricité",
    "Les consommations personnelles d'eau (SONEB) et d'électricité (SBEÉ ou sous-compteur), ainsi que la taxe d'enlèvement des ordures ménagères sont à la charge exclusive du Preneur. Le Preneur s'engage à maintenir ses abonnements et index à jour."
  );

  addArticle(
    "ARTICLE 7",
    "Obligations des parties",
    "Le Bailleur s'engage à assurer la jouissance paisible des lieux et à prendre en charge les grosses réparations de structure. Le Preneur s'engage à occuper les lieux en bon père de famille, à ne pas en modifier la consistance sans accord écrit, à supporter les réparations locatives et d'entretien d'usage, et à ne pas sous-louer le bien."
  );

  addArticle(
    "ARTICLE 8",
    "Congé et résiliation",
    `Chacune des parties peut résilier le contrat sous réserve d'un préavis écrit de ${data.noticePeriodMonths} mois. En cas de non-paiement répété du loyer à l'échéance ou de manquement grave aux obligations contractuelles, le bailleur pourra poursuivre la résiliation de plein droit conformément aux voies de droit applicables en République du Bénin.`
  );

  if (data.specialClauses && data.specialClauses.trim()) {
    addArticle("ARTICLE 9", "Conditions particulières convenues", data.specialClauses.trim());
  }

  // --- BLOC DES SIGNATURES ---
  checkPageBreak(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(23, 19, 43);
  doc.text("POUR VALOIR CE QUE DE DROIT :", margin, y);
  y += 5;

  const colWidth = (contentWidth - 6) / 2;

  // Boîte Bailleur
  doc.setDrawColor(210, 210, 220);
  doc.setFillColor(252, 252, 254);
  doc.roundedRect(margin, y, colWidth, 42, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text("LE BAILLEUR (Propriétaire)", margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Nom: ${data.ownerName}`, margin + 4, y + 10.5);

  if (data.ownerSignedAt) {
    const d = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.ownerSignedAt));
    doc.setTextColor(16, 185, 129); // emerald
    doc.text(`✓ Signé numériquement le ${d}`, margin + 4, y + 15);
    doc.setTextColor(100, 100, 100);

    if (data.ownerSignatureImage) {
      try {
        doc.addImage(data.ownerSignatureImage, 'PNG', margin + 4, y + 17, colWidth - 8, 22, undefined, 'FAST');
      } catch {
        doc.text("[Signature manuscrite enregistrée]", margin + 4, y + 25);
      }
    }
  } else {
    doc.setTextColor(239, 68, 68); // red
    doc.text("En attente de signature", margin + 4, y + 15);
    doc.setTextColor(140, 140, 140);
    doc.text("Cadre réservé à la signature", margin + 4, y + 28);
  }

  // Boîte Preneur
  doc.setDrawColor(210, 210, 220);
  doc.setFillColor(252, 252, 254);
  doc.roundedRect(margin + colWidth + 6, y, colWidth, 42, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text("LE PRENEUR (Locataire)", margin + colWidth + 10, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Nom: ${data.tenantName}`, margin + colWidth + 10, y + 10.5);

  if (data.tenantSignedAt) {
    const d = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.tenantSignedAt));
    doc.setTextColor(16, 185, 129);
    doc.text(`✓ Signé numériquement le ${d}`, margin + colWidth + 10, y + 15);
    doc.setTextColor(100, 100, 100);

    if (data.tenantSignatureImage) {
      try {
        doc.addImage(data.tenantSignatureImage, 'PNG', margin + colWidth + 10, y + 17, colWidth - 8, 22, undefined, 'FAST');
      } catch {
        doc.text("[Signature manuscrite enregistrée]", margin + colWidth + 10, y + 25);
      }
    }
  } else {
    doc.setTextColor(239, 68, 68);
    doc.text("En attente de signature", margin + colWidth + 10, y + 15);
    doc.setTextColor(140, 140, 140);
    doc.text("Cadre réservé à la signature", margin + colWidth + 10, y + 28);
  }

  y += 46;

  // --- MENTION LÉGALE DE RÉSERVE & EMPREINTE ---
  checkPageBreak(16);
  doc.setFontSize(6.5);
  doc.setTextColor(130, 130, 130);
  doc.setFont('helvetica', 'italic');
  const legalNote = "Mention d'avertissement : Modèle contractuel indicatif établi conformément aux dispositions usuelles de la loi béninoise n° 2022-30 du 20 décembre 2022 régissant le bail d'habitation. Les parties ont consenti librement aux engagements ci-dessus. En application du Code du numérique béninois (loi 2017-20), les consentements, tracés et horodatages sont archivés de façon infalsifiable. Une validation par un conseil juridique habilité est recommandée pour tout litige ou clause personnalisée.";
  const legalLines = doc.splitTextToSize(legalNote, contentWidth);
  doc.text(legalLines, margin, y);
  y += legalLines.length * 3 + 2;

  if (data.documentHash) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`Empreinte d'intégrité SHA-256 : ${data.documentHash}`, margin, y);
  }

  // Numérotation des pages en pied de page
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
