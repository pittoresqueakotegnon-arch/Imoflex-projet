# 📋 Commandes Supabase CLI — ImoFlex

> **Supabase CLI v2.109.1** • PowerShell (Windows) • Projet Cloud uniquement (pas de Docker local)
>
> Toutes les commandes sont à exécuter depuis le dossier racine du projet :
> ```
> cd C:\Users\HP\Desktop\Imoflex\imoflex_corrige
> ```

---

## 1. 🔐 Authentification

| Commande | Description |
|----------|-------------|
| `supabase login` | Connexion à votre compte Supabase (ouvre le navigateur) |
| `supabase logout` | Déconnexion / suppression du token local |
| `supabase projects list` | Lister tous vos projets Supabase |

---

## 2. 🔗 Liaison au projet Cloud

> **À faire en premier** si vous venez de cloner le repo ou sur une nouvelle machine.

```powershell
# Lier le projet local au projet Cloud ImoFlex
supabase link --project-ref jogvvjiuumrswwamanqk

# Vérifier la liaison
supabase status
```

> Le `project-ref` est visible dans l'URL de votre Dashboard :
> `https://supabase.com/dashboard/project/jogvvjiuumrswwamanqk`

---

## 3. 🗄️ Migrations (Base de données)

### Voir les migrations

```powershell
# Lister toutes les migrations locales
supabase migration list

# Afficher l'état des migrations (appliquées vs en attente)
supabase db status
```

### Appliquer les migrations en production

```powershell
# ⚠️ IMPORTANT : Applique TOUTES les migrations non encore appliquées sur le Cloud
supabase db push

# Appliquer sans confirmation interactive
supabase db push --yes
```

> **Utilisez `db push` après chaque ajout de fichier dans `supabase/migrations/`**
> Exemple : après avoir ajouté `028_fix_storage_rls_listing_photos.sql`

### Créer une nouvelle migration

```powershell
# Créer un fichier de migration vide avec timestamp automatique
supabase migration new <nom_de_la_migration>

# Exemples :
supabase migration new fix_listings_rls
supabase migration new add_column_users
supabase migration new cleanup_indexes
# → crée : supabase/migrations/20260807XXXXXX_<nom>.sql
```

### Diff et repair

```powershell
# Comparer le schéma local vs Cloud (génère un diff SQL)
supabase db diff --linked

# Marquer une migration comme déjà appliquée (sans l'exécuter)
supabase migration repair --status applied <timestamp>

# Marquer une migration comme non appliquée (pour la réexécuter)
supabase migration repair --status reverted <timestamp>
```

---

## 4. ⚡ Edge Functions

### Déployer les fonctions

```powershell
# Déployer TOUTES les fonctions en une commande
supabase functions deploy

# Déployer une seule fonction
supabase functions deploy fedapay-webhook
supabase functions deploy reconcile-payments
supabase functions deploy cleanup-orphaned-listing-photos
supabase functions deploy create-wallet
supabase functions deploy initiate-payment
supabase functions deploy request-withdrawal
supabase functions deploy update-overdue-rent-periods
supabase functions deploy admin-system-health

# Déployer sans vérification JWT (obligatoire pour les webhooks FedaPay)
supabase functions deploy fedapay-webhook --no-verify-jwt
```

### Lister et supprimer

```powershell
# Lister les fonctions déployées
supabase functions list

# Supprimer une fonction
supabase functions delete <nom_de_la_fonction>
```

### Appeler une fonction Cloud depuis PowerShell

```powershell
# Appeler reconcile-payments manuellement
$headers = @{
    "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpvZ3Z2aml1dW1yc3d3YW1hbnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5OTk2NzgsImV4cCI6MjA5ODU3NTY3OH0.jQBt1R7dxli8oNJ2aQt--tB3M8U_-pe8GfeLEd5AD7g"
    "Content-Type"  = "application/json"
}
Invoke-RestMethod -Uri "https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-payments" `
    -Method POST -Headers $headers -Body '{}'

# Appeler cleanup-orphaned-listing-photos manuellement
Invoke-RestMethod -Uri "https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/cleanup-orphaned-listing-photos" `
    -Method POST -Headers $headers -Body '{}'

# Appeler admin-system-health
Invoke-RestMethod -Uri "https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/admin-system-health" `
    -Method GET -Headers $headers
```

---

## 5. 🔑 Secrets (Variables d'environnement des Edge Functions)

```powershell
# Lister tous les secrets configurés
supabase secrets list

# Ajouter / mettre à jour un secret
supabase secrets set FEDAPAY_WEBHOOK_SECRET=votre_secret_ici
supabase secrets set FEDAPAY_API_KEY=votre_cle_api_ici

# Ajouter plusieurs secrets en une seule commande
supabase secrets set CLE1=valeur1 CLE2=valeur2

# Supprimer un secret
supabase secrets unset NOM_DU_SECRET
```

---

## 6. 🪣 Storage

```powershell
# Lister les buckets
supabase storage ls

# Lister le contenu du bucket listing-photos
supabase storage ls ss:///listing-photos

# Lister un dossier spécifique (ex: annonce UUID)
supabase storage ls "ss:///listing-photos/uuid-de-l-annonce"

# Uploader un fichier
supabase storage cp C:\chemin\local\photo.webp ss:///listing-photos/dossier/photo.webp

# Télécharger un fichier
supabase storage cp ss:///listing-photos/dossier/photo.webp C:\chemin\local\

# Supprimer un fichier
supabase storage rm ss:///listing-photos/dossier/fichier.webp

# Supprimer un dossier entier (récursif)
supabase storage rm ss:///listing-photos/uuid-de-l-annonce --recursive
```

---

## 7. 🔍 Inspection et diagnostics DB

```powershell
# Requêtes les plus lentes (performances)
supabase inspect db slow-queries --linked

# Index inutilisés (à nettoyer)
supabase inspect db unused-indexes --linked

# Taille des tables
supabase inspect db table-sizes --linked

# Verrous actifs (deadlocks ?)
supabase inspect db locks --linked

# Connexions par rôle
supabase inspect db role-connections --linked

# Requêtes outliers (coût CPU élevé)
supabase inspect db outliers --linked

# Taille des index
supabase inspect db index-sizes --linked

# Statistiques sur le cache
supabase inspect db cache-hit --linked
```

---

## 8. 📦 Génération de types TypeScript

```powershell
# Générer les types TypeScript depuis le schéma Cloud
# (utile après ajout de colonnes ou tables)
supabase gen types typescript --linked > src/lib/database.types.ts

# Génération avec schéma spécifique
supabase gen types typescript --linked --schema public > src/lib/database.types.ts
```

---

## 9. 🌱 Seed (données de test)

```powershell
# Exécuter le fichier de seed (supabase/seed.sql)
supabase db seed --linked
```

---

## 10. 📸 Snapshots de config

```powershell
# Voir la config actuelle du projet
supabase config show

# Sauvegarder la config localement
supabase config show > supabase/config_backup.toml
```

---

## 11. 🔄 Workflows recommandés

### ✅ Après avoir créé une nouvelle migration `.sql`

```powershell
# 1. Vérifier ce qui va être appliqué
supabase migration list

# 2. Appliquer en production
supabase db push --yes

# 3. Vérifier que tout est OK
supabase db status
```

### ✅ Après avoir modifié une Edge Function

```powershell
# Déployer la fonction
supabase functions deploy nom-de-la-fonction

# Vérifier
supabase functions list
```

### ✅ Workflow complet (nouveau déploiement / nouvelle machine)

```powershell
# 1. Connexion
supabase login

# 2. Liaison au projet
supabase link --project-ref jogvvjiuumrswwamanqk

# 3. Appliquer les migrations
supabase db push --yes

# 4. Déployer toutes les fonctions
supabase functions deploy

# 5. Vérifier les secrets
supabase secrets list
```

---

## 12. 📌 Référence rapide ImoFlex

```powershell
# 🔗 Lier le projet
supabase link --project-ref jogvvjiuumrswwamanqk

# 🗄️ Appliquer les migrations
supabase db push --yes

# ⚡ Déployer TOUTES les fonctions
supabase functions deploy

# ⚡ Déployer le webhook FedaPay (sans vérif JWT — obligatoire)
supabase functions deploy fedapay-webhook --no-verify-jwt

# 🔑 Vérifier les secrets configurés
supabase secrets list

# 📊 État des migrations
supabase migration list

# 🔍 Requêtes lentes en production
supabase inspect db slow-queries --linked

# 🪣 Voir les photos uploadées
supabase storage ls ss:///listing-photos
```

---

## ⚠️ Notes importantes

> **`supabase db push`** — Applique toutes les migrations non encore exécutées.
> À utiliser après chaque nouveau fichier dans `supabase/migrations/`.

> **Ne jamais modifier** un fichier de migration déjà appliqué en production.
> Toujours créer un **nouveau** fichier pour corriger un problème.

> **Docker non requis** pour les commandes `--linked` (mode Cloud).
> `supabase start / stop` nécessitent Docker (développement local uniquement).

> **`fedapay-webhook` doit toujours être déployé avec `--no-verify-jwt`**
> car FedaPay n'envoie pas de JWT Supabase dans ses requêtes webhook.

---

*Projet : ImoFlex • Ref : `jogvvjiuumrswwamanqk` • CLI : v2.109.1 • Windows PowerShell*
