# ImoFlex — déploiement de la correction sécurité

Cette livraison contient les migrations `038` à `045`. Elles doivent
être appliquées dans l'ordre sur le projet Supabase cible avant de déployer le
front-end.

## Commandes de déploiement

```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npx supabase db push
npx supabase functions deploy initiate-payment
npx supabase functions deploy request-withdrawal
npx supabase functions deploy fedapay-webhook
npx supabase functions deploy send-push-notification
npx supabase functions deploy cleanup-orphaned-listing-photos
```

Vérifiez ensuite que les secrets suivants sont bien présents :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FEDAPAY_SECRET_KEY`
- `FEDAPAY_WEBHOOK_SECRET`
- `FEDAPAY_BASE_URL` (sandbox ou production)

## Contrôles indispensables avant ouverture au public

1. Essayer de créer un compte avec `role: admin` dans les métadonnées Auth : le
   profil doit rester `locataire`.
2. Avec un compte locataire, tenter un `UPDATE users SET role = 'admin'` et un
   `UPDATE wallets SET available_balance = ...` par la Data API : les deux
   appels doivent être refusés.
3. Effectuer un paiement sandbox et vérifier que le webhook crédite une seule
   fois le propriétaire même si l'événement est rejoué.
4. Simuler un timeout sur un retrait : le retrait doit rester
   `en_traitement`, sans remboursement automatique, jusqu'au rapprochement du
   payout FedaPay.
5. Tester le parcours « Rejoindre un logement » avec deux locataires en même
   temps : un seul bail actif et une seule échéance doivent être créés.
6. Créer deux comptes et vérifier que chacun ne peut lire que ses propres
   conversations de support, y compris via l'API Supabase directe.
7. Envoyer une capture dans le support : le bucket `support_attachments` doit
   être privé et l'image ne doit être accessible que via une URL signée
   temporaire à un participant de la conversation ou à un administrateur.

Ne passez les clés ni les URLs FedaPay de production dans le front-end. Elles
restent exclusivement dans les secrets des Edge Functions.
