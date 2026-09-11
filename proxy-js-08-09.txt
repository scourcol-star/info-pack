// Proxy Inpulse : la cle API reste cote serveur (variable Netlify API_KEY).
// Endpoints autorises volontairement limites a ce dont Info Pack a besoin.
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const API_KEY = process.env.API_KEY;
  if (!API_KEY)
    return { statusCode: 503, headers, body: JSON.stringify({ error: "API_KEY non configuree sur Netlify." }) };

  const OK = ["/public/v2/supplier-products", "/public/v2/suppliers", "/public/v2/ingredients", "/public/v2/orders", "/public/v2/stores", "/public/v2/recipes"];
  try {
    const { endpoint, body, method } = JSON.parse(event.body || "{}");
    if (!endpoint) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing endpoint" }) };
    if (!OK.some(p => endpoint.startsWith(p)))
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Non autorise : " + endpoint }) };

    const m = (method || "POST").toUpperCase();
    const opts = { method: m, headers: { "x-api-key": API_KEY, Accept: "application/json", "Content-Type": "application/json" } };
    if (m !== "GET" && m !== "HEAD") opts.body = JSON.stringify(body || {});

    const r = await fetch("https://api.inpulse.ai" + endpoint, opts);
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch (e) { d = { raw: t }; }
    return {
      statusCode: r.status,
      headers: Object.assign({}, headers, { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" }),
      body: JSON.stringify(d)
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
