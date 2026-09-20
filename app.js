/* Nova Music Player - full engine */
'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const LS_KEY = 'nova_player_v1';

const DEMO_TRACKS = [
  { id:'demo1', title:'SoundHelix Song 1', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', source:'demo', duration:372, hue:265 },
  { id:'demo2', title:'SoundHelix Song 2', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', source:'demo', duration:425, hue:190 },
  { id:'demo3', title:'SoundHelix Song 3', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', source:'demo', duration:449, hue:150 },
  { id:'demo4', title:'SoundHelix Song 4', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', source:'demo', duration:362, hue:20 },
  { id:'demo5', title:'SoundHelix Song 5', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', source:'demo', duration:304, hue:330 },
  { id:'demo6', title:'SoundHelix Song 6', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', source:'demo', duration:396, hue:210 },
  { id:'demo7', title:'SoundHelix Song 7', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3', source:'demo', duration:402, hue:120 },
  { id:'demo8', title:'SoundHelix Song 8', artist:'SoundHelix', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', source:'demo', duration:367, hue:280 },
  { id:'demo9', title:'SoundHelix Song 9', artist:'T. Schürger', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3', source:'demo', duration:390, hue:0 },
  { id:'demo10', title:'SoundHelix Song 10', artist:'T. Schürger', album:'Demo Collection', src:'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', source:'demo', duration:359, hue:45 },
];

const EQ_BANDS = [
  { f:60, label:'60Hz Bass' }, { f:230, label:'230Hz' }, { f:910, label:'910Hz' },
  { f:3600, label:'3.6kHz' }, { f:14000, label:'14kHz Air' }
];
const EQ_PRESETS = {
  'Normal':[0,0,0,0,0], 'Pop':[-1,2,4,2,-1], 'Rock':[4,3,-1,3,4],
  'Jazz':[3,2,0,2,3], 'Classical':[4,2,-2,2,4], 'Bass Boost':[7,5,2,0,0],
  'Treble Boost':[0,0,2,5,7], 'Vocal':[-2,1,4,3,1], 'Lo-Fi':[3,4,1,-2,-4]
};
const ACCENTS = ['#7c3aed','#06b6d4','#ef4444','#22c55e','#f59e0b','#ec4899','#3b82f6','#14b8a6'];

let store = loadStore();
function defaultStore(){
  return {
    likes:[], playlists:[], recents:[], playCounts:{}, addedAt:{},
    lyrics:{}, volumes:{ vol:90, muted:false }, prefs:{ shuffle:false, repeat:'off', speed:1, crossfade:0, gapless:false, autoplay:true, showViz:true, mediaSession:true, confirmDelete:true, theme:'dark', accent:'#7c3aed', view:'grid-list' },
    eq:{ enabled:true, gains:[0,0,0,0,0], preset:'Normal', preamp:0, balance:0 },
    localMeta:{}, customTitles:{}, currentId:null, totalPlayTime:0
  };
}
function loadStore(){
  try{ const raw = localStorage.getItem(LS_KEY); if(raw){ const s = Object.assign(defaultStore(), JSON.parse(raw)); return s; } }catch(e){}
  return defaultStore();
}
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(store)); }catch(e){} }

// ---- library (demo + local) ----
let localTracks = []; // {id,title,artist,album,src(objectURL),source:'local',duration,fileName}
let allTracksCache = [];
function allTracks(){ return allTracksCache; }
function rebuildCache(){
  allTracksCache = [...DEMO_TRACKS.map(d=>({...d})), ...localTracks];
  // apply custom titles / lyrics overrides not needed here
  allTracksCache.forEach(t=>{
    if(store.customTitles[t.id]){ t.title = store.customTitles[t.id].title || t.title; t.artist = store.customTitles[t.id].artist || t.artist; }
    if(store.localMeta[t.id] && store.localMeta[t.id].duration) t.duration = store.localMeta[t.id].duration;
  });
}
function getTrack(id){ return allTracks().find(t=>t.id===id); }

// ---- IndexedDB for local files ----
const IDB_NAME='nova_music_db';
function idb(){
  return new Promise((res,rej)=>{
    const r = indexedDB.open(IDB_NAME,1);
    r.onupgradeneeded = ()=>{ r.result.createObjectStore('files',{keyPath:'id'}); };
    r.onsuccess = ()=>res(r.result); r.onerror = ()=>rej(r.error);
  });
}
async function idbPut(rec){
  const db = await idb();
  return new Promise((res,rej)=>{
    const tx = db.transaction('files','readwrite'); tx.objectStore('files').put(rec);
    tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
  });
}
async function idbAll(){
  const db = await idb();
  return new Promise((res,rej)=>{
    const q = db.transaction('files','readonly').objectStore('files').getAll();
    q.onsuccess = ()=>res(q.result||[]); q.onerror = ()=>rej(q.error);
  });
}
async function idbDel(id){
  const db = await idb();
  return new Promise((res,rej)=>{
    const tx = db.transaction('files','readwrite'); tx.objectStore('files').delete(id);
    tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
  });
}
async function loadLocalFiles(){
  try{
    const recs = await idbAll();
    localTracks = recs.map(r=>{
      const url = URL.createObjectURL(r.blob);
      return { id:r.id, title:r.title||r.name, artist:r.artist||'Local file', album:'My Files', src:url, source:'local', duration:r.duration||0, fileName:r.name, hue:(r.name.length*37)%360 };
    });
  }catch(e){ console.warn('idb load failed', e); localTracks = []; }
  rebuildCache();
}

// ---- audio engine ----
const audio = $('#audio');
audio.volume = (store.volumes.vol/100);
audio.muted = !!store.volumes.muted;
audio.playbackRate = store.prefs.speed || 1;

let actx=null, srcNode=null, eqNodes=[], preampNode=null, analyser=null, panNode=null, gainNode=null, vizData=null;
function ensureAudioGraph(){
  if(actx) { if(actx.state==='suspended') actx.resume().catch(()=>{}); return; }
  try{
    actx = new (window.AudioContext||window.webkitAudioContext)();
    srcNode = actx.createMediaElementSource(audio);
    let head = srcNode;
    eqNodes = EQ_BANDS.map(b=>{
      const f = actx.createBiquadFilter(); f.type='peaking'; f.frequency.value=b.f; f.Q.value=1; f.gain.value=0;
      head.connect(f); head = f; return f;
    });
    preampNode = actx.createGain(); head.connect(preampNode); head = preampNode;
    analyser = actx.createAnalyser(); analyser.fftSize = 128; vizData = new Uint8Array(analyser.frequencyBinCount);
    head.connect(analyser); head = analyser;
    if(actx.createStereoPanner){ panNode = actx.createStereoPanner(); head.connect(panNode); head = panNode; }
    gainNode = actx.createGain(); head.connect(gainNode); gainNode.connect(actx.destination);
    applyEQ();
  }catch(e){ console.warn('WebAudio unavailable', e); }
}
function applyEQ(){
  if(!actx) return;
  const en = store.eq.enabled;
  eqNodes.forEach((n,i)=>{ n.gain.value = en ? (store.eq.gains[i]||0) : 0; });
  if(preampNode) preampNode.gain.value = Math.pow(10,(store.eq.preamp||0)/20) - 1 + 1; // linear-ish
  if(preampNode) preampNode.gain.value = Math.pow(10,(store.eq.preamp||0)/20);
  if(panNode) panNode.pan.value = (store.eq.balance||0)/50;
}

// ---- player state ----
let queue = []; // ids, up-next explicit
let currentId = store.currentId || null;
let isPlaying = false;
let playStartTs = 0;
let sleepTimerId = null, sleepEndAt = 0;

function fmt(s){
  s = Math.max(0, Math.floor(s||0));
  const m = Math.floor(s/60), r = s%60;
  return m+':'+String(r).padStart(2,'0');
}
function toast(msg){
  const w = $('#toastWrap'); const d = document.createElement('div');
  d.className='toast'; d.textContent = msg; w.appendChild(d);
  setTimeout(()=>{ d.style.opacity='0'; setTimeout(()=>d.remove(),300); }, 2600);
}
function coverHTML(t, cls){
  if(t && t.coverUrl) return `<div class="${cls}"><img src="${t.coverUrl}" alt="" loading="lazy"/></div>`;
  const hue = (t && t.hue) ?? 260;
  const ch = (t ? t.title : '?').trim().charAt(0).toUpperCase() || '♪';
  return `<div class="${cls}" style="background:linear-gradient(135deg,hsl(${hue} 70% 50%),hsl(${(hue+60)%360} 70% 40%) )">${ch}</div>`;
}

// ---- rendering ----
let currentView = 'all';
let activePlaylistId = null;

function filteredBase(){
  const q = ($('#searchInput').value||'').toLowerCase().trim();
  const filter = $('#filterSelect').value;
  const sort = $('#sortSelect').value;
  let list = allTracks().slice();
  if(filter==='demo') list = list.filter(t=>t.source==='demo');
  if(filter==='local') list = list.filter(t=>t.source==='local');
  if(filter==='fav') list = list.filter(t=>store.likes.includes(t.id));
  if(q) list = list.filter(t=> (t.title+' '+t.artist+' '+(t.album||'')).toLowerCase().includes(q));
  const plays = id => store.playCounts[id]||0;
  const lastPlayed = id => { const i = store.recents.indexOf(id); return i===-1 ? -1e9 : -i; };
  if(sort==='title') list.sort((a,b)=>a.title.localeCompare(b.title));
  else if(sort==='artist') list.sort((a,b)=>a.artist.localeCompare(b.artist));
  else if(sort==='duration') list.sort((a,b)=>(a.duration||0)-(b.duration||0));
  else if(sort==='plays') list.sort((a,b)=>plays(b.id)-plays(a.id));
  else if(sort==='recent') list.sort((a,b)=>lastPlayed(b.id)-lastPlayed(a.id));
  else if(sort==='added') list.sort((a,b)=> (store.addedAt[b.id]||0)-(store.addedAt[a.id]||0));
  return list;
}

function songRow(t, opts={}){
  const liked = store.likes.includes(t.id);
  const plays = store.playCounts[t.id]||0;
  const div = document.createElement('div');
  div.className = 'song' + (t.id===currentId ? ' playing' : '');
  div.dataset.id = t.id;
  div.innerHTML = `
    ${coverHTML(t,'cover')}
    <div class="song-meta">
      <div class="song-title">${escapeHtml(t.title)}</div>
      <div class="song-artist">${escapeHtml(t.artist)} ${t.album? ' • '+escapeHtml(t.album):''} ${plays? ' • ▶'+plays:''}</div>
    </div>
    <div class="song-dur">${t.duration? fmt(t.duration):'--:--'}</div>
    <div class="song-actions">
      <button class="mini-btn ${liked?'liked':''}" data-act="like" title="Like">${liked?'❤️':'🤍'}</button>
      <button class="mini-btn" data-act="next" title="Play next">⏭</button>
      <button class="mini-btn" data-act="menu" title="More">⋮</button>
    </div>`;
  div.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-act]');
    if(btn){
      e.stopPropagation();
      const act = btn.dataset.act;
      if(act==='like') toggleLike(t.id);
      else if(act==='next'){ queue.unshift(t.id); saveQueueUI(); toast('Will play next: '+t.title); }
      else if(act==='menu') openSongMenu(t.id);
      return;
    }
    playTrack(t.id, { fromUser:true });
  });
  return div;
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderAll(){
  rebuildCache();
  const base = filteredBase();
  paintList($('#songList'), base, 'No songs found. Click “＋ Add Music” or try demo tracks.');
  const favs = allTracks().filter(t=>store.likes.includes(t.id));
  paintList($('#favList'), favs, 'No favorites yet. Tap 🤍 on any song.');
  const recents = store.recents.map(getTrack).filter(Boolean);
  paintList($('#recentList'), recents, 'Nothing played yet.');
  const most = allTracks().slice().sort((a,b)=>(store.playCounts[b.id]||0)-(store.playCounts[a.id]||0)).filter(t=>store.playCounts[t.id]>0).slice(0,30);
  paintList($('#mostList'), most, 'Play counts will appear here.');
  paintQueue();
  renderPlaylistsNav();
  renderChips();
  renderStats();
  updateCounts();
  updatePlayerUI();
  renderEq();
  if(activePlaylistId) renderPlaylistDetail();
  paintUpNext();
}
function paintList(el, list, emptyMsg){
  el.innerHTML = '';
  el.classList.toggle('grid', store.prefs.view==='grid');
  if(!list.length){ el.innerHTML = `<p class="muted">${emptyMsg||'Empty'}</p>`; return; }
  const frag = document.createDocumentFragment();
  list.forEach(t=>frag.appendChild(songRow(t)));
  el.appendChild(frag);
}
function updateCounts(){
  $('#countAll').textContent = allTracks().length;
  $('#countFav').textContent = store.likes.length;
  $('#countQueue').textContent = queue.length;
  $('#storageInfo').textContent = `${allTracks().length} songs • ${localTracks.length} local • ${store.playlists.length} playlists`;
  const sub = { all:`${allTracks().length} tracks`, favorites:`${store.likes.length} liked`, recent:`${store.recents.length} in history`, most:'Ranked by plays', queue:`${queue.length} queued`, equalizer:'Tune your sound', stats:'Your listening', settings:'App preferences' };
  const titles = { all:'All Songs', favorites:'Favorites', recent:'Recently Played', most:'Most Played', queue:'Queue', equalizer:'Equalizer', stats:'Stats', settings:'Settings' };
  $('#viewTitle').textContent = activePlaylistId ? '' : (titles[currentView]||'All Songs');
  $('#viewSub').textContent = activePlaylistId ? '' : (sub[currentView]||'');
}
function renderChips(){
  const row = $('#chipsRow'); row.innerHTML='';
  const chips = [['all','All'],['demo','Demo'],['local','My files'],['fav','❤️ Liked']];
  const cur = $('#filterSelect').value;
  chips.forEach(([v,l])=>{
    const b = document.createElement('button');
    b.className = 'chip'+( (v==='all'&&cur==='all')||(v===cur) ? ' active':'');
    b.textContent = l;
    b.onclick = ()=>{ $('#filterSelect').value = (v==='all'?'all':v); renderAll(); };
    row.appendChild(b);
  });
}

// ---- views ----
function switchView(v, playlistId=null){
  currentView = v; activePlaylistId = playlistId;
  $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view===v && !playlistId));
  $$('.mobile-nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  $$('.view').forEach(s=>s.classList.remove('active'));
  const map = { all:'view-all', favorites:'view-favorites', recent:'view-recent', most:'view-most', queue:'view-queue', equalizer:'view-equalizer', stats:'view-stats', settings:'view-settings' };
  if(playlistId){ $('#view-playlist-detail').classList.add('active'); renderPlaylistDetail(); }
  else { $('#'+(map[v]||'view-all')).classList.add('active'); }
  updateCounts();
  if(window.innerWidth<980) $('#sidebar')?.classList?.remove('open');
}

// ---- playlists ----
function renderPlaylistsNav(){
  const nav = $('#playlistNav'); nav.innerHTML='';
  store.playlists.forEach(pl=>{
    const b = document.createElement('button');
    b.className = 'nav-item' + (activePlaylistId===pl.id?' active':'');
    b.innerHTML = `<span>🎶 ${escapeHtml(pl.name)}</span><span class="count">${pl.trackIds.length}</span>`;
    b.onclick = ()=>switchView('playlist', pl.id);
    nav.appendChild(b);
  });
}
function renderPlaylistDetail(){
  const pl = store.playlists.find(p=>p.id===activePlaylistId);
  if(!pl){ switchView('all'); return; }
  $('#plDetailName').textContent = pl.name;
  $('#plDetailInfo').textContent = `${pl.trackIds.length} tracks`;
  $('#plDetailCover').textContent = pl.name.trim().charAt(0).toUpperCase()||'🎶';
  const list = pl.trackIds.map(getTrack).filter(Boolean);
  const el = $('#plDetailList'); el.innerHTML='';
  if(!list.length) el.innerHTML = '<p class="muted">Empty playlist. Add songs via ⋮ menu.</p>';
  list.forEach(t=>{
    const row = songRow(t);
    row.addEventListener('contextmenu', e=>{ e.preventDefault(); removeFromPlaylist(pl.id, t.id); });
    el.appendChild(row);
  });
}
function removeFromPlaylist(pid, tid){
  const pl = store.playlists.find(p=>p.id===pid); if(!pl) return;
  pl.trackIds = pl.trackIds.filter(x=>x!==tid); save(); renderAll(); toast('Removed from playlist');
}

// ---- queue ----
function paintQueue(){
  const el = $('#queueList'); el.innerHTML='';
  const items = [];
  if(currentId){ const c = getTrack(currentId); if(c) items.push({t:c, label:'Now playing'}); }
  queue.map(getTrack).filter(Boolean).forEach(t=>items.push({t, label:'Up next'}));
  if(!items.length){ el.innerHTML = '<p class="muted">Queue is empty. Use ⋮ → Play next / Add to queue.</p>'; return; }
  items.forEach(({t,label},idx)=>{
    const row = songRow(t);
    const badge = document.createElement('span');
    badge.className='chip'; badge.style.marginLeft='6px'; badge.textContent = idx===0?'▶ Now':'#'+idx;
    row.querySelector('.song-meta').appendChild(badge);
    if(idx>0){
      const rm = document.createElement('button'); rm.className='mini-btn'; rm.textContent='✕'; rm.title='Remove';
      rm.onclick = (e)=>{ e.stopPropagation(); queue.splice(idx-1,1); saveQueueUI(); };
      row.querySelector('.song-actions').appendChild(rm);
    }
    el.appendChild(row);
  });
}
function saveQueueUI(){ paintQueue(); updateCounts(); paintUpNext(); }
function paintUpNext(){
  const el = $('#fpUpNext'); if(!el) return; el.innerHTML='';
  const upcoming = queue.map(getTrack).filter(Boolean).slice(0,10);
  if(!upcoming.length){ el.innerHTML='<p class="muted">Nothing queued. Add songs with ⋮ menu.</p>'; return; }
  upcoming.forEach(t=>el.appendChild(songRow(t)));
}

// ---- likes / recents / stats ----
function toggleLike(id){
  const i = store.likes.indexOf(id);
  if(i>=0) store.likes.splice(i,1); else store.likes.push(id);
  save(); renderAll();
  toast(i>=0 ? 'Removed from favorites' : 'Added to favorites ❤️');
}
function pushRecent(id){
  store.recents = [id, ...store.recents.filter(x=>x!==id)].slice(0,100);
  store.playCounts[id] = (store.playCounts[id]||0)+1;
  store.totalPlayTime += 0; save();
}
function renderStats(){
  const totalPlays = Object.values(store.playCounts).reduce((a,b)=>a+b,0);
  const g = $('#statsGrid'); if(!g) return;
  g.innerHTML = `
    <div class="stat"><b>${allTracks().length}</b><span>Total songs</span></div>
    <div class="stat"><b>${totalPlays}</b><span>Total plays</span></div>
    <div class="stat"><b>${store.likes.length}</b><span>Favorites</span></div>
    <div class="stat"><b>${store.playlists.length}</b><span>Playlists</span></div>
    <div class="stat"><b>${localTracks.length}</b><span>Local files</span></div>`;
  const top = allTracks().slice().sort((a,b)=>(store.playCounts[b.id]||0)-(store.playCounts[a.id]||0)).slice(0,5);
  $('#topPlayed').innerHTML = top.length ? '' : '<p class="muted">No plays yet.</p>';
  top.forEach(t=>{
    const d = document.createElement('div');
    d.innerHTML = `<div class="row gap"><b>${store.playCounts[t.id]}×</b><span>${escapeHtml(t.title)} — ${escapeHtml(t.artist)}</span></div>`;
    $('#topPlayed').appendChild(d);
  });
}

// ---- playback core ----
function playTrack(id, opts={}){
  const t = getTrack(id); if(!t){ toast('Track not found'); return; }
  ensureAudioGraph();
  // crossfade fade-out
  const cf = store.prefs.crossfade||0;
  const startPlayback = ()=>{
    if(audio.src !== t.src) audio.src = t.src;
    audio.playbackRate = store.prefs.speed||1;
    audio.play().then(()=>{
      isPlaying = true; currentId = id; store.currentId = id; playStartTs = Date.now();
      pushRecent(id); save(); updatePlayerUI(); renderAll(); setupMediaSession();
    }).catch(err=>{ toast('Cannot play: '+ (err.message||err)); console.warn(err); });
  };
  if(isPlaying && cf>0 && audio.src && audio.src!==t.src){
    const steps = 10, iv = (cf*1000)/steps;
    let v = audio.volume, i=0;
    const f = setInterval(()=>{
      i++; audio.volume = Math.max(0, v*(1-i/steps));
      if(i>=steps){ clearInterval(f); startPlayback(); fadeIn(v); }
    }, iv);
  } else startPlayback();
}
function fadeIn(target){
  let i=0; const steps=10;
  const f = setInterval(()=>{ i++; audio.volume = Math.min(target, target*i/steps); if(i>=steps) clearInterval(f); }, 60);
}
function togglePlay(){
  ensureAudioGraph();
  if(!currentId){
    const first = filteredBase()[0] || allTracks()[0];
    if(first) return playTrack(first.id, {fromUser:true});
    return toast('Add music first');
  }
  if(audio.paused){ audio.play().then(()=>{isPlaying=true; updatePlayerUI();}).catch(()=>{}); }
  else { audio.pause(); isPlaying=false; updatePlayerUI(); }
}
function next(auto=false){
  if(queue.length){ const id = queue.shift(); saveQueueUI(); return playTrack(id); }
  const list = filteredBase();
  if(!list.length) return;
  let idx = list.findIndex(t=>t.id===currentId);
  if(store.prefs.shuffle){ const r = Math.floor(Math.random()*list.length); return playTrack(list[r].id); }
  if(idx<0) return playTrack(list[0].id);
  if(idx < list.length-1) return playTrack(list[idx+1].id);
  // end of list
  if(store.prefs.repeat==='all') return playTrack(list[0].id);
  if(!auto) return playTrack(list[0].id);
  isPlaying=false; updatePlayerUI();
}
function prev(){
  if(audio.currentTime>3){ audio.currentTime=0; return; }
  if(store.prefs.shuffle){ const l = allTracks(); return playTrack(l[Math.floor(Math.random()*l.length)].id); }
  const list = filteredBase();
  let idx = list.findIndex(t=>t.id===currentId);
  if(idx>0) playTrack(list[idx-1].id);
  else if(list.length) playTrack(list[list.length-1].id);
}
function cycleRepeat(){
  const order = ['off','all','one'];
  store.prefs.repeat = order[(order.indexOf(store.prefs.repeat)+1)%order.length];
  save(); updatePlayerUI();
  toast('Repeat: '+store.prefs.repeat);
}
function updatePlayerUI(){
  const t = getTrack(currentId);
  $('#pbTitle').textContent = t? t.title : 'No song selected';
  $('#pbArtist').textContent = t? t.artist : 'Pick a song to start';
  $('#fpTitle').textContent = t? t.title : '—';
  $('#fpArtist').textContent = t? (t.artist+(t.album?' • '+t.album:'')) : '—';
  const setCover = (el)=>{
    if(!t){ el.innerHTML='🎵'; return; }
    if(t.coverUrl){ el.innerHTML=`<img src="${t.coverUrl}" alt=""/>`; }
    else{ el.textContent=(t.title||'♪').trim().charAt(0).toUpperCase(); el.style.background=`linear-gradient(135deg,hsl(${t.hue??260} 70% 50%),hsl(${((t.hue??260)+60)%360} 70% 40%))`; }
  };
  setCover($('#pbCover')); setCover($('#fpCover'));
  const playing = !audio.paused && !!currentId;
  isPlaying = playing;
  $('#playBtn').textContent = playing? '⏸':'▶';
  $('#fpPlay').textContent = playing? '⏸':'▶';
  $('#fpCover').classList.toggle('playing', playing);
  // shuffle/repeat states
  $('#shuffleBtn').classList.toggle('active', !!store.prefs.shuffle);
  $('#fpShuffle').classList.toggle('active', !!store.prefs.shuffle);
  const rp = store.prefs.repeat;
  $('#repeatBtn').textContent = rp==='one'?'🔂':(rp==='all'?'🔁':'🔁');
  $('#repeatBtn').classList.toggle('active', rp!=='off');
  $('#repeatBtn').classList.toggle('repeat-one', rp==='one');
  $('#fpRepeat').textContent = rp==='one'?'🔂':'🔁';
  $('#fpRepeat').classList.toggle('active', rp!=='off');
  // like
  const liked = currentId && store.likes.includes(currentId);
  $('#pbLike').textContent = liked?'❤️':'🤍';
  $('#fpLike').textContent = liked?'❤️ Liked':'🤍 Like';
  // speed
  $('#speedBtn').textContent = (store.prefs.speed||1).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')+'×';
  // lyrics
  const lyr = currentId ? (store.lyrics[currentId]||'') : '';
  $('#fpLyrics').textContent = lyr || 'No lyrics yet. Tap Edit to add.';
  // vol
  $('#volBar').value = store.volumes.vol;
  $('#muteBtn').textContent = (audio.muted||store.volumes.vol===0)?'🔇':'🔊';
  // sleep
  $('#sleepBtn').classList.toggle('active', !!sleepTimerId);
  // mark playing rows
  $$('.song').forEach(el=>el.classList.toggle('playing', el.dataset.id===currentId));
}

// ---- seek/volume/speed/sleep ----
audio.addEventListener('timeupdate', ()=>{
  const d = audio.duration||getTrack(currentId)?.duration||0;
  const c = audio.currentTime||0;
  const v = d? Math.round(c/d*1000):0;
  $('#seekBar').value = v; $('#fpSeek').value = v;
  $('#curTime').textContent = fmt(c); $('#fpCur').textContent = fmt(c);
  $('#durTime').textContent = fmt(d); $('#fpDur').textContent = fmt(d);
});
audio.addEventListener('loadedmetadata', ()=>{
  const t = getTrack(currentId);
  if(t && audio.duration && isFinite(audio.duration)){
    if(t.source==='local'){ store.localMeta[t.id] = { duration: Math.round(audio.duration) }; save(); }
    $('#durTime').textContent = fmt(audio.duration); $('#fpDur').textContent = fmt(audio.duration);
  }
});
audio.addEventListener('ended', ()=>{
  const rp = store.prefs.repeat;
  if(rp==='one'){ audio.currentTime=0; audio.play().catch(()=>{}); return; }
  if(store.prefs.autoplay || queue.length) {
    if(store.prefs.gapless || (store.prefs.crossfade||0)===0) next(true);
    else setTimeout(()=>next(true), (store.prefs.crossfade||0)*200);
  } else { isPlaying=false; updatePlayerUI(); }
});
audio.addEventListener('play', updatePlayerUI);
audio.addEventListener('pause', updatePlayerUI);

function bindSeek(){
  const f = (el)=>{ el.addEventListener('input', ()=>{ const d = audio.duration||0; if(d) audio.currentTime = (el.value/1000)*d; }); };
  f($('#seekBar')); f($('#fpSeek'));
  $('#volBar').addEventListener('input', e=>{ store.volumes.vol = +e.target.value; audio.volume = store.volumes.vol/100; audio.muted = false; store.volumes.muted=false; save(); updatePlayerUI(); });
  $('#muteBtn').onclick = ()=>{
    audio.muted = !audio.muted; store.volumes.muted = audio.muted; save(); updatePlayerUI();
  };
  $('#speedBtn').onclick = ()=>openSpeedModal();
  $('#sleepBtn').onclick = ()=>openSleepModal();
  $('#speedRange').addEventListener('input', e=>{
    store.prefs.speed = +e.target.value; audio.playbackRate = store.prefs.speed;
    $('#speedVal').textContent = store.prefs.speed.toFixed(2)+'×'; save(); updatePlayerUI();
  });
  $('#crossfadeRange').addEventListener('input', e=>{
    store.prefs.crossfade = +e.target.value;
    $('#crossfadeVal').textContent = store.prefs.crossfade? store.prefs.crossfade+'s':'Off'; save();
  });
}

// ---- EQ UI ----
function renderEq(){
  const wrap = $('#eqSliders'); if(!wrap) return; wrap.innerHTML='';
  EQ_BANDS.forEach((b,i)=>{
    const d = document.createElement('div'); d.className='eq-band';
    d.innerHTML = `<b>${b.label}</b><br><input type="range" min="-12" max="12" step="1" value="${store.eq.gains[i]||0}"><span>${store.eq.gains[i]||0} dB</span>`;
    const inp = d.querySelector('input'), sp = d.querySelector('span');
    inp.oninput = ()=>{ store.eq.gains[i]=+inp.value; sp.textContent=inp.value+' dB'; store.eq.preset='Custom'; save(); applyEQ(); paintEqPresets(); };
    wrap.appendChild(d);
  });
  paintEqPresets();
  $('#eqEnabled').checked = store.eq.enabled;
  $('#preampGain').value = store.eq.preamp||0; $('#preampVal').textContent = (store.eq.preamp||0)+' dB';
  $('#balanceGain').value = store.eq.balance||0; $('#balanceVal').textContent = balanceLabel(store.eq.balance||0);
  $('#speedRange').value = store.prefs.speed||1; $('#speedVal').textContent = (store.prefs.speed||1).toFixed(2)+'×';
  $('#crossfadeRange').value = store.prefs.crossfade||0; $('#crossfadeVal').textContent = store.prefs.crossfade? store.prefs.crossfade+'s':'Off';
  $('#gaplessChk').checked = !!store.prefs.gapless;
}
function balanceLabel(v){ return v===0?'Center':(v<0?`L${-v}`:`R${v}`); }
function paintEqPresets(){
  const mk = (el)=>{
    if(!el) return; el.innerHTML='';
    Object.keys(EQ_PRESETS).forEach(name=>{
      const b = document.createElement('button');
      b.textContent = name; if(store.eq.preset===name) b.classList.add('active');
      b.onclick = ()=>{ store.eq.preset=name; store.eq.gains=[...EQ_PRESETS[name]]; save(); applyEQ(); renderEq(); };
      el.appendChild(b);
    });
    if(store.eq.preset==='Custom'){ const b=document.createElement('button'); b.textContent='Custom'; b.classList.add('active'); el.appendChild(b); }
  };
  mk($('#eqPresets')); mk($('#eqPresetsMini'));
}

// ---- visualizer ----
function vizLoop(){
  requestAnimationFrame(vizLoop);
  if(!store.prefs.showViz && !$('#fullPlayer').classList.contains('hidden')){ /* still draw big */ }
  drawMini(); drawBig();
}
function drawMini(){
  const c = $('#miniViz'); if(!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  if(!analyser || audio.paused){ return; }
  analyser.getByteFrequencyData(vizData);
  const n = 48, w = c.width/n;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#7c3aed';
  for(let i=0;i<n;i++){
    const v = vizData[Math.floor(i/n*vizData.length*0.7)]/255;
    const h = 4+v*30;
    ctx.fillStyle = accent; ctx.globalAlpha = .85;
    ctx.fillRect(i*w+1, c.height-h, w-2, h);
  }
  ctx.globalAlpha = 1;
}
function drawBig(){
  const c = $('#bigViz'); if(!c || $('#fullPlayer').classList.contains('hidden')) return;
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const W = c.clientWidth||window.innerWidth, H = c.clientHeight||window.innerHeight;
  if(c.width!==W*dpr){ c.width=W*dpr; c.height=H*dpr; }
  const ctx = c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if(!analyser || audio.paused) return;
  analyser.getByteFrequencyData(vizData);
  const n = 64, w = W/n;
  for(let i=0;i<n;i++){
    const v = vizData[Math.floor(i/n*vizData.length*0.75)]/255;
    const h = 20+v*(H*0.5);
    const g = ctx.createLinearGradient(0,H-h,0,H);
    g.addColorStop(0,'#7c3aed'); g.addColorStop(1,'#06b6d4');
    ctx.fillStyle = g;
    ctx.fillRect(i*w+2, H-h, w-4, h);
  }
}

// ---- media session ----
function setupMediaSession(){
  if(!('mediaSession' in navigator) || !store.prefs.mediaSession) return;
  const t = getTrack(currentId); if(!t) return;
  try{
    navigator.mediaSession.metadata = new MediaMetadata({ title:t.title, artist:t.artist, album:t.album||'Nova Player' });
    navigator.mediaSession.setActionHandler('play', ()=>audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', ()=>next());
  }catch(e){}
}

// ---- file import ----
async function handleFiles(files){
  const arr = Array.from(files).filter(f=>f.type.startsWith('audio')||/\.(mp3|wav|ogg|m4a|flac|webm|opus)$/i.test(f.name));
  if(!arr.length) return toast('No audio files found');
  for(const f of arr){
    const id = 'local_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    let title = f.name.replace(/\.[^.]+$/,''), artist = 'Local file';
    // try metadata
    try{
      const tags = await readTags(f);
      if(tags.title) title = tags.title;
      if(tags.artist) artist = tags.artist;
    }catch(e){}
    const duration = await probeDuration(f).catch(()=>0);
    await idbPut({ id, name:f.name, title, artist, blob:f, duration });
    store.addedAt[id] = Date.now();
    toast('Added: '+title);
  }
  await loadLocalFiles(); save(); renderAll();
  switchView('all'); $('#filterSelect').value='local'; renderAll();
}
function readTags(file){
  return new Promise((resolve)=>{
    if(!window.jsmediatags){ resolve({}); return; }
    try{
      window.jsmediatags.read(file, {
        onSuccess:(tag)=>{
          const t = tag.tags||{};
          const out = { title:t.title, artist:t.artist, album:t.album };
          if(t.picture && t.picture.data){
            try{
              let b=''; t.picture.data.forEach(v=>b+=String.fromCharCode(v));
              out.coverUrl = `data:${t.picture.format};base64,${btoa(b)}`;
            }catch(e){}
          }
          resolve(out);
        },
        onError:()=>resolve({})
      });
      setTimeout(()=>resolve({}), 4000);
    }catch(e){ resolve({}); }
  });
}
function probeDuration(file){
  return new Promise((res,rej)=>{
    const url = URL.createObjectURL(file);
    const a = new Audio(); a.preload='metadata'; a.src=url;
    a.onloadedmetadata = ()=>{ const d=Math.round(a.duration||0); URL.revokeObjectURL(url); res(d); };
    a.onerror = ()=>{ URL.revokeObjectURL(url); rej(0); };
    setTimeout(()=>{ URL.revokeObjectURL(url); res(0); }, 8000);
  });
}

// ---- modals ----
function openModal(html){
  $('#modalBox').innerHTML = html;
  $('#modalBack').classList.remove('hidden');
}
function closeModal(){ $('#modalBack').classList.add('hidden'); }
$('#modalBack').addEventListener('click', e=>{ if(e.target.id==='modalBack') closeModal(); });

function openSongMenu(id){
  const t = getTrack(id); if(!t) return;
  const pls = store.playlists.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  openModal(`
    <h2>${escapeHtml(t.title)}</h2>
    <p class="muted">${escapeHtml(t.artist)} • ${t.duration?fmt(t.duration):'--:--'} • ${t.source}</p>
    <div class="row gap wrap">
      <button class="btn primary" id="mPlay">▶ Play</button>
      <button class="btn" id="mNext">⏭ Play next</button>
      <button class="btn" id="mQueue">＋ Queue</button>
      <button class="btn" id="mLike">${store.likes.includes(id)?'💔 Unlike':'❤️ Like'}</button>
    </div>
    <h3>Add to playlist</h3>
    <div class="row gap">
      <select id="mPl">${pls||'<option value="">(no playlists — create one first)</option>'}</select>
      <button class="btn" id="mPlAdd">Add</button>
    </div>
    <div class="row gap wrap" style="margin-top:10px">
      <button class="btn ghost" id="mLyrics">📝 Lyrics</button>
      <button class="btn ghost" id="mRename">✏️ Rename</button>
      <button class="btn ghost" id="mShare">⤴ Share</button>
      ${t.source==='local'?'<button class="btn danger-outline" id="mDel">🗑 Delete file</button>':''}
      <button class="btn ghost" id="mClose">Close</button>
    </div>`);
  $('#mClose').onclick = closeModal;
  $('#mPlay').onclick = ()=>{ closeModal(); playTrack(id,{fromUser:true}); };
  $('#mNext').onclick = ()=>{ queue.unshift(id); saveQueueUI(); closeModal(); toast('Will play next'); };
  $('#mQueue').onclick = ()=>{ queue.push(id); saveQueueUI(); closeModal(); toast('Added to queue'); };
  $('#mLike').onclick = ()=>{ closeModal(); toggleLike(id); };
  $('#mLyrics').onclick = ()=>openLyricsEditor(id);
  $('#mRename').onclick = ()=>openRename(id);
  $('#mShare').onclick = ()=>shareTrack(id);
  $('#mPlAdd').onclick = ()=>{
    const pid = $('#mPl').value; if(!pid) return toast('Create a playlist first');
    const pl = store.playlists.find(p=>p.id===pid);
    if(pl && !pl.trackIds.includes(id)){ pl.trackIds.push(id); save(); renderAll(); toast('Added to '+pl.name); }
    closeModal();
  };
  const del = $('#mDel');
  if(del) del.onclick = async ()=>{
    if(store.prefs.confirmDelete && !confirm('Delete this local file?')) return;
    await idbDel(id); store.likes = store.likes.filter(x=>x!==id);
    store.playlists.forEach(p=>p.trackIds=p.trackIds.filter(x=>x!==id));
    if(currentId===id){ audio.pause(); currentId=null; }
    await loadLocalFiles(); save(); closeModal(); renderAll(); toast('Deleted');
  };
}
function openLyricsEditor(id){
  const t = getTrack(id);
  openModal(`<h2>📝 Lyrics — ${escapeHtml(t.title)}</h2>
    <textarea id="lyrText" placeholder="Paste lyrics here...">${escapeHtml(store.lyrics[id]||'')}</textarea>
    <div class="row gap"><button class="btn primary" id="lyrSave">Save</button><button class="btn ghost" id="lyrClose">Cancel</button></div>`);
  $('#lyrClose').onclick = closeModal;
  $('#lyrSave').onclick = ()=>{ store.lyrics[id] = $('#lyrText').value; save(); closeModal(); updatePlayerUI(); toast('Lyrics saved'); };
}
function openRename(id){
  const t = getTrack(id);
  openModal(`<h2>✏️ Rename</h2>
    <label>Title<input type="text" id="rnTitle" value="${escapeHtml(t.title)}"/></label>
    <label>Artist<input type="text" id="rnArtist" value="${escapeHtml(t.artist)}"/></label>
    <div class="row gap"><button class="btn primary" id="rnSave">Save</button><button class="btn ghost" onclick="document.getElementById('modalBack').classList.add('hidden')">Cancel</button></div>`);
  $('#rnSave').onclick = ()=>{
    store.customTitles[id] = { title:$('#rnTitle').value.trim()||t.title, artist:$('#rnArtist').value.trim()||t.artist };
    save(); closeModal(); renderAll(); updatePlayerUI();
  };
}
function shareTrack(id){
  const t = getTrack(id);
  const data = { title:t.title, text:`${t.title} — ${t.artist}`, url: t.source==='demo'? t.src : location.href };
  if(navigator.share){ navigator.share(data).catch(()=>{}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(data.text+' '+data.url).then(()=>toast('Copied link')); }
  else toast('Sharing not supported');
}
function openSpeedModal(){
  const speeds = [0.5,0.75,1,1.25,1.5,1.75,2];
  openModal(`<h2>⏩ Playback speed</h2><div class="eq-presets">${speeds.map(s=>`<button class="${store.prefs.speed===s?'active':''}" data-s="${s}">${s}×</button>`).join('')}</div>
    <div class="row gap"><button class="btn ghost" id="spClose">Close</button></div>`);
  $('#spClose').onclick = closeModal;
  $$('#modalBox [data-s]').forEach(b=>b.onclick=()=>{
    store.prefs.speed=+b.dataset.s; audio.playbackRate=store.prefs.speed; save(); updatePlayerUI(); closeModal();
    $('#speedRange').value=store.prefs.speed; $('#speedVal').textContent=store.prefs.speed.toFixed(2)+'×';
  });
}
function openSleepModal(){
  const mins = [5,10,15,30,60];
  openModal(`<h2>😴 Sleep timer</h2>
    <p class="muted">${sleepTimerId? 'Ends in '+Math.ceil((sleepEndAt-Date.now())/60000)+' min':'Off'}</p>
    <div class="eq-presets">${mins.map(m=>`<button data-m="${m}">${m} min</button>`).join('')}<button data-m="0">Off</button></div>
    <div class="row gap"><button class="btn ghost" id="slClose">Close</button></div>`);
  $('#slClose').onclick = closeModal;
  $$('#modalBox [data-m]').forEach(b=>b.onclick=()=>{
    setSleep(+b.dataset.m); closeModal();
  });
}
function setSleep(min){
  if(sleepTimerId){ clearTimeout(sleepTimerId); sleepTimerId=null; }
  if(min>0){
    sleepEndAt = Date.now()+min*60000;
    sleepTimerId = setTimeout(()=>{
      // fade out then pause
      let v = audio.volume; const f = setInterval(()=>{
        v-=0.1; if(v<=0){ clearInterval(f); audio.pause(); audio.volume=store.volumes.vol/100; } else audio.volume=v;
      },200);
      sleepTimerId=null; updatePlayerUI(); toast('Sleep timer ended 😴');
    }, min*60000);
    toast(`Sleep in ${min} min`);
  } else toast('Sleep timer off');
  updatePlayerUI();
}

// ---- playlists modals ----
function openNewPlaylist(){
  openModal(`<h2>＋ New playlist</h2><input type="text" id="npName" placeholder="Playlist name"/>
    <div class="row gap"><button class="btn primary" id="npSave">Create</button><button class="btn ghost" id="npCancel">Cancel</button></div>`);
  $('#npCancel').onclick = closeModal;
  $('#npSave').onclick = ()=>{
    const name = $('#npName').value.trim()||'My Playlist';
    store.playlists.push({ id:'pl_'+Date.now(), name, trackIds:[] });
    save(); closeModal(); renderAll(); toast('Playlist created');
  };
}

// ---- export/import/reset ----
function exportLib(){
  // can't export blobs; export metadata + settings
  const data = { store, exportedAt:new Date().toISOString(), demoCount:DEMO_TRACKS.length };
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='nova-player-backup.json'; a.click();
  toast('Exported backup');
}
function importLib(file){
  const r = new FileReader();
  r.onload = ()=>{ try{
    const d = JSON.parse(r.result);
    if(d.store){ store = Object.assign(defaultStore(), d.store); save(); applyTheme(); applyEQ(); renderAll(); toast('Imported ✓'); }
  }catch(e){ toast('Invalid file'); } };
  r.readAsText(file);
}

// ---- theme ----
function applyTheme(){
  document.documentElement.dataset.theme = store.prefs.theme==='light'?'light':'dark';
  document.documentElement.style.setProperty('--accent', store.prefs.accent||'#7c3aed');
  document.querySelector('meta[name="theme-color"]').content = store.prefs.accent||'#7c3aed';
  $('#themeBtn').textContent = store.prefs.theme==='light'?'🌙':'☀️';
  const wrap = $('#accentColors');
  if(wrap){ wrap.innerHTML='';
    ACCENTS.forEach(c=>{
      const d = document.createElement('div'); d.className='color-dot'+(store.prefs.accent===c?' active':'');
      d.style.background=c; d.onclick=()=>{ store.prefs.accent=c; save(); applyTheme(); };
      wrap.appendChild(d);
    });
  }
}

// ---- PWA install ----
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault(); deferredPrompt = e;
  $('#installBtn').classList.remove('hidden');
});
async function tryInstall(){
  if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; $('#installBtn').classList.add('hidden'); }
  else toast('Use browser menu → Install / Add to Home screen');
}

// ---- gestures / keyboard ----
function bindGlobal(){
  // nav
  $$('.nav-item[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $$('.mobile-nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
  $('#newPlaylistBtn').onclick = openNewPlaylist;
  $('#plPlayAll').onclick = ()=>{ const pl=store.playlists.find(p=>p.id===activePlaylistId); if(pl&&pl.trackIds.length) playTrack(pl.trackIds[0],{fromUser:true}); };
  $('#plShuffleAll').onclick = ()=>{ const pl=store.playlists.find(p=>p.id===activePlaylistId); if(pl&&pl.trackIds.length){ const r=pl.trackIds[Math.floor(Math.random()*pl.trackIds.length)]; playTrack(r,{fromUser:true}); } };
  $('#plRename').onclick = ()=>{
    const pl=store.playlists.find(p=>p.id===activePlaylistId); if(!pl) return;
    const n = prompt('Rename playlist', pl.name); if(n){ pl.name=n.trim()||pl.name; save(); renderAll(); }
  };
  $('#plDelete').onclick = ()=>{
    if(store.prefs.confirmDelete && !confirm('Delete playlist?')) return;
    store.playlists = store.playlists.filter(p=>p.id!==activePlaylistId);
    save(); switchView('all'); renderAll();
  };
  // player
  $('#playBtn').onclick = togglePlay; $('#fpPlay').onclick = togglePlay;
  $('#nextBtn').onclick = ()=>next(); $('#fpNext').onclick = ()=>next();
  $('#prevBtn').onclick = prev; $('#fpPrev').onclick = prev;
  $('#shuffleBtn').onclick = ()=>{ store.prefs.shuffle=!store.prefs.shuffle; save(); updatePlayerUI(); };
  $('#fpShuffle').onclick = ()=>{ store.prefs.shuffle=!store.prefs.shuffle; save(); updatePlayerUI(); };
  $('#repeatBtn').onclick = cycleRepeat; $('#fpRepeat').onclick = cycleRepeat;
  $('#pbLike').onclick = ()=>{ if(currentId) toggleLike(currentId); };
  $('#fpLike').onclick = ()=>{ if(currentId) toggleLike(currentId); };
  $('#fpLyricsBtn').onclick = ()=>{ $$('.fp-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab==='lyrics')); $$('.fp-panel').forEach(p=>p.classList.toggle('active',p.id==='fpPanel-lyrics')); };
  $('#editLyricsBtn').onclick = ()=>{ if(currentId) openLyricsEditor(currentId); else toast('Play a song first'); };
  $('#fpAddPl').onclick = ()=>{ if(currentId) openSongMenu(currentId); };
  $('#fpShare').onclick = ()=>{ if(currentId) shareTrack(currentId); };
  $('#pbExpand').onclick = ()=>openFull();
  $('#fullBtn').onclick = ()=>openFull();
  $('#fpClose').onclick = ()=>$('#fullPlayer').classList.add('hidden');
  $('#fpMenu').onclick = ()=>{ if(currentId) openSongMenu(currentId); };
  $$('.fp-tab').forEach(t=>t.onclick=()=>{
    $$('.fp-tab').forEach(x=>x.classList.toggle('active',x===t));
    $$('.fp-panel').forEach(p=>p.classList.toggle('active', p.id==='fpPanel-'+t.dataset.tab));
  });
  $('#queuePopBtn').onclick = ()=>switchView('queue');
  $('#clearQueueBtn').onclick = ()=>{ queue=[]; saveQueueUI(); };
  $('#shuffleQueueBtn').onclick = ()=>{ queue.sort(()=>Math.random()-0.5); saveQueueUI(); };
  $('#clearRecentBtn').onclick = ()=>{ store.recents=[]; save(); renderAll(); };
  // search/sort/filter
  $('#searchInput').addEventListener('input', e=>{
    $('#clearSearch').classList.toggle('hidden', !e.target.value);
    if(currentView!=='all') switchView('all');
    renderAll();
  });
  $('#clearSearch').onclick = ()=>{ $('#searchInput').value=''; $('#clearSearch').classList.add('hidden'); renderAll(); };
  $('#filterSelect').onchange = renderAll;
  $('#sortSelect').onchange = renderAll;
  $('#gridBtn').onclick = ()=>{ store.prefs.view='grid'; save(); $('#gridBtn').classList.add('active'); $('#listBtn').classList.remove('active'); renderAll(); };
  $('#listBtn').onclick = ()=>{ store.prefs.view='grid-list'; save(); $('#listBtn').classList.add('active'); $('#gridBtn').classList.remove('active'); renderAll(); };
  // files
  $('#addFilesBtn').onclick = ()=>$('#fileInput').click();
  $('#fileInput').onchange = (e)=>{ handleFiles(e.target.files); e.target.value=''; };
  // theme/install
  $('#themeBtn').onclick = ()=>{ store.prefs.theme = store.prefs.theme==='light'?'dark':'light'; save(); applyTheme(); };
  $('#logoBtn').onclick = ()=>switchView('all');
  $('#installBtn').onclick = tryInstall;
  // eq bindings
  $('#eqEnabled').onchange = (e)=>{ store.eq.enabled=e.target.checked; save(); applyEQ(); };
  $('#eqReset').onclick = ()=>{ store.eq.gains=[0,0,0,0,0]; store.eq.preset='Normal'; store.eq.preamp=0; store.eq.balance=0; save(); applyEQ(); renderEq(); };
  $('#preampGain').oninput = (e)=>{ store.eq.preamp=+e.target.value; $('#preampVal').textContent=e.target.value+' dB'; save(); applyEQ(); };
  $('#balanceGain').oninput = (e)=>{ store.eq.balance=+e.target.value; $('#balanceVal').textContent=balanceLabel(store.eq.balance); save(); applyEQ(); };
  $('#gaplessChk').onchange = (e)=>{ store.prefs.gapless=e.target.checked; save(); };
  // settings
  $('#setAutoplay').onchange = (e)=>{ store.prefs.autoplay=e.target.checked; save(); };
  $('#setShowViz').onchange = (e)=>{ store.prefs.showViz=e.target.checked; save(); $('#miniViz').style.display=e.target.checked?'':'none'; };
  $('#setConfirmDelete').onchange = (e)=>{ store.prefs.confirmDelete=e.target.checked; save(); };
  $('#setMediaSession').onchange = (e)=>{ store.prefs.mediaSession=e.target.checked; save(); };
  $('#exportBtn').onclick = exportLib;
  $('#importBtn').onclick = ()=>$('#importFile').click();
  $('#importFile').onchange = (e)=>{ if(e.target.files[0]) importLib(e.target.files[0]); e.target.value=''; };
  $('#resetBtn').onclick = ()=>{ if(confirm('Reset ALL data (likes, playlists, files index)?')){ localStorage.removeItem(LS_KEY); indexedDB.deleteDatabase(IDB_NAME); location.reload(); } };
  // drag drop
  ['dragenter','dragover'].forEach(ev=>document.addEventListener(ev, e=>{ e.preventDefault(); $('#dropOverlay').classList.remove('hidden'); }));
  ['dragleave','drop'].forEach(ev=>document.addEventListener(ev, e=>{ e.preventDefault(); if(ev==='dragleave' && e.relatedTarget) return; $('#dropOverlay').classList.add('hidden'); }));
  document.addEventListener('drop', e=>{ if(e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });
  // keyboard
  document.addEventListener('keydown', e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')) return;
    if(e.code==='Space'){ e.preventDefault(); togglePlay(); }
    else if(e.key==='ArrowRight') audio.currentTime+=10;
    else if(e.key==='ArrowLeft') audio.currentTime-=10;
    else if(e.key==='ArrowUp'){ e.preventDefault(); store.volumes.vol=Math.min(100,store.volumes.vol+5); audio.volume=store.volumes.vol/100; save(); updatePlayerUI(); }
    else if(e.key==='ArrowDown'){ e.preventDefault(); store.volumes.vol=Math.max(0,store.volumes.vol-5); audio.volume=store.volumes.vol/100; save(); updatePlayerUI(); }
    else if(e.key==='n'||e.key==='N') next();
    else if(e.key==='p'||e.key==='P') prev();
    else if(e.key==='m'||e.key==='M') $('#muteBtn').click();
    else if(e.key==='s'||e.key==='S') $('#shuffleBtn').click();
    else if(e.key==='r'||e.key==='R') cycleRepeat();
    else if(e.key==='l'||e.key==='L'){ if(currentId) toggleLike(currentId); }
    else if(e.key==='f'||e.key==='F') openFull();
    else if(e.key==='Escape'){ closeModal(); $('#fullPlayer').classList.add('hidden'); }
  });
  // swipe on full player
  let tx=0;
  const fp = $('#fullPlayer');
  fp.addEventListener('touchstart', e=>{ tx=e.touches[0].clientX; }, {passive:true});
  fp.addEventListener('touchend', e=>{
    const dx = e.changedTouches[0].clientX - tx;
    if(Math.abs(dx)>70){ if(dx<0) next(); else prev(); }
  }, {passive:true});
  bindSeek();
}
function openFull(){ $('#fullPlayer').classList.remove('hidden'); paintUpNext(); }

// ---- boot ----
(async function boot(){
  // seed addedAt for demos
  DEMO_TRACKS.forEach((d,i)=>{ if(!store.addedAt[d.id]) store.addedAt[d.id]=Date.now()- (100-i)*1000; });
  rebuildCache();
  applyTheme();
  // restore settings checkboxes
  $('#setAutoplay').checked = !!store.prefs.autoplay;
  $('#setShowViz').checked = store.prefs.showViz!==false;
  $('#setConfirmDelete').checked = store.prefs.confirmDelete!==false;
  $('#setMediaSession').checked = store.prefs.mediaSession!==false;
  if(store.prefs.view==='grid'){ $('#gridBtn').classList.add('active'); $('#listBtn').classList.remove('active'); }
  bindGlobal();
  renderEq();
  renderAll();
  await loadLocalFiles();
  renderAll();
  // restore last track (paused)
  if(currentId && getTrack(currentId)){
    const t = getTrack(currentId);
    audio.src = t.src; audio.playbackRate = store.prefs.speed||1;
    updatePlayerUI();
  }
  $('#miniViz').style.display = store.prefs.showViz===false?'none':'';
  vizLoop();
  console.log('%cNova Player ready — %d tracks', 'color:#7c3aed;font-weight:bold', allTracks().length);
})();
