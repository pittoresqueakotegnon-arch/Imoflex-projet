import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, HelpCircle, BookOpen, Shield,
  Phone, Mail, MessageCircle, Home, Building2, User, ChevronRight,
} from 'lucide-react';
import BottomNav from '../../components/BottomNav';

// ─────────────────────────────────────────────────────────────────────────────
// DATA
// ─────────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  { q: "Qu'est-ce qu'ImoFlex ?", a: "ImoFlex est une plateforme immobilière qui permet de rechercher des logements, consulter des annonces, contacter des propriétaires et gérer sa location depuis un seul endroit. Les propriétaires peuvent également publier et gérer leurs annonces." },
  { q: "Dois-je créer un compte pour consulter les logements ?", a: "Non. Vous pouvez explorer les logements et consulter les annonces en tant que visiteur. Un compte est nécessaire pour certaines actions comme ajouter un logement aux favoris, contacter un propriétaire ou envoyer une demande." },
  { q: "Comment créer un compte ?", a: "Depuis l'application : Compte → Créer un compte. Renseignez vos informations, choisissez votre profil (Locataire ou Propriétaire) puis suivez les étapes affichées." },
  { q: "Quelle est la différence entre locataire et propriétaire ?", a: "Locataire : vous recherchez un logement, envoyez des demandes et gérez votre location.\nPropriétaire : vous publiez vos logements, gérez vos annonces et consultez les demandes reçues." },
  { q: "Comment rechercher un logement ?", a: "Depuis Accueil, parcourez les logements disponibles. Utilisez les filtres proposés pour trouver plus facilement un logement correspondant à vos besoins, puis sélectionnez une annonce pour voir ses détails." },
  { q: "Comment ajouter un logement aux favoris ?", a: "Ouvrez l'annonce puis appuyez sur l'icône cœur. Vous pourrez ensuite retrouver vos logements enregistrés dans Favoris. Un compte est nécessaire pour utiliser cette fonctionnalité." },
  { q: "Comment contacter un propriétaire ?", a: "Ouvrez l'annonce du logement qui vous intéresse puis sélectionnez l'option permettant de contacter le propriétaire. Vous devez être connecté pour utiliser cette fonctionnalité." },
  { q: "Comment publier un logement ?", a: "Connectez-vous avec un compte Propriétaire puis rendez-vous dans votre espace propriétaire. Sélectionnez Ajouter une annonce et renseignez les informations demandées : photos, description, prix, localisation et caractéristiques." },
  { q: "Puis-je supprimer mon annonce ?", a: "Oui, mais la suppression est gérée de manière sécurisée. Depuis Mes annonces, vous pouvez envoyer une demande de suppression. L'administrateur examine ensuite la demande afin de conserver l'historique nécessaire au bon fonctionnement de la plateforme." },
  { q: "Comment effectuer un paiement ?", a: "Lorsque la fonctionnalité de paiement est disponible pour votre location, rendez-vous dans votre espace de location puis sélectionnez l'option Payer. Suivez ensuite les instructions affichées. Les paiements sont traités par le prestataire de paiement utilisé par ImoFlex." },
  { q: "Que faire si mon paiement échoue ?", a: "Vérifiez d'abord que les informations saisies sont correctes et que votre moyen de paiement est disponible. Si le problème continue, contactez le support ImoFlex avec les informations concernant l'opération." },
  { q: "Comment supprimer mon compte ?", a: "Vous pouvez demander la suppression de votre compte depuis l'application (Profil → Sécurité → Supprimer mon compte) ou en envoyant un email à repostinardakotegnon@gmail.com. Certaines informations peuvent être conservées lorsque la loi ou la sécurité de la plateforme l'exige." },
  { q: "Mes informations sont-elles protégées ?", a: "ImoFlex met en place des mesures de sécurité pour protéger les informations des utilisateurs. Nous ne vendons pas vos données personnelles. Pour plus d'informations, consultez notre Politique de confidentialité." },
  { q: "ImoFlex est-il disponible au Bénin ?", a: "Oui. ImoFlex est développé depuis Cotonou, au Bénin, avec l'ambition de proposer progressivement une solution adaptée au marché immobilier africain." },
];

const GUIDE_LOCATAIRE = [
  { step: "1", title: "Ouvrez ImoFlex", desc: "Après l'écran de présentation, sélectionnez « Commencer à explorer »." },
  { step: "2", title: "Explorez les logements", desc: "Depuis Accueil, parcourez les logements disponibles. Ouvrez une annonce pour découvrir ses informations." },
  { step: "3", title: "Utilisez les filtres", desc: "Utilisez la recherche et les filtres pour trouver un logement correspondant à vos besoins." },
  { step: "4", title: "Créez votre compte", desc: "Pour contacter un propriétaire, ajouter aux favoris ou envoyer une demande : Compte → Créer un compte → Locataire." },
  { step: "5", title: "Envoyez une demande", desc: "Ouvrez l'annonce, sélectionnez l'option de demande, renseignez les informations et envoyez. Suivez son évolution depuis votre espace." },
  { step: "6", title: "Gérez votre location", desc: "Une fois votre demande acceptée, accédez à votre espace de location pour payer votre loyer et consulter votre historique." },
];

const GUIDE_PROPRIETAIRE = [
  { step: "1", title: "Créez un compte Propriétaire", desc: "Compte → Créer un compte → Propriétaire. Terminez la création pour accéder à votre espace propriétaire." },
  { step: "2", title: "Publiez une annonce", desc: "Depuis votre espace, sélectionnez Ajouter une annonce. Ajoutez photos, titre, description, prix, localisation et caractéristiques." },
  { step: "3", title: "Gérez vos annonces", desc: "Dans Mes annonces, consultez vos publications et utilisez les actions disponibles : Voir, Modifier, Gérer, Demander la suppression." },
  { step: "4", title: "Traitez les demandes", desc: "Depuis Demandes, consultez les demandes reçues pour vos logements et utilisez les actions proposées pour chaque demande." },
  { step: "5", title: "Gérez votre wallet", desc: "Consultez vos encaissements et effectuez des retraits depuis votre Wallet propriétaire." },
  { step: "6", title: "Suivez vos locataires", desc: "Dans Mes locataires, retrouvez les informations relatives à vos locations actives et l'historique des paiements." },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const AccordionItem: React.FC<{ q: string; a: string; isOpen: boolean; onToggle: () => void }> = ({ q, a, isOpen, onToggle }) => (
  <div
    className="border-b border-[var(--imx-border)] last:border-0"
  >
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-4 px-1 text-left gap-3 transition-colors"
    >
      <span className="text-[13px] font-bold text-[var(--imx-text-primary)] leading-snug" style={{ fontFamily: 'Nunito' }}>
        {q}
      </span>
      <ChevronDown
        size={16}
        className="flex-shrink-0 text-[var(--imx-accent-light)] transition-transform duration-200"
        style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
      />
    </button>
    {isOpen && (
      <div className="pb-4 px-1">
        <p className="text-[12.5px] text-[var(--imx-text-secondary)] leading-relaxed whitespace-pre-line" style={{ fontFamily: 'Space Grotesk' }}>
          {a}
        </p>
      </div>
    )}
  </div>
);

const StepCard: React.FC<{ step: string; title: string; desc: string }> = ({ step, title, desc }) => (
  <div className="flex gap-3 items-start">
    <div
      className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
      style={{ background: 'var(--imx-accent)', fontFamily: 'Space Grotesk' }}
    >
      {step}
    </div>
    <div className="flex-1 min-w-0 pb-4 border-b border-[var(--imx-border)] last:border-0">
      <p className="text-[13px] font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Nunito' }}>{title}</p>
      <p className="text-[12px] text-[var(--imx-text-secondary)] mt-0.5 leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>{desc}</p>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'faq' | 'guide' | 'contact';
type GuideRole = 'locataire' | 'proprietaire';

export default function Aide() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('faq');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [guideRole, setGuideRole] = useState<GuideRole>('locataire');

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'faq', label: 'FAQ', icon: HelpCircle },
    { key: 'guide', label: "Mode d'emploi", icon: BookOpen },
    { key: 'contact', label: 'Contact', icon: Phone },
  ];

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
        <div>
          <h1 className="text-lg font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            Aide & Support
          </h1>
          <p className="text-[11px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>Centre d'aide ImoFlex</p>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex border-b border-[var(--imx-border)] bg-[var(--imx-surface)] flex-shrink-0">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-all relative"
              style={{ color: active ? 'var(--imx-accent-light)' : 'var(--imx-text-muted)' }}
            >
              <Icon size={15} />
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ fontFamily: 'Space Grotesk' }}>{label}</span>
              {active && (
                <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full" style={{ background: 'var(--imx-accent)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* ── FAQ ── */}
        {activeTab === 'faq' && (
          <div className="px-4 py-5 space-y-2">
            <p className="text-[11px] text-[var(--imx-text-muted)] mb-4" style={{ fontFamily: 'Space Grotesk' }}>
              {FAQ_ITEMS.length} questions fréquentes — appuyez pour lire la réponse
            </p>
            <div className="card px-4 py-0">
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem
                  key={i}
                  q={item.q}
                  a={item.a}
                  isOpen={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── GUIDE ── */}
        {activeTab === 'guide' && (
          <div className="px-4 py-5 space-y-5">
            {/* Role selector */}
            <div className="flex gap-2">
              {([
                { key: 'locataire' as GuideRole, label: 'Locataire', icon: Home },
                { key: 'proprietaire' as GuideRole, label: 'Propriétaire', icon: Building2 },
              ]).map(({ key, label, icon: Icon }) => {
                const active = guideRole === key;
                return (
                  <button
                    key={key}
                    onClick={() => setGuideRole(key)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-bold transition-all"
                    style={{
                      background: active ? 'var(--imx-accent)' : 'var(--imx-surface)',
                      color: active ? '#fff' : 'var(--imx-text-secondary)',
                      border: `1px solid ${active ? 'var(--imx-accent)' : 'var(--imx-border)'}`,
                      fontFamily: 'Nunito',
                    }}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Steps */}
            <div className="card px-4 py-4 space-y-0">
              {(guideRole === 'locataire' ? GUIDE_LOCATAIRE : GUIDE_PROPRIETAIRE).map((s) => (
                <StepCard key={s.step} {...s} />
              ))}
            </div>

            {/* Tip box */}
            <div
              className="rounded-2xl p-4 flex gap-3 items-start"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <HelpCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--imx-accent-light)' }} />
              <p className="text-[12px] text-[var(--imx-text-secondary)] leading-relaxed" style={{ fontFamily: 'Space Grotesk' }}>
                Besoin d'aide supplémentaire ? Rendez-vous dans l'onglet <strong className="text-[var(--imx-text-primary)]">Contact</strong> pour nous écrire directement.
              </p>
            </div>
          </div>
        )}

        {/* ── CONTACT ── */}
        {activeTab === 'contact' && (
          <div className="px-4 py-5 space-y-4">

            {/* Hero */}
            <div
              className="rounded-3xl p-5 text-center space-y-2"
              style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.08))', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
                style={{ background: 'var(--imx-accent)' }}
              >
                <MessageCircle size={24} className="text-white" />
              </div>
              <h2 className="font-bold text-[var(--imx-text-primary)] text-base" style={{ fontFamily: 'Sora' }}>On est là pour vous aider</h2>
              <p className="text-[12px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>
                Réponse sous 24h en jours ouvrés
              </p>
            </div>

            {/* Contact cards */}
            <div className="space-y-3">
              <a
                href="https://wa.me/22901291159?text=Bonjour%20ImoFlex%20Support"
                target="_blank"
                rel="noopener noreferrer"
                className="card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <MessageCircle size={20} style={{ color: '#22C55E' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Nunito' }}>WhatsApp Support</p>
                  <p className="text-[11px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>+229 01 29 11 59 64</p>
                </div>
                <ChevronRight size={16} className="text-[var(--imx-text-muted)]" />
              </a>

              <a
                href="mailto:repostinardakotegnon@gmail.com?subject=Support ImoFlex"
                className="card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(168,85,247,0.15)' }}>
                  <Mail size={20} style={{ color: 'var(--imx-accent-light)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Nunito' }}>Email Support</p>
                  <p className="text-[11px] text-[var(--imx-text-muted)] truncate" style={{ fontFamily: 'Space Grotesk' }}>repostinardakotegnon@gmail.com</p>
                </div>
                <ChevronRight size={16} className="text-[var(--imx-text-muted)]" />
              </a>

              <a
                href="tel:+22901291159"
                className="card p-4 flex items-center gap-4 active:scale-[0.98] transition-transform"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(96,165,250,0.15)' }}>
                  <Phone size={20} style={{ color: '#60A5FA' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Nunito' }}>Appel téléphonique</p>
                  <p className="text-[11px] text-[var(--imx-text-muted)]" style={{ fontFamily: 'Space Grotesk' }}>+229 01 29 11 59 64</p>
                </div>
                <ChevronRight size={16} className="text-[var(--imx-text-muted)]" />
              </a>
            </div>

            {/* Info box */}
            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User size={15} className="text-[var(--imx-accent-light)]" />
                <p className="text-[12px] font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Nunito' }}>Pour un traitement rapide, précisez :</p>
              </div>
              <ul className="space-y-1 pl-2">
                {["Votre nom d'utilisateur", "Le problème rencontré", "La fonctionnalité concernée", "Une capture d'écran si possible"].map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px] text-[var(--imx-text-secondary)]" style={{ fontFamily: 'Space Grotesk' }}>
                    <span className="text-[var(--imx-accent-light)] mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal links */}
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/politique-confidentialite')}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold"
                style={{ background: 'var(--imx-surface)', color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)', fontFamily: 'Space Grotesk' }}
              >
                <Shield size={12} /> Confidentialité
              </button>
              <button
                onClick={() => navigate('/cgu')}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-[11px] font-semibold"
                style={{ background: 'var(--imx-surface)', color: 'var(--imx-text-secondary)', border: '1px solid var(--imx-border)', fontFamily: 'Space Grotesk' }}
              >
                <BookOpen size={12} /> CGU
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
