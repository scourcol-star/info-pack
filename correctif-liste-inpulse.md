# Correctif Info Pack — la liste ne se mettait pas à jour

Fichier modifié : `app.js`, à la racine du repo `scourcol-star/info-pack`. Aucun autre fichier ne change.

Le fichier complet est livré à côté sous le nom **app.js.txt** : télécharge-le, renomme-le en `app.js`, remplace celui du repo. Netlify redéploie tout seul.

## Diff

```diff
diff --git a/app.js b/app.js
index 2fa058e..ceadd46 100644
--- a/app.js
+++ b/app.js
@@ -326,6 +326,90 @@ function ordFor(p){
   return {vide:tot.n===0, mois:a, tot};
 }
 
+/* ============================================================
+   Références nouvelles côté Inpulse
+   Inpulse est la liste de référence : toute référence PACKAGING qui n'a
+   pas encore de fiche est créée ici, sinon la base reste figée sur le
+   socle du repo. L'identifiant est dérivé du libellé et donc stable :
+   les saisies TFB faites sur ces fiches se rattachent au même id et
+   reviennent au rechargement, comme pour n'importe quelle autre fiche.
+   Famille, marquage et statut ne sont que des valeurs de départ — ce
+   sont des champs TFB, corrigeables dans la fiche, et la correction est
+   enregistrée.
+   ============================================================ */
+const FAMILLE_REGLES = [
+  [/\bCOUVERCLE/,                                      'Couvercle'],
+  [/\bBAGUE/,                                          'Bague'],
+  [/\bBOUTEILLE/,                                      'Bouteille'],
+  [/\bBOWL|\bBOL\b/,                                   'Bowl'],
+  [/\bGOBELET/,                                        'Gobelet'],
+  [/\bSERVIETTE/,                                      'Serviette'],
+  [/\bETIQUETTE|\bÉTIQUETTE|\bCOLLERETTE/,             'Étiquette'],
+  [/\bSAC\b|\bSACHET|\bSACS\b|\bPOCHETTE|\bTOTE\b/,    'Sac'],
+  [/\bBOITE|\bBOÎTE|\bCAISSE|\bBARQUETTE|\bCOFANETTO|\bETUI|\bÉTUI/, 'Boîte'],
+  [/\bPAPIER|\bBOBINE|\bROULEAU|\bFILM\b|\bDEPLIANT|\bDÉPLIANT|\bTABLETTE/, 'Papier'],
+  [/\bCOUTEAU|\bFOURCHETTE|\bCUILLERE|\bCUILLÈRE|\bCOUVERTS|\bKIT\b/, 'Couverts'],
+  [/\bMUG\b|\bTASSE|\bASSIETTE|\bMOULE|\bCAISSETTE|\bTULIPCUP/, 'Vaisselle']
+];
+const familleDe = nom => { const n=String(nom||'').toUpperCase();
+  for(const [re,f] of FAMILLE_REGLES) if(re.test(n)) return f;
+  return 'Accessoire'; };
+const marquageDe = nom => { const n=String(nom||'').toUpperCase();
+  if(/\bTFB\b|THE FRENCH BASTARDS/.test(n)) return /\bX\b/.test(n)?'Co-branding':'TFB';
+  return 'Neutre'; };
+const slugId = nom => String(nom||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
+  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90) || 'ref';
+function idUnique(base, pris){ let id=base, n=2;
+  while(pris[id]) id=base+'-'+(n++); pris[id]=1; return id; }
+
+/* Champs pilotés par Inpulse — un seul endroit, fiche existante ou créée. */
+function appliquerInpulse(p,m){
+  const pk=m.packaging||{};
+  p.inpulse.live=true;
+  if(m.price!=null)   p.inpulse.prix_ht=Number(m.price);
+  if(m.supplier)      p.inpulse.fournisseur=m.supplier;
+  if(m.subCategory)   p.inpulse.sous_categorie=m.subCategory;
+  p.inpulse.unite_achat=pk.name||'';
+  p.inpulse.actif=m.active;
+  p.identification.sku_fournisseur=(m.sku&&m.sku!=='?')?m.sku:'';
+  const q=pk.quantity;
+  p.logistique.nombre_par_carton=(q&&q>1)?q:null;
+  p.logistique.unite_commande=uniteCommande(pk.name);
+  p.logistique.prix_unitaire_ht=(q&&q>1&&m.price)?m.price/q:null;
+}
+
+/* Fiche vierge à la structure du socle : tous les chemins existent, la
+   complétude et l'export s'appliquent sans cas particulier. */
+function fichePackaging(m,id){
+  const nom=String(m.name||'').trim();
+  const p={
+    id:id, nom:nom, _nouveau:true,
+    app:{famille:familleDe(nom), marquage:marquageDe(nom), statut:'À compléter'},
+    inpulse:{prix_ht:null, dispo:null, fournisseur:'', categorie:m.category||'PACKAGING',
+             sous_categorie:'', ingredient:null, unite_achat:''},
+    identification:{intitule_inpulse:nom, sku_fournisseur:''},
+    dimensions:{longueur_cm:null, largeur_cm:null, profondeur_soufflet_cm:null,
+                hauteur_cm:null, dimensions_a_plat_cm:'', tolerance_mm:null},
+    matiere:{matiere:'', grammage_g_m2:null, epaisseur_um:null,
+             poids_unitaire_g:null, contact_alimentaire:null},
+    design:{design_valide_tfb:'', gabarit_fournisseur:'', logo:'',
+            couleurs:{pantone_principal:'', pantone_secondaire:'', pantone_tertiaire:'',
+                      nb_couleurs_impression:null},
+            support_rendu:{type_support:'', grammage_g_m2:null, finition:''},
+            bat:{valide_par:'', date_validation:'', fichier:''},
+            mentions_obligatoires:{denomination_produit:'', poids_contenance:'', allergenes:'',
+                                   ddm_dlc:'', adresse_raison_sociale:'', logo_tri_recyclabilite:''}},
+    logistique:{nombre_par_carton:null, cartons_par_palette:null, conditions_stockage:'',
+                moq:null, delai_reappro_jours:null, unite_commande:'', prix_unitaire_ht:null},
+    deploiement:{points_de_vente:[], date_mise_en_service:'', date_fin_service:'',
+                 points_de_vigilance:''},
+    usage_tfb:{recettes_concernees:[], usage:'', quantite_par_emballage:null},
+    photos:['','','','']
+  };
+  appliquerInpulse(p,m);
+  return p;
+}
+
 /* ---- Inpulse : /api/packaging si dispo, sinon pagination via /api/proxy ---- */
 async function syncInpulse(){
   setConn('spin','Interrogation d’Inpulse…','');
@@ -344,24 +428,31 @@ async function syncInpulse(){
       const m=by[p.identification.intitule_inpulse.trim().toUpperCase()];
       if(!m){ orphans.push(p.nom); return; }
       hit++;
-      p.inpulse.live=true;
-      if(m.price!=null) p.inpulse.prix_ht=Number(m.price);
-      if(m.supplier) p.inpulse.fournisseur=m.supplier;
-      if(m.subCategory) p.inpulse.sous_categorie=m.subCategory;
-      p.inpulse.unite_achat=m.packaging.name;
-      p.inpulse.actif=m.active;
-      p.identification.sku_fournisseur=(m.sku&&m.sku!=='?')?m.sku:'';
-      const q=m.packaging.quantity;
-      p.logistique.nombre_par_carton=(q&&q>1)?q:null;
-      p.logistique.unite_commande=uniteCommande(m.packaging.name);
-      p.logistique.prix_unitaire_ht=(q&&q>1&&m.price)?m.price/q:null;
+      appliquerInpulse(p,m);
     });
-    const known={}; DB.packagings.forEach(p=>known[p.identification.intitule_inpulse.trim().toUpperCase()]=1);
-    const nouvelles=list.filter(x=>!known[String(x.name).trim().toUpperCase()]).map(x=>x.name);
+
+    /* Références Inpulse sans fiche : création. Inpulse pouvant renvoyer
+       deux fois le même libellé, la clé de rapprochement (le nom) fait foi. */
+    const known={}, pris={};
+    DB.packagings.forEach(p=>{ known[p.identification.intitule_inpulse.trim().toUpperCase()]=1; pris[p.id]=1; });
+    const nouvelles=[];
+    list.forEach(x=>{
+      const nom=String(x.name||'').trim(); if(!nom) return;
+      const cle=nom.toUpperCase(); if(known[cle]) return;
+      known[cle]=1;
+      DB.packagings.push(fichePackaging(x, idUnique(slugId(nom), pris)));
+      nouvelles.push(nom);
+    });
+    if(nouvelles.length){
+      hit+=nouvelles.length;
+      applyOverrides();     // saisies TFB déjà enregistrées sur ces nouvelles fiches
+      refreshFournisseurs();
+    }
+
     let note='prix, SKU et conditionnements à jour — '+via;
-    if(nouvelles.length) note+=' · '+nouvelles.length+' nouvelle(s) réf. dans Inpulse : '+nouvelles.join(', ');
-    if(orphans.length)   note+=' · non retrouvée(s) : '+orphans.join(', ');
-    setConn((hit===DB.packagings.length&&!nouvelles.length)?'ok':'warn',
+    if(nouvelles.length) note+=' · '+nouvelles.length+' réf. ajoutée(s) depuis Inpulse : '+nouvelles.join(', ');
+    if(orphans.length)   note+=' · non retrouvée(s) dans Inpulse : '+orphans.join(', ');
+    setConn(orphans.length?'warn':'ok',
       '<strong>Inpulse connecté</strong> — '+hit+' / '+DB.packagings.length+' références rapprochées', note);
     if(current) openDrawer(current.id);
     render();
@@ -446,6 +537,16 @@ window.addEventListener('beforeunload', e=>{ if(QUEUE.length){ e.preventDefault(
 /* ============================================================
    Filtres, liste, grille
    ============================================================ */
+/* Reconstruit la liste des fournisseurs : appelable apres l'ajout de
+   references Inpulse, sans empiler les options d'un appel a l'autre. */
+function refreshFournisseurs(){
+  const four=document.getElementById('f-four'); if(!four) return;
+  const sel=four.value;
+  four.innerHTML='<option value="">Tous fournisseurs</option>'+
+    [...new Set(DB.packagings.map(p=>p.inpulse.fournisseur).filter(Boolean))].sort()
+      .map(f=>'<option'+(f===sel?' selected':'')+'>'+esc(f)+'</option>').join('');
+}
+
 function buildFilters(){
   const fam=document.getElementById('f-fam');
   fam.innerHTML='<button class="fgb active" data-fam="">Toutes familles</button>'+
@@ -453,8 +554,7 @@ function buildFilters(){
   fam.onclick=e=>{const b=e.target.closest('[data-fam]');if(!b)return;
     F.fam=b.dataset.fam;[...fam.children].forEach(c=>c.classList.toggle('active',c===b));render();};
   const four=document.getElementById('f-four');
-  [...new Set(DB.packagings.map(p=>p.inpulse.fournisseur))].sort()
-    .forEach(f=>four.insertAdjacentHTML('beforeend','<option>'+esc(f)+'</option>'));
+  refreshFournisseurs();
   document.getElementById('q').oninput=e=>{F.q=e.target.value.toLowerCase();render();};
   four.onchange=e=>{F.four=e.target.value;render();};
   document.getElementById('f-marq').onchange=e=>{F.marq=e.target.value;render();};
@@ -563,7 +663,8 @@ function renderList(){
     return '<tr class="mainrow'+(open?' open':'')+'" data-id="'+p.id+'">'
       + '<td class="tb namecell" data-toggle="'+p.id+'">'
         + '<span class="chev'+(open?' on':'')+'"><i class="ti ti-chevron-right"></i></span>'
-        + esc(p.nom) + (OVR.records[p.id]?' <i class="ti ti-pencil edited" title="fiche saisie"></i>':'')
+        + esc(p.nom) + (p._nouveau?' <i class="ti ti-sparkles edited" title="créée depuis Inpulse — fiche à compléter"></i>':'')
+        + (OVR.records[p.id]?' <i class="ti ti-pencil edited" title="fiche saisie"></i>':'')
         + '<div class="ordline">'+resume+'</div></td>'
       + '<td><button class="btn btn-sm btn-fiche" data-open="'+p.id+'"><i class="ti ti-layout-sidebar-right-expand"></i>Ouvrir la fiche</button></td>'
       + '<td class="tm">'+esc(p.app.famille)+'</td><td>'+pillMarq(p.app.marquage)+'</td>'
```
