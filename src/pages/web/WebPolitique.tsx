import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';

export default function WebPolitique() {
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
            <Lock size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              Politique de Confidentialité & Protection des Données
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Conformité Code du numérique béninois (Loi n° 2017-20, Livre V) et APDP.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-start gap-3 mb-8">
          <ShieldCheck size={20} className="text-[#10B981] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-900 leading-relaxed">
            Vos données personnelles sont chiffrées au repos et en transit. ImoFlex ne revend aucune information à des tiers et limite l'accès aux seules nécessités du service immobilier.
          </p>
        </div>

        <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              1. Données collectées
            </h2>
            <p>
              Dans le cadre de l'exécution de nos services, nous collectons les données strictement nécessaires :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
              <li><strong>Données d'identification :</strong> Nom complet, adresse e-mail, numéro de téléphone.</li>
              <li><strong>Données de vérification (Propriétaires & Agences) :</strong> Copie de pièce d'identité officielle (CIP, CNI, Passeport), titre foncier ou mandat de gestion.</li>
              <li><strong>Données relatives au bail :</strong> Adresse du bien, montant du loyer, quittances et états des lieux signés.</li>
              <li><strong>Données techniques de connexion :</strong> Horodatage, adresse IP de connexion et logs d'audit sécurisés.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              2. Finalité des traitements
            </h2>
            <p>
              Les données collectées sont utilisées pour la mise en relation locative, la sécurisation des contrats de bail, l'exécution et le suivi des règlements de loyer par Mobile Money, ainsi que la prévention des fraudes immobilières.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#17132B]" style={{ fontFamily: 'Sora' }}>
              3. Vos droits
            </h2>
            <p>
              Conformément à la réglementation sur la protection des données personnelles, vous disposez d'un droit d'accès, de rectification, de portabilité et de suppression de vos données. Pour exercer vos droits, vous pouvez soumettre une demande depuis votre espace ou par e-mail à : <a href="mailto:privacy@imoflex.bj" className="font-semibold text-[#7B3FE4] underline">privacy@imoflex.bj</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
