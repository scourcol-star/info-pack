# info-pack — base de données packaging TFB

Application mono-page, même charte et même mécanique de publication que **tfb-achats**.
Elle réunit en une fiche par référence : ce qu'Inpulse sait déjà (prix, dispo, fournisseur)
et ce que seul TFB sait (dimensions, matière, gabarit, BAT, logistique, usage, photos).

## Contenu

| Fichier | Rôle |
|---|---|
| `index.html` | l'app : coquille HTML + charte TFB |
| `app.js` | toute la logique (chargement, filtres, fiche 5 onglets, export XLSX) |
| `data/packaging.json` | **la base** : 43 références + référentiels + métadonnées |
| `data/packaging-inpulse.tsv` | extrait brut d'Inpulse, trace de la source |
| `netlify/functions/store.mjs` | enregistre les saisies TFB dans Netlify Blobs (function v2) |
| `netlify/functions/packaging.js` | agrège les 9 pages de l'API Inpulse et ne renvoie que le PACKAGING |
| `netlify/functions/proxy.js` | proxy Inpulse générique (la clé API reste côté serveur) |
| `data/inpulse-enrich.tsv` | SKU, prix et conditionnements relevés dans Inpulse le 08/09 |
| `netlify.toml` | publication + routage `/api/proxy` |
| `assets/photos/<id>/` | les 4 photos par référence |
| `preview.html` | même app avec la base embarquée — s'ouvre sans serveur |

## Structure d'une fiche

Cinq onglets, calqués sur la fiche Notion :

1. **Informations générales** — Identification, Dimensions, Matière
2. **Design & gabarit** — fichiers (design validé TFB, gabarit fournisseur, logo),
   Couleurs & pantones, Support et rendu, BAT, Mentions obligatoires
3. **Conditionnement & logistique** — Logistique, Déploiement
4. **Usage TFB** — Recettes concernées
5. **Photos** — produit nu, produit garni, situation boutique, gabarit à plat

Voir `SCHEMA.md` pour le détail champ par champ.

## Origine des données

- **Liste des références** : Inpulse › Ingrédients fournisseurs › catégorie `PACKAGING` (43 réf.)
- **Rapprochement** : `identification.intitule_inpulse` == `supplier-product.name`
- **Champs pilotés par Inpulse** (jamais saisis à la main, écrasés à chaque synchro) :
  `inpulse.prix_ht`, `inpulse.dispo`, `inpulse.fournisseur`, `inpulse.unite_achat`,
  `inpulse.categorie`, `inpulse.sous_categorie`, `identification.sku_fournisseur`,
  `logistique.nombre_par_carton`, `logistique.unite_commande`, `logistique.prix_unitaire_ht`

L'API Inpulse pagine par 100 et ne filtre pas par catégorie : `/api/packaging`
parcourt donc les 9 pages côté serveur et ne renvoie que les 43 références
PACKAGING. Un seul appel depuis le navigateur, mis en cache 5 minutes par le CDN.
- **Tout le reste** est saisi par TFB dans `data/packaging.json`.

Chaque champ porte son badge d'origine dans la fiche : <kbd>INPULSE</kbd> ou <kbd>TFB</kbd>.

## Déploiement Netlify

1. Netlify → *Add new project* → *Import from GitHub* → `scourcol-star/info-pack`
2. Aucun build à configurer (`publish = "."` via `netlify.toml`)
3. Variable d'environnement : `API_KEY` = clé API Inpulse
   (*Site configuration → Environment variables*)

Sans `API_KEY`, l'app reste parfaitement utilisable : elle affiche le dernier extrait
figé dans `data/packaging.json` et signale « Inpulse non joignable » dans le bandeau.

## Saisir dans l'app

Tous les champs badgés **TFB** sont modifiables directement dans la fiche : on tape,
on sort du champ, c'est enregistré. Le badge en haut à droite dit où on en est
(*Enregistrement…* → *Enregistré à 14:32*).

Trois couches se superposent, dans cet ordre :

1. `data/packaging.json` — le socle versionné dans le repo
2. `/api/store` — les saisies faites dans l'app, stockées dans **Netlify Blobs**
   sous forme de chemins pointés : `{ "<id>": { "matiere.grammage_g_m2": 420 } }`
3. Inpulse — écrase ses propres champs à chaque synchro

Un champ badgé **INPULSE** n'est donc jamais saisissable : il serait écrasé au
prochain rafraîchissement. Pour le corriger, il faut le corriger dans Inpulse.

L'écriture se fait par **patch** (`POST /api/store` avec `{ops:[{id,path,value}]}`),
donc deux personnes qui saisissent en même temps ne s'écrasent pas.
Le stockage ne demande aucune configuration — mais il faut une **function v2**
(`store.mjs`, ESM, avec `export default`) : c'est le seul format où Netlify injecte
tout seul la configuration du blob store. En v1 CommonJS il faudrait fournir
`siteID` et un token à la main. Si le store est injoignable, l'app reste utilisable
et le badge passe au rouge pour prévenir que rien n'est enregistré.

Les fichiers (design validé, gabarit, BAT, logo) et les 4 photos se renseignent
par **lien** — l'URL Drive ou Dropbox, avec aperçu pour les images. Le téléversement
direct dans le blob store est la suite prévue.

## Alimenter la base

`data/packaging.json` est un simple JSON versionné : une modification = un commit,
donc un historique lisible et un rollback possible. Les champs vides s'affichent
« à compléter » et la barre *Fiche remplie* donne l'avancement, par référence
et par onglet (compteur `n/total` sur chaque onglet).
