# Structure d'une fiche packaging

Une référence = un objet du tableau `packagings` dans `data/packaging.json`.
Colonne **Source** : <kbd>INP</kbd> = piloté par Inpulse (écrasé à chaque synchro),
<kbd>TFB</kbd> = saisi par TFB, <kbd>calc</kbd> = déduit à la génération (à vérifier).

## Racine

| Chemin | Type | Source | Notes |
|---|---|---|---|
| `id` | slug | calc | dérivé du nom, sert d'identifiant d'URL et de dossier photos |
| `nom` | texte | INP | libellé Inpulse, affiché partout |
| `app.famille` | énum | calc | Boîte, Sac, Gobelet, Couvercle, Bague, Bowl, Bouteille, Étiquette, Papier, Vaisselle, Couverts, Serviette, Accessoire — sert aux filtres |
| `app.marquage` | énum | calc | TFB / Neutre / Co-branding |
| `app.statut` | énum | TFB | Actif, En test, À écouler, Arrêté, À compléter |
| `inpulse.prix_ht` | nombre | INP | € HT unité d'achat Inpulse |
| `inpulse.dispo` | texte | INP | « 17/18 » = points de vente approvisionnables |
| `inpulse.fournisseur` | texte | INP | |
| `inpulse.categorie` / `sous_categorie` | texte | INP | PACKAGING / PACKAGING TFB |
| `inpulse.unite_achat` | texte | INP | libellé du conditionnement de commande, ex. « CARTON(S) DE 1000PCE » |
| `inpulse.actif` | booléen | INP | référence encore active côté Inpulse |
| `inpulse.ingredient` | texte | INP | rattachement ingrédient Inpulse, souvent nul |

`app.*` n'existe pas dans Notion : ces trois champs sont ajoutés pour filtrer,
regrouper et compter. Ils sont modifiables comme les autres.

## 1 · Informations générales

### Identification
| Chemin | Type | Source |
|---|---|---|
| `identification.intitule_inpulse` | texte | INP — **clé de rapprochement** |
| `identification.sku_fournisseur` | texte | INP — champ `sku` d'Inpulse |

### Dimensions
| Chemin | Unité | Source |
|---|---|---|
| `dimensions.longueur_cm` | cm | calc si présent dans le libellé, sinon TFB |
| `dimensions.largeur_cm` | cm | idem |
| `dimensions.profondeur_soufflet_cm` | cm | idem |
| `dimensions.hauteur_cm` | cm | idem |
| `dimensions.dimensions_a_plat_cm` | cm | **calc** — Largeur × Hauteur selon la famille (`config.js`) ; sert de valeur forcée quand le mode est `manuel` |
| `dimensions.a_plat_mode` | — | TFB — `auto` (défaut) ou `manuel` |
| `dimensions.developpe_cm` | cm | **calc** — familles Sac et Boîte uniquement ; sert de valeur forcée quand le mode est `manuel` |
| `dimensions.developpe_mode` | — | TFB — `auto` (défaut) ou `manuel` |
| `dimensions.rabat_collage_cm` | cm | TFB — paramètre du développé, défaut 2 |
| `dimensions.fond_cm` | cm | TFB — paramètre du développé, défaut soufflet ÷ 2 + 2 |
| `dimensions.tolerance_mm` | mm | TFB |

Les quatre cotes se saisissent en **texte libre décimal** (la virgule vaut le
point) : plus de sélecteur numérique. Formules et applicabilité par famille :
`config.js` › `DIM_A_PLAT_PAR_FAMILLE`, `A_PLAT_FORMULES`, `DEVELOPPE`.
Une famille absente de la table tombe en saisie **manuelle** — une cote fausse
envoyée à un imprimeur coûte une production entière, donc aucune formule n'est
devinée. Les familles non développables (Gobelet, Bouteille, Bowl, Vaisselle,
Couvercle) **masquent** le champ, qui sort alors du calcul de complétude.

Convention de lecture appliquée à la génération : pour un **sac**, `22x12x40` se lit
largeur × soufflet × hauteur ; pour tout le reste, longueur × largeur × hauteur.
`D183` devient un diamètre reporté en longueur et largeur. **À valider référence par référence.**

### Matière
| Chemin | Unité | Source |
|---|---|---|
| `matiere.matiere` | — | calc (déduit du libellé) puis TFB |
| `matiere.grammage_g_m2` | g/m² | TFB |
| `matiere.epaisseur_um` | µm | TFB |
| `matiere.poids_unitaire_g` | g | TFB |
| `matiere.contact_alimentaire` | oui/non | calc (non pour tote bag, mug, tasse, étiquette, porte-gobelet) |

## 2 · Design & gabarit

| Chemin | Type | Source |
|---|---|---|
| `design.design_valide_tfb` | chemin fichier | TFB |
| `design.gabarit_fournisseur` | chemin fichier | TFB |
| `design.logo` | chemin fichier | TFB |
| `design.couleurs.pantone_principal` | texte | TFB |
| `design.couleurs.pantone_secondaire` | texte | TFB |
| `design.couleurs.pantone_tertiaire` | texte | TFB |
| `design.couleurs.nb_couleurs_impression` | nombre | TFB |
| `design.support_rendu.type_support` | énum | calc puis TFB — kraft brun/blanc, carton compact, carton couché, papier ingraissable, carton + PE, PS/PP, PET, PLA, grès, bois, coton, ouate, papier adhésif |
| `design.support_rendu.grammage_g_m2` | g/m² | TFB |
| `design.support_rendu.finition` | énum | TFB — mat / brillant / vernis / sans |
| `design.bat.valide_par` | texte | TFB |
| `design.bat.date_validation` | date | TFB |
| `design.bat.fichier` | chemin fichier | TFB |
| `design.mentions_obligatoires.denomination_produit` | texte | TFB |
| `design.mentions_obligatoires.poids_contenance` | texte | calc si le libellé porte une contenance (10 cl, 900 ml…) |
| `design.mentions_obligatoires.allergenes` | texte | TFB |
| `design.mentions_obligatoires.ddm_dlc` | texte | TFB |
| `design.mentions_obligatoires.adresse_raison_sociale` | texte | TFB |
| `design.mentions_obligatoires.logo_tri_recyclabilite` | texte | TFB |

## 3 · Conditionnement & logistique

| Chemin | Unité | Source |
|---|---|---|
| `logistique.nombre_par_carton` | pièces | INP — `packagings[].quantity` |
| `logistique.unite_commande` | — | INP — déduit du libellé (Carton / Boîte / Rouleau / Unité) |
| `logistique.prix_unitaire_ht` | € | INP — `price / quantity`, calculé à la volée |
| `logistique.cartons_par_palette` | cartons | TFB |
| `logistique.conditions_stockage` | énum/texte | TFB |
| `logistique.moq` | pièces | TFB |
| `logistique.delai_reappro_jours` | jours | TFB |
| `deploiement.points_de_vente` | liste de codes | TFB — OB, SD, SF, PG, SV, TP, LBA, NE, LV, LNV, RB, LIL3, LP, BC, PP, BCJ, BDJ, BGH |
| `deploiement.date_mise_en_service` | date | TFB |
| `deploiement.date_fin_service` | date | TFB — refusée si antérieure à la mise en service ; une fois passée, la référence est *hors service* (bandeau de fiche + filtre de liste) |

`deploiement.points_de_vigilance` a été **retiré de la fiche** : texte libre sans
structure, qui ne se filtrait pas, ne se cherchait pas et n'alimentait aucun
contrôle. Son contenu relève d'une condition de stockage, d'une note de design
ou d'une consigne opérationnelle. La clé reste tolérée dans le JSON (rien n'est
détruit) mais n'est plus ni affichée ni exportée ; le contenu au 09/09/2026 a
été extrait pour arbitrage (43 références, aucune valeur renseignée).

## 4 · Usage TFB

| Chemin | Unité | Source |
|---|---|---|
| `usage_tfb.usage` | texte | calc (proposition par famille) puis TFB |
| `usage_tfb.quantite_par_emballage` | selon l'unité | TFB |
| `usage_tfb.unite_quantite` | — | TFB — `pièces` (défaut), `g`, `kg`, `mL`, `L`, `cm`, `m`, `m²` (`config.js` › `UNITES_QUANTITE`) |
| `usage_tfb.recettes_migre` | booléen | drapeau technique de migration, voir ci-dessous |

`usage_tfb.recettes_concernees` a été **retiré**. Au chargement, tout contenu
restant est reversé dans `usage_tfb.usage`, préfixé par « Recettes : », puis le
drapeau `recettes_migre` évite de rejouer l'opération. Rien n'est perdu.

## 5 · Photos

`photos` est un tableau de 4 chemins, dans un ordre fixe :

| Index | Prise attendue |
|---|---|
| 0 | Produit nu |
| 1 | Produit garni |
| 2 | Mise en situation boutique |
| 3 | Gabarit à plat |

Les fichiers vivent dans `assets/photos/<id>/`. Une case vide affiche un emplacement
en pointillés dans la fiche.

## Complétude

Tous les champs marqués TFB ci-dessus sont **modifiables dans l'app** et enregistrés
dans Netlify Blobs (voir README). Les champs INP ne le sont pas : ils seraient écrasés
à la synchro suivante.

La barre *Fiche remplie* compte les champs TFB **applicables à la référence**
(les champs Inpulse ne comptent pas : ils sont toujours remplis). Le
dénominateur varie donc d'une famille à l'autre — 48 champs pour un sac ou une
boîte, 46 pour un gobelet dont les dimensions à plat et le développé n'ont pas
de sens. Un champ calculé compte comme rempli dès que la formule aboutit.
Chaque onglet affiche son propre compteur `n/total`, ce qui permet de voir d'un
coup d'œil s'il manque le design, la logistique ou les photos.

## Audit Inpulse du 08/09/2026

43 / 43 références rapprochées. Ce que la synchronisation a révélé :

### 4 prix qui semblent saisis à l'unité sur un conditionnement carton

| Référence | Prix Inpulse | Conditionnement |
|---|---|---|
| BOITE 2X PATISSERIE TFB | 0,159 € | carton de 500 |
| BOITE 6X PATISSERIE TFB | 0,439 € | carton de 100 |
| BOITES A CAKES TFB | 0,568 € | carton de 5 000 |
| SAC GRANDS GATEAUX | 0,539 € | carton de 100 |

Ailleurs le prix est bien celui du carton (98,10 € pour 900 boîtes éclair, soit
0,109 €/pièce). Ces quatre lignes cassent donc le calcul de coût matière : soit
le prix est à corriger dans Inpulse, soit le conditionnement.

### 7 références à 0,00 €

Les 3 étiquettes en rouleau et les 3 cofanetto (Litograf), plus le sachet
galettes TFB × Isigny. Prix réellement offert, refacturé ailleurs, ou jamais saisi ?

### 2 PCB incohérents avec leur libellé

| Référence | Libellé Inpulse | Quantité enregistrée |
|---|---|---|
| KIT 2/1 EN BOIS | CARTON(S) DE 1000 PCS | 1 |
| PAPIER INGRAISSABLE 900×1000 | CARTON DE 300 UNITES | 1 |

Conséquence directe : pas de prix unitaire calculable sur ces deux lignes.

### 3 SKU manquants

`BOUTEILLE PET 25CL + BOUCHON NOIR` (SKU = « ? »), `GOBELET 35CL NEUTRE` et
`SACHET GALETTES TFB X ISIGNY` (vides).

### 2 questions de fond

1. **Dimensions déduites du libellé** : 15 références sur 43. La convention
   sac = largeur × soufflet × hauteur est une hypothèse — à confirmer avant de
   s'appuyer dessus pour commander.
2. **`INVENTAIRE - COFANETTO CAKE …`** : trois lignes qui ressemblent à des articles
   d'inventaire plutôt qu'à des packagings vendables. À garder dans la base, ou à sortir ?
