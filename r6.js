
Webflow.push(async function(){
"use strict";

/* ============ Utils scurte ============ */
const W = window, D = document;
const $ = (s,p=D)=>p.querySelector(s);
const a = (s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2 = n => String(n).padStart(2,"0");
const HAS_PLYR = !!(W && W.Plyr);
const isFastNet = () => (navigator && navigator.connection && navigator.connection.effectiveType === "4g");
const rIC = W.requestIdleCallback ? fn => requestIdleCallback(fn, {timeout:500}) : fn => setTimeout(fn, 120);
const blurActive = () => { try{ const ae=D.activeElement; if(ae && ae!==D.body) ae.blur(); }catch(_){} };
const vibrateShort = ()=>{ if(navigator && typeof navigator.vibrate==="function") navigator.vibrate(50); };
const easeInOut = t => t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function getScrollParent(el){
  if(!el) return document.scrollingElement||document.documentElement;
  const qwi = el.closest?.(".question-wrapper-inner");
  if(qwi) return qwi;
  let p = el.parentElement; 
  while(p){
    const s = getComputedStyle(p), oy = s.overflowY;
    if(oy==="auto" || oy==="scroll" || oy==="overlay") return p;
    p = p.parentElement;
  }
  return document.scrollingElement||document.documentElement;
}
function scrollContainerToAnchor(target,container,{behavior="smooth",offset=0,delay=0}={}){
  if(!target) return;
  const c = container || getScrollParent(target);
  const isWin = (c===document.scrollingElement||c===document.documentElement||c===document.body);
  const getTop = ()=> (isWin?target.getBoundingClientRect().top:(target.getBoundingClientRect().top - c.getBoundingClientRect().top)) + (isWin?window.pageYOffset:c.scrollTop) - offset;
  const to = Math.max(0,Math.round(getTop()));
  if(behavior!=="smooth"){ isWin?window.scrollTo(0,to):c.scrollTop=to; return; }
  const start=isWin?window.pageYOffset:c.scrollTop,dist=to-start,dur=400; let st=null;
  const step=ts=>{ if(!st) st=ts; const p=Math.min((ts-st)/dur,1),y=Math.round(start+dist*easeInOut(p)); isWin?window.scrollTo(0,y):c.scrollTop=y; if(p<1) requestAnimationFrame(step); };
  delay?setTimeout(()=>requestAnimationFrame(step),delay):requestAnimationFrame(step);
}
function isVisible(el){
  if(!el) return false;
  const cs=getComputedStyle(el);
  return cs.display!=="none" && cs.visibility!=="hidden" && cs.opacity!=="0";
}
function safeHTML(str){ const d=D.createElement("div"); d.textContent=String(str==null?"":str); return d.innerHTML; }

/* ============ Loader vizibil la început ============ */
D.body.classList.add("page-loading");
(function(){ const l=$(".lesson-loader"); if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
})();

/* ============ Firebase & capitol ============ */
const params = new URLSearchParams(location.search);
const CHAP   = params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase && firebase.auth && firebase.firestore)){ alert("Firebase nu este disponibil."); return; }
const auth = firebase.auth(), db = firebase.firestore();
const user = auth.currentUser || await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie să fii autentificat."); location.href="/login"; return; }

/* Single Active Lock (opțional, dacă există) */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* ============ DOM țintă ============ */
const QSEC  = $(".question-section");
const FINAL = $(".chapter-final-screen");
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

const alertWrap = $(".alert-wrapper-new");
function toast(txt,dur=1000){
  if(!alertWrap) return;
  const t = alertWrap.querySelector(".select-answer-text") || alertWrap.querySelector(".alert-box .select-answer-text");
  if(t) t.textContent = txt;
  alertWrap.style.display="flex"; void alertWrap.offsetWidth;
  alertWrap.classList.add("active");
  setTimeout(()=>{ alertWrap.classList.remove("active"); setTimeout(()=>{alertWrap.style.display="none"},300); }, dur);
}
function hideAlertBox(){ if(!alertWrap) return; alertWrap.classList.remove("active"); alertWrap.style.display="none"; }

/* ============ Sunete & mici efecte ============ */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){ try{a.pause();a.currentTime=0;a.play();}catch(_){} }

/* ============ Date capitol & total întrebări ============ */
const chapterDoc = await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu există în baza de date!"); return; }
const chapterName = chapterDoc.data().Name;

async function getTotalCount(){
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s.size;
}
const TOTAL = await getTotalCount();

/* ============ Colecții user ============ */
const progCollection = db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection  = db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef        = progCollection.doc(CHAP);

/* ============ Double Buffer Setup ============ */
function ensureDoubleBuffer(){
  // Dacă există deja A+B, doar le legăm; altfel clonăm din wrapperul actual.
  let A = $(".question-wrapper-A");
  let B = $(".question-wrapper-B");
  let shell = $(".question-shell-w");
  let original = $(".question-wrapper");

  if(shell && A && B) return {shell,A,B};

  if(!original){
    // fallback: încearcă clase alternative
    original = $(".questions-collection-list-item") || $(".question-item") || $(".question");
  }
  if(!original){
    alert("Structura .question-wrapper lipsă în pagină.");
    return null;
  }
  // Construim shell + B
  shell = D.createElement("div");
  shell.className = "question-shell-w";
  const parent = original.parentNode;
  parent.insertBefore(shell, original);
  
  // A
  A = original;
  A.classList.add("question-wrapper-A");
  // Pentru siguranță, menținem și clasa originală
  if(!A.classList.contains("question-wrapper")) A.classList.add("question-wrapper");
  shell.appendChild(A);

  // B (clone deep)
  B = original.cloneNode(true);
  B.classList.remove("question-wrapper-A");
  B.classList.add("question-wrapper-B");
  if(!B.classList.contains("question-wrapper")) B.classList.add("question-wrapper");
  shell.appendChild(B);

  return {shell,A,B};
}

const buffers = ensureDoubleBuffer();
if(!buffers){ return; }
const { shell:QShell, A:QWA, B:QWB } = buffers;

// Active/inactive
let ACTIVE = "A"; // "A" sau "B"
function activeEl(){ return ACTIVE==="A"?QWA:QWB; }
function inactiveEl(){ return ACTIVE==="A"?QWB:QWA; }
function setActive(which){
  ACTIVE = which==="B" ? "B" : "A";
  QWA.classList.toggle("is-active", ACTIVE==="A");
  QWB.classList.toggle("is-active", ACTIVE==="B");
}

/* ============ Refs per buffer ============ */
function buildCtx(wrapper){
  const ctx = { wrap:wrapper };
  const need = (sel) => wrapper.querySelector(sel);

  ctx.qEl        = wrapper; // container local
  ctx.qInner     = need(".question-wrapper-inner") || wrapper;
  ctx.qText      = need(".question-text");
  ctx.progress   = need(".progress-counter");
  ctx.mainWrap   = need(".main-content-wrapper") || wrapper;
  ctx.optWrap    = need(".options-wrapper");
  ctx.cards      = Array.from(wrapper.querySelectorAll(".option-card"));
  ctx.items      = ctx.cards.map(c=>c.querySelector(".option-item"));
  ctx.imgWrap    = need(".question-image-wrapper");
  ctx.img        = need(".question-image");

  ctx.videoWrap  = need(".explanation-video-wrapper") || null;

  // desktop buttons
  ctx.buttonsWrap= need(".submit-next-buttons");
  ctx.submitBtn  = ctx.buttonsWrap?.querySelector(".submit-btn") || null;
  ctx.explainBtn = ctx.buttonsWrap?.querySelector(".explanation-btn, .explanation-card") || null;
  ctx.aiBtn      = ctx.buttonsWrap?.querySelector(".ask-ai-btn, .ai-pop-wrapper") || null;

  // mobile buttons – nu atingem layout-ul
  ctx.buttonsWrapMobile = need(".submit-next-buttons-mobile") || null;
  ctx.submitBtnMobile   = ctx.buttonsWrapMobile?.querySelector(".submit-btn-mobile, .submit-btn") || null;
  ctx.explainBtnMobile  = ctx.buttonsWrapMobile?.querySelector(".explanation-btn-mobile, .explanation-btn") || null;
  ctx.aiBtnMobile       = ctx.buttonsWrapMobile?.querySelector(".ask-ai-btn-mobile, .ask-ai-btn") || null;

  // accordion
  ctx.acc        = need(".custom-accordion") || null;
  ctx.accHeader  = ctx.acc?.querySelector(".custom-accordion-header") || null;
  ctx.accArrow   = ctx.acc?.querySelector(".custom-accordion-arrow") || null;
  ctx.accContent = ctx.acc?.querySelector(".custom-accordion-content") || null;
  ctx.accBody    = ctx.acc?.querySelector(".custom-accordion-body") || null;
  ctx.expLabelEl = ctx.acc?.querySelector(".custom-accordion-label") || null;
  ctx.accAnchor  = ctx.acc?.querySelector(".accordion-anchor") || null;
  ctx.anchor     = wrapper.querySelector(".explanation-anchor") || null;
  ctx.anchorTop  = wrapper.querySelector(".explanation-anchor-top") || null;

  // feedback (fallback: global)
  ctx.feedbackWrap = wrapper.querySelector(".feedback-wrapper") || $(".feedback-wrapper");
  ctx.staticText   = ctx.feedbackWrap?.querySelector(".correct-answer-static") || null;
  ctx.correctAns   = ctx.feedbackWrap?.querySelector(".correct-answer") || null;

  return ctx;
}
const ctxA = buildCtx(QWA);
const ctxB = buildCtx(QWB);

// Eticheta AI CHAT pe ambele butoane (desktop + mobil)
function forceAIChatText(btn){
  if(!btn) return;
  btn.textContent="AI CHAT";
  btn.setAttribute("aria-label","AI CHAT");
  btn.setAttribute("role","button");
}
function applyAIChatText(ctx){
  forceAIChatText(ctx.aiBtn);
  forceAIChatText(ctx.aiBtnMobile);
}

/* ============ Stare globală ============ */
let BUF = {};          // cache întrebări
let SEL = [];          // litere selectate
let ANSW = false;      // e verificată întrebarea curentă?
let CUR = 1, FIN = false;
let WRONG = [], WRMODE = false, WRP = 0;
let WRONG_STARTED_AT_MS = 0;

const LS_WRONG_KEY = `wm:${user.uid}:${CHAP}`;

/* ============ Helpers Firestore & Wrong-Mode persist ============ */
async function persistWrongMode({active,list,pos}){
  try{
    const payload={active:!!active,list:Array.isArray(list)?list.map(v=>+v).filter(Number.isFinite):[],pos:Math.max(0,Math.min((Array.isArray(list)?list.length-1:0),(+pos||0))),startedAtMs: WRONG_STARTED_AT_MS||Date.now()};
    WRONG_STARTED_AT_MS=payload.startedAtMs;
    await progRef.set({wrongMode:payload},{merge:true});
    try{ localStorage.setItem(LS_WRONG_KEY,JSON.stringify(payload)); }catch(_){}
  }catch(_){
    try{
      const fallback={active:!!active,list:(list||[]),pos:+pos||0,startedAtMs:WRONG_STARTED_AT_MS||Date.now()};
      localStorage.setItem(LS_WRONG_KEY,JSON.stringify(fallback));
    }catch(_){}
  }
}
async function loadWrongModePersist(){
  let out=null;
  try{
    const ps=await progRef.get(); const wm=ps.exists&&ps.data().wrongMode?ps.data().wrongMode:null;
    if(wm && wm.active){ out={active:!!wm.active,list:(wm.list||[]).map(v=>+v).filter(Number.isFinite),pos:+wm.pos||0,startedAtMs:+wm.startedAtMs||0}; }
  }catch(_){}
  if(!out||!out.active){
    try{ const raw=localStorage.getItem(LS_WRONG_KEY); if(raw){ const wm=JSON.parse(raw); if(wm&&wm.active) out=wm; } }catch(_){}
  }
  return out;
}
async function clearWrongModePersist(){
  try{ await progRef.set({wrongMode:{active:false,list:[],pos:0,startedAtMs:0}},{merge:true}); }catch(_){}
  try{ localStorage.removeItem(LS_WRONG_KEY); }catch(_){}
}

/* ============ Prefetch întrebări & imagini ============ */
function primeImage(url,{priority="auto"}={}){ 
  const img=new Image(); img.decoding="async"; 
  try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){} }
  img.src=url; 
  const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;}); 
  return {img,ready}; 
}
async function prefetchQuestion(idx){
  if(!idx||BUF[idx]) return;
  let snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",idx).limit(1).get();
  if(snap.empty){ try{ snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get(); }catch(_){ } }
  if(snap.empty) return;
  const data=snap.docs[0].data(); BUF[idx]=data;
  if(data.Image){ try{ const {ready}=primeImage(data.Image,{priority:"auto"}); BUF[idx].__imgReady=ready; ready.catch(()=>{}); }catch(_){ BUF[idx].__imgReady=Promise.resolve(); } }
  else BUF[idx].__imgReady=Promise.resolve();
}
async function prefetchMany(indices,priorityMap={}){
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]); if(!list.length) return;
  try{
    const qs=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","in",list.slice(0,10)).get();
    qs.forEach(doc=>{
      const d=doc.data(),i=d.Index; if(!i||BUF[i]) return; BUF[i]=d;
      if(d.Image){ const pr=priorityMap[i]||"low"; try{ const {ready}=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=ready; ready.catch(()=>{});}catch(_){BUF[i].__imgReady=Promise.resolve();} }
      else BUF[i].__imgReady=Promise.resolve();
    });
  }catch(_){ await Promise.all(list.map(v=>prefetchQuestion(v))); }
}
async function prefetchAhead(current){
  const fast=isFastNet();
  const targets=[current+1];
  if(fast) targets.push(current+2);
  const prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio);
  rIC(()=>{});
}

/* ============ Helpers UI: selectări & corectare ============ */
function getLetterFromCard(card){
  const el=card.querySelector(".option-letter"); if(!el) return "";
  for(const n of el.childNodes){ if(n.nodeType===Node.TEXT_NODE){ const t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase(); } }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearAllSelected(scope){
  (scope||document).querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected").forEach(el=>el.classList.remove("selected"));
  (scope||document).querySelectorAll(".option-card.selected").forEach(el=>el.classList.remove("selected"));
}
function applySelectedVisualsFromSEL(scope){
  const root=scope||document;
  root.querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card),on=SEL.includes(L);
    card.classList.toggle("selected",on);
    card.querySelector(".option-letter")?.classList.toggle("selected",on);
    card.querySelector(".option-item")?.classList.toggle("selected",on);
    card.querySelector(".option-card-connector")?.classList.toggle("selected",on);
  });
}
function clearLetterStates(scope){ (scope||document).querySelectorAll(".option-letter").forEach(el=>el.classList.remove("correct","wrong")); }
function applyLetterStatesByCorrect(scope,corArr){
  const COR=new Set((corArr||[]).map(x=>String(x||"").trim().toUpperCase()));
  (scope||document).querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card),el=card.querySelector(".option-letter");
    if(!el||!L) return; el.classList.remove("correct","wrong"); el.classList.add(COR.has(L)?"correct":"wrong");
  });
}
function clearWrongCards(scope){ (scope||document).querySelectorAll(".option-card.wrong-card").forEach(c=>c.classList.remove("wrong-card")); }
function applyWrongCardsByCorrect(scope,corArr){
  const COR=new Set((corArr||[]).map(x=>String(x||"").trim().toUpperCase()));
  (scope||document).querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card);
    card.classList.toggle("wrong-card",!COR.has(L));
  });
}

const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Gresit. Raspuns corect -","Nu e bine. Raspuns core -","Din pacate, nu. Raspuns core -","Mai incearca. Raspuns core -","Alegere gresita. Raspuns core -","Nu e varianta buna. Raspuns core -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
}

/* ============ Video & media helpers ============ */
function setVideoBlock(ctx,url){
  if(!ctx.videoWrap) return;
  ctx.videoWrap.innerHTML="";
  ctx.videoWrap.style.display="none";
  if(!url) return;

  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html=`<video class="explanation-video plyr-player" controls playsinline><source src="${url}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/);
    const yt=m?m[1]:"";
    if(yt) html=`<div class="plyr__video-embed"><iframe src="https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0" allowfullscreen allowtransparency allow="autoplay"></iframe></div>`;
  }
  if(!html) return;
  ctx.videoWrap.innerHTML=html;
  ctx.videoWrap.style.display="none";

  const playerEl=ctx.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    playerEl._hasUserPlayed=false; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false;
    playerEl.addEventListener("play",()=>{ playerEl._hasUserPlayed=true; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false; });
    // Auto-pause dacă iese din viewportul intern
    const scroller=ctx.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(ctx.qEl)||null;
    if(scroller){
      try{ ctx.videoWrap.__observerInstance?.disconnect?.(); }catch(_){}
      const obs=new IntersectionObserver((entries)=>{
        entries.forEach(entry=>{
          const v=entry.target.querySelector("video")||playerEl;
          if(v!==playerEl||!playerEl._hasUserPlayed) return;
          if(entry.isIntersecting){
            if(playerEl._autoPaused && !playerEl._manualClosed && !playerEl._suppressNextAutoResume){
              try{ playerEl.plyr?playerEl.plyr.play():playerEl.play(); }catch(_){}
              playerEl._autoPaused=false;
            }
          }else{
            const wasPlaying=(playerEl.plyr?playerEl.plyr.playing:!playerEl.paused);
            if(wasPlaying){ playerEl._autoPaused=true; try{ playerEl.plyr?playerEl.plyr.pause():playerEl.pause(); }catch(_){ } }
          }
        });
      },{root:scroller,threshold:.25});
      obs.observe(playerEl.parentElement||playerEl);
      ctx.videoWrap.__observerInstance=obs;
    }
  }
}
function stopActiveMedia(ctx){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  const lottieEl=ctx.qEl?.querySelector(".lottie-animation-correct");
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  const v=ctx.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}
function applyNoImageState(ctx,on){
  if(!ctx.optWrap || !ctx.qEl) return;
  if(on){
    ctx.qEl.classList.add("no-image");
    ctx.optWrap.style.minHeight="40vh";
    if(ctx.imgWrap) ctx.imgWrap.style.display="none";
  }else{
    ctx.qEl.classList.remove("no-image");
    ctx.optWrap.style.minHeight="";
    if(ctx.imgWrap) ctx.imgWrap.style.display="";
  }
}
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady && typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
}
async function seamlessSetImage(ctx,url){
  if(!ctx.img){ applyNoImageState(ctx,true); return; }
  if(!url){
    ctx.img.removeAttribute("src");
    ctx.img.style.display="none";
    ctx.img.setAttribute("aria-hidden","true");
    applyNoImageState(ctx,true);
    return;
  }
  try{
    const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
    tmp.src=url;
    if(tmp.decode) await tmp.decode(); else await new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
  }catch(_){}
  if(ctx.img.src!==url) ctx.img.src=url;
  ctx.img.style.display="";
  ctx.img.removeAttribute("aria-hidden");
  applyNoImageState(ctx,false);
  ctx.img.onerror=()=>{
    ctx.img.removeAttribute("src");
    ctx.img.style.display="none";
    ctx.img.setAttribute("aria-hidden","true");
    applyNoImageState(ctx,true);
  };
}

/* ============ Stări butoane submit ============ */
function setSubmitState(btn,state,{affectLayout=true}={}){
  if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify":
      btn.textContent="VERIFICA";
      btn.classList.add("is-verify","_preload-full");
      if(affectLayout) btn.style.gridColumn="1 / 2";
      break;
    case "next": {
      const last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZA":"CONTINUA";
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
    }
    case "finish":
      btn.textContent="FINALIZEAZA";
      btn.classList.add("is-finish","finish-chapter-btn");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
  }
}
function setSubmitStateBoth(ctx,state){
  setSubmitState(ctx.submitBtn, state, {affectLayout:true});
  setSubmitState(ctx.submitBtnMobile, state, {affectLayout:false});
}
function setSingleBtnState(ctx,on){
  if(ctx.buttonsWrap) ctx.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(ctx.submitBtn) ctx.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(ctx.submitBtn) ctx.submitBtn.style.removeProperty("grid-column"); }
}

/* ============ Explicație UI ============ */
function isExplanationOpen(ctx){
  const accOpen = !!(ctx.acc && ctx.acc.style.display!=="none" && (ctx.acc.classList.contains("open") || (ctx.accContent && ctx.accContent.style.maxHeight && ctx.accContent.style.maxHeight!=="0px")));
  const videoShown = !!(ctx.videoWrap && ctx.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(ctx,open){
  const setOpen = (btn)=>{ if(!btn) return; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
  const setClosed = (btn)=>{ if(!btn) return; btn.textContent="EXPLICATIE"; };
  if(open){ setOpen(ctx.explainBtn); setOpen(ctx.explainBtnMobile); }
  else{ setClosed(ctx.explainBtn); setClosed(ctx.explainBtnMobile); }
}

/* ============ AI pop-up (unic, global) ============ */
let AIPop=null;
function ensureAIPop(){
  if(AIPop) return AIPop;
  AIPop=$(".ask-ai-pop-up");
  if(!AIPop){
    AIPop=D.createElement("div"); AIPop.className="ask-ai-pop-up";
    Object.assign(AIPop.style,{display:"none",position:"fixed",inset:"0",justifyContent:"center",alignItems:"center",background:"rgba(0,0,0,.5)",backdropFilter:"blur(2px)",zIndex:"2147483647"});
    const box=D.createElement("div"); box.className="audio-btn";
    Object.assign(box.style,{display:"flex",gap:"12px",alignItems:"center",background:"#121212",padding:"16px 20px",borderRadius:"12px",border:"1px solid #2a2a2a"});
    const mic=D.createElement("div"); mic.className="mic-icon-ai"; Object.assign(mic.style,{width:"36px",height:"36px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",overflow:"hidden"});
    const img=D.createElement("img"); img.alt="AI"; img.src="https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/685c48b463b6d0ce30731509_ChatGPT%20Image%20Jun%2020%2C%202025%2C%2001_39_41%20PM.png"; img.style.width="100%"; img.style.height="100%"; img.style.objectFit="cover"; mic.appendChild(img);
    const audioBtn=D.createElement("button"); audioBtn.className="audio-ai-btn"; audioBtn.textContent="Audio AI"; Object.assign(audioBtn.style,{padding:"10px 14px",borderRadius:"10px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    const closeBtn=D.createElement("button"); closeBtn.className="ask-ai-pop-up-close"; closeBtn.textContent="Închide"; Object.assign(closeBtn.style,{marginLeft:"8px",padding:"8px 12px",borderRadius:"8px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    box.append(mic,audioBtn,closeBtn); AIPop.appendChild(box); D.body.appendChild(AIPop);
  }
  AIPop.addEventListener("click",e=>{ if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){ vibrateShort(); AIPop.style.display="none"; D.body.style.overflow=""; }});
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS */ });
  return AIPop;
}

/* ============ Render întrebare într-un context (buffer) ============ */
async function renderInto(ctx, idx, {restore=true}={}){
  const q = BUF[idx];
  if(!q){ return; }

  // header + progres
  (ctx.qEl.querySelector(".chapter-text")||D.createElement("div")).textContent = chapterName || "";
  if(ctx.progress){
    ctx.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(CUR)}/${pad2(TOTAL)}`;
  }

  // text întrebare
  if(ctx.qText){ ctx.qText.innerHTML=""; ctx.qText.insertAdjacentHTML("afterbegin", safeHTML(q.Question||"")); }

  // opțiuni A/B/C
  const vals=[q["Option A"]||"", q["Option B"]||"", q["Option C"]||""];
  ctx.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=ctx.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin", safeHTML(val)); }
    card.style.display = val ? "" : "none";
  });

  // explicație text
  if(ctx.accBody){
    ctx.accBody.innerHTML="";
    const ex=q["Explanation"]||"";
    if(ex) ctx.accBody.insertAdjacentHTML("afterbegin", safeHTML(ex));
  }

  // ascunde feedback/explicație până la verificare
  if(ctx.feedbackWrap){ ctx.feedbackWrap.style.display="none"; }
  if(ctx.correctAns)   { ctx.correctAns.textContent=""; }
  if(ctx.staticText)   { ctx.staticText.textContent="Raspunsul corect este:"; }
  renderExplainBtnUI(ctx,false);

  if(ctx.explainBtn)      ctx.explainBtn.style.display="none";
  if(ctx.explainBtnMobile)ctx.explainBtnMobile.style.display="none";
  if(ctx.aiBtn)           ctx.aiBtn.style.display="none";
  if(ctx.aiBtnMobile)     ctx.aiBtnMobile.style.display="none";

  if(ctx.acc){ ctx.acc.style.display="none"; ctx.acc.classList.remove("open"); if(ctx.accContent) ctx.accContent.style.maxHeight="0px"; }
  if(ctx.accArrow){ try{ ctx.accArrow.style.removeProperty("transform"); }catch(_){ } }

  setVideoBlock(ctx, q["Explanation Video Link"]||"");

  // reset selectări locale
  clearLetterStates(ctx.qEl);
  clearAllSelected(ctx.qEl);
  clearWrongCards(ctx.qEl);

  setSingleBtnState(ctx,true);
  setSubmitStateBoth(ctx,"verify");

  // imagine
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(ctx,q.Image); } else { await seamlessSetImage(ctx,""); }

  // restaurare stare „verificată” (condiționată de sesiune în wrong-mode)
  if(restore){
    try{
      const snap=await ansCollection.doc(`${CHAP}_${idx}`).get();
      if(snap.exists){
        const d=snap.data();
        const selSaved=(d.selected||[]).map(x=>String(x||"").toUpperCase());
        const corSaved=(d.correct||[]).map(x=>String(x||"").toUpperCase());
        const answeredAtMs=+(d.answeredAtMs||0);
        const allowRestore = (!WRMODE) || (WRMODE && answeredAtMs && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
        if(allowRestore && selSaved.length>0){
          SEL=Array.from(new Set(selSaved));
          applySelectedVisualsFromSEL(ctx.qEl);
          ANSW=true; 
          clearLetterStates(ctx.qEl); applyLetterStatesByCorrect(ctx.qEl,corSaved);
          clearWrongCards(ctx.qEl);   applyWrongCardsByCorrect(ctx.qEl,corSaved);
          const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
          if(ctx.staticText) ctx.staticText.textContent = same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
          const ord=["A","B","C"].filter(x=>corSaved.includes(x)); if(ctx.correctAns) ctx.correctAns.textContent=ord.join(", ");
          if(ctx.feedbackWrap) ctx.feedbackWrap.style.setProperty("display","flex","important");
          if(ctx.explainBtn) ctx.explainBtn.style.setProperty("display","flex","important");
          if(ctx.explainBtnMobile) ctx.explainBtnMobile.style.setProperty("display","flex","important");
          if(ctx.aiBtn) ctx.aiBtn.style.setProperty("display","flex","important");
          if(ctx.aiBtnMobile) ctx.aiBtnMobile.style.setProperty("display","flex","important");
          applyAIChatText(ctx);
          setSingleBtnState(ctx,false);
          const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
          setSubmitStateBoth(ctx,(lastWrong||lastNormal)?"finish":"next");
        }else{
          SEL=[]; ANSW=false;
        }
      }else{ SEL=[]; ANSW=false; }
    }catch(_){ SEL=[]; ANSW=false; }
  }else{
    SEL=[]; ANSW=false;
  }
}

/* ============ Swap instant cu pregătire pe bufferul inactiv ============ */
function measureHeight(el){ return (el && el.getBoundingClientRect) ? el.getBoundingClientRect().height : 0; }
async function swapToIndex(idx,{resetSelections=false}={}){
  const from = activeEl(), to = inactiveEl();
  const ctxTo = (to===QWA?ctxA:ctxB);
  const ctxFrom = (from===QWA?ctxA:ctxB);

  // ținem înălțimea ca să evităm "saltul" vizual
  const prevH = Math.max(measureHeight(from), measureHeight(to));
  if(prevH) QShell.style.minHeight = prevH+"px";

  // pregătim conținutul pe bufferul inactiv
  await renderInto(ctxTo, idx, {restore:!resetSelections});

  // swap instant (fără opacități)
  setActive(to===QWA?"A":"B");

  // curățare
  QShell.style.minHeight = "";
  // mic debounce de siguranță
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
}

/* ============ Final screen & wrong-prep ============ */
const chapterTextFinal  = $(".chapter-text-final");
const progressCounterFinal = $(".progress-counter-final");
const barOuterFinal = $(".chapter-final-screen .chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),
    barRedFinal  =$(".chapter-final-screen .progress-red"),
    barGapFinal  =$(".chapter-final-screen .progress-gap");
const legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent"),
      resetWrongBtn = $(".reset-wrong-questions-only");
if(legacyPercentEl) legacyPercentEl.style.display="none";
const RADIUS_PX=3,GAP_PX=3,GAP_COLOR="#070707",ANIM_DUR=900;

function ensureFinalSegments(){
  if(!barOuterFinal) return;
  if(!barGreenFinal){barGreenFinal=D.createElement("span");barGreenFinal.className="progress-green";barOuterFinal.appendChild(barGreenFinal);}
  if(!barRedFinal){barRedFinal=D.createElement("span");barRedFinal.className="progress-red";barOuterFinal.appendChild(barRedFinal);}
  if(!barGapFinal){barGapFinal=D.createElement("span");barGapFinal.className="progress-gap";barOuterFinal.appendChild(barGapFinal);}
}
function applyFinalBarBaseStyles(){
  if(!barOuterFinal) return; ensureFinalSegments();
  Object.assign(barOuterFinal.style,{overflow:"hidden",position:"relative",display:"flex",borderRadius:`${RADIUS_PX}px`});
  if(barGreenFinal) Object.assign(barGreenFinal.style,{position:"absolute",left:"0",top:"0",bottom:"0",borderRadius:`${RADIUS_PX}px`,transition:"left .25s ease,width .25s ease"});
  if(barRedFinal)   Object.assign(barRedFinal.style,{position:"absolute",top:"0",bottom:"0",borderRadius:`${RADIUS_PX}px`,transition:"left .25s ease,width .25s ease"});
  if(barGapFinal)   Object.assign(barGapFinal.style,{position:"absolute",top:"0",bottom:"0",width:`${GAP_PX}px`,backgroundColor:GAP_COLOR,display:"none",pointerEvents:"none",borderRadius:`${RADIUS_PX}px`});
}
let finalPercentEl=null;
function ensureFinalPercentEl(){
  if(!progressCounterFinal) return null;
  finalPercentEl=progressCounterFinal.querySelector(".exam-final-percent");
  if(!finalPercentEl){
    finalPercentEl=D.createElement("span");
    finalPercentEl.className="exam-final-percent";
    finalPercentEl.textContent=progressCounterFinal.textContent.trim()||"0%";
    progressCounterFinal.textContent="";
    progressCounterFinal.appendChild(finalPercentEl);
  }
  return finalPercentEl;
}
const setFinalPercent=v=>{ensureFinalPercentEl();if(finalPercentEl) finalPercentEl.textContent=String(v);};
function animateFinalProgress(cPct,wPct,d=ANIM_DUR){
  if(!barOuterFinal) return; applyFinalBarBaseStyles();
  const answeredPct=Math.max(0,Math.min(100,(+cPct||0)+(+wPct||0))),hasBoth=(+cPct>0)&&(+wPct>0);
  if(answeredPct>0&&+cPct>0){ if(hasBoth){barGreenFinal.style.width=`calc(${(cPct/answeredPct)*100}% - ${GAP_PX/2}px)`;barGreenFinal.style.left="0";} else{barGreenFinal.style.width="100%";barGreenFinal.style.left="0";} }
  else{barGreenFinal.style.width="0%";barGreenFinal.style.left="0";}
  if(answeredPct>0&&+wPct>0){
    if(hasBoth){ const leftPct=(cPct/answeredPct)*100; barRedFinal.style.left=`calc(${leftPct}% + ${GAP_PX/2}px)`; barRedFinal.style.width=`calc(${(wPct/answeredPct)*100}% - ${GAP_PX/2}px)`; }
    else{ barRedFinal.style.left="0"; barRedFinal.style.width="100%"; }
  }else{ barRedFinal.style.left="0"; barRedFinal.style.width="0%"; }
  if(barGapFinal){ if(hasBoth){ const leftPct=(cPct/answeredPct)*100; barGapFinal.style.display="block"; barGapFinal.style.left=`calc(${leftPct}% - ${GAP_PX/2}px)`; } else barGapFinal.style.display="none"; }
  barOuterFinal.style.transition=`width ${d}ms cubic-bezier(.68,-0.55,.27,1.55)`; barOuterFinal.style.width="0%";
  if(progressCounterFinal){ setFinalPercent("0%"); const start=performance.now(); const step=ts=>{const p=Math.min((ts-start)/d,1),val=Math.round(p*(+cPct||0)); setFinalPercent(val+"%"); if(p<1) requestAnimationFrame(step);}; requestAnimationFrame(step); }
  requestAnimationFrame(()=>{ setTimeout(()=>{ barOuterFinal.style.width=`${answeredPct}%`; },40); });
}
async function showFinal(){
  if(chapterTextFinal) chapterTextFinal.textContent=chapterName;
  const answersSnap=await ansCollection.where("chapterSlug","==",CHAP).get();
  if(resetWrongBtn){
    resetWrongBtn.style.display="none";
    let hasWrong=false;
    answersSnap.forEach(doc=>{ const d=doc.data(); const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(","); if(sel&&sel!==cor) hasWrong=true; });
    if(hasWrong) resetWrongBtn.style.display="flex";
  }
  let correct=0,wrong=0;
  answersSnap.forEach(doc=>{ const d=doc.data(); const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(","); if(sel&&sel===cor) correct++; else if(sel) wrong++; });
  const safeTotal=(TOTAL&&TOTAL>0)?TOTAL:Math.max(1,correct+wrong);
  const cPct=Math.round((correct/safeTotal)*100),wPct=Math.round((wrong/safeTotal)*100);
  $(".lesson-loader")?.style.setProperty("display","none","important");
  ensureFinalPercentEl(); setFinalPercent("0%"); animateFinalProgress(cPct,wPct,ANIM_DUR);
  FINAL?.style.setProperty("display","flex","important");
}

/* ============ Inițializare progres & wrong-mode ============ */
const progSnap=await progRef.get();
let CUR_FROM_DB=null, FIN_FROM_DB=false;
if(progSnap.exists){
  CUR_FROM_DB=progSnap.data().currentIndex||null;
  FIN_FROM_DB=!!progSnap.data().finished;
  if(CUR_FROM_DB) CUR=CUR_FROM_DB;
  if(FIN_FROM_DB) FIN=true;
}

const persistedWM = await loadWrongModePersist();

/* ============ Evenimente (delegare pe shell) ============ */

// Selectare opțiuni
QShell.addEventListener("click", e=>{
  const active = activeEl();
  if(!active) return;
  const ctx = (active===QWA?ctxA:ctxB);

  const card = e.target.closest(".option-card");
  if(card && active.contains(card)){
    if(ANSW) return;
    vibrateShort();
    const L=getLetterFromCard(card); if(!L) return;
    SEL=SEL.includes(L)?SEL.filter(x=>x!==L):SEL.concat(L);
    applySelectedVisualsFromSEL(ctx.qEl);
    hideAlertBox();
  }
});

// Explain toggle (desktop + mobil)
function toggleExplain(ctx){
  vibrateShort();
  const opening = !isExplanationOpen(ctx);
  const scroller=ctx.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(ctx.qEl);

  if(opening){
    if(ctx.videoWrap){ ctx.videoWrap.style.display="block"; const v=ctx.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
    if(ctx.acc){ ctx.acc.style.display="block"; ctx.acc.classList.remove("open"); if(ctx.accContent) ctx.accContent.style.maxHeight="0px"; }
    renderExplainBtnUI(ctx,true);
    scrollContainerToAnchor(ctx.anchor,scroller,{behavior:"smooth"});
  }else{
    const v=ctx.videoWrap?.querySelector("video");
    if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
    if(ctx.videoWrap) ctx.videoWrap.style.display="none";
    if(ctx.acc){ ctx.acc.classList.remove("open"); ctx.acc.style.display="none"; if(ctx.accContent) ctx.accContent.style.maxHeight="0px"; }
    if(ctx.accArrow){ try{ ctx.accArrow.style.removeProperty("transform"); }catch(_){ } }
    renderExplainBtnUI(ctx,false);
    scrollContainerToAnchor(ctx.anchorTop,scroller,{behavior:"smooth"});
  }
}

// Submit / Next / Finish (desktop + mobil)
QShell.addEventListener("click", async e=>{
  const active = activeEl();
  if(!active) return;
  const ctx = (active===QWA?ctxA:ctxB);

  // Explain buttons
  if(e.target.closest(".explanation-btn, .explanation-card, .explanation-btn-mobile")){
    toggleExplain(ctx);
    return;
  }
  // AI buttons
  if(e.target.closest(".ask-ai-btn, .ai-pop-wrapper, .ask-ai-btn-mobile")){
    vibrateShort();
    ensureAIPop().style.display="flex"; D.body.style.overflow="hidden";
    return;
  }

  const submitBtn = e.target.closest(".submit-btn, .submit-btn-mobile");
  if(!submitBtn || !active.contains(submitBtn)) return;

  e.preventDefault(); vibrateShort();

  const idx = WRMODE ? (WRONG[WRP]||0) : CUR;
  const isVerify = submitBtn.classList.contains("is-verify");
  const isFinish = submitBtn.classList.contains("is-finish") || submitBtn.classList.contains("finish-chapter-btn");
  const isNext   = submitBtn.classList.contains("is-next");

  if(isFinish && ANSW){
    stopActiveMedia(ctx);
    try{ await progRef.set({currentIndex:CUR,finished:true},{merge:true}); }catch(_){}
    WRMODE=false; await clearWrongModePersist(); await showFinal(); return;
  }

  if(isNext && ANSW){
    stopActiveMedia(ctx);
    if(WRMODE){
      WRP++;
      if(WRP>=WRONG.length){
        WRMODE=false;
        try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await clearWrongModePersist();
        await showFinal(); return;
      }
      await persistWrongMode({active:true,list:WRONG,pos:WRP});
      await prefetchAhead(WRONG[WRP]||0);
      await swapToIndex(WRONG[WRP],{resetSelections:true});
      return;
    }else{
      if(CUR<TOTAL){
        CUR++; try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}
        await prefetchAhead(CUR);
        await swapToIndex(CUR,{resetSelections:false});
      }else{
        try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await showFinal();
      }
      return;
    }
  }

  if(isVerify){
    if(SEL.length===0){
      toast("Selecteaza un raspuns!",1000);
      playOne(alertSound);
      setSingleBtnState(ctx,true);
      return;
    }
    const q=BUF[idx]; if(!q) return;
    const cor=parseCorrectLetters(q);
    ANSW=true;

    clearLetterStates(ctx.qEl); applyLetterStatesByCorrect(ctx.qEl,cor);
    clearWrongCards(ctx.qEl);   applyWrongCardsByCorrect(ctx.qEl,cor);

    const selected=SEL.slice().sort().join(","), correct=cor.slice().sort().join(","), isFullyCorrect=selected.length>0&&selected===correct;

    if(ctx.staticText) ctx.staticText.textContent=isFullyCorrect?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
    const ord=["A","B","C"].filter(x=>cor.includes(x)); if(ctx.correctAns) ctx.correctAns.textContent=ord.join(", ");

    const lottieEl=ctx.qEl.querySelector(".lottie-animation-correct");
    if(isFullyCorrect){
      playOne(correctSound);
      if(lottieEl){
        lottieEl.style.setProperty("display","block","important");
        if(window.lottie){
          lottieEl.innerHTML="";
          try{ window.lottie.loadAnimation({container:lottieEl,renderer:"svg",loop:false,autoplay:true,path:"https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/6868a90be26405b0d160eb81_Main%20Scene%20(1).json"}); }catch(_){}
        }
      }
    }else{
      playOne(wrongSound);
      if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
    }

    if(ctx.feedbackWrap) ctx.feedbackWrap.style.setProperty("display","flex","important");
    if(ctx.explainBtn) ctx.explainBtn.style.setProperty("display","flex","important");
    if(ctx.explainBtnMobile) ctx.explainBtnMobile.style.setProperty("display","flex","important");
    if(ctx.aiBtn) ctx.aiBtn.style.setProperty("display","flex","important");
    if(ctx.aiBtnMobile) ctx.aiBtnMobile.style.setProperty("display","flex","important");
    applyAIChatText(ctx);

    setSingleBtnState(ctx,false);
    const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
    setSubmitStateBoth(ctx,(lastWrong||lastNormal)?"finish":"next");

    // scroll către explicație/feedback
    requestAnimationFrame(()=>{
      const scroller=ctx.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(ctx.qEl);
      scrollContainerToAnchor(ctx.anchor,scroller,{behavior:"smooth"});
    });

    const nowMs = Date.now();
    Promise.all([
      ansCollection.doc(`${CHAP}_${idx}`).set({
        module:"mediu",chapterSlug:CHAP,index:idx,question:BUF[idx]?.Question||"",
        options:["A","B","C"].map(L=>({letter:L,value:BUF[idx]?.["Option "+L]||""})),
        selected:SEL.slice(),correct:cor.slice(),explanation:BUF[idx]?.["Explanation"]||"",
        answeredAt:firebase.firestore.FieldValue.serverTimestamp(),
        answeredAtMs: nowMs
      },{merge:true}),
      progRef.set({currentIndex:CUR,finished:false},{merge:true})
    ]).catch(_=>{
      toast("Conexiune slabă – încerc să salvez…",1200);
    });
  }
});

/* Escape pentru modale/popups */
D.body.addEventListener("click",e=>{
  if(e.target.closest(".custom-accordion-header,.back-btn,.next-chapter-btn,.reset-chapter-btn,.confirm-reset-chapter,.back-to-chapter-final-screen,.close-btn")) vibrateShort();
});
D.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    const active = activeEl();
    const ctx = (active===QWA?ctxA:ctxB);
    const btn = (ctx.submitBtnMobile && isVisible(ctx.submitBtnMobile)) ? ctx.submitBtnMobile : ctx.submitBtn;
    if(btn){ e.preventDefault(); btn.click(); }
  }else if(e.key==="Escape"){
    try{
      document.querySelectorAll(".alert-wrapper-new.active").forEach(w=>{w.classList.remove("active"); w.style.display="none";});
      const aiPop=document.querySelector(".ask-ai-pop-up"); if(aiPop) aiPop.style.display="none";
      const loader=document.querySelector(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
      D.body.classList.remove("page-loading"); D.body.style.overflow="";
    }catch(_){}
  }
});

/* ============ Wrong-mode: build list + start ============ */
async function buildWrongListNow(){
  const pool=[], snap=await ansCollection.where("chapterSlug","==",CHAP).get();
  snap.forEach(doc=>{
    const d=doc.data(),sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
    if(sel&&sel!==cor){
      let idx=d.index;
      if(typeof idx!=="number"){ const asNum=parseInt(idx,10); if(Number.isFinite(asNum)) idx=asNum; }
      if(typeof idx!=="number"){ const m=String(doc.id||"").match(/_(\d+)$/); if(m) idx=parseInt(m[1],10); }
      if(typeof idx==="number"&&Number.isFinite(idx)) pool.push(idx);
    }
  });
  return Array.from(new Set(pool)).sort((a,b)=>a-b);
}
let START_WRONG_IN_PROGRESS=false;
async function startWrongModeSafe(){
  if(START_WRONG_IN_PROGRESS) return;
  START_WRONG_IN_PROGRESS=true;
  vibrateShort();
  const loaderEl=$(".lesson-loader");
  if(loaderEl) loaderEl.style.setProperty("display","flex","important");
  FINAL?.style.setProperty("display","none","important");
  if(QSEC){ QSEC.style.setProperty("display","flex","important"); QSEC.classList.add("visible"); }

  try{
    let list = await (async ()=>{ 
      const prepared = await buildWrongListNow();
      return prepared;
    })();

    if(!list.length){
      alert("Nu ai nicio întrebare greșită de refăcut la acest capitol!");
      if(loaderEl) loaderEl.style.setProperty("display","none","important");
      FINAL?.style.setProperty("display","flex","important");
      START_WRONG_IN_PROGRESS=false;
      return;
    }

    const prio={}; prio[list[0]]="high";
    await prefetchMany(list,prio);
    await prefetchQuestion(list[0]);
    const q1=BUF[list[0]];
    try{ await ensureImageReadyFromQ(q1); }catch(_){}

    WRMODE=true; WRP=0; WRONG=list.slice(0);
    WRONG_STARTED_AT_MS=Date.now();
    await persistWrongMode({active:true,list:WRONG,pos:WRP});

    SEL=[]; ANSW=false;
    await swapToIndex(WRONG[WRP],{resetSelections:true});
    await prefetchAhead(WRONG[WRP]||0);

  }catch(e){
    console.error("Eroare wrong-mode:",e);
    alert("A apărut o eroare la încărcarea întrebărilor greșite.");
    FINAL?.style.setProperty("display","flex","important");
  }finally{
    if(loaderEl) loaderEl.style.setProperty("display","none","important");
    START_WRONG_IN_PROGRESS=false;
  }
}

/* ============ Next chapter ============ */
let NEXT_SLUG=null,NEXT_READY=false;
async function getNextChapterSlug(){
  if(NEXT_READY) return NEXT_SLUG;
  try{
    const s=await db.collection("mediu_invatare_chapters").orderBy("Index").get(); const arr=[];
    s.forEach(d=>arr.push(d.id));
    const i=arr.indexOf(CHAP); NEXT_SLUG=(i!==-1&&i<arr.length-1)?arr[i+1]:null;
  }catch(_){ NEXT_SLUG=null; }
  NEXT_READY=true; return NEXT_SLUG;
}

/* ============ Delegări pe final screen ============ */
D.addEventListener("click",async e=>{
  if(e.target.closest(".reset-wrong-questions-only")){ await startWrongModeSafe(); return; }
  if(e.target.closest(".next-chapter-btn")){
    vibrateShort(); 
    await clearWrongModePersist();
    const next=await getNextChapterSlug(); if(next) location.replace(`${location.pathname}?chapter=${encodeURIComponent(next)}`);
    return;
  }
  if(e.target.closest(".reset-chapter-btn")){ vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="flex"; return; }
  if(e.target.closest(".confirm-reset-chapter")){
    vibrateShort();
    const aw=$(".alert-wrapper");
    try{
      await progRef.delete();
      await clearWrongModePersist();
      const qs=await ansCollection.where("chapterSlug","==",CHAP).get();
      const batch=db.batch(); qs.forEach(doc=>batch.delete(doc.ref)); await batch.commit(); location.reload();
    }catch(_){
      alert("Eroare la resetarea progresului. Încearcă din nou.");
      if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important");
    }
    return;
  }
  if(e.target.closest(".back-to-chapter-final-screen")){
    vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important"); return;
  }
});

/* ============ Inițializare pagină: prefetch & primul render ============ */
if(!QSEC){ alert("Structura .question-section nu e prezentă."); D.body.classList.remove("page-loading"); return; }

// Asigurăm că A e activ inițial (instant)
setActive("A");

// Hidratează butoanele AI CHAT label
applyAIChatText(ctxA);
applyAIChatText(ctxB);

if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
  WRMODE=true; WRONG=persistedWM.list.slice(0); WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
  WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();

  await prefetchQuestion(WRONG[WRP]);
  await prefetchAhead(WRONG[WRP]);
  await swapToIndex(WRONG[WRP],{resetSelections:true});
} else if(FIN){
  await showFinal();
} else{
  await prefetchQuestion(CUR);
  await prefetchAhead(CUR);
  await swapToIndex(CUR,{resetSelections:false});
}

D.body.classList.remove("page-loading");
blurActive();

/* ============ Failsafe segmente bară finală ============ */
(function(){ const o=$(".chapter-progress-bar-outer"); if(!o) return;
  if(!$(".chapter-final-screen .progress-green")){ const s=D.createElement("span"); s.className="progress-green"; o.appendChild(s); }
  if(!$(".chapter-final-screen .progress-red"))  { const s=D.createElement("span"); s.className="progress-red";   o.appendChild(s); }
  if(!$(".chapter-final-screen .progress-gap"))  { const s=D.createElement("span"); s.className="progress-gap";   o.appendChild(s); }
})();

}); // end Webflow.push
