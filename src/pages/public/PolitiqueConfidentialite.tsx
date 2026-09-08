import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import BottomNav from '../../components/BottomNav';

export default function PolitiqueConfidentialite() {
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
          <Shield size={20} className="text-[#22C55E]" />
          <h1 className="text-lg font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>
            Politique de Confidentialité
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="px-5 py-6 flex-1 space-y-8 text-sm text-[var(--imx-text-secondary)] leading-relaxed pb-24" style={{ fontFamily: 'Space Grotesk' }}>
        <p className="text-xs text-[var(--imx-text-muted)] italic">Dernière mise à jour : 21 août 2026</p>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>1. Introduction</h2>
          <p>Bienvenue sur ImoFlex.</p>
          <p>ImoFlex est une plateforme immobilière qui permet notamment aux utilisateurs de rechercher des logements, consulter des annonces, contacter des propriétaires, gérer leurs locations et effectuer certaines opérations liées au paiement du loyer.</p>
          <p>Cette Politique de confidentialité explique de manière simple quelles informations nous pouvons collecter, pourquoi nous les utilisons, comment nous les protégeons et quels sont vos droits.</p>
          <p>En utilisant ImoFlex, vous acceptez les pratiques décrites dans cette Politique de confidentialité.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>2. Responsable du traitement</h2>
          <p>ImoFlex est développé et porté par :</p>
          <p className="font-semibold text-[var(--imx-text-primary)]">Répotinard AKOTEGNON<br />Fondateur — ImoFlex<br />Cotonou, Bénin</p>
          <p><strong>Contact</strong><br />
          Email : <a href="mailto:repostinardakotegnon@gmail.com" className="text-[var(--imx-accent-light)] underline">repostinardakotegnon@gmail.com</a><br />
          Téléphone : +229 01 29 11 59 64</p>
          <p>Pour toute question concernant vos données personnelles ou cette Politique de confidentialité, vous pouvez nous contacter à l'adresse ci-dessus.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>3. Les informations que nous collectons</h2>
          <p>Selon les fonctionnalités que vous utilisez, ImoFlex peut collecter différentes catégories d'informations.</p>
          
          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">3.1 Informations de compte</h3>
          <p>Lorsque vous créez un compte, nous pouvons collecter :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>votre nom complet ;</li>
            <li>votre adresse e-mail ;</li>
            <li>votre numéro de téléphone ;</li>
            <li>votre mot de passe, sous une forme sécurisée ;</li>
            <li>votre type de profil, notamment locataire ou propriétaire ;</li>
            <li>les informations nécessaires à la gestion de votre compte.</li>
          </ul>
          <p>Si vous utilisez une connexion avec Google, certaines informations de votre compte Google peuvent également être transmises à ImoFlex selon les autorisations accordées.</p>

          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">3.2 Informations liées aux annonces</h3>
          <p>Si vous êtes propriétaire et publiez un logement sur ImoFlex, nous pouvons collecter et afficher les informations nécessaires à la publication de votre annonce, notamment :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>photos du logement ;</li>
            <li>titre et description ;</li>
            <li>type de logement ;</li>
            <li>localisation ;</li>
            <li>prix du loyer ;</li>
            <li>caractéristiques du logement ;</li>
            <li>informations nécessaires pour permettre aux utilisateurs intéressés de vous contacter.</li>
          </ul>
          <p>Ces informations sont utilisées pour permettre la présentation et la gestion des annonces sur ImoFlex.</p>

          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">3.3 Informations liées à l'utilisation de la plateforme</h3>
          <p>Nous pouvons conserver certaines informations relatives à votre utilisation d'ImoFlex, notamment :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>les annonces consultées ;</li>
            <li>les favoris ;</li>
            <li>les demandes envoyées ;</li>
            <li>les informations relatives aux locations ;</li>
            <li>les notifications ;</li>
            <li>les opérations effectuées dans l'application ;</li>
            <li>les informations nécessaires à la sécurité et au bon fonctionnement du service.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>4. Informations liées aux paiements</h2>
          <p>ImoFlex peut proposer des fonctionnalités permettant d'effectuer des paiements liés aux locations.</p>
          <p>Les paiements sont traités avec l'aide de prestataires de services de paiement partenaires.</p>
          <p>Selon le prestataire utilisé et la fonctionnalité concernée, certaines informations nécessaires au traitement d'un paiement peuvent être transmises au prestataire de paiement.</p>
          <p>ImoFlex ne doit pas être considéré comme le détenteur direct des informations bancaires ou de paiement sensibles lorsque celles-ci sont traitées directement par le prestataire de paiement.</p>
          <p>Les prestataires de paiement appliquent leurs propres règles de sécurité et de confidentialité.</p>
          <p>Le prestataire de paiement utilisé par ImoFlex pourra être précisé ou mis à jour dans cette politique lorsque le choix définitif du partenaire sera arrêté.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>5. Pourquoi utilisons-nous vos informations ?</h2>
          <p>Nous utilisons les informations collectées pour :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>créer et gérer votre compte ;</li>
            <li>vous permettre d'utiliser les fonctionnalités d'ImoFlex ;</li>
            <li>afficher les annonces immobilières ;</li>
            <li>permettre aux propriétaires de gérer leurs annonces ;</li>
            <li>permettre aux locataires de rechercher des logements ;</li>
            <li>gérer les favoris ;</li>
            <li>permettre la communication entre utilisateurs lorsque cette fonctionnalité est disponible ;</li>
            <li>gérer les demandes de location ;</li>
            <li>traiter les opérations de paiement ;</li>
            <li>envoyer des notifications importantes ;</li>
            <li>sécuriser les comptes ;</li>
            <li>détecter et prévenir les activités frauduleuses ou abusives ;</li>
            <li>améliorer les performances et l'expérience utilisateur ;</li>
            <li>résoudre les problèmes techniques ;</li>
            <li>respecter nos obligations légales lorsque cela est nécessaire.</li>
          </ul>
          <p>Nous n'utilisons pas vos données personnelles à d'autres fins incompatibles avec celles présentées dans cette politique.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>6. Comment vos informations sont-elles partagées ?</h2>
          <p>Nous ne vendons pas vos données personnelles.</p>
          <p>Certaines informations peuvent toutefois être communiquées lorsque cela est nécessaire au fonctionnement d'ImoFlex.</p>
          
          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">Prestataires techniques</h3>
          <p>ImoFlex peut utiliser des prestataires techniques pour assurer certains services nécessaires au fonctionnement de la plateforme. Par exemple, notre infrastructure peut utiliser des services d'hébergement, de base de données, d'authentification ou d'autres services techniques.</p>

          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">Prestataires de paiement</h3>
          <p>Lorsque vous utilisez une fonctionnalité de paiement, les informations nécessaires peuvent être transmises au prestataire de paiement concerné afin de traiter l'opération.</p>

          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">Autres utilisateurs</h3>
          <p>Certaines informations que vous choisissez de publier peuvent être visibles par d'autres utilisateurs. Par exemple, une annonce publiée par un propriétaire peut contenir des informations telles que : photos, description, localisation, prix, caractéristiques du logement.</p>
          <p>Nous vous recommandons de ne pas publier dans une annonce des informations personnelles qui ne sont pas nécessaires.</p>

          <h3 className="text-[13px] font-bold text-[var(--imx-text-primary)] mt-4">Obligations légales</h3>
          <p>Nous pouvons également communiquer certaines informations lorsque nous sommes légalement obligés de le faire ou lorsque cela est nécessaire pour protéger les droits, la sécurité ou l'intégrité d'ImoFlex et de ses utilisateurs.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>7. Sécurité des données</h2>
          <p>Nous mettons en place des mesures techniques et organisationnelles destinées à protéger les informations des utilisateurs contre l'accès non autorisé, la modification non autorisée, la perte, la destruction, ou la divulgation non autorisée.</p>
          <p>L'accès aux données est limité aux personnes ou services qui en ont besoin pour assurer le fonctionnement d'ImoFlex.</p>
          <p>Cependant, aucun système informatique ou service en ligne ne peut garantir une sécurité absolue. Nous vous recommandons également de protéger vos identifiants et de ne jamais communiquer votre mot de passe à une autre personne.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>8. Conservation des données</h2>
          <p>Nous conservons les informations personnelles uniquement pendant la durée nécessaire aux objectifs décrits dans cette politique.</p>
          <p>La durée de conservation peut varier selon la nature des informations et leur utilisation.</p>
          <p>Certaines données peuvent être conservées plus longtemps lorsqu'une conservation est nécessaire pour respecter une obligation légale, résoudre un litige, prévenir une fraude, assurer la sécurité de la plateforme, conserver des preuves de transactions ou d'opérations, ou respecter nos obligations comptables ou réglementaires.</p>
          <p>Lorsque les données ne sont plus nécessaires, elles peuvent être supprimées ou anonymisées.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>9. Suppression du compte</h2>
          <p>Vous pouvez demander la suppression de votre compte ImoFlex.</p>
          <p>La demande peut être effectuée depuis l'application lorsqu'une fonctionnalité de suppression de compte est disponible. Vous pouvez également nous contacter à : <a href="mailto:repostinardakotegnon@gmail.com" className="text-[var(--imx-accent-light)] underline">repostinardakotegnon@gmail.com</a></p>
          <p>Lorsqu'un compte est supprimé, les données associées sont supprimées conformément à nos procédures de suppression, sous réserve des informations que nous sommes légalement autorisés ou obligés de conserver.</p>
          <p>Certaines données peuvent donc être conservées lorsque cela est nécessaire pour respecter une obligation légale, prévenir une fraude, résoudre un litige ou assurer la sécurité de la plateforme.</p>
          <div className="p-3 mt-2 rounded-xl bg-[var(--imx-surface-2)] border border-[var(--imx-border)] text-xs">
            <span className="font-bold text-[var(--imx-text-primary)]">Conformité Google Play :</span> Google Play demande que la suppression du compte soit accessible dans l'application et via une ressource web externe lorsqu'une application permet la création de comptes.
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>10. Vos droits</h2>
          <p>Selon les lois applicables, vous pouvez notamment demander :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>l'accès à vos données personnelles ;</li>
            <li>la correction d'informations incorrectes ;</li>
            <li>la suppression de votre compte et de vos données ;</li>
            <li>des informations sur la manière dont vos données sont utilisées ;</li>
            <li>la limitation de certains traitements lorsque cela est applicable.</li>
          </ul>
          <p>Pour exercer vos droits, contactez-nous : <a href="mailto:repostinardakotegnon@gmail.com" className="text-[var(--imx-accent-light)] underline">repostinardakotegnon@gmail.com</a></p>
          <p>Nous pouvons vous demander certaines informations afin de vérifier que la demande provient bien du titulaire du compte.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>11. Cookies et technologies similaires</h2>
          <p>Le site et l'application ImoFlex peuvent utiliser des technologies nécessaires au fonctionnement du service, à la conservation de certaines préférences, à l'authentification et à l'amélioration des performances.</p>
          <p>Nous n'utilisons pas ces technologies pour vendre vos données personnelles.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>12. Services tiers</h2>
          <p>ImoFlex peut utiliser des services fournis par des entreprises tierces afin d'assurer certaines fonctionnalités, notamment : l'hébergement, la base de données, l'authentification, les paiements, les notifications, etc.</p>
          <p>Ces prestataires peuvent traiter certaines données uniquement dans le cadre des services qu'ils fournissent. La liste pourra évoluer avec le développement de la plateforme.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>13. Utilisation des données à des fins publicitaires</h2>
          <p>Dans sa version actuelle, ImoFlex n'a pas pour objectif de vendre les données personnelles de ses utilisateurs à des annonceurs.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>14. Données des enfants</h2>
          <p>ImoFlex n'est pas conçu spécifiquement pour les enfants. Nous ne cherchons pas volontairement à collecter des données personnelles auprès de personnes qui n'ont pas l'âge requis pour utiliser nos services.</p>
          <p>Si nous découvrons qu'un compte a été créé avec des informations appartenant à une personne qui ne devrait pas utiliser le service, nous pouvons prendre les mesures appropriées, notamment supprimer le compte et les données associées lorsque cela est nécessaire.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>15. Modifications de cette Politique de confidentialité</h2>
          <p>Nous pouvons modifier cette Politique de confidentialité lorsque cela est nécessaire, notamment en cas :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>d'évolution de l'application ;</li>
            <li>d'ajout de nouvelles fonctionnalités ;</li>
            <li>de changement de prestataire ;</li>
            <li>d'évolution de nos pratiques ;</li>
            <li>d'évolution des obligations légales.</li>
          </ul>
          <p>La date de dernière mise à jour sera indiquée en haut de cette page.</p>
          <p>Nous vous encourageons à consulter régulièrement cette page afin de prendre connaissance des éventuelles modifications.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>16. Contact</h2>
          <p>Si vous avez une question concernant cette Politique de confidentialité ou la manière dont ImoFlex traite vos données personnelles, vous pouvez nous contacter.</p>
          <p className="font-semibold text-[var(--imx-text-primary)]">ImoFlex<br />Fondateur : Répotinard AKOTEGNON<br />Cotonou, Bénin</p>
          <p>Email : <a href="mailto:repostinardakotegnon@gmail.com" className="text-[var(--imx-accent-light)] underline">repostinardakotegnon@gmail.com</a><br />
          Téléphone : +229 01 29 11 59 64</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[var(--imx-text-primary)]" style={{ fontFamily: 'Sora' }}>17. Entrée en vigueur</h2>
          <p>Cette Politique de confidentialité entre en vigueur à compter du : <br /><strong>21 août 2026</strong></p>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}
