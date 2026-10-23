'use strict';
const APP_VERSION='5.3';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
/* Cached getElementById — the progress tick runs several times a second
   and querySelector-by-id on every paint was the top jank source. */
const _elCache={};
const E=(id)=>_elCache[id]||(_elCache[id]=document.getElementById(id));
const LS_KEY = 'nova_player_v1';

const DEMO = [
  { id:'demo1', title:'Midnight Drive', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', source:'demo', duration:372, hue:190 },
  { id:'demo2', title:'Ocean Waves', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', source:'demo', duration:425, hue:265 },
  { id:'demo3', title:'Neon Nights', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', source:'demo', duration:449, hue:300 },
  { id:'demo4', title:'Sunset Blvd', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', source:'demo', duration:362, hue:20 },
  { id:'demo5', title:'Electric Love', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', source:'demo', duration:304, hue:330 },
  { id:'demo6', title:'Starlight', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', source:'demo', duration:396, hue:210 },
  { id:'demo7', title:'Green Fields', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', source:'demo', duration:402, hue:140 },
  { id:'demo8', title:'Purple Rain', artist:'SoundHelix', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', source:'demo', duration:367, hue:275 },
  { id:'demo9', title:'Golden Hour', artist:'T. Schürger', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', source:'demo', duration:390, hue:45 },
  { id:'demo10', title:'Night City', artist:'T. Schürger', album:'Demo', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', source:'demo', duration:359, hue:0 },
];
const EQ_BANDS = [{f:60,l:'Bass'},{f:230,l:'Low'},{f:910,l:'Mid'},{f:3600,l:'High'},{f:14000,l:'Air'}];
const EQ_PRESETS = { 'Normal':[0,0,0,0,0], 'Pop':[-1,2,4,2,-1], 'Rock':[4,3,-1,3,4], 'Jazz':[3,2,0,2,3], 'Bass Boost':[7,5,2,0,0], 'Vocal':[-2,1,4,3,1] };

function defStore(){ return {
  likes:[], playlists:[], pfolders:[], folders:[], recents:[], playCounts:{}, addedAt:{}, lyrics:{},
  volumes:{vol:100}, prefs:{shuffle:false, repeat:'off', speed:1, autoplay:true, theme:'system', accent:'clay', songSort:'az', newSort:'new', notif:true},
  eq:{enabled:false, gains:[0,0,0,0,0], preset:'Normal'},
  localMeta:{}, customTitles:{}, hiddenTracks:[], currentId:null, radio:false
};}
function sanitizeStore(d){
  const f=defStore(); if(!d||typeof d!=='object'||Array.isArray(d)) return f;
  const s=Object.assign(f,d), def=defStore();
  ['prefs','volumes','eq'].forEach(k=>{ s[k]=Object.assign({},def[k],(d[k]&&typeof d[k]==='object')?d[k]:{}); });
  ['likes','recents','hiddenTracks'].forEach(k=>{ s[k]=Array.isArray(s[k])?s[k].filter(x=>typeof x==='string'):[]; });
  ['playCounts','addedAt','lyrics','localMeta','customTitles'].forEach(k=>{ const v=s[k]; s[k]=(v&&typeof v==='object'&&!Array.isArray(v))?v:{}; });
  if(!(s.synced&&typeof s.synced==='object'&&!Array.isArray(s.synced))) delete s.synced;
  if(!Array.isArray(s.eq.gains)||s.eq.gains.length!==5) s.eq.gains=[0,0,0,0,0];
  s.eq.gains=s.eq.gains.map(g=>Math.max(-12,Math.min(12,+g||0)));
  const cleanCol=x=>x&&typeof x==='object'&&x.id!=null&&typeof x.name==='string'&&Array.isArray(x.trackIds)
    ? Object.assign({},x,{id:String(x.id),name:x.name.slice(0,120),trackIds:x.trackIds.filter(t=>typeof t==='string')}) : null;
  s.playlists=(Array.isArray(s.playlists)?s.playlists:[]).map(cleanCol).filter(Boolean);
  s.folders=(Array.isArray(s.folders)?s.folders:[]).map(cleanCol).filter(Boolean);
  s.pfolders=(Array.isArray(s.pfolders)?s.pfolders:[]).map(x=>{
    if(!x||typeof x!=='object'||x.id==null||typeof x.name!=='string') return null;
    const o=Object.assign({},x,{id:String(x.id),name:String(x.name).slice(0,120)});
    o.childIds=(Array.isArray(o.childIds)?o.childIds:[]).filter(c=>/^(pl_|pf_)/.test(String(c))).map(String);
    const seen=new Set(); o.childIds=o.childIds.filter(c=>{ if(seen.has(c)) return false; seen.add(c); return true; });
    if(o.pin) o.pin=1;
    return o;
  }).filter(Boolean);
  /* A playlist/folder may live in at most one folder — drop later duplicates. */
  { const owned=new Set();
    s.pfolders.forEach(f=>{ const keep=[];
      (f.childIds||[]).forEach(c=>{ const key=c.startsWith('pf_')?'f:'+c:'p:'+c;
        if(owned.has(key)) return; owned.add(key); keep.push(c); });
      f.childIds=keep; }); }
  s.volumes.vol=Math.max(0,Math.min(100,+s.volumes.vol));
  if(!isFinite(s.volumes.vol)) s.volumes.vol=100;
  s.prefs.speed=Math.max(0.5,Math.min(2,+s.prefs.speed||1));
  if(!['off','all','one'].includes(s.prefs.repeat)) s.prefs.repeat='off';
  return s;
}
let store = (()=>{ try{ const r=localStorage.getItem(LS_KEY); if(r) return sanitizeStore(JSON.parse(r)); }catch(e){} return defStore(); })();
let _saveWarned=false;
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch(e){
  if(!_saveWarned){ _saveWarned=true; try{ toast('Storage is full — export a backup and remove some synced lyrics'); }catch(_){} } } }

let localTracks = [], deviceTracks = [], cache = [];
let coverCache = {}, coversLoaded = false, coverQueue = [], coverRunning = false, coverDirty = 0, coverToastShown = false;
function hashHue(name){ let h=0; const s=String(name||'?'); for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))%360; } return h; }
function rebuild(){
  const base = (localTracks.length||deviceTracks.length) ? [] : DEMO.map(d=>({...d}));
  const hid=store.hiddenTracks||[];
  cache = [...localTracks, ...deviceTracks.filter(t=>!hid.includes(t.id)), ...base];
  cache.forEach(t=>{
    const c=store.customTitles[t.id]; if(c){ t.title=c.title||t.title; t.artist=c.artist||t.artist; if(c.album!=null) t.album=c.album; }
    const m=store.localMeta[t.id];
    if(m?.duration) t.duration = m.duration;
    if(!t.coverUrl&&coverCache[t.id]) t.coverUrl = coverCache[t.id];
    if(t.hue==null) t.hue = hashHue(t.title+t.artist);
  });
}

function deviceSrc(uri){
  try{ const C=window.Capacitor; if(C&&C.convertFileSrc) return C.convertFileSrc(uri); }catch(e){}
  return uri;
}
function cleanName(s, fb){ s=String(s||'').trim(); if(!s||/^<unknown>$/i.test(s)) return fb; return s; }
async function scanDevice(opts){
  opts=opts||{};
  if(!isNative()) return 0;
  let ML=null; try{ ML=window.Capacitor.Plugins.MediaLibrary; }catch(e){}
  if(!ML||!ML.listAudio){ if(!opts.silent) toast('Device scan needs the new app build'); return 0; }
  let r;
  try{ r=await ML.listAudio({limit:3000}); }
  catch(e){
    if(pickCancelled(e)) return 0;
    if(!opts.silent) toast('Allow music access in Android Settings → Apps → Permissions');
    return 0;
  }
  const arr=(r&&r.tracks)||[];
  const seen=new Set(); deviceTracks=[];
  for(const x of arr){
    try{
      const mid=String(x.mid||''); if(!mid||seen.has(mid)) continue; seen.add(mid);
      const dur=Math.max(0, Math.round(+x.duration||0));
      deviceTracks.push({
        id:'dev_'+mid, title:cleanName(x.title||x.name, 'Unknown'),
        artist:cleanName(x.artist, 'Unknown artist'), album:cleanName(x.album, ''),
        folder:x.folder||'Device Music', src:deviceSrc(x.uri||''), uri:x.uri||'',
        source:'device', duration:dur, fileName:x.name||'', hue:hashHue((x.title||'')+(x.artist||''))
      });
    }catch(e){}
  }
  const groups={};
  const hidT=store.hiddenTracks||[];
  deviceTracks.forEach(t=>{ if(hidT.includes(t.id)) return; const g=t.folder||'Device Music'; (groups[g]=groups[g]||[]).push(t.id); });
  const hidden=store.hiddenDeviceFolders||[];
  store.folders=store.folders.filter(f=>f.kind!=='device');
  Object.keys(groups).sort().forEach(g=>{
    if(hidden.includes(g)) return;
    store.folders.push({id:'df_'+hashHue(g)+'_'+g.length+'_'+(g.charCodeAt(0)||0), name:g, trackIds:groups[g], kind:'device'});
  });
  save(); rebuild(); bumpLib();
  if(!opts.silent){
    toast(deviceTracks.length?deviceTracks.length+' songs found on device':'No music found on device');
    segTo('folders'); tab('library'); render();
  }
  coversLater();
  return deviceTracks.length;
}
/* Resolve any track id → its track object (offline library only now). */
const getT = (id)=>cache.find(t=>t.id===id);
const all = ()=>cache;

let lastAppError = '', _lastErrToast = 0;
function reportError(msg){
  try{
    lastAppError = String(msg||'error').slice(0, 300);
    try{ localStorage.setItem('ashs_last_err', lastAppError); }catch(e){}
    const now = Date.now();
    if(now - _lastErrToast > 8000){ _lastErrToast = now; toast('Hiccup: '+lastAppError.slice(0, 90)); }
  }catch(e){}
}
window.addEventListener('error', e=>{ reportError((e&&(e.message||e.error&&e.error.message))||'error'); });
window.addEventListener('unhandledrejection', e=>{ reportError((e.reason&&(e.reason.message||e.reason))||'promise'); });

let libRev=0, lastPaintRev=-1, lastFilterKey='', lastOverlayId='§', lastQueueSig='§', queueOpen=false;
function bumpLib(){ libRev++; }

let _idbP=null;
function idb(){ if(_idbP) return _idbP;
  _idbP=new Promise((res,rej)=>{ const r=indexedDB.open('nova_music_db',2);
    r.onupgradeneeded=()=>{ const db=r.result;
      if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
    };
    r.onsuccess=()=>{ const db=r.result; db.onversionchange=()=>{ try{db.close();}catch(e){} _idbP=null; }; db.onclose=()=>{ _idbP=null; }; res(db); };
    r.onerror=()=>{ _idbP=null; rej(r.error); };
    r.onblocked=()=>{ _idbP=null; rej(new Error('IndexedDB blocked')); }; });
  return _idbP; }
async function metaGet(k){ const db=await idb();
  return new Promise((res,rej)=>{ const q=db.transaction('meta','readonly').objectStore('meta').get(k);
    q.onsuccess=()=>res(q.result?q.result.value:undefined); q.onerror=()=>rej(q.error); }); }
async function metaSet(k,v){ const db=await idb();
  return new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put({key:k,value:v});
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbPut(o){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').put(o); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbAll(){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction('files','readonly').objectStore('files').getAll(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); }); }
async function idbDel(id){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').delete(id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
const _blobUrls=new Map();
function blobUrlFor(r){ const old=_blobUrls.get(r.id); if(old) return old.url;
  const url=URL.createObjectURL(r.blob); _blobUrls.set(r.id,{url}); return url; }
async function loadLocal(){ try{ const recs=await idbAll();
  const live=new Set(recs.map(r=>r.id));
  for(const [id,o] of _blobUrls){ if(!live.has(id)){ try{URL.revokeObjectURL(o.url);}catch(e){} _blobUrls.delete(id); } }
  localTracks = recs.map(r=>({ id:r.id, title:r.title||r.name, artist:r.artist||'My Music', album:r.folder||'My Files', folder:r.folder||'My Music', src:blobUrlFor(r), source:'local', duration:r.duration||0, fileName:r.name, hue:hashHue((r.title||r.name)+(r.artist||'')), coverUrl:r.cover||undefined }));
 }catch(e){ localTracks=[]; } rebuild(); }

const audio = $('#audio');
try{ audio.removeAttribute('crossorigin'); }catch(e){}
function applyVolume(){ const v=Math.min(100,Math.max(0,store.volumes.vol??100)); audio.volume=v/100;
  const pv=E('plVol'); if(pv) pv.value=String(v); const pvv=E('plVolVal'); if(pvv) pvv.textContent=String(v); }
applyVolume();
audio.playbackRate = store.prefs.speed || 1;
let actx=null, eqNodes=[], graphOK=false, seeking=false;
function isPublicHttp(u){ return /^https?:/i.test(u||'') && !/localhost|127\.0\.0\.1/i.test(u||''); }
function setSrcSafe(t){
  try{
    const s = t.src||'';
    // Blob/content (device-scan) and localhost streams must not use crossOrigin.
    const noCors = /^(blob|content):/i.test(s) || /localhost|127\.0\.0\.1|_capacitor_/i.test(s);
    if(noCors){ try{audio.removeAttribute('crossOrigin');}catch(e){} try{audio.crossOrigin=null;}catch(e){} }
    else if(/^https?:/i.test(s)){ audio.crossOrigin='anonymous'; }
    else { try{audio.removeAttribute('crossOrigin');}catch(e){} }
  }catch(e){}
  try{ if(audio.getAttribute('src')!==t.src) audio.src=t.src; }catch(e){ reportError('audio src'); }
}
function ensureGraph(t){
  if(actx){ if(actx.state==='suspended') actx.resume().catch(()=>{}); return graphOK; }
  if(!store.eq.enabled) return false;
  try{
    actx = new (window.AudioContext||window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audio);
    let head = src;
    eqNodes = EQ_BANDS.map(b=>{ const f=actx.createBiquadFilter(); f.type='peaking'; f.frequency.value=b.f; f.Q.value=1; head.connect(f); head=f; return f; });
    head.connect(actx.destination);
    applyEQ(); graphOK = true;
  }catch(e){ graphOK = false; }
  return graphOK;
}
function applyEQ(){ if(!actx||!graphOK) return;
  eqNodes.forEach((n,i)=>{ try{ n.gain.value = store.eq.enabled ? (store.eq.gains[i]||0) : 0; }catch(e){} }); }

let queue=[], currentId=store.currentId||null, sleepId=null, activeCol=null, libSeg='playlists';
const fmt=(s)=>{ if(!isFinite(s)) return 'LIVE'; s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){ const w=$('#toastWrap'); if(!w) return; const d=document.createElement('div'); d.className='toast'; d.textContent=m; w.appendChild(d); setTimeout(()=>{d.style.opacity='0'; setTimeout(()=>d.remove(),300);},2400); }
function artStyle(t){ const h=((t?.hue??200)%360+360)%360;
  return `background:hsl(${h} 26% 42%)`; }
function artHTML(t,cls){ const ch=(t?.title||'♪').trim().charAt(0).toUpperCase()||'♪';
  if(t?.coverUrl) return `<div class="${cls}"><img src="${esc(t.coverUrl)}" alt="" loading="lazy" decoding="async"/></div>`;
  return `<div class="${cls}" style="${artStyle(t)}">${ch}</div>`; }

const _ic=(p)=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const _icF=(p)=>`<svg class="ic" viewBox="0 0 24 24" fill="currentColor">${p}</svg>`;
const ICONS={
  play:_icF('<polygon points="7 4 20 12 7 20 7 4"/>'),
  pause:_icF('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  prev:_ic('<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>'),
  next:_ic('<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>'),
  shuffle:_ic('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'),
  repeat:_ic('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
  repeat1:_ic('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="17.5" font-size="8.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle">1</text>'),
  star:_ic('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  starF:_icF('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
  folder:_ic('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  lib:_ic('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  radio:_ic('<circle cx="12" cy="12" r="2"/><path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.4a6 6 0 0 1 0-8.8M16.2 7.6a6 6 0 0 1 0 8.8M19.1 4.9a10 10 0 0 1 0 14.2"/>'),
  note:_ic('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  sun:_ic('<circle cx="12" cy="12" r="4"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  moon:_ic('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  chevR:_ic('<polyline points="9 18 15 12 9 6"/>'),
  dots:_icF('<circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>'),
  plus:_ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
};

let playSeq=0, lastGoodSrc='';
function playTrack(id, opts){
  try{
  const t=getT(id); if(!t){ toast('Song not found'); return; }
  opts=opts||{};
  ensureGraph(t); ensureNotifPerm();
  if(!opts.fromRadio && !opts.keepRadio) { if(store.radio){ store.radio=false; } }
  setSrcSafe(t);
  audio.playbackRate=store.prefs.speed||1;
  if(opts.open){ $('#listOverlay').classList.add('hidden'); $('#playerOverlay').classList.remove('hidden'); }
  const seq=++playSeq;
  const doPlay=()=>audio.play().then(()=>{
    if(seq!==playSeq) return;
    currentId=id; store.currentId=id;
    try{ lastGoodSrc=audio.src||t.src; }catch(e){}
    store.recents=[id,...store.recents.filter(x=>x!==id)].slice(0,50);
    store.playCounts[id]=(store.playCounts[id]||0)+1; save(); bumpLib();
    render(); mediaSession();
  }).catch(err=>{ console.warn(err);
    if(seq!==playSeq) return;
    try{ if(lastGoodSrc&&audio.src!==lastGoodSrc) audio.src=lastGoodSrc; }catch(e){}
    if(!isFinite(audio.duration) && /^https?:/i.test(t.src||'')){
      try{ audio.removeAttribute('crossorigin'); audio.crossOrigin=null; audio.src=t.src; return audio.play().catch(()=>toast(!navigator.onLine&&t.source==='demo'?'Demo songs need internet':'Could not play this file')); }catch(e){}
    }
    if(!navigator.onLine && t.source==='demo') toast('Demo songs need internet');
    else toast('Could not play this file'); });
  if(audio.getAttribute('src')!==t.src || audio.src!==t.src){ setSrcSafe(t); setTimeout(doPlay,30); }
  else doPlay();
  }catch(e){ reportError('play: '+(e&&e.message||e)); toast('Could not play this file'); }
}
function toggle(){ try{
  if(!currentId){ const f=all()[0]; if(f) return playTrack(f.id,{keepRadio:true}); return toast('Add music first'); }
  ensureGraph(getT(currentId)); if(audio.paused) audio.play().catch(()=>toast('Could not play')); else audio.pause();
  }catch(e){ reportError('toggle: '+(e&&e.message||e)); } }
function next(auto=false){
  if(queue.length){ const id=queue.shift(); render(); return playTrack(id,{keepRadio:true, fromRadio:store.radio}); }
  // Advance through whatever is on deck — queue, shuffle or library order.
  const list=all(); if(!list.length) return;
  if(store.prefs.shuffle) return playTrack(list[Math.floor(Math.random()*list.length)].id,{keepRadio:true, fromRadio:store.radio});
  if(store.radio) return playTrack(list[Math.floor(Math.random()*list.length)].id,{keepRadio:true, fromRadio:true});
  let i=list.findIndex(t=>t.id===currentId);
  if(i<0) return playTrack(list[0].id,{keepRadio:true});
  if(i<list.length-1) return playTrack(list[i+1].id,{keepRadio:true});
  if(store.prefs.repeat==='all') return playTrack(list[0].id,{keepRadio:true});
  if(!auto) return playTrack(list[0].id,{keepRadio:true});
}
function prev(){ if(audio.currentTime>3){ audio.currentTime=0; return; }
  if(store.prefs.shuffle||store.radio){ const l=all(); if(l.length) return playTrack(l[Math.floor(Math.random()*l.length)].id,{keepRadio:true, fromRadio:store.radio}); }
  const list=all(); let i=list.findIndex(t=>t.id===currentId);
  if(i>0) playTrack(list[i-1].id,{keepRadio:true}); else if(list.length) playTrack(list[list.length-1].id,{keepRadio:true}); }
function cycleRepeat(){ store.prefs.repeat = store.prefs.repeat==='off'?'all':store.prefs.repeat==='all'?'one':'off'; save(); render(); toast('Repeat: '+store.prefs.repeat); }

/* Progress tick: batch every timeupdate into a single rAF paint so the DOM
   is written at most once per frame instead of 4+ times per second. */
let _rafPend=false;
function paintProgress(){
  const raw=audio.duration;
  const d=(isFinite(raw)&&raw>0)?raw:(getT(currentId)?.duration||0);
  const c=audio.currentTime||0;
  if(!seeking&&isFinite(raw)){ const v=d?Math.round(c/d*1000):0; const sk=E('plSeek'); if(sk){ sk.value=String(v); } }
  const cc=E('plCur'); if(cc) cc.textContent=fmt(c);
  const dd=E('plDur'); if(dd) dd.textContent=raw===Infinity?'LIVE':fmt(d);
  const mp=E('miniProg'); if(mp) mp.style.transform='scaleX('+(d?c/d:0)+')';
  tickHeroProg();
  try{ const po=E('playerOverlay'); if(po&&!audio.paused&&!po.classList.contains('hidden')&&store.synced&&store.synced[currentId]&&!showPlainLyr) paintSyncLines(false); }catch(e){}
}
audio.addEventListener('timeupdate',()=>{
  /* Backgrounded WebViews never fire rAF and would leave the _rafPend latch
     stuck at true forever, freezing the timer/mini bar after returning to the
     app. While hidden, write the DOM directly instead of batching. */
  if(document.hidden){ paintProgress(); return; }
  if(_rafPend) return; _rafPend=true;
  requestAnimationFrame(()=>{ _rafPend=false; paintProgress(); });
});
audio.addEventListener('loadedmetadata',()=>{ const t=getT(currentId); if(!t||!audio.duration||!isFinite(audio.duration)) return;
  const d=Math.round(audio.duration);
  if(t.source==='local'){ const prev=store.localMeta[t.id]||{}; prev.duration=d; store.localMeta[t.id]=prev; save(); }
  else if(!t.duration){ t.duration=d; }
  try{ mcUpdateElapsed(); }catch(e){} });
audio.addEventListener('error',()=>{ const t=getT(currentId); if(t&&/^https?:/i.test(t.src||'')&&audio.crossOrigin){ try{ audio.removeAttribute('crossorigin'); audio.crossOrigin=null; audio.src=t.src; audio.play().catch(()=>{}); }catch(e){} } });
audio.addEventListener('ended',()=>{ if(store.prefs.repeat==='one'){ audio.currentTime=0; audio.play().catch(()=>{}); return; }
  if(store.prefs.autoplay||store.radio||queue.length) next(true); else renderState(); });
audio.addEventListener('play',renderState); audio.addEventListener('pause',renderState);
function mediaSession(){ if(!('mediaSession' in navigator)) return; const t=getT(currentId); if(!t) return;
  try{ const art=(t.coverUrl&&(isPublicHttp(t.coverUrl)||/^data:/.test(t.coverUrl||'')))?[{src:t.coverUrl,sizes:'160x160'}]:[];
    navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album||"Ash's Player",artwork:art});
    navigator.mediaSession.playbackState=audio.paused?'paused':'playing';
    navigator.mediaSession.setActionHandler('play',()=>audio.play().catch(()=>{})); navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack',prev); navigator.mediaSession.setActionHandler('nexttrack',()=>next());
  }catch(e){} }

function searchFilter(list,q){ if(!q) return list; return list.filter(t=>(t.title+' '+t.artist+' '+(t.album||'')).toLowerCase().includes(q)); }

let homeQ='', songsQ='', libQ='', lastSearchKey='§', searchDeb=null;
function closeSearchOverlay(){ const o=$('#searchOverlay'); if(o) o.classList.add('hidden'); }
function openSearchOverlay(){ const o=$('#searchOverlay'); if(o) o.classList.remove('hidden'); paintSearchOverlay(); }
function paintSearchOverlay(){
  const o=$('#searchOverlay'); if(!o||o.classList.contains('hidden')) return;
  const si=$('#searchInput'), raw=(si&&si.value||'').trim();
  const key=homeQ+'|'+all().length+'|'+libRev+'|'+currentId+'|'+audio.paused;
  if(key===lastSearchKey) return; lastSearchKey=key;
  const t=$('#searchTitle'); if(t) t.textContent=raw?('“'+raw+'”'):'Search';
  const box=$('#searchSongs'), gr=$('#searchGroups'), meta=$('#searchMeta');
  box.innerHTML=''; gr.innerHTML='';
  if(!homeQ){ if(meta) meta.textContent=''; return; }
  const songs=all().filter(x=>(x.title+' '+x.artist+' '+(x.album||'')).toLowerCase().includes(homeQ)).slice(0,40);
  const als=albumGroups().filter(g=>(g.album+' '+g.artist).toLowerCase().includes(homeQ)).slice(0,5);
  const ars=artistGroups().filter(g=>g.artist.toLowerCase().includes(homeQ)).slice(0,5);
  const pls=store.playlists.filter(p=>String(p.name||'').toLowerCase().includes(homeQ)).slice(0,4);
  const pfs=store.pfolders.filter(f=>String(f.name||'').toLowerCase().includes(homeQ)).slice(0,3);
  if(meta) meta.textContent=(songs.length||als.length||ars.length||pls.length||pfs.length)
    ? `${songs.length} song${songs.length===1?'':'s'}${als.length?` · ${als.length} album${als.length===1?'':'s'}`:''}${ars.length?` · ${ars.length} artist${ars.length===1?'':'s'}`:''}${pls.length?` · ${pls.length} playlist${pls.length===1?'':'s'}`:''}${pfs.length?` · ${pfs.length} folder${pfs.length===1?'':'s'}`:''}`
    : `No matches for “${raw}”`;
  const mkHead=x=>{ const h=document.createElement('div'); h.className='so-head'; h.textContent=x; return h; };
  if(als.length){ gr.appendChild(mkHead('Albums'));
    als.forEach(g=>{ const d=document.createElement('div'); d.className='track';
      d.innerHTML=`${groupArt(g.album.trim().charAt(0).toUpperCase(),g.cover,g.hue)}<div class="t-meta"><b>${esc(g.album)}</b><span>${esc(g.artist)} · ${g.ids.length} songs</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>{ closeSearchOverlay(); openAlbum(g.artist,g.album); }; gr.appendChild(d); }); }
  if(ars.length){ gr.appendChild(mkHead('Artists'));
    ars.forEach(g=>{ const d=document.createElement('div'); d.className='track';
      d.innerHTML=`${groupArt(g.artist.trim().charAt(0).toUpperCase(),g.cover,g.hue)}<div class="t-meta"><b>${esc(g.artist)}</b><span>${g.ids.length} songs</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>{ closeSearchOverlay(); openArtist(g.artist); }; gr.appendChild(d); }); }
  if(pls.length||pfs.length){ gr.appendChild(mkHead('Playlists & folders'));
    pfs.forEach(f=>{ const r=pfRow(f); r.onclick=()=>{ closeSearchOverlay(); openPFolder(f.id); }; gr.appendChild(r); });
    pls.forEach(pl=>{ const r=plRow(pl); r.onclick=()=>{ closeSearchOverlay(); openPlaylist(pl.id); }; gr.appendChild(r); }); }
  if(songs.length){ if(als.length||ars.length||pls.length||pfs.length) box.appendChild(mkHead('Songs')); else gr.appendChild(mkHead('Songs')); }
  songs.forEach(x=>box.appendChild(trackRow(x)));
}
function letterOf(s){ const c=String(s||'#').trim().charAt(0).toUpperCase(); return (c>='A'&&c<='Z')?c:'#'; }
function trackRow(t, opts){
  opts=opts||{};
  const d=document.createElement('div'); d.className='track'+(t.id===currentId?' playing':'');
  try{ d.dataset.id=t.id; d.dataset.l=letterOf(t.title); }catch(e){}
  if(flashId===t.id) d.classList.add('landed'); else if(freshIds.has(t.id)) d.classList.add('fresh');
  const liked=store.likes.includes(t.id);
  d.innerHTML=`${opts.select?`<input type="checkbox" class="sel-check"${opts.select.checked?' checked':''} aria-label="Select"/>`:''}${opts.rank?`<span class="top-rank">${esc(opts.rank)}</span>`:''}${artHTML(t,'t-art')}<div class="t-meta"><b>${esc(t.title)}${liked?' <span class="liked-dot" title="Liked">•</span>':''}</b><span>${esc(t.artist)}${t.duration?' · '+fmt(t.duration):''}</span></div>${t.id===currentId&&!audio.paused?'<span class="eqbars"><i></i><i></i><i></i></span>':''}${opts.reorder?'<span class="ord"><button data-m="-1" aria-label="Move up">↑</button><button data-m="1" aria-label="Move down">↓</button></span>':''}<button class="t-menu" aria-label="More">${ICONS.dots}</button>`;
  if(opts.select){
    d.classList.toggle('selected',!!opts.select.checked);
    d.onclick=()=>opts.select.onToggle();
    const cb=d.querySelector('.sel-check');
    if(cb){ cb.onclick=e=>e.stopPropagation(); cb.onchange=()=>opts.select.onToggle(); }
    return d;
  }
  d.onclick=()=>playTrack(t.id,{open:true});
  d.querySelector('.t-menu').onclick=(e)=>{ e.stopPropagation(); songMenu(t.id); };
  if(opts.reorder) d.querySelectorAll('.ord button').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); opts.reorder(t.id,+b.dataset.m); });
  return d;
}
let selecting=false, selected=new Set(), lastSongsVis=[];
function setSelecting(on){ selecting=!!on; if(!selecting) selected.clear();
  const st=$('#selectToggle'); if(st) st.textContent=selecting?'Cancel':'Select';
  bumpLib(); render(); }
function toggleSelect(id){ if(selected.has(id)) selected.delete(id); else selected.add(id); bumpLib(); render(); }
function paintSongsList(){
  const el=$('#newList'); if(!el) return;
  const nl=searchFilter(all(),songsQ).slice().sort((a,b)=> store.prefs.newSort==='old'
    ? (store.addedAt[a.id]||0)-(store.addedAt[b.id]||0) : (store.addedAt[b.id]||0)-(store.addedAt[a.id]||0));
  lastSongsVis=nl;
  el.innerHTML='';
  if(!nl.length) el.innerHTML=`<p class="muted center">${songsQ?`No matches for “${songsQ}”`:'Nothing here yet — add music to get started'}</p>`;
  nl.forEach(t=>el.appendChild(trackRow(t, selecting?{select:{checked:selected.has(t.id), onToggle:()=>toggleSelect(t.id)}}:null)));
  const bar=$('#selBar'); if(bar){ bar.classList.toggle('hidden',!selecting);
    const c=$('#selCount'); if(c) c.textContent=selected.size+' selected'; }
}

function moveInList(arr,i,dir){ if(i<0) return false; const j=i+dir; if(j<0||j>=arr.length) return false; const [x]=arr.splice(i,1); arr.splice(j,0,x); return true; }
function purgeTrackMeta(tid){
  store.likes=store.likes.filter(x=>x!==tid);
  store.playlists.forEach(p=>p.trackIds=p.trackIds.filter(x=>x!==tid));
  store.recents=store.recents.filter(x=>x!==tid);
  delete store.playCounts[tid]; delete store.addedAt[tid]; delete store.lyrics[tid];
  if(store.synced) delete store.synced[tid];
  delete store.localMeta[tid]; delete store.customTitles[tid];
  queue=queue.filter(x=>x!==tid);
}
function paint(el,list,empty){ el.innerHTML=''; if(!list.length){ el.innerHTML=`<p class="muted center">${empty}</p>`; return; } list.forEach(t=>el.appendChild(trackRow(t))); }

function applyTheme(){
  let th=store.prefs.theme||'dark';
  if(th==='system'){ try{ th=(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'; }catch(e){ th='dark'; } }
  const acc=th==='light'?{a:'#6d5ae6',s:'rgba(109,90,230,.13)'}:{a:'#8b7cf7',s:'rgba(139,124,247,.16)'};
  const r=document.documentElement;
  r.dataset.theme=th;
  r.style.setProperty('--acc',acc.a);
  try{ r.style.setProperty('--acc-soft',acc.s); }catch(e){}
  const mc=document.querySelector('meta[name=theme-color]'); if(mc) mc.content=th==='light'?'#f5f6fb':'#08090f';
  $$('.themeToggle').forEach(b=>b.innerHTML=th==='light'?ICONS.moon:ICONS.sun);
}

/* ---------- Per-track adaptive color plates ----------
   Each song recolors the UI: accent, gradient, nav tint, eq bars, sliders
   and background blobs shift to the track's own palette. Idle = Aurora. */
const _accCache={};
let _accKey='';
function _hsl(h,s,l){ h=((h%360)+360)%360; return 'hsl('+Math.round(h)+','+Math.round(s)+'%,'+Math.round(l)+'%)'; }
function _hslRgb(h,s,l){
  h=((h%360)+360)%360; s/=100; l/=100;
  const a=s*Math.min(l,1-l), f=n=>{ const k=(n+h/30)%12; return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1))))) ; };
  return f(0)+','+f(8)+','+f(4);
}
function _rgbHue(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); if(mx===mn) return null;
  let h; const d=mx-mn;
  if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4;
  h*=60; return h<0?h+360:h; }
function _dominantHue(url){
  return new Promise(res=>{
    if(!url||!(/^(data:|blob:|http)/i).test(url)) return res(null);
    const key=String(url).slice(0,80)+'';
    if(key in _accCache) return res(_accCache[key]);
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{ try{
      const c=document.createElement('canvas'); c.width=24; c.height=24;
      const x=c.getContext('2d'); x.drawImage(img,0,0,24,24);
      const d=x.getImageData(0,0,24,24).data;
      let rs=0,gs=0,bs=0,n=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i],g=d[i+1],b=d[i+2];
        if(Math.max(r,g,b)-Math.min(r,g,b)<30) continue; // skip greys
        rs+=r; gs+=g; bs+=b; n++;
      }
      const h=n>20?_rgbHue(rs/n,gs/n,bs/n):_rgbHue(d[0],d[1],d[2]);
      _accCache[key]=h; res(h);
    }catch(e){ _accCache[key]=null; res(null); } };
    img.onerror=()=>{ _accCache[key]=null; res(null); };
    img.src=url;
  });
}
async function applyTrackAccent(force){
  const th=document.documentElement.dataset.theme||'dark';
  const dark=th!=='light';
  const rt=getT(currentId);
  const hue=rt?(rt.hue!=null?rt.hue:hashHue(rt.title+' '+(rt.artist||''))):null;
  const key=(rt&&rt.id||'-')+'|'+(hue==null?'-':Math.round(hue))+'|'+th;
  if(!force&&key===_accKey) return;
  _accKey=key;
  const st=document.documentElement.style;
  if(!rt){
    st.setProperty('--acc', dark?'#8b7cf7':'#6d5ae6');
    st.setProperty('--acc-soft', dark?'rgba(139,124,247,.16)':'rgba(109,90,230,.13)');
    st.setProperty('--acc-border', dark?'rgba(139,124,247,.55)':'rgba(109,90,230,.5)');
    st.setProperty('--grad', dark?'linear-gradient(120deg,#8b7cf7,#4cc9f0 48%,#2ee6c8)':'linear-gradient(120deg,#6d5ae6,#2f86d6 48%,#0fb5a2)');
    st.setProperty('--blob1', dark?'rgba(139,124,247,.17)':'rgba(109,90,230,.12)');
    return;
  }
  let h=hue!=null?hue:hashHue(String(rt.id));
  try{ if(rt.coverUrl){ const ch=await _dominantHue(rt.coverUrl); if(ch!=null) h=ch; } }catch(e){}
  const sat=dark?64:48, lit=dark?66:46;
  const A=_hsl(h,sat,lit), B=_hsl(h+52,sat,lit+2), C=_hsl(h+104,sat+4,lit-2);
  const rgb=_hslRgb(h,sat,lit);
  st.setProperty('--acc',A);
  st.setProperty('--acc-soft','rgba('+rgb+','+(dark?'.17':'.14')+')');
  st.setProperty('--acc-border','rgba('+rgb+','+(dark?'.55':'.5')+')');
  st.setProperty('--grad','linear-gradient(120deg,'+A+','+B+' 48%,'+C+')');
  st.setProperty('--blob1','rgba('+rgb+','+(dark?'.17':'.12')+')');
}
/* Play/pause from the mini bar and the big player button. */
function avToggle(){ try{ toggle(); }catch(e){ reportError('toggle'); } }

function render(){ renderLists(); renderState(); setTimeout(()=>{ flashId=null; freshIds.clear(); },700); }
let flashId=null; const freshIds=new Set();
function animateOut(ids, fn){
  return new Promise(res=>{
    const done=v=>res(v);
    try{
      const rows=[...document.querySelectorAll('#newList .track, #listSongs .track, #searchSongs .track')]
        .filter(r=>r.dataset&&ids.includes(r.dataset.id));
      if(!rows.length){ Promise.resolve(fn()).then(done,done); return; }
      rows.forEach(r=>r.classList.add('leaving'));
      setTimeout(()=>{ Promise.resolve(fn()).then(done,done); }, 260);
    }catch(e){ try{fn();}catch(_){} done(); }
  });
}
function renderLists(){
  rebuild();
  applyTheme();
  const fkey=songsQ+'|'+libQ+'|'+store.prefs.newSort+'|'+libSeg+'|'+all().length;
  if(libRev===lastPaintRev&&fkey===lastFilterKey) return;
  lastPaintRev=libRev; lastFilterKey=fkey;
  const plays=id=>store.playCounts[id]||0;
  const popular=all().slice().sort((a,b)=>plays(b.id)-plays(a.id)).slice(0,10);
  const sl2=$('#statLine'); if(sl2){ const plN=store.playlists.length, pfN=store.pfolders.length;
    sl2.textContent=all().length?`${all().length} songs · ${plN} ${plN===1?'playlist':'playlists'}${pfN?' · '+(pfN===1?'1 folder':pfN+' folders'):''}`:'Your music'; }
  const pr=$('#popularRow'); if(pr){ pr.innerHTML='';
    if(!all().length) pr.innerHTML='<p class="muted">No music yet — go to Songs → Add</p>';
    popular.forEach((t,ri)=>pr.appendChild(trackRow(t,{rank:String(ri+1).padStart(2,'0')})));
  }
  const hp=$('#homePlaylists'); if(hp){ hp.innerHTML='';
    if(!store.playlists.length&&!store.pfolders.length) hp.innerHTML='<p class="muted">No playlists yet — make one in Library → Playlists</p>';
    else{ const vis=[...store.pfolders,...store.playlists].sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)).slice(0,3);
      vis.forEach(x=>hp.appendChild(String(x.id).startsWith('pf_')?pfRow(x):plRow(x))); } }
  const hr=$('#homeRecent'); if(hr) paint(hr, store.recents.map(getT).filter(Boolean).slice(0,5), 'Nothing played yet — tap a song');
  const ns=$('#newSortRow'); if(ns){ ns.innerHTML='';
    [['new','Newest'],['old','Oldest']].forEach(([v,l])=>{
      const b=document.createElement('button'); b.textContent=l;
      if((store.prefs.newSort||'new')===v) b.classList.add('active');
      b.onclick=()=>{ store.prefs.newSort=v; save(); render(); }; ns.appendChild(b); }); }
  paintSongsList();
  const libSub=$('#libSub'); if(libSub) libSub.textContent=`${all().length} songs · ${localTracks.length+deviceTracks.length} on this device`;
  const lp=$('#libPlaylists'); if(lp){ lp.innerHTML='';
    const q=libQ; const match=n=>!q||String(n||'').toLowerCase().includes(q);
    const foldersRaw=store.pfolders.filter(f=>match(f.name)
      ||((f.childIds||[]).some(c=>{ const pl=store.playlists.find(p=>p.id===c); return pl&&match(pl.name); })));
    const plsRaw=store.playlists.filter(p=>match(p.name)&&!pfParentOf(p.id));
    /* Spotify-style ordering: pinned items first (folders & playlists mixed),
       then loose folders, then loose playlists — store order within each group. */
    const base=[...foldersRaw.map(f=>({t:'pf',x:f})), ...plsRaw.map(p=>({t:'pl',x:p}))];
    const ordered=[...base.filter(x=>x.x.pin), ...base.filter(x=>!x.x.pin&&x.t==='pf'), ...base.filter(x=>!x.x.pin&&x.t==='pl')];
    if(!ordered.length) lp.innerHTML=`<p class="muted center">${q?`No matches for “${q}”`:'No playlists yet — tap New Playlist'}</p>`;
    ordered.forEach(x=>lp.appendChild(x.t==='pf'?pfRow(x.x):plRow(x.x))); }
  const npb=$('#newPlaylistBtn'); if(npb) npb.classList.toggle('hidden', libSeg!=='playlists');
  const nfb=$('#newFolderBtn'); if(nfb) nfb.classList.toggle('hidden', libSeg!=='playlists');
  const lf=$('#libFolders'); if(lf){ lf.innerHTML='';
    const fols=libQ?store.folders.filter(f=>f.name.toLowerCase().includes(libQ)):store.folders;
    if(!fols.length) lf.innerHTML=`<p class="muted center">${libQ?`No matches for “${libQ}”`:'No folders yet — tap + and pick a folder'}</p>`;
    fols.forEach(f=>{ const ts=f.trackIds.map(getT).filter(Boolean);
      const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
      const d=document.createElement('div'); d.className='track';
      d.innerHTML=`<div class="t-art folder" style="${artStyle({hue:hashHue(f.name)})};display:flex;align-items:center;justify-content:center">${ICONS.folder}</div><div class="t-meta"><b>${esc(f.name)}</b><span>${ts.length} songs${tot?' · '+fmt(tot):''}</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>openFolder(f.id); lf.appendChild(d); }); }
}
function renderState(){
  rebuild();
  paintHero('hero'); paintHero('ns'); paintHero('lb');
  const _lkc=$('#likesCount'); if(_lkc) _lkc.textContent=store.likes.length?store.likes.length+(store.likes.length===1?' song':' songs'):'Tap ♥ to add';
  const mPill=$('#mixPill'); if(mPill) mPill.textContent=store.radio?'Mix on':'Shuffle';
  try{ document.documentElement.classList.toggle('is-playing', !!(currentId&&!audio.paused)); }catch(e){}
  paintOverlays();
  const rt=getT(currentId);
  const rTi=$('#radioTitle'); if(rTi) rTi.textContent=rt?rt.title:'Nothing playing';
  const rAr=$('#radioArtist'); if(rAr) rAr.textContent=rt?(rt.artist+(store.radio?' · mix on':'')):'Tap play to start the mix';
  const rTg=$('#radioToggle'); if(rTg) rTg.innerHTML=(!audio.paused&&currentId)?ICONS.pause:ICONS.play;
  const rTgW=$('#radioToggle'); if(rTgW) rTgW.classList.toggle('live',!!store.radio);
  const ra=$('#radioArt'); if(ra){
    if(rt?.coverUrl) ra.innerHTML=`<img src="${esc(rt.coverUrl)}" style="width:100%;height:100%;object-fit:cover" alt=""/>`;
    else if(rt){ ra.textContent=(rt.title||'R')[0].toUpperCase(); ra.style.cssText=artStyle(rt); }
    else { ra.innerHTML=ICONS.radio; ra.style.cssText=''; } }
  const rn=$('#radioNext'); if(rn) paint(rn, queue.map(getT).filter(Boolean).slice(0,3), store.radio?'Shuffle mix is on — enjoy':'Queue is empty');
  if(currentId&&!getT(currentId)){ currentId=null; store.currentId=null; try{audio.pause();}catch(e){} save(); }
  const playing=currentId&&!audio.paused;
  // Lock-screen sync: push position the instant play/pause flips,
  // then keep it fresh with the 1s timer while playing.
  if(playing!==_lastPlaySync){
    _lastPlaySync=playing;
    try{ mcUpdateElapsed(); mediaPos(); }catch(e){}
  }
  if(playing) startNotifTimer(); else stopNotifTimer();
  try{ if('mediaSession' in navigator) navigator.mediaSession.playbackState=playing?'playing':'paused'; }catch(e){}
  const mp=$('#miniPlayer'); if(mp) mp.classList.toggle('hidden',!currentId);
  if(!rt){ const mt0=$('#miniTitle'); if(mt0) mt0.textContent='—'; const ma0=$('#miniArtist'); if(ma0) ma0.textContent='—'; }
  if(rt){
    const mt=$('#miniTitle'); if(mt) mt.textContent=rt.title;
    const ma=$('#miniArtist'); if(ma) ma.textContent=rt.artist;
    const mc=$('#miniCover'); if(mc){ if(rt.coverUrl) mc.innerHTML=`<img src="${esc(rt.coverUrl)}" alt="" loading="lazy" decoding="async"/>`; else { mc.textContent=(rt.title||'♪')[0].toUpperCase(); mc.style.cssText=artStyle(rt); } }
    const pt=$('#plTitle'); if(pt) setMarquee(pt, rt.title);
    const pa2=$('#plArtist'); if(pa2) pa2.textContent=rt.artist+(rt.album?' · '+rt.album:'');
    const pa=$('#plArt'); if(pa){ if(rt.coverUrl) pa.innerHTML=`<img src="${esc(rt.coverUrl)}" alt="" decoding="async"/>`; else { pa.textContent=(rt.title||'♪')[0].toUpperCase(); pa.style.cssText=artStyle(rt); }
      pa.classList.toggle('playing',!!playing); }
    const amb=$('#plAmb'); if(amb){ const want=rt&&rt.coverUrl?rt.coverUrl:''; if(amb.dataset.src!==want){ amb.dataset.src=want; amb.innerHTML=want?`<img src="${esc(want)}" alt=""/>`:''; } }
    const lyr=$('#plLyrPreview'); if(lyr){ let _lt=(store.lyrics[currentId]||'').split('\n')[0]||''; if(_lt) _lt=toHinglish(_lt); lyr.textContent=_lt||(rt.source==='demo'?'Demo track':'Lyrics will appear here'); }
    const hasSync=!!(store.synced&&store.synced[currentId]);
    if(_lyrTrack!==currentId){ _lyrTrack=currentId; showPlainLyr=false; _lyrIdx=-9; }
    const sbox=$('#plLyrSync');
    if(sbox){ sbox.classList.toggle('hidden',!hasSync||showPlainLyr); if(lyr) lyr.style.display=(hasSync&&!showPlainLyr)?'none':''; }
    if(hasSync&&!showPlainLyr) paintSyncLines(true);
  }
  const mPlay=$('#miniPlay'); if(mPlay) mPlay.innerHTML=playing?ICONS.pause:ICONS.play;
  const mNext=$('#miniNext'); if(mNext) mNext.innerHTML=ICONS.next;
  const pPlay=$('#plPlay'); if(pPlay) pPlay.innerHTML=playing?ICONS.pause:ICONS.play;
  const pPrev=$('#plPrev'); if(pPrev) pPrev.innerHTML=ICONS.prev;
  const pNext=$('#plNext'); if(pNext) pNext.innerHTML=ICONS.next;
  const pSh=$('#plShuffle'); if(pSh){ pSh.innerHTML=ICONS.shuffle; pSh.classList.toggle('off',!store.prefs.shuffle); }
  const pRp=$('#plRepeat'); if(pRp){ pRp.innerHTML=store.prefs.repeat==='one'?ICONS.repeat1:ICONS.repeat; pRp.classList.toggle('off',store.prefs.repeat==='off'); }
  const pLk=$('#plLike'); if(pLk) pLk.innerHTML=currentId&&store.likes.includes(currentId)?ICONS.starF:ICONS.star;
  const pLkB=$('#plLike'); if(pLkB) pLkB.classList.toggle('liked',!!(currentId&&store.likes.includes(currentId)));
  const slp=$('#plSleepBtn'); if(slp) slp.classList.toggle('live',!!sleepId);
  applyVolume();
  paintSearchOverlay();
  syncNotif();
  try{ applyTrackAccent(); }catch(e){}
  const h=new Date().getHours();
  const gt=$('#greetTitle'); if(gt) gt.textContent=(h<12?'Good morning':h<17?'Good afternoon':'Good evening');
}

function setMarquee(el, text){
  el.classList.remove('scroll'); el.textContent=text;
  requestAnimationFrame(()=>{
    if(el.scrollWidth>el.clientWidth+4){
      el.innerHTML=`<span class="mq"><span>${esc(text)}</span><span>${esc(text)}</span></span>`;
      el.classList.add('scroll');
      el.querySelector('.mq').style.animationDuration=Math.max(10, Math.round(text.length*0.55))+'s';
    }
    el.classList.toggle('paused', audio.paused);
  });
}
function paintHeroCard(p,t,kick){
  const card=document.getElementById(p+'Card'); if(!card) return;
  card.classList.toggle('hidden',!t);
  if(!t) return;
  try{ card.dataset.tid=t.id; }catch(e){}
  const byId=s=>document.getElementById(p+s);
  const a=byId('Art');
  if(a){ if(t.coverUrl){ a.innerHTML=`<img src="${esc(t.coverUrl)}" alt="" loading="lazy" decoding="async"/>`; a.style.cssText=''; }
    else { a.textContent=(t.title||'♪').trim().charAt(0).toUpperCase()||'♪'; a.style.cssText=artStyle(t); } }
  const k=byId('Kick'); if(k) k.textContent=kick||((currentId===t.id&&!audio.paused)?'Now playing':(currentId===t.id?'Paused':'Up next'));
  const ti=byId('Title'); if(ti) ti.textContent=t.title;
  const su=byId('Sub'); if(su) su.textContent=t.artist;
  const pl=byId('Play'); if(pl){ pl.innerHTML=(currentId===t.id&&!audio.paused)?ICONS.pause:ICONS.play;
    pl.onclick=e=>{ e.stopPropagation(); if(currentId===t.id) toggle(); else playTrack(t.id,{open:true}); }; }
  const nx=byId('Next'); if(nx){ nx.innerHTML=ICONS.next;
    nx.onclick=e=>{ e.stopPropagation(); if(currentId===t.id) next(); else playTrack(t.id,{open:true}); }; }
}
function paintHero(p){ paintHeroCard(p, getT(currentId)||all()[0]); }
const _heroProgs=[['heroProg','heroCard'],['nsProg','nsCard'],['lbProg','lbCard']];
function tickHeroProg(){
  for(let i=0;i<_heroProgs.length;i++){
    const e=E(_heroProgs[i][0]); if(!e) continue;
    const card=E(_heroProgs[i][1]); const t=card&&card.dataset.tid?getT(card.dataset.tid):null;
    const live=t&&currentId===t.id;
    const d=live?(audio.duration||t.duration||0):(t?t.duration||0:0);
    const c=live?(audio.currentTime||0):0;
    e.style.transform='scaleX('+(d?c/d:0)+')';
  }
}
function plRow(pl){
  const d=document.createElement('div'); d.className='track';
  try{ d.dataset.pid=pl.id; }catch(e){}
  if(flashId===pl.id) d.classList.add('landed');
  const pinTag=pl.pin?' <span class="pin-tag" title="Pinned">📌</span>':'';
  d.innerHTML=`<div class="t-art" style="${artStyle({hue:hashHue(pl.name||'P')})}">${esc((pl.name||'P')[0].toUpperCase())}</div><div class="t-meta"><b>${esc(pl.name)}${pinTag}</b><span>${pl.trackIds.length} songs</span></div><button class="t-menu" aria-label="More">${ICONS.dots}</button>`;
  d.onclick=()=>openPlaylist(pl.id);
  d.querySelector('.t-menu').onclick=(e)=>{ e.stopPropagation(); plMenu(pl.id); };
  return d;
}
/* ---- Playlist folders (Spotify-style "Your Library" folders) ----
   store.pfolders: [{id:'pf_…', name, childIds:['pl_…'|'pf_…', …], pin}];
   an item lives in at most one folder; prefix decides the item kind. */
function pfGet(id){ return store.pfolders.find(x=>x.id===id); }
function pfParentOf(itemId){
  for(const f of store.pfolders){ if((f.childIds||[]).includes(itemId)) return f; }
  return null;
}
function pfDescendants(fid, seen){
  seen=seen||new Set();
  const f=pfGet(fid);
  if(f&&!seen.has(fid)){ seen.add(fid);
    (f.childIds||[]).forEach(c=>{ if(String(c).startsWith('pf_')) pfDescendants(c,seen); }); }
  return seen;
}
function pfContentsDeep(fid, seenFolders, out){
  seenFolders=seenFolders||new Set(); out=out||{folders:[],playlists:[]};
  if(seenFolders.has(fid)) return out; seenFolders.add(fid);
  const f=pfGet(fid); if(!f) return out;
  (f.childIds||[]).forEach(c=>{
    if(String(c).startsWith('pf_')){
      if(!seenFolders.has(c)){ out.folders.push(c); pfContentsDeep(c,seenFolders,out); }
    } else if(!out.playlists.includes(c)) out.playlists.push(c);
  });
  return out;
}
function pfCounts(f){
  let pl=0, pf=0;
  (f.childIds||[]).forEach(c=>{ String(c).startsWith('pf_')?pf++:pl++; });
  return {pl:pl, pf:pf};
}
function pfCountsText(c){
  const a=c.pl+(c.pl===1?' playlist':' playlists');
  return c.pf? a+' · '+c.pf+(c.pf===1?' folder':' folders') : a;
}
function pfFlatTrackIds(fid, seen){
  seen=seen||new Set(); const out=[];
  const walk=(pid)=>{
    if(seen.has(pid)) return; seen.add(pid);
    const f=pfGet(pid); if(!f) return;
    (f.childIds||[]).forEach(c=>{
      if(String(c).startsWith('pf_')) walk(c);
      else{ const pl=store.playlists.find(p=>p.id===c);
        if(pl) for(const tid of pl.trackIds){ if(!out.includes(tid)) out.push(tid); } }
    });
  };
  walk(fid); return out;
}
function pfDetach(itemId){
  let hit=false;
  for(const f of store.pfolders){
    if(f.childIds&&f.childIds.includes(itemId)){ f.childIds=f.childIds.filter(x=>x!==itemId); hit=true; }
  }
  return hit;
}
function pfAttach(targetId, itemId){
  pfDetach(itemId);
  if(targetId){ const t=pfGet(targetId);
    if(t){ if(!t.childIds) t.childIds=[]; if(!t.childIds.includes(itemId)) t.childIds.push(itemId); } }
}
function pfRow(f){
  const d=document.createElement('div'); d.className='track';
  try{ d.dataset.pid=f.id; }catch(e){}
  if(flashId===f.id) d.classList.add('landed');
  const pinTag=f.pin?' <span class="pin-tag" title="Pinned">📌</span>':'';
  d.innerHTML=`<div class="t-art folder" style="${artStyle({hue:hashHue(f.name||'F')})};display:flex;align-items:center;justify-content:center">${ICONS.folder}</div><div class="t-meta"><b>${esc(f.name)}${pinTag}</b><span>${esc(pfCountsText(pfCounts(f)))}</span></div><button class="t-menu" aria-label="More">${ICONS.dots}</button>`;
  d.onclick=()=>openPFolder(f.id);
  d.querySelector('.t-menu').onclick=(e)=>{ e.stopPropagation(); pfMenu(f.id); };
  return d;
}

async function ensureNotifPerm(){
  try{ const C=window.Capacitor; if(!C?.isNativePlatform?.()) return;
    const LN=C.Plugins?.LocalNotifications; if(!LN) return;
    let st={display:'prompt'}; try{ st=await LN.checkPermissions(); }catch(e){}
    if(st.display!=='granted'){ try{ await LN.requestPermissions(); }catch(e){} }
  }catch(e){}
}

function nativeBack(){
  try{
    const C=window.Capacitor;
    if(!C?.isNativePlatform?.() || !C.Plugins?.App) return;
    C.Plugins.App.addListener('backButton', ()=>{
      if(!$('#sheetBack').classList.contains('hidden')) closeSheet();
      else if(selecting) setSelecting(false);
      else if(!$('#searchOverlay').classList.contains('hidden')) closeSearchOverlay();
      else if(!$('#playerOverlay').classList.contains('hidden')) $('#playerOverlay').classList.add('hidden');
      else if(!$('#listOverlay').classList.contains('hidden')) $('#listOverlay').classList.add('hidden');
      else if(document.querySelector('.screen.active')?.id!=='screen-home') tab('home');
      else { try{ C.Plugins.App.minimizeApp(); }catch(e){ try{C.Plugins.App.exitApp();}catch(_){} } }
    });
  }catch(e){}
}

let _lastNotifId=null, _lastNotifPlaying=null, _mcBound=false, _lastMsg='', _lastMsgT=0, _lastPlaySync=null;
function mcPlugin(){ try{ const C=window.Capacitor;
  if(!(C&&C.isNativePlatform&&C.isNativePlatform())) return null;
  return C.Plugins.CapacitorMusicControls||C.Plugins.MusicControls||null;
 }catch(e){ return null; } }
function notifReset(){ _lastNotifId=null; _lastNotifPlaying=null; }
function appVisible(){ try{ return !document.hidden; }catch(e){ return true; } }
function paintOverlays(){
  try{
    if(!$('#listOverlay').classList.contains('hidden')&&activeCol){
      if(currentId!==lastOverlayId){ lastOverlayId=currentId||'';
        if(activeCol.type==='pl') paintPlaylistSongs(activeCol.id);
        else if(activeCol.type==='likes') paintLikeList();
        else if(activeCol.type==='pf'){ const f=pfGet(activeCol.id); if(f) paintPFolder(f); }
        else if(activeCol.type==='fo'){ const f=store.folders.find(x=>x.id===activeCol.id); if(f) paintFolderList(f); }
        else if(activeCol.type==='al'){ const p=String(activeCol.key).split('\n'); openAlbum(p[0],p[1]); }
        else if(activeCol.type==='ar'){ openArtist(activeCol.key); }
      }
    } else lastOverlayId=currentId||'';
  }catch(e){}
  try{
    const sig=queue.join(',')+'|'+currentId;
    if(queueOpen&&sig!==lastQueueSig){ lastQueueSig=sig; queueSheet(); }
    if(!queueOpen) lastQueueSig=sig;
  }catch(e){}
}
function mcHandle(message, pos){
  if(!message) return;
  const now=Date.now();
  if(message===_lastMsg && now-_lastMsgT<800) return;
  _lastMsg=message; _lastMsgT=now;
  if(message==='music-controls-play') audio.play().catch(()=>{});
  else if(message==='music-controls-pause') audio.pause();
  else if(message==='music-controls-toggle-playing'||message==='music-controls-toggle-play-pause'||message==='music-controls-media-button'){
    if(audio.paused) audio.play().catch(()=>{}); else audio.pause();
  }
  else if(message==='music-controls-next') next();
  else if(message==='music-controls-previous') prev();
  else if(message==='music-controls-seek-to'){ const s=Math.max(0,+pos||0);
    try{ const d=audio.duration; if(s>=0&&d&&isFinite(d)){ audio.currentTime=Math.min(s,d); mcUpdateElapsed(); mediaPos(); } }catch(e){} }
  else if(message==='music-controls-headset-unplugged'){ try{audio.pause();}catch(e){} }
  else if(message==='music-controls-destroy'){ try{audio.pause();}catch(e){} notifReset();
    try{ const M=mcPlugin(); if(M&&M.destroy){ const r=M.destroy(); r&&r.catch&&r.catch(()=>{}); } }catch(e){} }
}
async function notifCover(httpCover){
  if(httpCover) return httpCover;
  try{
    const C=window.Capacitor;
    const FS=C&&C.Plugins&&C.Plugins.Filesystem;
    if(!C||!C.isNativePlatform||!C.isNativePlatform()||!FS||!FS.writeFile) return '';
    const t=getT(currentId); if(!t||!t.coverUrl) return '';
    const m=/^data:(image\/\w+);base64,([\s\S]*)$/.exec(t.coverUrl||'');
    if(!m||m[2].length>400000) return '';
    const r=await FS.writeFile({path:'ashs_cover.jpg', data:m[2], directory:'CACHE'});
    return (r&&r.uri)||'';
  }catch(e){ return ''; }
}
function mcUpdatePlaying(MC, playing){
  try{ const r=MC.updateIsPlaying({isPlaying:playing});
    if(r&&r.catch) r.catch(()=>{ _lastNotifPlaying=null; });
  }catch(e){ _lastNotifPlaying=null; }
}
function mcUpdateElapsed(){
  try{ const MC=mcPlugin(); if(!MC||!store.prefs.notif) return; const t=getT(currentId); if(!t) return;
    if(MC.updateElapsed){
      const rawDur=t.duration||audio.duration||0;
      // Live/radio streams have no duration — 0 keeps the lock-screen
      // seek bar indeterminate instead of sending Infinity to native.
      const dur=isFinite(rawDur)?Math.max(0,Math.round(rawDur*1000)):0;
      const r=MC.updateElapsed({isPlaying:!audio.paused, elapsed:Math.max(0,Math.floor((audio.currentTime||0)*1000)), duration:dur}); if(r&&r.catch) r.catch(()=>{});
    }
  }catch(e){}
}
/* Pushes the live position to the OS lock screen. MediaSession's
   setPositionState lets Chrome/Android derive the seek-bar position
   themselves; the music-controls plugin gets explicit updates. */
function mediaPos(){
  if(!('setPositionState' in navigator)||!('mediaSession' in navigator)) return;
  try{
    const t=getT(currentId); if(!t) return;
    const rawDur=t.duration||audio.duration||0;
    if(!isFinite(rawDur)||rawDur<=0) return;
    navigator.mediaSession.setPositionState({
      duration:rawDur,
      playbackRate:audio.playbackRate||1,
      position:Math.min(rawDur,Math.max(0,audio.currentTime||0))
    });
  }catch(e){}
}
/* Lock-screen progress must keep advancing while the app is
   backgrounded. rAF and timeupdate both stop firing when hidden,
   so a dedicated 1s timer drives the sync — the music-controls
   foreground service keeps the WebView (and this timer) alive. */
let _notifTimer=null;
function startNotifTimer(){
  if(_notifTimer) return;
  _notifTimer=setInterval(()=>{
    try{ if(!audio.paused&&currentId){ mcUpdateElapsed(); mediaPos(); } }catch(e){}
  },1000);
}
function stopNotifTimer(){ if(_notifTimer){ clearInterval(_notifTimer); _notifTimer=null; } }
function syncNotif(){
  mediaSession(); // browser / PWA path
  try{
    const MC=mcPlugin(); if(!MC) return;
    if(!store.prefs.notif){ // turned off: take a stale notification down
      if(_lastNotifId!==null){ try{ const r=MC.destroy(); r&&r.catch&&r.catch(()=>{}); }catch(e){} notifReset(); }
      return;
    }
    const t=getT(currentId);
    if(!t){ if(_lastNotifId!==null){ try{ const r=MC.destroy(); r&&r.catch&&r.catch(()=>{}); }catch(e){} notifReset(); } return; }
    const playing=!audio.paused;
    const trackChanged=_lastNotifId!==t.id;
    if(!trackChanged && _lastNotifPlaying===playing) return;
    if(!_mcBound){ _mcBound=true;
      try{ MC.addListener&&MC.addListener('controlsNotification',function(info){ mcHandle(info&&(info.message||info), info&&(info.position||0)); }); }catch(e){}
      try{ document.addEventListener('controlsNotification',function(ev){ mcHandle(ev&&(ev.message||''), ev&&(ev.position||0)); }); }catch(e){}
    }
    const httpCover=(t.coverUrl&&isPublicHttp(t.coverUrl))?t.coverUrl:'';
    if(!trackChanged){ _lastNotifPlaying=playing; mcUpdatePlaying(MC, playing); return; }
    /* Track changed while the app is backgrounded: the notification (lock
       screen) must still get the NEW title — Android/media-notification
       updates are allowed in the background for a running service. */
    _lastNotifId=t.id; _lastNotifPlaying=playing;
    notifCover(httpCover).then(cover=>{
      if(!store.prefs.notif||_lastNotifId!==t.id) return;
      try{ const r=MC.create({ track:t.title||'Unknown', artist:t.artist||'Unknown artist', album:t.album||"Ash's Player", cover:cover||'',
        isPlaying:!audio.paused, dismissable:false, hasPrev:true, hasNext:true, hasClose:true,
      ticker:'Now playing "'+(t.title||'music')+'"',
      notificationIcon:'ashs_note', playIcon:'ashs_play', pauseIcon:'ashs_pause', prevIcon:'ashs_prev', nextIcon:'ashs_next', closeIcon:'ashs_close',
      duration:Math.max(0,Math.round((t.duration||audio.duration||0)*1000)), elapsed:Math.max(0,Math.floor((audio.currentTime||0)*1000)) });
        r&&r.catch&&r.catch(()=>{ notifReset(); });
      }catch(e){ notifReset(); }
    });
  }catch(e){}
}

const TAB_ORDER=['home','new','radio','library'];
let _tabTimer=null, _tabLeaving=null;
function moveNavGlider(name){
  try{
    const g=E('navGlider'); if(!g) return;
    const btn=$$('.bottom-nav button').find(b=>b.dataset.tab===name);
    if(!btn||!btn.offsetWidth){ g.style.opacity='0'; return; }
    g.style.opacity='1';
    g.style.width=btn.offsetWidth+'px';
    g.style.transform='translateX('+btn.offsetLeft+'px)';
  }catch(e){}
}
function tab(name){ closeSearchOverlay(); if(selecting) setSelecting(false);
  try{ const ph=document.querySelector('.phone'); if(ph) ph.dataset.screen=name; }catch(e){}
  $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  moveNavGlider(name);
  let cur=null; try{ cur=document.querySelector('.screen.active'); }catch(e){}
  if(!cur){
    $$('.screen').forEach(s=>s.classList.remove('active','fwd','back','leaving-fwd','leaving-back'));
    const sc=$('#screen-'+name); if(!sc) return; sc.classList.add('active');
    try{ const sv=document.querySelector('.screens'); if(sv) sv.scrollTop=0; }catch(e){}
    return;
  }
  if(cur.id==='screen-'+name){ try{ const sv=document.querySelector('.screens'); if(sv) sv.scrollTo({top:0,behavior:'smooth'}); }catch(e){} return; }
  let dir='fwd';
  try{ dir=TAB_ORDER.indexOf(name)>=TAB_ORDER.indexOf(cur.id.replace('screen-',''))?'fwd':'back'; }catch(e){}
  try{
    if(_tabTimer){ clearTimeout(_tabTimer); _tabTimer=null; }
    if(_tabLeaving) _tabLeaving.classList.remove('leaving-fwd','leaving-back');
    _tabLeaving=cur;
    cur.classList.add('leaving-'+dir);
  }catch(e){ _tabLeaving=null; }
  _tabTimer=setTimeout(()=>{
    _tabTimer=null;
    try{ if(_tabLeaving) _tabLeaving.classList.remove('leaving-fwd','leaving-back'); }catch(e){}
    _tabLeaving=null;
    $$('.screen').forEach(s=>s.classList.remove('active','fwd','back','leaving-fwd','leaving-back'));
    const sc=$('#screen-'+name); if(!sc) return; sc.classList.add('active');
    try{ void sc.offsetWidth; }catch(e){}
    sc.classList.add(dir);
    try{ const sv=document.querySelector('.screens'); if(sv) sv.scrollTop=0; }catch(e){}
  },145);
}
function sheet(html){ $('#sheetBox').innerHTML='<div class="grab"></div>'+html; $('#sheetBack').classList.remove('hidden'); }
function closeSheet(){ queueOpen=false; $('#sheetBack').classList.add('hidden'); }
$('#sheetBack').addEventListener('click',e=>{ if(e.target.id==='sheetBack') closeSheet(); });

function songMenu(id){ const t=getT(id); if(!t) return; const liked=store.likes.includes(id);
  sheet(`<h2>${esc(t.title)}</h2><p class="muted">${esc(t.artist)}${t.duration?' · '+fmt(t.duration):''}</p>
  <button class="opt" id="mPlay">Play now</button>
  <button class="opt" id="mNext">Play next</button>
  <button class="opt" id="mQueue">Add to queue</button>
  <button class="opt" id="mLike">${liked?'Unlike':'Like'}</button>
  <button class="opt" id="mPl">Add to playlist</button>
  <button class="opt" id="mLyr">Lyrics</button>
  <button class="opt" id="mRen">Rename</button>
  ${t.source==='local'?'<button class="opt danger" id="mDel">Delete from library</button>':''}
  ${t.source==='device'?'<button class="opt danger" id="mDel2">Delete</button>':''}
  <button class="opt" id="mX">Close</button>`);
  $('#mX').onclick=closeSheet;
  $('#mPlay').onclick=()=>{ closeSheet(); playTrack(id,{open:true}); };
  $('#mNext').onclick=()=>{ queue.unshift(id); closeSheet(); render(); toast('Plays next'); };
  $('#mQueue').onclick=()=>{ queue.push(id); closeSheet(); render(); toast('Added to queue'); };
  $('#mLike').onclick=()=>{ const i=store.likes.indexOf(id); i>=0?store.likes.splice(i,1):store.likes.push(id); save(); bumpLib(); closeSheet(); render(); };
  $('#mPl').onclick=()=>plPicker(id);
  $('#mLyr').onclick=()=>lyrEditor(id);
  $('#mRen').onclick=()=>{ sheet(`<h2>Edit tags</h2><input type="text" id="rnT" value="${esc(t.title)}" maxlength="120" placeholder="Title"/><input type="text" id="rnA" value="${esc(t.artist)}" maxlength="120" placeholder="Artist"/><input type="text" id="rnAl" value="${esc(t.album||'')}" maxlength="120" placeholder="Album"/><button class="opt" id="rnS">Save</button>`);
    $('#rnS').onclick=()=>{ store.customTitles[id]={title:$('#rnT').value.trim()||t.title,artist:$('#rnA').value.trim()||t.artist,album:$('#rnAl').value.trim()}; save(); bumpLib(); flashId=id; closeSheet(); render(); toast('Tags saved'); }; };
  const doWipe=async(pid)=>{ await idbDel(pid); purgeTrackMeta(pid);
    if(currentId===pid){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
    await loadLocal(); save(); bumpLib(); closeSheet(); render(); toast('Deleted'); };
  const del=$('#mDel'); if(del) del.onclick=async()=>{ if(!confirm('Delete this song from library?'))return; await animateOut([id],()=>doWipe(id)); };
  const hide=$('#mDel2'); if(hide) hide.onclick=async()=>{ if(!confirm('Delete this song from the app?'))return;
    await animateOut([id],()=>{ store.hiddenTracks=store.hiddenTracks||[];
      if(!store.hiddenTracks.includes(id)) store.hiddenTracks.push(id);
      purgeTrackMeta(id);
      if(currentId===id){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
      save(); bumpLib(); closeSheet(); render(); toast('Deleted'); }); };
}
function plPicker(id){
  sheet(`<h2>Add to playlist</h2>${store.playlists.length?store.playlists.map(p=>`<button class="opt" data-p="${esc(p.id)}">${esc(p.name)} (${p.trackIds.length})</button>`).join(''):'<p class="muted">No playlists yet</p>'}<button class="opt" id="pNew">New playlist</button><button class="opt" id="pX">Close</button>`);
  $('#pX').onclick=closeSheet; $('#pNew').onclick=newPlaylist;
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ const pl=store.playlists.find(p=>p.id===b.dataset.p);
    if(pl&&!pl.trackIds.includes(id)) pl.trackIds.push(id); save(); bumpLib(); flashId=pl.id; closeSheet(); render(); toast('Added to '+pl.name); });
}
function newPlaylist(){ sheet(`<h2>New playlist</h2><input type="text" id="npN" placeholder="Name it..."/><button class="opt" id="npS">Create</button>`);
  $('#npS').onclick=()=>{ const n=$('#npN').value.trim()||'My Mix'; const pl={id:'pl_'+Date.now()+'_r'+Math.floor(Math.random()*1e4),name:n,trackIds:[]}; store.playlists.push(pl); save(); bumpLib(); flashId=pl.id; closeSheet(); render(); toast('Playlist created'); }; }
function newFolder(){
  sheet(`<h2>Give your folder a name</h2><input type="text" id="nfN" placeholder="New folder" maxlength="120"/><button class="opt" id="nfS">Create</button><button class="opt" id="nfX">Close</button>`);
  $('#nfX').onclick=closeSheet;
  $('#nfS').onclick=()=>{ const n=$('#nfN').value.trim()||'New folder';
    const f={id:'pf_'+Date.now()+'_r'+Math.floor(Math.random()*1e4),name:n,childIds:[]};
    store.pfolders.push(f); save(); bumpLib(); flashId=f.id; closeSheet(); render(); toast('Folder created'); };
}
function newPlaylistInto(parentId){
  const root=parentId?pfGet(parentId):null; if(parentId&&!root) return;
  sheet(`<h2>New playlist</h2><input type="text" id="npN" placeholder="Name it..."/><button class="opt" id="npS">Create</button><button class="opt" id="npX">Close</button>`);
  $('#npX').onclick=closeSheet;
  $('#npS').onclick=()=>{ const n=$('#npN').value.trim()||'My Mix';
    const pl={id:'pl_'+Date.now()+'_r'+Math.floor(Math.random()*1e4),name:n,trackIds:[]};
    store.playlists.push(pl);
    if(root){ root.childIds.push(pl.id); }
    save(); bumpLib(); flashId=pl.id; closeSheet(); render();
    if(activeCol&&activeCol.type==='pf'){ const f=pfGet(activeCol.id); if(f) paintPFolder(f); }
    toast('Playlist created'); };
}
function renameItem(kind,id){
  const isF=kind==='pf';
  const obj=isF?pfGet(id):store.playlists.find(p=>p.id===id); if(!obj) return;
  sheet(`<h2>${isF?'Rename folder':'Rename playlist'}</h2><input type="text" id="rn2N" value="${esc(obj.name)}" maxlength="120" placeholder="${isF?'Folder name':'Playlist name'}"/><button class="opt" id="rn2S">Save</button><button class="opt" id="rn2X">Close</button>`);
  $('#rn2X').onclick=closeSheet;
  $('#rn2S').onclick=()=>{ const n=$('#rn2N').value.trim(); if(n) obj.name=n.slice(0,120);
    save(); bumpLib(); flashId=id; closeSheet(); render();
    if(activeCol&&activeCol.id===id){ if(isF&&activeCol.type==='pf') paintPFolder(obj);
      else if(!isF&&activeCol.type==='pl') paintPlaylistSongs(id); }
    toast('Renamed'); };
}
function moveToFolderPicker(kind,id){
  const isF=kind==='pf';
  if(!isF){ if(!store.playlists.find(p=>p.id===id)) return; }
  else if(!pfGet(id)) return;
  const banned=isF?pfDescendants(id):new Set([id]);
  const cur=pfParentOf(id);
  const folders=store.pfolders.filter(f=>!banned.has(f.id));
  const what=isF?'folder':'playlist';
  sheet(`<h2>Move to folder</h2><p class="muted">Where should this ${what} go?</p>
    ${cur?`<button class="opt" id="mvRoot">Move to Your Library</button>`:''}
    ${folders.length?folders.map(f=>`<button class="opt" data-f="${esc(f.id)}">${esc(f.name)}</button>`).join(''):'<p class="muted">No folders yet</p>'}
    <button class="opt" id="mvNew">New folder…</button>
    <button class="opt" id="mvX">Close</button>`);
  const finish=(target)=>{
    pfAttach(target||null, id);
    save(); bumpLib(); flashId=id; closeSheet(); render();
    const tgt=target?pfGet(target):null;
    toast(tgt?('Moved to '+tgt.name):'Moved to Your Library');
    if(activeCol&&activeCol.type==='pf'){ const f=pfGet(activeCol.id); if(f) paintPFolder(f); }
  };
  $('#mvX').onclick=closeSheet;
  if(cur) $('#mvRoot').onclick=()=>finish(null);
  $('#mvNew').onclick=()=>{ const container=(activeCol&&activeCol.type==='pf')?activeCol.id:null;
    sheet(`<h2>Give your folder a name</h2><input type="text" id="mvnfN" placeholder="New folder" maxlength="120"/><button class="opt" id="mvnfS">Create & move</button><button class="opt" id="mvnfX">Cancel</button>`);
    $('#mvnfX').onclick=closeSheet;
    $('#mvnfS').onclick=()=>{ const n=$('#mvnfN').value.trim()||'New folder';
      const f={id:'pf_'+Date.now()+'_r'+Math.floor(Math.random()*1e4),name:n,childIds:[]};
      store.pfolders.push(f);
      if(container){ const p=pfGet(container); if(p) p.childIds.push(f.id); }
      finish(f.id); };
  };
  $$('#sheetBox [data-f]').forEach(b=>b.onclick=()=>finish(b.dataset.f));
}
const PIN_IN_FOLDER_MSG="You can't pin items that are inside of a folder. Try to pin the folder instead.";
function togglePin(kind,id){
  const obj=kind==='pf'?pfGet(id):store.playlists.find(p=>p.id===id); if(!obj) return;
  if(pfParentOf(id)){ toast(PIN_IN_FOLDER_MSG); return; }
  if(obj.pin) delete obj.pin; else obj.pin=1;
  save(); bumpLib(); render(); toast(obj.pin?'Pinned':'Unpinned');
}
function delPFolder(fid){
  const f=pfGet(fid); if(!f) return;
  const deep=pfContentsDeep(fid);
  sheet(`<h2>Delete folder</h2><p class="muted">${esc(f.name)} will be deleted. All playlists and folders inside will be kept in Your Library.</p>
    <button class="opt" id="dfKeep">Delete folder, keep playlists</button>
    <button class="opt danger" id="dfAll">Delete everything</button>
    <button class="opt" id="dfX">Cancel</button>`);
  $('#dfX').onclick=closeSheet;
  $('#dfKeep').onclick=()=>{
    pfDetach(fid);
    store.pfolders=store.pfolders.filter(x=>x.id!==fid);
    save(); bumpLib(); closeSheet(); render(); toast('Folder deleted');
  };
  $('#dfAll').onclick=()=>{
    if(!confirm(`Delete "${f.name}" and everything inside? This can't be undone.`)) return;
    deep.folders.forEach(x=>{ store.pfolders=store.pfolders.filter(y=>y.id!==x); });
    deep.playlists.forEach(pid=>{
      const ucm=store.playlists.find(p=>p.id===pid);
      if(activeCol&&activeCol.type==='pl'&&activeCol.id===pid){ $('#listOverlay').classList.add('hidden'); activeCol=null; }
      if(ucm&&ucm.trackIds.includes(currentId)){ /* song itself stays; only the playlist is removed */ }
      store.playlists=store.playlists.filter(y=>y.id!==pid);
    });
    pfDetach(fid);
    store.pfolders=store.pfolders.filter(x=>x.id!==fid);
    if(activeCol&&activeCol.type==='pf'&&activeCol.id===fid){ $('#listOverlay').classList.add('hidden'); activeCol=null; }
    save(); bumpLib(); closeSheet(); render(); toast('Deleted');
  };
}
function plMenu(pid){
  const pl=store.playlists.find(p=>p.id===pid); if(!pl) return;
  const inFolder=pfParentOf(pid);
  sheet(`<h2>${esc(pl.name)}</h2><p class="muted">${pl.trackIds.length} songs${inFolder?' · inside '+esc(inFolder.name):''}</p>
  <button class="opt" id="pmPlay">Play now</button>
  ${pl.trackIds.length>1?'<button class="opt" id="pmShuf">Shuffle</button>':''}
  <button class="opt" id="pmRen">Rename</button>
  <button class="opt" id="pmPin">${pl.pin?'Unpin':'Pin playlist'}</button>
  <button class="opt" id="pmMv">Move to folder…</button>
  ${inFolder?'<button class="opt" id="pmOut">Move to Your Library</button>':''}
  <button class="opt danger" id="pmDel">Delete playlist</button>
  <button class="opt" id="pmX">Close</button>`);
  $('#pmX').onclick=closeSheet;
  const start=(shuffle)=>{
    const ts=pl.trackIds.map(getT).filter(Boolean); if(!ts.length){ toast('Playlist is empty'); return; }
    const rest=shuffle?ts.slice(1).map(t=>t.id).sort(()=>Math.random()-0.5):ts.slice(1).map(t=>t.id);
    queue=[...rest,...queue];
    playTrack(ts[0].id,{open:true,keepRadio:false}); render(); closeSheet();
  };
  $('#pmPlay').onclick=()=>start(false);
  const sh=$('#pmShuf'); if(sh) sh.onclick=()=>start(true);
  $('#pmRen').onclick=()=>renameItem('pl',pid);
  $('#pmPin').onclick=()=>{ closeSheet(); togglePin('pl',pid); };
  $('#pmMv').onclick=()=>{ closeSheet(); moveToFolderPicker('pl',pid); };
  const out=$('#pmOut'); if(out) out.onclick=()=>{ pfDetach(pid); save(); bumpLib(); closeSheet(); render(); toast('Moved to Your Library'); };
  $('#pmDel').onclick=()=>{ if(!confirm(`Delete "${pl.name}"?`)) return;
    if(activeCol&&activeCol.type==='pl'&&activeCol.id===pid){ $('#listOverlay').classList.add('hidden'); activeCol=null; }
    pfDetach(pid);
    store.playlists=store.playlists.filter(p=>p.id!==pid);
    save(); bumpLib(); closeSheet(); render(); toast('Playlist deleted'); };
}
function pfMenu(fid){
  const f=pfGet(fid); if(!f) return;
  const inFolder=pfParentOf(fid);
  const total=pfCountsDeepTotal(f);
  sheet(`<h2>${esc(f.name)}</h2><p class="muted">${esc(pfCountsText(pfCounts(f)))} · ${total} songs${inFolder?' · inside '+esc(inFolder.name):''}</p>
  <button class="opt" id="fmOpen">Open</button>
  <button class="opt" id="fmPlay">Play all</button>
  <button class="opt" id="fmShuf">Shuffle</button>
  <button class="opt" id="fmRen">Rename folder</button>
  <button class="opt" id="fmPin">${f.pin?'Unpin folder':'Pin folder'}</button>
  <button class="opt" id="fmMv">Move to folder…</button>
  ${inFolder?'<button class="opt" id="fmOut">Move to Your Library</button>':''}
  <button class="opt danger" id="fmDel">Delete folder…</button>
  <button class="opt" id="fmX">Close</button>`);
  $('#fmX').onclick=closeSheet;
  const start=(shuffle)=>{
    const ts=pfFlatTrackIds(fid).map(getT).filter(Boolean); if(!ts.length){ toast('This folder is empty'); return; }
    const rest=shuffle?ts.slice(1).map(t=>t.id).sort(()=>Math.random()-0.5):ts.slice(1).map(t=>t.id);
    queue=[...rest,...queue];
    playTrack(ts[0].id,{open:true,keepRadio:false});
    toast('Playing from Playlist Folder'); render(); closeSheet();
  };
  $('#fmOpen').onclick=()=>{ closeSheet(); openPFolder(fid); };
  $('#fmPlay').onclick=()=>start(false);
  $('#fmShuf').onclick=()=>start(true);
  $('#fmRen').onclick=()=>renameItem('pf',fid);
  $('#fmPin').onclick=()=>{ closeSheet(); togglePin('pf',fid); };
  $('#fmMv').onclick=()=>{ closeSheet(); moveToFolderPicker('pf',fid); };
  const out=$('#fmOut'); if(out) out.onclick=()=>{ pfDetach(fid); save(); bumpLib(); closeSheet(); render(); toast('Moved to Your Library'); };
  $('#fmDel').onclick=()=>{ closeSheet(); delPFolder(fid); };
}
function pfCountsDeepTotal(f){ return pfFlatTrackIds(f.id).length; }
async function deleteSelected(){
  const ids=[...selected].filter(id=>{ const t=getT(id); return t&&(t.source==='local'||t.source==='device'); });
  if(!ids.length){ toast('Nothing deletable selected'); return; }
  if(!confirm(`Delete ${ids.length} selected from the app?`))return;
  await animateOut(ids, async()=>{
    store.hiddenTracks=store.hiddenTracks||[];
    for(const id of ids){ const t=getT(id); if(!t) continue;
      if(t.source==='local') await idbDel(id);
      else if(t.source==='device'){ if(!store.hiddenTracks.includes(id)) store.hiddenTracks.push(id); }
      purgeTrackMeta(id);
    }
    if(currentId&&selected.has(currentId)){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
    await loadLocal(); save(); bumpLib(); setSelecting(false); render();
    toast(ids.length+' deleted');
  });
}
function playlistFromSelected(){
  const ids=[...selected].filter(id=>getT(id)); if(!ids.length){ toast('Select songs first'); return; }
  sheet(`<h2>Add ${ids.length} to…</h2>${store.playlists.length?store.playlists.map(p=>`<button class="opt" data-p="${esc(p.id)}">${esc(p.name)} (${p.trackIds.length})</button>`).join(''):'<p class="muted">No playlists yet</p>'}<input type="text" id="npNb" placeholder="Or new playlist name…" maxlength="120"/><button class="opt" id="npNbS">Create & add</button><button class="opt" id="pkX2">Close</button>`);
  $('#pkX2').onclick=closeSheet;
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ const pl=store.playlists.find(p=>p.id===b.dataset.p); if(!pl) return; let n=0;
    ids.forEach(id=>{ if(!pl.trackIds.includes(id)){ pl.trackIds.push(id); n++; } });
    save(); bumpLib(); flashId=pl.id; setSelecting(false); render(); toast(n?n+' added to '+pl.name:'Already in '+pl.name); });
  $('#npNbS').onclick=()=>{ const pl={id:'pl_'+Date.now()+'_r'+Math.floor(Math.random()*1e4),name:$('#npNb').value.trim()||'My Mix',trackIds:[]};
    ids.forEach(id=>{ if(!pl.trackIds.includes(id)) pl.trackIds.push(id); });
    store.playlists.push(pl); save(); bumpLib(); flashId=pl.id; setSelecting(false); render(); toast('Playlist created'); };
}

let showPlainLyr=false, _lyrIdx=-9, _lyrTrack=null, _lyrCacheId=null, _lyrCache=[];
/* ---------- Devanagari → Hinglish (roman script) ----------
   Transliterates Hindi lyric text (को दिल → ko dil). Runs only on the display
   path, so LRC timestamps stay perfectly synced and already-cached Hindi
   lyrics from earlier sessions are converted too. Latin text passes through. */
const _DV_CONS={'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'n','च':'ch','छ':'chh','ज':'j','झ':'jh','ञ':'ny','ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','ळ':'l','व':'v','श':'sh','ष':'sh','स':'s','ह':'h','ज़':'z','ख़':'kh','ग़':'g','ड़':'d','ढ़':'dh','फ़':'f','य़':'y'};
const _DV_VOWL={'अ':'a','आ':'aa','इ':'i','ई':'i','उ':'u','ऊ':'u','ऋ':'ri','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऍ':'e','ऑ':'o'};
const _DV_MATR={'ा':'a','ि':'i','ी':'i','ु':'u','ू':'u','ृ':'ri','ॄ':'ri','ॅ':'e','ॆ':'e','े':'e','ै':'ai','ॉ':'o','ॊ':'o','ो':'o','ौ':'au'};
const _DV_DIG={'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
/* Iconic song words — exact fan-typed forms the generic scan can't hit */
const _DV_WORDS={'नहीं':'nahin','में':'mein','हम':'hum','करना':'karna','करूँ':'karun','करूं':'karun','करते':'karte','करता':'karta','करती':'karti','तुझसे':'tujhse','मुझसे':'mujhse','तुझे':'tujhe','मुझे':'mujhe','तुझको':'tujhko','मुझको':'mujhko','ज़िंदगी':'zindagi','दुनिया':'duniya','दुनियाँ':'duniya','दिल':'dil','कितना':'kitna','कितनी':'kitni','कितने':'kitne','चाँद':'chaand','चांद':'chaand','वह':'woh','यह':'yeh','प्यार':'pyaar','दीवाना':'deewana','दीवानी':'deewani','दिवाना':'deewana','बेवफा':'bewafa','बेवफ़ा':'bewafa','वफ़ा':'wafa','वफा':'wafa','खुशबू':'khushboo','मोहब्बत':'mohabbat','अपना':'apna','अपनी':'apni','अपने':'apne','जान':'jaan','ख़ुदा':'khuda','हूँ':'hoon','सपना':'sapna','सपने':'sapne','ख्वाब':'khwaab','ख़्वाब':'khwaab'};
/* ज़ is often typed decomposed (ज + ़) — compose it first so keys match */
const _DV_NUK={'क':'क़','ख':'ख़','ग':'ग़','ड':'ड़','ढ':'ढ़','ज':'ज़','फ':'फ़','य':'य़'};
function _dvScan(word){
  let out='';
  for(let i=0;i<word.length;i++){
    const ch=word[i];
    if(ch==='्') continue;                                        // cluster join
    if(_DV_VOWL[ch]){ out+=_DV_VOWL[ch]; continue; }
    if(_DV_MATR[ch]){ out+=_DV_MATR[ch]; continue; }
    if(_DV_DIG[ch]){ out+=_DV_DIG[ch]; continue; }
    if(ch==='।'||ch==='॥'){ out+='.'; continue; }
    if(ch==='ॐ'){ out+='om'; continue; }
    if(ch==='ं'||ch==='ँ'){
      const nx=word[i+1], nas=(_DV_CONS[nx]&&/^(p|ph|b|bh|m)$/.test(_DV_CONS[nx]))?'m':'n';
      out+=nas; continue;
    }
    if(ch==='ः'){ out+='h'; continue; }
    if(ch==='़') continue;                                        // stray nukta
    if(ch==='ज'&&word[i+1]==='्'&&word[i+2]==='ञ'){
      out+='gy'+(_DV_MATR[word[i+3]]||'a'); i+=3; continue;
    }
    if(_DV_CONS[ch]){
      out+=_DV_CONS[ch];
      const n1=word[i+1];
      if(n1===undefined) continue;                                // word end: silent final 'a' (दिल → dil)
      if(n1==='्'){ i++; continue; }                              // conjunct: no vowel between
      if(_DV_MATR[n1]){ out+=_DV_MATR[n1]; i++; continue; }
      if(n1==='ं'||n1==='ँ'){                                     // inherent 'a' + trailing nasal (संग → sang)
        const n2=word[i+2];
        out+='a'+((_DV_CONS[n2]&&/^(p|ph|b|bh|m)$/.test(_DV_CONS[n2]))?'m':'n');
        i++; continue;
      }
      out+='a'; continue;                                         // mid-word schwa stays (readable)
    }
    out+=ch;
  }
  return out;
}
function toHinglish(str){
  str=String(str||'');
  if(!/[\u0900-\u097F]/.test(str)) return str;
  str=str.replace(/([कखगडढजफय])़/g,(m,c)=>_DV_NUK[c]||c);         // decomposed nukta → composed
  return str.replace(/[\u0900-\u0963\u0966-\u097F]+/g,w=>_DV_WORDS[w]||_dvScan(w));
}

function parseLRC(lrc){ const out=[], re=/\[(\d+):(\d+(?:\.\d+)?)\]/g;
  String(lrc||'').split('\n').forEach(line=>{ const times=[]; let m; re.lastIndex=0;
    while((m=re.exec(line))) times.push((+m[1])*60+(+m[2]));
    const text=line.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g,'').trim();
    if(times.length&&text) times.forEach(t=>out.push({t,x:text})); });
  out.sort((a,b)=>a.t-b.t); return out; }
async function fetchSynced(t){
  const q=((t.artist||'')+' '+(t.title||'')).trim(); if(!q) throw 0;
  const r=await fetch('https://lrclib.net/api/search?'+new URLSearchParams({q}).toString());
  if(!r.ok) throw 0;
  const cands=(await r.json()).filter(x=>x.syncedLyrics);
  if(!cands.length) throw 0;
  const dur=t.duration||0;
  cands.sort((a,b)=>Math.abs((a.duration||0)-dur)-Math.abs((b.duration||0)-dur));
  const r2=await fetch('https://lrclib.net/api/get/'+cands[0].id);
  if(!r2.ok) throw 0;
  const d=await r2.json();
  if(d.instrumental||!d.syncedLyrics) throw 1;
  return d;
}
function syncLines(){ const s=store.synced&&store.synced[currentId]; if(!s||!s.lrc) return null;
  if(_lyrCacheId!==currentId){ _lyrCache=parseLRC(s.lrc); for(const _l of _lyrCache) _l.x=toHinglish(_l.x); _lyrCacheId=currentId; } return _lyrCache; }
function paintSyncLines(force){ const L=syncLines(), box=$('#plLyrSync'); if(!L||!L.length||!box) return;
  const c=audio.currentTime||0; let i=-1;
  for(let k=0;k<L.length;k++){ if(L[k].t<=c+0.15) i=k; else break; }
  if(i<0) i=0;
  if(i===_lyrIdx&&!force) return; _lyrIdx=i;
  box.innerHTML=`<p>${esc((L[i-1]||{}).x||'')}</p><p class="cur">${esc(L[i].x||'')}</p><p>${esc((L[i+1]||{}).x||'')}</p>`; }
function lyrEditor(id){ const t=getT(id); if(!t) return;
  const hasSync=!!(store.synced&&store.synced[id]);
  sheet(`<h2>Lyrics — ${esc(t.title)}</h2><textarea id="lyT" placeholder="Paste lyrics...">${esc(store.lyrics[id]||'')}</textarea><button class="opt" id="lyW">Fetch synced lyrics${hasSync?' (refresh)':''}</button><button class="opt" id="lyS">Save lyrics</button>${hasSync?'<button class="opt danger" id="lyR">Remove synced lyrics</button>':''}`);
  $('#lyS').onclick=()=>{ store.lyrics[id]=$('#lyT').value; save(); closeSheet(); render(); toast('Lyrics saved'); };
  $('#lyW').onclick=async()=>{ toast('Searching synced lyrics…');
    try{ const d=await fetchSynced(t);
      store.synced=store.synced||{}; store.synced[id]={lrc:d.syncedLyrics,at:Date.now()};
      if(!$('#lyT').value.trim()&&d.plainLyrics) $('#lyT').value=toHinglish(d.plainLyrics);
      save(); toast('Synced lyrics saved — plays offline now'); lyrEditor(id);
    }catch(e){ toast(e===1?'Instrumental track — no lyrics':(!navigator.onLine?'You are offline':'No synced lyrics found')); } };
  const rm=$('#lyR'); if(rm) rm.onclick=()=>{ delete store.synced[id]; save(); closeSheet(); render(); toast('Synced lyrics removed'); }; }
function eqSheet(){
  sheet(`<h2>Equalizer</h2><label class="switch"><input type="checkbox" id="eqE" ${store.eq.enabled?'checked':''}/> Enable EQ</label>
  <p class="muted" style="font-size:12.5px">EQ applies from the next song you play and works on your own music.</p>
  <div class="chips">${Object.keys(EQ_PRESETS).map(n=>`<button class="${store.eq.preset===n?'active':''}" data-p="${n}">${n}</button>`).join('')}</div>
  <div id="eqRows">${EQ_BANDS.map((b,i)=>`<div class="eq-row"><label>${b.l}</label><input type="range" min="-12" max="12" data-i="${i}" value="${store.eq.gains[i]||0}" aria-label="${b.l}"/><span>${store.eq.gains[i]||0} dB</span></div>`).join('')}</div>
  <button class="opt" id="eqX">Close</button>`);
  $('#eqX').onclick=closeSheet;
  $('#eqE').onchange=e=>{ store.eq.enabled=e.target.checked; save(); applyEQ(); if(store.eq.enabled) ensureGraph(getT(currentId)); };
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ store.eq.preset=b.dataset.p; store.eq.gains=[...EQ_PRESETS[b.dataset.p]]; save(); applyEQ(); eqSheet(); });
  $$('#eqRows input').forEach(r=>r.oninput=()=>{ store.eq.gains[+r.dataset.i]=+r.value; r.nextElementSibling.textContent=r.value+' dB'; store.eq.preset='Custom'; save(); applyEQ(); });
}
function sleepSheet(){ sheet(`<h2>Sleep timer</h2><div class="chips">${[5,10,15,30,60].map(m=>`<button data-m="${m}">${m} min</button>`).join('')}<button data-m="0">Off</button></div><button class="opt" id="slX">Close</button>`);
  $('#slX').onclick=closeSheet;
  $$('#sheetBox [data-m]').forEach(b=>b.onclick=()=>{ setSleep(+b.dataset.m); closeSheet(); }); }
let sleepFadeId=null;
function setSleep(min){ if(sleepId){ clearTimeout(sleepId); sleepId=null; }
  if(sleepFadeId){ clearInterval(sleepFadeId); sleepFadeId=null; applyVolume(); }
  if(min>0){ sleepId=setTimeout(()=>{
      sleepFadeId=setInterval(()=>{ if(audio.volume>0.08) audio.volume=Math.max(0,audio.volume-0.08); else { clearInterval(sleepFadeId); sleepFadeId=null; try{audio.pause();}catch(e){} applyVolume(); } },200);
      sleepId=null; render(); toast('Sleep timer ended'); },min*60000); toast('Music stops in '+min+' min'); }
  else toast('Sleep timer off'); render(); }
function queueSheet(){ sheet(`<h2>Up next (${queue.length})</h2><div class="v-list" id="qL"></div><button class="opt" id="qC">Clear queue</button><button class="opt" id="qX">Close</button>`);
  const ql=$('#qL'); ql.innerHTML=queue.length?'':'<p class="muted">Empty — use the ••• menu on any song</p>';
  queue.map((id,qi)=>({t:getT(id),qi})).filter(x=>x.t).forEach(({t,qi})=>{ const r=trackRow(t);
    const w=document.createElement('span'); w.className='ord';
    w.innerHTML='<button aria-label="Move up">↑</button><button aria-label="Move down">↓</button>';
    const [up,dn]=w.querySelectorAll('button');
    up.onclick=e=>{ e.stopPropagation(); if(moveInList(queue,qi,-1)){ flashId=t.id; queueSheet(); render(); } };
    dn.onclick=e=>{ e.stopPropagation(); if(moveInList(queue,qi,1)){ flashId=t.id; queueSheet(); render(); } };
    const x=document.createElement('button'); x.className='t-menu'; x.setAttribute('aria-label','Remove'); x.textContent='✕';
    x.onclick=e=>{ e.stopPropagation(); queue.splice(qi,1); queueSheet(); render(); };
    const m=r.querySelector('.t-menu'); m.replaceWith(w); w.after(x); ql.appendChild(r); });
  $('#qC').onclick=()=>{ queue=[]; queueSheet(); render(); }; $('#qX').onclick=closeSheet; queueOpen=true; }
async function settingsSheet(){
  const th=store.prefs.theme||'dark';
  sheet(`<h2>Settings</h2><h3>Theme</h3><div class="chips"><button data-th="dark" class="${th==='dark'?'active':''}">Dark</button><button data-th="light" class="${th==='light'?'active':''}">Light</button><button data-th="system" class="${th==='system'?'active':''}">System</button></div>
  <h3>Sound</h3><div class="eq-row"><label>Volume</label><input type="range" id="sVol" min="0" max="100" value="${store.volumes.vol??100}" aria-label="Volume"/><span>${store.volumes.vol??100}</span></div>
  <div class="eq-row"><label>Speed</label><input type="range" id="sSp" min="0.5" max="2" step="0.05" value="${store.prefs.speed}" aria-label="Speed"/><span>${(+store.prefs.speed).toFixed(2)}x</span></div>
  <div class="chips"><button id="sSpR">Reset speed to 1.00x</button></div>
  <h3>Notifications</h3><label class="switch"><input type="checkbox" id="sNotif" ${store.prefs.notif?'checked':''}/> Lock-screen + background controls</label><p class="muted" id="diagLine" style="font-size:13px">Checking…</p><p class="muted" style="font-size:12.5px">Android 13+: allow Notifications when asked, or the player cannot appear on the lock screen.</p>
  <label class="switch"><input type="checkbox" id="sAu" ${store.prefs.autoplay?'checked':''}/> Autoplay next song</label>
  <h3>Library</h3><button class="opt" id="sEx">Export backup</button><button class="opt" id="sIm">Import backup</button><button class="opt danger" id="sRe">Reset everything</button>
  <h3>Diagnostics</h3><p class="muted" id="diagErr" style="font-size:13px">Last error: none</p><p class="muted" id="diagLib" style="font-size:13px"></p>
  <p class="muted">Ash's Player v${APP_VERSION} · offline music</p><button class="opt" id="sX">Close</button>`);
  $('#sX').onclick=closeSheet;
  $$('#sheetBox [data-th]').forEach(b=>b.onclick=()=>{ store.prefs.theme=b.dataset.th; save(); settingsSheet(); render(); });
  $('#sVol').oninput=e=>{ store.volumes.vol=+e.target.value; e.target.nextElementSibling.textContent=e.target.value; applyVolume(); save(); };
  $('#sSp').oninput=e=>{ store.prefs.speed=+e.target.value; audio.playbackRate=store.prefs.speed; e.target.nextElementSibling.textContent=store.prefs.speed.toFixed(2)+'x'; save(); };
  $('#sSpR').onclick=()=>{ store.prefs.speed=1; audio.playbackRate=1; save(); settingsSheet(); render(); toast('Speed reset to 1x'); };
  $('#sNotif').onchange=e=>{ store.prefs.notif=e.target.checked; save(); notifReset(); if(store.prefs.notif) ensureNotifPerm(); render(); toast(store.prefs.notif?'Lock-screen controls on':'Lock-screen controls off'); };
  try{
    const C=window.Capacitor, native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
    const hasMC=!!(C&&C.Plugins&&(C.Plugins.CapacitorMusicControls||C.Plugins.MusicControls));
    let perm='n/a (browser)';
    if(native&&C.Plugins.LocalNotifications){ try{ const s=await C.Plugins.LocalNotifications.checkPermissions(); perm=s.display||JSON.stringify(s); }catch(e){ perm='check failed'; } }
    const dl=$('#diagLine'); if(dl) dl.textContent='App: '+(native?'native':'browser')+' · controls: '+(hasMC?'found':'MISSING')+' · device scan: '+(canDeviceScan()?'ready':'n/a')+' · permission: '+perm;
    const de=$('#diagErr'); if(de) de.textContent='Last error: '+(lastAppError||'none');
    const dlib=$('#diagLib'); if(dlib) dlib.textContent=`Songs: ${all().length} (device ${deviceTracks.length} · files ${localTracks.length}) · folders ${store.folders.length} · playlists ${store.playlists.length} · playlist folders ${store.pfolders.length}`;
  }catch(e){}
  $('#sAu').onchange=e=>{ store.prefs.autoplay=e.target.checked; save(); };
  $('#sEx').onclick=()=>{ try{ const b=new Blob([JSON.stringify({store,at:new Date().toISOString()},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='ashs-player-backup.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000); toast('Exported'); }catch(e){ toast('Export failed'); } };
  $('#sIm').onclick=()=>$('#importFile').click();
  $('#sRe').onclick=()=>{ if(confirm('Reset likes, playlists and settings? (Music files stay until folders are removed)')){ try{localStorage.removeItem(LS_KEY);}catch(e){} location.reload(); } };
}

function normName(v,fb){ v=String(v==null?'':v).trim(); return (v&&!/^<unknown>$/i.test(v))?v:fb; }
function albumGroups(){ const m=new Map();
  all().forEach(t=>{ const a=normName(t.album,'Unknown album'), ar=normName(t.artist,'Unknown artist'); const k=ar+'\n'+a;
    if(!m.has(k)) m.set(k,{artist:ar,album:a,ids:[],cover:null,hue:t.hue});
    const g=m.get(k); g.ids.push(t.id); if(!g.cover&&t.coverUrl) g.cover=t.coverUrl; });
  return [...m.values()].sort((x,y)=>x.album.localeCompare(y.album)); }
function artistGroups(){ const m=new Map();
  all().forEach(t=>{ const ar=normName(t.artist,'Unknown artist');
    if(!m.has(ar)) m.set(ar,{artist:ar,ids:[],cover:null,hue:t.hue});
    const g=m.get(ar); g.ids.push(t.id); if(!g.cover&&t.coverUrl) g.cover=t.coverUrl; });
  return [...m.values()].sort((x,y)=>x.artist.localeCompare(y.artist)); }
function groupArt(letter, cover, hue){
  if(cover) return `<div class="t-art"><img src="${esc(cover)}" alt="" loading="lazy"/></div>`;
  return `<div class="t-art" style="${artStyle({hue:hue??200})}">${esc(letter||'A')}</div>`;
}
function colTracks(){ if(!activeCol) return [];
  if(activeCol.type==='al'){ const [ar,al]=String(activeCol.key).split('\n');
    return all().filter(t=>normName(t.artist,'Unknown artist')===ar&&normName(t.album,'Unknown album')===al); }
  if(activeCol.type==='ar'){ return all().filter(t=>normName(t.artist,'Unknown artist')===activeCol.key); }
  const src = activeCol.type==='pl'
    ? (store.playlists.find(p=>p.id===activeCol.id)?.trackIds||[])
    : activeCol.type==='pf'
    ? pfFlatTrackIds(activeCol.id)
    : (store.folders.find(f=>f.id===activeCol.id)?.trackIds||[]);
  return src.map(getT).filter(Boolean); }
function paintColSongs(ts, empty){
  const el=$('#listSongs'); el.innerHTML='';
  if(!ts.length) el.innerHTML=`<p class="muted center">${empty}</p>`;
  ts.slice(0,300).forEach(t=>el.appendChild(trackRow(t)));
  if(ts.length>300){ const p=document.createElement('p'); p.className='muted center'; p.textContent='+'+(ts.length-300)+' more'; el.appendChild(p); }
  return el;
}
function openAlbum(artist,album){ activeCol={type:'al',key:artist+'\n'+album};
  $('#listAddSongs').style.display='none';
  $('#listTitle').textContent=album;
  const ts=colTracks(); const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listSub').textContent=artist+' · '+ts.length+' songs'+(tot?' · '+fmt(tot):'');
  paintColSongs(ts,'Empty album');
  $('#listOverlay').classList.remove('hidden'); }
function openArtist(artist){ activeCol={type:'ar',key:artist};
  $('#listAddSongs').style.display='none';
  $('#listTitle').textContent=artist;
  const ts=colTracks(); const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listSub').textContent=ts.length+' songs'+(tot?' · '+fmt(tot):'');
  paintColSongs(ts,'Empty artist');
  $('#listOverlay').classList.remove('hidden'); }
function paintPlaylistSongs(pid){ const pl=store.playlists.find(p=>p.id===pid); if(!pl) return;
  $('#listTitle').textContent=pl.name; $('#listSub').textContent=pl.trackIds.length+' songs';
  const el=$('#listSongs'); el.innerHTML='';
  const ts=pl.trackIds.map(getT).filter(Boolean);
  if(!ts.length) el.innerHTML='<p class="muted center">Empty — add songs with the ••• menu</p>';
  ts.slice(0,300).forEach(t=>el.appendChild(trackRow(t,{reorder:(id,dir)=>{ const i=pl.trackIds.indexOf(id); if(moveInList(pl.trackIds,i,dir)){ save(); flashId=id; paintPlaylistSongs(pid); } }})));
  if(ts.length>300){ const p=document.createElement('p'); p.className='muted center'; p.textContent='+'+(ts.length-300)+' more'; el.appendChild(p); } }
function openPlaylist(pid){ const pl=store.playlists.find(p=>p.id===pid); if(!pl) return; activeCol={type:'pl',id:pid};
  $('#listAddSongs').style.display=''; $('#listAddSongs').textContent='＋ Add songs';
  paintPlaylistSongs(pid);
  $('#listOverlay').classList.remove('hidden'); }
function openFolder(fid){ const f=store.folders.find(x=>x.id===fid); if(!f) return; activeCol={type:'fo',id:fid};
  paintFolderList(f);
  $('#listOverlay').classList.remove('hidden'); }
function paintFolderList(f){
  $('#listAddSongs').style.display='none';
  $('#listTitle').textContent=f.name;
  const ts=f.trackIds.map(getT).filter(Boolean);
  const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listSub').textContent=ts.length+' songs'+(tot?' · '+fmt(tot):'');
  const el=paintColSongs(ts,'Empty folder');
  if(ts.some(t=>t.source==='local')){
    const del=document.createElement('button'); del.className='neon-btn ghost'; del.textContent='Remove folder + songs';
    del.onclick=async()=>{ if(!confirm('Remove "'+f.name+'" and its '+ts.length+' songs from the library?')) return;
      for(const tid of f.trackIds){ await idbDel(tid); purgeTrackMeta(tid); }
      store.folders=store.folders.filter(x=>x.id!==f.id);
      if(currentId&&f.trackIds.includes(currentId)){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
      await loadLocal(); save(); bumpLib(); $('#listOverlay').classList.add('hidden'); render(); toast('Folder removed'); };
    el.appendChild(del);
  } else if(f.kind==='device'){
    const p=document.createElement('p'); p.className='muted center'; p.style.fontSize='12.5px';
    p.textContent='Scanned from your device — files stay untouched.';
    el.appendChild(p);
  }
  $('#listOverlay').classList.remove('hidden'); }

/* Liked Music — the automatic home of every ♥ song. Always in sync with the
   hearts you tap; nothing is copied or moved, it just gathers what you liked. */
function openLikes(){ activeCol={type:'likes',id:'__likes__'};
  paintLikeList();
  $('#listOverlay').classList.remove('hidden'); }
function paintLikeList(){
  $('#listAddSongs').style.display='none';
  $('#listTitle').textContent='Liked Music';
  const ts=store.likes.map(getT).filter(Boolean);
  const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listSub').textContent=ts.length?ts.length+(ts.length===1?' song':' songs')+(tot?' · '+fmt(tot):''):'Nothing liked yet';
  paintColSongs(ts,'Tap ♥ on any song — your favorites collect here');
  $('#listOverlay').classList.remove('hidden'); }

/* Playlist-folder screen: shows contained playlists/nested folders. */
function openPFolder(fid){ const f=pfGet(fid); if(!f) return; activeCol={type:'pf',id:fid};
  paintPFolder(f);
  $('#listOverlay').classList.remove('hidden'); }
function paintPFolder(f){
  $('#listAddSongs').style.display='';
  $('#listAddSongs').textContent='＋ New playlist';
  const c=pfCounts(f);
  const ts=pfFlatTrackIds(f.id).map(getT).filter(Boolean);
  const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listTitle').textContent=f.name;
  $('#listSub').textContent=pfCountsText(c)
    +(ts.length?' · '+ts.length+' songs'+(tot?' · '+fmt(tot):''):'');
  const el=$('#listSongs'); el.innerHTML='';
  if(!(f.childIds||[]).length){
    el.innerHTML=`<p class="muted center"><b>This folder is empty</b><br/>Click New Playlist to create a new playlist in this folder, or move playlists here from the Playlists list.</p>`;
    return;
  }
  const fols=[], pls=[];
  (f.childIds||[]).forEach(cid=>{
    if(String(cid).startsWith('pf_')){ const x=pfGet(cid); if(x) fols.push(x); }
    else{ const x=store.playlists.find(p=>p.id===cid); if(x) pls.push(x); }
  });
  fols.forEach(x=>el.appendChild(pfRow(x)));
  pls.forEach(x=>el.appendChild(plRow(x)));
}

function songPicker(pid){
  const pl=store.playlists.find(p=>p.id===pid); if(!pl) return;
  const inPl=new Set(pl.trackIds);
  sheet(`<h2>Add songs</h2><p class="muted">Tick songs, then Add selected — to ${esc(pl.name)}</p><input type="text" id="pkQ" placeholder="Search songs..."/><div class="v-list" id="pkL" style="margin-top:10px"></div><button class="opt" id="pkS">Add selected</button><button class="opt" id="pkX">Close</button>`);
  const draw=(q)=>{ const el=$('#pkL'); el.innerHTML='';
    const list=all().filter(t=>!q||(t.title+' '+t.artist).toLowerCase().includes(q)).slice(0,120);
    if(!list.length) el.innerHTML='<p class="muted center">No matches</p>';
    list.forEach(t=>{ const r=document.createElement('label'); r.className='track';
      r.innerHTML=`${artHTML(t,'t-art')}<div class="t-meta"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div><input type="checkbox" data-id="${t.id}" ${inPl.has(t.id)?'checked disabled':''} style="width:20px;height:20px;accent-color:var(--acc)"/>`;
      el.appendChild(r); }); };
  draw('');
  $('#pkQ').oninput=e=>draw(e.target.value.toLowerCase().trim());
  $('#pkX').onclick=closeSheet;
  $('#pkS').onclick=()=>{ let n=0;
    $$('#pkL input:checked:not(:disabled)').forEach(c=>{ if(!pl.trackIds.includes(c.dataset.id)){ pl.trackIds.push(c.dataset.id); n++; } });
    save(); bumpLib(); closeSheet(); openPlaylist(pid); render(); toast(n?n+' song'+(n>1?'s':'')+' added':'Nothing new selected'); };
}

function folderOf(entry){ const p=entry.path||entry.webkitRelativePath||''; if(!p) return '';
  if(p.includes('/')) return p.split('/').filter(Boolean)[0]||'';
  return p;  }
function isNative(){ try{ const C=window.Capacitor; return !!(C&&C.isNativePlatform&&C.isNativePlatform()); }catch(e){ return false; } }
function pickCancelled(e){ const m=String((e&&(e.message||e.code))||e||'').toLowerCase();
  return /cancel|dismiss|close|abort|empty|no.*(select|file)/.test(m); }
function parentNameOf(p){ try{ const s=String(p||''); if(!s||s.indexOf('content:')===0) return '';
  const parts=s.split('/').filter(Boolean); if(parts.length<2) return '';
  if(!/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(parts[parts.length-1])) return '';
  return parts[parts.length-2]; }catch(e){ return ''; } }
function shrinkCover(dataUrl, max){ return new Promise(res=>{
  try{
    if(!dataUrl||dataUrl.length<200*1024) return res(dataUrl);
    const img=new Image(); img.onload=()=>{ try{
      const sc=Math.min(1,(max||160)/Math.max(img.width||1,img.height||1));
      const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(img.width*sc)); c.height=Math.max(1,Math.round(img.height*sc));
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      res(c.toDataURL('image/jpeg',0.72));
    }catch(e){ res(dataUrl); } }; img.onerror=()=>res(dataUrl); img.src=dataUrl;
    setTimeout(()=>res(dataUrl),4000);
  }catch(e){ res(dataUrl); } }); }
async function idbGet(id){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction('files','readonly').objectStore('files').get(id); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }

let durQueue = [], durRunning = false;
function durLater(id){ if(durQueue.length < 2500 && !durQueue.includes(id)) durQueue.push(id); kickDur(); }
async function loadCoverCache(){ try{ const v=await metaGet('coverCache'); if(v&&typeof v==='object') coverCache=v; }catch(e){} coversLoaded=true; }
function coversLater(){ try{
  if(!coversLoaded) return;
  let n=0;
  for(const t of all()){ if(n>=600) break;
    if(t.source==='device'&&!t.coverUrl&&!coverCache[t.id]&&!coverQueue.includes(t.id)){ coverQueue.push(t.id); n++; } }
  if(coverQueue.length) kickCovers();
 }catch(e){} }
function kickCovers(){
  if(coverRunning) return; coverRunning=true;
  if(coverQueue.length&&!coverToastShown){ coverToastShown=true; toast('Fetching album art in the background…'); }
  let done=0;
  const step=async()=>{
    try{
      if(!coversLoaded){ setTimeout(step,800); return; }
      if(!audio.paused){ setTimeout(step,3000); return; }
      const id=coverQueue.shift();
      if(id){
        try{
          const t=getT(id);
          if(t&&!t.coverUrl&&!coverCache[id]){
            const r=await fetch(t.src,{headers:{Range:'bytes=0-262143'}});
            if(r.ok||r.status===206){
              const len=+(r.headers.get('content-length')||0);
              if(!len||len<=25000000){
                const b=await r.blob();
                if(b&&b.size){ const tg=await readTags(b);
                  if(tg.coverUrl){ const small=await shrinkCover(tg.coverUrl,128);
                    if(small){ coverCache[id]=small; const t2=getT(id); if(t2) t2.coverUrl=small;
                      try{ if(t2&&t2.id===currentId) applyTrackAccent(true); }catch(e){}
                      coverDirty++; if(coverDirty%10===0){ try{metaSet('coverCache',coverCache).catch(()=>{});}catch(e){} }
                      done++; if(done%8===0) render(); } } } } } }
        }catch(e){}
        setTimeout(step,900); return;
      }
    }catch(e){}
    coverRunning=false;
    try{ if(coverDirty) metaSet('coverCache',coverCache).catch(()=>{}); }catch(e){}
    coverDirty=0; render();
  };
  setTimeout(step,1500);
}
function kickDur(){
  if(durRunning) return; durRunning = true;
  const step = async ()=>{
    try{
      if(!audio.paused){ setTimeout(step, 2000); return; }
      const id = durQueue.shift();
      if(id){
        try{
          const rec = await idbGet(id);
          if(rec && rec.blob){
            const d = await probeDur(rec.blob).catch(()=>0);
            if(d > 0){
              const prev = store.localMeta[id]||{}; prev.duration = d; store.localMeta[id] = prev;
              const t = getT(id); if(t) t.duration = d;
              if(durQueue.length % 10 === 0) save();
              if(durQueue.length % 25 === 0) render();
            }
          }
        }catch(e){}
        setTimeout(step, 400); return;
      }
    }catch(e){}
    durRunning = false; try{ save(); render(); }catch(_){}
  };
  setTimeout(step, 400);
}
async function handleFiles(files, folderHint, opts){
  const norm=[...files].map(f=> f instanceof Blob
    ? { name:f.name||'song', blob:f, path:f.webkitRelativePath||'', size:f.size||0 }
    : { name:f.name||'song', blob:f.blob||f, path:f.path||'', size:f.size||(f.blob&&f.blob.size)||0 });
  let arr=norm.filter(f=>f.blob&&((f.blob.type||'').startsWith('audio')||/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(f.name||'')));
  if(!arr.length) return toast('No audio files found');
  if(arr.length>2500){ toast('Large pick — importing first 2500'); arr=arr.slice(0,2500); }
  let known=new Set();
  try{ (await idbAll()).forEach(r=>known.add((r.folder||'')+'|'+r.name+'|'+(r.size||0))); }catch(e){}
  const groups=new Map();
  arr.forEach(f=>{ const g=folderHint||folderOf(f)||'My Music'; if(!groups.has(g)) groups.set(g,[]); groups.get(g).push(f); });
  segTo('folders'); tab('library'); // show progress live while importing
  let imported=0, skipped=0, touched=[];
  for(const [folderName, list] of groups){
    let folder=store.folders.find(x=>x.name===folderName);
    if(!folder){ folder={id:'f_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), name:folderName, trackIds:[]}; store.folders.push(folder); }
    for(const f of list){
      const key=folderName+'|'+f.name+'|'+(f.size||0);
      if(known.has(key)){ skipped++; continue; }
      try{
        const id='local_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
        let title=(f.name||'song').replace(/\.[^.]+$/,''), artist=folderName, cover=undefined;
        try{ const tg=await readTags(f.blob); if(tg.title) title=tg.title; if(tg.artist) artist=tg.artist; if(tg.coverUrl) cover=await shrinkCover(tg.coverUrl,160); }catch(e){}
        await idbPut({id,name:f.name,title,artist,blob:f.blob,folder:folderName,duration:0,size:f.size||0,cover:cover||''});
        store.addedAt[id]=Date.now(); folder.trackIds.push(id); known.add(key); imported++;
        if(freshIds.size<60) freshIds.add(id);
        durLater(id); // duration fills in quietly afterwards
        if(!touched.includes(folderName)) touched.push(folderName);
      }catch(e){ console.warn('skipped file', f && f.name, e); skipped++; }
      await new Promise(r=>setTimeout(r,0));
      if(imported>0&&imported%25===0){ save(); render(); }
    }
  }
  save(); await loadLocal(); save(); bumpLib(); render(); segTo('folders'); tab('library');
  if(!(opts&&opts.quiet)){
    if(imported) toast(imported+' song'+(imported===1?'':'s')+' added'+(touched.length===1?' to '+touched[0]:'')+(skipped?' · '+skipped+' skipped':'')+' · times fill in shortly');
    else toast(skipped?'Already in library — nothing new':'No audio files found');
  } }
function canDeviceScan(){ try{ const C=window.Capacitor; return isNative()&&!!(C.Plugins.MediaLibrary&&C.Plugins.MediaLibrary.listAudio); }catch(e){ return false; } }
function addMenu(){ const nat=isNative(), scan=canDeviceScan();
  sheet(`<h2>Add music</h2><p class="muted">Stays on your device · plays offline forever</p>
  ${scan?'<button class="opt" id="aScan">Scan device music (auto — fastest)</button>':''}
  <button class="opt" id="aAuto">${nat?'Pick songs from a folder (then Select all)':'Scan a whole folder at once'}</button>
  <button class="opt" id="aFolder">${nat?'Pick from another folder':'Choose songs from a folder (then Select-all)'}</button>
  <button class="opt" id="aSongs">Choose songs (pick many at once)</button>
  <p class="muted" style="font-size:12.5px">${scan
    ? 'Scan finds every song on the phone at once — no ticking files one by one. Manual pick still works for anything the scan misses.'
    : nat
    ? 'The system picker opens, you navigate into a folder and tap Select-all (or tick songs). Everything imports together. Repeat per folder.'
    : 'Open a folder, long-press one song (or use Select-all) to grab everything at once. Google Drive sends one song at a time — download songs to your device first. You can pick repeatedly; everything lands in the same folder.'}</p>
  <button class="opt" id="aX">Close</button>`);
  $('#aX').onclick=closeSheet;
  const sc=$('#aScan'); if(sc) sc.onclick=()=>{ closeSheet(); scanDevice({}); };
  $('#aAuto').onclick=()=>{ closeSheet(); pickWatchFolder(); };
  $('#aFolder').onclick=()=>{ closeSheet(); nativeOr(()=>$(isNative()?'#fileInput':'#folderInput').click(),{folderHint:'Device Music'}); };
  $('#aSongs').onclick=()=>{ closeSheet(); nativeOr(()=>$('#fileInput').click()); }; }

async function pickWatchFolder(){
  if(isNative()){ await pickFolderNative(); return; }
  if(!window.showDirectoryPicker){ $('#folderInput').click(); return; }
  try{
    const dir=await window.showDirectoryPicker({mode:'read'});
    toast('Scanning '+dir.name+'…');
    await scanAndImport(dir, dir.name);
  }catch(e){ if(e?.name!=='AbortError') toast('Could not read that folder'); }
}
async function pickFolderNative(){
  toast('Open a folder, then Select all');
  await nativeOr(()=>{ const f=$('#fileInput'); if(f) f.click(); },{folderHint:'Device Music'});
}
async function scanAndImport(dir, folderName){
  const files=[];
  async function walk(handle){
    for await (const entry of handle.values()){
      if(entry.kind==='file'){
        try{ const f=await entry.getFile();
          if((f.type||'').startsWith('audio')||/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(f.name))
            files.push({name:f.name, blob:f, path:'', size:f.size||0});
        }catch(e){}
        if(files.length>800) return;
      } else if(entry.kind==='directory'){ try{ await walk(entry); }catch(e){} }
    }
  }
  try{ await walk(dir); }catch(e){ toast('Scan stopped'); return 0; }
  if(!files.length){ toast('No songs found in '+folderName); return 0; }
  let have=new Set();
  try{ (await idbAll()).forEach(r=>{ if(r.folder===folderName) have.add(r.name+'|'+(r.size||0)); }); }catch(e){}
  const fresh=files.filter(f=>!have.has(f.name+'|'+(f.size||0)));
  if(!fresh.length){ toast(folderName+' is already up to date'); return 0; }
  await handleFiles(fresh, folderName, {quiet:true});
  toast(fresh.length+' new song'+(fresh.length>1?'s':'')+' added from '+folderName);
  return fresh.length;
}

async function nativePickAudio(){
  try{
    const C=window.Capacitor;
    const FP=C&&C.isNativePlatform&&C.isNativePlatform()&&(C.Plugins.FilePicker||C.Plugins.CapacitorFilePicker);
    if(!FP||!FP.pickFiles) return null;
    let r;
    try{ r=await FP.pickFiles({limit:0}); }
    catch(e){ if(pickCancelled(e)) return {cancelled:true}; try{ r=await FP.pickFiles(); }catch(e2){ if(pickCancelled(e2)) return {cancelled:true}; throw e2; } }
    const picked=(r&&r.files)||[];
    if(!picked.length) return {cancelled:true};
    const out=[];
    for(const x of picked){
      try{
        let blob=x.blob||null;
        if(!blob&&x.webPath){ try{ const resp=await fetch(x.webPath); if(resp.ok) blob=await resp.blob(); }catch(e){} }
        if(!blob&&x.path&&C.convertFileSrc){ try{ const resp=await fetch(C.convertFileSrc(x.path)); if(resp.ok) blob=await resp.blob(); }catch(e){} }
        if(!blob) continue;
        const name=x.name||('song'+(out.length+1)+'.mp3');
        if(!/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(name)&&!(blob.type||'').startsWith('audio')) continue;
        out.push({name:name, blob:blob, path:parentNameOf(x.path), size:blob.size||x.size||0});
      }catch(e){}
    }
    return {files:out};
  }catch(e){ console.warn('native pick failed', e); return null; }
}
async function nativeOr(fallback, opts){
  opts=opts||{};
  if(!isNative()){ fallback(); return; }
  const res=await nativePickAudio();
  if(res&&res.cancelled) return; // backed out of the picker — don't pop another one up
  if(res&&res.files&&res.files.length){
    toast('Importing '+res.files.length+' file'+(res.files.length>1?'s':'')+'…');
    await handleFiles(res.files, opts.folderHint);
    return;
  }
  if(res&&res.files) toast('Could not read those files — trying built-in picker');
  fallback(); // plugin missing/failed: WebView <input> opens the system picker on Android
}
function readTags(f){ return new Promise(res=>{ let done=false; const fin=o=>{ if(!done){done=true; res(o);} };
  if(!window.jsmediatags) return fin({});
  try{ window.jsmediatags.read(f,{onSuccess:t=>{const g=(t&&t.tags)||{};const o={title:g.title,artist:g.artist,album:g.album};
    try{ const pic=g.picture; if(pic&&pic.data&&pic.data.length){
      if(pic.data.length>700*1024){  }
      else { let b=''; const d=pic.data; for(let i=0;i<d.length;i++) b+=String.fromCharCode(d[i]); o.coverUrl=`data:${pic.format||'image/jpeg'};base64,${btoa(b)}`; }
    }}catch(e){} fin(o);},onError:()=>fin({})});
    setTimeout(()=>fin({}),5000); }catch(e){ fin({}); } }); }
function probeDur(f){ return new Promise(res=>{ let done=false; const fin=v=>{ if(!done){done=true; res(v);} };
  try{ const u=URL.createObjectURL(f); const a=new Audio(); a.preload='metadata'; a.src=u;
    a.onloadedmetadata=()=>{ const d=Math.round(a.duration||0); try{URL.revokeObjectURL(u);}catch(e){} fin(isFinite(d)?d:0); };
    a.onerror=()=>{ try{URL.revokeObjectURL(u);}catch(e){} fin(0); };
    setTimeout(()=>{ try{URL.revokeObjectURL(u);}catch(e){} fin(0); },8000);
  }catch(e){ fin(0); } }); }

function bind(){
  $$('.bottom-nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  const hs=$('#homeSettings'); if(hs) hs.onclick=settingsSheet;
  const ls=$('#libSettings'); if(ls) ls.onclick=settingsSheet;
  $$('.themeToggle').forEach(b=>b.onclick=()=>{ const cur=document.documentElement.dataset.theme||'dark'; store.prefs.theme=cur==='light'?'dark':'light'; save(); render(); });
  const sap=$('#seeAllPopular'); if(sap) sap.onclick=()=>tab('new');
  const spl=$('#seeAllPl'); if(spl) spl.onclick=()=>{ tab('library'); segTo('playlists'); };
  const sinput=$('#searchInput'); if(sinput){
    sinput.addEventListener('input',e=>{ const c=$('#clearSearch'); if(c) c.classList.toggle('hidden',!e.target.value);
      homeQ=(e.target.value||'').trim().toLowerCase();
      if(homeQ) openSearchOverlay(); else closeSearchOverlay(); });
    sinput.addEventListener('focus',()=>{ if(homeQ) openSearchOverlay(); });
  }
  const cbtn=$('#clearSearch'); if(cbtn) cbtn.onclick=()=>{ $('#searchInput').value=''; homeQ=''; cbtn.classList.add('hidden'); closeSearchOverlay(); };
  const sb=$('#searchBack'); if(sb) sb.onclick=()=>closeSearchOverlay();
  const deb=(fn)=>{ clearTimeout(searchDeb); searchDeb=setTimeout(fn,160); };
  const sin2=$('#songsSearch'); if(sin2){
    sin2.addEventListener('input',e=>{ const c=$('#clearSongsSearch'); if(c) c.classList.toggle('hidden',!e.target.value);
      deb(()=>{ songsQ=(e.target.value||'').trim().toLowerCase(); render(); }); });
  }
  const cs2=$('#clearSongsSearch'); if(cs2) cs2.onclick=()=>{ $('#songsSearch').value=''; songsQ=''; cs2.classList.add('hidden'); render(); };
  const stg=$('#selectToggle'); if(stg) stg.onclick=()=>setSelecting(!selecting);
  const sa=$('#selAll'); if(sa) sa.onclick=()=>{ const vis=lastSongsVis.map(t=>t.id).filter(id=>getT(id));
    if(vis.length&&vis.every(id=>selected.has(id))) vis.forEach(id=>selected.delete(id));
    else vis.forEach(id=>selected.add(id)); render(); };
  const sd=$('#selDel'); if(sd) sd.onclick=()=>deleteSelected();
  const sp2=$('#selPl'); if(sp2) sp2.onclick=()=>playlistFromSelected();
  const sx=$('#selX'); if(sx) sx.onclick=()=>setSelecting(false);
  const lin=$('#libSearch'); if(lin){
    lin.addEventListener('input',e=>{ const c=$('#clearLibSearch'); if(c) c.classList.toggle('hidden',!e.target.value);
      deb(()=>{ libQ=(e.target.value||'').trim().toLowerCase(); render(); }); });
  }
  const clb=$('#clearLibSearch'); if(clb) clb.onclick=()=>{ $('#libSearch').value=''; libQ=''; clb.classList.add('hidden'); render(); };
  const add=()=>addMenu();
  const ab2=$('#addMusicBtn2'); if(ab2) ab2.onclick=add;
  const la=$('#libAdd'); if(la) la.onclick=add;
  const qA=$('#quickAdd'); if(qA) qA.onclick=add;
  const lk=$('#likesCard'); if(lk) lk.onclick=openLikes;
  const qS=$('#quickShuffle'); if(qS) qS.onclick=()=>{ const l=all(); if(!l.length) return toast('Add music first'); store.prefs.shuffle=true; save(); playTrack(l[Math.floor(Math.random()*l.length)].id,{open:true,keepRadio:true}); render(); };
  const qM=$('#quickMix'); if(qM) qM.onclick=()=>{ tab('radio'); const rt=$('#radioToggle'); if(rt) rt.click(); };
  const fi=$('#fileInput'); if(fi) fi.onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  const fo=$('#folderInput'); if(fo) fo.onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  const im=$('#importFile'); if(im) im.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(d&&d.store){ store=sanitizeStore(d.store); save(); applyVolume(); applyEQ(); bumpLib(); render(); toast('Backup restored'); } else toast('Invalid backup'); }catch(err){ toast('Invalid backup file'); } }; r.readAsText(f); e.target.value=''; };
  $$('.seg button').forEach(b=>b.onclick=()=>segTo(b.dataset.seg));
  const npb=$('#newPlaylistBtn'); if(npb) npb.onclick=newPlaylist;
  const nfb=$('#newFolderBtn'); if(nfb) nfb.onclick=newFolder;
  const mplay=$('#miniPlay'); if(mplay) mplay.onclick=e=>{ e.stopPropagation(); avToggle(); };
  const mnext=$('#miniNext'); if(mnext) mnext.onclick=e=>{ e.stopPropagation(); next(); };
  const mp=$('#miniPlayer'); if(mp){ let mpSwiped=false, mx=0;
    mp.addEventListener('touchstart',e=>{ mx=e.touches[0].clientX; },{passive:true});
    mp.addEventListener('touchend',e=>{ const dx=e.changedTouches[0].clientX-mx;
      if(Math.abs(dx)>60){ mpSwiped=true; dx<0?next():prev(); } },{passive:true});
    mp.onclick=()=>{ if(mpSwiped){ mpSwiped=false; return; } $('#playerOverlay').classList.remove('hidden'); }; }
  const pb=$('#plBack'); if(pb) pb.onclick=()=>$('#playerOverlay').classList.add('hidden');
  const pp=$('#plPlay'); if(pp) pp.onclick=avToggle;
  const pn=$('#plNext'); if(pn) pn.onclick=()=>next();
  const pv=$('#plPrev'); if(pv) pv.onclick=prev;
  const ps=$('#plShuffle'); if(ps) ps.onclick=()=>{ store.prefs.shuffle=!store.prefs.shuffle; save(); render(); toast(store.prefs.shuffle?'Shuffle on':'Shuffle off'); };
  const prp=$('#plRepeat'); if(prp) prp.onclick=cycleRepeat;
  const plk=$('#plLike'); if(plk) plk.onclick=()=>{ if(!currentId) return; const i=store.likes.indexOf(currentId); i>=0?store.likes.splice(i,1):store.likes.push(currentId); save(); bumpLib(); render(); try{ plk.classList.remove('pop'); void plk.offsetWidth; plk.classList.add('pop'); }catch(e){} };
  const pqb=$('#plQueueBtn'); if(pqb) pqb.onclick=queueSheet;
  const pm=$('#plMenu'); if(pm) pm.onclick=()=>{ if(currentId) songMenu(currentId); };
  const ply=$('#plLyricsBtn'); if(ply) ply.onclick=()=>{ if(currentId) lyrEditor(currentId); else toast('Play a song first'); };
  const sbox=$('#plLyrSync'); if(sbox) sbox.onclick=()=>{ showPlainLyr=true; render(); };
  const sprev=$('#plLyrPreview'); if(sprev) sprev.onclick=()=>{ if(store.synced&&store.synced[currentId]){ showPlainLyr=false; render(); } };
  const peq=$('#plEqBtn'); if(peq) peq.onclick=eqSheet;
  const psl=$('#plSleepBtn'); if(psl) psl.onclick=sleepSheet;
  const sk=$('#plSeek'); if(sk){ sk.addEventListener('pointerdown',()=>seeking=true); sk.addEventListener('pointerup',()=>seeking=false);
    sk.addEventListener('input',e=>{ const d=audio.duration||0; if(d&&isFinite(d)) audio.currentTime=e.target.value/1000*d; });
    sk.addEventListener('change',()=>{ seeking=false; try{mcUpdateElapsed();}catch(e){} }); }
  const pv2=$('#plVol'); if(pv2) pv2.addEventListener('input',e=>{ store.volumes.vol=+e.target.value; const o=$('#plVolVal'); if(o) o.textContent=e.target.value; applyVolume(); save(); });
  const rt=$('#radioToggle'); if(rt) rt.onclick=()=>{ if(!audio.paused&&currentId){ audio.pause(); render(); return; }
    if(!all().length) return toast('Add music first');
    store.radio=true; save();
    if(queue.length){ const id=queue.shift(); playTrack(id,{open:true,fromRadio:true,keepRadio:true}); }
    else { const l=all(); if(l.length) playTrack(l[Math.floor(Math.random()*l.length)].id,{open:true,fromRadio:true,keepRadio:true}); }
    render(); };
  const lb=$('#listBack'); if(lb) lb.onclick=()=>$('#listOverlay').classList.add('hidden');
  const lpa=$('#listPlayAll'); if(lpa) lpa.onclick=()=>{ const ts=colTracks(); if(!ts.length) return; const len=ts.length;
    queue=[...ts.slice(1).map(t=>t.id),...queue]; playTrack(ts[0].id,{open:true,keepRadio:true}); render();
    if(len>1){ const fc=activeCol&&activeCol.type==='pf'?pfGet(activeCol.id):null;
      const pc=activeCol&&activeCol.type==='pl'?store.playlists.find(p=>p.id===activeCol.id):null;
      toast('Playing from '+(fc?fc.name:pc?pc.name:'playlist')); } };
  const lsh=$('#listShuffle'); if(lsh) lsh.onclick=()=>{ const ts=colTracks(); if(!ts.length) return; const first=ts[Math.floor(Math.random()*ts.length)];
    queue=[...ts.filter(t=>t.id!==first.id).map(t=>t.id).sort(()=>Math.random()-0.5),...queue]; playTrack(first.id,{open:true,keepRadio:true}); render(); };
  const las=$('#listAddSongs'); if(las) las.onclick=()=>{ if(!activeCol) return;
    if(activeCol.type==='pl') songPicker(activeCol.id);
    else if(activeCol.type==='pf') newPlaylistInto(activeCol.id); };
  ['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); $('#dropOverlay').classList.remove('hidden'); }));
  ['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); if(ev==='dragleave'&&e.relatedTarget) return; $('#dropOverlay').classList.add('hidden'); }));
  document.addEventListener('drop',e=>{ if(e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  document.addEventListener('keydown',e=>{ if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName||'')) return;
    if(e.code==='Space'){ e.preventDefault(); toggle(); } else if(e.key==='ArrowRight') audio.currentTime+=10;
    else if(e.key==='ArrowLeft') audio.currentTime-=10; else if(e.key==='Escape'){ if(!$('#sheetBack').classList.contains('hidden')) closeSheet(); else if(selecting) setSelecting(false); else { closeSearchOverlay(); $('#playerOverlay').classList.add('hidden'); $('#listOverlay').classList.add('hidden'); } } });
  const swipeDownClose=(el,onClose)=>{ if(!el) return; let sy=0, sx=0;
    el.addEventListener('touchstart',e=>{ sy=e.touches[0].clientY; sx=e.touches[0].clientX; },{passive:true});
    el.addEventListener('touchend',e=>{
      try{ if(e.target&&e.target.closest&&e.target.closest('input,button,textarea,select,a,label')) return; }catch(_){}
      if(el.scrollTop>8) return;
      const dy=e.changedTouches[0].clientY-sy, dx=e.changedTouches[0].clientX-sx;
      if(dy>90&&Math.abs(dy)>Math.abs(dx)*1.4) onClose();
    },{passive:true}); };
  swipeDownClose($('#playerOverlay'),()=>$('#playerOverlay').classList.add('hidden'));
  swipeDownClose($('#listOverlay'),()=>$('#listOverlay').classList.add('hidden'));
  swipeDownClose($('#searchOverlay'),()=>closeSearchOverlay());
  let tx=0, ty=0; const fp=$('#playerOverlay');
  fp.addEventListener('touchstart',e=>{ tx=e.touches[0].clientX; ty=e.touches[0].clientY; },{passive:true});
  fp.addEventListener('touchend',e=>{
    try{ if(e.target&&e.target.closest&&e.target.closest('input,button,textarea,select,a,label,.pl-lyr-sync,.pl-lyr')) return; }catch(_){}
    const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
    if(Math.abs(dx)>70&&Math.abs(dy)<60){ dx<0?next():prev(); }
  },{passive:true});
  nativeBack();
  moveNavGlider('home');
  window.addEventListener('resize',()=>{ const a=document.querySelector('.bottom-nav button.active'); moveNavGlider(a&&a.dataset.tab); });
}
function segTo(s){ libSeg=s; $$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.seg===s));
  ['folders','playlists'].forEach(k=>$('#lib'+k[0].toUpperCase()+k.slice(1)).classList.toggle('hidden',s!==k));
  $('#newPlaylistBtn').classList.toggle('hidden',s!=='playlists');
  const nfb=$('#newFolderBtn'); if(nfb) nfb.classList.toggle('hidden',s!=='playlists'); }

(async function(){
  DEMO.forEach((d,i)=>{ if(!store.addedAt[d.id]) store.addedAt[d.id]=Date.now()-(100-i)*60000; });
  try{ if(isNative()&&store.prefs.notifMigrated!==true){ store.prefs.notif=true; store.prefs.notifMigrated=true; save(); } }catch(e){}
  try{ let scrub=false; Object.keys(store.localMeta||{}).forEach(k=>{ if(store.localMeta[k]&&store.localMeta[k].cover){ delete store.localMeta[k].cover; scrub=true; } }); if(scrub) save(); }catch(e){}
  try{ lastAppError=localStorage.getItem('ashs_last_err')||''; }catch(e){}
  rebuild(); bind(); applyVolume(); render();
  try{ if(window.matchMedia) matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{ if(store.prefs.theme==='system') render(); }); }catch(e){}
  ensureNotifPerm();
  await loadLocal();
  await loadCoverCache();
  await scanDevice({silent:true});
  render();
  if(currentId&&getT(currentId)){ try{ setSrcSafe(getT(currentId)); }catch(e){ try{audio.src=getT(currentId).src;}catch(_){} } audio.playbackRate=store.prefs.speed||1; applyVolume(); render(); }
  try{ document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&actx&&actx.state==='suspended'&&!audio.paused) actx.resume().catch(()=>{}); }); }catch(e){}
  /* Reconcile the whole UI when the app comes back to the foreground:
     tracks advanced (notification controls / auto-next) while backgrounded
     must show their real title, art, plate and position immediately. */
  try{ document.addEventListener('visibilitychange',()=>{
    if(document.hidden) return;
    try{ _rafPend=false; }catch(e){}
    try{ paintProgress(); }catch(e){}
    try{ render(); }catch(e){}
  }); }catch(e){}
  console.log('%cAsh\'s Player ready — '+all().length+' tracks','color:#2dd4bf;font-weight:bold');
})();
