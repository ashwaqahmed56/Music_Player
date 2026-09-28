/* Rights Scanner — open-source infringement detection for music rights holders.
 *
 * Two independent, official, key-based detection layers (no scraping,
 * no stream extraction, no ToS circumvention):
 *
 *  1. YouTube Data API v3 (official, free key)
 *     - search.list  : find candidate uploads by title/artist query variants
 *     - videos.list  : duration, viewCount, publishedAt, channelId
 *     - channels.list: channel identity for allow/deny-listing
 *     Quota: search.list = 100 units, videos.list/channels.list = 1 unit.
 *     Default daily quota 10,000 -> ~100 searches/day. Results are cached in
 *     IndexedDB and reused, so repeated scans cost nothing.
 *
 *  2. ACRCloud Identification API (official, access_key + access_secret)
 *     - Sends a ~12s fingerprint sample of YOUR OWN master recording
 *     - Returns confirmed matches with score + the matched YouTube video id
 *     This is the industry-standard way to PROVE a match (not just title text).
 *
 * Legal/ethical notes:
 *  - Only the rights holder's own audio sample is uploaded, for identification.
 *  - No third-party audio is downloaded or streamed by this tool.
 *  - Output is an evidence report for the official takedown / Content ID flow.
 */
'use strict';
(function(){

const LS_KEYS = { yt:'ashs_rights_yt_key', ak:'ashs_rights_acr_key', as:'ashs_rights_acr_secret' };
const SCAN_CACHE_KEY = 'rights_scan_cache_v1';
const MAX_SCAN_CACHE = 400;

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toastR = m => { try{ toast(m); }catch(e){ console.warn(m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadKeys(){
  let o = { yt:'', ak:'', as:'' };
  try{
    o.yt  = localStorage.getItem(LS_KEYS.yt) || '';
    o.ak  = localStorage.getItem(LS_KEYS.ak) || '';
    o.as  = localStorage.getItem(LS_KEYS.as) || '';
  }catch(e){}
  return o;
}
function saveKeys(o){
  try{
    if(o.yt != null) o.yt ? localStorage.setItem(LS_KEYS.yt, o.yt) : localStorage.removeItem(LS_KEYS.yt);
    if(o.ak != null) o.ak ? localStorage.setItem(LS_KEYS.ak, o.ak) : localStorage.removeItem(LS_KEYS.ak);
    if(o.as != null) o.as ? localStorage.setItem(LS_KEYS.as, o.as) : localStorage.removeItem(LS_KEYS.as);
  }catch(e){}
}

/* ---------- scan cache (IndexedDB 'meta' store, same DB as the player) ---------- */
let cacheLoaded = false, scanCache = {};
async function loadScanCache(){
  if(cacheLoaded) return scanCache;
  try{
    const v = await metaGet(SCAN_CACHE_KEY);
    if(v && typeof v === 'object') scanCache = v;
  }catch(e){}
  cacheLoaded = true;
  return scanCache;
}
let cacheDirty = false;
async function persistScanCache(){
  if(!cacheDirty) return;
  cacheDirty = false;
  try{
    const keys = Object.keys(scanCache);
    if(keys.length > MAX_SCAN_CACHE){
      keys.sort((a,b)=> (scanCache[b]&&scanCache[b].at||0) - (scanCache[a]&&scanCache[a].at||0));
      for(const k of keys.slice(MAX_SCAN_CACHE)) delete scanCache[k];
    }
    await metaSet(SCAN_CACHE_KEY, scanCache);
  }catch(e){}
}

/* ---------- quota tracking ---------- */
let quota = { used:0, resetAt:0, limit:10000 };
try{ const q = JSON.parse(localStorage.getItem('ashs_rights_quota')||'{}'); if(q && q.used!=null) quota = Object.assign(quota, q); }catch(e){}
function quotaCost(units){ quota.used += (units|0); try{ localStorage.setItem('ashs_rights_quota', JSON.stringify(quota)); }catch(e){} }
function quotaLeft(){ return Math.max(0, quota.limit - quota.used); }
function quotaNote(){
  const left = quotaLeft();
  return 'Quota used: ' + quota.used + '/' + quota.limit + ' (≈' + left + ' left)';
}

/* ---------- 1. YouTube Data API v3 ---------- */
function ytApi(path, key, params){
  const u = new URL('https://www.googleapis.com/youtube/v3/' + path);
  u.searchParams.set('key', key);
  for(const k in params) if(params[k] != null) u.searchParams.set(k, params[k]);
  return fetch(u.toString()).then(async r => {
    const txt = await r.text();
    let j = {}; try{ j = txt ? JSON.parse(txt) : {}; }catch(e){}
    if(!r.ok){
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      const e = new Error(msg);
      e.apiStatus = r.status; e.apiBody = j;
      throw e;
    }
    return j;
  });
}
async function ytQuotaCheck(key){
  const j = await ytApi('youtube/v3/videos', key, { part:'snippet', id:'dQw4w9WgXcQ', maxResults:1 });
  if(j && j.items) quotaCost(1);
  return j;
}

/* build query variants to maximise recall for a title+artist */
function queryVariants(title, artist){
  const t = String(title||'').trim();
  const a = String(artist||'').trim();
  const v = new Set();
  if(t && a){ v.add(t + ' ' + a); v.add(a + ' - ' + t); v.add('"' + t + '" ' + a); }
  if(t){ v.add('"' + t + '"'); v.add(t + ' audio'); v.add(t + ' official audio'); }
  if(a){ v.add(a + ' audio'); }
  return [...v].slice(0, 6);
}
const norm = s => String(s||'').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/official|lyric|lyrics|video|audio|hd|hq|remaster(ed)?|official video|official audio|mv|visualizer|4k|1080p|lyric video/gi, ' ')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

const RISK_WORDS = [
  { re:/\b(mp3|320kbps|flac|ape|m4a)\b/i, w:18, tag:'rip-format' },
  { re:/\b(free\s*download|download\s*now|mp3\s*download|full\s*album|complete\s*album)\b/i, w:22, tag:'download-pitch' },
  { re:/\b(1080p|720p|4k|hd|hi-?fi)\b/i, w:10, tag:'download-quality' },
  { re:/\b(cover|karaoke|instrumental|remix|sped\s*up|slowed|reverb|8d)\b/i, w:14, tag:'derivative' },
  { re:/\b(tamil\s*dubbed|hindi\s*dubbed|dubbed\s*in\s*\w+|translated\s*version)\b/i, w:20, tag:'dubbed-rip' },
  { re:/\b(ringtone|mobile\s*ring|status)\b/i, w:16, tag:'ringtone-rip' },
  { re:/\b(1\s*hour|non\s*stop|continuous)\b/i, w:12, tag:'longform-rip' },
  { re:/\b(lyric\s*video|with\s*lyrics)\b/i, w:6, tag:'lyric-upload' }
];
const OFFICIAL_HINTS = /\b(official|vevo|records|music|topic|topicsofsoundsyt|automatic-?official)\b/i;

function scoreCandidate(c, ctx){
  let score = 0; const tags = [];
  const titleN = norm(c.title), refN = norm(ctx.title);
  if(refN && titleN){
    if(titleN === refN){ score += 45; tags.push('exact-title'); }
    else if(titleN.includes(refN) || refN.includes(titleN)){ score += 32; tags.push('title-match'); }
    else{
      const a = new Set(titleN.split(' ').filter(Boolean));
      const b = new Set(refN.split(' ').filter(Boolean));
      let inter = 0; b.forEach(x=>{ if(a.has(x)) inter++; });
      const j = b.size ? inter / b.size : 0;
      if(j >= 0.8){ score += 24; tags.push('title~' + Math.round(j*100) + '%'); }
      else if(j >= 0.5){ score += 12; tags.push('title~' + Math.round(j*100) + '%'); }
      else score -= 8;
    }
  }
  if(ctx.artist){
    const artN = norm(ctx.artist);
    if(artN && titleN.includes(artN)){ score += 18; tags.push('artist-in-title'); }
    else if(artN && norm(c.channelTitle).includes(artN)){ score += 10; tags.push('artist-in-channel'); }
  }
  for(const r of RISK_WORDS) if(r.re.test(c.title)){ score += r.w; tags.push(r.tag); }
  if(OFFICIAL_HINTS.test(c.channelTitle) || OFFICIAL_HINTS.test(c.title)){ score -= 40; tags.push('looks-official'); }
  if(c.offical) score -= 20;
  if(c.embeddable === false){ score += 6; tags.push('no-embed'); }
  const dur = parseISODur(c.duration);
  if(dur){
    if(ctx.duration){
      const diff = Math.abs(dur - ctx.duration) / Math.max(1, ctx.duration);
      if(diff < 0.05){ score += 30; tags.push('duration-exact'); }
      else if(diff < 0.12){ score += 16; tags.push('duration-close'); }
      else if(diff > 0.5){ score -= 10; tags.push('duration-mismatch'); }
    }
    if(dur < 45 && ctx.duration && ctx.duration > 120){ score += 12; tags.push('clip'); }
  }
  const v = parseNum(c.viewCount);
  if(v > 0){
    score += Math.min(18, Math.round(Math.log10(v + 1) * 4));
    tags.push('views:' + fmtNum(v));
  }
  if(c.publishedAt){
    const days = (Date.now() - Date.parse(c.publishedAt)) / 86400000;
    if(days < 30){ score += 10; tags.push('new-upload'); }
    else if(days < 180) score += 4;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tags };
}
function parseISODur(iso){
  if(!iso) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if(!m) return 0;
  return (+(m[1]||0))*86400 + (+(m[2]||0))*3600 + (+(m[3]||0))*60 + (+(m[4]||0));
}
function parseNum(s){
  if(s==null) return 0;
  if(typeof s === 'number') return s;
  s = String(s).trim();
  let mult = 1;
  if(/[kmb]$/i.test(s)){ const m=/([kmb])$/i.exec(s)[1].toLowerCase(); mult = m==='k'?1e3:m==='m'?1e6:1e9; s = s.slice(0,-1); }
  const n = parseInt(s.replace(/[^0-9]/g,''), 10);
  return isFinite(n) ? n * mult : 0;
}
const fmtNum = n => n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1e3 ? (n/1e3).toFixed(1)+'K' : String(n);

/* ---------- 2. ACRCloud fingerprint identification ---------- */
async function acrcloudIdentifyBlob(blob, ak, as){
  const host = 'identify-eu-west-1.acrcloud.com';
  const path = '/v1/identify';
  const ts = Math.floor(Date.now()/1000).toString();
  const dataType = 'audio';
  const sigVer = '1';
  const str2sign = ['POST', path, ak, dataType, sigVer, ts].join('\n');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(as), { name:'HMAC', hash:'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(str2sign));
  let bin = ''; const b8 = new Uint8Array(mac);
  for(let i=0;i<b8.length;i++) bin += String.fromCharCode(b8[i]);
  const signature = btoa(bin);
  const fd = new FormData();
  fd.append('sample', blob, 'sample.mp3');
  const url = 'https://' + host + path + '?access_key=' + encodeURIComponent(ak)
    + '&data_type=' + dataType + '&signature_version=' + sigVer
    + '&timestamp=' + ts + '&signature=' + encodeURIComponent(signature);
  const r = await fetch(url, { method:'POST', body: fd });
  if(!r.ok) throw new Error('ACRCloud HTTP ' + r.status);
  const j = await r.json();
  return j;
}
/* pull a ~12s fingerprint-friendly sample from a local audio file (client-side only) */
async function makeSample(blob, seconds){
  seconds = seconds || 12;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return blob;
  const ac = new AC();
  try{
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const sr = buf.sampleRate;
    const len = Math.min(buf.length, Math.floor(sr * seconds));
    const off = Math.max(0, Math.floor(buf.length * 0.25)); // skip intro silence
    const take = Math.min(len, Math.max(0, buf.length - off));
    const mono = new Float32Array(take);
    const ch = buf.numberOfChannels;
    for(let c=0;c<ch;c++){ const d = buf.getChannelData(c); for(let i=0;i<take;i++) mono[i] += d[off+i]; }
    for(let i=0;i<take;i++) mono[i] /= ch;
    return encodeWav(mono, sr);
  } finally { try{ ac.close(); }catch(e){} }
}
function encodeWav(samples, sr){
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n*2);
  const v = new DataView(buf);
  const str = (o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); };
  str(0,'RIFF'); v.setUint32(4, 36+n*2, true); str(8,'WAVE'); str(12,'fmt ');
  v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  str(36,'data'); v.setUint32(40, n*2, true);
  for(let i=0;i<n;i++){
    let x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i*2, x < 0 ? x*0x8000 : x*0x7FFF, true);
  }
  return new Blob([buf], { type:'audio/wav' });
}

/* ---------- scan orchestration ---------- */
let scanning = false, lastReport = null;
function setScanStatus(m, cls){
  const el = $('#scanStatus'); if(!el) return;
  el.textContent = m || '';
  el.className = 'muted' + (cls ? ' ' + cls : '');
}
function ctxFromInputs(){
  const artist = ($('#scanArtist') && $('#scanArtist').value || '').trim();
  const title  = ($('#scanTitle')  && $('#scanTitle').value  || '').trim();
  const durS   = parseInt(($('#scanDur') && $('#scanDur').value) || '0', 10);
  return { artist, title, duration: isFinite(durS) && durS>0 ? durS : 0 };
}
function cacheKeyFor(ctx){
  return 'yt:' + norm(ctx.title) + '|' + norm(ctx.artist) + '|' + (ctx.duration||0);
}
async function searchYouTube(ctx, key){
  const ck = cacheKeyFor(ctx);
  const cache = await loadScanCache();
  if(cache[ck] && Date.now() - cache[ck].at < 7*24*3600*1000){
    return { items: cache[ck].items, fromCache: true, queries: cache[ck].queries };
  }
  const queries = queryVariants(ctx.title, ctx.artist);
  const byId = new Map();
  for(const q of queries){
    if(quotaLeft() < 120){ setScanStatus('Daily quota low — stopping early (results so far kept)'); break; }
    let j;
    try{
      j = await ytApi('search/list', key, { part:'snippet', q, type:'video', videoEmbeddable:'true', maxResults:50, relevanceLanguage:'en' });
      quotaCost(100);
    }catch(e){
      if(e.apiStatus === 403 || /quota|API key/i.test(e.message || '')){
        const err = new Error('YouTube API: ' + (e.message||'quota/key error'));
        err.fatal = true; throw err;
      }
      continue;
    }
    const items = (j.items || []).map(it => ({
      videoId: it.id && it.id.videoId,
      title: (it.snippet && it.snippet.title) || '',
      channelTitle: (it.snippet && it.snippet.channelTitle) || '',
      channelId: (it.snippet && it.snippet.channelId) || '',
      publishedAt: (it.snippet && it.snippet.publishedAt) || '',
      thumb: (it.snippet && it.snippet.thumbnails && it.snippet.thumbnails.medium) ? it.snippet.thumbnails.medium.url : ''
    })).filter(x => x.videoId);
    items.forEach(x => { if(!byId.has(x.videoId)) byId.set(x.videoId, x); });
    setScanStatus('Searching… ' + byId.size + ' unique candidates (' + queries.indexOf(q)+1 + '/' + queries.length + ')');
    await sleep(120);
  }
  const ids = [...byId.keys()].slice(0, 50);
  if(ids.length && quotaLeft() >= 2){
    try{
      const v = await ytApi('videos/list', key, { part:'contentDetails,statistics,snippet,status', id: ids.join(','), maxResults:50 });
      quotaCost(1);
      (v.items || []).forEach(x => {
        const c = byId.get(x.id); if(!c) return;
        c.duration = x.contentDetails && x.contentDetails.duration;
        c.viewCount = x.statistics && x.statistics.viewCount;
        c.likeCount = x.statistics && x.statistics.likeCount;
        c.embeddable = !!(x.status && x.status.embeddable);
        c.offical = !!(x.status && x.status.madeForKids === undefined && false);
      });
    }catch(e){ /* keep snippet-only data */ }
  }
  const items = [...byId.values()];
  cache[ck] = { at: Date.now(), items, queries };
  cacheDirty = true;
  persistScanCache();
  return { items, fromCache:false, queries };
}

/* ---------- UI rendering ---------- */
function renderCandidates(list, ctx){
  const el = $('#scanResults'); if(!el) return;
  el.innerHTML = '';
  if(!list.length){ el.innerHTML = '<p class="muted center">No candidates found.</p>'; return; }
  const hdr = document.createElement('div');
  hdr.className = 'row-head';
  hdr.innerHTML = '<h2>Candidates (' + list.length + ')</h2><button id="expCsv" class="link">Export report</button>';
  el.appendChild(hdr);
  list.slice(0, 120).forEach(c => {
    const d = document.createElement('div');
    d.className = 'track';
    const lvl = c.score >= 70 ? 'var(--acc)' : c.score >= 40 ? '#e0a33a' : 'var(--muted)';
    d.innerHTML =
      (c.thumb ? '<div class="t-art"><img src="' + esc2(c.thumb) + '" alt="" loading="lazy"/></div>'
               : '<div class="t-art" style="background:hsl(' + ((hashHueR(c.title)) ) + ' 26% 42%)">' + esc2((c.title||'?').charAt(0).toUpperCase()) + '</div>') +
      '<div class="t-meta"><b>' + esc2(c.title) + '</b><span>' + esc2(c.channelTitle || 'unknown channel')
      + (c.duration ? ' · ' + fmtDurR(parseISODur(c.duration)) : '')
      + (c.viewCount ? ' · ' + fmtNum(parseNum(c.viewCount)) + ' views' : '')
      + (c.publishedAt ? ' · ' + String(c.publishedAt).slice(0,10) : '') + '</span>'
      + '<span class="scan-tags">' + (c.tags || []).slice(0,5).map(t => '<em>' + esc2(t) + '</em>').join('') + '</span></div>'
      + '<span class="scan-score" style="color:' + lvl + '">' + c.score + '</span>';
    d.onclick = ()=>{ try{ window.open('https://www.youtube.com/watch?v=' + c.videoId, '_blank', 'noopener'); }catch(e){} };
    el.appendChild(d);
  });
}
function hashHueR(s){ let h=0; s=String(s||'?'); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))%360; return h; }
function fmtDurR(s){ s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

function renderFingerprint(fp){
  const el = $('#scanFp'); if(!el) return;
  el.innerHTML = '';
  if(!fp){ return; }
  if(fp.error){
    el.innerHTML = '<p class="muted" style="font-size:13px">Fingerprint: ' + esc2(fp.error) + '</p>';
    return;
  }
  const h = document.createElement('h3'); h.textContent = 'Fingerprint results'; el.appendChild(h);
  const m = fp.match;
  if(!m){
    const p = document.createElement('p'); p.className='muted'; p.textContent = 'No match found in the ACRCloud database.'; el.appendChild(p);
    return;
  }
  const score = Math.round(m.score || 0);
  const d = document.createElement('div'); d.className = 'track';
  d.innerHTML = '<div class="t-meta"><b>Confirmed match · score ' + score + '</b><span>'
    + esc2((m.title||'')) + (m.artists ? ' — ' + esc2(m.artists.map(a=>a.name||'').join(', ')) : '')
    + (m.album ? ' · ' + esc2(m.album) : '')
    + (m.isrc && m.isrc.length ? ' · ISRC ' + esc2(m.isrc[0]) : '') + '</span></div>';
  el.appendChild(d);
  (m.youtube || []).forEach(y => {
    const r = document.createElement('div'); r.className = 'track';
    r.innerHTML = '<div class="t-meta"><b>YouTube match</b><span>video ' + esc2(y.vid) + ' · ' + Math.round(y.score||score) + '%</span></div>';
    r.onclick = ()=>{ try{ window.open('https://www.youtube.com/watch?v=' + y.vid, '_blank', 'noopener'); }catch(e){} };
    el.appendChild(r);
  });
  (m.song || []).forEach(s => {
    const r = document.createElement('div'); r.className = 'track';
    r.innerHTML = '<div class="t-meta"><b>' + esc2(s.title || s.song || 'match') + '</b><span>type ' + esc2(s.type||'?') + ' · ' + Math.round(s.score||0) + '%</span></div>';
    el.appendChild(r);
  });
}

function buildReport(ctx, list, fp, meta){
  return {
    generatedAt: new Date().toISOString(),
    subject: { artist: ctx.artist || null, title: ctx.title || null, durationSec: ctx.duration || null },
    method: ['youtube-data-api-v3 metadata sweep', fp && fp.match ? 'acrcloud fingerprint match' : null].filter(Boolean),
    fingerprint: fp ? { matched: !!fp.match, score: fp.match ? Math.round(fp.match.score||0) : null, meta: fp.match || null, error: fp.error || null } : null,
    youtubeApi: { candidates: list.length, fromCache: !!meta.fromCache, queries: meta.queries || null },
    candidates: list.map(c => ({
      score: c.score, tags: c.tags, videoId: c.videoId, url: 'https://www.youtube.com/watch?v=' + c.videoId,
      title: c.title, channelTitle: c.channelTitle, channelId: c.channelId,
      publishedAt: c.publishedAt, duration: c.duration, viewCount: c.viewCount, embeddable: c.embeddable
    }))
  };
}
function download(name, text, type){
  try{
    const b = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  }catch(e){ toastR('Export failed'); }
}
function toCSV(rep){
  const q = v => '"' + String(v==null?'':v).replace(/"/g,'""') + '"';
  const head = ['score','tags','videoId','url','title','channelTitle','channelId','publishedAt','duration','viewCount'];
  const rows = rep.candidates.map(c => [c.score, (c.tags||[]).join('|'), c.videoId, c.url, c.title, c.channelTitle, c.channelId, c.publishedAt, c.duration, c.viewCount].map(q).join(','));
  return [head.map(q).join(','), ...rows].join('\n');
}

async function runScan(){
  if(scanning) return;
  const keys = loadKeys();
  const ctx = ctxFromInputs();
  if(!ctx.title){ setScanStatus('Enter a track title to scan'); toastR('Track title required'); return; }
  if(!keys.yt){ setScanStatus('Add your YouTube Data API key in Settings first'); toastR('YouTube API key needed'); return; }
  if(!navigator.onLine){ setScanStatus('Offline — scanning needs internet'); return; }
  scanning = true;
  const btn = $('#scanGo'); if(btn) btn.disabled = true;
  const fpBox = $('#scanFp'); if(fpBox) fpBox.innerHTML = '';
  let fp = null, list = [], meta = {};
  try{
    setScanStatus('Searching YouTube (official API)…');
    const r = await searchYouTube(ctx, keys.yt);
    meta = r;
    const scored = r.items.map(c => { const s = scoreCandidate(c, ctx); return Object.assign({}, c, s); })
      .sort((a,b)=> b.score - a.score);
    list = scored;
    renderCandidates(list, ctx);
    setScanStatus((r.fromCache ? 'Loaded from cache · ' : '') + list.length + ' candidates · ' + quotaNote());

    const file = $('#scanFile') && $('#scanFile').files && $('#scanFile').files[0];
    if(file && keys.ak && keys.as){
      setScanStatus('Fingerprinting your sample (ACRCloud)…');
      try{
        if(file.size > 5*1024*1024) toastR('Sample must be under 5 MB');
        const sample = await makeSample(file, 12);
        const r2 = await acrcloudIdentifyBlob(sample, keys.ak, keys.as);
        fp = { match: (r2.results && r2.results[0]) || null, raw: r2 };
        if(fp.match){
          // merge confirmed matches into the ranked list
          (fp.match.youtube || []).forEach(y => {
            if(list.some(c => c.videoId === y.vid)) return;
            list.push({ videoId: y.vid, title: (fp.match.title||'') , channelTitle:'fingerprint match', score: Math.round(y.score||fp.match.score||90), tags:['fingerprint-confirmed'], thumb:'', publishedAt:'', duration:'' });
          });
          list.sort((a,b)=> b.score - a.score);
          renderCandidates(list, ctx);
        }
      }catch(e){ fp = { error: String((e && e.message) || e) }; }
      renderFingerprint(fp);
    } else if(file && !(keys.ak && keys.as)){
      setScanStatus('Added ACRCloud access key + secret in Settings for fingerprint confirmation');
    }

    lastReport = buildReport(ctx, list, fp, meta);
    setScanStatus('Done · ' + list.length + ' candidates · ' + quotaNote()
      + (list.filter(c=>c.score>=40).length ? ' · ' + list.filter(c=>c.score>=40).length + ' flagged' : ''));
  }catch(e){
    reportError && reportError('scan: ' + ((e && e.message) || e));
    setScanStatus('Scan failed: ' + ((e && e.message) || e));
    toastR('Scan failed — check key & quota');
  }finally{
    scanning = false;
    if(btn) btn.disabled = false;
    persistScanCache();
  }
}

/* ---------- settings integration ---------- */
async function openRightsSettings(){
  const k = loadKeys();
  sheet('<h2>Rights Scanner keys</h2>'
    + '<p class="muted" style="font-size:12.5px">Official APIs. Free tiers. Keys stay on this device only.</p>'
    + '<h3>YouTube Data API v3</h3>'
    + '<input type="text" id="rYt" placeholder="AIza… API key" value="' + esc2(k.yt) + '"/>'
    + '<p class="muted" style="font-size:12px">Google Cloud Console → enable “YouTube Data API v3” → Credentials → API key. Free, 10,000 units/day (search = 100 units).</p>'
    + '<h3>ACRCloud (optional, proves a match)</h3>'
    + '<input type="text" id="rAk" placeholder="access_key" value="' + esc2(k.ak) + '"/>'
    + '<input type="text" id="rAs" placeholder="access_secret" value="' + esc2(k.as) + '"/>'
    + '<p class="muted" style="font-size:12px">Uploads a 12s sample of your own master to confirm the match (score + matched video id). Free trial.</p>'
    + '<p class="muted" id="rQuota" style="font-size:12px">' + esc2(quotaNote()) + '</p>'
    + '<button class="opt" id="rSave">Save keys</button>'
    + '<button class="opt" id="rTest">Test YouTube key</button>'
    + '<button class="opt" id="rWipe">Clear cached scans</button>'
    + '<button class="opt danger" id="rClr">Remove all keys</button>'
    + '<button class="opt" id="rX">Close</button>');
  $('#rX').onclick = closeSheet;
  $('#rSave').onclick = ()=>{
    saveKeys({ yt: $('#rYt').value.trim(), ak: $('#rAk').value.trim(), as: $('#rAs').value.trim() });
    toastR('Keys saved on this device');
    openRightsSettings();
  };
  $('#rTest').onclick = async ()=>{
    const key = $('#rYt').value.trim();
    if(!key) return toastR('Paste a key first');
    const el = $('#rQuota'); if(el) el.textContent = 'Testing…';
    try{ await ytQuotaCheck(key); if(el) el.textContent = 'Key works · ' + quotaNote(); toastR('YouTube API key works'); }
    catch(e){ if(el) el.textContent = 'Failed: ' + ((e && e.message) || e); toastR('Key test failed'); }
  };
  $('#rWipe').onclick = async ()=>{
    await loadScanCache();
    scanCache = {}; cacheDirty = true; await persistScanCache();
    toastR('Scan cache cleared'); openRightsSettings();
  };
  $('#rClr').onclick = ()=>{ saveKeys({ yt:'', ak:'', as:'' }); toastR('All keys removed'); openRightsSettings(); };
}

function bindRights(){
  const go = $('#scanGo'); if(go) go.onclick = runScan;
  const k = $('#scanKeys'); if(k) k.onclick = openRightsSettings;
  const ex = $('#scanExport'); if(ex) ex.onclick = ()=>{
    if(!lastReport) return toastR('Run a scan first');
    download('rights-report-' + Date.now() + '.json', JSON.stringify(lastReport, null, 2), 'application/json');
  };
  const csv = $('#scanCsv'); if(csv) csv.onclick = ()=>{
    if(!lastReport) return toastR('Run a scan first');
    download('rights-report-' + Date.now() + '.csv', toCSV(lastReport), 'text/csv');
  };
  const file = $('#scanFile'); if(file) file.onchange = ()=>{
    const f = file.files && file.files[0];
    const lb = $('#scanFileName');
    if(lb) lb.textContent = f ? (f.name + ' · ' + (f.size/1048576).toFixed(1) + ' MB') : '';
  };
  const st = $('#scanStatus'); if(st && !st.textContent) st.textContent = quotaNote();
  try{ if(window.TAB_ORDER && TAB_ORDER.indexOf('rights') < 0) TAB_ORDER.splice(3, 0, 'rights'); }catch(e){}
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindRights);
else bindRights();

window.ASHS_RIGHTS = { run: runScan, settings: openRightsSettings, quota(){ return Object.assign({}, quota); } };
})();
