/**
 * Fetches og:image from each product URL and outputs a JSON map.
 * Run: node fetch-og.mjs
 */
import { execFile } from 'child_process';

const ITEMS = [
  { name:"Sofá Sierra 4 Plazas",          url:"https://www.habitat.net/es/p/sofa-de-4-plazas-de-tela-sierra-terracota" },
  { name:"Sofá Cama PAOLY Pana",           url:"https://www.sklum.com/es/comprar-sofa-cama/226575-sofa-cama-de-2-plazas-en-pana-envasado-al-vacio-paoly.html" },
  { name:"4× Sillas ANELA",               url:"https://northdeco.com/collections/sillas-de-diseno/products/silla-comedor-anela?variant=55253067694466" },
  { name:"Folk Pouf Tall & Wide Bundle",  url:"https://noo.ma/fr/collections/furniture/products/folk-tall-wide-bundle?variant=32766289248336" },
  { name:"Mesa GALA Roble",               url:"https://northdeco.com/products/mesa-de-comedor-redonda-extensible-gala?variant=46829938966865" },
  { name:"Mesa GALA Nogal",               url:"https://northdeco.com/products/mesa-de-comedor-redonda-extensible-gala-walnut-120-150-cm?pr_prod_strat=e5_desc&pr_rec_id=0d2d94c6d&pr_rec_pid=8857698173265&pr_ref_pid=8645350261073&pr_seq=uniform&variant=47675040039249" },
  { name:"Mueble TV ALTREX Acacia/Inox",  url:"https://www.sklum.com/es/comprar-muebles-tv/222200-mueble-tv-en-madera-de-acacia-y-acero-inoxidable-altrex.html?id_c=664775" },
  { name:"Mueble TV ALAZNE MDF",          url:"https://www.sklum.com/es/comprar-muebles-tv/175312-mueble-tv-180x40-cm-en-mdf-alazne.html?id_c=419152" },
  { name:"Mueble TV MICHIGAN Acero",      url:"https://www.sklum.com/es/comprar-muebles-tv/186426-mueble-tv-180x40-cm-en-acero-michigan.html?id_c=497544" },
  { name:"Mueble TV LUENA Inoxidable",    url:"https://www.sklum.com/es/comprar-muebles-tv/227829-mueble-tv-180x40-cm-en-acero-inoxidable-luena.html" },
  { name:"Mesa Centro CORINA Nogal",      url:"https://northdeco.com/products/mesa-de-centro-corina-110-x-55-cm?variant=42101022621875" },
  { name:"2× Mesas Auxiliares ANDE",      url:"https://noo.ma/fr/collections/furniture/products/2x-ande-side-table?variant=40443080802475" },
  { name:"Mesa Auxiliar SAURA Azul",      url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-saura?variant=55608925127042" },
  { name:"Mesa Auxiliar SAURA Transparente",url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-saura?variant=54881572979074" },
  { name:"Mesita RILO Azul",              url:"https://northdeco.com/collections/outlet/products/mesita-auxiliar-rilo-37x46-cm?variant=55081732964738" },
  { name:"Mesita RILO Negra",             url:"https://northdeco.com/collections/outlet/products/mesita-auxiliar-rilo-37x46-cm?variant=49829988270417" },
  { name:"Mesa BONET Metal/Cristal",      url:"https://northdeco.com/collections/mesas-auxiliares/products/mesa-auxiliar-de-metal-y-cristal-bonet?variant=56320834601346" },
  { name:"Mesa JOHANNA Cubo Cristal",     url:"https://northdeco.com/collections/outlet/products/mesa-de-cristal-cuadrada-johanna-40x40-cm?variant=49063256392017" },
  { name:"Banco RIOLUT Ratán/Madera",     url:"https://www.sklum.com/es/comprar-bancos/92041-banco-en-ratan-y-madera-riolut.html" },
  { name:"Banco KARVIA Tela/Acacia",      url:"https://www.sklum.com/es/comprar-bancos/200118-banco-180-cm-en-madera-de-acacia-y-tela-karvia.html?id_c=577295" },
  { name:"Banco DUBAI Acacia",            url:"https://www.sklum.com/es/comprar-bancos/211180-banco-en-madera-de-acacia-dubai.html?id_c=588466" },
  { name:"Banco Zapatero BRUCK",          url:"https://www.themasie.com/es/comprar-zapateros/130652-banco-zapatero-con-almacenaje-de-acero-laminado-bruck-.html" },
  { name:"Vestidor KRAUFORD Bambú",       url:"https://www.sklum.com/es/comprar-armarios/100305-vestidor-abierto-en-madera-de-bambu-krauford.html" },
  { name:"Armario JANINE Acero",          url:"https://www.sklum.com/es/comprar-armarios/186380-armario-abierto-con-cajones-en-acero-janine.html" },
  { name:"2× Estructura ELLINGE 150×190", url:"https://jysk.es/dormitorio/camas/canapes-somieres-y-estructuras-de-cama/estructuras-de-cama/estructura-cama-ellinge-150x190-almacenaje-roble-calido" },
  { name:"Escritorio FLEXISPOT Elevable", url:"https://www.amazon.es/dp/B0DMNY2MF4" },
  { name:"Alfombra COME Crudo",           url:"https://www.habitat.net/es/p/alfombra-de-lana-come-crudo" },
];

/** Fetch the first 200 KB of a URL via curl (handles gzip/br natively). */
function fetchHtml(url) {
  return new Promise((resolve) => {
    execFile('curl', [
      '-sL',                   // silent + follow redirects
      '--max-time', '10',
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml',
      '-H', 'Accept-Language: es-ES,es;q=0.9',
      '-H', 'Range: bytes=0-204799',
      '--compressed',
      url,
    ], { maxBuffer: 512 * 1024 }, (err, stdout) => {
      // curl exits non-zero for partial content (206) – stdout still has the data
      resolve(stdout || '');
    });
  });
}

/** Extract og:image (or twitter:image as fallback) from raw HTML. */
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

/** Main: fetch all items concurrently in batches of 6. */
async function main() {
  const results = {};
  const BATCH = 6;

  for (let i = 0; i < ITEMS.length; i += BATCH) {
    const batch = ITEMS.slice(i, i + BATCH);
    await Promise.all(batch.map(async (item) => {
      process.stderr.write(`  fetching ${item.name}…\n`);
      const html = await fetchHtml(item.url);
      const img  = extractOgImage(html);
      results[item.url] = img || null;
      process.stderr.write(`  ${img ? '✓' : '✗'} ${item.name}${img ? '' : ' (no image)'}\n`);
    }));
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
