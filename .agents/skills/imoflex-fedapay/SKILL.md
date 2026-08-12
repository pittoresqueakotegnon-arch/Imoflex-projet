---
name: imoflex-fedapay
description: Gestion des paiements FedaPay dans Imoflex. Utiliser cette skill pour travailler sur les paiements, transactions, webhooks, retraits, Edge Functions et intégrations FedaPay.
---

# Imoflex — FedaPay

## Objectif

Cette skill définit les règles de développement et de maintenance du système de paiement FedaPay d'Imoflex.

## Principe

Le système de paiement est une fonctionnalité critique.

Avant toute modification, analyser le flux existant de bout en bout.

## Avant toute modification

Vérifier :

1. Les Edge Functions concernées.
2. Les appels à l'API FedaPay.
3. Les variables d'environnement.
4. Les webhooks.
5. Les statuts des transactions.
6. Les tables Supabase liées aux paiements.
7. La gestion des erreurs.
8. Les risques de double traitement.

## Sécurité

Ne jamais exposer dans le frontend :

- clé secrète FedaPay ;
- token privé ;
- clé API privée ;
- secrets d'environnement.

Les opérations nécessitant des secrets doivent être exécutées côté serveur.

Ne jamais copier une clé secrète dans le code source.

## Création d'un paiement

Avant de modifier le processus de paiement, vérifier :

- la création de la transaction ;
- le montant ;
- la devise ;
- l'identifiant de l'utilisateur ;
- l'identifiant de la commande ou opération ;
- l'URL de retour ;
- le traitement du statut ;
- la gestion des erreurs.

Ne jamais considérer un paiement comme réussi uniquement parce que l'utilisateur revient sur une page de succès.

Le statut réel de la transaction doit être vérifié.

## Webhooks

Les webhooks doivent être traités côté serveur.

Vérifier l'authenticité des événements lorsque le mécanisme approprié est disponible.

Le traitement doit être idempotent.

Un même événement webhook ne doit pas provoquer plusieurs crédits, paiements ou modifications de solde.

## Transactions

Chaque transaction doit conserver suffisamment d'informations pour permettre :

- son identification ;
- son suivi ;
- son rapprochement avec l'utilisateur ;
- son rapprochement avec l'opération concernée ;
- son suivi de statut.

Ne jamais modifier arbitrairement le statut d'une transaction sans comprendre son origine.

## Erreurs

Prévoir une gestion claire des :

- erreurs API ;
- timeouts ;
- transactions refusées ;
- transactions annulées ;
- paiements incomplets ;
- webhooks répétés ;
- erreurs réseau.

Ne jamais masquer une erreur critique.

## Tests

Avant de considérer une modification du système de paiement comme terminée :

1. Tester les cas normaux.
2. Tester les erreurs.
3. Tester les paiements refusés.
4. Tester les événements répétés lorsque pertinent.
5. Vérifier les changements dans Supabase.
6. Vérifier les Edge Functions.

Ne jamais utiliser une vraie transaction financière pour tester une fonctionnalité sans autorisation explicite.

## Déploiement

Avant de déployer une modification FedaPay :

- vérifier les variables d'environnement ;
- vérifier les Edge Functions ;
- vérifier les migrations éventuelles ;
- vérifier les webhooks ;
- vérifier les logs ;
- vérifier les dépendances.

Ne jamais supprimer ou remplacer une configuration de paiement existante sans comprendre son impact.

## Principe essentiel

Pour tout problème FedaPay :

Inspecter d'abord.

Comprendre le flux.

Identifier la cause.

Modifier le minimum nécessaire.

Tester.

Vérifier le résultat réel.