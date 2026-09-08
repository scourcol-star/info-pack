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
| `netlify/functions/proxy.js` | proxy Inpulse (la clé API reste côté serveur) |
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
  `inpulse.prix_ht`, `inpulse.dispo`, `inpulse.fournisseur`, `inpulse.categorie`,
  `inpulse.sous_categorie`
- **Tout le reste** est saisi par TFB dans `data/packaging.json`.

Chaque champ porte son badge d'origine dans la fiche : <kbd>INPULSE</kbd> ou <kbd>TFB</kbd>.

## Déploiement Netlify

1. Netlify → *Add new project* → *Import from GitHub* → `scourcol-star/info-pack`
2. Aucun build à configurer (`publish = "."` via `netlify.toml`)
3. Variable d'environnement : `API_KEY` = clé API Inpulse
   (*Site configuration → Environment variables*)

Sans `API_KEY`, l'app reste parfaitement utilisable : elle affiche le dernier extrait
figé dans `data/packaging.json` et signale « Inpulse non joignable » dans le bandeau.

## Alimenter la base

`data/packaging.json` est un simple JSON versionné : une modification = un commit,
donc un historique lisible et un rollback possible. Les champs vides s'affichent
« à compléter » et la barre *Fiche remplie* donne l'avancement, par référence
et par onglet (compteur `n/total` sur chaque onglet).
