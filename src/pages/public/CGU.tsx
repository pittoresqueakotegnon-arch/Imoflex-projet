import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Shield } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

export default function CGU() {
  const navigate = useNavigate();

  return (
    <div className="page-container bg-[var(--imx-bg-app)] min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky-header px-4 py-4 flex items-center gap-3 border-b border-[var(--imx-border)]">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[var(--imx-surface-2)] text-[var(--imx-text-primary)] hover:bg-[var(--imx-surface)] transition-colors"
          style={{ border: '1px solid var(--imx-border)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-[var(--imx-accent-light)]" />
          <h1 className="text-lg font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            Conditions Générales d'Utilisation
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="px-5 py-6 flex-1 space-y-6 text-sm text-[var(--imx-text-secondary)] leading-relaxed pb-24" style={{ fontFamily: 'Space Grotesk' }}>
        <div className="p-4 rounded-2xl bg-[var(--imx-surface)] border border-[var(--imx-border)] flex items-center gap-3">
          <Shield size={24} className="text-[#22C55E] flex-shrink-0" />
          <p className="text-xs text-[var(--imx-text-muted)]">
            En vigueur au Bénin et dans l'espace UEMOA — Dernière mise à jour : Août 2026.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            1. Présentation de la Plateforme
          </h2>
          <p>
            <strong>ImoFlex</strong> est une application et plateforme technologique dédiée à l'immobilier et à la fintech en Afrique de l'Ouest, facilitant la mise en relation entre locataires et propriétaires, la gestion dématérialisée des baux et le paiement flexible des loyers via Mobile Money.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            2. Inscription et Rôles
          </h2>
          <p>
            Tout utilisateur s'engage à fournir des informations véridiques (nom, numéro de téléphone, email) et à maintenir la confidentialité de ses identifiants.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li><strong>Locataire :</strong> Peut rechercher des logements, formuler des demandes et payer son loyer.</li>
            <li><strong>Propriétaire :</strong> Certifie détenir les droits légaux sur les biens mis en location et garantit l'exactitude des photos et tarifs.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            3. Traitement des Paiements et Sécurité
          </h2>
          <p>
            Les flux financiers (loyers, cautions, retraits de portefeuille) sont traités via notre partenaire de paiement agréé <strong>FedaPay</strong> et les opérateurs agréés (MTN Mobile Money, Moov Money, Celtiis Cash). ImoFlex n'enregistre aucun code secret ou code PIN Mobile Money.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            4. Droit Applicable & Contact
          </h2>
          <p>
            Les présentes conditions sont régies par le droit de la République du Bénin. Pour toute question ou réclamation, vous pouvez contacter notre assistance à <code>contact@imoflex.app</code> ou via notre assistance WhatsApp in-app.
          </p>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
