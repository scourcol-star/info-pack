/* ============================================================
   /api/drive — les documents de chaque référence, depuis le Drive.

   Aucune clé Google ici, et aucun projet Google Cloud. Un script
   Apps Script, qui vit dans le Workspace de TFB et s'exécute avec
   les droits de la personne qui l'a publié, parcourt le dossier
   packaging et renvoie la liste des fichiers. Cette fonction ne
   fait que relayer sa réponse, pour que l'adresse du script reste
   côté serveur et n'apparaisse jamais dans le code de la page.

   Deux variables d'environnement Netlify, à régler une fois :
     APPS_SCRIPT_URL     l'adresse « …/exec » donnée au déploiement
     APPS_SCRIPT_JETON   le même mot de passe que dans le script

   Sans elles la fonction répond 501 et l'app retombe sur la saisie
   de liens à la main : rien ne casse.

   La réponse est gardée en mémoire dix minutes, pour ne pas
   solliciter Apps Script à chaque ouverture de l'app.
   ============================================================ */

let CACHE = null;                 // documents : { t, corps }
let CACHE_W = null;               // referentiel : { t, corps }
const DUREE = 5 * 60 * 1000;
const DUREE_W = 30 * 60 * 1000;

/* Adresse du script, avec le mot de passe et d'eventuels parametres. */
function cible(extra) {
  const url = process.env.APPS_SCRIPT_URL;
  const jeton = process.env.APPS_SCRIPT_JETON || '';
  const p = new URLSearchParams(Object.assign({ jeton: jeton }, extra || {}));
  return url + (url.indexOf('?') < 0 ? '?' : '&') + p.toString();
}

/* /api/image?id=… : la vignette d'un fichier Drive.
   Les adresses drive.google.com/thumbnail exigent que le navigateur
   soit authentifie aupres de Google, ce qui ne marche pas dans une
   page. On passe donc par le script, qui a les droits, et qui renvoie
   l'image en base64. On la redonne ici en vraies donnees binaires. */
async function image(req) {
  const q = new URL(req.url).searchParams;
  const id = q.get('id');
  /* t=grand : la version 1600 px, pour le bouton Telecharger. */
  const t = q.get('t') === 'grand' ? 'grand' : '';
  if (!id) return new Response('id manquant', { status: 400 });
  if (!process.env.APPS_SCRIPT_URL) return new Response('non configure', { status: 501 });
  try {
    const r = await fetch(cible(t ? { img: id, t } : { img: id }), { redirect: 'follow' });
    const d = await r.json();
    if (!d || !d.b64) throw new Error(d && d.error || 'vignette absente');
    return new Response(Buffer.from(d.b64, 'base64'), {
      status: 200,
      headers: {
        'Content-Type': d.mime || 'image/png',
        /* Un identifiant Drive ne change jamais de contenu : on peut
           garder la vignette un an, le navigateur ne redemandera pas. */
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (e) {
    return new Response('', { status: 404 });
  }
}

/* /api/wellembal : le referentiel fournisseur, tel que le script l'a lu
   dans le classeur que Wellembal met a jour. L'app le met en forme. */
async function wellembal(req) {
  const sortie = (o, code = 200) =>
    new Response(JSON.stringify(o), {
      status: code, headers: { 'Content-Type': 'application/json' }
    });
  if (!process.env.APPS_SCRIPT_URL)
    return sortie({ error: 'Référentiel non configuré — il manque APPS_SCRIPT_URL' }, 501);

  const frais = new URL(req.url).searchParams.get('frais') === '1';
  if (!frais && CACHE_W && Date.now() - CACHE_W.t < DUREE_W)
    return sortie({ ...CACHE_W.corps, cache: true });

  try {
    const q = { wel: '1' };
    if (frais) q.frais = '1';
    const r = await fetch(cible(q), { redirect: 'follow' });
    if (!r.ok) throw new Error('Apps Script a répondu HTTP ' + r.status);
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); }
    catch (e) { throw new Error('réponse inattendue — vérifie que le déploiement '
      + 'est publié avec « Tout le monde » comme accès'); }
    if (d.error) throw new Error(d.error);
    CACHE_W = { t: Date.now(), corps: d };
    return sortie(d);
  } catch (e) {
    return sortie({ error: 'Référentiel injoignable — ' + e.message }, 502);
  }
}

export default async (req) => {
  const chemin = new URL(req.url).pathname;
  if (chemin === '/api/image') return image(req);
  if (chemin === '/api/wellembal') return wellembal(req);
  const sortie = (o, code = 200) =>
    new Response(JSON.stringify(o), {
      status: code,
      headers: { 'Content-Type': 'application/json' }
    });

  const url = process.env.APPS_SCRIPT_URL;
  if (!url)
    return sortie({ error: 'Drive non configuré — il manque APPS_SCRIPT_URL' }, 501);

  /* ?frais=1 force la relecture, sans attendre la fin du cache */
  const frais = new URL(req.url).searchParams.get('frais') === '1';
  if (!frais && CACHE && Date.now() - CACHE.t < DUREE)
    return sortie({ ...CACHE.corps, cache: true });

  try {
    const r = await fetch(cible(), { redirect: 'follow' });
    if (!r.ok) throw new Error('Apps Script a répondu HTTP ' + r.status);

    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); }
    catch (e) {
      /* Apps Script renvoie une page HTML quand le déploiement n'est
         pas accessible sans connexion Google. */
      throw new Error('réponse inattendue — vérifie que le déploiement '
        + 'est publié avec « Tout le monde » comme accès');
    }
    if (d.error) throw new Error(d.error);

    CACHE = { t: Date.now(), corps: { fichiers: d.fichiers || [], parent: d.parent,
                                      genere: d.genere } };
    return sortie(CACHE.corps);
  } catch (e) {
    return sortie({ error: 'Drive injoignable — ' + e.message }, 502);
  }
};

export const config = { path: ['/api/drive', '/api/image', '/api/wellembal'] };
