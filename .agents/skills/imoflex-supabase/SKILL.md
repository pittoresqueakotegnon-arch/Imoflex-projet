---
name: imoflex-supabase
description: Développement et maintenance de Supabase pour Imoflex. Utiliser cette skill pour travailler sur la base PostgreSQL, les tables, relations, RLS, Auth, migrations et Edge Functions Supabase.
---

# Imoflex — Supabase

## Objectif

Cette skill définit la méthode à suivre pour toute tâche liée à Supabase dans Imoflex.

## Méthode obligatoire

Avant toute modification :

1. Inspecter l'architecture Supabase existante.
2. Vérifier les tables concernées.
3. Vérifier les relations.
4. Vérifier les politiques RLS.
5. Vérifier les fonctions, triggers et contraintes concernés.
6. Vérifier les Edge Functions concernées.
7. Comprendre les dépendances avant de modifier.

## Base de données

Privilégier :

- des migrations explicites ;
- des modifications réversibles ;
- des contraintes adaptées ;
- des relations cohérentes ;
- des politiques RLS sécurisées.

Ne jamais supprimer des données, tables ou colonnes importantes sans confirmation explicite.

## RLS

Toute nouvelle table contenant des données utilisateur doit être examinée pour déterminer les politiques RLS nécessaires.

Ne jamais désactiver RLS simplement pour résoudre un problème.

Les permissions doivent respecter le rôle et l'utilisateur connecté.

## Supabase Auth

Respecter le système d'authentification existant.

Ne jamais exposer de secrets ou de service role key dans le frontend.

## Edge Functions

Les opérations sensibles doivent rester côté serveur.

Avant de modifier une Edge Function :

1. Lire son code existant.
2. Identifier ses variables d'environnement.
3. Vérifier ses appels externes.
4. Vérifier sa gestion des erreurs.
5. Vérifier son impact sur les autres fonctionnalités.

## MCP Supabase

Lorsque le MCP Supabase est disponible, l'utiliser pour vérifier les informations réelles du projet plutôt que de les deviner.

Ne jamais supposer qu'une table, une colonne ou une fonction existe sans vérification lorsque cette information peut être récupérée.

## Après modification

Vérifier :

- les erreurs SQL ;
- les migrations ;
- les politiques RLS ;
- les Edge Functions concernées ;
- les tests disponibles ;
- les éventuelles régressions.

Ne jamais déclarer une modification réussie sans avoir réellement effectué les vérifications nécessaires.