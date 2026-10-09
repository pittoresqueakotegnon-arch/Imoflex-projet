# ImoFlex — Correctifs appliqués (6 octobre 2026)

> **Aucun de ces correctifs n'a été exécuté contre Supabase ni FedaPay.** Ils ont été rédigés par lecture du code et des documentations FedaPay, puis vérifiés par contrôle de syntaxe (TypeScript) et par un test Node de la logique de signature. **Appliquer d'abord sur un projet Supabase de test**, exécuter `supabase/tests/056_verification.sql`, puis les tests du plan de tests (colonne « échec probable »).

## 1. Ordre de déploiement

1. **Sauvegarder la base** (export complet) avant toute migration.
2. Appliquer la migration `20261006000000_056_security_and_financial_fixes.sql` (`supabase db push`).
3. Déployer les Edge Functions modifiées, **dans cet ordre** : `request-withdrawal`, `reconcile-withdrawals`, `fedapay-webhook` (avec `--no-verify-jwt`), `reconcile-payments`, `check-payment-status`, `delete-account`.
4. Déployer le front (Vercel).
5. Exécuter `supabase/tests/056_verification.sql`, puis un retrait de 100 FCFA de bout en bout.

> La migration change la signature de `execute_authorized_withdrawal` : tant que la nouvelle `request-withdrawal` n'est pas déployée, **les retraits échouent** (l'ancienne version appelle l'ancienne fonction). Faire les étapes 2 et 3 dans la même fenêtre de maintenance.

## 2. Ce qui a été corrigé

| Réf. | Problème | Correctif | Fichiers |
|---|---|---|---|
| **E2** | Les payouts FedaPay n'étaient jamais lancés : la documentation FedaPay indique qu'un payout créé reste « pending » tant que `PUT /payouts/start` n'est pas appelé | Appel de lancement après la création, avec `merchant_reference` = identifiant du retrait ; relance par le rapprochement si l'envoi a échoué | `_shared/payouts.ts`, `request-withdrawal`, `reconcile-withdrawals` |
| **E3** | Retraits sans identifiant de payout jamais rapprochés, wallet bloqué | Recherche par référence marchande (`GET /payouts/merchant/{ref}`) ; si FedaPay répond 404 (jamais créé), remboursement automatique ; alerte d'audit pour les payouts qui ne démarrent pas ; fonction `admin_resolve_withdrawal` pour la résolution manuelle tracée | `reconcile-withdrawals`, migration (§4) |
| **E4** | `payout.sent` pouvait terminer un retrait déjà remboursé | Passage par `reconcile_withdrawal_status` (gardé) + déclencheur interdisant de modifier un retrait `complete` ou `echoue` | `fedapay-webhook`, migration (§4) |
| **S-01** | `approve_listing_deletion` faisait confiance à un identifiant d'administrateur passé en argument, et restait exécutable par tous | Autorisation par `auth.uid()` + `is_admin()` ; paramètre `p_admin_id` ignoré (compatibilité) ; `REVOKE` pour `anon` ; vérification que la demande est « pending » et correspond à l'annonce ; écriture au journal d'audit | migration (§5) |
| **S-02** | Blocage du code de retrait non enregistré (l'exception annulait le compteur) ; hash lisible côté navigateur ; fonction appelable directement ; autorisation réutilisable | Table `withdrawal_pins` fermée aux clients (hash, compteur, blocage migrés puis colonnes supprimées de `users`) ; l'erreur de code **renvoie un code d'erreur** sans exception, donc le compteur est enregistré ; l'autorisation est consommée à chaque erreur ; limitation à 3 autorisations par minute ; `execute_authorized_withdrawal` réservée au `service_role` (la fonction Edge fournit l'identité vérifiée) ; fonctions de changement (`change_withdrawal_pin`) et de réinitialisation par un administrateur (`admin_reset_withdrawal_pin`) | migration (§1–3), `request-withdrawal` |
| **S-03/E11** | Aucun moyen de changer ou réinitialiser le code | `change_withdrawal_pin`, `admin_reset_withdrawal_pin` (interface à ajouter) | migration (§1) |
| **S-04** | Suppression de compte sans contrôle du solde ; échec partiel pour les locataires avec historique | Refus (409) si solde > 0, retrait ou paiement en cours, bail actif ; sinon anonymisation **complète** (e-mail inclus), sessions révoquées, et **désactivation** (au lieu de suppression) si historique financier ou locatif | `delete-account` |
| **S-05** | Format de signature du webhook peut-être incompatible avec FedaPay (un rejet 401 fait désactiver le webhook après 10 échecs) | Vérificateur acceptant le format horodaté (`t=…,s=…`, tolérance 5 min) **et** l'ancien format ; testé en Node ; tests Deno fournis | `_shared/webhook_signature.ts`, `fedapay-webhook`, `tests/webhook-signature.test.ts` |
| **E6** | Paiement abandonné : montant réservé indéfiniment | Un paiement en attente depuis plus de 30 min ne réserve plus le solde (il reste suivi par le rapprochement) ; statut FedaPay `expired` traité comme refus | migration (§6), rapprochements |
| **E7** | Montant confirmé par FedaPay non comparé | Écart de montant → paiement **non crédité**, ligne d'audit `payment_amount_mismatch` | `fedapay-webhook`, `reconcile-payments`, `check-payment-status` |
| **E8** | Un double clic générait deux clés d'idempotence différentes | Clé stable par tentative (`useRef`), renouvelée à la fin de la tentative | `Payer.tsx` |
| **E9** | Paiement validé sans propriétaire à créditer | Erreur explicite : le paiement reste en attente | migration (§6) |
| **S-06** | Journal d'audit appelant un service tiers pour l'IP | Appel supprimé (l'IP devra être ajoutée côté serveur) | `src/lib/audit.ts` |
| **S-07** | Hôtes Sentry de la CSP invalides (`https://o*.ingest.sentry.io` n'est pas une syntaxe valide) | Hôtes `*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.ingest.de.sentry.io` | `vercel.json` |
| **S-08** | `allowBackup="true"` | `false` | `AndroidManifest.xml` |
| **S-09** | `commande.md` : adresse du projet, clé anon, nom de secret erroné ; `.env.example` : adresse du projet et ligne corrompue | Valeurs neutralisées, `FEDAPAY_SECRET_KEY`, ligne réécrite | `commande.md`, `.env.example` |
| **S-10** | Sentry : 100 % des traces, relecture de sessions | Traces 10 %, relecture des sessions normales désactivée, textes et médias masqués | `src/main.tsx` |
| **S-11** | Pas de limite serveur sur les photos et avatars | 5 Mo (avatars) et 10 Mo (photos), types image uniquement | migration (§8) |
| **S-12** | Colonnes modifiables par un propriétaire (modération des annonces, message des demandes, notifications) | Déclencheurs sur `listings` et `contact_requests` ; `UPDATE` limité à `is_read` sur `notifications` | migration (§7) |
| **S-13** | Fonction héritée de vérification d'identité | Supprimée | migration (§5) |
| — | Index redondants, ledger sans unicité | 6 index supprimés ; index unique du ledger (créé seulement s'il n'y a pas de doublon) | migration (§9) |
| — | Notification « Retrait en cours » avec le type « retrait terminé » | Type `confirmation` | `request-withdrawal` |
| — | `config.toml` : `verify_jwt` du webhook non déclaré | `[functions.fedapay-webhook] verify_jwt = false` | `supabase/config.toml` |

## 3. Précisions apportées à mes analyses précédentes

En relisant le code pour appliquer les correctifs, j'ai constaté que certaines affirmations de mes documents étaient inexactes. Elles sont corrigées dans les documents mis à jour :

- La **CSP** limitait déjà `connect-src` à des hôtes précis (Supabase, FedaPay, Firebase, Sentry) : ce n'était pas `https:`. Le défaut réel était la syntaxe invalide de l'hôte Sentry. Le service d'adresse IP tiers était donc déjà bloqué par la CSP.
- `admin-system-health` **vérifie bien le rôle administrateur** dans son code.
- Le webhook avait **déjà** un contrôle de fraîcheur fondé sur la date du contenu (5 minutes).
- `initiate-payment` avait **déjà** une vérification d'idempotence avant la création de la transaction, et le front envoyait déjà une clé ; seule la **stabilité de la clé** entre deux clics manquait.
- La limitation de la création de paiement est de 5 appels par minute.

## 4. Ce qui n'a PAS été fait (et pourquoi)

| Sujet | Raison / action recommandée |
|---|---|
| **Détention des fonds** | Décision juridique et contractuelle, pas un correctif de code : faire confirmer le modèle par FedaPay |
| **CORS `*` des Edge Functions** | Exige la liste exacte des origines (domaine web, origine Capacitor) : à fournir pour restreindre |
| **Journal d'audit écrit par le navigateur** | La politique d'insertion existe encore ; à remplacer par des écritures serveur (fonctions) |
| **`users_select_as_owner` expose toutes les colonnes du locataire** | À traiter par une vue limitée ; touche plusieurs écrans |
| **Interface** pour changer le code de retrait, réinitialiser un code, résoudre un retrait bloqué | Fonctions SQL prêtes (`change_withdrawal_pin`, `admin_reset_withdrawal_pin`, `admin_resolve_withdrawal`) ; écrans à créer |
| **Coordonnées de support écrites en dur** | Décision produit |
| **Adresse du projet dans les anciennes migrations** | Historique de migrations : ne pas réécrire ; paramétrer les prochaines tâches planifiées |
| **`temp_migrations.sql`** (copie de travail à la racine) | À supprimer du dépôt après vérification |
| **Montants `NUMERIC` du ledger** | Changement de type à planifier avec les données réelles |
| **Rappels, bien/agence vérifiés, messagerie, signature de bail** | Évolutions produit, hors correctifs |
| **Test réel FedaPay** | Les formats `PUT /payouts/start` et `GET /payouts/merchant/{ref}` viennent de la documentation FedaPay et n'ont pas été essayés |

## 5. Points à vérifier en priorité après déploiement

1. **Payout** : un retrait de 100 FCFA doit passer `pending` → `started`/`processing` → `sent`, et `withdrawals.status` → `complete`. Si FedaPay refuse le format de l'appel `start`, la fonction journalise `payout_start_failed` (table `audit_logs`) et le rapprochement réessaie.
2. **Webhook** : après un paiement test, le journal du webhook ne doit montrer aucun rejet « signature » ; sinon relever l'en-tête reçu et ajuster `webhook_signature.ts`. Un webhook rejeté 10 fois est désactivé par FedaPay.
3. **Code de retrait** : trois mauvais codes → `withdrawal_pins.failed_attempts = 3` et `locked_until` renseigné (test 7 du script SQL).
4. **pgcrypto** : si la création ou la vérification du code échoue avec « function crypt does not exist », le schéma de l'extension diffère ; les nouvelles fonctions ajoutent déjà `extensions` au chemin de recherche.
5. **Écran Retrait** : tester les messages d'erreur « Code de retrait incorrect » et « Retraits temporairement bloqués ».
6. **CSP** : ouvrir l'application en production et vérifier dans la console du navigateur l'absence d'erreur « Refused to connect » (Sentry compris).
7. **Téléversements** : tester l'envoi d'une photo d'annonce et d'un avatar après les limites de type et de taille.
