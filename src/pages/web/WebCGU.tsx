import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Shield } from 'lucide-react';

export default function WebCGU() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
      <Link
        to="/web"
        className="inline-flex items-center gap-1.5 text-xs font-semibold mb-6 transition-colors"
        style={{ color: 'var(--imx-text-muted)' }}
      >
        <ArrowLeft size={14} />
        Retour à l'accueil
      </Link>

      <div
        className="rounded-3xl p-6 sm:p-10 border bg-white shadow-sm"
        style={{ borderColor: 'var(--imx-border)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#F1EBFF] text-[#7B3FE4] flex items-center justify-center">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Conditions Générales d'Utilisation
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              En vigueur au Bénin et dans l'espace UEMOA — Dernière mise à jour : 2026.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#F8F7FC] border border-[#E9E5F2] flex items-start gap-3 mb-8">
          <Shield size={20} className="text-[#10B981] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            ImoFlex respecte les exigences de la loi n° 2017-20 portant Code du numérique en République du Bénin et la législation sur le bail à usage d'habitation (loi n° 2022-30).
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              1. Objet et présentation du service
            </h2>
            <p>
              <strong>ImoFlex</strong> est une plateforme technologique immobilière et fintech opérée au Bénin. Elle permet :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-gray-600">
              <li>La recherche et la consultation d'annonces de logements et de locaux certifiés.</li>
              <li>La mise en relation directe et sécurisée entre locataires, propriétaires et agences immobilières agréées.</li>
              <li>La gestion numérique des contrats de bail et des états des lieux photographiques.</li>
              <li>Le règlement et l'échelonnement des loyers par Mobile Money (MTN, Moov, Celtiis) avec émission de quittances horodatées.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              2. Comptes utilisateurs et vérification
            </h2>
            <p>
              L'accès à certaines fonctionnalités nécessite la création d'un compte personnel. L'utilisateur s'engage à fournir des informations exactes.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-4 rounded-xl border bg-gray-50/50" style={{ borderColor: 'var(--imx-border)' }}>
                <p className="font-bold text-xs text-[#7B3FE4] uppercase tracking-wider mb-1">Locataire</p>
                <p className="text-xs text-gray-600">Recherche, candidatures, paiement progressif et téléchargement des quittances certifiées.</p>
              </div>
              <div className="p-4 rounded-xl border bg-gray-50/50" style={{ borderColor: 'var(--imx-border)' }}>
                <p className="font-bold text-xs text-[#7B3FE4] uppercase tracking-wider mb-1">Propriétaire</p>
                <p className="text-xs text-gray-600">Publication de biens, vérification KYC d'identité, suivi des baux et encaissement sécurisé.</p>
              </div>
              <div className="p-4 rounded-xl border bg-gray-50/50" style={{ borderColor: 'var(--imx-border)' }}>
                <p className="font-bold text-xs text-[#7B3FE4] uppercase tracking-wider mb-1">Agence</p>
                <p className="text-xs text-gray-600">Gestion de portefeuilles mandataires, publication groupée et pilotage des loyers.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              3. Paiements sécurisés et commission
            </h2>
            <p>
              Les transactions financières sont orchestrées via notre passerelle de paiement agréée <strong>FedaPay</strong>. ImoFlex applique des frais de commission transparents de 6 % sur les loyers encaissés par le service, couvrant le traitement sécurisé, l'émission des quittances et le support technique.
            </p>
            <p className="text-xs text-gray-500">
              ImoFlex ne stocke aucun code confidentiel, code OTP bancaire ou code PIN Mobile Money.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              4. Propriété intellectuelle et règles d'usage
            </h2>
            <p>
              Tous les éléments constitutifs de la plateforme (marques, logos, interfaces, algorithmes, bases de données) sont protégés par le droit de la propriété intellectuelle. Toute reproduction non autorisée est strictement interdite.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              5. Contact et réclamations
            </h2>
            <p>
              Pour toute question relative aux présentes conditions ou à l'utilisation du service, contactez-nous à : <a href="mailto:contact@imoflex.bj" className="font-semibold text-[#7B3FE4] underline">contact@imoflex.bj</a> ou au (+229) 01 99 00 00.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
