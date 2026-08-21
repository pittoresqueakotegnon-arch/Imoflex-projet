# Génération de la clé de signature Android (Release)

## ⚠️ À faire UNE SEULE FOIS — Sauvegardez le fichier `.keystore` et les mots de passe en lieu sûr

Perte du keystore = impossible de mettre à jour l'app sur le Play Store.

---

## Étape 1 : Générer le keystore

Depuis le dossier racine du projet, exécutez :

```bash
keytool -genkey -v \
  -keystore android/imoflex-release.keystore \
  -alias imoflex \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Répondez aux questions (nom, organisation, pays...), puis choisissez un mot de passe fort.

---

## Étape 2 : Configurer les variables dans `android/gradle.properties`

Décommentez et remplissez les 4 lignes à la fin du fichier :

```properties
KEYSTORE_PATH=../imoflex-release.keystore
KEYSTORE_PASSWORD=votre_mot_de_passe_keystore
KEY_ALIAS=imoflex
KEY_PASSWORD=votre_mot_de_passe_cle
```

---

## Étape 3 : Générer le bundle de release signé

```bash
# 1. Build Vite + sync Capacitor
npm run cap:build

# 2. Générer le .aab (App Bundle pour Play Store)
cd android
./gradlew bundleRelease

# Le fichier est généré dans :
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## Étape 4 : Vérification

```bash
# Vérifier que le bundle est bien signé
cd android
./gradlew :app:bundleRelease --info | grep "Signing"
```

---

## ⚠️ Sécurité

- **NE JAMAIS committer** `imoflex-release.keystore` ni les mots de passe dans Git.
- `android/imoflex-release.keystore` est déjà dans `.gitignore`.
- Sauvegardez le keystore dans un gestionnaire de mots de passe sécurisé (1Password, Bitwarden, etc.) ET dans un stockage cloud chiffré.

---

## Étape 5 : Icônes adaptives (à faire dans Android Studio)

1. Ouvrir le projet Android : `npm run cap:android`
2. Dans Android Studio → `File > New > Image Asset`
3. Icon Type : `Launcher Icons (Adaptive and Legacy)`
4. Foreground : `public/assets/logo-512.png` (rogner pour que le logo soit dans la zone de sécurité)
5. Background : couleur `#120D2A` (violet foncé ImoFlex)
6. Cliquer `Next` > `Finish`

Les icônes sont générées automatiquement dans tous les dossiers `mipmap-*`.

---

## Étape 6 : google-services.json (Firebase Push Notifications)

1. Aller sur [Firebase Console](https://console.firebase.google.com)
2. Créer un projet → Ajouter une app Android avec le package `com.imoflex.app`
3. Télécharger `google-services.json`
4. Placer le fichier dans `android/app/google-services.json`
5. Re-synchroniser Capacitor : `npm run cap:sync`
