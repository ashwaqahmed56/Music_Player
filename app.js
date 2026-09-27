const APP_VERSION='3.6';
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
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

const ACCENTS = {
  clay:{a:'#d97a4a'}, moss:{a:'#7d8c5c'}, ochre:{a:'#c99a2b'},
  slate:{a:'#5b7a8c'}, plum:{a:'#8c5b7a'}
};
function defStore(){ return {
  likes:[], playlists:[], folders:[], recents:[], playCounts:{}, addedAt:{}, lyrics:{},
  volumes:{vol:100}, prefs:{shuffle:false, repeat:'off', speed:1, autoplay:true, theme:'system', accent:'clay', songSort:'az', newSort:'new', notif:true},
  eq:{enabled:false, gains:[0,0,0,0,0], preset:'Normal'},
  localMeta:{}, customTitles:{}, currentId:null, radio:false
};}
let store = (()=>{ try{ const r=localStorage.getItem(LS_KEY); if(r){ const d=defStore(); return Object.assign(d, JSON.parse(r)); } }catch(e){} return defStore(); })();
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch(e){} }

let localTracks = [], deviceTracks = [], cache = [];
let coverCache = {}, coversLoaded = false, coverQueue = [], coverRunning = false, coverDirty = 0, coverToastShown = false;
function hashHue(name){ let h=0; const s=String(name||'?'); for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))%360; } return h; }
function rebuild(){
  const base = (localTracks.length||deviceTracks.length) ? [] : DEMO.map(d=>({...d}));
  cache = [...localTracks, ...deviceTracks, ...base];
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
  deviceTracks.forEach(t=>{ const g=t.folder||'Device Music'; (groups[g]=groups[g]||[]).push(t.id); });
  const hidden=store.hiddenDeviceFolders||[];
  store.folders=store.folders.filter(f=>f.kind!=='device');
  Object.keys(groups).sort().forEach(g=>{
    if(hidden.includes(g)) return;
    store.folders.push({id:'df_'+hashHue(g)+'_'+g.length+'_'+(g.charCodeAt(0)||0), name:g, trackIds:groups[g], kind:'device'});
  });
  save(); rebuild();
  if(!opts.silent){
    toast(deviceTracks.length?deviceTracks.length+' songs found on device':'No music found on device');
    segTo('folders'); tab('library'); render();
  }
  coversLater();
  return deviceTracks.length;
}
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

let listLimit = 120, lastListKey = '';
function paintMore(el, list, empty){
  paint(el, list.slice(0, listLimit), empty);
  if(list.length > listLimit){
    const b = document.createElement('button');
    b.className = 'btn tonal sm'; b.style.width = '100%'; b.style.marginTop = '8px';
    b.textContent = 'Show more ('+(list.length-listLimit)+' left)';
    b.onclick = ()=>{ listLimit += 200; render(); };
    el.appendChild(b);
  }
}

function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('nova_music_db',2);
  r.onupgradeneeded=()=>{ const db=r.result;
    if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
    if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'key'});
  };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function metaGet(k){ const db=await idb();
  return new Promise((res,rej)=>{ const q=db.transaction('meta','readonly').objectStore('meta').get(k);
    q.onsuccess=()=>res(q.result?q.result.value:undefined); q.onerror=()=>rej(q.error); }); }
async function metaSet(k,v){ const db=await idb();
  return new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put({key:k,value:v});
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbPut(o){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').put(o); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbAll(){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction('files','readonly').objectStore('files').getAll(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); }); }
async function idbDel(id){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').delete(id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function loadLocal(){ try{ const recs=await idbAll();
  localTracks = recs.map(r=>({ id:r.id, title:r.title||r.name, artist:r.artist||'My Music', album:r.folder||'My Files', folder:r.folder||'My Music', src:URL.createObjectURL(r.blob), source:'local', duration:r.duration||0, fileName:r.name, hue:hashHue((r.title||r.name)+(r.artist||'')), coverUrl:r.cover||undefined }));
 }catch(e){ localTracks=[]; } rebuild(); }

const audio = $('#audio');
try{ audio.removeAttribute('crossorigin'); }catch(e){}
function applyVolume(){ const v=Math.min(100,Math.max(0,store.volumes.vol??100)); audio.volume=v/100;
  const pv=$('#plVol'); if(pv) pv.value=String(v); const pvv=$('#plVolVal'); if(pvv) pvv.textContent=String(v); }
applyVolume();
audio.playbackRate = store.prefs.speed || 1;
let actx=null, eqNodes=[], analyser=null, graphOK=false, seeking=false;
function isPublicHttp(u){ return /^https?:/i.test(u||'') && !/localhost|127\.0\.0\.1/i.test(u||''); }
function setSrcSafe(t){
  try{
    const s = t.src||'';
    const noCors = /^(blob|content):/i.test(s) || /localhost|127\.0\.0\.1|_capacitor_/i.test(s);
    if(noCors){ try{audio.removeAttribute('crossOrigin');}catch(e){} try{audio.crossOrigin=null;}catch(e){} }
    else if(/^https?:/i.test(s)){ audio.crossOrigin='anonymous'; }
    else { try{audio.removeAttribute('crossOrigin');}catch(e){} }
  }catch(e){}
  try{ if(audio.getAttribute('src')!==t.src) audio.src=t.src; }catch(e){ reportError('audio src'); }
}
function ensureGraph(){
  if(actx){ if(actx.state==='suspended') actx.resume().catch(()=>{}); return graphOK; }
  if(!store.eq.enabled) return false;
  try{
    actx = new (window.AudioContext||window.webkitAudioContext)();
    const src = actx.createMediaElementSource(audio);
    let head = src;
    eqNodes = EQ_BANDS.map(b=>{ const f=actx.createBiquadFilter(); f.type='peaking'; f.frequency.value=b.f; f.Q.value=1; head.connect(f); head=f; return f; });
    analyser = actx.createAnalyser(); analyser.fftSize=64;
    head.connect(analyser); analyser.connect(actx.destination);
    applyEQ(); graphOK = true;
  }catch(e){ graphOK = false; }
  return graphOK;
}
function applyEQ(){ if(!actx||!graphOK) return;
  eqNodes.forEach((n,i)=>{ try{ n.gain.value = store.eq.enabled ? (store.eq.gains[i]||0) : 0; }catch(e){} }); }

let queue=[], currentId=store.currentId||null, sleepId=null, activeCol=null, libSeg='songs';
const fmt=(s)=>{ s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){ const w=$('#toastWrap'); if(!w) return; const d=document.createElement('div'); d.className='toast'; d.textContent=m; w.appendChild(d); setTimeout(()=>{d.style.opacity='0'; setTimeout(()=>d.remove(),300);},2400); }
function artStyle(t){ const h=((t?.hue??200)%360+360)%360;
  return `background:hsl(${h} 26% 42%)`; }
function artHTML(t,cls){ const ch=(t?.title||'♪').trim().charAt(0).toUpperCase()||'♪';
  if(t?.coverUrl) return `<div class="${cls}"><img src="${t.coverUrl}" alt=""/></div>`;
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

function playTrack(id, opts){
  try{
  const t=getT(id); if(!t){ toast('Song not found'); return; }
  opts=opts||{};
  ensureGraph(); ensureNotifPerm();
  if(!opts.fromRadio && !opts.keepRadio) { if(store.radio){ store.radio=false; } }
  setSrcSafe(t);
  audio.playbackRate=store.prefs.speed||1;
  if(opts.open){ $('#listOverlay').classList.add('hidden'); $('#playerOverlay').classList.remove('hidden'); }
  const doPlay=()=>audio.play().then(()=>{
    currentId=id; store.currentId=id;
    store.recents=[id,...store.recents.filter(x=>x!==id)].slice(0,50);
    store.playCounts[id]=(store.playCounts[id]||0)+1; save();
    render(); mediaSession();
  }).catch(err=>{ console.warn(err);
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
  ensureGraph(); if(audio.paused) audio.play().catch(()=>toast('Could not play')); else audio.pause();
  }catch(e){ reportError('toggle: '+(e&&e.message||e)); } }
function next(auto=false){
  if(queue.length){ const id=queue.shift(); render(); return playTrack(id,{keepRadio:true, fromRadio:store.radio}); }
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

audio.addEventListener('timeupdate',()=>{
  const d=audio.duration||getT(currentId)?.duration||0, c=audio.currentTime||0;
  if(!seeking){ const v=d?Math.round(c/d*1000):0; const sk=$('#plSeek'); if(sk){ sk.value=String(v); try{sk.style.setProperty('--fill',(v/10)+'%');}catch(e){} } }
  const cc=$('#plCur'); if(cc) cc.textContent=fmt(c); const dd=$('#plDur'); if(dd) dd.textContent=fmt(d);
  const mp=$('#miniProg'); if(mp) mp.style.width=(d?c/d*100:0)+'%';
  try{ tickHeroProg(); }catch(e){}
  try{ const po=$('#playerOverlay'); if(!audio.paused&&!po.classList.contains('hidden')&&store.synced&&store.synced[currentId]&&!showPlainLyr) paintSyncLines(false); }catch(e){}
  try{ const nt=Date.now(); if(nt-_lastElapsedPush>20000&&!document.hidden){ _lastElapsedPush=nt; mcUpdateElapsed(); } }catch(e){}
});
audio.addEventListener('loadedmetadata',()=>{ const t=getT(currentId); if(!t||!audio.duration||!isFinite(audio.duration)) return;
  if(t.source==='local'){ const prev=store.localMeta[t.id]||{}; prev.duration=Math.round(audio.duration); store.localMeta[t.id]=prev; save(); }
  else if(t.source==='device' && !t.duration){ t.duration=Math.round(audio.duration); } });
audio.addEventListener('error',()=>{ const t=getT(currentId); if(t&&/^https?:/i.test(t.src||'')&&audio.crossOrigin){ try{ audio.removeAttribute('crossorigin'); audio.crossOrigin=null; audio.src=t.src; audio.play().catch(()=>{}); }catch(e){} } });
audio.addEventListener('ended',()=>{ if(store.prefs.repeat==='one'){ audio.currentTime=0; audio.play().catch(()=>{}); return; }
  if(store.prefs.autoplay||store.radio||queue.length) next(true); });
audio.addEventListener('play',render); audio.addEventListener('pause',render);
function mediaSession(){ if(!('mediaSession' in navigator)) return; const t=getT(currentId); if(!t) return;
  try{ const art=(t.coverUrl&&(isPublicHttp(t.coverUrl)||/^data:/.test(t.coverUrl||'')))?[{src:t.coverUrl,sizes:'160x160'}]:[];
    navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album||"Ash's Player",artwork:art});
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
  const key=homeQ+'|'+all().length+'|'+currentId+'|'+audio.paused;
  if(key===lastSearchKey) return; lastSearchKey=key;
  const t=$('#searchTitle'); if(t) t.textContent=raw?('“'+raw+'”'):'Search';
  const box=$('#searchSongs'), gr=$('#searchGroups'), meta=$('#searchMeta');
  box.innerHTML=''; gr.innerHTML='';
  if(!homeQ){ if(meta) meta.textContent=''; return; }
  const songs=all().filter(x=>(x.title+' '+x.artist+' '+(x.album||'')).toLowerCase().includes(homeQ)).slice(0,40);
  const als=albumGroups().filter(g=>(g.album+' '+g.artist).toLowerCase().includes(homeQ)).slice(0,5);
  const ars=artistGroups().filter(g=>g.artist.toLowerCase().includes(homeQ)).slice(0,5);
  if(meta) meta.textContent=(songs.length||als.length||ars.length)
    ? `${songs.length} song${songs.length===1?'':'s'}${als.length?` · ${als.length} album${als.length===1?'':'s'}`:''}${ars.length?` · ${ars.length} artist${ars.length===1?'':'s'}`:''}`
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
  if(songs.length){ if(als.length||ars.length) box.appendChild(mkHead('Songs')); else gr.appendChild(mkHead('Songs')); }
  songs.forEach(x=>box.appendChild(trackRow(x)));
}
function trackRow(t, opts){
  opts=opts||{};
  const d=document.createElement('div'); d.className='track'+(t.id===currentId?' playing':'');
  const liked=store.likes.includes(t.id);
  d.innerHTML=`${artHTML(t,'t-art')}<div class="t-meta"><b>${esc(t.title)}${liked?' <span class="liked-dot" title="Liked">•</span>':''}</b><span>${esc(t.artist)}${t.duration?' · '+fmt(t.duration):''}</span></div>${t.id===currentId&&!audio.paused?'<span class="eqbars"><i></i><i></i><i></i></span>':''}${opts.reorder?'<span class="ord"><button data-m="-1" aria-label="Move up">↑</button><button data-m="1" aria-label="Move down">↓</button></span>':''}<button class="t-menu" aria-label="More">${ICONS.dots}</button>`;
  d.onclick=()=>playTrack(t.id,{open:true});
  d.querySelector('.t-menu').onclick=(e)=>{ e.stopPropagation(); songMenu(t.id); };
  if(opts.reorder) d.querySelectorAll('.ord button').forEach(b=>b.onclick=(e)=>{ e.stopPropagation(); opts.reorder(t.id,+b.dataset.m); });
  return d;
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
  if(!ACCENTS[store.prefs.accent]) store.prefs.accent='clay';
  const acc=ACCENTS[store.prefs.accent]||ACCENTS.clay;
  const r=document.documentElement;
  r.dataset.theme=th;
  r.style.setProperty('--acc',acc.a);
  try{ r.style.setProperty('--acc-soft',acc.a+'2e'); }catch(e){}
  const mc=document.querySelector('meta[name=theme-color]'); if(mc) mc.content=th==='light'?'#efe7d9':'#000000';
  $$('.themeToggle').forEach(b=>b.innerHTML=th==='light'?ICONS.moon:ICONS.sun);
}

function render(){
  rebuild();
  applyTheme();
  const _lk=songsQ+'|'+libQ+'|'+store.prefs.songSort+'|'+store.prefs.newSort+'|'+all().length;
  if(_lk!==lastListKey){ lastListKey=_lk; listLimit=120; }
  const plays=id=>store.playCounts[id]||0;
  const popular=all().slice().sort((a,b)=>plays(b.id)-plays(a.id)).slice(0,8);
  const sl2=$('#statLine'); if(sl2) sl2.textContent=all().length?`${all().length} songs · ${store.playlists.length} playlists`:'Your music';
  paintHero('hero'); paintHero('ns'); paintHero('lb');
  const mPill=$('#mixPill'); if(mPill) mPill.textContent=store.radio?'Mix on':'Shuffle';
  const pr=$('#popularRow'); if(pr){ pr.innerHTML='';
    if(!all().length) pr.innerHTML='<p class="muted">No music yet — go to Songs → Add</p>';
    popular.forEach(t=>{
      const c=document.createElement('div'); c.className='pop-card'+(t.id===currentId?' playing':'');
      const a=document.createElement('div'); a.className='pop-art'; a.style.cssText=artStyle(t);
      if(t.coverUrl){ const im=document.createElement('img'); im.src=t.coverUrl; im.alt=''; im.loading='lazy'; a.appendChild(im); }
      else { const s=document.createElement('span'); s.textContent=(t.title||'♪').trim().charAt(0).toUpperCase(); a.appendChild(s); }
      const pb=document.createElement('button'); pb.className='pop-play'; pb.setAttribute('aria-label','Play');
      pb.innerHTML=currentId===t.id&&!audio.paused?ICONS.pause:ICONS.play;
      pb.onclick=(e)=>{ e.stopPropagation(); currentId===t.id?toggle():playTrack(t.id,{open:true}); };
      a.appendChild(pb); c.appendChild(a);
      const b=document.createElement('b'); b.textContent=t.title; c.appendChild(b);
      const s=document.createElement('span'); s.textContent=t.artist; c.appendChild(s);
      c.onclick=()=>playTrack(t.id,{open:true}); pr.appendChild(c);
    });
  }
  const hp=$('#homePlaylists'); if(hp){ hp.innerHTML='';
    if(!store.playlists.length) hp.innerHTML='<p class="muted">No playlists yet — make one in Library → Playlists</p>';
    store.playlists.slice(0,3).forEach(pl=>hp.appendChild(plRow(pl))); }
  const hr=$('#homeRecent'); if(hr) paint(hr, store.recents.map(getT).filter(Boolean).slice(0,5), 'Nothing played yet — tap a song');
  const ns=$('#newSortRow'); if(ns){ ns.innerHTML='';
    [['new','Newest'],['old','Oldest']].forEach(([v,l])=>{
      const b=document.createElement('button'); b.textContent=l;
      if((store.prefs.newSort||'new')===v) b.classList.add('active');
      b.onclick=()=>{ store.prefs.newSort=v; save(); render(); }; ns.appendChild(b); }); }
  const nlEl=$('#newList'); if(nlEl){ const nl=searchFilter(all(),songsQ).slice().sort((a,b)=> store.prefs.newSort==='old'
      ? (store.addedAt[a.id]||0)-(store.addedAt[b.id]||0) : (store.addedAt[b.id]||0)-(store.addedAt[a.id]||0));
    paintMore(nlEl, nl, songsQ?`No matches for “${songsQ}”`:'Nothing here yet — add music to get started'); }
  const libSub=$('#libSub'); if(libSub) libSub.textContent=`${all().length} songs · ${localTracks.length+deviceTracks.length} on this device`;
  const sr=$('#songSortRow'); if(sr){ sr.innerHTML='';
    sr.style.display=libSeg==='songs'?'':'none';
    [['az','A – Z'],['za','Z – A']].forEach(([v,l])=>{
      const b=document.createElement('button'); b.textContent=l;
      if((store.prefs.songSort||'az')===v) b.classList.add('active');
      b.onclick=()=>{ store.prefs.songSort=v; save(); render(); }; sr.appendChild(b); }); }
  const slEl=$('#libSongs'); if(slEl){ const sl=searchFilter(all(),libQ).slice().sort((a,b)=> store.prefs.songSort==='za'
      ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title));
    paintMore(slEl, sl, libQ?`No matches for “${libQ}”`:'No songs — tap + to add your music'); }
  const lp=$('#libPlaylists'); if(lp){ lp.innerHTML='';
    const pls=libQ?store.playlists.filter(p=>p.name.toLowerCase().includes(libQ)):store.playlists;
    if(!pls.length) lp.innerHTML=`<p class="muted center">${libQ?`No matches for “${libQ}”`:'No playlists yet — tap New Playlist'}</p>`;
    pls.forEach(pl=>lp.appendChild(plRow(pl))); }
  const npb=$('#newPlaylistBtn'); if(npb) npb.classList.toggle('hidden', libSeg!=='playlists');
  const lf=$('#libFolders'); if(lf){ lf.innerHTML='';
    const fols=libQ?store.folders.filter(f=>f.name.toLowerCase().includes(libQ)):store.folders;
    if(!fols.length) lf.innerHTML=`<p class="muted center">${libQ?`No matches for “${libQ}”`:'No folders yet — tap + and pick a folder'}</p>`;
    fols.forEach(f=>{ const ts=f.trackIds.map(getT).filter(Boolean);
      const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
      const d=document.createElement('div'); d.className='track';
      d.innerHTML=`<div class="t-art folder" style="${artStyle({hue:hashHue(f.name)})};display:flex;align-items:center;justify-content:center">${ICONS.folder}</div><div class="t-meta"><b>${esc(f.name)}</b><span>${ts.length} songs${tot?' · '+fmt(tot):''}</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>openFolder(f.id); lf.appendChild(d); }); }
  const lal=$('#libAlbums'); if(lal){ lal.innerHTML='';
    const gs=libQ?albumGroups().filter(g=>(g.album+' '+g.artist).toLowerCase().includes(libQ)):albumGroups();
    if(!gs.length) lal.innerHTML=`<p class="muted center">${libQ?`No matches for “${libQ}”`:'No albums yet'}</p>`;
    gs.forEach(g=>{ const ts=g.ids.map(getT).filter(Boolean); const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
      const d=document.createElement('div'); d.className='track';
      d.innerHTML=`${groupArt(g.album.trim().charAt(0).toUpperCase(),g.cover,g.hue)}<div class="t-meta"><b>${esc(g.album)}</b><span>${esc(g.artist)} · ${ts.length} songs${tot?' · '+fmt(tot):''}</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>openAlbum(g.artist,g.album); lal.appendChild(d); }); }
  const lar=$('#libArtists'); if(lar){ lar.innerHTML='';
    const gs=libQ?artistGroups().filter(g=>g.artist.toLowerCase().includes(libQ)):artistGroups();
    if(!gs.length) lar.innerHTML=`<p class="muted center">${libQ?`No matches for “${libQ}”`:'No artists yet'}</p>`;
    gs.forEach(g=>{ const ts=g.ids.map(getT).filter(Boolean); const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
      const d=document.createElement('div'); d.className='track';
      d.innerHTML=`${groupArt(g.artist.trim().charAt(0).toUpperCase(),g.cover,g.hue)}<div class="t-meta"><b>${esc(g.artist)}</b><span>${ts.length} songs${tot?' · '+fmt(tot):''}</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
      d.onclick=()=>openArtist(g.artist); lar.appendChild(d); }); }
  const ll=$('#libLiked'); if(ll) paintMore(ll, searchFilter(all().filter(t=>store.likes.includes(t.id)),libQ), libQ?`No matches for “${libQ}”`:'Nothing liked yet — tap the star on any song');
  const rt=getT(currentId);
  const rTi=$('#radioTitle'); if(rTi) rTi.textContent=rt?rt.title:'Nothing playing';
  const rAr=$('#radioArtist'); if(rAr) rAr.textContent=rt?(rt.artist+(store.radio?' · mix on':'')):'Tap play to start the mix';
  const rTg=$('#radioToggle'); if(rTg) rTg.innerHTML=(!audio.paused&&currentId)?ICONS.pause:ICONS.play;
  const rTgW=$('#radioToggle'); if(rTgW) rTgW.classList.toggle('live',!!store.radio);
  const ra=$('#radioArt'); if(ra){
    if(rt?.coverUrl) ra.innerHTML=`<img src="${rt.coverUrl}" style="width:100%;height:100%;object-fit:cover" alt=""/>`;
    else if(rt){ ra.textContent=(rt.title||'R')[0].toUpperCase(); ra.style.cssText=artStyle(rt); }
    else { ra.innerHTML=ICONS.radio; ra.style.cssText=''; } }
  const rn=$('#radioNext'); if(rn) paint(rn, queue.map(getT).filter(Boolean).slice(0,3), store.radio?'Shuffle mix is on — enjoy':'Queue is empty');
  const playing=currentId&&!audio.paused;
  const mp=$('#miniPlayer'); if(mp) mp.classList.toggle('hidden',!currentId);
  if(rt){
    const mt=$('#miniTitle'); if(mt) mt.textContent=rt.title;
    const ma=$('#miniArtist'); if(ma) ma.textContent=rt.artist;
    const mc=$('#miniCover'); if(mc){ if(rt.coverUrl) mc.innerHTML=`<img src="${rt.coverUrl}" alt=""/>`; else { mc.textContent=(rt.title||'♪')[0].toUpperCase(); mc.style.cssText=artStyle(rt); } }
    const pt=$('#plTitle'); if(pt) setMarquee(pt, rt.title);
    const pa2=$('#plArtist'); if(pa2) pa2.textContent=rt.artist+(rt.album?' · '+rt.album:'');
    const pa=$('#plArt'); if(pa){ if(rt.coverUrl) pa.innerHTML=`<img src="${rt.coverUrl}" alt=""/>`; else { pa.textContent=(rt.title||'♪')[0].toUpperCase(); pa.style.cssText=artStyle(rt); }
      pa.classList.toggle('playing',!!playing); }
    const amb=$('#plAmb'); if(amb){ const want=rt&&rt.coverUrl?rt.coverUrl:''; if(amb.dataset.src!==want){ amb.dataset.src=want; amb.innerHTML=want?`<img src="${want}" alt=""/>`:''; } }
    const lyr=$('#plLyrPreview'); if(lyr) lyr.textContent=(store.lyrics[currentId]||'').split('\n')[0]||(rt.source==='demo'?'Demo track':'Lyrics will appear here');
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
function paintHero(p){
  const card=document.getElementById(p+'Card'); if(!card) return;
  const t=getT(currentId)||all()[0];
  card.classList.toggle('hidden',!t);
  if(!t) return;
  const byId=s=>document.getElementById(p+s);
  const a=byId('Art');
  if(a){ if(t.coverUrl){ a.innerHTML=`<img src="${t.coverUrl}" alt=""/>`; a.style.cssText=''; }
    else { a.textContent=(t.title||'♪').trim().charAt(0).toUpperCase()||'♪'; a.style.cssText=artStyle(t); } }
  const k=byId('Kick'); if(k) k.textContent=(currentId===t.id&&!audio.paused)?'Now playing':(currentId===t.id?'Paused':'Up next');
  const ti=byId('Title'); if(ti) ti.textContent=t.title;
  const su=byId('Sub'); if(su) su.textContent=t.artist;
  const pl=byId('Play'); if(pl){ pl.innerHTML=(currentId===t.id&&!audio.paused)?ICONS.pause:ICONS.play;
    pl.onclick=e=>{ e.stopPropagation(); if(currentId===t.id) toggle(); else playTrack(t.id,{open:true}); }; }
  const nx=byId('Next'); if(nx){ nx.innerHTML=ICONS.next;
    nx.onclick=e=>{ e.stopPropagation(); if(currentId===t.id) next(); else playTrack(t.id,{open:true}); }; }
}
function tickHeroProg(){
  const d=audio.duration||getT(currentId)?.duration||0, c=audio.currentTime||0, w=(d?c/d*100:0)+'%';
  ['heroProg','nsProg','lbProg'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.width=w; });
}
function plRow(pl){
  const d=document.createElement('div'); d.className='track';
  d.innerHTML=`<div class="t-art" style="${artStyle({hue:hashHue(pl.name||'P')})}">${esc((pl.name||'P')[0].toUpperCase())}</div><div class="t-meta"><b>${esc(pl.name)}</b><span>${pl.trackIds.length} songs</span></div><button class="t-menu" aria-label="Open">${ICONS.chevR}</button>`;
  d.onclick=()=>openPlaylist(pl.id); return d;
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
      else if(!$('#searchOverlay').classList.contains('hidden')) closeSearchOverlay();
      else if(!$('#playerOverlay').classList.contains('hidden')) $('#playerOverlay').classList.add('hidden');
      else if(!$('#listOverlay').classList.contains('hidden')) $('#listOverlay').classList.add('hidden');
      else if(document.querySelector('.screen.active')?.id!=='screen-home') tab('home');
      else { try{ C.Plugins.App.minimizeApp(); }catch(e){ try{C.Plugins.App.exitApp();}catch(_){} } }
    });
  }catch(e){}
}

let _lastNotifId=null, _lastNotifPlaying=null, _mcBound=false, _lastMsg='', _lastMsgT=0, _lastElapsedPush=0;
function mcPlugin(){ try{ const C=window.Capacitor;
  if(!(C&&C.isNativePlatform&&C.isNativePlatform())) return null;
  return C.Plugins.CapacitorMusicControls||C.Plugins.MusicControls||null;
 }catch(e){ return null; } }
function notifReset(){ _lastNotifId=null; _lastNotifPlaying=null; }
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
    try{ if(s>0&&audio.duration&&isFinite(audio.duration)) audio.currentTime=Math.min(s,audio.duration); }catch(e){} }
  else if(message==='music-controls-destroy'){ try{audio.pause();}catch(e){} notifReset(); }
}
function mcUpdatePlaying(MC, playing){
  try{ const r=MC.updateIsPlaying({isPlaying:playing});
    if(r&&r.catch) r.catch(()=>{ _lastNotifPlaying=null; });
  }catch(e){ _lastNotifPlaying=null; }
}
function mcUpdateElapsed(){
  try{ const MC=mcPlugin(); if(!MC||!store.prefs.notif) return; const t=getT(currentId); if(!t) return;
    if(MC.updateElapsed){ const r=MC.updateElapsed({isPlaying:!audio.paused, elapsed:Math.max(0,Math.floor(audio.currentTime||0))}); if(r&&r.catch) r.catch(()=>{}); }
  }catch(e){}
}
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
    if(_lastNotifId===t.id && _lastNotifPlaying===playing) return;
    const trackChanged=_lastNotifId!==t.id;
    _lastNotifId=t.id; _lastNotifPlaying=playing;
    if(!_mcBound){ _mcBound=true;
      try{ MC.addListener&&MC.addListener('controlsNotification',function(info){ mcHandle(info&&(info.message||info), info&&(info.position||0)); }); }catch(e){}
      try{ document.addEventListener('controlsNotification',function(ev){ mcHandle(ev&&(ev.message||''), ev&&(ev.position||0)); }); }catch(e){}
    }
    const cover=(t.coverUrl&&isPublicHttp(t.coverUrl))?t.coverUrl:'';
    if(!trackChanged){ mcUpdatePlaying(MC, playing); return; }
    try{ const r=MC.create({ track:t.title||'Unknown', artist:t.artist||'Unknown artist', album:t.album||"Ash's Player", cover:cover||'',
      isPlaying:playing, dismissable:false, hasPrev:true, hasNext:true, hasClose:true,
      ticker:'Now playing "'+(t.title||'music')+'"',
      notificationIcon:'', playIcon:'', pauseIcon:'', prevIcon:'', nextIcon:'', closeIcon:'',
      duration:Math.max(0,Math.round(t.duration||audio.duration||0)), elapsed:Math.max(0,Math.floor(audio.currentTime||0)) });
      r&&r.catch&&r.catch(()=>{ notifReset(); });
    }catch(e){ notifReset(); }
  }catch(e){}
}

function tab(name){ closeSearchOverlay(); $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $$('.screen').forEach(s=>s.classList.remove('active')); $('#screen-'+name).classList.add('active'); }

function sheet(html){ $('#sheetBox').innerHTML='<div class="grab"></div>'+html; $('#sheetBack').classList.remove('hidden'); }
function closeSheet(){ $('#sheetBack').classList.add('hidden'); }
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
  <button class="opt" id="mX">Close</button>`);
  $('#mX').onclick=closeSheet;
  $('#mPlay').onclick=()=>{ closeSheet(); playTrack(id,{open:true}); };
  $('#mNext').onclick=()=>{ queue.unshift(id); closeSheet(); render(); toast('Plays next'); };
  $('#mQueue').onclick=()=>{ queue.push(id); closeSheet(); render(); toast('Added to queue'); };
  $('#mLike').onclick=()=>{ const i=store.likes.indexOf(id); i>=0?store.likes.splice(i,1):store.likes.push(id); save(); closeSheet(); render(); };
  $('#mPl').onclick=()=>plPicker(id);
  $('#mLyr').onclick=()=>lyrEditor(id);
  $('#mRen').onclick=()=>{ sheet(`<h2>Edit tags</h2><input type="text" id="rnT" value="${esc(t.title)}" maxlength="120" placeholder="Title"/><input type="text" id="rnA" value="${esc(t.artist)}" maxlength="120" placeholder="Artist"/><input type="text" id="rnAl" value="${esc(t.album||'')}" maxlength="120" placeholder="Album"/><button class="opt" id="rnS">Save</button>`);
    $('#rnS').onclick=()=>{ store.customTitles[id]={title:$('#rnT').value.trim()||t.title,artist:$('#rnA').value.trim()||t.artist,album:$('#rnAl').value.trim()}; save(); closeSheet(); render(); toast('Tags saved'); }; };
  const del=$('#mDel'); if(del) del.onclick=async()=>{ if(!confirm('Delete this song from library?'))return;
    await idbDel(id);
    store.likes=store.likes.filter(x=>x!==id);
    store.playlists.forEach(p=>p.trackIds=p.trackIds.filter(x=>x!==id));
    store.folders.forEach(f=>{ f.trackIds=f.trackIds.filter(x=>x!==id); });
    purgeTrackMeta(id);
    if(currentId===id){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
    await loadLocal(); save(); closeSheet(); render(); toast('Deleted'); };
}
function plPicker(id){
  sheet(`<h2>Add to playlist</h2>${store.playlists.length?store.playlists.map(p=>`<button class="opt" data-p="${p.id}">${esc(p.name)} (${p.trackIds.length})</button>`).join(''):'<p class="muted">No playlists yet</p>'}<button class="opt" id="pNew">New playlist</button><button class="opt" id="pX">Close</button>`);
  $('#pX').onclick=closeSheet; $('#pNew').onclick=newPlaylist;
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ const pl=store.playlists.find(p=>p.id===b.dataset.p);
    if(pl&&!pl.trackIds.includes(id)) pl.trackIds.push(id); save(); closeSheet(); render(); toast('Added to '+pl.name); });
}
function newPlaylist(){ sheet(`<h2>New playlist</h2><input type="text" id="npN" placeholder="Name it..."/><button class="opt" id="npS">Create</button>`);
  $('#npS').onclick=()=>{ const n=$('#npN').value.trim()||'My Mix'; store.playlists.push({id:'pl_'+Date.now(),name:n,trackIds:[]}); save(); closeSheet(); render(); toast('Playlist created'); }; }

let showPlainLyr=false, _lyrIdx=-9, _lyrTrack=null, _lyrCacheId=null, _lyrCache=[];
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
  if(_lyrCacheId!==currentId){ _lyrCache=parseLRC(s.lrc); _lyrCacheId=currentId; } return _lyrCache; }
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
      if(!$('#lyT').value.trim()&&d.plainLyrics) $('#lyT').value=d.plainLyrics;
      save(); toast('Synced lyrics saved — plays offline now'); lyrEditor(id);
    }catch(e){ toast(e===1?'Instrumental track — no lyrics':(!navigator.onLine?'You are offline':'No synced lyrics found')); } };
  const rm=$('#lyR'); if(rm) rm.onclick=()=>{ delete store.synced[id]; save(); closeSheet(); render(); toast('Synced lyrics removed'); }; }
function eqSheet(){
  sheet(`<h2>Equalizer</h2><label class="switch"><input type="checkbox" id="eqE" ${store.eq.enabled?'checked':''}/> Enable EQ</label>
  <p class="muted" style="font-size:12.5px">EQ applies from the next song you play (the audio graph is built on play to avoid silent-playback bugs).</p>
  <div class="chips">${Object.keys(EQ_PRESETS).map(n=>`<button class="${store.eq.preset===n?'active':''}" data-p="${n}">${n}</button>`).join('')}</div>
  <div id="eqRows">${EQ_BANDS.map((b,i)=>`<div class="eq-row"><label>${b.l}</label><input type="range" min="-12" max="12" data-i="${i}" value="${store.eq.gains[i]||0}" aria-label="${b.l}"/><span>${store.eq.gains[i]||0} dB</span></div>`).join('')}</div>
  <button class="opt" id="eqX">Close</button>`);
  $('#eqX').onclick=closeSheet;
  $('#eqE').onchange=e=>{ store.eq.enabled=e.target.checked; save(); applyEQ(); if(store.eq.enabled) ensureGraph(); };
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ store.eq.preset=b.dataset.p; store.eq.gains=[...EQ_PRESETS[b.dataset.p]]; save(); applyEQ(); eqSheet(); });
  $$('#eqRows input').forEach(r=>r.oninput=()=>{ store.eq.gains[+r.dataset.i]=+r.value; r.nextElementSibling.textContent=r.value+' dB'; store.eq.preset='Custom'; save(); applyEQ(); });
}
function sleepSheet(){ sheet(`<h2>Sleep timer</h2><div class="chips">${[5,10,15,30,60].map(m=>`<button data-m="${m}">${m} min</button>`).join('')}<button data-m="0">Off</button></div><button class="opt" id="slX">Close</button>`);
  $('#slX').onclick=closeSheet;
  $$('#sheetBox [data-m]').forEach(b=>b.onclick=()=>{ setSleep(+b.dataset.m); closeSheet(); }); }
function setSleep(min){ if(sleepId){ clearTimeout(sleepId); sleepId=null; }
  if(min>0){ sleepId=setTimeout(()=>{ const target=(store.volumes.vol??100)/100;
      const f=setInterval(()=>{ if(audio.volume>0.08) audio.volume=Math.max(0,audio.volume-0.08); else { clearInterval(f); try{audio.pause();}catch(e){} applyVolume(); } },200);
      sleepId=null; render(); toast('Sleep timer ended'); },min*60000); toast('Music stops in '+min+' min'); }
  else toast('Sleep timer off'); render(); }
function queueSheet(){ sheet(`<h2>Up next (${queue.length})</h2><div class="v-list" id="qL"></div><button class="opt" id="qC">Clear queue</button><button class="opt" id="qX">Close</button>`);
  const ql=$('#qL'); ql.innerHTML=queue.length?'':'<p class="muted">Empty — use the ••• menu on any song</p>';
  queue.map((id,qi)=>({t:getT(id),qi})).filter(x=>x.t).forEach(({t,qi})=>{ const r=trackRow(t);
    const w=document.createElement('span'); w.className='ord';
    w.innerHTML='<button aria-label="Move up">↑</button><button aria-label="Move down">↓</button>';
    const [up,dn]=w.querySelectorAll('button');
    up.onclick=e=>{ e.stopPropagation(); if(moveInList(queue,qi,-1)){ queueSheet(); render(); } };
    dn.onclick=e=>{ e.stopPropagation(); if(moveInList(queue,qi,1)){ queueSheet(); render(); } };
    const x=document.createElement('button'); x.className='t-menu'; x.setAttribute('aria-label','Remove'); x.textContent='✕';
    x.onclick=e=>{ e.stopPropagation(); queue.splice(qi,1); queueSheet(); render(); };
    const m=r.querySelector('.t-menu'); m.replaceWith(w); w.after(x); ql.appendChild(r); });
  $('#qC').onclick=()=>{ queue=[]; queueSheet(); render(); }; $('#qX').onclick=closeSheet; }
async function settingsSheet(){
  const th=store.prefs.theme||'dark', ac=store.prefs.accent||'teal';
  sheet(`<h2>Settings</h2><h3>Theme</h3><div class="chips"><button data-th="dark" class="${th==='dark'?'active':''}">Dark</button><button data-th="light" class="${th==='light'?'active':''}">Light</button><button data-th="system" class="${th==='system'?'active':''}">System</button></div>
  <h3>Accent</h3><div class="chips accent-row">${Object.keys(ACCENTS).map(k=>`<button data-ac="${k}" class="${ac===k?'active':''}" style="--dot:${ACCENTS[k].a}"><i></i>${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div>
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
  $$('#sheetBox [data-ac]').forEach(b=>b.onclick=()=>{ store.prefs.accent=b.dataset.ac; save(); settingsSheet(); render(); });
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
    const dlib=$('#diagLib'); if(dlib) dlib.textContent=`Songs: ${all().length} (device ${deviceTracks.length} · files ${localTracks.length}) · folders ${store.folders.length} · playlists ${store.playlists.length}`;
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
  if(cover) return `<div class="t-art"><img src="${cover}" alt="" loading="lazy"/></div>`;
  return `<div class="t-art" style="${artStyle({hue:hue??200})}">${esc(letter||'A')}</div>`;
}
function colTracks(){ if(!activeCol) return [];
  if(activeCol.type==='al'){ const [ar,al]=String(activeCol.key).split('\n');
    return all().filter(t=>normName(t.artist,'Unknown artist')===ar&&normName(t.album,'Unknown album')===al); }
  if(activeCol.type==='ar'){ return all().filter(t=>normName(t.artist,'Unknown artist')===activeCol.key); }
  const src = activeCol.type==='pl'
    ? (store.playlists.find(p=>p.id===activeCol.id)?.trackIds||[])
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
  ts.slice(0,300).forEach(t=>el.appendChild(trackRow(t,{reorder:(id,dir)=>{ const i=pl.trackIds.indexOf(id); if(moveInList(pl.trackIds,i,dir)){ save(); paintPlaylistSongs(pid); } }})));
  if(ts.length>300){ const p=document.createElement('p'); p.className='muted center'; p.textContent='+'+(ts.length-300)+' more'; el.appendChild(p); } }
function openPlaylist(pid){ const pl=store.playlists.find(p=>p.id===pid); if(!pl) return; activeCol={type:'pl',id:pid};
  $('#listAddSongs').style.display='';
  paintPlaylistSongs(pid);
  $('#listOverlay').classList.remove('hidden'); }
function openFolder(fid){ const f=store.folders.find(x=>x.id===fid); if(!f) return; activeCol={type:'fo',id:fid};
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
      store.folders=store.folders.filter(x=>x.id!==fid);
      if(currentId&&f.trackIds.includes(currentId)){ try{audio.pause();}catch(e){} currentId=null; store.currentId=null; }
      await loadLocal(); save(); $('#listOverlay').classList.add('hidden'); render(); toast('Folder removed'); };
    el.appendChild(del);
  } else if(f.kind==='device'){
    const p=document.createElement('p'); p.className='muted center'; p.style.fontSize='12.5px';
    p.textContent='Scanned from your device — files stay untouched.';
    el.appendChild(p);
  }
  $('#listOverlay').classList.remove('hidden'); }

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
    save(); closeSheet(); openPlaylist(pid); render(); toast(n?n+' song'+(n>1?'s':'')+' added':'Nothing new selected'); };
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
  for(const t of all()){ if(n>=400) break;
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
                      coverDirty++; if(coverDirty%10===0){ try{metaSet('coverCache',coverCache).catch(()=>{});}catch(e){} }
                      done++; if(done%12===0) render(); } } } } } }
        }catch(e){}
        setTimeout(step,1500); return;
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
        durLater(id); // duration fills in quietly afterwards
        if(!touched.includes(folderName)) touched.push(folderName);
      }catch(e){ console.warn('skipped file', f && f.name, e); skipped++; }
      await new Promise(r=>setTimeout(r,0));
      if(imported%25===0){ save(); render(); }
    }
  }
  save(); await loadLocal(); save(); render(); segTo('folders'); tab('library');
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
  const sap=$('#seeAllPopular'); if(sap) sap.onclick=()=>{ tab('library'); segTo('songs'); };
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
  const lin=$('#libSearch'); if(lin){
    lin.addEventListener('input',e=>{ const c=$('#clearLibSearch'); if(c) c.classList.toggle('hidden',!e.target.value);
      deb(()=>{ libQ=(e.target.value||'').trim().toLowerCase(); render(); }); });
  }
  const clb=$('#clearLibSearch'); if(clb) clb.onclick=()=>{ $('#libSearch').value=''; libQ=''; clb.classList.add('hidden'); render(); };
  const add=()=>addMenu();
  const ab2=$('#addMusicBtn2'); if(ab2) ab2.onclick=add;
  const la=$('#libAdd'); if(la) la.onclick=add;
  const qA=$('#quickAdd'); if(qA) qA.onclick=add;
  const qS=$('#quickShuffle'); if(qS) qS.onclick=()=>{ const l=all(); if(!l.length) return toast('Add music first'); store.prefs.shuffle=true; save(); playTrack(l[Math.floor(Math.random()*l.length)].id,{open:true,keepRadio:true}); render(); };
  const qM=$('#quickMix'); if(qM) qM.onclick=()=>{ tab('radio'); const rt=$('#radioToggle'); if(rt) rt.click(); };
  const fi=$('#fileInput'); if(fi) fi.onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  const fo=$('#folderInput'); if(fo) fo.onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  const im=$('#importFile'); if(im) im.onchange=e=>{ const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(d&&d.store){ const fresh=defStore(); store=Object.assign(fresh,d.store); store.prefs=Object.assign(fresh.prefs,d.store.prefs||{}); store.volumes=Object.assign(fresh.volumes,d.store.volumes||{}); store.eq=Object.assign(fresh.eq,d.store.eq||{}); save(); applyVolume(); applyEQ(); render(); toast('Backup restored'); } else toast('Invalid backup'); }catch(err){ toast('Invalid backup file'); } }; r.readAsText(f); e.target.value=''; };
  $$('.seg button').forEach(b=>b.onclick=()=>segTo(b.dataset.seg));
  const npb=$('#newPlaylistBtn'); if(npb) npb.onclick=newPlaylist;
  const mplay=$('#miniPlay'); if(mplay) mplay.onclick=e=>{ e.stopPropagation(); toggle(); };
  const mnext=$('#miniNext'); if(mnext) mnext.onclick=e=>{ e.stopPropagation(); next(); };
  const mp=$('#miniPlayer'); if(mp){ let mpSwiped=false, mx=0;
    mp.addEventListener('touchstart',e=>{ mx=e.touches[0].clientX; },{passive:true});
    mp.addEventListener('touchend',e=>{ const dx=e.changedTouches[0].clientX-mx;
      if(Math.abs(dx)>60){ mpSwiped=true; dx<0?next():prev(); } },{passive:true});
    mp.onclick=()=>{ if(mpSwiped){ mpSwiped=false; return; } $('#playerOverlay').classList.remove('hidden'); }; }
  const pb=$('#plBack'); if(pb) pb.onclick=()=>$('#playerOverlay').classList.add('hidden');
  const pp=$('#plPlay'); if(pp) pp.onclick=toggle;
  const pn=$('#plNext'); if(pn) pn.onclick=()=>next();
  const pv=$('#plPrev'); if(pv) pv.onclick=prev;
  const ps=$('#plShuffle'); if(ps) ps.onclick=()=>{ store.prefs.shuffle=!store.prefs.shuffle; save(); render(); toast(store.prefs.shuffle?'Shuffle on':'Shuffle off'); };
  const prp=$('#plRepeat'); if(prp) prp.onclick=cycleRepeat;
  const plk=$('#plLike'); if(plk) plk.onclick=()=>{ if(!currentId) return; const i=store.likes.indexOf(currentId); i>=0?store.likes.splice(i,1):store.likes.push(currentId); save(); render(); };
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
  const lpa=$('#listPlayAll'); if(lpa) lpa.onclick=()=>{ const ts=colTracks(); if(!ts.length) return; queue=[...ts.slice(1).map(t=>t.id),...queue]; playTrack(ts[0].id,{open:true,keepRadio:true}); render(); };
  const lsh=$('#listShuffle'); if(lsh) lsh.onclick=()=>{ const ts=colTracks(); if(!ts.length) return; const first=ts[Math.floor(Math.random()*ts.length)];
    queue=[...ts.filter(t=>t.id!==first.id).map(t=>t.id).sort(()=>Math.random()-0.5),...queue]; playTrack(first.id,{open:true,keepRadio:true}); render(); };
  const las=$('#listAddSongs'); if(las) las.onclick=()=>{ if(activeCol&&activeCol.type==='pl') songPicker(activeCol.id); };
  ['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); $('#dropOverlay').classList.remove('hidden'); }));
  ['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); if(ev==='dragleave'&&e.relatedTarget) return; $('#dropOverlay').classList.add('hidden'); }));
  document.addEventListener('drop',e=>{ if(e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  document.addEventListener('keydown',e=>{ if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName||'')) return;
    if(e.code==='Space'){ e.preventDefault(); toggle(); } else if(e.key==='ArrowRight') audio.currentTime+=10;
    else if(e.key==='ArrowLeft') audio.currentTime-=10; else if(e.key==='Escape'){ closeSheet(); closeSearchOverlay(); $('#playerOverlay').classList.add('hidden'); $('#listOverlay').classList.add('hidden'); } });
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
}
function segTo(s){ libSeg=s; $$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.seg===s));
  ['songs','albums','artists','folders','playlists','liked'].forEach(k=>$('#lib'+k[0].toUpperCase()+k.slice(1)).classList.toggle('hidden',s!==k));
  $('#newPlaylistBtn').classList.toggle('hidden',s!=='playlists'); }

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
  console.log('%cAsh\'s Player ready — '+all().length+' tracks','color:#2dd4bf;font-weight:bold');
})();
