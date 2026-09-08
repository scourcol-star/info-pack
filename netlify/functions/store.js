// Stockage des saisies TFB dans Netlify Blobs.
// Le JSON du repo reste le socle (et la source Inpulse) ; ici on ne garde que
// les valeurs saisies dans l'app, sous forme de chemins pointes :
//   { version, updated_at, records: { "<id-packaging>": { "matiere.grammage_g_m2": 300 } } }
// Ecriture par patch (POST {ops:[{id,path,value}]}) : deux personnes qui
// saisissent en meme temps ne s'ecrasent pas.
const { getStore } = require("@netlify/blobs");

const KEY = "overrides";
const ID_RE = /^[a-z0-9-]{1,100}$/;
const PATH_RE = /^[a-zA-Z0-9_.]{1,60}$/;
const MAX_OPS = 400;
const MAX_STR = 4000;
const MAX_ARR = 60;

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const res = (statusCode, body) => ({ statusCode, headers: H, body: JSON.stringify(body) });

function clean(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.length > MAX_STR ? v.slice(0, MAX_STR) : v;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, MAX_ARR).map(x => String(x).slice(0, 300));
  return null;
}
const empty = v => v === null || v === "" || (Array.isArray(v) && !v.length);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: H, body: "" };

  let store;
  try {
    store = getStore({ name: "info-pack", consistency: "strong" });
  } catch (e) {
    return res(503, { error: "Stockage Netlify indisponible : " + String((e && e.message) || e) });
  }

  try {
    if (event.httpMethod === "GET") {
      const doc = (await store.get(KEY, { type: "json" })) || { version: 1, updated_at: null, records: {} };
      return res(200, doc);
    }

    if (event.httpMethod === "POST") {
      const { ops } = JSON.parse(event.body || "{}");
      if (!Array.isArray(ops) || !ops.length) return res(400, { error: "aucune operation" });
      if (ops.length > MAX_OPS) return res(413, { error: "trop d'operations (max " + MAX_OPS + ")" });

      const doc = (await store.get(KEY, { type: "json" })) || { version: 1, records: {} };
      if (!doc.records) doc.records = {};

      let applied = 0, rejected = 0;
      for (const op of ops) {
        if (!op || !ID_RE.test(String(op.id)) || !PATH_RE.test(String(op.path))) { rejected++; continue; }
        const v = clean(op.value);
        const rec = doc.records[op.id] || (doc.records[op.id] = {});
        if (empty(v)) delete rec[op.path]; else rec[op.path] = v;
        if (!Object.keys(rec).length) delete doc.records[op.id];
        applied++;
      }
      doc.version = 1;
      doc.updated_at = new Date().toISOString();
      await store.setJSON(KEY, doc);
      return res(200, {
        ok: true, applied, rejected,
        updated_at: doc.updated_at,
        fiches_modifiees: Object.keys(doc.records).length
      });
    }

    return res(405, { error: "Method not allowed" });
  } catch (err) {
    return res(500, { error: String((err && err.message) || err) });
  }
};
