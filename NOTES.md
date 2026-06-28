# Notes techniques — Widget Dashy & token d'API

Cette note explique comment connecter un dashboard externe (typiquement
**Dashy**) au résumé de tâches de Kanby.

## Principe

Kanby expose deux points d'accès *optionnels*, séparés de l'application
principale et invisibles si vous ne les utilisez pas :

1. **`GET /api/widget/summary`** — un endpoint JSON qui renvoie un résumé
   condensé des tâches de l'utilisateur (aujourd'hui, en retard, à venir,
   compteurs).
2. **`/widget/view`** — une petite page HTML autonome, stylée et compacte,
   pensée pour être intégrée dans une **iframe** de ~300-400 px de large.

L'authentification se fait par un **token d'API personnel**, *distinct* de la
session de connexion classique. C'est volontaire : Dashy interroge Kanby
depuis un dashboard externe, sans navigateur ni cookie de session.

## Créer un token d'API

1. Connectez-vous à Kanby.
2. Allez dans **Profil** → section **Tokens d’API**.
3. Donnez un nom (ex. « Dashy ») et cliquez sur **Générer un token**.
4. **Copiez immédiatement** le token affiché : il ne sera plus jamais montré.
   Il a la forme `kbt_<64 caractères hexadécimaux>`.

### Sécurité

- Le token brut n'est stocké **nulle part** en clair : seul son **hash
  SHA-256** est conservé en base.
- Le token est **personnel** : il donne accès au résumé de *vos* tâches
  uniquement (tableaux que vous possédez ou dont vous êtes membre).
- Vous pouvez le **révoquer** à tout moment depuis la page Profil.
- Le token donne accès à **tous les endpoints de l'API** (lecture et écriture).
  Pour un accès en lecture seule (widget), créez un token dédié et révoquez-le
  si nécessaire.

## Endpoint `/api/widget/summary`

### Appel

```http
GET /api/widget/summary
Authorization: Bearer kbt_xxxxxxxxxxxxxxxx
```

Le token peut aussi être passé en paramètre d'URL (utile pour une iframe qui
ne peut pas définir de header) :

```
GET /api/widget/summary?token=kbt_xxxxxxxxxxxxxxxx
```

### Réponse

```json
{
  "dueToday": [
    {
      "id": "ck...",
      "title": "Corriger le bug d'affichage",
      "dueDate": "2026-06-27T12:00:00.000Z",
      "boardId": "ck...",
      "boardName": "Site web",
      "boardType": "TEAM"
    }
  ],
  "overdue": [ /* tâches dont la date est passée */ ],
  "upcoming": [ /* 5 prochaines tâches (7 jours) */ ],
  "counts": {
    "dueToday": 1,
    "overdue": 0,
    "upcoming": 3,
    "totalOpen": 5
  }
}
```

Chaque élément contient : `id`, `title`, `dueDate` (ISO), `boardId`,
`boardName`, `boardType` (`PERSONAL` ou `TEAM`).

## Intégration dans Dashy

### Option A — Widget iframe (le plus simple)

Dans Dashy, ajoutez un widget de type **Iframe** (ou *Embedded Widget*) :

- **URL** : `http://<votre-kanby>:3000/widget/view?token=kbt_xxxxxxxxxxxxxxxx`
- **Largeur recommandée** : ~360 px
- **Hauteur recommandée** : ~600 px

La page `/widget/view` s'occupe de tout : elle appelle l'API en interne avec
votre token et affiche un résumé compact et stylé (compteurs + listes de
tâches aujourd’hui / en retard / à venir). Aucun menu, aucun chrome.

### Option B — Widget personnalisé (via l'API)

Si vous préférez construire votre propre widget Dashy (ex. *Custom API*
widget), appelez `/api/widget/summary` avec le header `Authorization: Bearer`
et exploitez directement le JSON renvoyé.

## Schéma d'authentification (rappel)

```
 Navigateur (session cookie)          Mobile / Dashy (token d'API)
        │                                     │
        ▼                                     ▼
  /api/boards, etc.                   /api/widget/summary
  /api/cards, etc.                    /api/boards, etc. (tous les endpoints)
  (JWT en cookie httpOnly)           (Bearer kbt_... ou ?token=)
```

Les tokens d'API (`kbt_...`) donnent désormais accès à **tous les endpoints**
(`/api/boards`, `/api/cards`, etc.), pas seulement au widget. Le token est
prioritaire si à la fois un cookie de session et un Bearer token sont présents.
Voir `API.md` pour la documentation complète.

- le middleware de pages protégées ignore `/api/widget/*` ;
- le widget n'utilise jamais la session cookie ;
- un token révoqué n'a plus aucun effet immédiatement.

## Vérification rapide

```bash
# Test de l'endpoint avec curl :
curl -H "Authorization: Bearer kbt_votre_token" \
     http://localhost:3000/api/widget/summary
```

Réponse attendue : un JSON comme ci-dessus, ou `401` si le token est
invalide/révoqué.