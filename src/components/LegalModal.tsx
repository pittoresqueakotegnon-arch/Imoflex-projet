import React from 'react';
import { X, Shield, FileText } from 'lucide-react';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'privacy';
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose, initialTab = 'terms' }) => {
  const [tab, setTab] = React.useState<'terms' | 'privacy'>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleAndroidBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('imx:android-back', handleAndroidBack);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('imx:android-back', handleAndroidBack);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] sm:rounded-3xl rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-slide-up"
        style={{ background: 'var(--imx-surface)', border: '1px solid var(--imx-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--imx-border)]">
          <div className="flex items-center gap-2.5">
            {tab === 'terms' ? (
              <FileText size={22} className="text-[var(--imx-accent-light)]" />
            ) : (
              <Shield size={22} className="text-[#22C55E]" />
            )}
            <h2 className="text-lg font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
              {tab === 'terms' ? "Conditions d'utilisation" : 'Politique de confidentialité'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--imx-surface-2)] text-[var(--imx-text-secondary)] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-[var(--imx-border)] px-6 pt-2 gap-4">
          <button
            onClick={() => setTab('terms')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              tab === 'terms'
                ? 'border-[var(--imx-accent)] text-[var(--imx-accent-light)]'
                : 'border-transparent text-[var(--imx-text-muted)]'
            }`}
            style={{ fontFamily: 'Space Grotesk' }}
          >
            Conditions (CGU)
          </button>
          <button
            onClick={() => setTab('privacy')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              tab === 'privacy'
                ? 'border-[var(--imx-accent)] text-[var(--imx-accent-light)]'
                : 'border-transparent text-[var(--imx-text-muted)]'
            }`}
            style={{ fontFamily: 'Space Grotesk' }}
          >
            Confidentialité & Données
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-[var(--imx-text-secondary)] space-y-4 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
          {tab === 'terms' ? (
            <>
              <p className="text-xs text-[var(--imx-text-muted)]">Dernière mise à jour : Août 2026</p>
              
              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">1. Objet du Service</h3>
              <p>
                ImoFlex est une plateforme technologique facilitant la recherche, la location immobilière et le paiement fractionné de loyers en République du Bénin et dans la zone UEMOA via Mobile Money.
              </p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">2. Engagements des Utilisateurs</h3>
              <p>
                - <strong>Locataires :</strong> s'engagent à fournir des informations exactes et à honorer leurs échéances de paiement convenues dans le cadre de leur bail.<br />
                - <strong>Propriétaires :</strong> certifient être légitimes détenteurs ou mandataires des biens publiés et garantissent l'exactitude des photos et descriptions.
              </p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">3. Traitement des Paiements</h3>
              <p>
                Les transactions financières sont opérées de manière sécurisée par l'intermédiaire de prestataires de services de paiement agréés (FedaPay et opérateurs télécoms partenaires : MTN Mobile Money, Moov Money, Celtiis Cash). ImoFlex ne stocke aucune coordonnée bancaire secrète ou code PIN.
              </p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">4. Litiges & Responsabilité</h3>
              <p>
                ImoFlex intervient comme intermédiaire technique et de gestion locative. En cas de désaccord direct entre bailleur et preneur, notre support client assiste la médiation conformément au droit applicable en République du Bénin.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--imx-text-muted)]">Dernière mise à jour : Août 2026</p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">1. Collecte des Données</h3>
              <p>
                ImoFlex collecte uniquement les données strictement nécessaires au fonctionnement du service : nom complet, numéro de téléphone, adresse email, rôle (locataire/propriétaire) et numéro de Mobile Money pour les transactions.
              </p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">2. Utilisation et Confidentialité</h3>
              <p>
                Vos données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins publicitaires. Elles sont exclusivement utilisées pour :
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>L'authentification et la sécurisation de votre compte</li>
                <li>Le traitement de vos paiements de loyer et retraits de fonds</li>
                <li>L'envoi des notifications relatives à vos contrats et échéances</li>
              </ul>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">3. Sécurité du Stockage</h3>
              <p>
                Toutes les données sont chiffrées en transit (TLS 1.3) et au repos avec des politiques de sécurité strictes au niveau des lignes de base de données (PostgreSQL Row Level Security).
              </p>

              <h3 className="text-base font-bold text-[var(--imx-text-primary)]">4. Droit à l'Oubli & Suppression de Compte</h3>
              <p>
                Conformément aux normes internationales et aux exigences du Google Play Store, vous pouvez à tout moment demander la suppression définitive de votre compte et de l'ensemble de vos données associées directement depuis l'application (Rubrique <em>Profil &gt; Supprimer mon compte</em>) ou par email à <a href="mailto:repostinardakotegnon@gmail.com" className="text-[var(--imx-accent-light)] underline">repostinardakotegnon@gmail.com</a>.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--imx-border)] bg-[var(--imx-surface-2)]">
          <button
            onClick={onClose}
            className="btn-primary w-full h-12"
          >
            Fermer et continuer
          </button>
        </div>
      </div>
    </div>
  );
};
