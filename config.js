/* ============================================================
   TFB — Info Pack · configuration métier
   Tout ce qui se règle sans toucher au code de la fiche vit ici :
   formules de dimensions, paramètres du développé, unités.
   Chargé AVANT app.js (index.html) — pas de dépendance à app.js.
   ============================================================ */

/* ------------------------------------------------------------
   1 · Dimensions à plat, famille par famille
   mode : 'auto'   → calculé avec la formule nommée dans `formule`
          'manuel' → saisie à la main (aucune formule fiable)
          'na'     → non applicable, le champ est masqué
   Règle de sûreté : toute famille absente de cette table tombe en
   'manuel'. Une cote fausse envoyée à un imprimeur coûte une
   production entière — on ne devine pas une formule.
   ------------------------------------------------------------ */
const DIM_A_PLAT_PAR_FAMILLE = {
  'Sac':       { mode:'auto',   formule:'largeur_hauteur', note:'le sac tel qu’il est livré, aplati' },
  'Sachet':    { mode:'auto',   formule:'largeur_hauteur', note:'le sachet tel qu’il est livré, aplati' },
  'Papier':    { mode:'auto',   formule:'largeur_hauteur', note:'format déplié' },
  'Serviette': { mode:'auto',   formule:'largeur_hauteur', note:'format déplié' },
  'Étiquette': { mode:'auto',   formule:'largeur_hauteur', note:'format déplié' },
  'Boîte':     { mode:'manuel', note:'dépend du montage — se lit sur le gabarit fournisseur' },
  'Gobelet':   { mode:'na',     note:'produit non développable' },
  'Bouteille': { mode:'na',     note:'produit non développable' },
  'Bowl':      { mode:'na',     note:'produit non développable' },
  'Vaisselle': { mode:'na',     note:'produit non développable' },
  'Couvercle': { mode:'na',     note:'produit non développable' }
};
/* Accessoire, Bague, Couverts… : pas de formule connue → saisie manuelle. */
const DIM_A_PLAT_DEFAUT = { mode:'manuel', note:'aucune formule définie pour cette famille — saisie manuelle' };

/* Les formules elles-mêmes. `req` liste les dimensions nécessaires :
   si l'une manque, le champ affiche « — » plutôt qu'une valeur fausse. */
const A_PLAT_FORMULES = {
  largeur_hauteur: {
    lb:  'Largeur × Hauteur',
    req: ['largeur_cm', 'hauteur_cm'],
    calc: d => ({ l: d.largeur_cm, h: d.hauteur_cm })
  }
};

/* ------------------------------------------------------------
   2 · Développé (à découper) — la cote qui intéresse l'imprimeur
   (2 × Largeur + 2 × Soufflet + rabat) × (Hauteur + fond)
   rabat et fond sont deux paramètres modifiables par référence.
   ------------------------------------------------------------ */
const DEVELOPPE = {
  familles: ['Sac', 'Sachet', 'Boîte'],
  lb:  '(2 × Largeur + 2 × Soufflet + rabat) × (Hauteur + fond)',
  req: ['largeur_cm', 'profondeur_soufflet_cm', 'hauteur_cm'],
  rabat_defaut: 2,                                  // cm
  rabat_lb: '2 cm',
  fond_defaut: d => d.profondeur_soufflet_cm / 2 + 2, // cm
  fond_lb: 'soufflet ÷ 2 + 2 cm',
  calc: (d, rabat, fond) => ({
    l: 2 * d.largeur_cm + 2 * d.profondeur_soufflet_cm + rabat,
    h: d.hauteur_cm + fond
  })
};

/* ------------------------------------------------------------
   3 · Unités de « Quantité par emballage »
   La première de la liste est la valeur par défaut.
   ------------------------------------------------------------ */
const UNITES_QUANTITE = ['pièces', 'g', 'kg', 'mL', 'L', 'cm', 'm', 'm²'];
const UNITE_QUANTITE_DEFAUT = UNITES_QUANTITE[0];

/* ------------------------------------------------------------
   4 · Référentiel boutiques — abréviation TFB, nom Inpulse, zone
   La zone donne la couleur. Quatre zones, quatre couleurs.
   `inpulse` doit correspondre au nom exact renvoyé par
   /public/v2/stores : c'est la clé de rapprochement.
   ------------------------------------------------------------ */
const ZONES = {
  'Paris boutique': { bg:'#dbeafe', tx:'#1e40af', bord:'#93c5fd', pt:'#2563eb' },
  'Paris labo':     { bg:'#ede9fe', tx:'#5b21b6', bord:'#c4b5fd', pt:'#7c3aed' },
  'Bordeaux':       { bg:'#ffe4e6', tx:'#9f1239', bord:'#fda4af', pt:'#be123c' },
  'Lille':          { bg:'#d1fae5', tx:'#065f46', bord:'#6ee7b7', pt:'#047857' }
};
const ZONES_ORDRE = ['Paris labo','Paris boutique','Bordeaux','Lille'];

/* hub:true = plateforme logistique (le packaging y transite avant les boutiques) */
const BOUTIQUES = [
  { abr:'CHA', nom:'Chalifert',        inpulse:'TFB LAB CHALIFERT',                   zone:'Paris labo',     hub:true },
  { abr:'LOG', nom:'Lognes',           inpulse:'TFB LAB Lognes',                      zone:'Paris labo',     hub:true },
  { abr:'OB',  nom:'Oberkampf',        inpulse:'TFB RESEAU Oberkampf',                zone:'Paris boutique' },
  { abr:'SD',  nom:'Saint-Denis',      inpulse:'TFB RESEAU Saint-Denis',              zone:'Paris boutique' },
  { abr:'SF',  nom:'Saint-Ferdinand',  inpulse:'TFB RESEAU Saint-Ferdinand',          zone:'Paris boutique' },
  { abr:'PG',  nom:'Pigalle',          inpulse:'TFB RESEAU Pigalle',                  zone:'Paris boutique' },
  { abr:'SV',  nom:'Sèvres',           inpulse:'TFB RESEAU Sèvres',                   zone:'Paris boutique' },
  { abr:'TP',  nom:'Temple',           inpulse:'TFB RESEAU Temple',                   zone:'Paris boutique' },
  { abr:'LV',  nom:'Lévis',            inpulse:'TFB RESEAU Lévis',                    zone:'Paris boutique' },
  { abr:'RB',  nom:'Rambuteau',        inpulse:'TFB RESEAU Rambuteau',                zone:'Paris boutique' },
  { abr:'BC',  nom:'Bac',              inpulse:'TFB RESEAU Bac',                      zone:'Paris boutique' },
  { abr:'PP',  nom:'Pompe',            inpulse:'TFB RESEAU Pompe',                    zone:'Paris boutique' },
  { abr:'NE',  nom:'Neuilly',          inpulse:'TFB RESEAU Neuilly',                  zone:'Paris boutique' },
  { abr:'LP',  nom:'Levallois',        inpulse:'TFB RESEAU Levallois',                zone:'Paris boutique' },
  { abr:'BDJ', nom:'Porte Dijeaux',    inpulse:'TFB RESEAU Bordeaux Dijeaux',         zone:'Bordeaux' },
  { abr:'BCJ', nom:'Camille Jullian',  inpulse:'TFB RESEAU Bordeaux Pas Saint-Georges', zone:'Bordeaux' },
  { abr:'BGH', nom:'Grands Hommes',    inpulse:'TFB RESEAU Bordeaux Grands Hommes',   zone:'Bordeaux' },
  { abr:'LBA', nom:'Lille Basse',      inpulse:'TFB RESEAU Lille Basse',              zone:'Lille' },
  { abr:'LNV', nom:'Lille Neuve',      inpulse:'TFB RESEAU Lille Neuve',              zone:'Lille' }
];

/* ------------------------------------------------------------
   5 · Stock — règles d'estimation
   Le stock affiché n'est une estimation que faute d'inventaire :
   dès qu'un inventaire est saisi, il fait foi et l'estimation
   ne fait que le vieillir des réceptions et de la consommation.
   ------------------------------------------------------------ */
const STOCK = {
  debut_historique: '2026-01-01',   // début de l'historique de commandes Inpulse
  alerte_jours: 15,                 // couverture sous laquelle on alerte
  confort_jours: 45                 // au-dessus, la couverture est confortable
};
