# ImoFlex — Guide d'Architecture & Procédure de Migration de Domaine

Ce document détaille l'architecture de production d'ImoFlex et fournit la procédure complète, pas à pas, pour démarrer sur **Vercel**, distribuer l'application **Android sur le Google Play Store**, puis migrer en toute sérénité vers votre **nom de domaine personnalisé officiel** (ex. `imoflex.com`, `imoflex.bj`), sans rupture de service ni interruption pour les utilisateurs mobiles.

---

## 1. Principes d'Architecture & Découplage

L'architecture ImoFlex repose sur 4 piliers indépendants :

```
                  ┌──────────────────────────────┐
                  │      Utilisateurs Web        │
                  │   (imoflex.vercel.app        │
                  │    puis imoflex.com)         │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
┌──────────────────────────────┐ │ ┌──────────────────────────────┐
│  Utilisateurs Android (Play) │ │ │        Paiements FedaPay     │
│   (App native com.imoflex)   │ │ │ (Mobile Money MTN/Moov/Celt) │
└──────────────┬───────────────┘ │ └──────────────┬───────────────┘
               │                 │                │
               │ (API Supabase)  │                │ (Webhooks directs)
               ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Projet Unique)                     │
│  - Base PostgreSQL (RLS strict, tables, relations, triggers)   │
│  - Supabase Auth (Sessions JWT, Tokens de récupération)        │
│  - Supabase Storage (Photos, Quittances, Contrats)             │
│  - Edge Functions (initiate-payment, fedapay-webhook, etc.)    │
└─────────────────────────────────────────────────────────────────┘
```

### Règles clés garanties dans le code :
1. **Base Supabase Unique** : Le web et le mobile Android consomment strictement la même instance Supabase (`jogvvjiuumrswwamanqk.supabase.co`).
2. **Aucun domaine en dur dans le code** : Toutes les URL dynamiques (redirection mot de passe, partage d'annonces, invitations) sont centralisées dans `src/lib/domainConfig.ts` et pilotées par la variable d'environnement `VITE_SITE_URL`.
3. **Paiements FedaPay 100% découplés du domaine web** :
   - L'Edge Function `initiate-payment` génère une `callback_url` pointant directement vers Supabase (`${SUPABASE_URL}/functions/v1/fedapay-webhook`).
   - Le webhook FedaPay ne transite JAMAIS par Vercel ni par votre domaine web. Un changement de domaine n'a donc **aucun impact** sur les encaissements ni sur les retraits propriétaires.

---

## 2. Phase 1 — Démarrage sur Vercel (Sans domaine acheté)

Au démarrage, votre application web est déployée sur le sous-domaine attribué par Vercel (ex: `https://imoflex.vercel.app` ou `https://imoflex-projet.vercel.app`).

### A. Configuration des variables d'environnement sur Vercel
Dans votre projet Vercel (**Settings > Environment Variables**) :
- `VITE_SUPABASE_URL` = `https://jogvvjiuumrswwamanqk.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `<VOTRE_CLE_ANON>`
- `VITE_SITE_URL` = `https://votre-projet.vercel.app` (sans slash à la fin)
- `VITE_SENTRY_DSN` = `<OPTIONNEL>`

### B. Configuration Supabase Auth initiale
Dans le tableau de bord Supabase (**Authentication > URL Configuration**) :
1. **Site URL** :
   ```
   https://votre-projet.vercel.app
   ```
2. **Redirect URLs (Allow List)** :
   Ajoutez toutes les URLs suivantes (indispensable pour supporter à la fois le dev local, l'app Android et le web Vercel) :
   ```
   http://localhost:5173/**
   https://localhost/**
   https://votre-projet.vercel.app/**
   https://*.vercel.app/**
   ```

---

## 3. Phase 2 — Migration vers votre Nom de Domaine Personnalisé

Lorsque vous achetez votre nom de domaine (ex: `imoflex.com` ou `imoflex.bj`) chez un registrar (Namecheap, OVH, Hostinger, Cloudflare, Gandi, etc.), suivez scrupuleusement les étapes ci-dessous. **Il n'y aura aucune interruption de service.**

### Étape 1 : Ajouter le domaine sur Vercel
1. Allez sur votre dashboard **Vercel** > Projet **ImoFlex** > **Settings** > **Domains**.
2. Saisissez votre domaine racine : `imoflex.com`.
3. Vercel vous demandera automatiquement d'ajouter également la variante avec `www` (`www.imoflex.com`) et de choisir celle par défaut (recommandé : rediriger `www.imoflex.com` vers `imoflex.com`).

### Étape 2 : Configuration DNS chez votre Registrar
Dans la zone DNS de votre registrar, configurez les enregistrements suivants fournis par Vercel :

| Type | Nom / Hôte | Valeur / Cible | TTL |
| :--- | :--- | :--- | :--- |
| **A** | `@` (ou vide) | `76.76.21.21` | Auto / 3600 |
| **CNAME** | `www` | `cname.vercel-dns.com.` | Auto / 3600 |

> [!NOTE]
> La propagation DNS prend généralement entre 5 minutes et 24 heures selon votre registrar.
> Pendant ce laps de temps, l'ancien domaine Vercel continue de fonctionner normalement.

### Étape 3 : SSL & HTTPS automatique
Vercel génère automatiquement un certificat SSL gratuit et renouvelé (Let's Encrypt). Une fois les DNS propagés, un badge vert `Valid Configuration` apparaît sur Vercel.

### Étape 4 : Mettre à jour la variable d'environnement sur Vercel
1. Dans Vercel > **Settings** > **Environment Variables**.
2. Modifiez la valeur de `VITE_SITE_URL` :
   ```
   VITE_SITE_URL = https://imoflex.com
   ```
3. Cliquez sur **Redeploy** (ou poussez un commit) pour que le nouveau domaine soit injecté dans le bundle de production.

### Étape 5 : Mettre à jour Supabase Auth (Sans casser l'ancien)
Dans **Supabase** > **Authentication** > **URL Configuration** :
1. **Site URL** :
   Passez à la nouvelle adresse :
   ```
   https://imoflex.com
   ```
2. **Redirect URLs (Autorisées)** :
   Conservez les anciennes URLs Vercel et ajoutez les nouvelles. Cela permet aux emails de réinitialisation déjà envoyés de continuer à fonctionner !
   ```
   http://localhost:5173/**
   https://localhost/**
   https://votre-projet.vercel.app/**
   https://*.vercel.app/**
   https://imoflex.com/**
   https://www.imoflex.com/**
   ```

### Étape 6 : Activer la redirection permanente (308) depuis l'ancienne adresse Vercel
Pour que les visiteurs ayant enregistré l'URL Vercel ou les moteurs de recherche soient automatiquement redirigés vers `imoflex.com` :
1. Dans Vercel > **Settings** > **Domains**.
2. Sur la ligne de votre domaine Vercel (`votre-projet.vercel.app`), cliquez sur **Edit**.
3. Choisissez **Redirect to imoflex.com** (Status Code: `308 Permanent Redirect`).
4. Toutes les anciennes URLs renverront instantanément et de façon transparente vers `imoflex.com`.

---

## 4. Application Mobile Android (Google Play Store)

L'application Android est construite avec **Capacitor** et empaquetée sous l'identifiant `com.imoflex.app`.

### A. Pourquoi l'application Android ne casse pas lors de la migration ?
1. L'application mobile Android embarque localement ses assets web dans l'APK/AAB (`server: { androidScheme: 'https' }`). Elle ne charge pas le site web à travers une iframe distante.
2. Toutes les requêtes de données partent directement vers l'API REST de Supabase (`https://jogvvjiuumrswwamanqk.supabase.co`). Le changement de domaine web n'altère en rien ces requêtes.
3. Les partages d'annonces depuis l'application Android utilisent désormais la fonction centralisée `getShareUrl('/annonce/ID')` (définie dans `src/lib/domainConfig.ts`). Ainsi, le lien partagé vers des tiers pointe toujours vers votre site officiel public et non vers `localhost`.

### B. Configuration Android App Links (`assetlinks.json`)
Pour que les liens `https://imoflex.com/annonce/123` s'ouvrent directement dans l'application mobile sans passer par le navigateur :
1. Récupérez l'empreinte SHA256 de signature de votre application :
   - Si vous utilisez **Google Play App Signing** : Play Console > Configuration > Signature de l'application > Empreinte numérique du certificat SHA-256.
   - Si vous signez vous-même avec un keystore :
     ```bash
     keytool -list -v -keystore mon-keystore.keystore -alias imoflex
     ```
2. Ouvrez le fichier [public/.well-known/assetlinks.json](file:///c:/Users/R%C3%A9potinard/Documents/Imoflex-projet/public/.well-known/assetlinks.json) et remplacez la valeur par votre empreinte SHA256.
3. Dans `android/app/src/main/AndroidManifest.xml`, assurez-vous que l'hôte correspond à votre domaine :
   ```xml
   <intent-filter android:autoVerify="true">
       <action android:name="android.intent.action.VIEW" />
       <category android:name="android.intent.category.DEFAULT" />
       <category android:name="android.intent.category.BROWSABLE" />
       <data android:scheme="https" android:host="imoflex.com" />
   </intent-filter>
   ```

---

## 5. Checklist Complète de Non-Régression

Avant de considérer la migration comme terminée, validez les points suivants :

- [ ] **Accès Web** : `https://imoflex.com` charge la page d'accueil avec le certificat SSL vert.
- [ ] **Redirection ancienne URL** : Taper `https://votre-projet.vercel.app` redirige en 308 vers `https://imoflex.com`.
- [ ] **Authentification Web** : Connexion locataire, propriétaire et agence réussie.
- [ ] **Mot de passe oublié** : Demander un lien de reset mot de passe. Le lien reçu par email doit commencer par `https://imoflex.com/reset-password` et permettre le changement sans erreur.
- [ ] **Partage d'annonces** : Cliquer sur "Partager" sur une annonce web ou Android. Le lien copié doit être au format `https://imoflex.com/annonce/...`.
- [ ] **Application Android** : Lancer l'application mobile. Navigation, chargement des logements, profil utilisateur opérationnels.
- [ ] **Paiement Mobile Money (FedaPay)** : Initier un paiement de test. Vérifier que la transaction est confirmée et que le solde est crédité via le webhook Supabase.
- [ ] **Téléchargement Quittances PDF** : Génération des quittances de loyer fonctionnelle sans erreur de domaine.
