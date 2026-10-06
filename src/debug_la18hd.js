// Diagnóstico la18hd: sin Puppeteer, sin curl. Se abre desde el navegador.
// Uso en src/index.js, justo antes de los otros app.get('/debug/...'):
//   require('./debug_la18hd')(app);
const fetch = require('node-fetch');
const { DEFAULT_HEADERS } = require('./http');
const { extractPlaybackUrls } = require('./extractors/canalesphp');

const MAIN = 'https://la18hd.su';
const H_FULL = { Referer: MAIN + '/', Origin: MAIN };

async function probe(url, headers, range) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], ...headers, ...(range ? { Range: range } : {}) },
      redirect: 'manual',
    });
    const buf = await r.buffer();
    return {
      status: r.status,
      contentType: r.headers.get('content-type'),
      cors: r.headers.get('access-control-allow-origin'),
      bytes: buf.length,
      firstByteHex: buf.length ? buf[0].toString(16) : null, // 47 = MPEG-TS válido
      body: (r.headers.get('content-type') || '').match(/mpegurl|text/i) || url.includes('.m3u8')
        ? buf.toString('utf8').slice(0, 2500) : undefined,
    };
  } catch (e) { return { error: e.message }; }
}

module.exports = (app) => {
  // JSON con todo lo que necesito ver
  app.get('/debug/la18hd', async (req, res) => {
    const stream = req.query.stream || 'espn';
    const pageUrl = `${MAIN}/vivo/canales.php?stream=${stream}`;
    const out = { pageUrl };
    try {
      const r = await fetch(pageUrl, { headers: { ...DEFAULT_HEADERS, Referer: pageUrl } });
      const html = await r.text();
      out.page = { status: r.status, length: html.length, html: html.slice(0, 4000) }; // HTML crudo (los 3 Kb)
      const urls = extractPlaybackUrls(html);
      const raw = html.match(/https?:[^"'\s\\]+\.m3u8[^"'\s\\]*/g) || [];
      out.extractedUrls = urls;
      out.rawM3u8InHtml = raw;
      const m3u8 = urls[0] || raw[0];
      if (m3u8) {
        out.m3u8Url = m3u8;
        out.m3u8_withReferer = await probe(m3u8, H_FULL);
        out.m3u8_noHeaders = await probe(m3u8, {});
        const body = out.m3u8_withReferer.body || '';
        const seg = body.split(/\r?\n/).find((l) => l && !l.startsWith('#'));
        if (seg) {
          const segUrl = new URL(seg, m3u8).toString();
          out.firstSegmentLine = seg;           // ¿trae ?token o es relativo sin token?
          out.segmentUrl = segUrl;
          out.seg_withReferer = await probe(segUrl, H_FULL, 'bytes=0-1023');
          out.seg_noHeaders = await probe(segUrl, {}, 'bytes=0-1023');
        }
      }
    } catch (e) { out.error = e.message; }
    res.json(out);
  });

  // Página que reproduce DESDE TU NAVEGADOR (tu IP, sin Referer de la18hd, con CORS real)
  app.get('/debug/la18hd-player', async (req, res) => {
    const stream = req.query.stream || 'espn';
    const u = req.query.url || '';
    res.send(`<!doctype html><meta charset=utf-8><body style="font-family:sans-serif">
<p>URL m3u8 (pega el <code>m3u8Url</code> de /debug/la18hd?stream=${stream}):</p>
<input id=u style="width:90%" value="${u.replace(/"/g, '&quot;')}"><button onclick=go()>Probar</button>
<pre id=log></pre><video id=v controls autoplay muted style="width:90%"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<script>
const log=t=>document.getElementById('log').textContent+=t+'\\n';
async function go(){
  const url=document.getElementById('u').value;
  try{const r=await fetch(url);log('fetch m3u8 desde navegador: '+r.status+' (CORS OK)');log((await r.text()).slice(0,600));}
  catch(e){log('fetch falló (CORS o IP/403): '+e.message);}
  const h=new Hls();h.on(Hls.Events.ERROR,(_,d)=>log('hls error: '+d.type+' '+d.details+' '+(d.response?d.response.code:'')));
  h.on(Hls.Events.FRAG_LOADED,()=>log('segmento cargado OK'));
  h.loadSource(url);h.attachMedia(document.getElementById('v'));
}
if(document.getElementById('u').value)go();
</script>`);
  });
};
