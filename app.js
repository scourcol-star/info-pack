/* ============================================================
   TFB — Info Pack · base packaging
   Structure : fiche Notion (5 onglets), champ pour champ.
   Liste     : Inpulse › Ingrédients fournisseurs › catégorie PACKAGING
   Live      : /api/proxy (function Netlify) → /public/v2/supplier-products
   Clé de rapprochement : identification.intitule_inpulse == supplier-product.name
   ============================================================ */

const TABS = [
  {k:'general', t:'Informations générales',        i:'ti-pencil'},
  {k:'design',  t:'Design & gabarit',              i:'ti-palette'},
  {k:'logi',    t:'Conditionnement & logistique',  i:'ti-package'},
  {k:'usage',   t:'Usage TFB',                     i:'ti-croissant'},
  {k:'photos',  t:'Photos',                        i:'ti-camera'}
];

let DB=null, ROWS=[], view='list', sortK='nom', sortD=1, activeTab='general', current=null;
const F={q:'',fam:'',four:'',marq:'',comp:''};

const eur = n => (n==null||isNaN(n))?'—':n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isEmpty = v => v===''||v==null||v===false||(Array.isArray(v)&&!v.length);

/* ---- complétude : uniquement les champs que TFB doit saisir ---- */
const FILLABLE = [
  r=>r.identification.sku_fournisseur,
  r=>r.dimensions.longueur_cm, r=>r.dimensions.largeur_cm, r=>r.dimensions.hauteur_cm,
  r=>r.dimensions.dimensions_a_plat_cm, r=>r.dimensions.tolerance_mm,
  r=>r.matiere.matiere, r=>r.matiere.grammage_g_m2, r=>r.matiere.epaisseur_um, r=>r.matiere.poids_unitaire_g,
  r=>r.design.design_valide_tfb, r=>r.design.gabarit_fournisseur,
  r=>r.design.couleurs.pantone_principal, r=>r.design.couleurs.nb_couleurs_impression,
  r=>r.design.support_rendu.type_support, r=>r.design.support_rendu.grammage_g_m2, r=>r.design.support_rendu.finition,
  r=>r.design.bat.valide_par, r=>r.design.bat.date_validation, r=>r.design.bat.fichier,
  r=>r.logistique.nombre_par_carton, r=>r.logistique.cartons_par_palette,
  r=>r.logistique.conditions_stockage, r=>r.logistique.moq, r=>r.logistique.delai_reappro_jours,
  r=>r.deploiement.points_de_vente.length, r=>r.deploiement.date_mise_en_service, r=>r.deploiement.points_de_vigilance,
  r=>r.usage_tfb.recettes_concernees.length, r=>r.usage_tfb.usage, r=>r.usage_tfb.quantite_par_emballage,
  r=>r.photos.filter(p=>p).length
];
const comp = r => Math.round(100*FILLABLE.filter(f=>!isEmpty(f(r))&&f(r)!==0).length/FILLABLE.length);

/* ---- complétude par onglet, pour les puces des tabs ---- */
const TABFIELDS = {
  general: r=>[r.identification.sku_fournisseur,r.dimensions.longueur_cm,r.dimensions.largeur_cm,
               r.dimensions.hauteur_cm,r.dimensions.dimensions_a_plat_cm,r.dimensions.tolerance_mm,
               r.matiere.matiere,r.matiere.grammage_g_m2,r.matiere.epaisseur_um,r.matiere.poids_unitaire_g],
  design:  r=>[r.design.design_valide_tfb,r.design.gabarit_fournisseur,r.design.couleurs.pantone_principal,
               r.design.couleurs.nb_couleurs_impression,r.design.support_rendu.type_support,
               r.design.support_rendu.grammage_g_m2,r.design.support_rendu.finition,
               r.design.bat.valide_par,r.design.bat.date_validation,r.design.bat.fichier],
  logi:    r=>[r.logistique.nombre_par_carton,r.logistique.cartons_par_palette,r.logistique.conditions_stockage,
               r.logistique.moq,r.logistique.delai_reappro_jours,r.deploiement.points_de_vente.length,
               r.deploiement.date_mise_en_service,r.deploiement.points_de_vigilance],
  usage:   r=>[r.usage_tfb.recettes_concernees.length,r.usage_tfb.usage,r.usage_tfb.quantite_par_emballage],
  photos:  r=>r.photos
};
const tabComp = (r,k) => { const a=TABFIELDS[k](r); return {n:a.filter(v=>!isEmpty(v)&&v!==0).length, t:a.length}; };

/* ---- chargement ---- */
async function load(){
  setConn('spin','Chargement du référentiel…','');
  let doc = (typeof EMBEDDED!=='undefined') ? EMBEDDED : null;
  try{ const r = await fetch('data/packaging.json',{cache:'no-store'}); if(r.ok) doc = await r.json(); }catch(e){}
  if(!doc){ setConn('err','Référentiel introuvable',''); return; }
  DB = doc;
  setConn('ok','<strong>'+DB.packagings.length+' références</strong> chargées depuis le référentiel',
          'liste extraite d’Inpulse le '+DB.meta.extrait_le);
  buildFilters(); render(); syncInpulse();
}

/* ---- Inpulse live ---- */
async function syncInpulse(){
  setConn('spin','Interrogation d’Inpulse…','');
  try{
    const r = await fetch('/api/proxy',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:'/public/v2/supplier-products',method:'GET'})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d = await r.json();
    const list = Array.isArray(d)?d:(d.data||d.items||d.results||[]);
    if(!list.length) throw new Error('réponse vide');
    const by={}; list.forEach(x=>{ if(x&&x.name) by[String(x.name).trim().toUpperCase()]=x; });
    let hit=0;
    DB.packagings.forEach(p=>{
      const m = by[p.identification.intitule_inpulse.trim().toUpperCase()]; if(!m) return; hit++;
      if(m.price!=null) p.inpulse.prix_ht = Number(m.price);
      if(m.supplier&&m.supplier.name) p.inpulse.fournisseur = m.supplier.name;
      p.inpulse.live = true;
    });
    setConn('ok','<strong>Inpulse connecté</strong> — '+hit+' / '+DB.packagings.length+' références rapprochées',
            'prix HT et fournisseurs à jour');
    render();
  }catch(e){
    setConn('err','<strong>Inpulse non joignable</strong> — affichage du dernier extrait',
            '('+e.message+')');
  }
}
function setConn(s,t,d){ document.getElementById('dot').className='dot '+s;
  document.getElementById('conn-t').innerHTML=t; document.getElementById('conn-d').textContent=d||''; }

/* ---- filtres ---- */
function buildFilters(){
  const fam=document.getElementById('f-fam');
  fam.innerHTML='<button class="fgb active" data-fam="">Toutes familles</button>'+
    DB.referentiels.famille.map(f=>'<button class="fgb" data-fam="'+esc(f)+'">'+esc(f)+'</button>').join('');
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
  document.getElementById('btn-sync').onclick=syncInpulse;
  document.getElementById('btn-xls').onclick=exportXls;
  document.getElementById('d-close').onclick=closeDrawer;
  document.getElementById('ov').onclick=closeDrawer;
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});
}

function filtered(){
  return DB.packagings.filter(p=>{
    if(F.fam&&p.app.famille!==F.fam)return false;
    if(F.four&&p.inpulse.fournisseur!==F.four)return false;
    if(F.marq&&p.app.marquage!==F.marq)return false;
    if(F.comp==='lt50'&&p._comp>=50)return false;
    if(F.comp==='lt80'&&p._comp>=80)return false;
    if(F.comp==='eq100'&&p._comp<100)return false;
    if(F.q){const h=(p.nom+' '+p.app.famille+' '+p.inpulse.fournisseur+' '+p.app.marquage+' '+
      p.usage_tfb.usage+' '+p.usage_tfb.recettes_concernees.join(' ')).toLowerCase();
      if(h.indexOf(F.q)<0)return false;}
    return true;
  });
}

/* ---- rendu ---- */
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
  renderMetrics(); renderList(); renderGrid();
  document.getElementById('view-list').style.display=view==='list'?'':'none';
  document.getElementById('view-grid').style.display=view==='grid'?'grid':'none';
  document.getElementById('count').textContent=ROWS.length+' / '+DB.packagings.length+' références';
}

function renderMetrics(){
  const a=DB.packagings,n=a.length;
  const tfb=a.filter(p=>p.app.marquage==='TFB').length;
  const moy=Math.round(a.reduce((s,p)=>s+p._comp,0)/n);
  const px0=a.filter(p=>!p.inpulse.prix_ht).length;
  const four=new Set(a.map(p=>p.inpulse.fournisseur)).size;
  const gab=a.filter(p=>p.design.gabarit_fournisseur).length;
  document.getElementById('metrics').innerHTML=[
    ['Références',n,DB.referentiels.famille.length+' familles',''],
    ['Marquées TFB',tfb,Math.round(100*tfb/n)+' % du parc',''],
    ['Fournisseurs',four,'WELLEMBAL majoritaire',''],
    ['Fiches remplies',moy+' %','moyenne sur '+FILLABLE.length+' champs','accent'],
    ['Gabarits joints',gab+' / '+n,'fichier fournisseur',''],
    ['Prix à vérifier',px0,'référence à 0,00 € dans Inpulse','']
  ].map(([l,v,s,c])=>'<div class="metric '+c+'"><div class="ml">'+l+'</div><div class="mv">'+v+
     '</div><div class="msub">'+s+'</div></div>').join('');
}

const pillMarq=m=>'<span class="pill '+(m==='TFB'?'p-tfb':m==='Co-branding'?'p-cob':'p-neutre')+'">'+esc(m)+'</span>';
const bar=v=>'<div class="bw"><div class="bb"><div class="bf" style="width:'+v+'%;background:'+
  (v<25?'#dc2626':v<60?'#d97706':'#16a34a')+'"></div></div><span class="bp">'+v+'%</span></div>';

function renderList(){
  const tb=document.getElementById('tb');
  if(!ROWS.length){tb.innerHTML='<tr><td colspan="7"><div class="empty"><i class="ti ti-package-off"></i>'+
    '<p>Aucun packaging ne correspond aux filtres.</p></div></td></tr>';return;}
  tb.innerHTML=ROWS.map(p=>{
    const ok=(p.inpulse.dispo||'').split('/')[0]!=='0';
    return '<tr data-id="'+p.id+'"><td class="tb">'+esc(p.nom)+'</td>'
      +'<td class="tm">'+esc(p.app.famille)+'</td><td>'+pillMarq(p.app.marquage)+'</td>'
      +'<td class="tm">'+esc(p.inpulse.fournisseur)+'</td>'
      +'<td class="num">'+eur(p.inpulse.prix_ht)+'</td>'
      +'<td><span class="pill '+(ok?'p-ok':'p-warn')+'">'+esc(p.inpulse.dispo)+'</span></td>'
      +'<td>'+bar(p._comp)+'</td></tr>';
  }).join('');
  tb.querySelectorAll('tr[data-id]').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.id));
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

/* ---- fiche ---- */
const SRC_INP='<span class="src src-inp">Inpulse</span>', SRC_TFB='<span class="src src-tfb">TFB</span>';
function f(label,val,unit,src,wide){
  const body=isEmpty(val)?'<div class="fv void">à compléter</div>'
    :Array.isArray(val)?'<div class="chips">'+val.map(v=>'<span class="chip">'+esc(v)+'</span>').join('')+'</div>'
    :'<div class="fv">'+esc(val)+(unit?' <span class="u">'+esc(unit)+'</span>':'')+'</div>';
  return '<div class="f'+(wide?' wide':'')+'"><div class="fl">'+esc(label)+(src||'')+'</div>'+body+'</div>';
}
function file(label,val){
  return '<div class="f wide"><div class="fl">'+esc(label)+SRC_TFB+'</div>'+
    (val?'<div class="fv"><a href="'+esc(val)+'" target="_blank" rel="noopener"><i class="ti ti-paperclip"></i> '+esc(val)+'</a></div>'
        :'<div class="filedrop"><i class="ti ti-file-plus"></i> Aucun fichier joint</div>')+'</div>';
}
const gh=t=>'<div class="gh">'+t+'</div>';
const oui=v=>v===null||v===undefined?'':(v?'oui':'non');

const BODY={
 general: r =>
   gh('Identification')+'<div class="fields">'
   + f('Intitulé Inpulse', r.identification.intitule_inpulse, '', SRC_INP, 1)
   + f('SKU fournisseur', r.identification.sku_fournisseur, '', SRC_TFB)
   + f('Fournisseur', r.inpulse.fournisseur, '', SRC_INP)
   + f('Prix HT', r.inpulse.prix_ht?eur(r.inpulse.prix_ht):'', '', SRC_INP)
   + f('Disponibilité boutiques', r.inpulse.dispo, '', SRC_INP)
   + '</div>'
   + gh('Dimensions')+'<div class="fields">'
   + f('Longueur', r.dimensions.longueur_cm, 'cm', SRC_TFB)
   + f('Largeur', r.dimensions.largeur_cm, 'cm', SRC_TFB)
   + f('Profondeur (soufflet)', r.dimensions.profondeur_soufflet_cm, 'cm', SRC_TFB)
   + f('Hauteur', r.dimensions.hauteur_cm, 'cm', SRC_TFB)
   + f('Dimensions à plat (L × H)', r.dimensions.dimensions_a_plat_cm, 'cm', SRC_TFB)
   + f('Tolérance dimensionnelle', r.dimensions.tolerance_mm, 'mm', SRC_TFB)
   + '</div>'
   + gh('Matière')+'<div class="fields">'
   + f('Matière', r.matiere.matiere, '', SRC_TFB)
   + f('Grammage', r.matiere.grammage_g_m2, 'g/m²', SRC_TFB)
   + f('Épaisseur', r.matiere.epaisseur_um, 'µm', SRC_TFB)
   + f('Poids unitaire', r.matiere.poids_unitaire_g, 'g', SRC_TFB)
   + f('Contact alimentaire', oui(r.matiere.contact_alimentaire), '', SRC_TFB)
   + '</div>',

 design: r =>
   '<div class="note"><i class="ti ti-info-circle"></i><div>Deux fichiers font foi : le <strong>design validé TFB</strong> '
   +'et le <strong>gabarit fournisseur</strong>. Tant qu’ils ne sont pas joints, la référence ne peut pas être relancée en production.</div></div>'
   + gh('Fichiers')+'<div class="fields">'
   + file('Design validé (TFB)', r.design.design_valide_tfb)
   + file('Gabarit (fournisseur)', r.design.gabarit_fournisseur)
   + file('Logo (si nécessaire)', r.design.logo)
   + '</div>'
   + gh('Couleurs & pantones')+'<div class="fields">'
   + f('Pantone principal', r.design.couleurs.pantone_principal, '', SRC_TFB)
   + f('Pantone secondaire', r.design.couleurs.pantone_secondaire, '', SRC_TFB)
   + f('Pantone tertiaire', r.design.couleurs.pantone_tertiaire, '', SRC_TFB)
   + f('Nombre de couleurs d’impression', r.design.couleurs.nb_couleurs_impression, '', SRC_TFB)
   + '</div>'
   + gh('Support et rendu')+'<div class="fields">'
   + f('Type de support', r.design.support_rendu.type_support, '', SRC_TFB)
   + f('Grammage', r.design.support_rendu.grammage_g_m2, 'g/m²', SRC_TFB)
   + f('Finition', r.design.support_rendu.finition, '', SRC_TFB)
   + '</div>'
   + gh('BAT')+'<div class="fields">'
   + f('BAT validé par', r.design.bat.valide_par, '', SRC_TFB)
   + f('Date de validation', r.design.bat.date_validation, '', SRC_TFB)
   + file('Fichier BAT joint', r.design.bat.fichier)
   + '</div>'
   + gh('Mentions obligatoires (si nécessaire)')+'<div class="fields">'
   + f('Dénomination du produit', r.design.mentions_obligatoires.denomination_produit, '', SRC_TFB)
   + f('Poids / contenance', r.design.mentions_obligatoires.poids_contenance, '', SRC_TFB)
   + f('Allergènes', r.design.mentions_obligatoires.allergenes, '', SRC_TFB)
   + f('DDM / DLC', r.design.mentions_obligatoires.ddm_dlc, '', SRC_TFB)
   + f('Adresse et raison sociale', r.design.mentions_obligatoires.adresse_raison_sociale, '', SRC_TFB)
   + f('Logo tri / recyclabilité', r.design.mentions_obligatoires.logo_tri_recyclabilite, '', SRC_TFB)
   + '</div>',

 logi: r =>
   gh('Logistique')+'<div class="fields">'
   + f('Nombre par carton', r.logistique.nombre_par_carton, 'pièces', SRC_TFB)
   + f('Cartons par palette', r.logistique.cartons_par_palette, 'cartons', SRC_TFB)
   + f('Conditions de stockage', r.logistique.conditions_stockage, '', SRC_TFB)
   + f('MOQ', r.logistique.moq, 'pièces', SRC_TFB)
   + f('Délai de réapprovisionnement', r.logistique.delai_reappro_jours, 'jours', SRC_TFB)
   + '</div>'
   + gh('Déploiement')+'<div class="fields">'
   + f('Points de vente concernés', r.deploiement.points_de_vente, '', SRC_TFB, 1)
   + f('Date de mise en service', r.deploiement.date_mise_en_service, '', SRC_TFB)
   + f('Points de vigilance', r.deploiement.points_de_vigilance, '', SRC_TFB, 1)
   + '</div>',

 usage: r =>
   gh('Recettes concernées')+'<div class="fields">'
   + f('Recettes concernées', r.usage_tfb.recettes_concernees, '', SRC_TFB, 1)
   + f('Usage', r.usage_tfb.usage, '', SRC_TFB, 1)
   + f('Quantité par emballage', r.usage_tfb.quantite_par_emballage, 'pièces', SRC_TFB)
   + '</div>',

 photos: r =>
   '<div class="note"><i class="ti ti-camera"></i><div>Quatre prises par référence. Les fichiers vivent dans '
   +'<code>assets/photos/'+esc(r.id)+'/</code> et sont référencés par le tableau <code>photos</code>.</div></div>'
   + gh('Galerie')+'<div class="photogrid">'
   + DB.referentiels.photos_attendues.map((t,i)=> r.photos[i]
       ? '<figure><img src="'+esc(r.photos[i])+'" alt="'+esc(t)+'"><figcaption>'+esc(t)+'</figcaption></figure>'
       : '<div class="slot"><i class="ti ti-photo-plus"></i>'+esc(t)+'</div>').join('')
   + '</div>'
};

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
  const b=document.getElementById('d-body'); b.innerHTML=BODY[activeTab](r); b.scrollTop=0;
  document.getElementById('ov').classList.add('on');
  document.getElementById('drawer').classList.add('on');
}
function closeDrawer(){document.getElementById('ov').classList.remove('on');
  document.getElementById('drawer').classList.remove('on');}

/* ---- export ---- */
function exportXls(){
  const rows=ROWS.map(p=>({
    'Intitulé Inpulse':p.identification.intitule_inpulse,'SKU fournisseur':p.identification.sku_fournisseur,
    Famille:p.app.famille,Marquage:p.app.marquage,Statut:p.app.statut,
    Fournisseur:p.inpulse.fournisseur,'Prix HT':p.inpulse.prix_ht,'Dispo.':p.inpulse.dispo,
    'Longueur (cm)':p.dimensions.longueur_cm,'Largeur (cm)':p.dimensions.largeur_cm,
    'Soufflet (cm)':p.dimensions.profondeur_soufflet_cm,'Hauteur (cm)':p.dimensions.hauteur_cm,
    'À plat (cm)':p.dimensions.dimensions_a_plat_cm,'Tolérance (mm)':p.dimensions.tolerance_mm,
    Matière:p.matiere.matiere,'Grammage (g/m²)':p.matiere.grammage_g_m2,'Épaisseur (µm)':p.matiere.epaisseur_um,
    'Poids unitaire (g)':p.matiere.poids_unitaire_g,'Contact alimentaire':oui(p.matiere.contact_alimentaire),
    'Design validé TFB':p.design.design_valide_tfb,'Gabarit fournisseur':p.design.gabarit_fournisseur,
    'Pantone principal':p.design.couleurs.pantone_principal,'Nb couleurs':p.design.couleurs.nb_couleurs_impression,
    'Type de support':p.design.support_rendu.type_support,Finition:p.design.support_rendu.finition,
    'BAT validé par':p.design.bat.valide_par,'Date BAT':p.design.bat.date_validation,
    'Nombre par carton':p.logistique.nombre_par_carton,'Cartons par palette':p.logistique.cartons_par_palette,
    'Conditions de stockage':p.logistique.conditions_stockage,MOQ:p.logistique.moq,
    'Délai réappro (j)':p.logistique.delai_reappro_jours,
    'Points de vente':p.deploiement.points_de_vente.join(', '),
    'Mise en service':p.deploiement.date_mise_en_service,'Points de vigilance':p.deploiement.points_de_vigilance,
    'Recettes concernées':p.usage_tfb.recettes_concernees.join(', '),Usage:p.usage_tfb.usage,
    'Quantité par emballage':p.usage_tfb.quantite_par_emballage,
    Photos:p.photos.filter(x=>x).length+'/4','Fiche %':p._comp
  }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Info Pack');
  XLSX.writeFile(wb,'tfb-info-pack-'+new Date().toISOString().slice(0,10)+'.xlsx');
}

load();
