import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HelpCircle, Search, ChevronDown, ChevronUp, MessageSquare, Phone, ShieldCheck, CreditCard, Home, FileText } from 'lucide-react';

interface FaqItem {
  id: string;
  category: 'locataire' | 'proprietaire' | 'paiement' | 'securite';
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    id: '1',
    category: 'paiement',
    question: 'Comment fonctionne le paiement progressif du loyer ?',
    answer: 'Le paiement progressif vous permet d\'échelonner le règlement de votre loyer sur le mois en plusieurs versements via Mobile Money (MTN, Moov, Celtiis), sans frais cachés. Dès que la totalité de la période est réglée, un reçu numérique certifié est automatiquement généré.',
  },
  {
    id: '2',
    category: 'paiement',
    question: 'Quels sont les opérateurs Mobile Money supportés au Bénin ?',
    answer: 'ImoFlex intègre directement les trois réseaux béninois via FedaPay : MTN Mobile Money (*880#), Moov Money (*855#) et Celtiis Cash. Les transactions sont instantanées et traçables 24h/24.',
  },
  {
    id: '3',
    category: 'locataire',
    question: 'Comment réserver un logement ou planifier une visite ?',
    answer: 'Sur chaque fiche de bien disponible, cliquez sur "Contacter le propriétaire". Renseignez vos disponibilités et vos coordonnées. Le propriétaire reçoit une alerte immédiate avec votre numéro WhatsApp pour fixer le rendez-vous.',
  },
  {
    id: '4',
    category: 'proprietaire',
    question: 'Comment publier un bien et quand sera-t-il visible ?',
    answer: 'Depuis votre espace Propriétaire ou Agence, cliquez sur "Publier un bien". Indiquez les caractéristiques (loyer, caution, photos, équipements). Une fois validée par notre équipe de modération, votre annonce est publiée et visible de tous les candidats.',
  },
  {
    id: '5',
    category: 'proprietaire',
    question: 'Comment retirer mes loyers depuis mon portefeuille (Wallet) ?',
    answer: 'Dans la rubrique "Wallet & loyers", consultez votre solde disponible. Cliquez sur "Demander un retrait", saisissez le montant souhaité et votre numéro Mobile Money. Les fonds vous sont versés sous 24 à 48 heures ouvrées.',
  },
  {
    id: '6',
    category: 'securite',
    question: 'Comment ImoFlex protège-t-il les locataires contre les fausses annonces ?',
    answer: 'Nous opérons une vérification d\'identité obligatoire des propriétaires et gestionnaires (pièce d\'identité, titre ou mandat). Les photos font l\'objet d\'un contrôle et un badge "Propriétaire vérifié" signale les biens contrôlés.',
  },
  {
    id: '7',
    category: 'locataire',
    question: 'Puis-je télécharger mon contrat de bail et mes quittances de loyer ?',
    answer: 'Oui. Dans votre espace locataire sous l\'onglet "Documents", vous retrouvez vos contrats de bail officiels conformes à la législation béninoise ainsi que les reçus PDF horodatés de chaque paiement effectué.',
  },
];

export default function WebAide() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'locataire' | 'proprietaire' | 'paiement' | 'securite'>('all');
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({ '1': true });

  const toggleItem = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredFaqs = FAQS.filter((f) => {
    const matchTab = activeTab === 'all' || f.category === activeTab;
    const matchSearch =
      !search.trim() ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#F1EBFF', color: 'var(--imx-accent)' }}
        >
          <HelpCircle size={28} />
        </div>
        <h1
          className="text-3xl sm:text-4xl font-black mb-3"
          style={{ fontFamily: 'Sora, sans-serif', color: 'var(--imx-text-primary)' }}
        >
          Centre d'aide & Foire aux questions
        </h1>
        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
          Toutes les réponses pour trouver votre logement, gérer vos loyers et payer en toute sécurité.
        </p>

        {/* Search */}
        <div className="relative mt-6 max-w-lg mx-auto">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une question (ex: Mobile Money, retrait, caution)..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm border outline-none bg-white shadow-sm transition-colors focus:border-[#7B3FE4]"
            style={{ borderColor: 'var(--imx-border)' }}
          />
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {[
          { key: 'all', label: 'Toutes les questions', icon: HelpCircle },
          { key: 'locataire', label: 'Locataires', icon: Home },
          { key: 'proprietaire', label: 'Propriétaires & Agences', icon: FileText },
          { key: 'paiement', label: 'Paiements & Mobile Money', icon: CreditCard },
          { key: 'securite', label: 'Sécurité & Vérification', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
              style={{
                background: active ? 'var(--imx-accent)' : 'var(--imx-surface)',
                color: active ? '#fff' : 'var(--imx-text-secondary)',
                border: active ? 'none' : '1px solid var(--imx-border)',
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Accordion FAQ list */}
      <div className="space-y-3 max-w-3xl mx-auto mb-16">
        {filteredFaqs.length === 0 ? (
          <div className="p-8 text-center text-gray-500 rounded-2xl border bg-white" style={{ borderColor: 'var(--imx-border)' }}>
            Aucune réponse ne correspond à votre recherche « {search} ».
          </div>
        ) : (
          filteredFaqs.map((faq) => {
            const isOpen = !!openIds[faq.id];
            return (
              <div
                key={faq.id}
                className="rounded-2xl border bg-white overflow-hidden transition-all shadow-sm"
                style={{ borderColor: 'var(--imx-border)' }}
              >
                <button
                  onClick={() => toggleItem(faq.id)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 font-semibold text-sm sm:text-base hover:bg-gray-50/60 transition-colors"
                  style={{ color: 'var(--imx-text-primary)', fontFamily: 'Sora' }}
                >
                  <span>{faq.question}</span>
                  {isOpen ? <ChevronUp size={18} className="text-[#7B3FE4] flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 sm:px-5 sm:pb-6 text-sm text-gray-600 leading-relaxed border-t pt-3" style={{ borderColor: 'var(--imx-border)' }}>
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Contact Support CTA */}
      <div
        className="rounded-3xl p-6 sm:p-10 border max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm"
        style={{ background: 'linear-gradient(135deg, #F1EBFF 0%, #FFFFFF 100%)', borderColor: 'var(--imx-border)' }}
      >
        <div>
          <h3 className="text-lg font-black text-[#17132B] mb-1" style={{ fontFamily: 'Sora' }}>
            Vous ne trouvez pas votre réponse ?
          </h3>
          <p className="text-xs sm:text-sm text-gray-600">
            Notre équipe d'assistance à Cotonou est à votre écoute par message ou téléphone.
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <Link
            to="/web/contact"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90"
            style={{ background: 'var(--imx-accent)' }}
          >
            <MessageSquare size={15} />
            Nous contacter
          </Link>
          <a
            href="tel:+22901990000"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            style={{ borderColor: 'var(--imx-border)' }}
          >
            <Phone size={15} />
            Appeler
          </a>
        </div>
      </div>
    </div>
  );
}
