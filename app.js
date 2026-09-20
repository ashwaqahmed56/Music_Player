/* Ash's Player — clean black and white edition. Sound fix: audio uses CORS + WebAudio graph with fallback. */
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

/* ---------- store (same key as v1 so likes/playlists survive the update) ---------- */
function defStore(){ return {
  likes:[], playlists:[], folders:[], recents:[], playCounts:{}, addedAt:{}, lyrics:{},
  volumes:{vol:100}, prefs:{shuffle:false, repeat:'off', speed:1, autoplay:true, theme:'dark'},
  eq:{enabled:true, gains:[0,0,0,0,0], preset:'Normal'},
  localMeta:{}, customTitles:{}, currentId:null, radio:false
};}
let store = (()=>{ try{ const r=localStorage.getItem(LS_KEY); if(r){ const d=defStore(); return Object.assign(d, JSON.parse(r)); } }catch(e){} return defStore(); })();
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch(e){} }

/* ---------- library ---------- */
let localTracks = [], cache = [];
function rebuild(){
  // demos disappear once the user adds their own music
  const base = localTracks.length ? [] : DEMO.map(d=>({...d}));
  cache = [...base, ...localTracks];
  cache.forEach(t=>{ const c=store.customTitles[t.id]; if(c){ t.title=c.title||t.title; t.artist=c.artist||t.artist; }
    if(store.localMeta[t.id]?.duration) t.duration = store.localMeta[t.id].duration; });
}
const getT = (id)=>cache.find(t=>t.id===id);
const all = ()=>cache;

/* ---------- IndexedDB ---------- */
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('nova_music_db',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function idbPut(o){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').put(o); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function idbAll(){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction('files','readonly').objectStore('files').getAll(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); }); }
async function idbDel(id){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('files','readwrite'); tx.objectStore('files').delete(id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
async function loadLocal(){ try{ const recs=await idbAll();
  localTracks = recs.map(r=>({ id:r.id, title:r.title||r.name, artist:r.artist||'My Music', album:r.folder||'My Files', folder:r.folder||'My Music', src:URL.createObjectURL(r.blob), source:'local', duration:r.duration||0, fileName:r.name, hue:(r.name.length*47)%360 }));
 }catch(e){ localTracks=[]; } rebuild(); }

/* ---------- audio engine (SOUND FIX: CORS + graph fallback) ---------- */
const audio = $('#audio');
audio.crossOrigin = 'anonymous';
audio.volume = (store.volumes.vol ?? 90)/100;
audio.playbackRate = store.prefs.speed || 1;
let actx=null, eqNodes=[], analyser=null, graphOK=false;
function ensureGraph(){
  if(actx){ if(actx.state==='suspended') actx.resume().catch(()=>{}); return graphOK; }
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
  eqNodes.forEach((n,i)=>n.gain.value = store.eq.enabled ? (store.eq.gains[i]||0) : 0); }

/* ---------- state ---------- */
let queue=[], currentId=store.currentId||null, sleepId=null, activeCol=null, libSeg='songs';
const fmt=(s)=>{ s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); };
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){ const d=document.createElement('div'); d.className='toast'; d.textContent=m; $('#toastWrap').appendChild(d); setTimeout(()=>{d.style.opacity='0'; setTimeout(()=>d.remove(),300);},2400); }
function artStyle(t){ const h=t?.hue??220, l=20+((h%5)*4); return `background:linear-gradient(135deg,hsl(0 0% ${l+14}%),hsl(0 0% ${l}%))`; }
function artHTML(t,cls){ const ch=(t?.title||'♪').trim().charAt(0).toUpperCase()||'♪';
  if(t?.coverUrl) return `<div class="${cls}"><img src="${t.coverUrl}" alt=""/></div>`;
  return `<div class="${cls}" style="${artStyle(t)}">${ch}</div>`; }

/* ---------- SVG icon set (no emojis) ---------- */
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
};

/* ---------- playback ---------- */
function playTrack(id, opts){
  const t=getT(id); if(!t) return;
  ensureGraph();
  if(audio.src!==t.src){ audio.src=t.src; audio.crossOrigin='anonymous'; }
  audio.playbackRate=store.prefs.speed||1;
  if(opts && opts.open){ $('#listOverlay').classList.add('hidden'); $('#playerOverlay').classList.remove('hidden'); }
  audio.play().then(()=>{
    currentId=id; store.currentId=id;
    store.recents=[id,...store.recents.filter(x=>x!==id)].slice(0,50);
    store.playCounts[id]=(store.playCounts[id]||0)+1; save();
    render(); mediaSession();
  }).catch(err=>{ console.warn(err);
    if(!navigator.onLine && t.source==='demo') toast('Demo songs need internet');
    else toast('Tap play again'); });
}
function toggle(){ if(!currentId){ const f=all()[0]; if(f) return playTrack(f.id); return toast('Add music first'); }
  ensureGraph(); if(audio.paused) audio.play().catch(()=>toast('Tap play again')); else audio.pause(); }
function next(auto=false){
  if(queue.length){ const id=queue.shift(); render(); return playTrack(id); }
  const list=all(); if(!list.length) return;
  if(store.prefs.shuffle || store.radio || auto && store.radio){ return playTrack(list[Math.floor(Math.random()*list.length)].id); }
  let i=list.findIndex(t=>t.id===currentId);
  if(i<0) return playTrack(list[0].id);
  if(i<list.length-1) return playTrack(list[i+1].id);
  if(store.prefs.repeat==='all') return playTrack(list[0].id);
  if(!auto) return playTrack(list[0].id);
}
function prev(){ if(audio.currentTime>3){ audio.currentTime=0; return; }
  const list=all(); let i=list.findIndex(t=>t.id===currentId);
  if(i>0) playTrack(list[i-1].id); else if(list.length) playTrack(list[list.length-1].id); }
function cycleRepeat(){ store.prefs.repeat = store.prefs.repeat==='off'?'all':store.prefs.repeat==='all'?'one':'off'; save(); render(); toast('Repeat: '+store.prefs.repeat); }

audio.addEventListener('timeupdate',()=>{
  const d=audio.duration||getT(currentId)?.duration||0, c=audio.currentTime||0;
  const v=d?Math.round(c/d*1000):0;
  $('#plSeek').value=v; $('#plCur').textContent=fmt(c); $('#plDur').textContent=fmt(d);
  $('#miniProg').style.width=(d?c/d*100:0)+'%';
});
audio.addEventListener('loadedmetadata',()=>{ const t=getT(currentId);
  if(t?.source==='local'&&audio.duration&&isFinite(audio.duration)){ store.localMeta[t.id]={duration:Math.round(audio.duration)}; save(); } });
audio.addEventListener('ended',()=>{ if(store.prefs.repeat==='one'){ audio.currentTime=0; audio.play().catch(()=>{}); return; }
  if(store.prefs.autoplay||store.radio||queue.length) next(true); });
audio.addEventListener('play',render); audio.addEventListener('pause',render);
function mediaSession(){ if(!('mediaSession' in navigator)) return; const t=getT(currentId); if(!t) return;
  try{ navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album||"Ash's Player"});
    navigator.mediaSession.setActionHandler('play',()=>audio.play()); navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack',prev); navigator.mediaSession.setActionHandler('nexttrack',()=>next());
  }catch(e){} }

/* ---------- lists ---------- */
function searchFilter(list){ const q=($('#searchInput').value||'').toLowerCase().trim();
  if(!q) return list; return list.filter(t=>(t.title+' '+t.artist+' '+(t.album||'')).toLowerCase().includes(q)); }
function trackRow(t){
  const d=document.createElement('div'); d.className='track'+(t.id===currentId?' playing':'');
  d.innerHTML=`${artHTML(t,'t-art')}<div class="t-meta"><b>${esc(t.title)}</b><span>${esc(t.artist)}${t.duration?' · '+fmt(t.duration):''}${t.source==='demo'?' · online':''}</span></div><button class="t-menu">⋮</button>`;
  d.onclick=()=>playTrack(t.id,{open:true});
  d.querySelector('.t-menu').onclick=(e)=>{ e.stopPropagation(); songMenu(t.id); };
  return d;
}
function paint(el,list,empty){ el.innerHTML=''; if(!list.length){ el.innerHTML=`<p class="muted center">${empty}</p>`; return; } list.forEach(t=>el.appendChild(trackRow(t))); }

/* ---------- render ---------- */
function render(){
  rebuild();
  const q=($('#searchInput').value||'').toLowerCase().trim();
  const plays=id=>store.playCounts[id]||0;
  const popular=all().slice().sort((a,b)=>plays(b.id)-plays(a.id)).slice(0,8);
  // home popular cards
  const pr=$('#popularRow'); pr.innerHTML='';
  (q?searchFilter(all()).slice(0,8):popular).forEach(t=>{
    const c=document.createElement('div'); c.className='pop-card';
    c.innerHTML=`${artHTML(t,'pop-art').replace('pop-art','pop-art')}<div class="pop-art" style="display:none"></div>`;
    // rebuild properly:
    c.innerHTML='';
    const a=document.createElement('div'); a.className='pop-art'; a.style.cssText=artStyle(t);
    if(t.coverUrl){ a.innerHTML=`<img src="${t.coverUrl}" alt=""/>`; } else a.textContent=(t.title||'♪').trim().charAt(0).toUpperCase();
    const pb=document.createElement('button'); pb.className='pop-play'; pb.innerHTML = currentId===t.id&&!audio.paused?ICONS.pause:ICONS.play;
    pb.onclick=(e)=>{ e.stopPropagation(); currentId===t.id?toggle():playTrack(t.id,{open:true}); };
    a.appendChild(pb); c.appendChild(a);
    const b=document.createElement('b'); b.textContent=t.title; c.appendChild(b);
    const s=document.createElement('span'); s.textContent=t.artist; c.appendChild(s);
    c.onclick=()=>playTrack(t.id,{open:true}); pr.appendChild(c);
  });
  // home playlists (first 3) + recent
  const hp=$('#homePlaylists'); hp.innerHTML='';
  if(!store.playlists.length) hp.innerHTML='<p class="muted">No playlists yet — make one in Library</p>';
  store.playlists.slice(0,3).forEach(pl=>hp.appendChild(plRow(pl)));
  paint($('#homeRecent'), store.recents.map(getT).filter(Boolean).slice(0,5), 'Nothing played yet — tap a song');
  // new: by addedAt desc
  paint($('#newList'), searchFilter(all()).slice().sort((a,b)=>(store.addedAt[b.id]||0)-(store.addedAt[a.id]||0)).slice(0,30), 'Nothing here yet');
  // library
  $('#libSub').textContent=`${all().length} songs · ${localTracks.length} yours`;
  paint($('#libSongs'), searchFilter(all()), 'No songs — tap ＋ to add your music');
  const lp=$('#libPlaylists'); lp.innerHTML='';
  if(!store.playlists.length) lp.innerHTML='<p class="muted center">No playlists yet</p>';
  store.playlists.forEach(pl=>lp.appendChild(plRow(pl)));
  $('#newPlaylistBtn').classList.toggle('hidden', libSeg!=='playlists');
  const lf=$('#libFolders'); lf.innerHTML='';
  if(!store.folders.length) lf.innerHTML='<p class="muted center">No folders yet — tap + and pick a folder</p>';
  store.folders.forEach(f=>{ const ts=f.trackIds.map(getT).filter(Boolean);
    const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
    const d=document.createElement('div'); d.className='track';
    d.innerHTML=`<div class="t-art" style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;display:flex;align-items:center;justify-content:center">${ICONS.folder}</div><div class="t-meta"><b>${esc(f.name)}</b><span>${ts.length} songs${tot?' · '+fmt(tot):''}</span></div><button class="t-menu">›</button>`;
    d.onclick=()=>openFolder(f.id); lf.appendChild(d); });
  paint($('#libLiked'), all().filter(t=>store.likes.includes(t.id)), 'Tap ☆ on any song to like it');
  // radio
  const rt=getT(currentId);
  $('#radioTitle').textContent=rt?rt.title:'Nothing playing';
  $('#radioArtist').textContent=rt?rt.artist:'Tap play to start the mix';
  $('#radioToggle').innerHTML=(!audio.paused&&currentId)?ICONS.pause:ICONS.play;
  const ra=$('#radioArt');
  if(rt?.coverUrl) ra.innerHTML=`<img src="${rt.coverUrl}" style="width:100%;height:100%;object-fit:cover" alt=""/>`;
  else if(rt){ ra.innerHTML=(rt.title||'R')[0].toUpperCase(); ra.style.cssText=artStyle(rt); }
  else { ra.innerHTML=ICONS.radio; ra.style.cssText=''; }
  paint($('#radioNext'), queue.map(getT).filter(Boolean).slice(0,3), store.radio?'Random mix is on':'Queue is empty');
  // mini + player
  const playing=currentId&&!audio.paused;
  $('#miniPlayer').classList.toggle('hidden',!currentId);
  if(rt){ $('#miniTitle').textContent=rt.title; $('#miniArtist').textContent=rt.artist;
    const mc=$('#miniCover'); if(rt.coverUrl) mc.innerHTML=`<img src="${rt.coverUrl}" alt=""/>`; else { mc.textContent=(rt.title||'♪')[0].toUpperCase(); mc.style.cssText=artStyle(rt); }
    setMarquee($('#plTitle'), rt.title);
    $('#plArtist').textContent=rt.artist+(rt.album?' · '+rt.album:'');
    const pa=$('#plArt'); if(rt.coverUrl) pa.innerHTML=`<img src="${rt.coverUrl}" alt=""/>`; else { pa.textContent=(rt.title||'♪')[0].toUpperCase(); pa.style.cssText=artStyle(rt); }
    pa.classList.toggle('playing',!!playing);
    $('#plLyrPreview').textContent=(store.lyrics[currentId]||'').split('\n')[0]||'Lyrics will appear here';
  }
  $('#miniPlay').innerHTML=playing?ICONS.pause:ICONS.play;
  $('#miniNext').innerHTML=ICONS.next;
  $('#plPlay').innerHTML=playing?ICONS.pause:ICONS.play;
  $('#plPrev').innerHTML=ICONS.prev; $('#plNext').innerHTML=ICONS.next;
  $('#plShuffle').innerHTML=ICONS.shuffle;
  $('#plShuffle').classList.toggle('off',!store.prefs.shuffle);
  $('#plRepeat').innerHTML=store.prefs.repeat==='one'?ICONS.repeat1:ICONS.repeat;
  $('#plRepeat').classList.toggle('off',store.prefs.repeat==='off');
  $('#plLike').innerHTML=currentId&&store.likes.includes(currentId)?ICONS.starF:ICONS.star;
  $('#plSleepBtn').style.borderColor=sleepId?'var(--txt)':'';
  document.documentElement.dataset.theme = store.prefs.theme==='light'?'light':'dark';
  document.querySelector('meta[name=theme-color]').content = store.prefs.theme==='light' ? '#f2f3f6' : '#0b0b0e';
  syncNotif();
  const h=new Date().getHours();
  $('#greetTitle').textContent=(h<12?'Good morning':h<17?'Good afternoon':'Good evening');
}
/* marquee long titles in the player instead of truncating */
function setMarquee(el, text){
  el.classList.remove('scroll'); el.textContent=text;
  requestAnimationFrame(()=>{
    if(el.scrollWidth>el.clientWidth+4){
      el.innerHTML=`<span class="mq"><span>${esc(text)}</span><span>${esc(text)}</span></span>`;
      el.classList.add('scroll');
    }
    el.classList.toggle('paused', audio.paused);
  });
}
function plRow(pl){
  const d=document.createElement('div'); d.className='track';
  d.innerHTML=`<div class="t-art" style="background:linear-gradient(135deg,hsl(0 0% 30%),hsl(0 0% 12%))">${esc((pl.name||'P')[0].toUpperCase())}</div><div class="t-meta"><b>${esc(pl.name)}</b><span>${pl.trackIds.length} songs</span></div><button class="t-menu">›</button>`;
  d.onclick=()=>openPlaylist(pl.id); return d;
}

/* ---------- Android system back button (native app) ---------- */
function nativeBack(){
  try{
    const C=window.Capacitor;
    if(!C?.isNativePlatform?.() || !C.Plugins?.App) return;
    C.Plugins.App.addListener('backButton', ()=>{
      if(!$('#sheetBack').classList.contains('hidden')) closeSheet();
      else if(!$('#playerOverlay').classList.contains('hidden')) $('#playerOverlay').classList.add('hidden');
      else if(!$('#listOverlay').classList.contains('hidden')) $('#listOverlay').classList.add('hidden');
      else if(document.querySelector('.screen.active')?.id!=='screen-home') tab('home');
      else { try{ C.Plugins.App.minimizeApp(); }catch(e){ try{C.Plugins.App.exitApp();}catch(_){} } }
    });
  }catch(e){}
}
/* ---------- native lock-screen / notification controls ---------- */
let _notifState='', _mcListening=false;
function syncNotif(){
  mediaSession(); // browser / PWA path
  try{
    const C=window.Capacitor, MC=window.MusicControls;
    if(!C?.isNativePlatform?.() || !MC) return;
    const t=getT(currentId);
    if(!t){ try{MC.destroy(()=>{},()=>{});}catch(e){} _notifState=''; return; }
    const playing=!audio.paused, key=t.id+(playing?'1':'0');
    if(key===_notifState) return;
    const trackChanged=!_notifState || _notifState.slice(0,-1)!==t.id;
    _notifState=key;
    if(!_mcListening){ _mcListening=true;
      try{
        MC.subscribe(function(action){
          let message='';
          try{ message=JSON.parse(action).message; }catch(e){}
          if(message==='music-controls-play') audio.play().catch(()=>{});
          else if(message==='music-controls-pause') audio.pause();
          else if(message==='music-controls-next') next();
          else if(message==='music-controls-previous') prev();
          else if(message==='music-controls-destroy'){ try{audio.pause();}catch(e){} _notifState=''; }
        });
        MC.listen(()=>{},()=>{});
      }catch(e){}
    }
    const cover=(t.coverUrl&&/^https?:/.test(t.coverUrl))?t.coverUrl:'';
    if(!trackChanged){ try{ MC.updateIsPlaying(playing, ()=>{}, ()=>{}); }catch(e){} return; }
    MC.create({ track:t.title, artist:t.artist, cover:cover,
      isPlaying:playing, dismissable:true, hasPrev:true, hasNext:true, hasClose:true,
      ticker:'Now playing "'+t.title+'"' }, ()=>{}, ()=>{ _notifState=''; });
  }catch(e){}
}

/* ---------- tabs ---------- */
function tab(name){ $$('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $$('.screen').forEach(s=>s.classList.remove('active')); $('#screen-'+name).classList.add('active'); }

/* ---------- sheets ---------- */
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
  $('#mPlay').onclick=()=>{ closeSheet(); playTrack(id); };
  $('#mNext').onclick=()=>{ queue.unshift(id); closeSheet(); render(); toast('Plays next'); };
  $('#mQueue').onclick=()=>{ queue.push(id); closeSheet(); render(); toast('Added to queue'); };
  $('#mLike').onclick=()=>{ const i=store.likes.indexOf(id); i>=0?store.likes.splice(i,1):store.likes.push(id); save(); closeSheet(); render(); };
  $('#mPl').onclick=()=>plPicker(id);
  $('#mLyr').onclick=()=>lyrEditor(id);
  $('#mRen').onclick=()=>{ sheet(`<h2>Rename</h2><input type="text" id="rnT" value="${esc(t.title)}"/><input type="text" id="rnA" value="${esc(t.artist)}"/><button class="opt" id="rnS">💾 Save</button>`);
    $('#rnS').onclick=()=>{ store.customTitles[id]={title:$('#rnT').value.trim()||t.title,artist:$('#rnA').value.trim()||t.artist}; save(); closeSheet(); render(); }; };
  const del=$('#mDel'); if(del) del.onclick=async()=>{ if(!confirm('Delete this song from library?'))return;
    await idbDel(id); store.likes=store.likes.filter(x=>x!==id); store.playlists.forEach(p=>p.trackIds=p.trackIds.filter(x=>x!==id));
    if(currentId===id){ audio.pause(); currentId=null; } await loadLocal(); save(); closeSheet(); render(); toast('Deleted'); };
}
function plPicker(id){
  sheet(`<h2>Add to playlist</h2>${store.playlists.length?store.playlists.map(p=>`<button class="opt" data-p="${p.id}">${esc(p.name)} (${p.trackIds.length})</button>`).join(''):'<p class="muted">No playlists yet</p>'}<button class="opt" id="pNew">New playlist</button><button class="opt" id="pX">Close</button>`);
  $('#pX').onclick=closeSheet; $('#pNew').onclick=newPlaylist;
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ const pl=store.playlists.find(p=>p.id===b.dataset.p);
    if(pl&&!pl.trackIds.includes(id)) pl.trackIds.push(id); save(); closeSheet(); render(); toast('Added to '+pl.name); });
}
function newPlaylist(){ sheet(`<h2>New playlist</h2><input type="text" id="npN" placeholder="Name it..."/><button class="opt" id="npS">Create</button>`);
  $('#npS').onclick=()=>{ const n=$('#npN').value.trim()||'My Mix'; store.playlists.push({id:'pl_'+Date.now(),name:n,trackIds:[]}); save(); closeSheet(); render(); toast('Playlist created'); }; }
function lyrEditor(id){ const t=getT(id);
  sheet(`<h2>Lyrics — ${esc(t.title)}</h2><textarea id="lyT" placeholder="Paste lyrics...">${esc(store.lyrics[id]||'')}</textarea><button class="opt" id="lyS">Save lyrics</button>`);
  $('#lyS').onclick=()=>{ store.lyrics[id]=$('#lyT').value; save(); closeSheet(); render(); toast('Lyrics saved'); }; }
function eqSheet(){
  sheet(`<h2>Equalizer</h2><label class="switch"><input type="checkbox" id="eqE" ${store.eq.enabled?'checked':''}/> Enable EQ</label>
  <div class="chips">${Object.keys(EQ_PRESETS).map(n=>`<button class="${store.eq.preset===n?'active':''}" data-p="${n}">${n}</button>`).join('')}</div>
  <div id="eqRows">${EQ_BANDS.map((b,i)=>`<div class="eq-row"><label>${b.l}</label><input type="range" min="-12" max="12" data-i="${i}" value="${store.eq.gains[i]||0}"/><span>${store.eq.gains[i]||0} dB</span></div>`).join('')}</div>
  <button class="opt" id="eqX">Close</button>`);
  $('#eqX').onclick=closeSheet;
  $('#eqE').onchange=e=>{ store.eq.enabled=e.target.checked; save(); applyEQ(); };
  $$('#sheetBox [data-p]').forEach(b=>b.onclick=()=>{ store.eq.preset=b.dataset.p; store.eq.gains=[...EQ_PRESETS[b.dataset.p]]; save(); applyEQ(); eqSheet(); });
  $$('#eqRows input').forEach(r=>r.oninput=()=>{ store.eq.gains[+r.dataset.i]=+r.value; r.nextElementSibling.textContent=r.value+' dB'; store.eq.preset='Custom'; save(); applyEQ(); });
}
function sleepSheet(){ sheet(`<h2>Sleep timer</h2><div class="chips">${[5,10,15,30,60].map(m=>`<button data-m="${m}">${m} min</button>`).join('')}<button data-m="0">Off</button></div><button class="opt" id="slX">Close</button>`);
  $('#slX').onclick=closeSheet;
  $$('#sheetBox [data-m]').forEach(b=>b.onclick=()=>{ setSleep(+b.dataset.m); closeSheet(); }); }
function setSleep(min){ if(sleepId){ clearTimeout(sleepId); sleepId=null; }
  if(min>0){ sleepId=setTimeout(()=>{ const f=setInterval(()=>{ if(audio.volume>0.08) audio.volume-=0.08; else { clearInterval(f); audio.pause(); audio.volume=1; } },200); sleepId=null; render(); toast('Sleep timer ended'); },min*60000); toast('Music stops in '+min+' min'); }
  else toast('Sleep timer off'); render(); }
function queueSheet(){ sheet(`<h2>Up next (${queue.length})</h2><div class="v-list" id="qL"></div><button class="opt" id="qC">Clear queue</button><button class="opt" id="qX">Close</button>`);
  const ql=$('#qL'); ql.innerHTML=queue.length?'':'<p class="muted">Empty — use the menu on any song</p>';
  queue.map(getT).filter(Boolean).forEach((t,i)=>{ const r=trackRow(t); const x=document.createElement('button'); x.className='t-menu'; x.textContent='✕';
    x.onclick=e=>{ e.stopPropagation(); queue.splice(i,1); queueSheet(); render(); }; r.querySelector('.t-menu').replaceWith(x); ql.appendChild(r); });
  $('#qC').onclick=()=>{ queue=[]; queueSheet(); render(); }; $('#qX').onclick=closeSheet; }
function settingsSheet(){
  sheet(`<h2>Settings</h2>  <h3>Theme</h3><div class="chips"><button data-th="dark" class="${store.prefs.theme!=='light'?'active':''}">Dark</button><button data-th="light" class="${store.prefs.theme==='light'?'active':''}">Light</button></div>
  <h3>Playback</h3><div class="eq-row"><label>Speed</label><input type="range" id="sSp" min="0.5" max="2" step="0.05" value="${store.prefs.speed}"/><span>${(+store.prefs.speed).toFixed(2)}x</span></div>
  <label class="switch"><input type="checkbox" id="sAu" ${store.prefs.autoplay?'checked':''}/> Autoplay next song</label>
  <h3>Library</h3><button class="opt" id="sEx">Export backup</button><button class="opt" id="sIm">Import backup</button><button class="opt danger" id="sRe">Reset everything</button>
  <p class="muted">Ash's Player · clean black and white edition · offline ready</p><button class="opt" id="sX">Close</button>`);
  $('#sX').onclick=closeSheet;
  $$('#sheetBox [data-th]').forEach(b=>b.onclick=()=>{ store.prefs.theme=b.dataset.th; save(); settingsSheet(); render(); });
  $('#sSp').oninput=e=>{ store.prefs.speed=+e.target.value; audio.playbackRate=store.prefs.speed; e.target.nextElementSibling.textContent=store.prefs.speed.toFixed(2)+'×'; save(); };
  $('#sAu').onchange=e=>{ store.prefs.autoplay=e.target.checked; save(); };
  $('#sEx').onclick=()=>{ const b=new Blob([JSON.stringify({store,at:new Date().toISOString()},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='ashs-player-backup.json'; a.click(); toast('Exported'); };
  $('#sIm').onclick=()=>$('#importFile').click();
  $('#sRe').onclick=()=>{ if(confirm('Reset likes, playlists & files?')){ localStorage.removeItem(LS_KEY); indexedDB.deleteDatabase('nova_music_db'); location.reload(); } };
}

/* ---------- playlist & folder pages ---------- */
function colTracks(){ if(!activeCol) return [];
  const src = activeCol.type==='pl'
    ? (store.playlists.find(p=>p.id===activeCol.id)?.trackIds||[])
    : (store.folders.find(f=>f.id===activeCol.id)?.trackIds||[]);
  return src.map(getT).filter(Boolean); }
function openPlaylist(pid){ const pl=store.playlists.find(p=>p.id===pid); if(!pl) return; activeCol={type:'pl',id:pid};
  $('#listTitle').textContent=pl.name; $('#listSub').textContent=pl.trackIds.length+' songs';
  const el=$('#listSongs'); el.innerHTML='';
  if(!pl.trackIds.length) el.innerHTML='<p class="muted center">Empty — add songs with ⋮ menu</p>';
  pl.trackIds.map(getT).filter(Boolean).forEach(t=>el.appendChild(trackRow(t)));
  $('#listOverlay').classList.remove('hidden'); }
function openFolder(fid){ const f=store.folders.find(x=>x.id===fid); if(!f) return; activeCol={type:'fo',id:fid};
  $('#listTitle').textContent='📁 '+f.name;
  const ts=f.trackIds.map(getT).filter(Boolean);
  const tot=ts.reduce((a,t)=>a+(t.duration||0),0);
  $('#listSub').textContent=ts.length+' songs'+(tot?' · '+fmt(tot):'');
  const el=$('#listSongs'); el.innerHTML='';
  if(!ts.length) el.innerHTML='<p class="muted center">Empty folder</p>';
  ts.forEach(t=>el.appendChild(trackRow(t)));
  const del=document.createElement('button'); del.className='neon-btn ghost'; del.textContent='Remove folder + songs';
  del.onclick=async()=>{ if(!confirm('Remove "'+f.name+'" and its '+ts.length+' songs from the library?')) return;
    for(const tid of f.trackIds){ await idbDel(tid);
      store.likes=store.likes.filter(x=>x!==tid);
      store.playlists.forEach(p=>p.trackIds=p.trackIds.filter(x=>x!==tid)); }
    store.folders=store.folders.filter(x=>x.id!==fid);
    if(currentId&&f.trackIds.includes(currentId)){ audio.pause(); currentId=null; store.currentId=null; }
    await loadLocal(); save(); $('#listOverlay').classList.add('hidden'); render(); toast('Folder removed 🗑'); };
  el.appendChild(del);
  $('#listOverlay').classList.remove('hidden'); }

/* ---------- files & folders ---------- */
function folderOf(entry){ const p=entry.path||''; if(p&&p.includes('/')) return p.split('/')[0]; return ''; }
async function handleFiles(files, folderHint){
  const norm=[...files].map(f=> f instanceof Blob
    ? { name:f.name||'song', blob:f, path:f.webkitRelativePath||'' }
    : { name:f.name||'song', blob:f.blob||f, path:'' });
  const arr=norm.filter(f=>(f.blob?.type||'').startsWith('audio')||/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(f.name));
  if(!arr.length) return toast('No audio files found');
  const folderName = folderHint || folderOf(arr[0]) || 'My Music';
  let folder = store.folders.find(f=>f.name===folderName);
  if(!folder){ folder={id:'f_'+Date.now(), name:folderName, trackIds:[]}; store.folders.push(folder); }
  for(const f of arr){
    const id='local_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    let title=f.name.replace(/\.[^.]+$/,''), artist=folderName;
    try{ const tg=await readTags(f.blob); if(tg.title) title=tg.title; if(tg.artist) artist=tg.artist; }catch(e){}
    const dur=await probeDur(f.blob).catch(()=>0);
    await idbPut({id,name:f.name,title,artist,blob:f.blob,folder:folderName,duration:dur});
    store.addedAt[id]=Date.now(); folder.trackIds.push(id);
  }
  save(); await loadLocal(); save(); render(); segTo('folders'); tab('library');
  toast(arr.length+' song'+(arr.length>1?'s':'')+' → 📁 '+folderName); }
function addMenu(){ sheet(`<h2>Add music</h2><p class="muted">Stays on your device · plays offline forever</p>
  <button class="opt" id="aFolder">Choose a whole folder (kept separate)</button>
  <button class="opt" id="aSongs">Choose songs</button>
  <button class="opt" id="aX">Close</button>`);
  $('#aX').onclick=closeSheet;
  $('#aFolder').onclick=()=>{ closeSheet(); nativeOr(()=>$('#folderInput').click()); };
  $('#aSongs').onclick=()=>{ closeSheet(); nativeOr(()=>$('#fileInput').click()); }; }
/* native (Capacitor) file picker with browser fallback */
async function nativeOr(fallback){
  try{ const C=window.Capacitor;
    if(C?.isNativePlatform?.() && C.Plugins?.FilePicker){
      const r=await C.Plugins.FilePicker.pickFiles({multiple:true, readData:true});
      const files=(r.files||[]).filter(x=>x.data).map(x=>({name:x.name||'song.mp3', blob:b64ToBlob(x.data, x.mimeType||'audio/mpeg')}));
      if(files.length){ handleFiles(files); return; }
    }
  }catch(e){ console.warn('native pick failed, using browser', e); }
  fallback(); }
function b64ToBlob(b64, mime){ const bin=atob(b64); const u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return new Blob([u8],{type:mime}); }
function readTags(f){ return new Promise(res=>{ if(!window.jsmediatags) return res({});
  try{ window.jsmediatags.read(f,{onSuccess:t=>{const g=t.tags||{};const o={title:g.title,artist:g.artist};
    if(g.picture?.data){ try{ let b=''; g.picture.data.forEach(v=>b+=String.fromCharCode(v)); o.coverUrl=`data:${g.picture.format};base64,${btoa(b)}`;}catch(e){} } res(o);},onError:()=>res({})});
    setTimeout(()=>res({}),4000); }catch(e){ res({}); } }); }
function probeDur(f){ return new Promise(res=>{ const u=URL.createObjectURL(f); const a=new Audio(); a.preload='metadata'; a.src=u;
  a.onloadedmetadata=()=>{ const d=Math.round(a.duration||0); URL.revokeObjectURL(u); res(d); }; a.onerror=()=>{ URL.revokeObjectURL(u); res(0); }; setTimeout(()=>res(0),8000); }); }

/* ---------- events ---------- */
function bind(){
  $$('.bottom-nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('#homeSettings').onclick=settingsSheet; $('#libSettings').onclick=settingsSheet;
  $('#seeAllPopular').onclick=()=>tab('library'); $('#seeAllPl').onclick=()=>{ tab('library'); segTo('playlists'); };
  $('#searchInput').addEventListener('input',e=>{ $('#clearSearch').classList.toggle('hidden',!e.target.value); render(); });
  $('#clearSearch').onclick=()=>{ $('#searchInput').value=''; $('#clearSearch').classList.add('hidden'); render(); };
  const add=()=>addMenu();
  $('#addMusicBtn2').onclick=add; $('#libAdd').onclick=add;
  $('#fileInput').onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  $('#folderInput').onchange=e=>{ handleFiles(e.target.files); e.target.value=''; };
  window.addEventListener('offline',()=>toast('Offline — your songs still play 📴'));
  window.addEventListener('online',()=>toast('Back online 🌐'));
  $('#importFile').onchange=e=>{ const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result); if(d.store){ store=Object.assign(defStore(),d.store); save(); applyEQ(); render(); toast('Backup restored ✓'); } }catch(err){ toast('Invalid file'); } }; r.readAsText(f); e.target.value=''; };
  $$('.seg button').forEach(b=>b.onclick=()=>segTo(b.dataset.seg));
  $('#newPlaylistBtn').onclick=newPlaylist;
  // mini
  $('#miniPlay').onclick=e=>{ e.stopPropagation(); toggle(); };
  $('#miniNext').onclick=e=>{ e.stopPropagation(); next(); };
  $('#miniPlayer').onclick=()=>$('#playerOverlay').classList.remove('hidden');
  // player
  $('#plBack').onclick=()=>$('#playerOverlay').classList.add('hidden');
  $('#plPlay').onclick=toggle; $('#plNext').onclick=()=>next(); $('#plPrev').onclick=prev;
  $('#plShuffle').onclick=()=>{ store.prefs.shuffle=!store.prefs.shuffle; save(); render(); };
  $('#plRepeat').onclick=cycleRepeat;
  $('#plLike').onclick=()=>{ if(!currentId) return; const i=store.likes.indexOf(currentId); i>=0?store.likes.splice(i,1):store.likes.push(currentId); save(); render(); };
  $('#plQueueBtn').onclick=queueSheet; $('#plMenu').onclick=()=>{ if(currentId) songMenu(currentId); };
  $('#plLyricsBtn').onclick=()=>{ if(currentId) lyrEditor(currentId); else toast('Play a song first'); };
  $('#plEqBtn').onclick=eqSheet; $('#plSleepBtn').onclick=sleepSheet;
  $('#plSeek').addEventListener('input',e=>{ const d=audio.duration||0; if(d) audio.currentTime=e.target.value/1000*d; });
  // radio
  $('#radioToggle').onclick=()=>{ if(!audio.paused&&currentId){ audio.pause(); render(); return; }
    store.radio=true; save(); if(queue.length){ const id=queue.shift(); playTrack(id,{open:true}); } else { const l=all(); if(l.length) playTrack(l[Math.floor(Math.random()*l.length)].id,{open:true}); } render(); };
  // playlist page
  $('#listBack').onclick=()=>$('#listOverlay').classList.add('hidden');
  $('#listPlayAll').onclick=()=>{ const ts=colTracks(); if(ts.length) playTrack(ts[0].id,{open:true}); };
  $('#listShuffle').onclick=()=>{ const ts=colTracks(); if(ts.length) playTrack(ts[Math.floor(Math.random()*ts.length)].id,{open:true}); };
  // drag drop
  ['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); $('#dropOverlay').classList.remove('hidden'); }));
  ['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); if(ev==='dragleave'&&e.relatedTarget) return; $('#dropOverlay').classList.add('hidden'); }));
  document.addEventListener('drop',e=>{ if(e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  // keyboard (PC test)
  document.addEventListener('keydown',e=>{ if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')) return;
    if(e.code==='Space'){ e.preventDefault(); toggle(); } else if(e.key==='ArrowRight') audio.currentTime+=10;
    else if(e.key==='ArrowLeft') audio.currentTime-=10; else if(e.key==='Escape'){ closeSheet(); $('#playerOverlay').classList.add('hidden'); $('#listOverlay').classList.add('hidden'); } });
  // swipe on player
  let tx=0; const fp=$('#playerOverlay');
  fp.addEventListener('touchstart',e=>tx=e.touches[0].clientX,{passive:true});
  fp.addEventListener('touchend',e=>{ const dx=e.changedTouches[0].clientX-tx; if(Math.abs(dx)>70){ dx<0?next():prev(); } },{passive:true});
  nativeBack();
}
function segTo(s){ libSeg=s; $$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.seg===s));
  ['songs','folders','playlists','liked'].forEach(k=>$('#lib'+k[0].toUpperCase()+k.slice(1)).classList.toggle('hidden',s!==k));
  $('#newPlaylistBtn').classList.toggle('hidden',s!=='playlists'); }

/* ---------- boot ---------- */
(async function(){
  DEMO.forEach((d,i)=>{ if(!store.addedAt[d.id]) store.addedAt[d.id]=Date.now()-(100-i)*60000; });
  rebuild(); bind(); render();
  audio.volume=1;
  await loadLocal(); render();
  if(!navigator.onLine) setTimeout(()=>toast('Offline mode — your music plays without internet'),900);
  if(currentId&&getT(currentId)){ audio.src=getT(currentId).src; audio.playbackRate=store.prefs.speed||1; render(); }
  console.log('%cAsh\'s Player ready — '+all().length+' tracks','color:#00f0ff;font-weight:bold');
})();
