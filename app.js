/* ============================================================
   TFB — Info Pack · base packaging
   Structure : fiche Notion (5 onglets), champ pour champ.
   Liste     : Inpulse › Ingrédients fournisseurs › catégorie PACKAGING
   Trois couches, dans cet ordre de priorité :
     1. data/packaging.json  — socle versionné dans le repo
     2. /api/store           — saisies TFB (Netlify Blobs), se superposent
     3. /api/packaging|proxy — Inpulse, écrase ses propres champs
   Un champ badgé INPULSE n'est jamais saisissable : il serait écrasé.
   ============================================================ */

const TABS = [
  {k:'general', t:'Informations générales',        s:'Général',     i:'ti-pencil'},
  {k:'design',  t:'Design & gabarit',              s:'Design',      i:'ti-palette'},
  {k:'logi',    t:'Conditionnement & logistique',  s:'Logistique',  i:'ti-package'},
  {k:'usage',   t:'Usage TFB',                     s:'Usage',       i:'ti-croissant'},
  {k:'photos',  t:'Photos',                        s:'Photos',      i:'ti-camera'}
];

let DB=null, OVR={records:{}}, ROWS=[], view='list', sortK='nom', sortD=1, activeTab='general', current=null;
let storeOk=false;
let ORD=null, ORDINFO=null;          // historique de commandes par packaging
const EXP=new Set();                 // lignes depliees
const FREE={};   // champs "Autre…" ouverts en saisie libre
const F={q:'',fam:'',four:'',marq:'',comp:''};

const eur  = n => (n==null||isNaN(n))?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const eur4 = n => (n==null||isNaN(n))?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:4})+' €';
const esc  = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isEmpty = v => v===''||v==null||(Array.isArray(v)&&!v.length);
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
const R = ref => (DB && DB.referentiels[ref]) || [];
const FIELDS = [
  // ---------- 1. Informations générales ----------
  {tab:'general', grp:'Identification', path:'identification.intitule_inpulse', lb:'Intitulé Inpulse', src:'inp', wide:1},
  {tab:'general', grp:'Identification', path:'identification.sku_fournisseur',  lb:'SKU fournisseur',  src:'inp'},
  {tab:'general', grp:'Identification', path:'inpulse.fournisseur',             lb:'Fournisseur',      src:'inp'},
  {tab:'general', grp:'Identification', path:'app.famille',   lb:'Famille',  src:'tfb', type:'select', opt:()=>R('famille')},
  {tab:'general', grp:'Identification', path:'app.marquage',  lb:'Marquage', src:'tfb', type:'select', opt:()=>R('marquage')},
  {tab:'general', grp:'Identification', path:'app.statut',    lb:'Statut',   src:'tfb', type:'select', opt:()=>R('statut')},

  {tab:'general', grp:'Achat', path:'inpulse.prix_ht',   lb:'Prix HT',        src:'inp', fmt:eur},
  {tab:'general', grp:'Achat', path:'inpulse.unite_achat', lb:'Unité d’achat', src:'inp'},
  {tab:'general', grp:'Achat', path:'logistique.prix_unitaire_ht', lb:'Prix unitaire HT', src:'inp', fmt:eur4},
  {tab:'general', grp:'Achat', path:'inpulse.dispo',     lb:'Disponibilité boutiques', src:'inp'},

  {tab:'general', grp:'Dimensions', path:'dimensions.longueur_cm',           lb:'Longueur',              src:'tfb', type:'num', u:'cm', step:'0.1'},
  {tab:'general', grp:'Dimensions', path:'dimensions.largeur_cm',            lb:'Largeur',               src:'tfb', type:'num', u:'cm', step:'0.1'},
  {tab:'general', grp:'Dimensions', path:'dimensions.profondeur_soufflet_cm',lb:'Profondeur (soufflet)', src:'tfb', type:'num', u:'cm', step:'0.1'},
  {tab:'general', grp:'Dimensions', path:'dimensions.hauteur_cm',            lb:'Hauteur',               src:'tfb', type:'num', u:'cm', step:'0.1'},
  {tab:'general', grp:'Dimensions', path:'dimensions.dimensions_a_plat_cm',  lb:'Dimensions à plat (L × H)', src:'tfb', type:'text', u:'cm'},
  {tab:'general', grp:'Dimensions', path:'dimensions.tolerance_mm',          lb:'Tolérance dimensionnelle',  src:'tfb', type:'num', u:'mm', step:'0.5'},

  {tab:'general', grp:'Matière', path:'matiere.matiere',             lb:'Matière',            src:'tfb', type:'select', opt:()=>R('type_support'), free:1},
  {tab:'general', grp:'Matière', path:'matiere.grammage_g_m2',       lb:'Grammage',           src:'tfb', type:'num', u:'g/m²'},
  {tab:'general', grp:'Matière', path:'matiere.epaisseur_um',        lb:'Épaisseur',          src:'tfb', type:'num', u:'µm'},
  {tab:'general', grp:'Matière', path:'matiere.poids_unitaire_g',    lb:'Poids unitaire',     src:'tfb', type:'num', u:'g', step:'0.1'},
  {tab:'general', grp:'Matière', path:'matiere.contact_alimentaire', lb:'Contact alimentaire',src:'tfb', type:'bool'},

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

  {tab:'logi', grp:'Déploiement', path:'deploiement.points_de_vente',       lb:'Points de vente concernés', src:'tfb', type:'multi', opt:()=>R('points_de_vente'), wide:1},
  {tab:'logi', grp:'Déploiement', path:'deploiement.date_mise_en_service',  lb:'Date de mise en service',   src:'tfb', type:'date'},
  {tab:'logi', grp:'Déploiement', path:'deploiement.points_de_vigilance',   lb:'Points de vigilance',       src:'tfb', type:'area', wide:1},

  // ---------- 4. Usage TFB ----------
  {tab:'usage', grp:'Utilisation', path:'usage_tfb.recettes_concernees',    lb:'Recettes concernées',   src:'tfb', type:'tags', wide:1, dl:'recettes'},
  {tab:'usage', grp:'Utilisation', path:'usage_tfb.usage',                  lb:'Usage',                 src:'tfb', type:'area', wide:1},
  {tab:'usage', grp:'Utilisation', path:'usage_tfb.quantite_par_emballage', lb:'Quantité par emballage', src:'tfb', type:'num', u:'pièces'},

  // ---------- 5. Photos ----------
  {tab:'photos', grp:'Galerie', path:'photos.0', lb:'Produit nu',                  src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.1', lb:'Produit garni',               src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.2', lb:'Mise en situation boutique',  src:'tfb', type:'photo'},
  {tab:'photos', grp:'Galerie', path:'photos.3', lb:'Gabarit à plat',              src:'tfb', type:'photo'}
];
const TFB_FIELDS = FIELDS.filter(f=>f.src==='tfb');
const byTab = k => FIELDS.filter(f=>f.tab===k);

/* ---- complétude : part des champs TFB renseignés ---- */
const comp = r => Math.round(100*TFB_FIELDS.filter(f=>!isEmpty(getPath(r,f.path))).length/TFB_FIELDS.length);
const tabComp = (r,k) => { const a=byTab(k).filter(f=>f.src==='tfb');
  return {n:a.filter(f=>!isEmpty(getPath(r,f.path))).length, t:a.length}; };

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
  buildFilters(); render(); syncInpulse(); loadOrders();
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
      if(d.data){ ORD=d.data; render(); }
      r = await fetch('/api/orders?work=1',{cache:'no-store'});
      d = await r.json();
      if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    }
    ORD = d.data || {};
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
      p.inpulse.live=true;
      if(m.price!=null) p.inpulse.prix_ht=Number(m.price);
      if(m.supplier) p.inpulse.fournisseur=m.supplier;
      if(m.subCategory) p.inpulse.sous_categorie=m.subCategory;
      p.inpulse.unite_achat=m.packaging.name;
      p.inpulse.actif=m.active;
      p.identification.sku_fournisseur=(m.sku&&m.sku!=='?')?m.sku:'';
      const q=m.packaging.quantity;
      p.logistique.nombre_par_carton=(q&&q>1)?q:null;
      p.logistique.unite_commande=uniteCommande(m.packaging.name);
      p.logistique.prix_unitaire_ht=(q&&q>1&&m.price)?m.price/q:null;
    });
    const known={}; DB.packagings.forEach(p=>known[p.identification.intitule_inpulse.trim().toUpperCase()]=1);
    const nouvelles=list.filter(x=>!known[String(x.name).trim().toUpperCase()]).map(x=>x.name);
    let note='prix, SKU et conditionnements à jour — '+via;
    if(nouvelles.length) note+=' · '+nouvelles.length+' nouvelle(s) réf. dans Inpulse : '+nouvelles.join(', ');
    if(orphans.length)   note+=' · non retrouvée(s) : '+orphans.join(', ');
    setConn((hit===DB.packagings.length&&!nouvelles.length)?'ok':'warn',
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
function setConn(s,t,d){ document.getElementById('dot').className='dot '+s;
  document.getElementById('conn-t').innerHTML=t; document.getElementById('conn-d').textContent=d||''; }
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
  document.querySelectorAll('#d-body .grp').forEach(el=>{
    const a=byTab(activeTab).filter(f=>f.src==='tfb'&&f.grp===el.dataset.grp);
    const sp=el.querySelector('.grp-c'); if(!sp||!a.length) return;
    const n=a.filter(f=>!isEmpty(getPath(r,f.path))).length;
    sp.textContent=n+'/'+a.length;
    sp.className='grp-c'+(n===0?' zero':n===a.length?' full':'');
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
   Filtres, liste, grille
   ============================================================ */
function buildFilters(){
  const fam=document.getElementById('f-fam');
  fam.innerHTML='<button class="fgb active" data-fam="">Toutes familles</button>'+
    R('famille').map(f=>'<button class="fgb" data-fam="'+esc(f)+'">'+esc(f)+'</button>').join('');
  fam.onclick=e=>{const b=e.target.closest('[data-fam]');if(!b)return;
    F.fam=b.dataset.fam;[...fam.children].forEach(c=>c.classList.toggle('active',c===b));render();};
  const four=document.getElementById('f-four');
  [...new Set(DB.packagings.map(p=>p.inpulse.fournisseur))].sort()
    .forEach(f=>four.insertAdjacentHTML('beforeend','<option>'+esc(f)+'</option>'));
  document.getElementById('q').oninput=e=>{F.q=e.target.value.toLowerCase();render();};
  four.onchange=e=>{F.four=e.target.value;render();};
  document.getElementById('f-marq').onchange=e=>{F.marq=e.target.value;render();};
  document.getElementById('f-comp').onchange=e=>{F.comp=e.target.value;render();};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;
    document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));render();});
  document.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{
    if(sortK===th.dataset.k)sortD=-sortD;else{sortK=th.dataset.k;sortD=1;}render();});
  document.getElementById('btn-sync').onclick=()=>{loadOverrides().then(syncInpulse).then(()=>loadOrders(true));};
  document.getElementById('btn-xls').onclick=exportXls;
  document.getElementById('d-close').onclick=closeDrawer;
  document.getElementById('ov').onclick=closeDrawer;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName||''))) closeDrawer();});
}

function filtered(){
  return DB.packagings.filter(p=>{
    if(F.fam&&p.app.famille!==F.fam)return false;
    if(F.four&&p.inpulse.fournisseur!==F.four)return false;
    if(F.marq&&p.app.marquage!==F.marq)return false;
    if(F.comp==='lt50'&&p._comp>=50)return false;
    if(F.comp==='lt80'&&p._comp>=80)return false;
    if(F.comp==='eq100'&&p._comp<100)return false;
    if(F.comp==='saisies'&&!OVR.records[p.id])return false;
    if(F.q){const h=(p.nom+' '+p.app.famille+' '+p.inpulse.fournisseur+' '+p.app.marquage+' '+
      (p.usage_tfb.usage||'')+' '+(p.usage_tfb.recettes_concernees||[]).join(' ')).toLowerCase();
      if(h.indexOf(F.q)<0)return false;}
    return true;
  });
}

function render(){
  DB.packagings.forEach(p=>p._comp=comp(p));
  ROWS=filtered();
  const val=r=>sortK==='prix'?(r.inpulse.prix_ht||0):sortK==='comp'?r._comp
    :sortK==='dispo'?parseInt((r.inpulse.dispo||'0/0').split('/')[0],10)
    :sortK==='famille'?r.app.famille:sortK==='marquage'?r.app.marquage
    :sortK==='four'?r.inpulse.fournisseur:String(r[sortK]||'');
  ROWS.sort((a,b)=>{const x=val(a),y=val(b);
    return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'fr'))*sortD;});
  document.querySelectorAll('th[data-k]').forEach(th=>{th.className=th.dataset.k===sortK?(sortD>0?'asc':'desc'):'';});
  renderList(); renderGrid();
  document.getElementById('view-list').style.display=view==='list'?'':'none';
  document.getElementById('view-grid').style.display=view==='grid'?'grid':'none';
  document.getElementById('count').textContent=ROWS.length+' / '+DB.packagings.length+' références';
}

const pillMarq=m=>'<span class="pill '+(m==='TFB'?'p-tfb':m==='Co-branding'?'p-cob':'p-neutre')+'">'+esc(m)+'</span>';
const bar=v=>'<div class="bw"><div class="bb"><div class="bf" style="width:'+v+'%;background:'+
  (v<25?'#dc2626':v<60?'#d97706':'#16a34a')+'"></div></div><span class="bp">'+v+'%</span></div>';

function renderList(){
  const tb=document.getElementById('tb');
  if(!ROWS.length){tb.innerHTML='<tr><td colspan="8"><div class="empty"><i class="ti ti-package-off"></i>'+
    '<p>Aucun packaging ne correspond aux filtres.</p></div></td></tr>';return;}
  tb.innerHTML=ROWS.map(p=>{
    const ok=(p.inpulse.dispo||'').split('/')[0]!=='0';
    const open=EXP.has(p.id);
    const o=ordFor(p);
    const resume = !o ? '' : o.vide ? '<span class="ordnil">aucune commande</span>'
      : '<span class="ordsum">'+o.tot.n+' cmd · '+fmt(o.tot.oq)+' → '+fmt(o.tot.rq)+' cartons</span>';
    return '<tr class="mainrow'+(open?' open':'')+'" data-id="'+p.id+'">'
      + '<td class="tb namecell" data-toggle="'+p.id+'">'
        + '<span class="chev'+(open?' on':'')+'"><i class="ti ti-chevron-right"></i></span>'
        + esc(p.nom) + (OVR.records[p.id]?' <i class="ti ti-pencil edited" title="fiche saisie"></i>':'')
        + '<div class="ordline">'+resume+'</div></td>'
      + '<td><button class="btn btn-sm btn-fiche" data-open="'+p.id+'"><i class="ti ti-layout-sidebar-right-expand"></i>Ouvrir la fiche</button></td>'
      + '<td class="tm">'+esc(p.app.famille)+'</td><td>'+pillMarq(p.app.marquage)+'</td>'
      + '<td class="tm">'+esc(p.inpulse.fournisseur)+'</td>'
      + '<td class="num">'+eur(p.inpulse.prix_ht)+'</td>'
      + '<td><span class="pill '+(ok?'p-ok':'p-warn')+'">'+esc(p.inpulse.dispo)+'</span></td>'
      + '<td>'+bar(p._comp)+'</td></tr>'
      + (open?'<tr class="subrow"><td colspan="8">'+ordTable(p)+'</td></tr>':'');
  }).join('');
  tb.querySelectorAll('[data-toggle]').forEach(el=>el.onclick=e=>{
    e.stopPropagation(); const id=el.dataset.toggle;
    if(EXP.has(id)) EXP.delete(id); else EXP.add(id);
    renderList();
  });
  tb.querySelectorAll('[data-open]').forEach(el=>el.onclick=e=>{
    e.stopPropagation(); openDrawer(el.dataset.open);
  });
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
const SRC_INP='<span class="src src-inp" title="piloté par Inpulse, non modifiable ici">Inpulse</span>';
const SRC_TFB='<span class="src src-tfb" title="saisi par TFB">TFB</span>';

function control(r,f){
  const v=getPath(r,f.path), id=r.id, P=f.path;
  const a='data-id="'+id+'" data-path="'+P+'"';
  if(f.src==='inp'){
    const txt=f.fmt?f.fmt(v):(v===true?'oui':v===false?'non':v);
    return isEmpty(txt)||txt==='—'
      ? '<div class="fv void">— '+SRC_INP+'</div>'
      : '<div class="fv">'+esc(txt)+(f.u?' <span class="u">'+esc(f.u)+'</span>':'')+' '+SRC_INP+'</div>';
  }
  switch(f.type){
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
      return '<div class="multi">'+(f.opt?f.opt():[]).map(o=>
        '<label class="chk'+(sel.indexOf(o)>=0?' on':'')+'"><input type="checkbox" class="ed-multi" '+a+
        ' value="'+esc(o)+'"'+(sel.indexOf(o)>=0?' checked':'')+'>'+esc(o)+'</label>').join('')+'</div>';
    }
    case 'tags': {
      const t=Array.isArray(v)?v:[];
      const ph=f.dl?'chercher une recette Inpulse, puis Entrée':'ajouter puis Entrée';
      return '<div class="tags">'+t.map((x,i)=>'<span class="chip">'+esc(x)+
          '<button class="chip-x ed-tagdel" '+a+' data-i="'+i+'" title="retirer">×</button></span>').join('')
        +'<input class="ed-tagadd taginput"'+(f.dl?' list="dl-'+f.dl+'"':'')+' '+a+' placeholder="'+ph+'">'
        +(f.dl?'<datalist id="dl-'+f.dl+'"></datalist>':'')+'</div>';
    }
    case 'link': case 'photo': {
      const isImg=/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(v||'');
      const open = v ? '<a class="lk-open" href="'+esc(v)+'" target="_blank" rel="noopener" title="ouvrir dans un onglet">'
                       +'<i class="ti ti-external-link"></i>Ouvrir</a>' : '';
      const row = '<div class="lk"><i class="ti '+(f.type==='photo'?'ti-photo':'ti-paperclip')+' lk-ic"></i>'
        +'<input class="ed" type="url" '+a+' value="'+esc(v||'')+'" placeholder="'
        +(f.type==='photo'?'Lien de l’image (Drive, Dropbox…)':'Lien du fichier (Drive, Dropbox…)')+'">'+open+'</div>';
      if(f.type!=='photo') return row;
      const box = (v&&isImg)
        ? '<div class="ph-box"><img src="'+esc(v)+'" alt=""></div>'
        : '<div class="ph-box vide"><i class="ti ti-photo-plus"></i>'+(v?'aperçu indisponible':'aucune photo')+'</div>';
      return box+row;
    }
    default: {
      const inp='<input class="ed" type="text" '+a+' value="'+esc(v||'')+'" placeholder="à compléter">';
      return f.u ? '<div class="ctl">'+inp+'<span class="u">'+esc(f.u)+'</span></div>' : inp;
    }
  }
}

function fieldHTML(r,f){
  const filled=!isEmpty(getPath(r,f.path));
  const ovr=OVR.records[r.id]&&OVR.records[r.id][f.path]!==undefined;
  const tall = f.type==='area'||f.type==='tags'||f.type==='multi'||f.type==='photo';
  return '<div class="f'+(f.wide?' wide':'')+(tall?' top':'')+(f.src==='tfb'?' ed-f':'')+(filled?'':' vide')+'">'
    +'<div class="fl">'+esc(f.lb)
    +(ovr?'<i class="ti ti-point-filled dotsaved" title="saisi dans l’app"></i>':'')+'</div>'
    +control(r,f)+'</div>';
}

function tabBody(r,k){
  const fs=byTab(k); const groups=[];
  fs.forEach(f=>{ const g=groups.find(x=>x.g===f.grp); (g?g.f:(groups.push({g:f.grp,f:[]}),groups[groups.length-1].f)).push(f); });
  let html='';
  groups.forEach(g=>{
    const a=g.f.filter(f=>f.src==='tfb');
    const n=a.filter(f=>!isEmpty(getPath(r,f.path))).length, tot=a.length;
    const cnt = tot ? '<span class="grp-c'+(n===0?' zero':n===tot?' full':'')+'">'+n+'/'+tot+'</span>'
                    : '<span class="grp-c auto">Inpulse</span>';
    html+='<section class="grp"'+(tot?'':' data-auto="1"')+' data-grp="'+esc(g.g)+'">'
      +'<div class="grp-h"><span class="grp-n">'+esc(g.g)+'</span>'+cnt+'</div>'
      +'<div class="grp-b"><div class="fields'+(k==='photos'?' photofields':'')+'">'
      +g.f.map(f=>fieldHTML(r,f)).join('')+'</div></div></section>'; });
  return html;
}

/* ---- recettes Inpulse : suggestions du champ « Recettes concernées » ---- */
let RECIPES=null, recipesJob=null;
const recipeName = x => (x && (x.name || x.label || x.title || x.recipeName)) || '';
function loadRecipes(){
  if(RECIPES) return Promise.resolve(RECIPES);
  if(recipesJob) return recipesJob;
  recipesJob = (async()=>{
    const out=[], PAGE=100;   // l'API Inpulse plafonne a 100 par page
    try{
      for(let p=0;p<20;p++){
        const r=await fetch('/api/proxy',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({endpoint:'/public/v2/recipes?limit='+PAGE+'&skip='+(p*PAGE),method:'GET'})});
        if(!r.ok) break;
        const d=await r.json();
        const arr=Array.isArray(d)?d:(d&&(d.data||d.items||d.results||d.recipes))||[];
        if(!Array.isArray(arr)||!arr.length) break;
        arr.forEach(x=>{ const n=recipeName(x); if(n) out.push(String(n).trim()); });
        if(arr.length<PAGE) break;
      }
    }catch(e){ /* Inpulse injoignable : on reste en saisie libre */ }
    RECIPES=[...new Set(out.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    return RECIPES;
  })();
  return recipesJob;
}
async function fillSuggestions(root){
  const dl=root.querySelector('#dl-recettes'); if(!dl) return;
  const list=await loadRecipes();
  if(!document.body.contains(dl)) return;
  dl.innerHTML=list.map(o=>'<option value="'+esc(o)+'"></option>').join('');
  const inp=root.querySelector('.ed-tagadd[list="dl-recettes"]');
  if(inp) inp.placeholder = list.length
    ? 'chercher parmi '+list.length+' recettes Inpulse, puis Entrée'
    : 'recettes Inpulse indisponibles — saisie libre, puis Entrée';
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
    return '<button type="button" class="tab'+(t.k===activeTab?' active':'')+'" data-tab="'+t.k+'"'
      +' title="'+esc(t.t)+'"><i class="ti '+t.i+'"></i><span class="tl">'+esc(t.s)+'</span>'
      +'<span class="tcount'+(c.n===0?' zero':c.n===c.t?' full':'')+'">'+c.n+'/'+c.t+'</span></button>';
  }).join('');
  document.getElementById('d-tabs').querySelectorAll('[data-tab]')
    .forEach(el=>el.onclick=()=>{activeTab=el.dataset.tab;openDrawer(id);});
  const b=document.getElementById('d-body');
  b.innerHTML=tabBody(r,activeTab);
  b.scrollTop=0;
  wire(b);
  fillSuggestions(b);
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
      } else if(el.type==='number'){
        v = el.value===''?null:Number(el.value);
        if(v!==null&&isNaN(v)) return;
      } else {
        v = el.value.trim()||null;
      }
      const cur=getPath(DB.packagings.find(p=>p.id===id),path);
      if((cur==null?null:cur)===v) return;
      saveField(id,path,v);
      const f=FIELDS.find(x=>x.path===path);
      if(f&&(f.type==='photo'||f.type==='link'||f.type==='select')) openDrawer(id);
    };
    el.addEventListener('change',commit);
    if(el.tagName==='TEXTAREA'||el.type==='text'||el.type==='url') el.addEventListener('blur',commit);
    el.addEventListener('keydown',e=>{ if(e.key==='Enter'&&el.tagName!=='TEXTAREA'){ e.preventDefault(); el.blur(); }});
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

/* ============================================================
   Export
   ============================================================ */
function exportXls(){
  const rows=ROWS.map(p=>{
    const o={Packaging:p.nom};
    FIELDS.forEach(f=>{
      let v=getPath(p,f.path);
      if(Array.isArray(v)) v=v.join(', ');
      else if(v===true) v='oui'; else if(v===false) v='non';
      o[f.lb+(f.u?' ('+f.u+')':'')]=v==null?'':v;
    });
    o['Fiche %']=p._comp;
    o['Saisi dans l’app']=OVR.records[p.id]?'oui':'non';
    return o;
  });
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Info Pack');
  XLSX.writeFile(wb,'tfb-info-pack-'+new Date().toISOString().slice(0,10)+'.xlsx');
}

load();
