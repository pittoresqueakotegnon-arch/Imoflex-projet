---
name: imoflex-deployment
description: Déploiement du projet Imoflex. Utiliser cette skill pour préparer, vérifier et effectuer les déploiements du frontend, des Edge Functions, des migrations et des services associés.
---

# Imoflex — Deployment

## Objectif

Déployer Imoflex de manière contrôlée, sécurisée et vérifiable.

## Avant tout déploiement

Vérifier :

1. Les fichiers modifiés.
2. Les erreurs de code.
3. Les tests disponibles.
4. Le build.
5. Les variables d'environnement nécessaires.
6. Les migrations éventuelles.
7. Les Edge Functions concernées.
8. Les dépendances.
9. Les éventuels changements de configuration.

## Base de données

Avant de déployer une migration :

- vérifier son contenu ;
- vérifier son impact ;
- vérifier les tables concernées ;
- vérifier les policies RLS ;
- éviter toute opération destructive non confirmée.

Ne jamais supprimer ou modifier massivement des données sans confirmation explicite.

## Edge Functions

Avant de déployer une Edge Function :

1. Vérifier son code.
2. Vérifier ses variables d'environnement.
3. Vérifier ses dépendances.
4. Vérifier les appels externes.
5. Vérifier la gestion des erreurs.
6. Vérifier les fonctions qui dépendent d'elle.

## Secrets

Ne jamais mettre de secrets directement dans le code.

Ne jamais afficher de secrets dans les logs.

Vérifier que les variables d'environnement nécessaires sont configurées dans l'environnement cible.

## Frontend

Avant un déploiement frontend :

- lancer le build ;
- vérifier les erreurs ;
- vérifier les variables d'environnement ;
- vérifier les routes principales ;
- vérifier les fonctionnalités critiques.

## Paiements

Pour un déploiement impliquant FedaPay :

- vérifier les Edge Functions ;
- vérifier les webhooks ;
- vérifier les variables d'environnement ;
- vérifier les statuts de transaction ;
- vérifier les mécanismes d'idempotence.

Ne jamais considérer un paiement comme fonctionnel sans vérification réelle du flux approprié.

## Déploiement risqué

Demander confirmation avant :

- migration destructive ;
- suppression de données ;
- suppression d'une fonction importante ;
- modification massive de la base ;
- changement majeur du système de paiement ;
- opération irréversible.

## Après déploiement

Vérifier :

1. Que le déploiement s'est terminé correctement.
2. Que le build ou la fonction démarre correctement.
3. Les logs disponibles.
4. Les fonctionnalités principales.
5. Les éventuelles erreurs générées après le déploiement.

Si une erreur apparaît, l'analyser avant de poursuivre.

## Principe essentiel

Préparer.

Vérifier.

Déployer.

Observer.

Tester.

Corriger si nécessaire.

Ne jamais déclarer un déploiement réussi sans vérifier son résultat réel.