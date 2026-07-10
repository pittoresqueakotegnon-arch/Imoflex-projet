import React from 'react';

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config: Record<string, { label: string; className: string }> = {
    // Disponibilité annonce
    disponible:   { label: 'VÉRIFIÉ ✓',    className: 'badge-solid-green' },
    reserve:      { label: 'RÉSERVÉ',       className: 'badge-solid-amber' },
    occupe:       { label: 'OCCUPÉ',        className: 'badge-solid-amber' },

    // Paiements
    valide:       { label: 'VALIDÉ ✓',      className: 'badge-solid-green' },
    en_attente:   { label: 'EN ATTENTE',    className: 'badge-solid-amber' },
    echoue:       { label: 'ÉCHOUÉ',        className: 'badge-solid-amber' },

    // Demandes de contact
    nouvelle:     { label: 'NOUVELLE',      className: 'badge-solid-violet' },
    traitee:      { label: 'TRAITÉE',       className: 'badge-solid-green' },

    // Retraits
    en_traitement:{ label: 'EN COURS',      className: 'badge-solid-amber' },
    traite:       { label: 'TRAITÉ ✓',      className: 'badge-solid-green' },
    rejete:       { label: 'REJETÉ',        className: 'badge-solid-amber' },
  };

  const cfg = config[status] ?? { label: status.toUpperCase(), className: 'badge-dim' };

  return <span className={cfg.className}>{cfg.label}</span>;
};

export default StatusBadge;
