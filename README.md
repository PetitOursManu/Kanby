# Kanby

Un gestionnaire de tâches **Kanban** simple, vivant et **auto-hébergé**.
Pensé pour être installé facilement sur votre propre serveur via Docker.

Tableaux personnels et d'équipe, glisser-déposer fluide, animations soignées,
mode sombre, thème clair, 100 % responsive — et une **API complète** pour un
futur client mobile.

---

## Aperçu

- **Tableaux** personnels (privés) ou d'équipe (partagés avec invités par email)
- **Colonnes** personnalisables : renommer, réordonner par glisser-déposer,
  colorer, supprimer. Une colonne de type *Terminé* déclenche des confettis 🎉
- **Cartes** : titre, description, date d'échéance, étiquettes colorées,
  checklist avec barre de progression, assignation, commentaires
- **Glisser-déposer** : à la souris et au toucher (appui long de 200 ms sur
  mobile), avec effet d'inclinaison 3D pendant le déplacement
- **Mobile** : swipe horizontal entre les colonnes, menus en bottom-sheet
- **i18n** : interface disponible en Français et Anglais, sélecteur dans le profil
- **Notifications** : cloche dans la TopBar avec compteur de notifications non lues
- **Admin** : panneau d'administration (utilisateurs, tableaux, statistiques)
- **API** : tous les endpoints accessibles par token `kbt_` pour un client
  mobile ou un script externe — voir [`API.md`](./API.md)
- **Widget Dashy** : résumé de tâches intégrable en iframe — voir
  [`NOTES.md`](./NOTES.md)

---

## Installation en 5 minutes

### Prérequis

- **Docker** et **Docker Compose** installés sur votre serveur.
  - Sous Windows/Mac : installez [Docker Desktop](https://www.docker.com/products/docker-desktop).
  - Sous Linux : voir la [doc Docker](https://docs.docker.com/engine/install/).

### Étapes

1. **Récupérez les fichiers** de Kanby sur votre serveur :
   ```bash
   git clone https://github.com/PetitOursManu/Kanby.git
   cd Kanby
   ```

2. **Copiez le fichier d'exemple** de configuration :
   ```bash
   cp .env.example .env
   ```

3. **Éditez le fichier `.env`** et changez au minimum :
   - `JWT_SECRET` : mettez une chaîne aléatoire longue.
     Pour en générer une : `openssl rand -hex 32`
   - `DEFAULT_ADMIN_PASSWORD` : mot de passe temporaire du compte admin.
   - `DEFAULT_ADMIN_EMAIL` : l'email du compte admin.
   - `APP_URL` : l'adresse à laquelle vous accéderez à Kanby
     (ex. `https://kanby.mondomaine.fr`).

4. **Lancez l'application** :
   ```bash
   docker compose up -d
   ```
   Au premier démarrage, la base de données est créée et le compte admin est
   généré automatiquement.

5. **Ouvrez Kanby** dans votre navigateur à l'adresse indiquée par `APP_URL`
   (par défaut <http://localhost:3000>).

6. **Connectez-vous** avec l'email et le mot de passe admin définis dans
   `.env`. L'application vous demandera de **changer ce mot de passe** dès la
   première connexion.

### Ports Docker

- **Port par défaut** : `3000` (configurable via `APP_PORT` dans `.env`)
- **Port de test** : `3002` (via `docker-compose-test.yml` pour tester sans affecter la production)

---

## Mise à jour

```bash
git pull
docker compose build
docker compose up -d
```

Les migrations de base de données s'appliquent automatiquement au démarrage.

## Tests

Kanby inclut une suite de tests unitaires et d'intégration avec **Vitest** :

```bash
# Lancer tous les tests
npm run test

# Lancer les tests avec couverture
npm run test:coverage
```

Les tests couvrent :
- La validation des mots de passe
- Le rate limiting des endpoints API
- Les fonctions utilitaires

---

## Sauvegarde

```bash
# Sauvegarder
docker compose exec db pg_dump -U kanby kanby > sauvegarde.sql

# Restaurer
cat sauvegarde.sql | docker compose exec -T db psql -U kanby kanby
```

---

## API mobile & intégrations

Kanby expose une **API JSON complète** permettant à un client mobile
(Android / iOS) ou à un script externe d'utiliser toutes les fonctionnalités de
l'application.

### Authentification par token

1. **Connexion** : `POST /api/auth/token` avec `{ email, password }` →
   renvoie `{ token: "kbt_...", user: { ... } }`.
2. **Requêtes** : envoyer le token dans le header
   `Authorization: Bearer kbt_...` sur tous les endpoints `/api/*`.
3. **Déconnexion** : `POST /api/auth/revoke` avec le token → le révoque.

Les tokens sont hashés (SHA-256) en base et peuvent être révoqués à tout
moment depuis la page **Profil** ou via l'API.

### Documentation complète

Voir [`API.md`](./API.md) pour la liste de tous les endpoints, les corps de
requête, les réponses et des exemples `curl`.

---

## Widget Dashy (optionnel)

Kanby expose un résumé léger de vos tâches, intégrable dans un dashboard
externe comme **Dashy**. Voir [`NOTES.md`](./NOTES.md) pour la procédure
complète. Cette fonctionnalité est **100 % optionnelle** et reste invisible
si vous ne l'utilisez pas.

---

## Administration

Le compte admin a accès à un panneau **Admin** :
- liste des utilisateurs, activation/désactivation, suppression, création
- vue de tous les tableaux (personnels et d'équipe)
- statistiques simples (utilisateurs, tableaux, tâches actives/terminées)

---

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `POSTGRES_USER` | Utilisateur PostgreSQL | `kanby` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | `kanby` |
| `POSTGRES_DB` | Nom de la base | `kanby` |
| `APP_PORT` | Port exposé sur l'hôte | `3000` |
| `APP_URL` | URL publique (cookies sécurisés) | `http://localhost:3000` |
| `JWT_SECRET` | Secret de signature des sessions | **obligatoire** |
| `JWT_EXPIRES_IN` | Durée de session (secondes) | `2592000` (30 j) |
| `AUTO_ADMIN_ON_BOOT` | Crée l'admin au démarrage | `true` |
| `DEFAULT_ADMIN_EMAIL` | Email de l'admin par défaut | `admin@kanby.local` |
| `DEFAULT_ADMIN_PASSWORD` | Mot de passe admin temporaire | `changeme123` |
| `DEFAULT_ADMIN_NAME` | Nom affiché de l'admin | `Administrateur` |
| `AUTO_ADMIN_FIRST` | 1er inscrit devient admin si vrai | `false` |

---

## Stack technique

- **Next.js** (App Router) + **TypeScript**
- **PostgreSQL** + **Prisma** (ORM)
- **@dnd-kit** (glisser-déposer) + **framer-motion** (animations)
- **TailwindCSS** + **next-themes** (thème clair/sombre)
- **canvas-confetti** (effet de célébration)
- Authentification **JWT** (cookie httpOnly) + **tokens d'API** (`kbt_`) pour
  le widget Dashy et l'API mobile
- Déploiement **Docker** (image unique + Postgres)
- **i18n** : internationalisation FR/EN avec sélecteur de langue
- **Vitest** : tests unitaires et d'intégration

---

## Démarrage en développement (sans Docker)

```bash
npm install
cp .env.example .env          # configurez DATABASE_URL vers votre Postgres local
npx prisma migrate dev
npx prisma db seed
npm run dev
```

---

## Licence

Projet personnel — usage libre.