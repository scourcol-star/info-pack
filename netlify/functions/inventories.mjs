// Inventaires packaging, lus directement dans Inpulse.
//
// Chaque debut de mois, les boutiques saisissent un inventaire dans Inpulse.
// Ces inventaires-la portent stockConvention = "start" ; les lignes packaging
// y cotoient les produits finis, on ne garde que celles dont le produit
// fournisseur est de categorie PACKAGING.
//
// Quantites : quantity est exprimee dans le CONDITIONNEMENT D'ACHAT
// (« 6 CARTON(S) DE 1000PCE »), donc unites = quantity x packaging.quantity.
// C'est la meme convention que la feuille Stock de l'app, qui raisonne en
// unites.
//
// L'API n'expose pas les lignes dans la liste : il faut appeler le detail de
// chaque inventaire. On ne prend donc que le DERNIER inventaire « start » de
// chaque boutique — c'est celui qui fait foi — soit une vingtaine d'appels.
// Le travail est reprenable : budget de temps, avancement dans Netlify Blobs.
import { getStore } from "@netlify/blobs";

const KEY = "inventories";
const FROM = "2026-01-01";
const API = "https://api.inpulse.ai";
const PAGE = 100;
const CONC = 8;
const BUDGET_MS = 7000;

const H = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: H });

function blank() {
  return {
    version: 1, from: FROM,
    storeNames: null, packagingIds: null,
    queue: null, done: [], inv: {}, dates: {},
    updated_at: null, full_built_at: null
  };
}

async function inpulse(key, path, body, method) {
  const opts = {
    method: method || "POST",
    headers: { "x-api-key": key, Accept: "application/json", "Content-Type": "application/json" }
  };
  if (opts.method !== "GET") opts.body = JSON.stringify(body || {});
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error("Inpulse " + r.status + " sur " + path.split("?")[0]);
  return r.json();
}

async function pool(items, fn, deadline) {
  let i = 0, stopped = false;
  async function worker() {
    while (i < items.length) {
      if (Date.now() > deadline) { stopped = true; return; }
      const k = i++;
      try { await fn(items[k]); } catch (e) { /* un inventaire illisible ne bloque pas le reste */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  return { stopped };
}

/* Toutes les lignes d'un inventaire — la liste est paginee, et ce point
   d'entree n'accepte PAS de parametre limit : seul skip est honore. */
async function lignes(key, id) {
  let out = [], skip = 0;
  for (let i = 0; i < 20; i++) {
    const d = await inpulse(key, "/public/v2/inventories/" + id + (skip ? "?skip=" + skip : ""), null, "GET");
    const a = (d && d.data) || [];
    out = out.concat(a);
    const total = (d && d.total) || 0;
    skip += PAGE;
    if (out.length >= total || a.length < PAGE) break;
  }
  return out;
}

export default async (req) => {
  const key = process.env.API_KEY;
  if (!key) return json(503, { error: "API_KEY non configuree sur Netlify." });

  const url = new URL(req.url);
  const work = url.searchParams.get("work") === "1";
  const reset = url.searchParams.get("reset") === "1";

  let store;
  try { store = getStore({ name: "info-pack", consistency: "strong" }); }
  catch (e) { return json(503, { error: "Stockage indisponible : " + e.message }); }

  let st = reset ? blank() : ((await store.get(KEY, { type: "json" })) || blank());
  if (st.version !== 1) st = blank();

  if (!work) {
    return json(200, {
      data: st.inv, dates: st.dates, storeNames: st.storeNames,
      updated_at: st.updated_at, full_built_at: st.full_built_at,
      progress: { done: !!st.full_built_at && !st.queue, reste: st.queue ? st.queue.length : 0 }
    });
  }

  const deadline = Date.now() + BUDGET_MS;

  try {
    /* 1. boutiques */
    if (!st.storeNames) {
      const d = await inpulse(key, "/public/v2/stores?limit=" + PAGE, null, "GET");
      const a = (d && (d.data || d)) || [];
      st.storeNames = {};
      a.forEach(s => { if (s && s.id) st.storeNames[s.id] = s.name; });
    }

    /* 2. references de categorie PACKAGING — la cle de tri des lignes */
    if (!st.packagingIds) {
      const ids = {};
      for (let p = 0; p < 30; p++) {
        const d = await inpulse(key, "/public/v2/supplier-products?limit=" + PAGE + "&skip=" + (p * PAGE), null, "GET");
        const a = (d && (d.data || d)) || [];
        a.forEach(x => { if (x && x.category === "PACKAGING" && x.id) ids[x.id] = String(x.name || "").trim(); });
        if (a.length < PAGE) break;
        if (Date.now() > deadline) break;
      }
      st.packagingIds = ids;
    }

    /* 3. le dernier inventaire « debut de mois » de chaque boutique */
    if (!st.queue) {
      const storeIds = Object.keys(st.storeNames);
      const body = { startDate: FROM + "T00:00:00.000Z", endDate: new Date().toISOString(), storeIds };
      let all = [];
      for (let skip = 0; skip < 5000; skip += PAGE) {
        const d = await inpulse(key, "/public/v2/inventories?skip=" + skip + "&limit=" + PAGE, body, "POST");
        const a = (d && d.data) || [];
        all = all.concat(a);
        if (a.length < PAGE) break;
        if (Date.now() > deadline) break;
      }
      const vus = {};
      all = all.filter(x => (vus[x.id] ? false : (vus[x.id] = 1)));
      const dernier = {};
      all.filter(x => x.stockConvention === "start").forEach(x => {
        const k = x.storeId;
        if (!dernier[k] || x.inventoryDate > dernier[k].inventoryDate) dernier[k] = x;
      });
      st.queue = Object.values(dernier).map(x => ({ id: x.id, storeId: x.storeId, date: x.inventoryDate }));
      st.inv = {}; st.dates = {};
    }

    /* 4. detail des inventaires restants */
    const reste = st.queue.slice();
    const r = await pool(reste, async (x) => {
      const ls = await lignes(key, x.id);
      const jour = String(x.date || "").slice(0, 10);
      ls.forEach(l => {
        const nom = st.packagingIds[l.supplierProductId];
        if (!nom) return;                       // pas du packaging
        const cond = l.supplierProductPackaging || {};
        const parCarton = Number(cond.quantity) || 1;
        const q = Number(l.quantity);
        if (!isFinite(q)) return;
        const cle = nom.toUpperCase();
        (st.inv[cle] || (st.inv[cle] = {}))[x.storeId] = {
          q: q * parCarton,          // en unites
          cartons: q,
          cond: cond.name || "",
          d: jour
        };
      });
      st.dates[x.storeId] = jour;
      st.queue = st.queue.filter(y => y.id !== x.id);
    }, deadline);

    st.updated_at = new Date().toISOString();
    if (!st.queue.length) { st.queue = null; st.full_built_at = st.updated_at; }
    await store.setJSON(KEY, st);

    return json(200, {
      data: st.inv, dates: st.dates, storeNames: st.storeNames,
      updated_at: st.updated_at, full_built_at: st.full_built_at,
      progress: { done: !st.queue, reste: st.queue ? st.queue.length : 0, stopped: r.stopped }
    });
  } catch (e) {
    try { await store.setJSON(KEY, st); } catch (e2) {}
    return json(502, { error: String((e && e.message) || e), data: st.inv, dates: st.dates, storeNames: st.storeNames });
  }
};

export const config = { path: "/api/inventories" };
