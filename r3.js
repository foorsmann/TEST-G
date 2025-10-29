window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* ---------- Utils mici ---------- */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0");
const HAS_PLYR=!!(W&&W.Plyr);
const rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");
function blurActive(){try{const ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch(_){}}

/* Loader gating */
D.body.classList.add("page-loading");
(function(){const l=$(".lesson-loader"); if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
})();

/* ---------- Helpers UI ---------- */
function isVisible(el){
  if(!el) return false;
  const cs=getComputedStyle(el);
  return cs.display!=="none" && cs.visibility!=="hidden" && cs.opacity!=="0";
}
function bindPressFeedback(header,content){
  if(!header||header.dataset.pressBound==='1') return;
  const add=()=>{header.classList.add('is-pressed'); content&&content.classList.add('is-pressed');};
  const rm =()=>{header.classList.remove('is-pressed'); content&&content.classList.remove('is-pressed');};
  header.addEventListener('pointerdown',e=>{if(e.button===0||e.button===undefined) add();},{passive:true});
  header.addEventListener('pointerup',rm,{passive:true});
  header.addEventListener('pointercancel',rm,{passive:true});
  header.addEventListener('pointerleave',rm,{passive:true});
  header.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter') add();});
  header.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter') rm();});
  header.addEventListener('click',()=>{setTimeout(rm,90)},{passive:true});
  header.dataset.pressBound='1';
}

/* ---------- Firebase / context ---------- */
const params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); return; }
const auth=firebase.auth(),db=firebase.firestore();

const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie sa fii autentificat."); location.href="/login"; return; }

/* Single Active Lock (dacă e disponibil) — neschimbat */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* ---------- Elementele principale ---------- */
const QSEC=$(".question-section");
const FINAL=$(".chapter-final-screen");
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

/* Sunete / toast */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}

const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{
    AWrap.classList.remove("active");
    alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);
  },dur);
}
function hideAlertBox(){ if(!AWrap) return; if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;} AWrap.classList.remove("active");AWrap.style.display="none"; }
const vibrateShort=()=>{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(50); };

/* Mic haptic pe acțiuni frecvente */
D.body.addEventListener("click",e=>{
  if(e.target.closest(".custom-accordion-header,.back-btn,.next-chapter-btn,.reset-chapter-btn,.confirm-reset-chapter,.back-to-chapter-final-screen,.close-btn")) vibrateShort();
});

/* Texte statice feedback */
const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Greșit. Răspuns corect -","Nu e bine. Răspuns corect -","Din păcate, nu. Răspuns corect -","Mai încearcă. Răspuns corect -","Alegere greșită. Răspuns corect -","Nu e varianta bună. Răspuns corect -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

/* Sanitizare conținut — avem patch global, nu dublăm aici */
const SANITIZE_CONTENT=false;
const sanitizeMaybe=html=>html||"";

/* ---------- Firestore: capitol + total întrebări ---------- */
const chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu există în baza de date!"); return; }
const chapterName=chapterDoc.data().Name;
async function getTotalCount(){
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s.size;
}
const TOTAL=await getTotalCount();

/* Rute colecții (progres + răspunsuri) */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* ---------- Segmente bară finală + procent ---------- */
const chapterTextFinal=$(".chapter-text-final"),
      progressCounterFinal=$(".progress-counter-final"),
      barOuterFinal=$(".chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),
    barRedFinal  =$(".chapter-final-screen .progress-red"),
    barGapFinal  =$(".chapter-final-screen .progress-gap");

if(progressCounterFinal){ /* ascundem procentul vechi — deja în CSS */ }

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
  if(progressCounterFinal){
    setFinalPercent("0%");
    const start=performance.now();
    const step=ts=>{
      const p=Math.min((ts-start)/d,1),val=Math.round(p*(+cPct||0));
      setFinalPercent(val+"%");
      if(p<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  requestAnimationFrame(()=>{ setTimeout(()=>{ barOuterFinal.style.width=`${answeredPct}%`; },40); });
}

/* ---------- State + wrong-mode ---------- */
let BUF={},SEL=[],ANSW=false; let CUR=1,FIN=false; let WRONG=[],WRMODE=false,WRP=0;
let WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;
let WRONG_STARTED_AT_MS=0;
const LS_WRONG_KEY=`wm:${user.uid}:${CHAP}`;

/* Persistență wrong-mode (Firestore + localStorage fallback) */
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
    if(wm&&wm.active){ out={active:!!wm.active,list:(wm.list||[]).map(v=>+v).filter(Number.isFinite),pos:+wm.pos||0,startedAtMs:+wm.startedAtMs||0}; }
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

/* ---------- Prefetch / imagini ---------- */
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
  if(snap.empty){
    try{ snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get(); }catch(_){}
  }
  if(snap.empty) return;
  const data=snap.docs[0].data(); BUF[idx]=data;
  if(data.Image){
    try{ const {ready}=primeImage(data.Image,{priority:"auto"}); BUF[idx].__imgReady=ready; ready.catch(()=>{}); }
    catch(_){ BUF[idx].__imgReady=Promise.resolve(); }
  } else BUF[idx].__imgReady=Promise.resolve();
}
async function prefetchMany(indices,priorityMap={}){
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]); if(!list.length) return;
  try{
    const qs=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","in",list.slice(0,10)).get();
    qs.forEach(doc=>{
      const d=doc.data(),i=d.Index; if(!i||BUF[i]) return; BUF[i]=d;
      if(d.Image){
        const pr=priorityMap[i]||"low";
        try{ const {ready}=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=ready; ready.catch(()=>{}); }
        catch(_){ BUF[i].__imgReady=Promise.resolve(); }
      } else BUF[i].__imgReady=Promise.resolve();
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

/* Curățare BUF — ținem doar ce e aproape (inclusiv în wrong-mode) */
function pruneBUF(){
  const keep=new Set();
  if(!WRMODE){
    const near=[CUR-1,CUR,CUR+1,CUR+2];
    for(const j of near){ if(j>0 && j<=TOTAL) keep.add(j); }
  }else{
    const near=[WRONG[WRP-1],WRONG[WRP],WRONG[WRP+1],WRONG[WRP+2]];
    for(const j of near){ if(typeof j==="number") keep.add(j); }
  }
  for(const k of Object.keys(BUF)){
    const j=+k;
    if(!keep.has(j)) delete BUF[j];
  }
}

/* ---------- A/B buffers (instant swap) + hidratare tolerantă ---------- */
const shell=$('.question-shell-w')||QSEC||D.body;
const wrapA=shell?.querySelector?.('.question-wrapper-A')||null;
const wrapB=shell?.querySelector?.('.question-wrapper-B')||null;
const singleWrap=shell?.querySelector?.('.question-wrapper')||null;
const bufferMode=!!(wrapA&&wrapB);

if(bufferMode){
  wrapA.classList.add('active'); /* începem cu A activ */
  wrapB.classList.remove('active');
}else if(singleWrap){
  singleWrap.classList.add('active'); /* fallback single */
}

function getScrollParent(el){
  const qwi=el?.closest?.(".question-wrapper-inner"); if(qwi) return qwi;
  let p=el?.parentElement;
  while(p){
    const s=getComputedStyle(p),oy=s.overflowY;
    if(oy==="auto"||"scroll"===oy||"overlay"===oy) return p;
    p=p.parentElement;
  }
  return document.scrollingElement||document.documentElement;
}
function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function scrollContainerToAnchor(target,container,{behavior="smooth",offset=0,delay=0}={}){
  if(!target) return;
  const c=container||getScrollParent(target);
  const isWin=(c===document.scrollingElement||c===document.documentElement||c===document.body);
  const getTop=()=> (isWin?target.getBoundingClientRect().top:(target.getBoundingClientRect().top - c.getBoundingClientRect().top)) + (isWin?window.pageYOffset:c.scrollTop) - offset;
  const to=Math.max(0,Math.round(getTop()));
  if(behavior!=="smooth"){ isWin?window.scrollTo(0,to):c.scrollTop=to; return; }
  const start=isWin?window.pageYOffset:c.scrollTop,dist=to-start,dur=400; let st=null;
  const step=ts=>{ if(!st) st=ts; const p=Math.min((ts-st)/dur,1),y=Math.round(start+dist*easeInOut(p)); isWin?window.scrollTo(0,y):c.scrollTop=y; if(p<1) requestAnimationFrame(step); };
  delay?setTimeout(()=>requestAnimationFrame(step),delay):requestAnimationFrame(step);
}

/* Colector de referințe dintr-un wrapper dat (A/B sau single) */
function collectRefs(root){
  if(!root) return null;
  const need=(sel)=>root.querySelector(sel);
  const out={
    root,
    qEl: need(".questions-collection-list-item")||root,
    qWrap: need(".question-wrapper")||root,  /* compat: A/B au class diferită dar selectăm oricum */
    anchorTop: need(".explanation-anchor-top")||null,
    qText: need(".question-text"),
    progress: need(".progress-counter"),
    mainWrap: need(".main-content-wrapper"),
    optWrap: need(".options-wrapper"),
    cards: [],
    items: [],
    imgWrap: need(".question-image-wrapper"),
    img: need(".question-image"),
    videoWrap: need(".explanation-video-wrapper")||null,
    /* desktop */
    buttonsWrap: need(".submit-next-buttons")||null,
    submitBtn: null,
    explainBtn: null,
    aiBtn: null,
    /* mobil */
    buttonsWrapMobile: need(".submit-next-buttons-mobile")||null,
    submitBtnMobile: null,
    explainBtnMobile: null,
    aiBtnMobile: null,
    /* accordion */
    acc: need(".custom-accordion")||null,
    accHeader: null,
    accArrow: null,
    accContent: null,
    accBody: null,
    expLabelEl: null,
    accAnchor: null,
    /* feedback */
    feedbackWrap: (QSEC||document).querySelector(".feedback-wrapper"),
    staticText: null,
    correctAns: null,
    /* ancore supl. */
    anchor: need(".explanation-anchor")||null
  };

  /* opțiuni */
  out.cards = Array.from(out.optWrap?.querySelectorAll(".option-card")||[]);
  out.items = out.cards.map(c=>c.querySelector(".option-item"));

  /* butoane desktop */
  if(out.buttonsWrap){
    out.submitBtn = out.buttonsWrap.querySelector(".submit-btn");
    out.explainBtn = out.buttonsWrap.querySelector(".explanation-btn")||out.buttonsWrap.querySelector(".explanation-card");
    out.aiBtn = out.buttonsWrap.querySelector(".ask-ai-btn")||out.buttonsWrap.querySelector(".ai-pop-wrapper");
  }
  /* butoane mobil */
  if(out.buttonsWrapMobile){
    out.submitBtnMobile = out.buttonsWrapMobile.querySelector(".submit-btn-mobile")||out.buttonsWrapMobile.querySelector(".submit-btn")||null;
    out.explainBtnMobile = out.buttonsWrapMobile.querySelector(".explanation-btn-mobile")||out.buttonsWrapMobile.querySelector(".explanation-btn")||null;
    out.aiBtnMobile = out.buttonsWrapMobile.querySelector(".ask-ai-btn-mobile")||out.buttonsWrapMobile.querySelector(".ask-ai-btn")||null;
  }

  /* accordion */
  out.accHeader = out.acc?.querySelector(".custom-accordion-header")||null;
  out.accArrow  = out.acc?.querySelector(".custom-accordion-arrow")||null;
  out.accContent= out.acc?.querySelector(".custom-accordion-content")||null;
  out.accBody   = out.acc?.querySelector(".custom-accordion-body")||null;
  out.expLabelEl= out.acc?.querySelector(".custom-accordion-label")||null;
  out.accAnchor = out.acc?.querySelector(".accordion-anchor")||null;

  /* feedback global (în afara wrapperelor) */
  if(out.feedbackWrap){
    out.staticText = out.feedbackWrap.querySelector(".correct-answer-static");
    out.correctAns = out.feedbackWrap.querySelector(".correct-answer");
  }
  return out;
}

/* Refs pentru A/B sau single */
let refsA=bufferMode?collectRefs(wrapA):null;
let refsB=bufferMode?collectRefs(wrapB):null;
let refs =bufferMode?refsA:collectRefs(singleWrap||wrapA||wrapB||document);

/* Hidratare tolerantă: acceptă existența DOAR a grupului desktop sau DOAR a grupului mobil */
function hydrateCheck(r){
  if(!r) return false;
  if(!r.qText) return false;
  if(!r.progress) return false;
  if(!r.mainWrap) return false;
  if(!r.optWrap) return false;
  if(!r.cards || !r.cards.length) return false;
  /* Butoane: cel puțin un grup (desktop SAU mobil) trebuie să existe */
  const hasDesktop= !!(r.buttonsWrap && r.submitBtn);
  const hasMobile = !!(r.buttonsWrapMobile && (r.submitBtnMobile||r.buttonsWrapMobile.querySelector(".submit-btn")));
  if(!hasDesktop && !hasMobile) return false;
  return true;
}

/* Aplică label standard pe butoanele AI (desktop+mobil) */
function forceAIChatText(btn){
  if(!btn) return;
  btn.textContent="AI CHAT";
  btn.setAttribute("aria-label","AI CHAT");
  btn.setAttribute("role","button");
}
function applyAIChatText(){
  forceAIChatText(refs?.aiBtn);
  forceAIChatText(refs?.aiBtnMobile);
}

/* Vizibilitate inițială + loader off */
function revealNow(){
  D.body.classList.remove("page-loading");
  blurActive();
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
}

/* ---------- Helpers opțiuni ---------- */
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
    card.classList.remove("selected");
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

/* ---------- Explicații (UI sync desktop+mobil) ---------- */
function isExplanationOpen(){
  const accOpen = !!(refs?.acc && refs.acc.style.display!=="none" && (refs.acc.classList.contains("open") || (refs.accContent && refs.accContent.style.maxHeight && refs.accContent.style.maxHeight!=="0px")));
  const videoShown = !!(refs?.videoWrap && refs.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(open){
  const setOpen = (btn)=>{ if(!btn) return; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
  const setClosed = (btn)=>{ if(!btn) return; btn.textContent="EXPLICAȚIE"; };
  if(open){ setOpen(refs?.explainBtn); setOpen(refs?.explainBtnMobile); }
  else{ setClosed(refs?.explainBtn); setClosed(refs?.explainBtnMobile); }
}

/* ---------- Ecran final + pregătire WRONG ---------- */
async function showFinal(){
  if(chapterTextFinal) chapterTextFinal.textContent=chapterName;
  const answersSnap=await ansCollection.where("chapterSlug","==",CHAP).get();

  const resetWrongBtn=$(".reset-wrong-questions-only");
  if(resetWrongBtn){
    resetWrongBtn.style.display="none";
    let hasWrong=false;
    answersSnap.forEach(doc=>{
      const d=doc.data();
      const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
      if(sel&&sel!==cor) hasWrong=true;
    });
    if(hasWrong) resetWrongBtn.style.display="flex";
  }

  let correct=0,wrong=0;
  answersSnap.forEach(doc=>{
    const d=doc.data();
    const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
    if(sel&&sel===cor) correct++; else if(sel) wrong++;
  });
  const safeTotal=(TOTAL&&TOTAL>0)?TOTAL:Math.max(1,correct+wrong);
  const cPct=Math.round((correct/safeTotal)*100),wPct=Math.round((wrong/safeTotal)*100);

  document.querySelector(".lesson-loader")?.style.setProperty("display","none","important");
  ensureFinalPercentEl(); setFinalPercent("0%");
  animateFinalProgress(cPct,wPct,ANIM_DUR);
  FINAL?.style.setProperty("display","flex","important");

  /* PREP wrong list + prefetch + decode pentru prima întrebare */
  try{
    const pool=[], snap2=await ansCollection.where("chapterSlug","==",CHAP).get();
    snap2.forEach(doc=>{
      const d=doc.data(),sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
      if(sel&&sel!==cor){
        let idx=d.index;
        if(typeof idx!=="number"){ const asNum=parseInt(idx,10); if(Number.isFinite(asNum)) idx=asNum; }
        if(typeof idx!=="number"){ const m=String(doc.id||"").match(/_(\d+)$/); if(m) idx=parseInt(m[1],10); }
        if(typeof idx==="number"&&Number.isFinite(idx)) pool.push(idx);
      }
    });
    WRONG_PREPARED=[...new Set(pool)].sort((a,b)=>a-b);
    WRONG_PREPARED_READY=false;
    if(WRONG_PREPARED.length){
      const prio={}; prio[WRONG_PREPARED[0]]="auto";
      prefetchMany(WRONG_PREPARED,prio).finally(()=>{WRONG_PREPARED_READY=true;});
    }else WRONG_PREPARED_READY=true;
  }catch(_){ WRONG_PREPARED=[]; WRONG_PREPARED_READY=true; }
}

/* ---------- Setări butoane (desktop+mobil) ---------- */
function setSubmitState(btn,state,{affectLayout=true}={}){
  if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify":
      btn.textContent="VERIFICĂ";
      btn.classList.add("is-verify","_preload-full");
      if(affectLayout) btn.style.gridColumn="1 / 2";
      break;
    case "next": {
      const last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZĂ":"CONTINUĂ";
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
    }
    case "finish":
      btn.textContent="FINALIZEAZĂ";
      btn.classList.add("is-finish","finish-chapter-btn");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
  }
}
function setSubmitStateBoth(state){
  setSubmitState(refs?.submitBtn, state, {affectLayout:true});          /* Desktop */
  setSubmitState(refs?.submitBtnMobile, state, {affectLayout:false});   /* Mobil */
}
function setSingleBtnState(on){
  if(refs?.buttonsWrap) refs.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(refs?.submitBtn) refs.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(refs?.submitBtn) refs.submitBtn.style.removeProperty("grid-column"); }
}

/* ---------- Media / imagine / video ---------- */
function stopActiveMedia(){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  const lottieEl=refs?.qEl?.querySelector(".lottie-animation-correct");
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  const v=refs?.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
}
function applyNoImageState(on, r=refs){
  if(!r?.optWrap || !r?.qEl) return;
  if(on){
    r.qEl.classList.add("no-image");
    r.optWrap.style.minHeight="40vh";
    if(r.imgWrap) r.imgWrap.style.display="none";
  }else{
    r.qEl.classList.remove("no-image");
    r.optWrap.style.minHeight="";
    if(r.imgWrap) r.imgWrap.style.display="";
  }
}
async function seamlessSetImage(url,r=refs){
  if(!r?.img){ applyNoImageState(true,r); return; }
  if(!url){
    r.img.removeAttribute("src");
    r.img.style.display="none";
    r.img.setAttribute("aria-hidden","true");
    applyNoImageState(true,r);
    return;
  }
  try{
    const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
    tmp.src=url;
    if(tmp.decode) await tmp.decode(); else await new Promise(res=>{tmp.onload=tmp.onerror=res;});
  }catch(_){}
  if(r.img.src!==url) r.img.src=url;
  r.img.style.display="";
  r.img.removeAttribute("aria-hidden");
  applyNoImageState(false,r);
  r.img.onerror=()=>{
    r.img.removeAttribute("src");
    r.img.style.display="none";
    r.img.setAttribute("aria-hidden","true");
    applyNoImageState(true,r);
  };
}
function setVideoBlock(url,r=refs){
  if(!r?.videoWrap) return;
  r.videoWrap.innerHTML=""; r.videoWrap.style.display="none"; if(!url) return;
  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html=`<video class="explanation-video plyr-player" controls playsinline><source src="${url}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); const yt=m?m[1]:"";
    if(yt) html=`<div class="plyr__video-embed"><iframe src="https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0" allowfullscreen allowtransparency allow="autoplay"></iframe></div>`;
  }
  if(!html) return;
  r.videoWrap.innerHTML=html; r.videoWrap.style.display="none";
  const playerEl=r.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    if(HAS_PLYR&&playerEl.plyr){
      playerEl.addEventListener("click",e=>{
        if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return;
        e.stopPropagation();
        try{ playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play(); }catch(_){}
      });
    }else{
      playerEl.addEventListener("click",e=>{
        if(e.target.tagName==="BUTTON") return;
        e.stopPropagation();
        try{ playerEl.paused?playerEl.play():playerEl.pause(); }catch(_){}
      });
    }
    playerEl._hasUserPlayed=false; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false;
    playerEl.addEventListener("play",()=>{ playerEl._hasUserPlayed=true; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false; });

    const scroller=r.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(r.qEl)||null, vw=r.videoWrap;
    try{ vw.__observerInstance?.disconnect?.(); }catch(_){}
    if(scroller){
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
      obs.observe(playerEl.parentElement||playerEl); vw.__observerInstance=obs;
    }
  }
}

/* ---------- A/B: colectăm și legăm evenimente pe wrapperul curent ---------- */
function bindCardClicks(r){
  if(!r?.cards) return;
  r.cards.forEach(card=>{
    if(card.dataset.boundSel==='1') return;
    card.addEventListener("click",()=>{
      if(ANSW) return;
      vibrateShort();
      const L=getLetterFromCard(card); if(!L) return;
      SEL=SEL.includes(L)?SEL.filter(x=>x!==L):SEL.concat(L);
      applySelectedVisualsFromSEL(r.qEl); hideAlertBox();
    },{passive:true});
    card.dataset.boundSel='1';
  });
}
function bindAccordion(r){
  if(r?.accHeader && !r.accHeader.dataset.boundAcc){
    bindPressFeedback(r.accHeader,r.accContent);
    r.accHeader.addEventListener("click",async()=>{
      const acc=r.acc, c=r.accContent; if(!acc) return;
      const opening=!acc.classList.contains("open");
      acc.classList.toggle("open", opening);
      if(opening){
        if(c){
          const prev=c.style.transition;
          c.style.display="block"; c.style.transition="none"; c.style.maxHeight="";
          try{
            const imgs=[...c.querySelectorAll("img")];
            if(imgs.length) await Promise.all(imgs.map(im=>im.decode?im.decode():Promise.resolve())).catch(()=>{});
          }catch(_){}
          const h=c.scrollHeight+"px";
          c.style.maxHeight=h; void c.offsetHeight;
          const scroller=acc.closest(".question-wrapper-inner")||getScrollParent(acc);
          const target=r.accAnchor||r.anchor;
          if(target) scrollContainerToAnchor(target,scroller,{behavior:"smooth"});
          requestAnimationFrame(()=>{ c.style.transition=prev||""; });
        }
      }else{
        if(r.accContent){ r.accContent.style.maxHeight="0px"; }
      }
    });
    r.accHeader.dataset.boundAcc='1';
  }
}
function bindExplainAndAI(r){
  const onExplainClick=()=>{
    vibrateShort();
    const opening = !isExplanationOpen();
    const scroller=r.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(r.qEl);
    if(opening){
      if(r.videoWrap){ r.videoWrap.style.display="block"; const v=r.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
      if(r.acc){ r.acc.style.display="block"; r.acc.classList.remove("open"); if(r.accContent) r.accContent.style.maxHeight="0px"; }
      renderExplainBtnUI(true);
      scrollContainerToAnchor(r.anchor,scroller,{behavior:"smooth"});
    }else{
      const v=r.videoWrap?.querySelector("video");
      if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
      if(r.videoWrap) r.videoWrap.style.display="none";
      if(r.acc){ r.acc.classList.remove("open"); r.acc.style.display="none"; if(r.accContent) r.accContent.style.maxHeight="0px"; }
      if(r.accArrow){ try{ r.accArrow.style.removeProperty("transform"); }catch(_){ } }
      renderExplainBtnUI(false);
      scrollContainerToAnchor(r.anchorTop,scroller,{behavior:"smooth"});
    }
  };
  if(r.explainBtn && !r.explainBtn.dataset.boundExp){
    r.explainBtn.addEventListener("click", onExplainClick);
    r.explainBtn.dataset.boundExp='1';
  }
  if(r.explainBtnMobile && !r.explainBtnMobile.dataset.boundExp){
    r.explainBtnMobile.addEventListener("click", onExplainClick);
    r.explainBtnMobile.dataset.boundExp='1';
  }

  const onAiClick=()=>{
    vibrateShort();
    const v=r.videoWrap?.querySelector("video");
    if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
    ensureAIPop().style.display="flex"; document.body.style.overflow="hidden";
  };
  if(r.aiBtn && !r.aiBtn.dataset.boundAi){
    r.aiBtn.addEventListener("click", onAiClick);
    r.aiBtn.dataset.boundAi='1';
  }
  if(r.aiBtnMobile && !r.aiBtnMobile.dataset.boundAi){
    r.aiBtnMobile.addEventListener("click", onAiClick);
    r.aiBtnMobile.dataset.boundAi='1';
  }
}

/* AI pop-up minimalist (comun) */
let AIPop=null;
function ensureAIPop(){
  if(AIPop) return AIPop;
  AIPop=document.querySelector(".ask-ai-pop-up");
  if(!AIPop){
    AIPop=document.createElement("div"); AIPop.className="ask-ai-pop-up";
    Object.assign(AIPop.style,{display:"none",position:"fixed",inset:"0",justifyContent:"center",alignItems:"center",background:"rgba(0,0,0,.5)",backdropFilter:"blur(2px)",zIndex:"2147483647"});
    const box=document.createElement("div"); box.className="audio-btn";
    Object.assign(box.style,{display:"flex",gap:"12px",alignItems:"center",background:"#121212",padding:"16px 20px",borderRadius:"12px",border:"1px solid #2a2a2a"});
    const mic=document.createElement("div"); mic.className="mic-icon-ai"; Object.assign(mic.style,{width:"36px",height:"36px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",overflow:"hidden"});
    const img=document.createElement("img"); img.alt="AI"; img.src="https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/685c48b463b6d0ce30731509_ChatGPT%20Image%20Jun%2020%2C%202025%2C%2001_39_41%20PM.png"; img.style.width="100%"; img.style.height="100%"; img.style.objectFit="cover"; mic.appendChild(img);
    const audioBtn=document.createElement("button"); audioBtn.className="audio-ai-btn"; audioBtn.textContent="Audio AI"; Object.assign(audioBtn.style,{padding:"10px 14px",borderRadius:"10px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    const closeBtn=document.createElement("button"); closeBtn.className="ask-ai-pop-up-close"; closeBtn.textContent="Închide"; Object.assign(closeBtn.style,{marginLeft:"8px",padding:"8px 12px",borderRadius:"8px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    box.append(mic,audioBtn,closeBtn); AIPop.appendChild(box); document.body.appendChild(AIPop);
  }
  AIPop.addEventListener("click",e=>{
    if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){
      vibrateShort(); AIPop.style.display="none"; document.body.style.overflow="";
    }
  });
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS */ });
  return AIPop;
}

/* ---------- A/B: SWAP instant + updateInPlace pe bufferul țintă ---------- */
let activeBuf = bufferMode ? 'A' : 'S';  // 'A' / 'B' / 'S'(single)
function currentRefs(){ return bufferMode ? (activeBuf==='A'?refsA:refsB) : refs; }
function otherRefs(){   return bufferMode ? (activeBuf==='A'?refsB:refsA) : refs; }
function showActiveInstant(){
  if(bufferMode){
    if(activeBuf==='A'){ wrapA.classList.add('active'); wrapB.classList.remove('active'); }
    else{ wrapB.classList.add('active'); wrapA.classList.remove('active'); }
  }else{
    (singleWrap||wrapA||wrapB)?.classList.add('active');
  }
}
function swapBuffersInstant(){
  if(!bufferMode) return;
  activeBuf = (activeBuf==='A'?'B':'A');
  showActiveInstant();
  refs = currentRefs();  /* menținem 'refs' mereu pe activ */
}

/* Repară eventuale suprascrieri ciudate la style.setProperty (caz izolat) */
function __repairStyleSetProperty(el){
  try{ if(el && el.style && typeof el.style.setProperty !== "function"){ delete el.style.setProperty; } }catch(_){}
}

/* Hidratare inițială (acceptăm desktop OR mobil) + legări evenimente */
function hydrateBuffer(r){
  if(!hydrateCheck(r)) return false;

  // Forțează eticheta AI
  applyAIChatText();

  if(r.accArrow){ try{ r.accArrow.style.removeProperty("transform"); }catch(_){ } }

  bindCardClicks(r);
  bindAccordion(r);
  bindExplainAndAI(r);

  return true;
}


/* Blocare/deblocare butoane în timpul tranzițiilor logice */
let transitioning=false;
function setButtonsTransitionLock(on){
  transitioning=!!on;
  const r=refs;
  if(r?.submitBtn){ r.submitBtn.setAttribute("aria-disabled",on?"true":"false"); r.submitBtn.classList.toggle("is-disabled",on); }
  if(r?.submitBtnMobile){ r.submitBtnMobile.setAttribute("aria-disabled",on?"true":"false"); r.submitBtnMobile.classList.toggle("is-disabled",on); }
  if(r?.buttonsWrap){ on ? r.buttonsWrap.style.setProperty("pointer-events","none","important") : r.buttonsWrap.style.removeProperty("pointer-events"); }
  if(r?.buttonsWrapMobile){ on ? r.buttonsWrapMobile.style.setProperty("pointer-events","none","important") : r.buttonsWrapMobile.style.removeProperty("pointer-events"); }
}

/* Utilitar: litere corecte din întrebare */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"")
    .split(",")
    .map(x=>String(x||"").trim().toUpperCase())
    .filter(x=>x==="A"||x==="B"||x==="C");
}

/* Active index în funcție de mod */
const getActiveIndex=()=> WRMODE?WRONG[WRP]:CUR;

/* ============ UPDATE IN PLACE (în bufferul inactiv) + SWAP INSTANT ============ */
async function updateInPlace(idx,{resetSelections=false}={}){
  const q=BUF[idx];
  if(!q){ await showFinal(); return; }

  /* 1) Randăm în bufferul inactiv (sau în singurul wrapper) */
  const targetRefs = bufferMode ? otherRefs() : refs;
  if(!targetRefs) return;

  setButtonsTransitionLock(true);

  /* header capitol + progress */
  (targetRefs.qEl.querySelector(".chapter-text")||document.createElement("div")).textContent=chapterName;
  targetRefs.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(CUR)}/${pad2(TOTAL)}`;

  /* întrebarea + opțiuni */
  targetRefs.qText.innerHTML="";
  targetRefs.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(q.Question||""));
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  targetRefs.cards.forEach((card,i)=>{
    const it=targetRefs.items[i];
    const val=vals[i]||"";
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });

  /* explicație scrisă */
  if(targetRefs.accBody){
    targetRefs.accBody.innerHTML="";
    const ex=q["Explanation"]||"";
    if(ex) targetRefs.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }

  /* feedback și butoane Explicație/AI invizibile până după verificare */
  if(refs?.feedbackWrap){ refs.feedbackWrap.style.display="none"; }
  if(refs?.staticText) refs.staticText.textContent="Răspunsul corect este:";
  if(refs?.correctAns) refs.correctAns.textContent="";

  const hideBtns = (r)=>{
    if(r.explainBtn) r.explainBtn.style.display="none";
    if(r.explainBtnMobile) r.explainBtnMobile.style.display="none";
    if(r.aiBtn) r.aiBtn.style.display="none";
    if(r.aiBtnMobile) r.aiBtnMobile.style.display="none";
  };
  hideBtns(targetRefs);
  renderExplainBtnUI(false);

  /* pliuri închise */
  if(targetRefs.acc){ targetRefs.acc.style.display="none"; targetRefs.acc.classList.remove("open"); if(targetRefs.accContent) targetRefs.accContent.style.maxHeight="0px"; }
  if(targetRefs.accArrow){ try{ targetRefs.accArrow.style.removeProperty("transform"); }catch(_){ } }

  /* video & imagine (pregătite înainte de swap) */
  setVideoBlock(q["Explanation Video Link"]||"",targetRefs);
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(q.Image,targetRefs); } else { await seamlessSetImage("",targetRefs); }

  /* selecții curente */
  SEL = resetSelections ? [] : SEL;
  ANSW=false;
  clearLetterStates(targetRefs.qEl);
  clearAllSelected(targetRefs.qEl);
  clearWrongCards(targetRefs.qEl);

  /* desktop: un singur buton la început; mobil: lăsăm layout Webflow */
  setSingleBtnState(true);
  setSubmitStateBoth("verify");

  /* 2) SWAP INSTANT în bufferul nou pregătit */
  if(bufferMode){
    swapBuffersInstant();      /* comută .active între A/B și actualizează „refs” => devine targetul */
  }else{
    refs = targetRefs;         /* single wrapper */
  }

  /* 3) Restaurare stare „verificată” (dacă există în Firestore) — condiționată de sesiunea wrong-mode */
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
        applySelectedVisualsFromSEL(refs.qEl);
        ANSW=true;

        clearLetterStates(refs.qEl);
        applyLetterStatesByCorrect(refs.qEl,corSaved);
        clearWrongCards(refs.qEl);
        applyWrongCardsByCorrect(refs.qEl,corSaved);

        const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
        if(refs.staticText) refs.staticText.textContent=same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
        const ord=["A","B","C"].filter(x=>corSaved.includes(x));
        if(refs.correctAns) refs.correctAns.textContent=ord.join(", ");

        if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","flex","important");
        if(refs.explainBtn) refs.explainBtn.style.setProperty("display","flex","important");
        if(refs.explainBtnMobile) refs.explainBtnMobile.style.setProperty("display","flex","important");
        if(refs.aiBtn) refs.aiBtn.style.setProperty("display","flex","important");
        if(refs.aiBtnMobile) refs.aiBtnMobile.style.setProperty("display","flex","important");
        applyAIChatText();

        setSingleBtnState(false);
        const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
        setSubmitStateBoth((lastWrong||lastNormal)?"finish":"next");
      }
    }
  }catch(e){ console.warn("Restore answer failed:",e); }

  setButtonsTransitionLock(false);
}

/* ============ WRONG MODE ============ */
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

async function startWrongModeSafe(){
  if(START_WRONG_IN_PROGRESS) return;
  START_WRONG_IN_PROGRESS=true;
  vibrateShort(); stopActiveMedia();

  const loaderEl=document.querySelector(".lesson-loader");
  if(loaderEl) loaderEl.style.setProperty("display","flex","important");
  document.body.classList.add("page-loading");
  FINAL?.style.setProperty("display","none","important");
  if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

  try{
    let list=(WRONG_PREPARED_READY?WRONG_PREPARED:null);
    if(!list||!list.length) list=await buildWrongListNow();

    if(!list.length){
      alert("Nu ai nicio întrebare greșită de refăcut la acest capitol!");
      if(loaderEl) loaderEl.style.setProperty("display","none","important");
      FINAL?.style.setProperty("display","flex","important");
      document.body.classList.remove("page-loading");
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
    pruneBUF();

    SEL=[]; ANSW=false;
    await updateInPlace(WRONG[WRP],{resetSelections:true});
    await prefetchAhead(WRONG[WRP]||0);

  }catch(e){
    console.error("EROARE la wrong-mode (safe):",e);
    alert("A apărut o eroare la încărcarea întrebărilor greșite.");
    FINAL?.style.setProperty("display","flex","important");
  }finally{
    if(loaderEl) loaderEl.style.setProperty("display","none","important");
    document.body.classList.remove("page-loading");
    START_WRONG_IN_PROGRESS=false;
  }
}

/* ============ NEXT CHAPTER helper ============ */
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

/* ============ SUBMIT/NEXT/FINISH (desktop + mobil) ============ */
QSEC?.addEventListener("click",async(e)=>{
  const submitBtn=e.target.closest(".submit-btn, .submit-btn-mobile");
  if(!submitBtn) return;
  e.preventDefault(); vibrateShort();

  const idx=getActiveIndex();
  const isVerify=submitBtn.classList.contains("is-verify"),
        isFinish=submitBtn.classList.contains("is-finish")||submitBtn.classList.contains("finish-chapter-btn"),
        isNext=submitBtn.classList.contains("is-next");

  if(isFinish && ANSW){
    stopActiveMedia();
    try{ await progRef.set({currentIndex:CUR,finished:true},{merge:true}); }catch(_){}
    WRMODE=false; await clearWrongModePersist(); await showFinal(); return;
  }

  if(isNext && ANSW){
    stopActiveMedia(); setButtonsTransitionLock(true);
    if(WRMODE){
      WRP++;
      if(WRP>=WRONG.length){
        WRMODE=false;
        try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await clearWrongModePersist();
        await showFinal(); setButtonsTransitionLock(false); return;
      }
      await persistWrongMode({active:true,list:WRONG,pos:WRP});
      await prefetchAhead(WRONG[WRP]||0); pruneBUF(); SEL=[]; ANSW=false;
      await updateInPlace(WRONG[WRP],{resetSelections:true}); setButtonsTransitionLock(false); return;
    }else{
      if(CUR<TOTAL){
        CUR++; try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}
        await prefetchAhead(CUR); pruneBUF(); SEL=[]; ANSW=false;
        await updateInPlace(CUR,{resetSelections:false});
      }else{
        try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await showFinal();
      }
      setButtonsTransitionLock(false);
      return;
    }
  }

  if(isVerify){
    if(SEL.length===0){
      toast("Selectează un răspuns!",1000);
      playOne(alertSound);
      setSingleBtnState(true);
      return;
    }
    const q=BUF[idx]; if(!q) return;
    const cor=parseCorrectLetters(q);
    ANSW=true;

    clearLetterStates(refs.qEl); applyLetterStatesByCorrect(refs.qEl,cor);
    clearWrongCards(refs.qEl);   applyWrongCardsByCorrect(refs.qEl,cor);

    const selected=SEL.slice().sort().join(","), correct=cor.slice().sort().join(","), isFullyCorrect=selected.length>0&&selected===correct;

    if(refs.staticText) refs.staticText.textContent=isFullyCorrect?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
    const ord=["A","B","C"].filter(x=>cor.includes(x));
    if(refs.correctAns) refs.correctAns.textContent=ord.join(", ");

    const lottieEl=refs.qEl.querySelector(".lottie-animation-correct");
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

    /* feedback + Explicație/AI vizibile */
    if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","flex","important");
    if(refs.explainBtn) refs.explainBtn.style.setProperty("display","flex","important");
    if(refs.explainBtnMobile) refs.explainBtnMobile.style.setProperty("display","flex","important");
    if(refs.aiBtn) refs.aiBtn.style.setProperty("display","flex","important");
    if(refs.aiBtnMobile) refs.aiBtnMobile.style.setProperty("display","flex","important");
    applyAIChatText();

    setSingleBtnState(false);
    const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
    setSubmitStateBoth((lastWrong||lastNormal)?"finish":"next");

    requestAnimationFrame(()=>{
      const scroller=refs.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(refs.qEl);
      scrollContainerToAnchor(refs.anchor,scroller,{behavior:"smooth"});
    });

    const nowMs=Date.now();
    Promise.all([
      ansCollection.doc(`${CHAP}_${idx}`).set({
        module:"mediu",chapterSlug:CHAP,index:idx,question:BUF[idx]?.Question||"",
        options:["A","B","C"].map(L=>({letter:L,value:BUF[idx]?.["Option "+L]||""})),
        selected:SEL.slice(),correct:cor.slice(),explanation:BUF[idx]?.["Explanation"]||"",
        answeredAt:firebase.firestore.FieldValue.serverTimestamp(),
        answeredAtMs: nowMs
      },{merge:true}),
      progRef.set({currentIndex:CUR,finished:false},{merge:true})
    ]).catch(err=>{
      console.error("Eroare salvare răspuns/progres:",err);
      toast("Conexiune slabă – încerc să salvez…",1200);
    });
  }
});

/* Enter = submit, Escape = închideri rapide */
function primarySubmitBtn(){
  if(refs?.submitBtnMobile && isVisible(refs.submitBtnMobile)) return refs.submitBtnMobile;
  return refs?.submitBtn || null;
}
document.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    const btn=primarySubmitBtn();
    if(btn){ e.preventDefault(); btn.click(); }
  }else if(e.key==="Escape"){
    try{
      document.querySelectorAll(".alert-wrapper-new.active").forEach(w=>{w.classList.remove("active"); w.style.display="none";});
      const aiPop=document.querySelector(".ask-ai-pop-up"); if(aiPop) aiPop.style.display="none";
      const loader=document.querySelector(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
      document.body.classList.remove("page-loading"); document.body.style.overflow="";
    }catch(_){}
  }
});

/* Delegări ecran final */
document.addEventListener("click",async e=>{
  if(e.target.closest(".reset-wrong-questions-only")){ await startWrongModeSafe(); return; }
  if(e.target.closest(".next-chapter-btn")){
    vibrateShort(); stopActiveMedia(); await clearWrongModePersist();
    const next=await getNextChapterSlug(); if(next) location.replace(`${location.pathname}?chapter=${encodeURIComponent(next)}`);
    return;
  }
  if(e.target.closest(".reset-chapter-btn")){ vibrateShort(); const aw=document.querySelector(".alert-wrapper"); if(aw) aw.style.display="flex"; return; }
  if(e.target.closest(".confirm-reset-chapter")){
    vibrateShort(); stopActiveMedia(); const aw=document.querySelector(".alert-wrapper");
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
    vibrateShort(); const aw=document.querySelector(".alert-wrapper"); if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important"); return;
  }
});

/* ============ INIT (reluare progres / wrong-mode / prefetch) ============ */
const progSnap=await progRef.get();
let CUR_FROM_DB=null, FIN_FROM_DB=false;
if(progSnap.exists){
  CUR_FROM_DB=progSnap.data().currentIndex||null;
  FIN_FROM_DB=!!progSnap.data().finished;
  if(CUR_FROM_DB) CUR=CUR_FROM_DB;
  if(FIN_FROM_DB) FIN=true;
}

/* Hidratare ambele buffere (sau single) — tolerant desktop/mobil */
let okA=true, okB=true, okS=true;
if(bufferMode){
  okA=hydrateBuffer(refsA);
  okB=hydrateBuffer(refsB);
}else{
  okS=hydrateBuffer(refs);
}
/* Nu mai alertăm „Structura nu e completă” — doar logăm și ieșim grațios */
if(!(okA&&okB) && bufferMode){ console.warn("[AUTOTEST] Structura minimă A/B nu e completă, verifică clasele HTML."); revealNow(); return; }
if(!okS && !bufferMode){ console.warn("[AUTOTEST] Structura minimă nu e completă, verifică clasele HTML."); revealNow(); return; }

/* Repară eventuale ciudățenii pe stiluri */
__repairStyleSetProperty(refs?.aiBtnMobile);

/* Reiau wrong-mode dacă există persistență activă */
const persistedWM=await loadWrongModePersist();
if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
  WRMODE=true; WRONG=persistedWM.list.slice(0); WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
  WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();
  await prefetchQuestion(WRONG[WRP]); await prefetchAhead(WRONG[WRP]); await updateInPlace(WRONG[WRP],{resetSelections:true}); revealNow();
}else if(FIN){
  await showFinal(); revealNow();
}else{
  await prefetchQuestion(CUR); await prefetchAhead(CUR); await updateInPlace(CUR,{resetSelections:false}); revealNow();
}

/* Siguranță: completăm segmentele din bara finală dacă lipsesc (idempotent) */
(function(){ const o=document.querySelector(".chapter-progress-bar-outer"); if(!o) return;
  if(!document.querySelector(".chapter-final-screen .progress-green")){ const s=document.createElement("span"); s.className="progress-green"; o.appendChild(s); }
  if(!document.querySelector(".chapter-final-screen .progress-red"))  { const s=document.createElement("span"); s.className="progress-red";   o.appendChild(s); }
  if(!document.querySelector(".chapter-final-screen .progress-gap"))  { const s=document.createElement("span"); s.className="progress-gap";   o.appendChild(s); }
})();

/* Failsafe final */
document.body.classList.remove("page-loading");
blurActive();

/* END Webflow.push */
}); /* end Webflow.push(async function(){ ... }) */

