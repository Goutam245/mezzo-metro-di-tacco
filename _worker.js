/* =========================================================================
   Mezzo Metro di Tacco — versione B
   Funzioni del sito su Cloudflare Pages (modo avanzato).

   Tutto quello che non comincia per /api/ è un file statico e passa liscio.
   /api/ serve solo al pannello:
     POST /api/accesso     { chiave }        apre la sessione (cookie firmato)
     POST /api/uscita                        chiude la sessione
     GET  /api/stato                         dice se la sessione è aperta
     GET  /api/contenuti                     i contenuti salvati (204 se non ce ne sono)
     PUT  /api/contenuti   { ...contenuti }  salva (serve la sessione)

   Variabili da impostare su Cloudflare:
     PANNELLO_CHIAVE    la parola d'accesso al pannello
     PANNELLO_SEGRETO   una stringa lunga a caso, per firmare il cookie
   Deposito da collegare:
     CONTENUTI          spazio KV
   ========================================================================= */

const CHIAVE_KV = "contenuti";
const DURATA = 60 * 60 * 12;            // dodici ore
const NOME_COOKIE = "mmt_sessione";
const LIMITE = 20 * 1024 * 1024;        // 20 MB: ci stanno anche le foto caricate dal pannello

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url);
      } catch (e) {
        return json({ errore: "Errore del server: " + e.message }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

async function api(request, env, url) {
  const rotta = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const metodo = request.method.toUpperCase();

  if (metodo === "OPTIONS") return new Response(null, { status: 204 });

  if (rotta === "accesso" && metodo === "POST") {
    const atteso = env.PANNELLO_CHIAVE;
    if (!atteso) {
      return json({ errore: "Il pannello non è ancora configurato: manca PANNELLO_CHIAVE." }, 503);
    }
    const corpo = await leggiJson(request);
    if (!corpo || !confronta(String(corpo.chiave || ""), atteso)) {
      await new Promise((r) => setTimeout(r, 600));      // rallenta i tentativi a raffica
      return json({ errore: "Parola d'accesso sbagliata." }, 401);
    }
    const gettone = await firma(env, Math.floor(Date.now() / 1000) + DURATA);
    return json({ ok: true }, 200, {
      "set-cookie": `${NOME_COOKIE}=${gettone}; Path=/; Max-Age=${DURATA}; HttpOnly; Secure; SameSite=Strict`,
    });
  }

  if (rotta === "uscita" && metodo === "POST") {
    return json({ ok: true }, 200, {
      "set-cookie": `${NOME_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    });
  }

  if (rotta === "stato" && metodo === "GET") {
    return json({
      dentro: await sessioneValida(request, env),
      deposito: Boolean(env.CONTENUTI),
      configurato: Boolean(env.PANNELLO_CHIAVE && env.PANNELLO_SEGRETO),
    });
  }

  if (rotta === "contenuti") {
    if (metodo === "GET") {
      // 204 e non 404: senza contenuti salvati il sito usa il seme,
      // ed è una cosa normale, non un errore da stampare in console.
      if (!env.CONTENUTI) return vuoto();
      const salvato = await env.CONTENUTI.get(CHIAVE_KV);
      if (!salvato) return vuoto();
      return new Response(salvato, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (metodo === "PUT") {
      if (!(await sessioneValida(request, env))) {
        return json({ errore: "Sessione scaduta. Rientra nel pannello." }, 401);
      }
      if (!env.CONTENUTI) {
        return json({ errore: "Nessun deposito collegato: collega lo spazio KV «CONTENUTI»." }, 503);
      }
      const testo = await request.text();
      if (testo.length > LIMITE) {
        return json({ errore: "Contenuti troppo pesanti. Alleggerisci le foto." }, 413);
      }
      let dati;
      try {
        dati = JSON.parse(testo);
      } catch (e) {
        return json({ errore: "Contenuti illeggibili." }, 400);
      }
      const guaio = controlla(dati);
      if (guaio) return json({ errore: guaio }, 400);
      dati.versione = Number(dati.versione || 0) + 1;
      dati.aggiornato = new Date().toISOString().slice(0, 10);
      await env.CONTENUTI.put(CHIAVE_KV, JSON.stringify(dati));
      return json({ ok: true, versione: dati.versione, aggiornato: dati.aggiornato });
    }
  }

  return json({ errore: "Non esiste." }, 404);
}

/* ── controlli minimi sulla forma dei contenuti ───────────────────────── */
function controlla(d) {
  if (!d || typeof d !== "object") return "Contenuti vuoti.";
  if (!Array.isArray(d.prodotti)) return "Manca l'elenco dei prodotti.";
  if (!Array.isArray(d.categorie)) return "Manca l'elenco delle categorie.";
  if (!d.impostazioni || typeof d.impostazioni !== "object") return "Mancano le impostazioni.";
  const num = String(d.impostazioni.whatsapp || "");
  if (!/^\d{8,15}$/.test(num)) {
    return "Il numero WhatsApp va scritto solo con le cifre, per esempio 393408737943.";
  }
  const categorie = new Set(d.categorie.map((c) => c && c.id));
  for (const c of d.categorie) {
    if (!c || !c.id || !c.nome) return "Ogni categoria deve avere un codice e un nome.";
  }
  for (const p of d.prodotti) {
    if (!p || !p.id || !p.nome) return "Ogni prodotto deve avere un codice e un nome.";
    if (!p.categoria) return `Al prodotto «${p.nome}» manca la categoria.`;
    if (!categorie.has(p.categoria)) {
      return `Il prodotto «${p.nome}» punta a una categoria che non esiste più.`;
    }
  }
  return null;
}

/* ── sessione: cookie firmato con HMAC, nessun dato personale dentro ──── */
async function chiaveHmac(env) {
  const segreto = env.PANNELLO_SEGRETO;
  if (!segreto) throw new Error("manca PANNELLO_SEGRETO");
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
}

async function firma(env, scadenza) {
  const k = await chiaveHmac(env);
  const corpo = String(scadenza);
  const f = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(corpo));
  return corpo + "." + b64url(f);
}

async function sessioneValida(request, env) {
  if (!env.PANNELLO_SEGRETO) return false;
  const cookie = request.headers.get("cookie") || "";
  const trovato = cookie.split(";").map((s) => s.trim())
    .find((s) => s.startsWith(NOME_COOKIE + "="));
  if (!trovato) return false;
  const gettone = trovato.slice(NOME_COOKIE.length + 1);
  const punto = gettone.lastIndexOf(".");
  if (punto < 1) return false;
  const scadenza = Number(gettone.slice(0, punto));
  if (!scadenza || scadenza < Math.floor(Date.now() / 1000)) return false;
  const atteso = await firma(env, scadenza);
  return confronta(gettone, atteso);
}

/* ── utilità ─────────────────────────────────────────────────────────── */
function confronta(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64url(buf) {
  let s = "";
  const v = new Uint8Array(buf);
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function leggiJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

function vuoto() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

function json(dati, stato = 200, intestazioni = {}) {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...intestazioni,
    },
  });
}
