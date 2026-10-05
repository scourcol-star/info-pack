/* ============================================================
   /api/drive — les documents de chaque référence, depuis le Drive.
   Un dossier par référence sous un dossier parent commun. Dès qu'un
   fichier y est déposé, il remonte ici : l'app n'a rien à téléverser.

   Trois variables d'environnement Netlify, à régler une fois :
     GOOGLE_SERVICE_ACCOUNT  le JSON du compte de service, tel quel
     DRIVE_PARENT_ID         l'id du dossier Drive qui contient les
                             dossiers de références (celui d'Oumnya,
                             partagé en « Éditeur » avec l'adresse
                             client_email du compte de service)
     DRIVE_SHARED_DRIVE      « 1 » si le dossier vit dans un Drive partagé

   Sans ces variables la fonction répond 501 et l'app retombe sur la
   saisie de liens à la main : rien ne casse.

   La fonction parcourt le dossier et tout ce qu'il contient, sur
   quatre niveaux, et renvoie la liste à plat. C'est l'app qui
   rattache ensuite chaque fichier à une référence, en cherchant le
   SKU fournisseur, la référence Wellembal ou l'intitulé Inpulse dans
   le nom du fichier ou dans celui d'un dossier qui le contient.
   Aucune arborescence imposée : un dossier par référence marche,
   un dossier fourre-tout aussi.

   Le document est rangé par le nom du fichier ou de son dossier :
     *BAT* → BAT · *GABARIT* / *DIELINE* → gabarit · le reste, si
   c'est une image, → photos.
   ============================================================ */
import crypto from 'node:crypto';

const OAUTH = 'https://oauth2.googleapis.com/token';
const API   = 'https://www.googleapis.com/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive';

const b64url = b => Buffer.from(b).toString('base64')
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

/* Jeton d'accès par compte de service : on signe un JWT, Google le change
   en jeton. Pas de dépendance, node:crypto suffit. */
async function jeton(sa){
  const now = Math.floor(Date.now()/1000);
  const head = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const body = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE, aud: OAUTH, iat: now, exp: now+3600
  }));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(head+'.'+body), sa.private_key));
  const r = await fetch(OAUTH, {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: head+'.'+body+'.'+sig })
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.error_description || d.error || ('jeton refusé (HTTP '+r.status+')'));
  return d.access_token;
}

const drv = (tok, chemin, params={}) => {
  const u = new URL(API+chemin);
  Object.entries(params).forEach(([k,v])=>{ if(v!=null) u.searchParams.set(k,v); });
  return fetch(u, {headers:{Authorization:'Bearer '+tok}});
};

function classe(nom, mime, chemin){
  const n = (String(nom||'') + ' ' + (chemin||[]).join(' ')).toUpperCase();
  if(/\bBAT\b|BON A TIRER/.test(n))     return 'bat';
  if(/GABARIT|DIELINE|DECOUPE/.test(n))  return 'gabarit';
  if(/PHOTO|VISUEL|IMAGE/.test(n))       return 'photos';
  return String(mime||'').startsWith('image/') ? 'photos' : 'gabarit';
}

export default async (req) => {
  const sortie = (o, code=200) =>
    new Response(JSON.stringify(o), {status:code, headers:{'Content-Type':'application/json'}});

  const brut = process.env.GOOGLE_SERVICE_ACCOUNT;
  const parent = process.env.DRIVE_PARENT_ID;
  if(!brut || !parent)
    return sortie({error:'Drive non configuré — il manque GOOGLE_SERVICE_ACCOUNT ou DRIVE_PARENT_ID'}, 501);

  let sa;
  try{ sa = JSON.parse(brut); }
  catch(e){ return sortie({error:'GOOGLE_SERVICE_ACCOUNT n’est pas un JSON valide'}, 501); }

  const partage = process.env.DRIVE_SHARED_DRIVE === '1';
  const commun  = partage ? {supportsAllDrives:true, includeItemsFromAllDrives:true} : {};

  try{
    const tok = await jeton(sa);

    /* POST { ref, nom } : crée le dossier de la référence s'il manque. */
    if(req.method === 'POST'){
      const {ref, nom} = await req.json();
      if(!ref) return sortie({error:'référence manquante'}, 400);
      const q = `'${parent}' in parents and name='${String(ref).replace(/'/g,"\\'")}' `
              + `and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const ex = await (await drv(tok,'/files',{q, fields:'files(id,webViewLink)', ...commun})).json();
      if(ex.files && ex.files.length) return sortie({id:ex.files[0].id, url:ex.files[0].webViewLink});
      const r = await fetch(API+'/files?fields=id,webViewLink'+(partage?'&supportsAllDrives=true':''), {
        method:'POST', headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},
        body: JSON.stringify({name:String(ref), mimeType:'application/vnd.google-apps.folder',
                              parents:[parent], description: nom||''})
      });
      const d = await r.json();
      if(!r.ok) throw new Error(d.error?.message || ('création refusée (HTTP '+r.status+')'));
      return sortie({id:d.id, url:d.webViewLink, cree:true});
    }

    /* GET : on descend le dossier parent niveau par niveau. */
    const fichiers = [];
    const dossiers = {};                 // id -> {nom, url, chemin:[...]}
    let niveau = [{id:parent, chemin:[]}];
    for(let prof=0; prof<4 && niveau.length; prof++){
      const suivant = [];
      for(let i=0; i<niveau.length; i+=25){
        const lot = niveau.slice(i, i+25);
        const q = '(' + lot.map(d=>`'${d.id}' in parents`).join(' or ') + ') and trashed=false';
        const rr = await (await drv(tok,'/files', {q,
          fields:'files(id,name,mimeType,parents,thumbnailLink,webViewLink)',
          pageSize:1000, ...commun})).json();
        if(rr.error) throw new Error(rr.error.message||'lecture refusée');
        (rr.files||[]).forEach(f=>{
          const pere = lot.find(d=>(f.parents||[]).indexOf(d.id)>=0) || lot[0];
          const chemin = pere.chemin.concat(pere.nom?[pere.nom]:[]);
          if(f.mimeType === 'application/vnd.google-apps.folder'){
            dossiers[f.id] = {nom:f.name, url:f.webViewLink, chemin};
            suivant.push({id:f.id, nom:f.name, chemin});
          }else if(fichiers.length < 4000){
            fichiers.push({
              id:f.id, nom:f.name, chemin, mime:f.mimeType,
              dossier: pere.nom || null, dossier_url: pere.url || null,
              k: classe(f.name, f.mimeType, chemin),
              url: f.webViewLink, vignette: f.thumbnailLink || null
            });
          }
        });
      }
      niveau = suivant.map(d=>({...d, url:(dossiers[d.id]||{}).url}));
    }
    return sortie({fichiers, dossiers, parent});
  }catch(e){
    return sortie({error:'Drive injoignable — '+e.message}, 502);
  }
};

export const config = { path: '/api/drive' };
