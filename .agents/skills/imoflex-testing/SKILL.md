---
name: imoflex-testing
description: Tests et vérification du projet Imoflex. Utiliser cette skill après une modification importante pour vérifier le code, le build, les fonctionnalités, les erreurs et les régressions.
---

# Imoflex — Testing

## Objectif

Vérifier que les modifications apportées à Imoflex fonctionnent correctement et ne cassent pas les fonctionnalités existantes.

## Avant de modifier

Identifier :

1. Les fichiers concernés.
2. Les fonctionnalités concernées.
3. Les tests existants.
4. Les commandes de test disponibles.
5. Les dépendances utilisées.

Réutiliser les tests existants lorsque c'est possible.

## Après une modification

Effectuer les vérifications adaptées à la modification :

1. Vérifier les erreurs de code.
2. Lancer les tests disponibles.
3. Vérifier le build si nécessaire.
4. Vérifier les erreurs TypeScript ou JavaScript.
5. Vérifier les erreurs frontend.
6. Vérifier les Edge Functions concernées.
7. Vérifier les migrations si la base de données a été modifiée.

## Tests frontend

Pour une modification frontend importante :

- vérifier que la page se charge ;
- vérifier les interactions principales ;
- vérifier les formulaires ;
- vérifier les erreurs visibles ;
- vérifier les comportements responsive lorsque pertinent.

Lorsque Chrome DevTools est disponible, l'utiliser pour inspecter les erreurs du navigateur et vérifier le comportement réel de l'application.

## Tests backend

Pour les fonctionnalités backend :

- vérifier les entrées ;
- vérifier les réponses ;
- vérifier les erreurs ;
- vérifier l'authentification ;
- vérifier les autorisations ;
- vérifier les effets sur Supabase.

## Paiements

Pour les fonctionnalités FedaPay :

- ne jamais utiliser une vraie transaction uniquement pour tester ;
- utiliser les mécanismes de test disponibles ;
- vérifier les statuts ;
- vérifier les erreurs ;
- vérifier l'idempotence des webhooks.

## Régression

Après une modification importante, vérifier que les fonctionnalités existantes directement liées fonctionnent toujours.

Ne pas modifier du code non concerné uniquement pour faire disparaître une erreur sans comprendre sa cause.

## Correction des erreurs

Lorsqu'un test échoue :

1. Identifier l'erreur réelle.
2. Identifier sa cause.
3. Corriger la cause.
4. Relancer le test.
5. Vérifier qu'aucune nouvelle erreur n'est apparue.

Ne jamais masquer une erreur simplement pour obtenir un test vert.

## Validation finale

Une modification est considérée comme terminée uniquement lorsque :

- les erreurs critiques sont corrigées ;
- les tests disponibles passent ;
- le build passe lorsque nécessaire ;
- les fonctionnalités concernées sont vérifiées ;
- aucune régression évidente n'est détectée.

Ne jamais déclarer une tâche terminée sans avoir effectué les vérifications réellement possibles.