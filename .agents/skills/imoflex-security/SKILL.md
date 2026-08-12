---
name: imoflex-security
description: Sécurité du projet Imoflex. Utiliser cette skill pour toute modification concernant l'authentification, les autorisations, RLS, secrets, API, données utilisateur et opérations sensibles.
---

# Imoflex — Sécurité

## Objectif

Maintenir un niveau de sécurité élevé dans toute l'application Imoflex.

La sécurité ne doit jamais être sacrifiée pour résoudre rapidement un problème.

## Avant toute modification

Identifier :

1. Les données concernées.
2. Les utilisateurs concernés.
3. Les permissions nécessaires.
4. Les fichiers frontend et backend concernés.
5. Les secrets ou variables d'environnement concernés.
6. Les politiques RLS concernées.
7. Les Edge Functions concernées.

## Secrets

Ne jamais placer dans le frontend :

- service role key ;
- clés secrètes ;
- clés privées FedaPay ;
- tokens privés ;
- mots de passe ;
- secrets API.

Utiliser les variables d'environnement et les mécanismes sécurisés du projet.

Ne jamais afficher un secret dans les logs.

Ne jamais demander à l'utilisateur de copier un secret dans le code source.

## Authentification

Respecter Supabase Auth et le système d'authentification existant.

Vérifier systématiquement l'utilisateur connecté avant toute opération nécessitant une identité.

Ne jamais considérer qu'un utilisateur est authentifié uniquement parce qu'une donnée utilisateur est envoyée par le frontend.

L'identité doit être vérifiée côté serveur lorsque l'opération est sensible.

## Autorisation

L'authentification et l'autorisation sont deux choses différentes.

Être connecté ne signifie pas avoir accès à toutes les données.

Vérifier les permissions correspondant au rôle et à la ressource demandée.

Un utilisateur ne doit jamais pouvoir accéder ou modifier les données privées d'un autre utilisateur.

## RLS

Pour les tables Supabase :

- vérifier que RLS est activé lorsque nécessaire ;
- vérifier les policies SELECT ;
- vérifier les policies INSERT ;
- vérifier les policies UPDATE ;
- vérifier les policies DELETE.

Ne jamais désactiver RLS simplement pour contourner une erreur.

Toute nouvelle policy doit être limitée au minimum nécessaire.

## Frontend

Le frontend ne doit jamais être considéré comme une zone de confiance.

Les validations frontend servent à améliorer l'expérience utilisateur mais ne remplacent jamais les validations backend.

Les opérations sensibles doivent être protégées côté serveur.

## API et Edge Functions

Toute donnée reçue du frontend doit être considérée comme non fiable.

Valider :

- types ;
- formats ;
- identifiants ;
- montants ;
- permissions ;
- paramètres obligatoires.

Ne jamais faire confiance aveuglément aux valeurs envoyées par le client.

## Données utilisateur

Ne récupérer et ne stocker que les données nécessaires au fonctionnement de la fonctionnalité.

Éviter d'exposer inutilement des informations personnelles dans les réponses API.

## Logs

Les logs ne doivent jamais contenir :

- mots de passe ;
- tokens ;
- clés secrètes ;
- données sensibles inutiles.

Les erreurs doivent être suffisamment détaillées pour permettre le diagnostic sans exposer de secrets.

## Modifications sensibles

Demander confirmation avant :

- désactivation d'une protection ;
- modification massive des permissions ;
- suppression de données sensibles ;
- exposition d'une donnée privée ;
- modification importante des policies RLS ;
- modification d'un mécanisme d'authentification.

## Vérification

Après une modification de sécurité :

1. Vérifier les permissions.
2. Vérifier les policies RLS.
3. Vérifier les accès utilisateur.
4. Vérifier les erreurs.
5. Tester les cas autorisés.
6. Tester les cas interdits.

## Principe essentiel

Ne jamais contourner une protection de sécurité pour faire fonctionner une fonctionnalité.

Comprendre la protection.

Identifier la cause.

Corriger proprement.

Tester les accès autorisés et refusés.