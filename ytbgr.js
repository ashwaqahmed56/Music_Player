/*
 * ytbgr.js — web-side glue for the YtBgr native module.
 *
 * Enforces the single-MediaSession rule: while the YouTube background module
 * is active, the app's own notification (app.js `syncNotif`) is taken down and
 * stays down; on close it is restored.
 *
 * This module only hosts the official YouTube site in a WebView. It does not
 * extract stream URLs, call private endpoints, or download anything.
 */
'use strict';
(function(){

function plugin(){
  try{
    const C = window.Capacitor;
    if(!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    return (C.Plugins && C.Plugins.YtBgr) || null;
  }catch(e){ return null; }
}
function isAvailable(){ return !!plugin(); }
function toastY(m){ try{ toast(m); }catch(e){} }

/* ---------- single MediaSession ownership ---------- */
let owns = false;
function takeOver(){
  if(owns) return;
  owns = true;
  window.ASH_EXTERNAL_PLAYER = true;
  // Take the app's notification down immediately so two never coexist.
  try{
    const C = window.Capacitor;
    const MC = C && C.Plugins && (C.Plugins.CapacitorMusicControls || C.Plugins.MusicControls);
    if(MC && MC.destroy) { const r = MC.destroy(); if(r && r.catch) r.catch(()=>{}); }
  }catch(e){}
  try{ if(typeof notifReset === 'function') notifReset(); }catch(e){}
  try{ if(typeof navigator !== 'undefined' && 'mediaSession' in navigator){
    try{ navigator.mediaSession.metadata = null; }catch(e){}
    try{ navigator.mediaSession.playbackState = 'none'; }catch(e){}
  }}catch(e){}
}
function handBack(){
  if(!owns) return;
  owns = false;
  window.ASH_EXTERNAL_PLAYER = false;
  // Restore the app's own session + notification.
  try{ if(typeof notifReset === 'function') notifReset(); }catch(e){}
  try{ if(typeof render === 'function') render(); }catch(e){}
  try{ if(typeof syncNotif === 'function') syncNotif(); }catch(e){}
}

/* ---------- public API ---------- */
async function open(opts){
  const p = plugin();
  if(!p){ toastY('YouTube background mode needs the Android app'); return false; }
  takeOver();
  try{
    await p.open(Object.assign({ url: 'https://www.youtube.com' }, opts || {}));
    wire(p);
    return true;
  }catch(e){
    handBack();
    toastY('Could not start: ' + ((e && e.message) || e));
    return false;
  }
}
async function close(){
  const p = plugin();
  try{ if(p) await p.close(); }catch(e){}
  handBack();
  try{ if(typeof render === 'function') render(); }catch(e){}
}
async function play(){ const p = plugin(); if(p) try{ await p.play(); }catch(e){} }
async function pause(){ const p = plugin(); if(p) try{ await p.pause(); }catch(e){} }
async function seekTo(sec){ const p = plugin(); if(p) try{ await p.seekTo({ sec: sec|0 }); }catch(e){} }
async function loadUrl(url){ const p = plugin(); if(p) try{ await p.loadUrl({ url }); }catch(e){} }

/* ---------- event wiring ---------- */
let wired = false;
function wire(p){
  if(wired) return;
  wired = true;
  try{
    p.addListener('ytState', (e)=>{
      const d = e || {};
      window.ASH_YT_STATE = d;
      if(d.state === 'ended'){ try{ close(); }catch(_){} }
      try{ paintMini(); }catch(_){}
    });
    p.addListener('ytMeta', (e)=>{
      window.ASH_YT_META = e || {};
      try{ paintMini(); }catch(_){}
    });
    p.addListener('ytError', (e)=>{
      toastY('YouTube player: ' + ((e && e.reason) || 'error'));
    });
  }catch(e){ /* listeners are best-effort */ }
}

/* Keep the app's mini player in sync while the module owns the session, so the
   UI does not look frozen. Purely cosmetic - no notification is created. */
function paintMini(){
  const st = window.ASH_YT_STATE || {};
  const mt = window.ASH_YT_META || {};
  try{
    const mini = document.getElementById('miniPlayer');
    if(!mini) return;
    if(st.state === 'idle' && !mt.title) return;
    mini.classList.remove('hidden');
    const t = document.getElementById('miniTitle');
    if(t && mt.title) t.textContent = mt.title;
    const a = document.getElementById('miniArtist');
    if(a && mt.artist) a.textContent = mt.artist;
    const c = document.getElementById('miniCover');
    if(c && mt.artwork) c.innerHTML = '<img src="' + mt.artwork + '" alt=""/>';
    const prog = document.getElementById('miniProg');
    if(prog && st.duration > 0) prog.style.width = ((st.position||0) / st.duration * 100) + '%';
  }catch(e){}
}

/* ---------- UI binding ---------- */
function bind(){
  const openers = document.querySelectorAll('[data-ytbgr-open]');
  openers.forEach(b => {
    if(b.dataset.ytbgrBound) return;
    b.dataset.ytbgrBound = '1';
    b.onclick = () => {
      const url = b.getAttribute('data-ytbgr-url') || 'https://www.youtube.com';
      open({ url });
    };
    if(!isAvailable()){
      b.disabled = true;
      b.title = 'Android app only';
    }
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();

window.ASHS_YT = { open, close, play, pause, seekTo, loadUrl, isAvailable, takeOver, handBack };
window.ASH_EXTERNAL_PLAYER = false;
})();
