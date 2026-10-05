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

let CACHE = null;                 // { t, corps }
const DUREE = 10 * 60 * 1000;

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
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('id manquant', { status: 400 });
  if (!process.env.APPS_SCRIPT_URL) return new Response('non configure', { status: 501 });
  try {
    const r = await fetch(cible({ img: id }), { redirect: 'follow' });
    const d = await r.json();
    if (!d || !d.b64) throw new Error(d && d.error || 'vignette absente');
    return new Response(Buffer.from(d.b64, 'base64'), {
      status: 200,
      headers: {
        'Content-Type': d.mime || 'image/png',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (e) {
    return new Response('', { status: 404 });
  }
}

export default async (req) => {
  if (new URL(req.url).pathname === '/api/image') return image(req);
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

export const config = { path: ['/api/drive', '/api/image'] };
