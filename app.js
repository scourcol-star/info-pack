/* ============================================================
   TFB — Info Pack · base packaging
   Structure : fiche Notion (5 onglets), champ pour champ.
   Liste     : Inpulse › Ingrédients fournisseurs › catégorie PACKAGING
   Trois couches, dans cet ordre de priorité :
     1. data/packaging.json  — socle versionné dans le repo
     2. /api/store           — saisies TFB (Netlify Blobs), se superposent
     3. /api/packaging|proxy — Inpulse, écrase ses propres champs
   Un champ badgé INPULSE n'est jamais saisissable : il serait écrasé.
   Les formules de dimensions et les unités vivent dans config.js.
   ============================================================ */

const TABS = [
  {k:'general', t:'Informations générales',        i:'ti-pencil'},
  {k:'design',  t:'Design & gabarit',              i:'ti-palette'},
  {k:'logi',    t:'Conditionnement & logistique',  i:'ti-package'},
  {k:'usage',   t:'Usage TFB',                     i:'ti-croissant'},
  {k:'photos',  t:'Photos',                        i:'ti-camera'}
];

let DB=null, OVR={records:{}}, ROWS=[], view='list', sortK='nom', sortD=1, activeTab='general', current=null;
let storeOk=false;
let ORD=null, ORDINFO=null;          // historique de commandes par packaging
let BYSTORE=null, SNAMES={};         // meme historique, garde par boutique
const EXP=new Map();                 // lignes depliees : id -> 'ord' | 'bq'
let PAGE='pack';                     // feuille affichee : 'pack' | 'stock'
const SF={q:'',zone:''};             // filtres de la feuille Stock
let sSortK='total', sSortD=-1;
const SEXP=new Set();                // lignes depliees de la feuille Stock
const FREE={};   // champs "Autre…" ouverts en saisie libre
const F={q:'',fam:'',four:'',marq:'',comp:'',flag:'',masquerHS:true};
/* flag : point de vigilance actif — cmd, nocmd, couvlow, noinv, nogab, px0, pxu, hs */
let nHS=0;   // références hors service masquées par le filtre

const eur  = n => (n==null||isNaN(n))?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const eur4 = n => (n==null||isNaN(n))?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:4})+' €';
const esc  = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isEmpty = v => v===''||v==null||(Array.isArray(v)&&!v.length);
const num = v => { if(v===''||v==null) return null;
  const x = typeof v==='number'?v:Number(String(v).replace(',','.').trim());
  return isNaN(x)?null:x; };
const fmtCm = x => (Math.round(x*10)/10).toLocaleString('fr-FR',{maximumFractionDigits:1});
const todayISO = () => { const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const dateFR = iso => { const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||''); return m?m[3]+'/'+m[2]+'/'+m[1]:(iso||''); };

/* ---- hors service : la date de fin est passée (le jour même compte encore) ---- */
const dateFinService = r => (r.deploiement && r.deploiement.date_fin_service) || '';
const horsService = r => { const f=dateFinService(r); return !!f && f < todayISO(); };

/* ---- unité de « Quantité par emballage » ---- */
const uniteQte = r => (r.usage_tfb && r.usage_tfb.unite_quantite) || UNITE_QUANTITE_DEFAUT;

/* ============================================================
   Dimensions calculées — formules dans config.js, jamais ici
   ============================================================ */
const cfgAPlat = r => DIM_A_PLAT_PAR_FAMILLE[r.app && r.app.famille] || DIM_A_PLAT_DEFAUT;
const dimsNum = r => { const d=(r&&r.dimensions)||{};
  return {longueur_cm:num(d.longueur_cm), largeur_cm:num(d.largeur_cm),
          profondeur_soufflet_cm:num(d.profondeur_soufflet_cm), hauteur_cm:num(d.hauteur_cm)}; };
const reqOk = (d,req) => req.every(k=>d[k]!=null);
const paire = o => fmtCm(o.l)+' × '+fmtCm(o.h);

/* mode de saisie : 'auto' (calculé) ou 'manuel' (forcé).
   Une valeur déjà saisie sans mode connu est considérée MANUELLE :
   on n'écrase jamais ce qui a été tapé avant la mise à jour. */
function calcMode(r,valuePath,modePath){
  const m=getPath(r,modePath);
  if(m==='manuel'||m==='auto') return m;
  return isEmpty(getPath(r,valuePath))?'auto':'manuel';
}
const aPlatMode = r => calcMode(r,'dimensions.dimensions_a_plat_cm','dimensions.a_plat_mode');
const devMode   = r => calcMode(r,'dimensions.developpe_cm','dimensions.developpe_mode');

function aPlatAuto(r){
  const c=cfgAPlat(r); if(c.mode!=='auto') return null;
  const f=A_PLAT_FORMULES[c.formule]; if(!f) return null;
  const d=dimsNum(r); if(!reqOk(d,f.req)) return null;
  return paire(f.calc(d));
}
function aPlatValue(r){
  const c=cfgAPlat(r);
  if(c.mode==='na') return null;
  if(c.mode==='manuel'||aPlatMode(r)==='manuel') return getPath(r,'dimensions.dimensions_a_plat_cm')||null;
  return aPlatAuto(r);
}
const devApplicable = r => DEVELOPPE.familles.indexOf(r.app&&r.app.famille)>=0;
const devRabat = r => { const v=num(getPath(r,'dimensions.rabat_collage_cm'));
  return v==null?DEVELOPPE.rabat_defaut:v; };
function devFond(r){
  const v=num(getPath(r,'dimensions.fond_cm'));
  if(v!=null) return v;
  const d=dimsNum(r);
  return d.profondeur_soufflet_cm==null?null:DEVELOPPE.fond_defaut(d);
}
function devAuto(r){
  if(!devApplicable(r)) return null;
  const d=dimsNum(r); if(!reqOk(d,DEVELOPPE.req)) return null;
  const fond=devFond(r); if(fond==null) return null;
  return paire(DEVELOPPE.calc(d,devRabat(r),fond));
}
function devValue(r){
  if(!devApplicable(r)) return null;
  return devMode(r)==='manuel' ? (getPath(r,'dimensions.developpe_cm')||null) : devAuto(r);
}
const uniteCommande = n => { const u=(n||'').toUpperCase();
  return u.indexOf('CARTON')===0?'Carton':u.indexOf('BOITE')===0?'Boîte':u.indexOf('ROULEAU')===0?'Rouleau'
    :(u.indexOf("L'UNITE")>=0||u.indexOf('L UNITE')>=0)?'Unité':(n||''); };

/* ---- accès par chemin pointé ---- */
function getPath(o,p){ return p.split('.').reduce((a,k)=>(a==null?a:a[k]), o); }
function setPath(o,p,v){
  const ks=p.split('.'); let a=o;
  for(let i=0;i<ks.length-1;i++){ const k=ks[i]; if(a[k]==null) a[k]= /^\d+$/.test(ks[i+1])?[]:{}; a=a[k]; }
  a[ks[ks.length-1]]=v;
}

/* ============================================================
   Registre des champs — une seule source de vérité :
   la fiche, l'export, la complétude et l'édition en découlent.
   src : 'inp' = piloté par Inpulse (lecture seule) · 'tfb' = saisi ici
   ============================================================ */
/* ============================================================
   Intitulé complet — recomposé depuis Inpulse, rectifiable
   La règle de nommage vit dans config.js, jamais ici.
   ============================================================ */
/* « GOBELET 25CL TFB 12/2025 » → « 12/2025 ». Rien de tel → ''.
   L'année doit commencer par 20 : les cotes du genre 210x80/80x610
   ne sont donc jamais prises pour une version. */
const versionDesign = r => {
  const m=/(?:^|[\s(\-])(\d{1,2})\s*\/\s*(20\d{2})(?![\d])/
    .exec((r&&r.identification&&r.identification.intitule_inpulse)||'');
  return m ? String(m[1]).padStart(2,'0')+'/'+m[2] : '';
};
function intituleBase(r){
  let n=String((r&&r.identification&&r.identification.intitule_inpulse)||'').trim();
  INTITULE.retirer.forEach(re=>{ n=n.replace(re,' '); });
  return n.replace(/\s{2,}/g,' ').trim();
}
function intituleAuto(r){
  const base=intituleBase(r); if(!base) return '';
  const mention=INTITULE.mentions[r.app&&r.app.marquage];
  if(!mention) return base+' '+INTITULE.mention_neutre;
  return base+' '+mention+' '+(versionDesign(r)||INTITULE.version_absente);
}
const intituleMode  = r => calcMode(r,'identification.intitule_complet','identification.intitule_mode');
const intituleValue = r => intituleMode(r)==='manuel'
  ? (getPath(r,'identification.intitule_complet')||'') : intituleAuto(r);

/* Unité du tarif unitaire, et conditionnement d'achat en clair. */
const uniteTarif = r => (r&&r.logistique&&r.logistique.unite_tarif) || UNITE_TARIF_DEFAUT;
function conditionnementHA(r){
  const u=String((r&&r.inpulse&&r.inpulse.unite_achat)||'').trim();
  const n=num(r&&r.logistique&&r.logistique.nombre_par_carton);
  const par=n?(fmt(n)+' '+uniteTarif(r)+(n>1?'s':'')):'';
  if(u&&par) return u+' — '+par;
  return u||par;
}

const R = ref => (DB && DB.referentiels[ref]) || [];
const FIELDS = [
  // ---------- 1. Informations générales ----------
  {tab:'general', grp:'Identification', path:'identification.intitule_inpulse', lb:'Intitulé Inpulse', src:'inp', wide:1},
  {tab:'general', grp:'Identification', path:'identification.intitule_complet',  lb:'Intitulé complet',
    src:'tfb', type:'calctext', wide:1, val:r=>intituleValue(r)},
  {tab:'general', grp:'Identification', path:'identification.sku_fournisseur',  lb:'SKU fournisseur',  src:'inp'},
  {tab:'general', grp:'Identification', path:'inpulse.fournisseur',             lb:'Fournisseur',      src:'inp'},
  {tab:'general', grp:'Identification', path:'app.famille',   lb:'Famille',  src:'tfb', type:'select', opt:()=>R('famille')},
  {tab:'general', grp:'Identification', path:'app.marquage',  lb:'Marquage', src:'tfb', type:'select', opt:()=>R('marquage')},
  {tab:'general', grp:'Identification', path:'app.statut',    lb:'Statut',   src:'tfb', type:'select', opt:()=>R('statut')},
  {tab:'general', grp:'Identification', path:'app.sous_famille', lb:'Sous-famille', src:'tfb', type:'text'},

  {tab:'general', grp:'Achat', path:'inpulse.prix_ht',   lb:'Prix HT',        src:'inp', fmt:eur},
  {tab:'general', grp:'Achat', path:'inpulse.unite_achat', lb:'Unité d’achat', src:'inp'},
  {tab:'general', grp:'Achat', path:'logistique.prix_unitaire_ht', lb:'Tarif unitaire', src:'inp', fmt:eur4,
    u:r=>'par '+uniteTarif(r)},
  {tab:'general', grp:'Achat', path:'logistique.unite_tarif', lb:'Unité du tarif', src:'tfb',
    type:'select', opt:()=>UNITES_TARIF, free:1},
  {tab:'general', grp:'Achat', path:'logistique.conditionnement_ha', lb:'Conditionnement HA', src:'inp',
    wide:1, val:r=>conditionnementHA(r)},
  {tab:'general', grp:'Achat', path:'inpulse.dispo',     lb:'Disponibilité boutiques', src:'inp', wide:1},

  {tab:'general', grp:'Dimensions', path:'dimensions.longueur_cm',           lb:'Longueur',              src:'tfb', type:'dec', u:'cm'},
  {tab:'general', grp:'Dimensions', path:'dimensions.largeur_cm',            lb:'Largeur',               src:'tfb', type:'dec', u:'cm'},
  {tab:'general', grp:'Dimensions', path:'dimensions.profondeur_soufflet_cm',lb:'Profondeur (soufflet)', src:'tfb', type:'dec', u:'cm'},
  {tab:'general', grp:'Dimensions', path:'dimensions.hauteur_cm',            lb:'Hauteur',               src:'tfb', type:'dec', u:'cm'},
  {tab:'general', grp:'Dimensions', path:'dimensions.dimensions_a_plat_cm',  lb:'Dimensions à plat (L × H)', src:'tfb', type:'calc', kind:'aplat', u:'cm', wide:1,
    hide:r=>cfgAPlat(r).mode==='na', val:r=>aPlatValue(r)},
  {tab:'general', grp:'Dimensions', path:'dimensions.developpe_cm',          lb:'Développé (à découper)',    src:'tfb', type:'calc', kind:'dev', u:'cm', wide:1,
    hide:r=>!devApplicable(r), val:r=>devValue(r)},
  {tab:'general', grp:'Dimensions', path:'dimensions.tolerance_mm',          lb:'Tolérance dimensionnelle',  src:'tfb', type:'num', u:'mm', step:'0.5'},

  {tab:'general', grp:'Matière', path:'matiere.matiere',             lb:'Matière',            src:'tfb', type:'select', opt:()=>R('type_support'), free:1},
  {tab:'general', grp:'Matière', path:'matiere.grammage_g_m2',       lb:'Grammage',           src:'tfb', type:'num', u:'g/m²'},
  {tab:'general', grp:'Matière', path:'matiere.epaisseur_um',        lb:'Épaisseur',          src:'tfb', type:'num', u:'µm'},
  {tab:'general', grp:'Matière', path:'matiere.poids_unitaire_g',    lb:'Poids unitaire',     src:'tfb', type:'num', u:'g', step:'0.1'},
  {tab:'general', grp:'Matière', path:'matiere.contact_alimentaire', lb:'Contact alimentaire',src:'tfb', type:'bool'},
  {tab:'general', grp:'Matière', path:'matiere.personnalise_tfb',     lb:'Personnalisé TFB',   src:'tfb', type:'bool'},

  // ---------- 2. Design & gabarit ----------
  {tab:'design', grp:'Fichiers', path:'design.design_valide_tfb',   lb:'Design validé (TFB)',   src:'tfb', type:'link', wide:1},
  {tab:'design', grp:'Fichiers', path:'design.gabarit_fournisseur', lb:'Gabarit (fournisseur)', src:'tfb', type:'link', wide:1},
  {tab:'design', grp:'Fichiers', path:'design.logo',                lb:'Logo (si nécessaire)',  src:'tfb', type:'link', wide:1},

  {tab:'design', grp:'Couleurs & pantones', path:'design.couleurs.pantone_principal',      lb:'Pantone principal',  src:'tfb', type:'text'},
  {tab:'design', grp:'Couleurs & pantones', path:'design.couleurs.pantone_secondaire',     lb:'Pantone secondaire', src:'tfb', type:'text'},
  {tab:'design', grp:'Couleurs & pantones', path:'design.couleurs.pantone_tertiaire',      lb:'Pantone tertiaire',  src:'tfb', type:'text'},
  {tab:'design', grp:'Couleurs & pantones', path:'design.couleurs.nb_couleurs_impression', lb:'Nombre de couleurs d’impression', src:'tfb', type:'num'},

  {tab:'design', grp:'Support et rendu', path:'design.support_rendu.type_support',  lb:'Type de support', src:'tfb', type:'select', opt:()=>R('type_support'), free:1},
  {tab:'design', grp:'Support et rendu', path:'design.support_rendu.grammage_g_m2', lb:'Grammage',       src:'tfb', type:'num', u:'g/m²'},
  {tab:'design', grp:'Support et rendu', path:'design.support_rendu.finition',       lb:'Finition',      src:'tfb', type:'select', opt:()=>R('finition')},

  {tab:'design', grp:'BAT', path:'design.bat.valide_par',      lb:'BAT validé par',     src:'tfb', type:'text'},
  {tab:'design', grp:'BAT', path:'design.bat.date_validation', lb:'Date de validation', src:'tfb', type:'date'},
  {tab:'design', grp:'BAT', path:'design.bat.fichier',         lb:'Fichier BAT joint',  src:'tfb', type:'link', wide:1},

  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.denomination_produit',   lb:'Dénomination du produit',  src:'tfb', type:'text'},
  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.poids_contenance',       lb:'Poids / contenance',       src:'tfb', type:'text'},
  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.allergenes',             lb:'Allergènes',               src:'tfb', type:'text'},
  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.ddm_dlc',                lb:'DDM / DLC',                src:'tfb', type:'text'},
  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.adresse_raison_sociale', lb:'Adresse et raison sociale',src:'tfb', type:'text'},
  {tab:'design', grp:'Mentions obligatoires (si nécessaire)', path:'design.mentions_obligatoires.logo_tri_recyclabilite', lb:'Logo tri / recyclabilité', src:'tfb', type:'text'},

  // ---------- 3. Conditionnement & logistique ----------
  {tab:'logi', grp:'Logistique', path:'logistique.nombre_par_carton',    lb:'Nombre par carton',   src:'inp', u:'pièces'},
  {tab:'logi', grp:'Logistique', path:'logistique.unite_commande',       lb:'Unité de commande',   src:'inp'},
  {tab:'logi', grp:'Logistique', path:'logistique.cartons_par_palette',  lb:'Cartons par palette', src:'tfb', type:'num', u:'cartons'},
  {tab:'logi', grp:'Logistique', path:'logistique.conditions_stockage',  lb:'Conditions de stockage', src:'tfb', type:'select', opt:()=>R('conditions_stockage'), free:1, wide:1},
  {tab:'logi', grp:'Logistique', path:'logistique.moq',                  lb:'MOQ',                 src:'tfb', type:'num', u:'pièces'},
  {tab:'logi', grp:'Logistique', path:'logistique.delai_reappro_jours',  lb:'Délai de réapprovisionnement', src:'tfb', type:'num', u:'jours'},

  {tab:'logi', grp:'Déploiement', path:'deploiement.points_de_vente',       lb:'Points de vente concernés', src:'tfb', type:'multi', wide:1,
    opt:r=>BOUTIQUES.map(b=>b.abr).concat(
      ((r&&r.deploiement&&r.deploiement.points_de_vente)||[]).filter(x=>!BQ_ABR[x]))},
  {tab:'logi', grp:'Déploiement', path:'deploiement.date_mise_en_service',  lb:'Date de mise en service',   src:'tfb', type:'date'},
  {tab:'logi', grp:'Déploiement', path:'deploiement.date_fin_service',      lb:'Date de fin de service',    src:'tfb', type:'date'},

  // ---------- 4. Usage TFB ----------
  {tab:'usage', grp:'Usage', path:'usage_tfb.usage',                  lb:'Usage',                 src:'tfb', type:'area', wide:1},
  {tab:'usage', grp:'Usage', path:'usage_tfb.quantite_par_emballage', lb:'Quantité par emballage', src:'tfb', type:'dec',
    u:r=>uniteQte(r), unitSel:'usage_tfb.unite_quantite'},

  // ---------- 5. Photos ----------
  {tab:'photos', grp:'Galerie', path:'photos.0', lb:'Produit nu',                  src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.1', lb:'Produit garni',               src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.2', lb:'Mise en situation boutique',  src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.3', lb:'Gabarit à plat',              src:'tfb', type:'photo'}
];
const TFB_FIELDS = FIELDS.filter(f=>f.src==='tfb');
const byTab = k => FIELDS.filter(f=>f.tab===k);

/* ---- visibilité : un champ masqué (non applicable à la famille) ne compte
   ni au numérateur ni au dénominateur de la complétude ---- */
const visible = (f,r) => !f.hide || !f.hide(r);
/* valeur affichée : calculée si le champ porte une formule, sinon stockée */
const valOf = (r,f) => f.val ? f.val(r) : getPath(r,f.path);
const fieldsTFB = r => TFB_FIELDS.filter(f=>visible(f,r));

/* ---- complétude : part des champs TFB applicables et renseignés ---- */
const comp = r => { const a=fieldsTFB(r);
  return a.length?Math.round(100*a.filter(f=>!isEmpty(valOf(r,f))).length/a.length):0; };
const tabComp = (r,k) => { const a=byTab(k).filter(f=>f.src==='tfb'&&visible(f,r));
  return {n:a.filter(f=>!isEmpty(valOf(r,f))).length, t:a.length}; };

/* ============================================================
   Chargement
   ============================================================ */
async function load(){
  setConn('spin','Chargement du référentiel…','');
  let doc = (typeof EMBEDDED!=='undefined') ? EMBEDDED : null;
  try{ const r=await fetch('data/packaging.json',{cache:'no-store'}); if(r.ok) doc=await r.json(); }catch(e){}
  if(!doc){ setConn('err','Référentiel introuvable',''); return; }
  DB=doc;
  await loadOverrides();
  migrerRecettes();
  buildFilters(); render(); syncInpulse(); loadOrders(); loadInventories();
}

async function loadOverrides(){
  try{
    const r=await fetch('/api/store',{cache:'no-store'});
    if(!r.ok) throw new Error((await r.json().catch(()=>({}))).error||('HTTP '+r.status));
    OVR = await r.json(); if(!OVR.records) OVR.records={};
    storeOk=true;
    applyOverrides();
    setSave('ok', OVR.updated_at ? 'Dernière saisie ' + new Date(OVR.updated_at).toLocaleString('fr-FR') : 'Aucune saisie enregistrée');
  }catch(e){
    storeOk=false; OVR={records:{}};
    setSave('err','Saisie non enregistrée — ' + e.message);
  }
}
/* ---- Migration « Recettes concernées » → « Usage » ------------------
   Le champ a été retiré de la fiche. Rien ne doit être perdu : le contenu
   est reversé dans Usage, préfixé par « Recettes : », et un drapeau évite
   de rejouer la migration. Ne tourne que si le stockage répond. ---- */
function migrerRecettes(){
  if(!storeOk||!DB) return;
  const faits=[];
  DB.packagings.forEach(p=>{
    const u=p.usage_tfb||{};
    if(u.recettes_migre) return;
    const rec=u.recettes_concernees;
    if(isEmpty(rec)) return;
    const list=(Array.isArray(rec)?rec:[String(rec)]).filter(x=>!isEmpty(x));
    if(!list.length) return;
    const pref='Recettes : '+list.join(', ');
    const cur=String(u.usage||'').trim();
    if(cur.indexOf(pref)<0) saveField(p.id,'usage_tfb.usage', cur?pref+'\n'+cur:pref);
    saveField(p.id,'usage_tfb.recettes_migre',true);
    faits.push(p.nom);
  });
  if(faits.length) console.info('Info Pack — recettes reversées dans Usage :', faits.join(' · '));
}

function applyOverrides(){
  DB.packagings.forEach(p=>{
    const o=OVR.records[p.id]; if(!o) return;
    Object.keys(o).forEach(path=>setPath(p,path,o[path]));
  });
}

/* ============================================================
   Historique de commandes (function /api/orders, agregat en cache)
   ============================================================ */
const MONTHS = (()=>{ const out=[]; const now=new Date();
  for(let y=2026,m=1;;m++){ if(m>12){m=1;y++;}
    out.push(y+'-'+String(m).padStart(2,'0'));
    if(y>now.getFullYear()||(y===now.getFullYear()&&m>=now.getMonth()+1)) break;
    if(out.length>60) break; }
  return out; })();
const MOISLB=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const moisCourt = k => { const [y,m]=k.split('-'); return MOISLB[+m-1]+' '+y.slice(2); };

async function loadOrders(force){
  try{
    let r = await fetch('/api/orders'+(force?'?reset=1&work=1':'?work=1'),{cache:'no-store'});
    let d = await r.json();
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    let guard=0;
    while(d.progress && !d.progress.done && guard++ < 40){
      setOrdInfo('spin', d.progress.headers.done
        ? ('Historique : '+d.progress.seen+' commandes lues, '+d.progress.queue+' restantes')
        : ('Historique : balayage '+d.progress.headers.skip+' / '+(d.progress.headers.total||'?')));
      if(d.data){ ORD=d.data; BYSTORE=d.byStore||BYSTORE; SNAMES=d.storeNames||SNAMES; indexStores(); render(); }
      r = await fetch('/api/orders?work=1',{cache:'no-store'});
      d = await r.json();
      if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    }
    ORD = d.data || {};
    BYSTORE = d.byStore || {};
    SNAMES = d.storeNames || {};
    indexStores();
    ORDINFO = {maj:d.full_built_at||d.updated_at, seen:(d.progress&&d.progress.seen)||0};
    setOrdInfo('ok', ORDINFO.seen+' commandes dépouillées depuis janvier 2026');
    render();
  }catch(e){
    ORD=null; setOrdInfo('err','Historique indisponible — '+e.message); render();
  }
}
function setOrdInfo(s,t){ const el=document.getElementById('ordbadge'); if(!el) return;
  el.className='savebadge '+(s==='spin'?'wait':s); el.style.display='inline-flex';
  el.innerHTML='<i class="ti '+(s==='ok'?'ti-history':s==='spin'?'ti-loader-2':'ti-history-off')+'"></i>'+esc(t); }

/* Agregat d\'un packaging : {mois:{n,oq,rq}} + total */
function ordFor(p){
  if(!ORD) return null;
  const a=ORD[p.identification.intitule_inpulse.trim().toUpperCase()];
  const tot={n:0,oq:0,rq:0};
  if(!a) return {vide:true, mois:{}, tot};
  MONTHS.forEach(m=>{ const c=a[m]; if(c){ tot.n+=c.n; tot.oq+=c.oq; tot.rq+=c.rq; } });
  return {vide:tot.n===0, mois:a, tot};
}

/* ============================================================
   Références nouvelles côté Inpulse
   Inpulse est la liste de référence : toute référence PACKAGING qui n'a
   pas encore de fiche est créée ici, sinon la base reste figée sur le
   socle du repo. L'identifiant est dérivé du libellé et donc stable :
   les saisies TFB faites sur ces fiches se rattachent au même id et
   reviennent au rechargement, comme pour n'importe quelle autre fiche.
   Famille, marquage et statut ne sont que des valeurs de départ — ce
   sont des champs TFB, corrigeables dans la fiche, et la correction est
   enregistrée.
   ============================================================ */
const FAMILLE_REGLES = [
  [/\bCOUVERCLE/,                                      'Couvercle'],
  [/\bBAGUE/,                                          'Bague'],
  [/\bBOUTEILLE/,                                      'Bouteille'],
  [/\bBOWL|\bBOL\b/,                                   'Bowl'],
  [/\bGOBELET/,                                        'Gobelet'],
  [/\bSERVIETTE/,                                      'Serviette'],
  [/\bETIQUETTE|\bÉTIQUETTE|\bCOLLERETTE/,             'Étiquette'],
  [/\bSAC\b|\bSACHET|\bSACS\b|\bPOCHETTE|\bTOTE\b/,    'Sac'],
  [/\bBOITE|\bBOÎTE|\bCAISSE|\bBARQUETTE|\bCOFANETTO|\bETUI|\bÉTUI/, 'Boîte'],
  [/\bPAPIER|\bBOBINE|\bROULEAU|\bFILM\b|\bDEPLIANT|\bDÉPLIANT|\bTABLETTE/, 'Papier'],
  [/\bCOUTEAU|\bFOURCHETTE|\bCUILLERE|\bCUILLÈRE|\bCOUVERTS|\bKIT\b/, 'Couverts'],
  [/\bMUG\b|\bTASSE|\bASSIETTE|\bMOULE|\bCAISSETTE|\bTULIPCUP/, 'Vaisselle']
];
const familleDe = nom => { const n=String(nom||'').toUpperCase();
  for(const [re,f] of FAMILLE_REGLES) if(re.test(n)) return f;
  return 'Accessoire'; };
const marquageDe = nom => { const n=String(nom||'').toUpperCase();
  if(/\bTFB\b|THE FRENCH BASTARDS/.test(n)) return /\bX\b/.test(n)?'Co-branding':'TFB';
  return 'Neutre'; };
const slugId = nom => String(nom||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'ref';
function idUnique(base, pris){ let id=base, n=2;
  while(pris[id]) id=base+'-'+(n++); pris[id]=1; return id; }

/* Champs pilotés par Inpulse — un seul endroit, fiche existante ou créée. */
function appliquerInpulse(p,m){
  const pk=m.packaging||{};
  p.inpulse.live=true;
  if(m.price!=null)   p.inpulse.prix_ht=Number(m.price);
  if(m.supplier)      p.inpulse.fournisseur=m.supplier;
  if(m.subCategory)   p.inpulse.sous_categorie=m.subCategory;
  p.inpulse.unite_achat=pk.name||'';
  p.inpulse.actif=m.active;
  p.identification.sku_fournisseur=(m.sku&&m.sku!=='?')?m.sku:'';
  const q=pk.quantity;
  p.logistique.nombre_par_carton=(q&&q>1)?q:null;
  p.logistique.unite_commande=uniteCommande(pk.name);
  p.logistique.prix_unitaire_ht=(q&&q>1&&m.price)?m.price/q:null;
}

/* Fiche vierge à la structure du socle : tous les chemins existent, la
   complétude et l'export s'appliquent sans cas particulier. */
function fichePackaging(m,id){
  const nom=String(m.name||'').trim();
  const p={
    id:id, nom:nom, _nouveau:true,
    app:{famille:familleDe(nom), marquage:marquageDe(nom), statut:'À compléter'},
    inpulse:{prix_ht:null, dispo:null, fournisseur:'', categorie:m.category||'PACKAGING',
             sous_categorie:'', ingredient:null, unite_achat:''},
    identification:{intitule_inpulse:nom, sku_fournisseur:''},
    dimensions:{longueur_cm:null, largeur_cm:null, profondeur_soufflet_cm:null,
                hauteur_cm:null, dimensions_a_plat_cm:'', tolerance_mm:null},
    matiere:{matiere:'', grammage_g_m2:null, epaisseur_um:null,
             poids_unitaire_g:null, contact_alimentaire:null},
    design:{design_valide_tfb:'', gabarit_fournisseur:'', logo:'',
            couleurs:{pantone_principal:'', pantone_secondaire:'', pantone_tertiaire:'',
                      nb_couleurs_impression:null},
            support_rendu:{type_support:'', grammage_g_m2:null, finition:''},
            bat:{valide_par:'', date_validation:'', fichier:''},
            mentions_obligatoires:{denomination_produit:'', poids_contenance:'', allergenes:'',
                                   ddm_dlc:'', adresse_raison_sociale:'', logo_tri_recyclabilite:''}},
    logistique:{nombre_par_carton:null, cartons_par_palette:null, conditions_stockage:'',
                moq:null, delai_reappro_jours:null, unite_commande:'', prix_unitaire_ht:null},
    deploiement:{points_de_vente:[], date_mise_en_service:'', date_fin_service:'',
                 points_de_vigilance:''},
    usage_tfb:{recettes_concernees:[], usage:'', quantite_par_emballage:null},
    photos:['','','','']
  };
  appliquerInpulse(p,m);
  return p;
}

/* ---- Inpulse : /api/packaging si dispo, sinon pagination via /api/proxy ---- */
async function syncInpulse(){
  setConn('spin','Interrogation d’Inpulse…','');
  try{
    let list=null, via='';
    try{
      const r=await fetch('/api/packaging',{cache:'no-store'});
      if(r.ok){ const d=await r.json(); if(d.data&&d.data.length){ list=d.data; via='via /api/packaging'; } }
    }catch(e){}
    if(!list){ list=await scanViaProxy(); via='via /api/proxy'; }
    if(!list.length) throw new Error('aucune référence PACKAGING renvoyée');

    const by={}; list.forEach(x=>{ if(x.name) by[String(x.name).trim().toUpperCase()]=x; });
    let hit=0; const orphans=[];
    DB.packagings.forEach(p=>{
      const m=by[p.identification.intitule_inpulse.trim().toUpperCase()];
      if(!m){ orphans.push(p.nom); return; }
      hit++;
      appliquerInpulse(p,m);
    });

    /* Références Inpulse sans fiche : création. Inpulse pouvant renvoyer
       deux fois le même libellé, la clé de rapprochement (le nom) fait foi. */
    const known={}, pris={};
    DB.packagings.forEach(p=>{ known[p.identification.intitule_inpulse.trim().toUpperCase()]=1; pris[p.id]=1; });
    const nouvelles=[];
    list.forEach(x=>{
      const nom=String(x.name||'').trim(); if(!nom) return;
      const cle=nom.toUpperCase(); if(known[cle]) return;
      known[cle]=1;
      DB.packagings.push(fichePackaging(x, idUnique(slugId(nom), pris)));
      nouvelles.push(nom);
    });
    if(nouvelles.length){
      hit+=nouvelles.length;
      applyOverrides();     // saisies TFB déjà enregistrées sur ces nouvelles fiches
      refreshFournisseurs();
    }

    let note='prix, SKU et conditionnements à jour — '+via;
    if(nouvelles.length) note+=' · '+nouvelles.length+' réf. ajoutée(s) depuis Inpulse : '+nouvelles.join(', ');
    if(orphans.length)   note+=' · non retrouvée(s) dans Inpulse : '+orphans.join(', ');
    setConn(orphans.length?'warn':'ok',
      '<strong>Inpulse connecté</strong> — '+hit+' / '+DB.packagings.length+' références rapprochées', note);
    if(current) openDrawer(current.id);
    render();
  }catch(e){
    setConn('err','<strong>Inpulse non joignable</strong> — affichage du dernier extrait','('+e.message+')');
  }
}
async function scanViaProxy(){
  const PAGE=100, MAX=30; let rows=[];
  for(let page=0;page<MAX;page++){
    const r=await fetch('/api/proxy',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:'/public/v2/supplier-products?limit='+PAGE+'&skip='+(page*PAGE),method:'GET'})});
    if(!r.ok){ const e=await r.json().catch(()=>({})); throw new Error(e.error||('HTTP '+r.status)); }
    const d=await r.json(); const batch=d.data||[];
    rows=rows.concat(batch);
    setConn('spin','Interrogation d’Inpulse…', rows.length+' / '+(d.total||'?')+' références lues');
    if(batch.length<PAGE) break;
  }
  return rows.filter(x=>x&&x.category==='PACKAGING').map(x=>{
    const p=(x.packagings||[]).find(q=>q.isUsedInOrder)||(x.packagings||[])[0]||{};
    return {name:String(x.name||'').trim(), sku:String(x.sku||'').trim(),
            price:x.price==null?null:Number(x.price), active:!!x.active,
            category:x.category, subCategory:x.subCategory,
            supplier:(x.supplier&&x.supplier.name)||'',
            packaging:{name:String(p.name||'').trim(), quantity:p.quantity==null?null:Number(p.quantity), unit:p.unit||''}};
  });
}
/* Le detail de synchronisation peut faire plusieurs centaines de caracteres
   (liste des references ajoutees). Court : affiche a la suite du message.
   Long : range derriere un bouton « Detail », la page reste lisible. */
function setConn(s,t,d){
  document.getElementById('dot').className='dot '+s;
  const box=document.getElementById('connbox'), det=document.getElementById('conn-d'),
        more=document.getElementById('conn-more'), txt=String(d==null?'':d).trim();
  const court = txt.length<=110;
  document.getElementById('conn-t').innerHTML = t + (court&&txt?' <span class="sm">'+esc(txt)+'</span>':'');
  if(!det||!more) return;
  if(court){
    det.textContent=''; det.classList.remove('on'); more.classList.remove('on');
    more.style.display='none'; if(box) box.classList.remove('open');
    return;
  }
  det.textContent=txt;
  more.style.display='inline-flex';
  const ouvert=det.classList.contains('on');
  more.innerHTML=(ouvert?'Masquer le d\u00e9tail':'D\u00e9tail')+'<i class="ti ti-chevron-down"></i>';
  more.classList.toggle('on',ouvert);
  if(box) box.classList.toggle('open',ouvert);
}
function toggleConnDetail(){
  const box=document.getElementById('connbox'), det=document.getElementById('conn-d'),
        more=document.getElementById('conn-more');
  const on=!det.classList.contains('on');
  det.classList.toggle('on',on); more.classList.toggle('on',on);
  if(box) box.classList.toggle('open',on);
  more.innerHTML=(on?'Masquer le d\u00e9tail':'D\u00e9tail')+'<i class="ti ti-chevron-down"></i>';
}
function setSave(s,t){ const el=document.getElementById('save'); if(!el) return;
  el.className='savebadge '+s; el.innerHTML='<i class="ti '+(s==='ok'?'ti-cloud-check':s==='wait'?'ti-cloud-upload':'ti-cloud-off')+'"></i>'+esc(t); }

/* ============================================================
   Enregistrement des saisies — file d'attente, envoi groupé
   ============================================================ */
const QUEUE=[]; let flushT=null, inflight=false;
function saveField(id,path,value){
  const rec=DB.packagings.find(p=>p.id===id); if(rec) setPath(rec,path,value);
  const o=OVR.records[id]||(OVR.records[id]={});
  if(isEmpty(value)) delete o[path]; else o[path]=value;
  if(!Object.keys(o).length) delete OVR.records[id];
  if(!storeOk){ setSave('err','Saisie gardée en mémoire seulement — stockage indisponible'); refreshHeader(); render(); return; }
  const i=QUEUE.findIndex(q=>q.id===id&&q.path===path);
  const op={id,path,value:isEmpty(value)?null:value};
  if(i>=0) QUEUE[i]=op; else QUEUE.push(op);
  setSave('wait','Enregistrement…');
  clearTimeout(flushT); flushT=setTimeout(flush,600);
  refreshHeader(); render();
}

/* Rafraichit les compteurs de la fiche sans re-rendre le corps :
   sinon on perdrait le focus du champ en cours de saisie. */
function refreshHeader(){
  if(!current) return;
  const r=current; r._comp=comp(r);
  const pill=document.querySelector('#d-sub .pill:last-child');
  if(pill){ pill.textContent='fiche '+r._comp+' %';
    pill.className='pill '+(r._comp<25?'p-warn':r._comp<60?'p-todo':'p-ok'); }
  document.querySelectorAll('#d-tabs [data-tab]').forEach(el=>{
    const c=tabComp(r,el.dataset.tab), sp=el.querySelector('.tcount');
    if(sp){ sp.textContent=c.n+'/'+c.t;
      sp.className='tcount'+(c.n===0?' zero':c.n===c.t?' full':''); }
  });
}
async function flush(){
  if(inflight||!QUEUE.length) return;
  const ops=QUEUE.splice(0,QUEUE.length); inflight=true;
  try{
    const r=await fetch('/api/store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ops})});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    OVR.updated_at=d.updated_at;
    setSave('ok','Enregistré à '+new Date(d.updated_at).toLocaleTimeString('fr-FR')+' · '+d.fiches_modifiees+' fiche(s) saisie(s)');
  }catch(e){
    ops.forEach(o=>QUEUE.push(o));
    setSave('err','Échec de l’enregistrement — '+e.message+' (nouvelle tentative dans 10 s)');
    setTimeout(flush,10000);
  }finally{ inflight=false; if(QUEUE.length){ clearTimeout(flushT); flushT=setTimeout(flush,800); } }
}
window.addEventListener('beforeunload', e=>{ if(QUEUE.length){ e.preventDefault(); e.returnValue=''; } });

/* ============================================================
   Preferences d'affichage — colonnes, densite, filtres lateraux.
   Gardees dans le navigateur uniquement : aucune donnee metier ici.
   ============================================================ */
const COLS=[
  {k:'intitule',lb:'Intitulé complet'},
  {k:'famille', lb:'Famille'},
  {k:'marquage',lb:'Marquage'},
  {k:'four',    lb:'Fournisseur'},
  {k:'prix',    lb:'Prix HT',        num:1},
  {k:'cmd',     lb:'Commandes',      num:1},
  {k:'recu',    lb:'Cartons re\u00e7us',  num:1},
  {k:'stock',   lb:'Stock estim\u00e9',   num:1},
  {k:'couv',    lb:'Couverture'},
  {k:'dispo',   lb:'Dispo.'},
  {k:'comp',    lb:'Fiche remplie'}
];
const COLS_DEF={intitule:0,famille:1,marquage:0,four:1,prix:1,cmd:1,recu:1,stock:0,couv:1,dispo:1,comp:1};
const PREF={cols:Object.assign({},COLS_DEF), dense:false, side:true};
(function(){ try{
  const o=JSON.parse(localStorage.getItem('infopack.ui')||'{}');
  if(o&&o.cols) Object.keys(COLS_DEF).forEach(k=>{ if(k in o.cols) PREF.cols[k]=!!o.cols[k]; });
  if(o&&typeof o.dense==='boolean') PREF.dense=o.dense;
  if(o&&typeof o.side==='boolean')  PREF.side=o.side;
}catch(e){} })();
function savePref(){ try{ localStorage.setItem('infopack.ui',JSON.stringify(PREF)); }catch(e){} }
function applyPref(){
  document.body.classList.toggle('dense',PREF.dense);
  const d=document.getElementById('btn-dense'); if(d) d.classList.toggle('btn-primary',PREF.dense);
  const l=document.getElementById('layout');    if(l) l.classList.toggle('nosid',!PREF.side);
  const b=document.getElementById('btn-side');
  if(b) b.innerHTML='<i class="ti ti-layout-sidebar-left-'+(PREF.side?'collapse':'expand')+'"></i>';
}
const colsVisibles = () => COLS.filter(c=>PREF.cols[c.k]);

function buildHead(){
  const th=document.getElementById('thead'); if(!th) return;
  if(sortK!=='nom' && !colsVisibles().some(c=>c.k===sortK)){ sortK='nom'; sortD=1; }
  th.innerHTML='<tr><th data-k="nom">Packaging<span class="si2"></span></th>'
    + colsVisibles().map(c=>'<th data-k="'+c.k+'"'+(c.num?' class="num"':'')+'>'+c.lb+'<span class="si2"></span></th>').join('')
    + '</tr>';
  th.querySelectorAll('th[data-k]').forEach(el=>el.onclick=()=>{
    if(sortK===el.dataset.k) sortD=-sortD; else { sortK=el.dataset.k; sortD=1; }
    render();
  });
}
function buildColsMenu(){
  const m=document.getElementById('menu-cols'); if(!m) return;
  m.innerHTML='<div class="mh">Colonnes affich\u00e9es</div>'+COLS.map(c=>
    '<label><input type="checkbox" data-col="'+c.k+'"'+(PREF.cols[c.k]?' checked':'')+'>'+c.lb+'</label>').join('');
  m.querySelectorAll('[data-col]').forEach(cb=>cb.onchange=()=>{
    PREF.cols[cb.dataset.col]=cb.checked; savePref(); buildHead(); render();
  });
}

/* ============================================================
   Filtres, liste, grille
   ============================================================ */
/* Reconstruit la liste des fournisseurs : appelable apres l'ajout de
   references Inpulse, sans empiler les options d'un appel a l'autre. */
function refreshFournisseurs(){
  const four=document.getElementById('f-four'); if(!four) return;
  const sel=four.value;
  four.innerHTML='<option value="">Tous fournisseurs</option>'+
    [...new Set(DB.packagings.map(p=>p.inpulse.fournisseur).filter(Boolean))].sort()
      .map(f=>'<option'+(f===sel?' selected':'')+'>'+esc(f)+'</option>').join('');
}

function buildFamButtons(){
  const fam=document.getElementById('f-fam');
  const item=(v,lb)=>'<button class="fgb'+(F.fam===v?' active':'')+'" data-fam="'+esc(v)+'">'
    +'<span>'+esc(lb)+'</span><span class="n" data-n="'+esc(v)+'"></span></button>';
  fam.innerHTML=item('','Toutes les familles')+R('famille').map(f=>item(f,f)).join('');
}
/* Compteurs des familles : chaque famille affiche ce qu'elle donnerait
   avec les autres filtres en place, le filtre famille mis de cote. */
function renderFamCounts(){
  const c=famCounts();
  document.querySelectorAll('#f-fam .n').forEach(el=>{ el.textContent=c[el.dataset.n]||0; });
}
function syncFiltres(){
  document.querySelectorAll('#f-fam [data-fam]').forEach(b=>b.classList.toggle('active',b.dataset.fam===F.fam));
  const hs=document.getElementById('f-hs'); if(hs) hs.classList.toggle('active',F.masquerHS);
  const c=document.getElementById('f-comp'); if(c) c.value=F.comp;
  const fo=document.getElementById('f-four'); if(fo) fo.value=F.four;
  const mq=document.getElementById('f-marq'); if(mq) mq.value=F.marq;
  const q=document.getElementById('q'); if(q&&q.value!==F.q) q.value=F.q;
}
/* Un point de vigilance = un filtre. Recliquer dessus le releve. */
function setFlag(k){
  if(F.flag===k){ F.flag=''; }
  else { F.flag=k; if(k==='hs') F.masquerHS=false; }
  syncFiltres(); render();
}
function resetFiltres(){
  F.q=''; F.fam=''; F.four=''; F.marq=''; F.comp=''; F.flag=''; F.masquerHS=true;
  syncFiltres(); render();
}
function focusRecherche(){
  const el=document.getElementById(PAGE==='stock'?'sq':'q');
  if(!el) return;
  if(PAGE==='pack' && !PREF.side){ PREF.side=true; savePref(); applyPref(); }
  el.focus(); el.select();
}

function buildFilters(){
  buildFamButtons();
  const fam=document.getElementById('f-fam');
  fam.onclick=e=>{const b=e.target.closest('[data-fam]');if(!b)return;
    F.fam=b.dataset.fam;syncFiltres();render();};
  const four=document.getElementById('f-four');
  refreshFournisseurs();
  document.getElementById('q').oninput=e=>{F.q=e.target.value.toLowerCase();render();};
  four.onchange=e=>{F.four=e.target.value;render();};
  document.getElementById('f-marq').onchange=e=>{F.marq=e.target.value;render();};
  document.getElementById('f-comp').onchange=e=>{F.comp=e.target.value;render();};
  const hs=document.getElementById('f-hs');
  hs.classList.toggle('active',F.masquerHS);
  hs.onclick=()=>{F.masquerHS=!F.masquerHS;if(F.masquerHS&&F.flag==='hs')F.flag='';syncFiltres();render();};
  document.getElementById('f-reset').onclick=resetFiltres;

  /* tuiles et pastilles : un seul ecouteur, le contenu est re-rendu a chaque fois */
  document.getElementById('metrics').onclick=e=>{
    const b=e.target.closest('[data-flag]'); if(b) setFlag(b.dataset.flag); };
  document.getElementById('flags').onclick=e=>{
    const b=e.target.closest('[data-flag]'); if(b){ setFlag(b.dataset.flag); return; }
    const c=e.target.closest('[data-comp]'); if(c){
      F.comp = F.comp===c.dataset.comp ? '' : c.dataset.comp; syncFiltres(); render(); } };

  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;
    document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));render();});

  buildHead(); buildColsMenu(); applyPref();
  const bc=document.getElementById('btn-cols'), mc=document.getElementById('menu-cols');
  bc.onclick=e=>{e.stopPropagation();mc.classList.toggle('on');};
  document.addEventListener('click',e=>{ if(!mc.contains(e.target)&&e.target!==bc) mc.classList.remove('on'); });
  document.getElementById('btn-dense').onclick=()=>{PREF.dense=!PREF.dense;savePref();applyPref();};
  document.getElementById('btn-side').onclick=()=>{PREF.side=!PREF.side;savePref();applyPref();};
  document.getElementById('btn-find').onclick=focusRecherche;
  document.getElementById('conn-more').onclick=toggleConnDetail;

  document.getElementById('btn-sync').onclick=()=>{
    loadOverrides().then(syncInpulse).then(()=>loadOrders(true)).then(()=>loadInventories(true));};
  document.getElementById('btn-xls').onclick=exportXls;
  document.querySelectorAll('.pagenav [data-page]').forEach(a=>a.onclick=e=>{e.preventDefault();setPage(a.dataset.page);});
  document.getElementById('sq').oninput=e=>{SF.q=e.target.value.toLowerCase();renderStock();};
  const sz=document.getElementById('s-zone');
  sz.innerHTML='<button class="fgb active" data-zone="">Toutes zones</button>'
    +ZONES_ORDRE.map(z=>'<button class="fgb" data-zone="'+esc(z)+'">'+esc(z)+'</button>').join('');
  sz.onclick=e=>{const b=e.target.closest('[data-zone]');if(!b)return;
    SF.zone=b.dataset.zone;[...sz.children].forEach(c=>c.classList.toggle('active',c===b));renderStock();};
  document.querySelectorAll('th[data-sk]').forEach(th=>th.onclick=()=>{
    if(sSortK===th.dataset.sk)sSortD=-sSortD;else{sSortK=th.dataset.sk;sSortD=th.dataset.sk==='nom'?1:-1;}renderStock();});
  document.getElementById('btn-xls-stock').onclick=exportStock;
  document.getElementById('d-close').onclick=closeDrawer;
  document.getElementById('ov').onclick=closeDrawer;
  document.addEventListener('keydown',e=>{
    const champ=/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||''));
    if((e.ctrlKey||e.metaKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); focusRecherche(); return; }
    if(e.key==='Escape'){
      if(champ && (e.target.id==='q'||e.target.id==='sq')){ e.target.value=''; e.target.blur();
        if(e.target.id==='q'){F.q='';render();} else {SF.q='';renderStock();} return; }
      if(!champ) closeDrawer();
    }
  });
}

/* Un seul predicat pour la liste et pour les compteurs de familles.
   skip permet d'ignorer un critere (la famille, pour son propre compteur). */
function passe(p,skip){
  if(skip!=='fam' && F.fam && p.app.famille!==F.fam) return false;
  if(F.four&&p.inpulse.fournisseur!==F.four)return false;
  if(F.marq&&p.app.marquage!==F.marq)return false;
  if(F.comp==='lt50'&&p._comp>=50)return false;
  if(F.comp==='lt80'&&p._comp>=80)return false;
  if(F.comp==='eq100'&&p._comp<100)return false;
  if(F.comp==='saisies'&&!OVR.records[p.id])return false;
  if(F.flag){
    const o=p._ord, st=p._stk;
    if(F.flag==='cmd'     && !(o&&!o.vide)) return false;
    if(F.flag==='nocmd'   && !(o&&o.vide))  return false;
    if(F.flag==='couvlow' && !(st&&st.couv!=null&&st.couv<STOCK.alerte_jours)) return false;
    if(F.flag==='noinv'   && !(st&&st.nInv===0)) return false;
    if(F.flag==='nogab'   && p.design.gabarit_fournisseur) return false;
    if(F.flag==='px0'     && p.inpulse.prix_ht) return false;
    if(F.flag==='pxu'     && !(p.logistique.nombre_par_carton>1&&p.inpulse.prix_ht>0&&p.inpulse.prix_ht<1)) return false;
    if(F.flag==='hs'      && !horsService(p)) return false;
  }
  if(F.q){const h=(p.nom+' '+intituleValue(p)+' '+p.app.famille+' '+p.inpulse.fournisseur+' '+
    p.app.marquage+' '+(p.identification.sku_fournisseur||'')+' '+(p.usage_tfb.usage||'')).toLowerCase();
    if(h.indexOf(F.q)<0)return false;}
  return true;
}
const cacherHS = p => horsService(p) && F.masquerHS && F.flag!=='hs';

function filtered(){
  nHS=0;
  return DB.packagings.filter(p=>{
    if(!passe(p)) return false;
    if(horsService(p)){ nHS++; if(F.masquerHS && F.flag!=='hs') return false; }
    return true;
  });
}
function famCounts(){
  const c={'':0};
  DB.packagings.forEach(p=>{
    if(!passe(p,'fam')) return;
    if(cacherHS(p)) return;
    c[p.app.famille]=(c[p.app.famille]||0)+1; c['']++;
  });
  return c;
}

function render(){
  DB.packagings.forEach(p=>{ p._comp=comp(p); p._ord=ordFor(p); p._stk=stockRef(p); });
  ROWS=filtered();
  const val=r=>sortK==='prix'?(r.inpulse.prix_ht||0):sortK==='comp'?r._comp
    :sortK==='dispo'?parseInt((r.inpulse.dispo||'0/0').split('/')[0],10)
    :sortK==='intitule'?intituleValue(r)
    :sortK==='cmd'?(r._ord?r._ord.tot.n:-1)
    :sortK==='recu'?(r._ord?r._ord.tot.rq:-1)
    :sortK==='stock'?(r._stk.total==null?-1:r._stk.total)
    :sortK==='couv'?(r._stk.couv==null?-1:r._stk.couv)
    :sortK==='famille'?r.app.famille:sortK==='marquage'?r.app.marquage
    :sortK==='four'?r.inpulse.fournisseur:String(r[sortK]||'');
  ROWS.sort((a,b)=>{const x=val(a),y=val(b);
    return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'fr'))*sortD;});
  document.querySelectorAll('#thead th[data-k]').forEach(th=>{
    const n=th.classList.contains('num')?'num ':'';
    th.className=n+(th.dataset.k===sortK?(sortD>0?'asc':'desc'):'');});
  renderMetrics(); renderFamCounts(); renderList(); renderGrid();
  document.getElementById('view-list').style.display=view==='list'?'':'none';
  document.getElementById('view-grid').style.display=view==='grid'?'grid':'none';
  document.getElementById('count').textContent=ROWS.length+' / '+DB.packagings.length+' r\u00e9f\u00e9rences';
  if(PAGE==='stock') renderStock();
  const hsc=document.getElementById('f-hs-n');
  if(hsc){ hsc.textContent=nHS?' ('+nHS+')':''; document.getElementById('f-hs').title=
    nHS?(nHS+' r\u00e9f\u00e9rence(s) dont la date de fin de service est pass\u00e9e'):'aucune r\u00e9f\u00e9rence hors service'; }
}

/* ============================================================
   Indicateurs — deux niveaux.
   1. quatre tuiles : ce qui sort de l'entrepot et ce qu'il reste.
   2. pastilles de vigilance : chacune filtre la liste d'un clic.
   ============================================================ */
function renderMetrics(){
  const a=DB.packagings, n=a.length;
  const actifs=a.filter(p=>!horsService(p)), nA=actifs.length;

  let nCmd=0, nRecu=0, tourne=0, jamais=0;
  const ordPret=!!ORD;
  actifs.forEach(p=>{ const o=p._ord; if(!o) return;
    if(o.vide) jamais++; else { tourne++; nCmd+=o.tot.n; nRecu+=o.tot.rq; } });

  let stockTot=0, avecInv=0, alerte=0, sansInv=0;
  actifs.forEach(p=>{ const st=p._stk;
    if(st.nInv){ avecInv++; stockTot+=st.total||0; } else sansInv++;
    if(st.couv!=null&&st.couv<STOCK.alerte_jours) alerte++; });

  const tiles=[
    {cls:'gold', l:'Volume re\u00e7u 2026', v:ordPret?fmt(nRecu):'\u2026', u:'cartons',
     s:ordPret?(((ORDINFO&&ORDINFO.seen)||0).toLocaleString('fr-FR')+' commandes d\u00e9pouill\u00e9es \u00b7 '
                +nCmd.toLocaleString('fr-FR')+' lignes depuis janvier')
              :'historique Inpulse en cours de lecture'},
    {k:'cmd', l:'R\u00e9f\u00e9rences qui tournent', v:ordPret?(tourne+' / '+nA):'\u2026',
     s:ordPret?(jamais+' r\u00e9f. jamais command\u00e9e(s) \u2014 cliquer pour ne voir que celles qui tournent')
              :'en attente de l\u2019historique'},
    {k:'couvlow', cls:alerte?'alert':'', l:'Couverture sous '+STOCK.alerte_jours+' j', v:alerte,
     s:alerte?'r\u00e9f\u00e9rences \u00e0 r\u00e9approvisionner \u2014 cliquer pour les isoler'
             :'aucune alerte sur les r\u00e9f\u00e9rences inventori\u00e9es'},
    {k:'noinv', l:'Stock estim\u00e9', v:fmt(stockTot), u:'unit\u00e9s',
     s:avecInv+' / '+nA+' r\u00e9f. inventori\u00e9es \u2014 cliquer pour voir les '+sansInv+' sans inventaire'}
  ];
  document.getElementById('metrics').innerHTML=tiles.map(t=>{
    const tag=t.k?'button':'div';
    return '<'+tag+' class="hm '+(t.cls||'')+(t.k?' clic':'')+(t.k&&F.flag===t.k?' on':'')+'"'
      +(t.k?' type="button" data-flag="'+t.k+'"':'')+'>'
      +'<div class="hl">'+t.l+'</div>'
      +'<div class="hv">'+t.v+(t.u?'<span class="un">'+t.u+'</span>':'')+'</div>'
      +'<div class="hs">'+t.s+'</div></'+tag+'>';
  }).join('');

  const moy=Math.round(a.reduce((x,p)=>x+p._comp,0)/n);
  const den=a.map(p=>fieldsTFB(p).length);
  const dmin=Math.min.apply(null,den), dmax=Math.max.apply(null,den);
  const chips=[
    {t:'info', l:'Fiches remplies', v:moy+' %',
     ti:'moyenne sur '+(dmin===dmax?dmin:dmin+' \u00e0 '+dmax)+' champs TFB'},
    {t:'info', l:'Fiches saisies', v:Object.keys(OVR.records).length+' / '+n,
     ti:'au moins un champ renseign\u00e9 dans l\u2019app'},
    {t:'comp', key:'lt50', l:'\u00c0 compl\u00e9ter', v:a.filter(p=>p._comp<50).length,
     ti:'fiches remplies \u00e0 moins de 50 %'},
    {t:'flag', key:'nogab', l:'Sans gabarit', v:a.filter(p=>!p.design.gabarit_fournisseur).length,
     ti:'aucun fichier fournisseur joint'},
    {t:'flag', key:'px0', ko:1, l:'Prix \u00e0 0,00 \u20ac', v:a.filter(p=>!p.inpulse.prix_ht).length,
     ti:'prix absent dans Inpulse'},
    {t:'flag', key:'pxu', ko:1, l:'Prix incoh\u00e9rents',
     v:a.filter(p=>p.logistique.nombre_par_carton>1&&p.inpulse.prix_ht>0&&p.inpulse.prix_ht<1).length,
     ti:'prix unitaire saisi sur un carton'},
    {t:'flag', key:'nocmd', l:'Jamais command\u00e9es', v:jamais, ti:'aucune commande depuis janvier 2026'},
    {t:'flag', key:'hs', ko:1, l:'Hors service', v:a.filter(horsService).length,
     ti:'date de fin de service pass\u00e9e \u2014 cliquer pour ne voir que celles-ci'}
  ];
  document.getElementById('flags').innerHTML='<span class="flagl">Points de vigilance</span>'+chips.map(c=>{
    if(c.t==='info') return '<span class="flag info" title="'+esc(c.ti)+'">'+c.l+' <b>'+c.v+'</b></span>';
    const on = c.t==='flag' ? F.flag===c.key : F.comp===c.key;
    return '<button type="button" class="flag'+(c.ko?' ko':'')+(on?' on':'')+'" title="'+esc(c.ti)+'" '
      +(c.t==='flag'?'data-flag="':'data-comp="')+c.key+'">'+c.l+' <b>'+c.v+'</b></button>';
  }).join('');
}

const pillMarq=m=>'<span class="pill '+(m==='TFB'?'p-tfb':m==='Co-branding'?'p-cob':'p-neutre')+'">'+esc(m)+'</span>';
const bar=v=>'<div class="bw"><div class="bb"><div class="bf" style="width:'+v+'%;background:'+
  (v<25?'#dc2626':v<60?'#d97706':'#16a34a')+'"></div></div><span class="bp">'+v+'%</span></div>';

function renderList(){
  const tb=document.getElementById('tb');
  const cols=colsVisibles(), span=cols.length+1;
  if(!ROWS.length){tb.innerHTML='<tr><td colspan="'+span+'"><div class="empty"><i class="ti ti-package-off"></i>'+
    '<p>Aucun packaging ne correspond aux filtres.</p></div></td></tr>';return;}
  tb.innerHTML=ROWS.map(p=>{
    const mode=EXP.get(p.id)||'', open=mode==='ord';
    const o=p._ord, st=p._stk;
    const dispo=(p.inpulse.dispo||'').split('/')[0]!=='0';
    const cov = st.couv==null?'<span class="cov na">\u2014</span>'
      :'<span class="cov '+(st.couv<STOCK.alerte_jours?'low':st.couv<STOCK.confort_jours?'mid':'ok')+'">'+st.couv+' j</span>';
    const C={
      intitule:'<td class="tm">'+esc(intituleValue(p))+'</td>',
      famille:'<td class="tm">'+esc(p.app.famille)+'</td>',
      marquage:'<td>'+pillMarq(p.app.marquage)+'</td>',
      four:'<td class="tm">'+esc(p.inpulse.fournisseur)+'</td>',
      prix:'<td class="num">'+eur(p.inpulse.prix_ht)+'</td>',
      cmd:'<td class="num cmdcell">'+(!o?'<span class="tm">\u00b7</span>'
            :o.vide?'<span class="tm">\u2014</span>':'<strong>'+o.tot.n+'</strong>')+'</td>',
      recu:'<td class="num">'+(!o||o.vide?'<span class="tm">\u2014</span>':fmt(o.tot.rq))+'</td>',
      stock:'<td class="num">'+(st.total==null?'<span class="tm">\u2014</span>':'<strong>'+fmt(st.total)+'</strong>')+'</td>',
      couv:'<td>'+cov+'</td>',
      dispo:'<td class="dispocell" data-dispo="'+p.id+'" title="voir les boutiques exactes">'
        +'<span class="pill '+(dispo?'p-ok':'p-warn')+'">'+esc(p.inpulse.dispo)+'</span>'
        +'<i class="ti ti-'+(mode==='bq'?'chevron-up':'map-pin')+'"></i></td>',
      comp:'<td>'+bar(p._comp)+'</td>'
    };
    return '<tr class="mainrow'+(open?' open':'')+'" data-id="'+p.id+'" data-open="'+p.id+'" title="Ouvrir la fiche">'
      + '<td class="tb namecell">'
        + '<span class="chev'+(open?' on':'')+'" data-toggle="'+p.id+'" '
        + 'title="Historique des commandes, mois par mois"><i class="ti ti-chevron-right"></i></span>'
        + esc(p.nom)
        + (p._nouveau?' <i class="ti ti-sparkles edited" title="cr\u00e9\u00e9e depuis Inpulse \u2014 fiche \u00e0 compl\u00e9ter"></i>':'')
        + (OVR.records[p.id]?' <i class="ti ti-pencil edited" title="fiche saisie"></i>':'')
      + '</td>'
      + cols.map(c=>C[c.k]).join('')
      + '</tr>'
      + (mode?('<tr class="subrow"><td colspan="'+span+'">'+(mode==='bq'?dispoPanel(p):ordTable(p))+'</td></tr>'):'');
  }).join('');
  tb.querySelectorAll('[data-toggle]').forEach(el=>el.onclick=e=>{
    e.stopPropagation(); const id=el.dataset.toggle;
    if(EXP.get(id)==='ord') EXP.delete(id); else EXP.set(id,'ord');
    renderList();
  });
  tb.querySelectorAll('[data-dispo]').forEach(el=>el.onclick=e=>{
    e.stopPropagation(); const id=el.dataset.dispo;
    if(EXP.get(id)==='bq') EXP.delete(id); else EXP.set(id,'bq');
    renderList();
  });
  /* la ligne entiere ouvre la fiche : plus de colonne « Ouvrir la fiche » */
  tb.querySelectorAll('tr.mainrow[data-open]').forEach(el=>el.onclick=()=>openDrawer(el.dataset.open));
}

const fmt = n => (n==null||isNaN(n))?'—':(Math.round(n*100)/100).toLocaleString('fr-FR');

/* Tableau mois par mois : commandes, cartons commandes / recus, ecart, unites */
function ordTable(p){
  if(!ORD) return '<div class="ordempty"><i class="ti ti-loader-2"></i> Historique de commandes en cours de chargement…</div>';
  const o=ordFor(p);
  if(o.vide) return '<div class="ordempty"><i class="ti ti-info-circle"></i> Aucune commande de cette référence depuis janvier 2026.</div>';
  const pcb=p.logistique.nombre_par_carton;
  const cell=(m,f)=>{ const c=o.mois[m]; return c?f(c):null; };
  const rows=[
    {lb:'Commandes',        v:m=>cell(m,c=>c.n),  t:o.tot.n,  cls:'', u:''},
    {lb:'Cartons commandés',v:m=>cell(m,c=>c.oq), t:o.tot.oq, cls:'', u:''},
    {lb:'Cartons reçus',    v:m=>cell(m,c=>c.rq), t:o.tot.rq, cls:'', u:''},
    {lb:'Écart',            v:m=>cell(m,c=>c.rq-c.oq), t:o.tot.rq-o.tot.oq, cls:'ecart', u:''}
  ];
  if(pcb) rows.push({lb:'Unités reçues', v:m=>cell(m,c=>c.rq*pcb), t:o.tot.rq*pcb, cls:'unit', u:''});
  const th=MONTHS.map(m=>'<th'+(o.mois[m]?'':' class="off"')+'>'+moisCourt(m)+'</th>').join('');
  const body=rows.map(r=>'<tr class="'+r.cls+'"><th>'+r.lb+'</th>'
    + MONTHS.map(m=>{ const x=r.v(m);
        if(x==null||x===0&&r.cls!=='ecart') return '<td class="void">'+(x===0?'0':'·')+'</td>';
        const neg=r.cls==='ecart'&&x<0, pos=r.cls==='ecart'&&x>0;
        return '<td'+(neg?' class="neg"':pos?' class="pos"':'')+'>'+(pos?'+':'')+fmt(x)+'</td>'; }).join('')
    + '<td class="tot">'+(r.cls==='ecart'&&r.t>0?'+':'')+fmt(r.t)+'</td></tr>').join('');
  return '<div class="ordwrap"><table class="ordtab"><thead><tr><th></th>'+th+'<th class="tot">Total</th></tr></thead>'
    + '<tbody>'+body+'</tbody></table>'
    + '<div class="ordnote"><i class="ti ti-info-circle"></i> Mois de la <strong>date de commande</strong>. '
    + 'La quantité reçue est exprimée dans le conditionnement commandé, donc directement comparable. '
    + (pcb?('Unités = cartons × '+pcb+' (PCB Inpulse). '):'PCB inconnu, unités non calculables. ')
    + 'Brouillons exclus.</div></div>';
}

function renderGrid(){
  const g=document.getElementById('view-grid');
  g.innerHTML=ROWS.map(p=>'<div class="card" data-id="'+p.id+'">'
    +'<div class="card-ph">'+(p.photos[0]?'<img src="'+esc(p.photos[0])+'" alt="">':'<i class="ti ti-camera-plus"></i>')+'</div>'
    +'<div class="card-b"><div class="card-t">'+esc(p.nom)+'</div>'
    +'<div class="card-m"><span>'+esc(p.app.famille)+'</span><span>'+eur(p.inpulse.prix_ht)+'</span></div>'
    +'<div style="margin-top:8px">'+bar(p._comp)+'</div></div></div>').join('');
  g.querySelectorAll('[data-id]').forEach(c=>c.onclick=()=>openDrawer(c.dataset.id));
}

/* ============================================================
   Fiche — champs Inpulse en lecture, champs TFB éditables
   ============================================================ */
const AUTO_CALC = {
  'dimensions.developpe_cm'        : r=>devAuto(r),
  'dimensions.dimensions_a_plat_cm': r=>aPlatAuto(r),
  'identification.intitule_complet': r=>intituleAuto(r)
};
const SRC_INP='<span class="src src-inp" title="piloté par Inpulse, non modifiable ici">Inpulse</span>';
const SRC_TFB='<span class="src src-tfb" title="saisi par TFB">TFB</span>';
const SRC_CALC='<span class="src src-calc" title="calculé à partir des dimensions saisies (config.js)">Calculé</span>';
const SRC_MAN='<span class="src src-man" title="valeur forcée à la main, non écrasée par le recalcul">Manuel</span>';

function control(r,f){
  const v=getPath(r,f.path), id=r.id, P=f.path;
  const a='data-id="'+id+'" data-path="'+P+'"';
  const U=uOf(r,f);
  if(P==='inpulse.dispo') return dispoPanel(r);
  if(f.src==='inp'){
    const w=valOf(r,f);   // certains champs Inpulse sont recomposés (val:)
    const txt=f.fmt?f.fmt(w):(w===true?'oui':w===false?'non':w);
    return isEmpty(txt)||txt==='—'?'<div class="fv void">—</div>'
      :'<div class="fv">'+esc(txt)+(U?' <span class="u">'+esc(U)+'</span>':'')+'</div>';
  }
  switch(f.type){
    case 'calc': return calcControl(r,f);
    case 'calctext': return calcTextControl(r,f);
    case 'dec': {
      const sel=f.unitSel?uniteSelect(r,f):(U?'<span class="u">'+esc(U)+'</span>':'');
      return '<div class="ctl"><input class="ed" type="text" inputmode="decimal" data-dec="1" '+a+
        ' value="'+(v==null?'':esc(String(v).replace('.',',')))+'" placeholder="—">'+sel+'</div>';
    }
    case 'num':
      return '<div class="ctl"><input class="ed" type="number" step="'+(f.step||'1')+'" '+a+
        ' value="'+(v==null?'':esc(v))+'" placeholder="—">'+(f.u?'<span class="u">'+esc(f.u)+'</span>':'')+'</div>';
    case 'area':
      return '<textarea class="ed" rows="3" '+a+' placeholder="à compléter">'+esc(v||'')+'</textarea>';
    case 'select': {
      const opts=(f.opt?f.opt():[]);
      const fk=id+'|'+P, known=opts.indexOf(v)>=0, libre=FREE[fk]||(!known&&!isEmpty(v));
      return '<div class="ctl"><select class="ed" '+a+'><option value="">— à compléter —</option>'
        +opts.map(o=>'<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>').join('')
        +(f.free?'<option value="__autre"'+(libre?' selected':'')+'>Autre…</option>':'')
        +'</select>'+(f.free&&libre?'<input class="ed free" type="text" '+a+' value="'+esc(known?'':(v||''))+'" placeholder="valeur libre">':'')+'</div>';
    }
    case 'bool':
      return '<select class="ed" '+a+'><option value="">—</option>'
        +'<option value="1"'+(v===true?' selected':'')+'>oui</option>'
        +'<option value="0"'+(v===false?' selected':'')+'>non</option></select>';
    case 'date':
      return '<input class="ed" type="date" '+a+' value="'+esc(v||'')+'">';
    case 'multi': {
      const sel=Array.isArray(v)?v:[];
      return '<div class="multi">'+(f.opt?f.opt(r):[]).map(o=>{
        const b=BQ_ABR[o], c=b?ZONES[b.zone]:null;
        const ttl=b?(b.nom+' — '+b.zone+(b.hub?' (plateforme)':'')):'boutique hors référentiel';
        return '<label class="chk'+(sel.indexOf(o)>=0?' on':'')+'" title="'+esc(ttl)+'">'
          +'<input type="checkbox" class="ed-multi" '+a+' value="'+esc(o)+'"'+(sel.indexOf(o)>=0?' checked':'')+'>'
          +(c?'<span class="zdot" style="background:'+c.pt+';display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:1px"></span>':'')
          +esc(o)+'</label>';
      }).join('')+'</div>';
    }
    case 'tags': {
      const t=Array.isArray(v)?v:[];
      return '<div class="tags">'+t.map((x,i)=>'<span class="chip">'+esc(x)+
          '<button class="chip-x ed-tagdel" '+a+' data-i="'+i+'" title="retirer">×</button></span>').join('')
        +'<input class="ed-tagadd taginput" '+a+' placeholder="ajouter puis Entrée"></div>';
    }
    case 'link': case 'photo': {
      const isImg=/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v||'');
      let head='';
      if(v) head='<div class="linkrow"><a href="'+esc(v)+'" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> ouvrir</a></div>';
      const prev=(f.type==='photo')
        ? (v&&isImg?'<img class="thumb" src="'+esc(v)+'" alt="">':'<div class="slot sm"><i class="ti ti-photo-plus"></i>'+esc(f.lb)+'</div>')
        : (v?'':'<div class="filedrop"><i class="ti ti-link"></i> Coller le lien du fichier (Drive, Dropbox…)</div>');
      return prev+head+'<input class="ed" type="url" '+a+' value="'+esc(v||'')+'" placeholder="https://…">';
    }
    default: {
      const inp='<input class="ed" type="text" '+a+' value="'+esc(v||'')+'" placeholder="à compléter">';
      return f.u ? '<div class="ctl">'+inp+'<span class="u">'+esc(f.u)+'</span></div>' : inp;
    }
  }
}

/* unité : soit une chaîne, soit une fonction de la référence (unité paramétrable) */
const uOf = (r,f) => typeof f.u==='function' ? f.u(r) : f.u;

function uniteSelect(r,f){
  const cur=uniteQte(r);
  return '<select class="ed unitsel" data-id="'+r.id+'" data-path="'+f.unitSel+'" title="unité de la quantité">'
    + UNITES_QUANTITE.map(u=>'<option'+(u===cur?' selected':'')+'>'+esc(u)+'</option>').join('')
    + '</select>';
}

/* ---- champs calculés : valeur, formule en légende, forçage manuel ---- */
/* Intitulé complet : proposé par la règle de nommage, forçable à la main.
   Même logique que les dimensions calculées, en texte. */
function calcTextControl(r,f){
  const modePath='identification.intitule_mode';
  const mode=intituleMode(r), auto=intituleAuto(r);
  const a='data-id="'+r.id+'" data-path="'+f.path+'"';
  let html='';
  if(mode==='manuel'){
    html+='<div class="ctl"><input class="ed" type="text" '+a+
      ' value="'+esc(getPath(r,f.path)||'')+'" placeholder="'+esc(auto||'intitulé complet')+'"></div>';
  } else {
    html+='<div class="fv'+(auto?'':' void')+'">'+(auto?esc(auto):'\u2014')+'</div>';
  }
  const v=versionDesign(r), leg=[];
  if(INTITULE.mentions[r.app&&r.app.marquage]){
    leg.push(v ? ('version lue dans le libellé Inpulse : '+v)
               : ('aucune version dans le libellé Inpulse \u2014 '+INTITULE.version_absente+' à corriger'));
  } else leg.push('marquage neutre \u2014 pas de version de design');
  if(mode==='manuel') leg.push('valeur forcée à la main');
  html+='<div class="calclegend">'+esc(leg.join(' · '))+'</div><div class="calcbtns">'
    + (mode==='auto'
      ? '<button class="btn btn-sm" data-calcforce="'+f.path+'" data-mode="'+modePath+'" data-id="'+r.id+
        '"><i class="ti ti-pencil"></i>Corriger l\u2019intitulé</button>'
      : '<button class="btn btn-sm" data-calcauto="'+f.path+'" data-mode="'+modePath+'" data-id="'+r.id+
        '"><i class="ti ti-refresh"></i>Revenir à l\u2019intitulé automatique</button>')
    + '</div>';
  return html;
}

function calcControl(r,f){
  const dev = f.kind==='dev';
  const cfg = cfgAPlat(r);
  const valuePath = f.path;
  const modePath  = dev?'dimensions.developpe_mode':'dimensions.a_plat_mode';
  const figee     = !dev && cfg.mode==='manuel';        // famille sans formule fiable
  const mode      = figee?'manuel':(dev?devMode(r):aPlatMode(r));
  const auto      = dev?devAuto(r):aPlatAuto(r);
  const v         = valOf(r,f);
  const a='data-id="'+r.id+'" data-path="'+valuePath+'"';
  const formule   = dev?DEVELOPPE.lb:(A_PLAT_FORMULES[cfg.formule]||{}).lb;
  let html='';

  if(mode==='manuel'){
    html+='<div class="ctl"><input class="ed" type="text" '+a+' value="'+esc(getPath(r,valuePath)||'')+
      '" placeholder="L × H">'+(f.u?'<span class="u">'+esc(f.u)+'</span>':'')+'</div>';
  } else {
    html+='<div class="fv'+(isEmpty(v)?' void':'')+'">'+(isEmpty(v)?'—':esc(v)+
      (f.u?' <span class="u">'+esc(f.u)+'</span>':''))+'</div>';
  }

  const leg=[];
  if(mode==='auto'&&formule) leg.push(formule);
  if(figee) leg.push(cfg.note||'saisie manuelle');
  else if(mode==='manuel') leg.push('valeur forcée à la main');
  if(mode==='auto'&&isEmpty(v)) leg.push('dimensions nécessaires manquantes');
  if(leg.length) html+='<div class="calclegend">'+esc(leg.join(' · '))+'</div>';

  if(dev){
    html+='<div class="calcparams">'
      +'<label>rabat de collage <input class="ed p" type="text" inputmode="decimal" data-dec="1" data-id="'+r.id+
        '" data-path="dimensions.rabat_collage_cm" value="'+esc(String(devRabat(r)).replace('.',','))+'"> cm</label>'
      +'<label>fond <input class="ed p" type="text" inputmode="decimal" data-dec="1" data-id="'+r.id+
        '" data-path="dimensions.fond_cm" value="'+(devFond(r)==null?'':esc(String(fmtCm(devFond(r)))))+'"> cm</label>'
      +'<span class="hint">défauts : rabat '+esc(DEVELOPPE.rabat_lb)+' · fond = '+esc(DEVELOPPE.fond_lb)+'</span></div>';
  }

  if(!figee){
    html+='<div class="calcbtns">';
    if(mode==='auto') html+='<button class="btn btn-sm" data-calcforce="'+valuePath+'" data-mode="'+modePath+
      '" data-id="'+r.id+'"><i class="ti ti-pencil"></i>Forcer une valeur</button>';
    else html+='<button class="btn btn-sm" data-calcauto="'+valuePath+'" data-mode="'+modePath+
      '" data-id="'+r.id+'"'+(auto?'':' disabled title="dimensions nécessaires manquantes"')+
      '><i class="ti ti-refresh"></i>Recalculer</button>';
    html+='</div>';
  }
  return html;
}

function fieldHTML(r,f){
  const filled=!isEmpty(valOf(r,f));
  const ovr=OVR.records[r.id]&&OVR.records[r.id][f.path]!==undefined;
  let badge='';
  if(f.type==='calc'){
    const dev=f.kind==='dev';
    const figee=!dev&&cfgAPlat(r).mode==='manuel';
    const mode=figee?'manuel':(dev?devMode(r):aPlatMode(r));
    badge=mode==='auto'?SRC_CALC:SRC_MAN;
  }
  if(f.type==='calctext') badge=intituleMode(r)==='auto'?SRC_CALC:SRC_MAN;
  return '<div class="f'+(f.wide?' wide':'')+(f.src==='tfb'?' ed-f':'')+(filled?'':' vide')+'">'
    +'<div class="fl">'+esc(f.lb)+(f.src==='inp'?SRC_INP:SRC_TFB)+badge
    +(ovr?'<i class="ti ti-point-filled dotsaved" title="saisi dans l’app"></i>':'')+'</div>'
    +control(r,f)+'</div>';
}

function tabBody(r,k){
  const fs=byTab(k).filter(f=>visible(f,r)); const groups=[];
  fs.forEach(f=>{ const g=groups.find(x=>x.g===f.grp); (g?g.f:(groups.push({g:f.grp,f:[]}),groups[groups.length-1].f)).push(f); });
  let html='';
  if(k==='design') html+='<div class="note"><i class="ti ti-info-circle"></i><div>Les fichiers se renseignent par <strong>lien</strong> (Drive, Dropbox) : collez l’URL, l’app garde le lien et affiche un aperçu pour les images. Le téléversement direct viendra dans un second temps.</div></div>';
  if(k==='photos') html+='<div class="note"><i class="ti ti-camera"></i><div>Quatre prises par référence, dans cet ordre. Collez l’URL de chaque image — un aperçu s’affiche dès que le lien est valide.</div></div>';
  groups.forEach(g=>{ html+='<div class="gh">'+esc(g.g)+'</div><div class="fields'+(k==='photos'?' photofields':'')+'">'
    +g.f.map(f=>fieldHTML(r,f)).join('')+'</div>'; });
  if(k==='logi'){
    html+='<div class="gh">Trajet logistique</div>'+trajetHTML(r)
      +'<div class="calcbtns"><button class="btn btn-sm" data-pdv="'+r.id+'">'
      +'<i class="ti ti-wand"></i>Reprendre les boutiques qui commandent dans « Points de vente concernés »</button></div>';
  }
  return html;
}

/* ---- bandeau « hors service », en tête de fiche ---- */
function bandHTML(r){
  if(!horsService(r)) return '';
  const prop = r.app.statut!=='Arrêté'
    ? '<button class="btn btn-sm" data-statut="'+r.id+'"><i class="ti ti-archive"></i>Basculer le statut sur « Arrêté »</button>'
    : '<span class="bandok"><i class="ti ti-check"></i>statut déjà « Arrêté »</span>';
  return '<div class="band"><i class="ti ti-circle-off"></i>'
    +'<div>Référence hors service depuis le <strong>'+esc(dateFR(dateFinService(r)))+'</strong></div>'+prop+'</div>';
}

function openDrawer(id){
  current=DB.packagings.find(p=>p.id===id); if(!current) return;
  const r=current;
  document.getElementById('d-title').textContent=r.nom;
  document.getElementById('d-sub').innerHTML=pillMarq(r.app.marquage)
    +'<span>'+esc(r.app.famille)+'</span><span>·</span><span>'+esc(r.inpulse.fournisseur)+'</span>'
    +'<span>·</span><span>'+eur(r.inpulse.prix_ht)+'</span>'
    +'<span class="pill '+(r._comp<25?'p-warn':r._comp<60?'p-todo':'p-ok')+'">fiche '+r._comp+' %</span>';
  document.getElementById('d-tabs').innerHTML=TABS.map(t=>{
    const c=tabComp(r,t.k);
    return '<div class="tab'+(t.k===activeTab?' active':'')+'" data-tab="'+t.k+'"><i class="ti '+t.i+'"></i>'
      +t.t+'<span class="tcount'+(c.n===0?' zero':c.n===c.t?' full':'')+'">'+c.n+'/'+c.t+'</span></div>';
  }).join('');
  document.getElementById('d-tabs').querySelectorAll('[data-tab]')
    .forEach(el=>el.onclick=()=>{activeTab=el.dataset.tab;openDrawer(id);});
  document.getElementById('d-band').innerHTML=bandHTML(r);
  const b=document.getElementById('d-body');
  b.innerHTML=tabBody(r,activeTab);
  b.scrollTop=0;
  wire(b);
  const bs=document.querySelector('#d-band [data-statut]');
  if(bs) bs.onclick=()=>{ saveField(bs.dataset.statut,'app.statut','Arrêté'); openDrawer(id); };
  document.getElementById('ov').classList.add('on');
  document.getElementById('drawer').classList.add('on');
}
function closeDrawer(){ if(QUEUE.length) flush();
  document.getElementById('ov').classList.remove('on');
  document.getElementById('drawer').classList.remove('on'); current=null; }

/* ---- branchement des contrôles ---- */
function wire(root){
  root.querySelectorAll('input.ed, textarea.ed, select.ed').forEach(el=>{
    const id=el.dataset.id, path=el.dataset.path;
    const commit=()=>{
      let v;
      if(el.tagName==='SELECT'){
        if(el.value==='__autre'){ FREE[id+'|'+path]=true; openDrawer(id); return; }
        delete FREE[id+'|'+path];
        const f=FIELDS.find(x=>x.path===path);
        v = f&&f.type==='bool' ? (el.value===''?null:el.value==='1') : (el.value||null);
      } else if(el.dataset.dec){
        if(el.value.trim()===''){ v=null; }
        else { v=num(el.value); if(v===null){ el.classList.add('bad'); return; } }
        el.classList.remove('bad');
      } else if(el.type==='number'){
        v = el.value===''?null:Number(el.value);
        if(v!==null&&isNaN(v)) return;
      } else {
        v = el.value.trim()||null;
      }
      const rec=DB.packagings.find(p=>p.id===id);
      /* cohérence : une fin de service ne peut pas précéder la mise en service */
      if(path==='deploiement.date_fin_service' && v){
        const deb=rec.deploiement&&rec.deploiement.date_mise_en_service;
        if(deb && v<deb){
          fieldMsg(el,'La date de fin ne peut pas précéder la mise en service ('+dateFR(deb)+').');
          el.value=rec.deploiement.date_fin_service||''; return;
        }
      }
      if(path==='deploiement.date_mise_en_service' && v){
        const fin=rec.deploiement&&rec.deploiement.date_fin_service;
        if(fin && fin<v){
          fieldMsg(el,'La mise en service ne peut pas suivre la fin de service ('+dateFR(fin)+').');
          el.value=rec.deploiement.date_mise_en_service||''; return;
        }
      }
      const cur=getPath(rec,path);
      if((cur==null?null:cur)===v) return;
      saveField(id,path,v);
      const f=FIELDS.find(x=>x.path===path);
      if(/^dimensions\./.test(path)||/^app\.famille$/.test(path)||path==='deploiement.date_fin_service'
         ||path==='usage_tfb.unite_quantite'){ openDrawer(id); return; }
      if(f&&(f.type==='photo'||f.type==='link'||f.type==='select')) openDrawer(id);
    };
    el.addEventListener('change',commit);
    if(el.tagName==='TEXTAREA'||el.type==='text'||el.type==='url') el.addEventListener('blur',commit);
    el.addEventListener('keydown',e=>{ if(e.key==='Enter'&&el.tagName!=='TEXTAREA'){ e.preventDefault(); el.blur(); }});
  });
  /* boutons des champs calculés */
  /* AUTO_CALC : où chaque champ calculé va chercher sa valeur proposée */
  root.querySelectorAll('[data-calcforce]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.id, vp=el.dataset.calcforce, mp=el.dataset.mode;
    const r=DB.packagings.find(p=>p.id===id);
    const suggestion = (AUTO_CALC[vp]||aPlatAuto)(r);
    saveField(id,mp,'manuel');
    if(suggestion && isEmpty(getPath(r,vp))) saveField(id,vp,suggestion);
    openDrawer(id);
  });
  root.querySelectorAll('[data-calcauto]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.id, vp=el.dataset.calcauto, mp=el.dataset.mode;
    saveField(id,vp,null); saveField(id,mp,'auto'); openDrawer(id);
  });
  root.querySelectorAll('[data-pdv]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.pdv, r=DB.packagings.find(p=>p.id===id);
    const ag=bqAgg(r);
    const opts=R('points_de_vente');
    const sel=BOUTIQUES.filter(b=>ag[b.abr]&&ag[b.abr].n).map(b=>b.abr).filter(x=>opts.indexOf(x)>=0);
    saveField(id,'deploiement.points_de_vente',sel.length?sel:null);
    openDrawer(id);
  });
  root.querySelectorAll('.ed-multi').forEach(el=>el.addEventListener('change',()=>{
    const id=el.dataset.id, path=el.dataset.path;
    const sel=[...root.querySelectorAll('.ed-multi[data-path="'+path+'"]:checked')].map(x=>x.value);
    el.closest('label').classList.toggle('on',el.checked);
    saveField(id,path,sel.length?sel:null);
  }));
  root.querySelectorAll('.ed-tagadd').forEach(el=>el.addEventListener('keydown',e=>{
    if(e.key!=='Enter') return; e.preventDefault();
    const val=el.value.trim(); if(!val) return;
    const id=el.dataset.id, path=el.dataset.path;
    const cur=getPath(DB.packagings.find(p=>p.id===id),path)||[];
    if(cur.indexOf(val)<0) saveField(id,path,cur.concat([val]));
    openDrawer(id);
  }));
  root.querySelectorAll('.ed-tagdel').forEach(el=>el.addEventListener('click',()=>{
    const id=el.dataset.id, path=el.dataset.path, i=+el.dataset.i;
    const cur=(getPath(DB.packagings.find(p=>p.id===id),path)||[]).slice();
    cur.splice(i,1); saveField(id,path,cur.length?cur:null); openDrawer(id);
  }));
}

function fieldMsg(el,txt){
  const box=el.closest('.f'); if(!box) return;
  let m=box.querySelector('.fieldmsg');
  if(!m){ m=document.createElement('div'); m.className='fieldmsg'; box.appendChild(m); }
  m.textContent=txt;
  clearTimeout(m._t); m._t=setTimeout(()=>{ if(m.parentNode) m.parentNode.removeChild(m); },6000);
}


/* ============================================================
   Boutiques — le référentiel vit dans config.js.
   Rapprochement Inpulse : BOUTIQUES[].inpulse == store.name
   ============================================================ */
const BQ_ABR = {}; BOUTIQUES.forEach(b=>BQ_ABR[b.abr]=b);
const BQ_INP = {}; BOUTIQUES.forEach(b=>BQ_INP[b.inpulse.trim().toUpperCase()]=b);
let BQ_SID = {};                 // storeId Inpulse -> boutique
let BQ_ORPHELINS = [];           // boutiques Inpulse sans correspondance dans config.js
function indexStores(){
  BQ_SID={}; BQ_ORPHELINS=[];
  Object.keys(SNAMES||{}).forEach(sid=>{
    const n=String(SNAMES[sid]||'').trim().toUpperCase();
    const b=BQ_INP[n];
    if(b) BQ_SID[sid]=b; else if(n) BQ_ORPHELINS.push(SNAMES[sid]);
  });
}

/* agrégat de commandes par boutique, pour une référence */
function bqAgg(p){
  const key=p.identification.intitule_inpulse.trim().toUpperCase();
  const raw=(BYSTORE&&BYSTORE[key])||null;
  const out={};
  if(!raw) return out;
  Object.keys(raw).forEach(sid=>{
    const b=BQ_SID[sid]; if(!b) return;
    const s=raw[sid];
    const o=out[b.abr]||(out[b.abr]={n:0,oq:0,rq:0,mois:{},last:null});
    o.n+=s.n||0; o.oq+=s.oq||0; o.rq+=s.rq||0;
    Object.keys(s.mois||{}).forEach(m=>{ const c=o.mois[m]||(o.mois[m]={n:0,oq:0,rq:0});
      c.n+=s.mois[m].n||0; c.oq+=s.mois[m].oq||0; c.rq+=s.mois[m].rq||0; });
    if(s.last&&(!o.last||s.last>o.last)) o.last=s.last;
  });
  return out;
}
const uniteCmd = p => (p.logistique.unite_commande||'unité').toLowerCase();

/* carte des boutiques : quatre zones, quatre couleurs */
function bqMap(p,opts){
  opts=opts||{};
  const ag=opts.ag||bqAgg(p);
  const pcb=p.logistique.nombre_par_carton||null;
  let html='<div class="bqwrap">';
  ZONES_ORDRE.forEach(z=>{
    const list=BOUTIQUES.filter(b=>b.zone===z); if(!list.length) return;
    const c=ZONES[z];
    html+='<div class="bqzone"><div class="bqzl" style="color:'+c.pt+'">'
      +'<span class="zdot" style="background:'+c.pt+'"></span>'+esc(z)+'</div><div class="bqs">';
    list.forEach(b=>{
      const a=ag[b.abr], on=!!(a&&a.n);
      const t=[b.nom+(b.hub?' — plateforme':'')];
      if(on){
        t.push(a.n+' commande(s)');
        t.push(fmt(a.rq)+' '+uniteCmd(p)+'(s) reçu(s)');
        if(pcb) t.push(fmt(a.rq*pcb)+' unités');
        if(a.last) t.push('dernière réception '+dateFR(a.last));
      } else t.push('aucune commande depuis janvier 2026');
      html+='<span class="bq'+(on?'':' off')+'" title="'+esc(t.join(' · '))+'"'
        +(on?' style="background:'+c.bg+';color:'+c.tx+';border-color:'+c.bord+'"':'')
        +'>'+esc(b.abr)+(on&&opts.qte?'<span class="q">'+fmt(a.rq)+'</span>':'')+'</span>';
    });
    html+='</div></div>';
  });
  return html+'</div>';
}

function dispoPanel(p){
  if(!BYSTORE) return '<div class="ordempty"><i class="ti ti-loader-2"></i> Répartition par boutique en cours de chargement…</div>';
  const ag=bqAgg(p);
  const nb=Object.keys(ag).filter(k=>ag[k].n).length;
  let note='<strong>'+nb+' boutique(s) sur '+BOUTIQUES.length+'</strong> ont commandé cette référence depuis janvier 2026. '
    +'Puce pleine = commande réellement constatée dans Inpulse, puce grise = jamais commandée. '
    +(nb?('Le chiffre est le nombre de '+uniteCmd(p)+'(s) reçu(s). '):'')
    +'Inpulse annonce par ailleurs une disponibilité théorique de <strong>'+esc(p.inpulse.dispo||'—')+'</strong>.';
  if(BQ_ORPHELINS.length) note+=' <em>Boutique(s) Inpulse sans abréviation dans le référentiel : '+esc(BQ_ORPHELINS.join(', '))+'.</em>';
  return bqMap(p,{qte:1,ag:ag})+'<div class="bqlegend"><i class="ti ti-info-circle"></i><div>'+note+'</div></div>';
}

/* ============================================================
   Trajet logistique — d'où part le packaging, par où il passe
   ============================================================ */
function trajetHTML(p){
  if(!BYSTORE) return '<div class="ordempty"><i class="ti ti-loader-2"></i> Trajet en cours de reconstitution…</div>';
  const ag=bqAgg(p);
  const actifs=BOUTIQUES.filter(b=>ag[b.abr]&&ag[b.abr].n);
  if(!actifs.length) return '<div class="ordempty"><i class="ti ti-info-circle"></i> '
    +'Aucune commande de cette référence depuis janvier 2026 : pas de trajet à reconstituer.</div>';
  const pcb=p.logistique.nombre_par_carton||null;
  const hubs=actifs.filter(b=>b.hub), shops=actifs.filter(b=>!b.hub);
  const tot=a=>actifs.reduce((s,b)=>s+(ag[b.abr].rq||0),0);
  const partHub=hubs.reduce((s,b)=>s+ag[b.abr].rq,0);
  const partShop=shops.reduce((s,b)=>s+ag[b.abr].rq,0);

  let flux='<div class="trajet">'
    +'<div class="tnode sup"><b>'+esc(p.inpulse.fournisseur||'Fournisseur')+'</b><span>fournisseur · '
      +esc(p.inpulse.unite_achat||'—')+'</span></div>';
  if(hubs.length){
    flux+='<i class="ti ti-arrow-narrow-right tarrow"></i>'
      +'<div class="tnode hub"><b>'+hubs.map(b=>esc(b.nom)).join(' + ')+'</b><span>plateforme · '
      +fmt(partHub)+' '+esc(uniteCmd(p))+'(s) reçu(s)</span></div>';
  }
  flux+='<i class="ti ti-arrow-narrow-right tarrow"></i>'
    +'<div class="tnode"><b>'+shops.length+' boutique'+(shops.length>1?'s':'')+'</b><span>'
    +(partShop?('commande'+(shops.length>1?'nt':'')+' en direct · '+fmt(partShop)+' '+esc(uniteCmd(p))+'(s)'):'servies depuis la plateforme')
    +'</span></div></div>';
  if(!hubs.length) flux+='<div class="bqlegend"><i class="ti ti-alert-triangle"></i><div>Aucune commande passée par Chalifert ou Lognes : '
    +'sur la période, cette référence est <strong>livrée directement en boutique</strong>.</div></div>';

  const ordre={}; ZONES_ORDRE.forEach((z,i)=>ordre[z]=i);
  const lignes=actifs.slice().sort((a,b)=>(ordre[a.zone]-ordre[b.zone])||(ag[b.abr].rq-ag[a.abr].rq));
  const body=lignes.map(b=>{
    const a=ag[b.abr], c=ZONES[b.zone];
    return '<tr><td><span class="bq" style="background:'+c.bg+';color:'+c.tx+';border-color:'+c.bord+'">'+esc(b.abr)+'</span>'
      +' <span class="tm">'+esc(b.nom)+(b.hub?' <em>(plateforme)</em>':'')+'</span></td>'
      +'<td class="tm">'+esc(b.zone)+'</td>'
      +'<td class="num">'+fmt(a.n)+'</td>'
      +'<td class="num">'+fmt(a.oq)+'</td>'
      +'<td class="num">'+fmt(a.rq)+'</td>'
      +'<td class="num">'+(pcb?fmt(a.rq*pcb):'—')+'</td>'
      +'<td class="tm">'+(a.last?dateFR(a.last):'—')+'</td></tr>';
  }).join('');
  return flux+'<div class="tw"><table class="logtab"><thead><tr>'
    +'<th>Boutique</th><th>Zone</th><th class="num">Cmd</th>'
    +'<th class="num">'+esc(uniteCmd(p))+'(s) cmd</th><th class="num">reçus</th><th class="num">unités</th>'
    +'<th>Dernière réception</th></tr></thead><tbody>'+body+'</tbody></table></div>'
    +'<div class="bqlegend"><i class="ti ti-info-circle"></i><div>Reconstitué à partir des commandes Inpulse '
    +'depuis janvier 2026 (brouillons exclus) : chaque commande porte la boutique qui l’a passée. '
    +'Les quantités reçues alimentent l’estimation de stock de la <strong>feuille Stock</strong>.</div></div>';
}

/* ============================================================
   Stock — inventaire saisi + réceptions Inpulse - consommation
   ============================================================ */
/* ============================================================
   Inventaires — lus dans Inpulse
   Chaque debut de mois, les boutiques saisissent leur stock dans
   Inpulse (inventaire « start »), packaging compris. L'app lit ces
   inventaires : plus rien a ressaisir ici. Une valeur saisie a la
   main dans la feuille Stock reste prioritaire — elle corrige.
   ============================================================ */
let INV=null, INVDATES={}, INVNAMES={}, INV_SID={}, INVINFO=null;
function indexInvStores(){
  INV_SID={};
  Object.keys(INVNAMES||{}).forEach(sid=>{
    const b=BQ_INP[String(INVNAMES[sid]||'').trim().toUpperCase()];
    if(b) INV_SID[sid]=b.abr;
  });
}
/* Deux chemins, dans cet ordre :
   1. /api/inventories — la function Netlify, qui met en cache cote serveur ;
   2. a defaut, lecture directe depuis le navigateur via /api/proxy.
   Le second sert tant que la function n'est pas deployee ; des qu'elle
   repond, elle reprend la main toute seule, sans rien changer ici. */
async function inventairesFonction(force){
  const r=await fetch('/api/inventories'+(force?'?reset=1&work=1':'?work=1'),{cache:'no-store'});
  const t=await r.text();
  let d; try{ d=JSON.parse(t); }catch(e){ throw new Error('function absente'); }
  if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
  let guard=0;
  while(d.progress && !d.progress.done && guard++<25){
    INV=d.data||INV; INVNAMES=d.storeNames||INVNAMES; INVDATES=d.dates||INVDATES; indexInvStores();
    setInvInfo('spin','Inventaires Inpulse : '+d.progress.reste+' boutique(s) restante(s)');
    render();
    const r2=await fetch('/api/inventories?work=1',{cache:'no-store'});
    d=await r2.json();
    if(!r2.ok) throw new Error(d.error||('HTTP '+r2.status));
  }
  return d;
}

/* Lecture directe. Environ quarante appels Inpulse, donc on garde le
   resultat le temps de la session : rouvrir la feuille Stock est immediat. */
const INVCACHE='infopack.inv';
function invCacheLire(){
  try{ const o=JSON.parse(sessionStorage.getItem(INVCACHE)||'null');
    return (o && Date.now()-o.t < 1800000) ? o.d : null; }catch(e){ return null; }
}
function invCacheEcrire(d){ try{ sessionStorage.setItem(INVCACHE,JSON.stringify({t:Date.now(),d})); }catch(e){} }

async function inventairesViaProxy(){
  const P=(e,m,b)=>fetch('/api/proxy',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({endpoint:e,method:m||'GET',body:b})})
    .then(async r=>{ const d=await r.json().catch(()=>null);
      if(!r.ok) throw new Error((d&&d.error)||('proxy '+r.status)); return d; });

  setInvInfo('spin','Inventaires Inpulse : boutiques\u2026');
  const sd=await P('/public/v2/stores?limit=100');
  const stores=(sd&&(sd.data||sd))||[];
  const names={}; stores.forEach(x=>{ if(x&&x.id) names[x.id]=x.name; });
  const storeIds=Object.keys(names);

  setInvInfo('spin','Inventaires Inpulse : r\u00e9f\u00e9rences\u2026');
  const packIds={};
  for(let p=0;p<30;p++){
    const d=await P('/public/v2/supplier-products?limit=100&skip='+(p*100));
    const arr=(d&&(d.data||d))||[];
    arr.forEach(x=>{ if(x&&x.category==='PACKAGING'&&x.id) packIds[x.id]=String(x.name||'').trim(); });
    if(arr.length<100) break;
  }

  setInvInfo('spin','Inventaires Inpulse : relev\u00e9s\u2026');
  const corps={startDate:STOCK.debut_historique+'T00:00:00.000Z', endDate:new Date().toISOString(), storeIds};
  let tous=[];
  for(let skip=0; skip<5000; skip+=100){
    const d=await P('/public/v2/inventories?skip='+skip+'&limit=100','POST',corps);
    const arr=(d&&d.data)||[]; tous=tous.concat(arr);
    if(arr.length<100) break;
  }
  const vus={}; tous=tous.filter(x=>vus[x.id]?false:(vus[x.id]=1));
  /* stockConvention « start » = l'inventaire de debut de mois, celui qui
     porte le packaging. On garde le dernier de chaque boutique. */
  const dernier={};
  tous.filter(x=>x.stockConvention==='start').forEach(x=>{
    const k=x.storeId;
    if(!dernier[k]||x.inventoryDate>dernier[k].inventoryDate) dernier[k]=x;
  });
  const liste=Object.values(dernier);

  const inv={}, dates={};
  let faits=0;
  async function detail(x){
    let ls=[], skip=0;
    for(let k=0;k<20;k++){
      /* ce point d'entree n'accepte pas de parametre limit : seul skip compte */
      const d=await P('/public/v2/inventories/'+x.id+(skip?'?skip='+skip:''));
      const arr=(d&&d.data)||[]; ls=ls.concat(arr);
      const tot=(d&&d.total)||0; skip+=100;
      if(ls.length>=tot||arr.length<100) break;
    }
    const jour=String(x.inventoryDate||'').slice(0,10);
    ls.forEach(l=>{
      const nom=packIds[l.supplierProductId]; if(!nom) return;
      const cond=l.supplierProductPackaging||{};
      const q=Number(l.quantity); if(!isFinite(q)) return;
      const cle=nom.toUpperCase();
      (inv[cle]||(inv[cle]={}))[x.storeId]={
        q:q*(Number(cond.quantity)||1), cartons:q, cond:cond.name||'', d:jour };
    });
    dates[x.storeId]=jour;
    setInvInfo('spin','Inventaires Inpulse : '+(++faits)+' / '+liste.length+' boutiques');
  }
  /* quatre de front : une vingtaine de boutiques, sans saturer le proxy */
  let i=0;
  await Promise.all(Array.from({length:Math.min(4,liste.length)}, async ()=>{
    while(i<liste.length){ const k=i++; try{ await detail(liste[k]); }catch(e){} }
  }));
  return {data:inv, dates, storeNames:names, via:'proxy'};
}

async function loadInventories(force){
  try{
    const d=await inventairesFonction(force);
    INV=d.data||{}; INVNAMES=d.storeNames||{}; INVDATES=d.dates||{}; indexInvStores();
    INVINFO={maj:d.full_built_at||d.updated_at, refs:Object.keys(INV).length};
    setInvInfo('ok', Object.keys(INV).length+' r\u00e9f\u00e9rence(s) relev\u00e9e(s) dans les inventaires Inpulse');
    render(); return;
  }catch(e){ /* la function n'est pas la : on lit nous-memes */ }
  try{
    const cache=force?null:invCacheLire();
    const d=cache||await inventairesViaProxy();
    if(!cache) invCacheEcrire(d);
    INV=d.data||{}; INVNAMES=d.storeNames||{}; INVDATES=d.dates||{}; indexInvStores();
    INVINFO={maj:null, refs:Object.keys(INV).length};
    setInvInfo('ok', Object.keys(INV).length+' r\u00e9f\u00e9rence(s) relev\u00e9e(s) \u2014 lecture directe Inpulse');
    render();
  }catch(e){
    INV=null; setInvInfo('err','Inventaires Inpulse indisponibles \u2014 '+e.message); render();
  }
}
function setInvInfo(s,t){
  const el=document.getElementById('invbadge'); if(!el) return;
  el.className='savebadge '+(s==='spin'?'wait':s); el.style.display='inline-flex';
  el.innerHTML='<i class="ti '+(s==='ok'?'ti-clipboard-check':s==='spin'?'ti-loader-2':'ti-clipboard-off')+'"></i>'+esc(t);
}
/* Releve Inpulse d'une reference pour une boutique, ou null. */
function invInpulse(p,abr){
  if(!INV) return null;
  const e=INV[String(p.identification.intitule_inpulse||'').trim().toUpperCase()];
  if(!e) return null;
  let best=null;
  Object.keys(e).forEach(sid=>{ if(INV_SID[sid]===abr){ const v=e[sid]; if(!best||(v.d||'')>(best.d||'')) best=v; } });
  return best ? {q:num(best.q), d:best.d||'', cartons:best.cartons, cond:best.cond, src:'inpulse'} : null;
}

const DAY=86400000;
/* memo : la liste recalcule le stock de chaque reference a chaque frappe */
const _JE={};
const joursEntre=(a,b)=>{ const k=a+'|'+b; let v=_JE[k];
  if(v===undefined){ v=Math.max(0,Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/DAY)); _JE[k]=v; }
  return v; };
const invManuel = (p,abr) => getPath(p,'stock.inv.'+abr)||{};
const invOf = (p,abr) => {
  const o=invManuel(p,abr);
  if(!isEmpty(o.q)) return {q:num(o.q), d:o.d||'', src:'tfb'};
  return invInpulse(p,abr) || {q:null, d:'', src:''};
};
const stockFour = p => { const o=getPath(p,'stock.fournisseur')||{}; return {q:num(o.q), d:o.d||''}; };

function unitesRecuesDepuis(ag,p,abr,depuis){
  const a=ag[abr]; if(!a) return 0;
  const pcb=p.logistique.nombre_par_carton||1;
  if(!depuis) return a.rq*pcb;
  const m0=depuis.slice(0,7);
  let s=0; Object.keys(a.mois).forEach(m=>{ if(m>m0) s+=a.mois[m].rq||0; });
  return s*pcb;
}
/* stock d'une boutique : null tant qu'aucun inventaire n'a été saisi */
function stockBq(p,abr,ag){
  ag=ag||bqAgg(p);
  const pcb=p.logistique.nombre_par_carton||1;
  const a=ag[abr];
  const recu=(a?a.rq:0)*pcb;
  const jours=Math.max(1,joursEntre(STOCK.debut_historique,todayISO()));
  const conso=recu/jours;                       // unités/jour, régime permanent
  const inv=invOf(p,abr);
  if(inv.q==null||!inv.d) return {estime:null, recu, conso, inv};
  const dj=joursEntre(inv.d,todayISO());
  return {estime:Math.max(0,Math.round(inv.q+unitesRecuesDepuis(ag,p,abr,inv.d)-conso*dj)),
          recu, conso, inv};
}
/* agrégat par zone + total, pour une référence */
function stockRef(p){
  const ag=bqAgg(p);
  const z={}; ZONES_ORDRE.forEach(k=>z[k]={estime:null,conso:0,recu:0,inv:0});
  let total=null, conso=0, recu=0, nInv=0, dernier='';
  BOUTIQUES.forEach(b=>{
    const s=stockBq(p,b.abr,ag);
    const zz=z[b.zone];
    zz.conso+=s.conso; zz.recu+=s.recu; conso+=s.conso; recu+=s.recu;
    if(s.estime!=null){
      zz.estime=(zz.estime||0)+s.estime; total=(total||0)+s.estime; zz.inv++; nInv++;
      if(s.inv.d>dernier) dernier=s.inv.d;
    }
  });
  const four=stockFour(p);
  const couv = (total!=null&&conso>0) ? Math.round(total/conso) : null;
  return {ag, z, total, conso, recu, nInv, dernier, four, couv};
}

function renderStock(){
  const q=SF.q, tb=document.getElementById('stb');
  let rows=DB.packagings.filter(p=>{
    if(horsService(p)) return false;
    if(q && (p.nom+' '+p.app.famille+' '+p.inpulse.fournisseur).toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  rows.forEach(p=>p._stk=stockRef(p));
  if(SF.zone) rows=rows.filter(p=>p._stk.z[SF.zone] && (p._stk.z[SF.zone].recu>0||p._stk.z[SF.zone].estime!=null));
  const val=p=>sSortK==='nom'?p.nom:sSortK==='four'?(p._stk.four.q==null?-1:p._stk.four.q)
    :sSortK==='labo'?(p._stk.z['Paris labo'].estime==null?-1:p._stk.z['Paris labo'].estime)
    :sSortK==='paris'?(p._stk.z['Paris boutique'].estime==null?-1:p._stk.z['Paris boutique'].estime)
    :sSortK==='bordeaux'?(p._stk.z['Bordeaux'].estime==null?-1:p._stk.z['Bordeaux'].estime)
    :sSortK==='lille'?(p._stk.z['Lille'].estime==null?-1:p._stk.z['Lille'].estime)
    :sSortK==='couv'?(p._stk.couv==null?-1:p._stk.couv)
    :sSortK==='inv'?(p._stk.dernier||'')
    :(p._stk.total==null?-1:p._stk.total);
  rows.sort((a,b)=>{const x=val(a),y=val(b);
    return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'fr'))*sSortD;});
  document.querySelectorAll('th[data-sk]').forEach(th=>{th.className=(th.classList.contains('num')?'num ':'')
    +(th.dataset.sk===sSortK?(sSortD>0?'asc':'desc'):'');});

  const cell=v=>v==null?'<td class="stk void">—</td>':'<td class="stk">'+fmt(v)+'</td>';
  if(!rows.length){ tb.innerHTML='<tr><td colspan="9"><div class="empty"><i class="ti ti-package-off"></i>'
    +'<p>Aucune référence.</p></div></td></tr>'; }
  else tb.innerHTML=rows.map(p=>{
    const s=p._stk, open=SEXP.has(p.id);
    const cv=s.couv==null?'<span class="cov na">—</span>'
      :'<span class="cov '+(s.couv<STOCK.alerte_jours?'low':s.couv<STOCK.confort_jours?'mid':'ok')+'">'+s.couv+' j</span>';
    return '<tr class="mainrow'+(open?' open':'')+'"><td class="tb namecell" data-sopen="'+p.id+'">'
      +'<span class="chev'+(open?' on':'')+'"><i class="ti ti-chevron-right"></i></span>'+esc(p.nom)
      +'<div class="ordline"><span class="ordsum">'+fmt(s.recu)+' unités reçues depuis janvier · '
      +(s.nInv?(s.nInv+' inventaire'+(s.nInv>1?'s':'')+' saisi'+(s.nInv>1?'s':'')):'aucun inventaire')+'</span></div></td>'
      +cell(s.four.q)+cell(s.z['Paris labo'].estime)+cell(s.z['Paris boutique'].estime)
      +cell(s.z['Bordeaux'].estime)+cell(s.z['Lille'].estime)
      +(s.total==null?'<td class="stk void">—</td>':'<td class="stk"><strong>'+fmt(s.total)+'</strong></td>')
      +'<td>'+cv+'</td><td class="tm">'+(s.dernier?dateFR(s.dernier):'—')+'</td></tr>'
      +(open?'<tr class="subrow"><td colspan="9">'+invTable(p,s)+'</td></tr>':'');
  }).join('');

  tb.querySelectorAll('[data-sopen]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.sopen;
    if(SEXP.has(id)) SEXP.delete(id); else SEXP.add(id);
    renderStock();
  });
  wireStock(tb);
  document.getElementById('scount').textContent=rows.length+' / '+DB.packagings.length+' références';
  renderStockMetrics(rows);
}

function renderStockMetrics(rows){
  const n=rows.length;
  const avecInv=rows.filter(p=>p._stk.nInv>0).length;
  const sousSeuil=rows.filter(p=>p._stk.couv!=null&&p._stk.couv<STOCK.alerte_jours).length;
  const four=rows.filter(p=>p._stk.four.q!=null).length;
  const totU=rows.reduce((s,p)=>s+(p._stk.total||0),0);
  const recu=rows.reduce((s,p)=>s+p._stk.recu,0);
  document.getElementById('stock-metrics').innerHTML=[
    ['Références suivies',n,'hors références arrêtées',''],
    ['Références inventoriées',avecInv+' / '+n,'relevé Inpulse ou saisie','accent'],
    ['Stock estimé',fmt(totU),'unités, toutes zones',''],
    ['Reçu depuis janvier',fmt(recu),'unités, source Inpulse',''],
    ['Stock fournisseur',four+' / '+n,'entrepôt renseigné',''],
    ['Sous '+STOCK.alerte_jours+' jours',sousSeuil,'couverture estimée','']
  ].map(([l,v,s,c])=>'<div class="metric '+c+'"><div class="ml">'+l+'</div><div class="mv">'+v+
     '</div><div class="msub">'+s+'</div></div>').join('');
}

function invTable(p,s){
  const pcb=p.logistique.nombre_par_carton||1;
  const f=s.four;
  let html='<div class="invhead"><span class="lb">Entrepôt fournisseur — '+esc(p.inpulse.fournisseur||'—')+'</span>'
    +'<input class="inv ed-inv" data-id="'+p.id+'" data-p="stock.fournisseur.q" type="text" inputmode="decimal" '
      +'value="'+(f.q==null?'':esc(String(f.q).replace('.',',')))+'" placeholder="unités">'
    +'<input class="invd ed-inv" data-id="'+p.id+'" data-p="stock.fournisseur.d" type="date" value="'+esc(f.d)+'">'
    +'<span class="sm">stock que le fournisseur garde pour nous, saisi à la main</span></div>';
  const ordre={}; ZONES_ORDRE.forEach((z,i)=>ordre[z]=i);
  const list=BOUTIQUES.slice().sort((a,b)=>(ordre[a.zone]-ordre[b.zone])||a.nom.localeCompare(b.nom,'fr'));
  html+='<div class="tw"><table class="invtab"><thead><tr><th>Boutique</th><th>Zone</th>'
    +'<th class="num">Reçu 2026</th><th class="num">Conso./j</th>'
    +'<th>Inventaire (unités)</th><th>Date d’inventaire</th><th>Source</th><th class="num">Stock estimé</th>'
    +'<th>Dernière réception</th></tr></thead><tbody>';
  list.forEach(b=>{
    const st=stockBq(p,b.abr,s.ag), a=s.ag[b.abr], c=ZONES[b.zone];
    html+='<tr><td><span class="bq" style="background:'+c.bg+';color:'+c.tx+';border-color:'+c.bord+'">'+esc(b.abr)+'</span>'
      +' <span class="tm">'+esc(b.nom)+(b.hub?' <em>(plateforme)</em>':'')+'</span></td>'
      +'<td class="tm">'+esc(b.zone)+'</td>'
      +'<td class="num">'+fmt(st.recu)+'</td>'
      +'<td class="num">'+(st.conso?fmt(Math.round(st.conso*10)/10):'—')+'</td>'
      +(function(){
         const man=invManuel(p,b.abr), auto=invInpulse(p,b.abr);
         const ph = auto ? fmt(auto.q) : '—';
         return '<td><input class="inv ed-inv" data-id="'+p.id+'" data-p="stock.inv.'+b.abr+'.q" type="text" inputmode="decimal" '
           +'value="'+(isEmpty(man.q)?'':esc(String(man.q).replace('.',',')))+'" placeholder="'+esc(ph)+'"></td>'
           +'<td><input class="invd ed-inv" data-id="'+p.id+'" data-p="stock.inv.'+b.abr+'.d" type="date" value="'
           +esc(man.d||'')+'"'+(auto&&!man.d?' title="relevé Inpulse du '+esc(dateFR(auto.d))+'"':'')+'></td>'
           +'<td>'+(st.inv.src==='tfb'?SRC_TFB:st.inv.src==='inpulse'
               ?(SRC_INP+(auto&&auto.cartons!=null?' <span class="tm" style="font-size:11px">'+fmt(auto.cartons)+(auto.cond?' × '+esc(auto.cond):'')+'</span>':''))
               :'<span class="tm">—</span>')+'</td>';
       })()
      +'<td class="num">'+(st.estime==null?'<span class="tm">—</span>':'<strong>'+fmt(st.estime)+'</strong>')+'</td>'
      +'<td class="tm">'+(a&&a.last?dateFR(a.last):'—')+'</td></tr>';
  });
  html+='</tbody></table></div><div class="bqlegend"><i class="ti ti-info-circle"></i><div>'
    +'Les inventaires sont <strong>lus dans Inpulse</strong> (inventaire de début de mois, quantités converties en unités). '
    +'Une valeur saisie ici corrige le relevé Inpulse pour cette boutique ; videz-la pour revenir au relevé. '
    +'Unités = '+(p.logistique.nombre_par_carton?(uniteCmd(p)+'s × '+pcb+' (PCB Inpulse)'):'conditionnement inconnu, 1 unité par '+uniteCmd(p))+'. '
    +'Consommation par jour = reçu depuis le '+dateFR(STOCK.debut_historique)+' ÷ nombre de jours. '
    +'Stock estimé = inventaire + réceptions postérieures − consommation × jours écoulés, jamais négatif. '
    +'Les réceptions sont comptées au mois, l’estimation est donc juste à un mois près sur le mois de l’inventaire.'
    +'</div></div>';
  return html;
}

function wireStock(root){
  root.querySelectorAll('.ed-inv').forEach(el=>{
    el.onchange=()=>{
      const id=el.dataset.id, path=el.dataset.p;
      let v;
      if(el.type==='date') v=el.value||null;
      else { v = el.value.trim()===''?null:num(el.value);
             if(el.value.trim()!==''&&v===null){ el.classList.add('bad'); return; } }
      el.classList.remove('bad');
      saveField(id,path,v);
      /* une quantité sans date : on date du jour, sinon rien n'est calculable */
      if(el.type!=='date' && v!=null){
        const dpath=path.replace(/\.q$/,'.d');
        const rec=DB.packagings.find(x=>x.id===id);
        if(!getPath(rec,dpath)) saveField(id,dpath,todayISO());
      }
      renderStock();
    };
  });
}

function exportStock(){
  const rows=DB.packagings.filter(p=>!horsService(p)).map(p=>{
    const s=stockRef(p), o={
      'Référence':p.nom, 'Famille':p.app.famille, 'Fournisseur':p.inpulse.fournisseur,
      'Unités par carton':p.logistique.nombre_par_carton||'',
      'Stock entrepôt fournisseur':s.four.q==null?'':s.four.q,
      'Date stock fournisseur':s.four.d||''
    };
    BOUTIQUES.forEach(b=>{
      const st=stockBq(p,b.abr,s.ag);
      o[b.abr+' reçu 2026']=st.recu;
      o[b.abr+' inventaire']=st.inv.q==null?'':st.inv.q;
      o[b.abr+' date inv.']=st.inv.d||'';
      o[b.abr+' stock estimé']=st.estime==null?'':st.estime;
    });
    o['Total estimé']=s.total==null?'':s.total;
    o['Couverture (jours)']=s.couv==null?'':s.couv;
    o['Dernier inventaire']=s.dernier||'';
    return o;
  });
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Stock');
  XLSX.writeFile(wb,'tfb-info-pack-stock-'+new Date().toISOString().slice(0,10)+'.xlsx');
}

/* ---- navigation entre les deux feuilles ---- */
function setPage(k){
  PAGE=k;
  document.getElementById('page-pack').style.display = k==='pack'?'':'none';
  document.getElementById('page-stock').style.display= k==='stock'?'':'none';
  document.querySelectorAll('.pagenav [data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===k));
  if(k==='stock') renderStock();
}

/* ============================================================
   Export
   ============================================================ */
function exportXls(){
  const rows=ROWS.map(p=>{
    const o={Packaging:p.nom};
    FIELDS.forEach(f=>{
      const uu=typeof f.u==='function'?'':(f.u?' ('+f.u+')':'');
      const col=f.lb+uu;
      if(!visible(f,p)){ o[col]='n/a'; return; }
      let v=valOf(p,f);
      if(Array.isArray(v)) v=v.join(', ');
      else if(v===true) v='oui'; else if(v===false) v='non';
      o[col]=v==null?'':v;
      if(f.unitSel) o['Unité de la quantité']=uniteQte(p);
    });
    o['Hors service']=horsService(p)?'oui':'non';
    o['Fiche %']=p._comp;
    o['Saisi dans l’app']=OVR.records[p.id]?'oui':'non';
    return o;
  });
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Info Pack');
  XLSX.writeFile(wb,'tfb-info-pack-'+new Date().toISOString().slice(0,10)+'.xlsx');
}

load();
