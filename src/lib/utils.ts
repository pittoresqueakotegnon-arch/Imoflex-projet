import { supabase } from './supabase';

export function formatMontant(centimes: number): string {
  return new Intl.NumberFormat('fr-FR').format(centimes) + ' FCFA';
}

export function formatMontantShort(centimes: number): string {
  if (centimes >= 1_000_000) {
    return (centimes / 1_000_000).toFixed(1).replace('.0', '') + 'M F';
  }
  if (centimes >= 1_000) {
    return (centimes / 1_000).toFixed(0) + 'k F';
  }
  return centimes + ' F';
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function daysUntilDeadline(deadlineDate: string): number {
  const now = new Date();
  const deadline = new Date(deadlineDate);
  const diffTime = deadline.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getMonthName(month: number, year: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
}

export function getCurrentMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export function getDeadlineDate(day: number): string {
  const now = new Date();
  const deadline = new Date(now.getFullYear(), now.getMonth(), day);
  if (deadline < now) {
    deadline.setMonth(deadline.getMonth() + 1);
  }
  return deadline.toISOString().split('T')[0];
}

export function calculateProrataAmount(monthlyRent: number, joinDateStr: string, deadlineDay: number): number {
  const joinDate = new Date(joinDateStr);
  const currentMonth = joinDate.getMonth();
  const currentYear = joinDate.getFullYear();
  
  // Find the next deadline
  let deadlineDate = new Date(currentYear, currentMonth, deadlineDay);
  if (deadlineDate <= joinDate) {
    // If we missed this month's deadline, the period is until next month's deadline
    deadlineDate = new Date(currentYear, currentMonth + 1, deadlineDay);
  }

  // Find the previous deadline to determine the full period length
  let previousDeadlineDate = new Date(deadlineDate);
  previousDeadlineDate.setMonth(previousDeadlineDate.getMonth() - 1);

  // Total days in this rent period
  const totalDaysInPeriod = Math.round((deadlineDate.getTime() - previousDeadlineDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Days the tenant will actually be in the property during this period
  const daysInProperty = Math.round((deadlineDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));

  // Prorata calculation
  if (daysInProperty <= 0) return 0;
  if (daysInProperty >= totalDaysInPeriod) return monthlyRent;

  const prorated = (monthlyRent / totalDaysInPeriod) * daysInProperty;
  
  // Round to nearest 500 FCFA for cleaner numbers, but ensure it doesn't exceed monthly rent
  return Math.min(Math.round(prorated / 500) * 500, monthlyRent);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = 'IMO-';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function generateUniqueAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    const { data } = await supabase
      .from('properties')
      .select('id')
      .eq('access_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error('Impossible de générer un code unique après 10 tentatives');
}

export function propertyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    chambre: 'Chambre',
    studio: 'Studio',
    appartement: 'Appartement',
    maison: 'Maison',
    bureau: 'Bureau',
    parcelle: 'Parcelle',
  };
  return labels[type] || type;
}

export function operatorLabel(op: string): string {
  const labels: Record<string, string> = {
    mtn: 'MTN Money',
    moov: 'Moov Money',
    celtiis: 'Celtiis Cash',
  };
  return labels[op] || op;
}

export function operatorColor(op: string): string {
  const colors: Record<string, string> = {
    mtn: '#FBBF24',
    moov: '#3B82F6',
    celtiis: '#10B981',
  };
  return colors[op] || '#8B7BB5';
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    disponible: 'Disponible',
    reserve: 'Réservé',
    occupe: 'Occupé',
    en_cours: 'En cours',
    solde: 'Soldé',
    retard: 'En retard',
    nouvelle: 'Nouvelle',
    traitee: 'Traitée',
    actif: 'Actif',
    termine: 'Terminé',
    suspendu: 'Suspendu',
    en_attente: 'En attente',
    valide: 'Validé',
    echoue: 'Échoué',
    en_traitement: 'En traitement',
    complete: 'Complété',
  };
  return labels[status] || status;
}

export function classNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
