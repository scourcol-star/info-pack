// Historique de commandes packaging, mois par mois, depuis janvier 2026.
//
// L'API Inpulse n'expose pas les lignes dans la liste des commandes : il faut
// balayer les entetes (4900 depuis janvier) puis appeler le detail des seules
// commandes des fournisseurs de packaging (~490). Trop long pour une seule
// invocation, donc le travail est REPRENABLE : chaque appel travaille dans un
// budget de temps, sauvegarde son avancement dans Netlify Blobs, et rend la main.
// Le client rappelle tant que progress.done est faux.
//
// Quantites : receivedQuantity est exprimee dans le conditionnement COMMANDE,
// donc cartons commandes et cartons recus sont directement comparables.
import { getStore } from "@netlify/blobs";

const KEY = "orders";
const FROM = "2026-01-01";
const API = "https://api.inpulse.ai";
const PAGE = 100;
const CONC = 12;              // appels Inpulse simultanes
const BUDGET_MS = 7000;       // on rend la main avant le timeout de la function
const SKIP_STATUS = { DRAFT: 1 };   // un brouillon n'est pas une commande

const H = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: H });

function blank() {
  return {
    version: 1, from: FROM,
    stores: null, packagingIds: null, names: {},
    headerSkip: 0, headerTotal: null, headersDone: false,
    queue: [], seen: {}, agg: {},
    updated_at: null, full_built_at: null
  };
}

async function inpulse(key, path, body, method) {
  const opts = { method: method || "POST", headers: { "x-api-key": key, Accept: "application/json", "Content-Type": "application/json" } };
  if (opts.method !== "GET") opts.body = JSON.stringify(body || {});
  const r = await fetch(API + path, opts);
  if (!r.ok) throw new Error("Inpulse " + r.status + " sur " + path.split("?")[0]);
  return r.json();
}

// Execute des taches par lots, en respectant le budget de temps
async function pool(items, fn, deadline) {
  let i = 0, stopped = false;
  async function worker() {
    while (i < items.length) {
      if (Date.now() > deadline) { stopped = true; return; }
      const k = i++;
      try { await fn(items[k]); } catch (e) { /* une commande illisible ne bloque pas le reste */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, worker));
  return { stopped, consumed: Math.min(i, items.length) };
}

export default async (req) => {
  const key = process.env.API_KEY;
  if (!key) return json(503, { error: "API_KEY non configuree sur Netlify." });

  const url = new URL(req.url);
  const work = url.searchParams.get("work") === "1";
  const reset = url.searchParams.get("reset") === "1";

  let store;
  try { store = getStore({ name: "info-pack", consistency: "strong" }); }
  catch (e) { return json(503, { error: "Stockage Netlify indisponible : " + String(e?.message || e) }); }

  let st = reset ? blank() : ((await store.get(KEY, { type: "json" })) || blank());
  if (st.version !== 1) st = blank();

  const out = () => json(200, {
    ok: true, from: st.from, updated_at: st.updated_at, full_built_at: st.full_built_at,
    progress: {
      headers: { skip: st.headerSkip, total: st.headerTotal, done: st.headersDone },
      queue: st.queue.length, seen: Object.keys(st.seen).length,
      done: st.headersDone && st.queue.length === 0
    },
    data: st.agg
  });

  if (!work) return out();

  const deadline = Date.now() + BUDGET_MS;
  const today = new Date().toISOString().slice(0, 10);

  try {
    // --- 1. Boutiques (obligatoire dans le filtre des commandes) ---
    if (!st.stores) {
      const d = await inpulse(key, "/public/v2/stores?limit=200", null, "GET");
      st.stores = ((d.data || d) || []).map(s => s.id);
    }

    // --- 2. Referentiel : quels supplier-products sont du PACKAGING ---
    if (!st.packagingIds) {
      const ids = {}, names = {};
      for (let p = 0; p < 20; p++) {
        const d = await inpulse(key, "/public/v2/supplier-products?limit=" + PAGE + "&skip=" + p * PAGE, null, "GET");
        const rows = d.data || [];
        rows.forEach(x => {
          if (x && x.category === "PACKAGING") { ids[x.id] = 1; names[x.id] = String(x.name || "").trim().toUpperCase(); }
        });
        if (rows.length < PAGE) break;
      }
      st.packagingIds = ids; st.names = names;
    }

    // --- 3. Balayage des entetes de commandes, reprenable ---
    while (!st.headersDone && Date.now() < deadline) {
      const d = await inpulse(key, "/public/v2/orders?skip=" + st.headerSkip + "&limit=" + PAGE,
        { storeIds: st.stores, startDate: st.from, endDate: today });
      const rows = d.data || [];
      st.headerTotal = d.total || 0;
      rows.forEach(o => {
        if (SKIP_STATUS[o.statusName]) return;
        if (st.seen[o.id]) return;
        // le filtre packaging se fait sur les lignes : une commande peut
        // melanger du packaging et autre chose
        st.queue.push({ id: o.id, m: String(o.orderDate || o.deliveryDate || "").slice(0, 7) });
      });
      st.headerSkip += rows.length;
      if (rows.length < PAGE || st.headerSkip >= st.headerTotal) { st.headersDone = true; break; }
    }

    // --- 4. Detail des commandes en attente ---
    if (st.queue.length) {
      await pool(st.queue.slice(0, 5000), async (job) => {
        const d = await inpulse(key, "/public/v2/orders/" + job.id, null, "GET");
        const lines = (d && d.data) || [];
        const touched = {};
        lines.forEach(L => {
          const sp = L.supplierProductId;
          if (!sp || !st.packagingIds[sp]) return;
          const nm = st.names[sp] || sp;
          const m = job.m || "?";
          const a = st.agg[nm] || (st.agg[nm] = {});
          const c = a[m] || (a[m] = { n: 0, oq: 0, rq: 0 });
          c.oq += parseFloat(L.orderedQuantity) || 0;
          c.rq += parseFloat(L.receivedQuantity) || 0;
          if (!touched[nm]) { c.n += 1; touched[nm] = 1; }
        });
        st.seen[job.id] = 1;
      }, deadline);
      st.queue = st.queue.filter(j => !st.seen[j.id]);
      if (st.headersDone && !st.queue.length) st.full_built_at = new Date().toISOString();
    }

    st.updated_at = new Date().toISOString();
    await store.setJSON(KEY, st);
    return out();
  } catch (err) {
    st.updated_at = new Date().toISOString();
    try { await store.setJSON(KEY, st); } catch (e) {}
    return json(502, { error: String(err?.message || err), progress: { headers: { skip: st.headerSkip, total: st.headerTotal, done: st.headersDone }, queue: st.queue.length } });
  }
};

export const config = { path: "/api/orders" };
