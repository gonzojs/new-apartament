import { randomUUID } from 'node:crypto';
import { text as streamToText } from 'node:stream/consumers';
import { get, put, list, del } from '@vercel/blob';

const PRODUCTS_PATH = 'products.json';
/** Prefix for list/del: matches pathname `products.json` (Vercel matches pathnames that start with this). */
const BLOB_LIST_PREFIX = 'products';
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const hasBlob = Boolean(BLOB_READ_WRITE_TOKEN);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = [
  { cat:"Sofás y Asientos",    name:"Sofá Sierra 4 Plazas",           store:"Habitat",   img:"https://cdn.habitat.fr/thumbnails/product/122/122396/medium/0/13549251.webp",
    url:"https://www.habitat-design.com/es-es/p/sierra-sofa-4-plazas-de-tejido-kumal-con-relleno-de-plumas-azul-marino" },
  { cat:"Sofás y Asientos",    name:"Sofá Cama PAOLY Pana",            store:"Sklum",     img:"https://cdn.sklum.com/es/5172832-large_default/sofa-cama-de-2-plazas-en-pana-envasado-al-vacio-paoly.jpg",
    url:"https://www.sklum.com/es/comprar-sofa-cama/226575-sofa-cama-de-2-plazas-en-pana-envasado-al-vacio-paoly.html" },
  { cat:"Sofás y Asientos",    name:"4× Sillas ANELA",                 store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260211-SesionArame5463copia.jpg?v=1773156486",
    url:"https://northdeco.com/collections/sillas-de-diseno/products/silla-comedor-anela?variant=55253067694466" },
  { cat:"Sofás y Asientos",    name:"Silla PINHA Polietileno/Metal",   store:"The Masie", img:null,
    url:"https://www.themasie.com/es/comprar-sillas-de-comedor/175622-silla-de-comedor-con-reposabrazos-de-polietileno-y-metal-pinha.html?id_c=419988" },
  { cat:"Sofás y Asientos",    name:"Silla IRUN Terciopelo",           store:"The Masie", img:"https://cdn.themasie.com/es/5142583-large_default/silla-de-comedor-de-terciopelo-y-tela-irun.jpg",
    url:"https://www.themasie.com/es/comprar-sillas-de-comedor/107425-silla-de-comedor-de-terciopelo-y-tela-irun.html" },
  { cat:"Sofás y Asientos",    name:"Folk Pouf Tall & Wide Bundle",    store:"noo.ma",    img:"http://noo.ma/cdn/shop/products/blueberry_black.png?v=1627383917&width=2048",
    url:"https://noo.ma/fr/collections/furniture/products/folk-tall-wide-bundle?variant=32766289248336" },
  { cat:"Mesas de Comedor",    name:"Mesa GALA Roble",                 store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/Northdeco_Summer25_1284.jpg?v=1748939638",
    url:"https://northdeco.com/products/mesa-de-comedor-redonda-extensible-gala?variant=46829938966865" },
  { cat:"Mesas de Comedor",    name:"Mesa GALA Nogal",                 store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/Northdeco_Summer25_1686_68dfebb4-8d91-4936-8df8-6b52bb40f1b4.jpg?v=1748957218",
    url:"https://northdeco.com/products/mesa-de-comedor-redonda-extensible-gala-walnut-120-150-cm?variant=47675040039249" },
  { cat:"Muebles de TV",       name:"Mueble TV ALTREX Acacia/Inox",   store:"Sklum",     img:"https://cdn.sklum.com/es/5199549-large_default/mueble-tv-en-madera-de-acacia-y-acero-inoxidable-altrex.jpg",
    url:"https://www.sklum.com/es/comprar-muebles-tv/222200-mueble-tv-en-madera-de-acacia-y-acero-inoxidable-altrex.html?id_c=664775" },
  { cat:"Muebles de TV",       name:"Mueble TV ALAZNE MDF",            store:"Sklum",     img:"https://cdn.sklum.com/es/4253682-large_default/mueble-tv-180x40-cm-en-mdf-alazne.jpg",
    url:"https://www.sklum.com/es/comprar-muebles-tv/175312-mueble-tv-180x40-cm-en-mdf-alazne.html?id_c=419152" },
  { cat:"Muebles de TV",       name:"Mueble TV MICHIGAN Acero",        store:"Sklum",     img:"https://cdn.sklum.com/es/4333950-large_default/mueble-tv-180x40-cm-en-acero-michigan.jpg",
    url:"https://www.sklum.com/es/comprar-muebles-tv/186426-mueble-tv-180x40-cm-en-acero-michigan.html?id_c=497544" },
  { cat:"Muebles de TV",       name:"Mueble TV LUENA Inoxidable",      store:"Sklum",     img:"https://cdn.sklum.com/es/5135937-large_default/mueble-tv-180x40-cm-en-acero-inoxidable-luena.jpg",
    url:"https://www.sklum.com/es/comprar-muebles-tv/227829-mueble-tv-180x40-cm-en-acero-inoxidable-luena.html" },
  { cat:"Mesas Auxiliares",    name:"Mesa Centro CORINA Nogal",        store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/Mesa-Corina-CasaJU-Northdeco-ProductoI.jpg?v=1759925419",
    url:"https://northdeco.com/products/mesa-de-centro-corina-110-x-55-cm?variant=42101022621875" },
  { cat:"Mesas Auxiliares",    name:"2× Mesas Auxiliares ANDE",        store:"noo.ma",    img:"http://noo.ma/cdn/shop/products/nooma_FUR1350.34-bundle.png?v=1666943767&width=2048",
    url:"https://noo.ma/fr/collections/furniture/products/2x-ande-side-table?variant=40443080802475" },
  { cat:"Mesas Auxiliares",    name:"Mesa Auxiliar SAURA Azul",        store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260128-SesionEresArte4243.jpg?v=1771240742",
    url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-saura?variant=55608925127042" },
  { cat:"Mesas Auxiliares",    name:"Mesa Auxiliar SAURA Transparente",store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260128-SesionEresArte4243.jpg?v=1771240742",
    url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-saura?variant=54881572979074" },
  { cat:"Mesas Auxiliares",    name:"Mesita RILO Azul",                store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260211-SesionArame4864copia.jpg?v=1773156172",
    url:"https://northdeco.com/collections/outlet/products/mesita-auxiliar-rilo-37x46-cm?variant=55081732964738" },
  { cat:"Mesas Auxiliares",    name:"Mesita RILO Negra",               store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260211-SesionArame4864copia.jpg?v=1773156172",
    url:"https://northdeco.com/collections/outlet/products/mesita-auxiliar-rilo-37x46-cm?variant=49829988270417" },
  { cat:"Mesas Auxiliares",    name:"Mesa BONET Metal/Cristal",        store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/20260211-SesionArame6035copia.jpg?v=1773228131",
    url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-auxiliar-de-metal-y-cristal-templado-bonet?variant=56320834601346" },
  { cat:"Mesas Auxiliares",    name:"Mesa JOHANNA Cubo Cristal",       store:"Northdeco", img:"http://northdeco.com/cdn/shop/files/Mesa_Johanna_ND-0811-BLUE_03_a3e1a96e-1b70-43e5-9146-48eb24a30da6.jpg?v=1723810080",
    url:"https://northdeco.com/collections/outlet/products/mesa-de-cristal-cuadrada-johanna-40x40-cm?variant=49063256392017" },
  { cat:"Bancos",              name:"Banco RIOLUT Ratán/Madera",       store:"Sklum",     img:"https://cdn.sklum.com/es/2257692-large_default/banco-en-ratan-y-madera-riolut.jpg",
    url:"https://www.sklum.com/es/comprar-bancos/92041-banco-en-ratan-y-madera-riolut.html" },
  { cat:"Bancos",              name:"Banco KARVIA Tela/Acacia",        store:"Sklum",     img:"https://cdn.sklum.com/es/4994261-large_default/banco-180-cm-en-madera-de-acacia-y-tela-karvia.jpg",
    url:"https://www.sklum.com/es/comprar-bancos/200118-banco-180-cm-en-madera-de-acacia-y-tela-karvia.html?id_c=577295" },
  { cat:"Bancos",              name:"Banco DUBAI Acacia",              store:"Sklum",     img:"https://cdn.sklum.com/es/4851335-large_default/banco-en-madera-de-acacia-dubai.jpg",
    url:"https://www.sklum.com/es/comprar-bancos/211180-banco-en-madera-de-acacia-dubai.html?id_c=588466" },
  { cat:"Almacenaje",          name:"Banco Zapatero BRUCK",            store:"The Masie", img:"https://cdn.themasie.com/es/4569007-large_default/banco-zapatero-con-almacenaje-de-acero-laminado-bruck-.jpg",
    url:"https://www.themasie.com/es/comprar-zapateros/130652-banco-zapatero-con-almacenaje-de-acero-laminado-bruck-.html" },
  { cat:"Almacenaje",          name:"Vestidor KRAUFORD Bambú",         store:"Sklum",     img:"https://cdn.sklum.com/es/4367991-large_default/vestidor-abierto-en-madera-de-bambu-krauford.jpg",
    url:"https://www.sklum.com/es/comprar-armarios/100305-vestidor-abierto-en-madera-de-bambu-krauford.html" },
  { cat:"Almacenaje",          name:"Armario JANINE Acero",            store:"Sklum",     img:"https://cdn.sklum.com/es/4393948-large_default/armario-abierto-con-cajones-en-acero-janine.jpg",
    url:"https://www.sklum.com/es/comprar-armarios/186380-armario-abierto-con-cajones-en-acero-janine.html" },
  { cat:"Dormitorio & Oficina",name:"2× Mesitas Noche LORAQ Acero",   store:"Sklum",     img:null,
    url:"https://www.sklum.com/es/comprar-packs-mesitas-de-noche/219867-pack-de-2-mesitas-de-noche-cuadradas-en-acero-loraq.html?id_c=620199" },
  { cat:"Dormitorio & Oficina",name:"2× Estructura ELLINGE 150×190",  store:"JYSK",      img:"https://cdn1.jysk.com/getimage/wd3.large/236088",
    url:"https://jysk.es/dormitorio/camas/canapes-somieres-y-estructuras-de-cama/estructuras-de-cama/estructura-cama-ellinge-150x190-almacenaje-roble-calido" },
  { cat:"Dormitorio & Oficina",name:"Escritorio FLEXISPOT Elevable",   store:"Amazon",    img:null,
    url:"https://www.amazon.es/dp/B0DMNY2MF4" },
  { cat:"Dormitorio & Oficina",name:"Alfombra COME Crudo",             store:"Habitat",   img:"https://cdn.habitat.fr/thumbnails/product/121/121685/medium/0/13540400.webp",
    url:"https://www.habitat-design.com/es-es/p/come-alfombra-de-lana-con-acabado-tufte-170-x-240-cm-crudo-design-by-floriane-jacques" },
];

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function storeFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const MAP = {
      'northdeco.com': 'Northdeco', 'sklum.com': 'Sklum',
      'habitat-design.com': 'Habitat', 'noo.ma': 'noo.ma',
      'jysk.es': 'JYSK', 'amazon.es': 'Amazon', 'themasie.com': 'The Masie',
    };
    const name = host.split('.')[0];
    return MAP[host] || (name.charAt(0).toUpperCase() + name.slice(1));
  } catch { return ''; }
}

function copySeed() {
  return JSON.parse(JSON.stringify(SEED));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Canonical URL for matching product url fields (avoids href vs stored string drift). */
function normalizeUrl(u) {
  try {
    return new URL(u).href;
  } catch {
    return u;
  }
}

function findProductByUrl(products, productUrl) {
  const want = normalizeUrl(productUrl);
  return products.find((x) => normalizeUrl(x.url) === want);
}

/**
 * Read latest `products.json` from Blob.
 * 1) Prefer `get(pathname)` — same auth as `put`, avoids stale CDN on the public `fetch()` URL.
 * 2) Do not use `get(..., { useCache: false })` — the `?cache=0` query can 400.
 * 3) Fallback: `list` + public URL with a cache-bust query + `no-store` fetch.
 */
async function readProductsFromBlob() {
  try {
    const out = await get(PRODUCTS_PATH, {
      access: 'public',
      token: BLOB_READ_WRITE_TOKEN,
    });
    if (out) {
      const raw = await streamToText(out.stream);
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[readProductsFromBlob] get', e?.message || e);
  }
  const { blobs } = await list({ prefix: BLOB_LIST_PREFIX, token: BLOB_READ_WRITE_TOKEN });
  const forFile = blobs.filter(b => b.pathname === PRODUCTS_PATH);
  if (!forFile.length) {
    return null;
  }
  const sorted = [...forFile].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const u = new URL(sorted[0].url);
  u.searchParams.set('b', String(Date.now()));
  const res = await fetch(u, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to read products blob: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function getProducts() {
  if (!hasBlob) {
    return copySeed();
  }
  for (let i = 0; i < 3; i++) {
    try {
      const data = await readProductsFromBlob();
      if (data != null) {
        if (!Array.isArray(data)) {
          throw new Error('Invalid products data');
        }
        return data;
      }
    } catch (e) {
      if (i === 2) {
        throw e;
      }
    }
    if (i < 2) {
      await sleep(80 * (i + 1));
    }
  }
  // No `products.json` in the store yet — do not write (avoids clobbering after a
  // race; old code used `saveProducts(SEED)` on empty `list` and could wipe new adds).
  return copySeed();
}

async function saveProducts(products) {
  if (!hasBlob) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  }
  const { blobs } = await list({ prefix: BLOB_LIST_PREFIX, token: BLOB_READ_WRITE_TOKEN });
  await Promise.all(blobs.map(b => del(b.url, { token: BLOB_READ_WRITE_TOKEN }).catch(() => {})));
  await put(PRODUCTS_PATH, JSON.stringify(products), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_READ_WRITE_TOKEN,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!hasBlob) {
    res.setHeader('X-Products-Data-Source', 'local-seed');
  }

  try {
    if (req.method === 'GET') {
      const products = await getProducts();
      return res.json(products);
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (body.action === 'delete') {
        if (!hasBlob) {
          return res.status(503).json({
            error: 'BLOB_READ_WRITE_TOKEN is not set. Add a Vercel Blob store to the project, then run `vercel env pull` or put the token in .env.local. See .env.example.',
          });
        }
        const { url: targetUrl } = body;
        if (!targetUrl) return res.status(400).json({ error: 'url required' });
        const products = await getProducts();
        const filtered = products.filter(p => p.url !== targetUrl);
        if (filtered.length === products.length) {
          return res.status(404).json({ error: 'not found' });
        }
        await saveProducts(filtered);
        return res.json(filtered);
      }

      if (body.action === 'add-comment') {
        if (!hasBlob) {
          return res.status(503).json({
            error: 'BLOB_READ_WRITE_TOKEN is not set. Add a Vercel Blob store to the project, then run `vercel env pull` or put the token in .env.local. See .env.example.',
          });
        }
        const productUrl = body.url;
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!productUrl || !text) {
          return res.status(400).json({ error: 'url and text required' });
        }
        const author = body.author === 'designer' ? 'designer' : 'me';
        const products = deepClone(await getProducts());
        const p = findProductByUrl(products, productUrl);
        if (!p) {
          return res.status(404).json({ error: 'product not found' });
        }
        if (!Array.isArray(p.comments)) {
          p.comments = [];
        }
        p.comments.push({
          id: randomUUID(),
          text,
          author,
          at: new Date().toISOString(),
        });
        await saveProducts(products);
        return res.json(products);
      }

      if (body.action === 'delete-comment') {
        if (!hasBlob) {
          return res.status(503).json({
            error: 'BLOB_READ_WRITE_TOKEN is not set. Add a Vercel Blob store to the project, then run `vercel env pull` or put the token in .env.local. See .env.example.',
          });
        }
        const productUrl = body.url;
        const commentId = body.commentId;
        if (!productUrl || commentId == null || commentId === '') {
          return res.status(400).json({ error: 'url and commentId required' });
        }
        const idNeedle = String(commentId);
        const products = deepClone(await getProducts());
        const p = findProductByUrl(products, productUrl);
        if (!p || !Array.isArray(p.comments)) {
          return res.status(404).json({ error: 'not found' });
        }
        const next = p.comments.filter((c) => String(c.id) !== idNeedle);
        if (next.length === p.comments.length) {
          return res.status(404).json({ error: 'comment not found' });
        }
        p.comments = next;
        await saveProducts(products);
        return res.json(products);
      }

      if (!hasBlob) {
        return res.status(503).json({
          error: 'BLOB_READ_WRITE_TOKEN is not set. Add a Vercel Blob store to the project, then run `vercel env pull` or put the token in .env.local. See .env.example.',
        });
      }

      const { url, name, cat, store } = body;
      if (!url || !name || !cat) {
        return res.status(400).json({ error: 'url, name, cat required' });
      }

      let img = null;
      try {
        const html = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'es-ES,es;q=0.9',
          },
          signal: AbortSignal.timeout(10000),
        }).then(r => r.text());
        img = extractOgImage(html);
      } catch { /* img stays null */ }

      const products = await getProducts();
      products.push({ cat, name, store: store || storeFromUrl(url), img, url, comments: [] });
      await saveProducts(products);
      return res.json(products);
    }

    if (req.method === 'DELETE') {
      if (!hasBlob) {
        return res.status(503).json({
          error: 'BLOB_READ_WRITE_TOKEN is not set. Add a Vercel Blob store to the project, then run `vercel env pull` or put the token in .env.local. See .env.example.',
        });
      }
      // Body is often not parsed for DELETE; prefer query: DELETE /api/products?url=...
      const fromBody = (req.body && req.body.url) || undefined;
      const q = typeof req.query?.url === 'string' ? req.query.url : Array.isArray(req.query?.url) ? req.query.url[0] : undefined;
      const fromUrl = (req.url && new URL(req.url, 'http://local').searchParams.get('url')) || undefined;
      const targetUrl = fromBody || q || fromUrl;
      if (!targetUrl) {
        return res.status(400).json({ error: 'url required (use POST { action: "delete", url } or ?url=)' });
      }
      const products = await getProducts();
      const filtered = products.filter(p => p.url !== targetUrl);
      if (filtered.length === products.length) {
        return res.status(404).json({ error: 'not found' });
      }
      await saveProducts(filtered);
      return res.json(filtered);
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[api/products]', err);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
}
