window.Webflow = window.Webflow || [];
Webflow.push(async function(){
"use strict";

/* ==========================
   Flags & helpers generale
========================== */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const HAS_PLYR=!!(W&&W.Plyr);
const rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const pad2=n=>String(n).padStart(2,"0");
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");

/* Telemetrie soft doar în DEV (nu trimite nicăieri) */
const DEBUG=false;
const log=(...args)=>{ if(DEBUG) console.log("[MEDIU]",...args); };

/* I18n minimal – centralizează textele */
const I18N_RO={
  verify:"VERIFICĂ",
  continue:"CONTINUĂ",
  finish:"FINALIZEAZĂ",
  select_answer:"Selectează un răspuns!",
  correct_label:"Răspunsul corect este:",
  ai_chat:"AI CHAT",
  must_login:"Trebuie să fii autentificat.",
  no_chapter:"Capitolul nu a fost specificat.",
  no_firebase:"Firebase nu este disponibil.",
  chapter_not_found:"Capitolul nu există în baza de date!",
  no_wrong:"Nu ai nicio întrebare greșită de refăcut la acest capitol!",
  load_error:"A apărut o eroare la încărcarea întrebarilor greșite.",
  reset_error:"Eroare la resetarea progresului. Încearcă din nou."
};
const t=(k)=>I18N_RO[k]||k;

/* Anti-flicker gate on */
D.body.classList.add("page-loading");
(function mountLoader(){
  const l=$(".lesson-loader"); if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
})();

/* ==========================
   Sanitizare HTML (anti-XSS)
   — whitelist simplu, păstrează formatarea de bază
========================== */
const ALLOWED_TAGS=new Set(["b","i","strong","em","u","p","br","ul","ol","li","blockquote","code","pre","span","img","a"]);
const ALLOWED_ATTR={
  "a": new Set(["href","title","target","rel"]),
  "img": new Set(["src","alt","title","width","height","loading","decoding","fetchpriority"]),
  "span": new Set(["style"]) // rareori păstrăm stil inline; curățăm periculoasele
};
const SAFE_URL=(url)=>/^https?:\/\//i.test(url);
function sanitizeHTML(input){
  const tpl=D.createElement("template");
  tpl.innerHTML=String(input||"");
  const out=D.createElement("div");
  (function walk(node,parent){
    node.childNodes.forEach(n=>{
      if(n.nodeType===Node.TEXT_NODE){ parent.appendChild(D.createTextNode(n.nodeValue)); return; }
      if(n.nodeType!==Node.ELEMENT_NODE) return;
      const tag=n.tagName.toLowerCase();
      if(!ALLOWED_TAGS.has(tag)) { // sari tag nepermis dar păstrează copiii (safe)
        const passthrough=D.createElement("span");
        walk(n,passthrough);
        parent.append(...passthrough.childNodes);
        return;
      }
      const el=D.createElement(tag);
      // Attrib whitelisting
      for(const attr of Array.from(n.attributes)){
        const name=attr.name.toLowerCase();
        const val=attr.value||"";
        // eliminăm evenimente & javascript:
        if(name.startsWith("on")) continue;
        if(/href|src/i.test(name) && !SAFE_URL(val)) continue;
        if(tag in ALLOWED_ATTR){
          if(ALLOWED_ATTR[tag].has(name)) el.setAttribute(name,val);
        }else{
          // tag fără atribute speciale: ignoră atributele
        }
      }
      // mică protecție pe <a>: rel noopener pentru target=_blank
      if(tag==="a"){
        if(el.hasAttribute("target") && el.getAttribute("target")==="_blank"){
          const rel=(el.getAttribute("rel")||"").toLowerCase();
          if(!rel.includes("noopener")) el.setAttribute("rel", (rel+" noopener").trim());
        }
      }
      parent.appendChild(el);
      walk(n,el);
    });
  })(tpl.content,out);
  return out.innerHTML;
}

/* Comutator: poți alege să forțezi text simplu (cel mai sigur) */
const SANITIZE_CONTENT_MODE="whitelist"; // "whitelist" | "plaintext"
const sanitizeMaybe=(html)=>{
  if(!html) return "";
  if(SANITIZE_CONTENT_MODE==="plaintext"){
    const d=D.createElement("div"); d.textContent=String(html); return d.innerHTML;
  }
  return sanitizeHTML(html);
};

/* ==========================
   Sunete & toast
========================== */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}
const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const tnode=findAlertTextEl(AWrap); if(tnode) tnode.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{
    AWrap.classList.remove("active");
    alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);
  },dur);
}
const vibrateShort=()=>{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(40); };

/* ==========================
   Firebase & context
========================== */
const params=new URLSearchParams(location.search), CHAP=params.get("chapter");
if(!CHAP){ alert(t("no_chapter")); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert(t("no_firebase")); return; }
const auth=firebase.auth(),db=firebase.firestore();
const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert(t("must_login")); location.href="/login"; return; }

/* Single-active lock dacă e disponibil (nu schimb comportamentul) */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* ==========================
   Elemente de pagină
========================== */
const QSEC=$(".question-section");
let QWRAP_A=$(".question-wrapper-a")||null;
let QWRAP_B=$(".question-wrapper-b")||null;
let SINGLE_QWRAP=(!QWRAP_A&&!QWRAP_B) ? ($(".question-wrapper")||null) : null;

/* Dacă nu există A/B, construim un staging offscreen pentru pregătire „fără flicker” */
let STAGING = null;
if(!QWRAP_A && !QWRAP_B){
  if(!SINGLE_QWRAP){ SINGLE_QWRAP=$(".question-wrapper"); }
  STAGING=D.createElement("div");
  STAGING.className="question-wrapper ab-staging";
  STAGING.innerHTML = SINGLE_QWRAP ? SINGLE_QWRAP.innerHTML : "";
  (QSEC||D.body).appendChild(STAGING);
}

/* Fade class default */
const markFade=(el)=>{ if(el) el.classList.add("q-fade"); };
markFade(QWRAP_A||SINGLE_QWRAP);
markFade(QWRAP_B);

/* Elemente Final Screen */
const FINAL=$(".chapter-final-screen");
const CNT=(QSEC&&QSEC.querySelector(".questions-collection-list-item-wrapper"))||QSEC||D.body;
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

/* ==========================
   Firestore: capitol & TOTAL
   - manifest: preferă chapterDoc.questionCount + chapterDoc.nextSlug
   - fallback TOTAL: doc cu Index max (1 citire), nu toate paginile
========================== */
const chapterDocRef=db.collection("mediu_invatare_chapters").doc(CHAP);
const chapterDoc=await chapterDocRef.get();
if(!chapterDoc.exists){ alert(t("chapter_not_found")); return; }
const chapterName=chapterDoc.data().Name || "";
const questionCountFromManifest = Number(chapterDoc.data().questionCount||0) || null;
const nextSlugFromManifest = chapterDoc.data().nextSlug || chapterDoc.data().NextSlug || null;

async function getTotalCount(){
  if(Number.isFinite(questionCountFromManifest) && questionCountFromManifest>0) return questionCountFromManifest;
  // fallback ieftin: 1 citire – doc cu Index maxim
  try{
    const s=await db.collection("mediu_invatare_pages")
      .where("chapterSlug","==",CHAP)
      .orderBy("Index","desc")
      .limit(1).get();
    if(!s.empty){
      const maxIndex = Number(s.docs[0].data().Index||0);
      if(Number.isFinite(maxIndex) && maxIndex>0) return maxIndex;
    }
  }catch(e){ log("TOTAL fallback error:",e); }
  // ultimul fallback (mai scump): numărul din query complet – evităm dacă se poate
  const s2=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s2.size;
}
const TOTAL=await getTotalCount();

/* ==========================
   Colectii user
========================== */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* ==========================
   Final progress bar (segmente)
========================== */
const chapterTextFinal=$(".chapter-text-final"),progressCounterFinal=$(".progress-counter-final"),barOuterFinal=$(".chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),barRedFinal=$(".chapter-final-screen .progress-red"),barGapFinal=$(".chapter-final-screen .progress-gap");
const legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent"),resetWrongBtn=$(".reset-wrong-questions-only");
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

/* ==========================
   State & buffers
========================== */
let BUF={},SEL=[],ANSW=false; let CUR=1,FIN=false; let WRONG=[],WRMODE=false,WRP=0;
/* Wrong-mode persist */
let WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;
let WRONG_STARTED_AT_MS=0;
const LS_WRONG_KEY=`wm:${user.uid}:${CHAP}`;

async function persistWrongMode({active,list,pos}){
  try{
    const payload={active:!!active,list:Array.isArray(list)?list.map(v=>+v).filter(Number.isFinite):[],pos:Math.max(0,Math.min((Array.isArray(list)?list.length-1:0),(+pos||0))),startedAtMs: WRONG_STARTED_AT_MS||Date.now()};
    WRONG_STARTED_AT_MS=payload.startedAtMs;
    await progRef.set({wrongMode:payload},{merge:true});
    try{ localStorage.setItem(LS_WRONG_KEY,JSON.stringify(payload)); }catch(_){}
  }catch(_){
    try{ localStorage.setItem(LS_WRONG_KEY,JSON.stringify({active:!!active,list:(list||[]),pos:+pos||0,startedAtMs:WRONG_STARTED_AT_MS||Date.now()})); }catch(_){}
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

/* ==========================
   Prefetch & doc access
========================== */
const mkDocId = (chap, idx) => `${chap}_${String(idx).padStart(3,"0")}`;
async function fetchQuestionByIdFirst(idx){
  const id=mkDocId(CHAP,idx);
  try{
    const d=await db.collection("mediu_invatare_pages").doc(id).get();
    if(d.exists) return d;
  }catch(_){}
  // fallback pe query (Index numeric sau string)
  let snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",idx).limit(1).get();
  if(snap.empty){ snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get(); }
  return snap.empty?null:snap.docs[0];
}

function safePrimeImage(url,{priority="auto"}={}){
  const img=new Image(); img.decoding="async";
  try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){} }
  img.src=url;
  const ready=img.decode?img.decode():new Promise(r=>{img.onload=r; img.onerror=r;});
  return {img,ready};
}
const isSafeMediaURL=(u)=> !!u && /^https?:\/\//i.test(u) && (
  /\.(mp4|webm|ogg)(\?|$)/i.test(u) || u.includes("youtube.com") || u.includes("youtu.be")
);

async function prefetchQuestion(idx){
  if(!idx||BUF[idx]) return;
  const doc = await fetchQuestionByIdFirst(idx);
  if(!doc) return;
  const data=doc.data(); BUF[idx]=data;

  // Pre-sanitize & pre-build explanation + video
  BUF[idx].__explainHTML = sanitizeMaybe(data["Explanation"]||"");
  const vurl = String(data["Explanation Video Link"]||"");
  BUF[idx].__videoURL = isSafeMediaURL(vurl) ? vurl : "";

  // Pregătim imaginea
  if(data.Image){
    try{
      const {ready}=safePrimeImage(data.Image,{priority:"auto"});
      BUF[idx].__imgReady=ready; ready.catch(()=>{});
    }catch(_){ BUF[idx].__imgReady=Promise.resolve(); }
  }else{
    BUF[idx].__imgReady=Promise.resolve();
  }

  // Video hidden prebuild – doar pentru MP4/WebM/Ogg (YouTube e oricum iframe lazy)
  if(BUF[idx].__videoURL && /\.(mp4|webm|ogg)(\?|$)/i.test(BUF[idx].__videoURL)){
    // Cream un <video preload="metadata"> offscreen ca să încărcăm codec-ul fără UI
    rIC(()=> {
      const v=D.createElement("video");
      v.preload="metadata";
      v.muted=true; v.playsInline=true;
      v.innerHTML=`<source src="${BUF[idx].__videoURL}" type="video/mp4">`;
      v.style.position="absolute"; v.style.left="-99999px"; v.style.width="1px"; v.style.height="1px";
      D.body.appendChild(v);
      // eliberăm după ~8s
      setTimeout(()=>{ try{v.remove();}catch(_){} }, 8000);
    });
  }
}

async function prefetchMany(indices,priorityMap={}){
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]);
  if(!list.length) return;
  // Încercăm paralel cu ID-first; dacă eșuează unele, tot rămâne benefic
  await Promise.all(list.map(i=>prefetchQuestion(i)));
}

async function prefetchAhead(current){
  const fast=isFastNet();
  const targets=[current+1];
  if(fast) targets.push(current+2);
  const prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio);
  rIC(()=>{});
}

function pruneBUF(){
  const keep=new Set();
  if(!WRMODE){ [CUR-1,CUR,CUR+1,CUR+2].forEach(i=>{ if(i>0&&i<=TOTAL) keep.add(i); }); }
  else{ const a=WRONG[WRP-1],b=WRONG[WRP],c=WRONG[WRP+1],d=WRONG[WRP+2]; [a,b,c,d].forEach(i=>{ if(typeof i==="number") keep.add(i); }); }
  Object.keys(BUF).forEach(k=>{ const i=+k; if(!keep.has(i)) delete BUF[i]; });
}

/* ==========================
   Vizibilitate & utilitare UI
========================== */
function blurActive(){try{const ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch(_){}}
function isVisible(el){ if(!el) return false; const cs=getComputedStyle(el); return cs.display!=="none" && cs.visibility!=="hidden" && cs.opacity!=="0"; }
function revealNow(){
  D.body.classList.remove("page-loading");
  blurActive();
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (QWRAP_A||QWRAP_B||SINGLE_QWRAP||$(".question-wrapper"))?.classList.add("visible");
  const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
}

/* ==========================
   REFS (ale wrapperului activ)
========================== */
function collectRefs(root){
  const need=sel=>root.querySelector(sel);
  const refs={
    root,
    qEl: need(".questions-collection-list-item")||root,
    qWrap: need(".question-wrapper")||root,
    anchorTop: need(".explanation-anchor-top")||null,
    qText: need(".question-text"),
    progress: need(".progress-counter"),
    mainWrap: need(".main-content-wrapper"),
    optWrap: need(".options-wrapper"),
    cards: a(".option-card",root),
    items: [],
    imgWrap: need(".question-image-wrapper"),
    img: need(".question-image"),
    videoWrap: need(".explanation-video-wrapper")||null,
    feedbackWrap: need(".feedback-wrapper"),
    staticText: null,
    correctAns: null,
    // desktop
    buttonsWrap: need(".submit-next-buttons"),
    submitBtn: null,
    explainBtn: null,
    aiBtn: null,
    // mobile (lăsăm layout Webflow)
    buttonsWrapMobile: need(".submit-next-buttons-mobile")||null,
    submitBtnMobile: null,
    explainBtnMobile: null,
    aiBtnMobile: null,
    // accordion
    acc: need(".custom-accordion")||null,
    accHeader: null, accArrow: null, accContent: null, accBody: null, expLabelEl: null, accAnchor: null,
    anchor: need(".explanation-anchor")||null
  };
  refs.items=refs.cards.map(c=>c.querySelector(".option-item"));
  refs.staticText=refs.feedbackWrap?.querySelector(".correct-answer-static")||null;
  refs.correctAns=refs.feedbackWrap?.querySelector(".correct-answer")||null;

  // desktop buttons
  if(refs.buttonsWrap){
    refs.submitBtn=refs.buttonsWrap.querySelector(".submit-btn");
    refs.explainBtn=refs.buttonsWrap.querySelector(".explanation-btn")||refs.buttonsWrap.querySelector(".explanation-card");
    refs.aiBtn=refs.buttonsWrap.querySelector(".ask-ai-btn")||refs.buttonsWrap.querySelector(".ai-pop-wrapper");
  }
  // mobile buttons
  if(refs.buttonsWrapMobile){
    refs.submitBtnMobile=refs.buttonsWrapMobile.querySelector(".submit-btn-mobile")||refs.buttonsWrapMobile.querySelector(".submit-btn")||null;
    refs.explainBtnMobile=refs.buttonsWrapMobile.querySelector(".explanation-btn-mobile")||refs.buttonsWrapMobile.querySelector(".explanation-btn")||null;
    refs.aiBtnMobile=refs.buttonsWrapMobile.querySelector(".ask-ai-btn-mobile")||refs.buttonsWrapMobile.querySelector(".ask-ai-btn")||null;
  }
  // accordion bits
  if(refs.acc){
    refs.accHeader=refs.acc.querySelector(".custom-accordion-header")||null;
    refs.accArrow =refs.acc.querySelector(".custom-accordion-arrow")||null;
    refs.accContent=refs.acc.querySelector(".custom-accordion-content")||null;
    refs.accBody  =refs.acc.querySelector(".custom-accordion-body")||null;
    refs.expLabelEl=refs.acc.querySelector(".custom-accordion-label")||null;
    refs.accAnchor=refs.acc.querySelector(".accordion-anchor")||null;
    // A11y pentru header
    if(refs.accHeader){
      refs.accHeader.setAttribute("role","button");
      refs.accHeader.setAttribute("tabindex","0");
      refs.accHeader.setAttribute("aria-expanded","false");
      if(refs.accContent){
        const cid = refs.accContent.id || `acc-content-${Math.random().toString(36).slice(2)}`;
        refs.accContent.id = cid;
        refs.accHeader.setAttribute("aria-controls", cid);
      }
    }
  }
  // A11y pentru Explain / AI dacă nu-s <button>
  const forceBtnA11y=(btn)=>{
    if(!btn) return;
    if(btn.tagName.toLowerCase()!=="button"){
      btn.setAttribute("role","button");
      btn.setAttribute("tabindex","0");
    }
  };
  forceBtnA11y(refs.explainBtn); forceBtnA11y(refs.explainBtnMobile);
  forceBtnA11y(refs.aiBtn);      forceBtnA11y(refs.aiBtnMobile);

  return refs;
}
let ACTIVE_WRAP = (QWRAP_A||SINGLE_QWRAP||$(".question-wrapper"));
let STAGE_WRAP  = (QWRAP_B||STAGING||null);
let refs = collectRefs(ACTIVE_WRAP);

/* ==========================
   Buttons state & labels
========================== */
function forceAIChatText(btn){
  if(!btn) return;
  btn.textContent=t("ai_chat");
  btn.setAttribute("aria-label", t("ai_chat"));
  btn.setAttribute("role","button");
}
function applyAIChatText(){
  forceAIChatText(refs.aiBtn);
  forceAIChatText(refs.aiBtnMobile);
}

function setSubmitState(btn,state,{affectLayout=true}={}){
  if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify":
      btn.textContent=t("verify");
      btn.classList.add("is-verify","_preload-full");
      if(affectLayout) btn.style.gridColumn="1 / 2";
      break;
    case "next":{
      const last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
      btn.textContent=last?t("finish"):t("continue");
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
    }
    case "finish":
      btn.textContent=t("finish");
      btn.classList.add("is-finish","finish-chapter-btn");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
  }
}
function setSubmitStateBoth(state){
  setSubmitState(refs.submitBtn, state, {affectLayout:true});    // desktop
  setSubmitState(refs.submitBtnMobile, state, {affectLayout:false}); // mobil
}
function setSingleBtnState(on){
  if(refs.buttonsWrap) refs.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(refs.submitBtn) refs.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(refs.submitBtn) refs.submitBtn.style.removeProperty("grid-column"); }
}

/* ==========================
   Helpers opțiuni
========================== */
function getLetterFromCard(card){
  const el=card.querySelector(".option-letter"); if(!el) return "";
  for(const n of el.childNodes){ if(n.nodeType===Node.TEXT_NODE){ const t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase(); } }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearAllSelected(scope){
  (scope||D).querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected").forEach(el=>el.classList.remove("selected"));
  (scope||D).querySelectorAll(".option-card.selected").forEach(el=>el.classList.remove("selected"));
}
function applySelectedVisualsFromSEL(scope){
  const root=scope||D;
  root.querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card),on=SEL.includes(L);
    card.classList.remove("selected");
    card.querySelector(".option-letter")?.classList.toggle("selected",on);
    card.querySelector(".option-item")?.classList.toggle("selected",on);
    card.querySelector(".option-card-connector")?.classList.toggle("selected",on);
  });
}
function clearLetterStates(scope){ (scope||D).querySelectorAll(".option-letter").forEach(el=>el.classList.remove("correct","wrong")); }
function applyLetterStatesByCorrect(scope,corArr){
  const COR=new Set((corArr||[]).map(x=>String(x||"").trim().toUpperCase()));
  (scope||D).querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card),el=card.querySelector(".option-letter");
    if(!el||!L) return; el.classList.remove("correct","wrong"); el.classList.add(COR.has(L)?"correct":"wrong");
  });
}
function clearWrongCards(scope){ (scope||D).querySelectorAll(".option-card.wrong-card").forEach(c=>c.classList.remove("wrong-card")); }
function applyWrongCardsByCorrect(scope,corArr){
  const COR=new Set((corArr||[]).map(x=>String(x||"").trim().toUpperCase()));
  (scope||D).querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card);
    card.classList.toggle("wrong-card",!COR.has(L));
  });
}

/* ==========================
   Explain UI + a11y
========================== */
function isExplanationOpen(){
  const acc=refs.acc, c=refs.accContent;
  const accOpen = !!(acc && c && (acc.classList.contains("open") || (c.style.maxHeight && c.style.maxHeight!=="0px")));
  const videoShown = !!(refs.videoWrap && refs.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(open){
  const setOpen = (btn)=>{ if(!btn) return; btn.setAttribute("aria-pressed","true"); btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
  const setClosed = (btn)=>{ if(!btn) return; btn.setAttribute("aria-pressed","false"); btn.textContent="EXPLICAȚIE"; };
  if(open){ setOpen(refs.explainBtn); setOpen(refs.explainBtnMobile); }
  else{ setClosed(refs.explainBtn); setClosed(refs.explainBtnMobile); }
}

/* ==========================
   Video mount (safe) + cleanup
========================== */
function cleanupVideoObservers(){
  try{
    const vw=refs.videoWrap;
    if(vw && vw.__observerInstance){ vw.__observerInstance.disconnect(); vw.__observerInstance=null; }
  }catch(_){}
}
function setVideoBlock(url){
  if(!refs.videoWrap) return;
  cleanupVideoObservers();
  refs.videoWrap.innerHTML=""; refs.videoWrap.style.display="none"; if(!url) return;
  if(!isSafeMediaURL(url)) return;

  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html=`<video class="explanation-video plyr-player" preload="metadata" controls playsinline><source src="${url}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); const yt=m?m[1]:"";
    if(yt) html=`<div class="plyr__video-embed"><iframe src="https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0" allowfullscreen allowtransparency allow="autoplay"></iframe></div>`;
  }
  if(!html) return;

  refs.videoWrap.innerHTML=html; refs.videoWrap.style.display="none";

  const playerEl=refs.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    const playPauseToggle=(e)=>{
      if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return;
      e.stopPropagation();
      try{
        if(HAS_PLYR && playerEl.plyr){ playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play(); }
        else{ playerEl.paused?playerEl.play():playerEl.pause(); }
      }catch(_){}
    };
    (HAS_PLYR && playerEl.plyr) ? playerEl.addEventListener("click",playPauseToggle) : playerEl.addEventListener("click",playPauseToggle);

    playerEl._hasUserPlayed=false; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false;
    playerEl.addEventListener("play",()=>{ playerEl._hasUserPlayed=true; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false; });

    const scroller=refs.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(refs.qEl)||null, vw=refs.videoWrap;
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
function stopActiveMedia(){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  const lottieEl=refs.qEl?.querySelector(".lottie-animation-correct");
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  const v=refs.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}

/* ==========================
   Scroll helpers
========================== */
function getScrollParent(el){
  const qwi=el.closest?.(".question-wrapper-inner"); if(qwi) return qwi;
  let p=el.parentElement; while(p){ const s=getComputedStyle(p),oy=s.overflowY; if(oy==="auto"||"scroll"===oy||"overlay"===oy) return p; p=p.parentElement; }
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

/* ==========================
   Render (in wrapper dat) – pre-build fără flicker
========================== */
function setButtonsTransitionLock(on){
  const setDis=(btnWrap,btn)=>{
    if(btn) { btn.setAttribute("aria-disabled",on?"true":"false"); btn.classList.toggle("is-disabled",on); }
    if(btnWrap){ if(on) btnWrap.style.setProperty("pointer-events","none","important"); else btnWrap.style.removeProperty("pointer-events"); }
  };
  setDis(refs.buttonsWrap, refs.submitBtn);
  setDis(refs.buttonsWrapMobile, refs.submitBtnMobile);
}
function applyNoImageState(on, rootRefs=refs){
  if(!rootRefs.optWrap || !rootRefs.qEl) return;
  if(on){
    rootRefs.qEl.classList.add("no-image");
    rootRefs.optWrap.style.minHeight="40vh";
    if(rootRefs.imgWrap) rootRefs.imgWrap.style.display="none";
  }else{
    rootRefs.qEl.classList.remove("no-image");
    rootRefs.optWrap.style.minHeight="";
    if(rootRefs.imgWrap) rootRefs.imgWrap.style.display="";
  }
}
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
}
async function seamlessSetImage(url, rootRefs=refs){
  if(!rootRefs.img){ applyNoImageState(true, rootRefs); return; }
  if(!url){
    rootRefs.img.removeAttribute("src");
    rootRefs.img.style.display="none";
    rootRefs.img.setAttribute("aria-hidden","true");
    applyNoImageState(true, rootRefs);
    return;
  }
  try{
    const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
    tmp.src=url;
    if(tmp.decode) await tmp.decode(); else await new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
  }catch(_){}
  if(rootRefs.img.src!==url) rootRefs.img.src=url;
  rootRefs.img.style.display="";
  rootRefs.img.removeAttribute("aria-hidden");
  applyNoImageState(false, rootRefs);
  rootRefs.img.onerror=()=>{
    rootRefs.img.removeAttribute("src");
    rootRefs.img.style.display="none";
    rootRefs.img.setAttribute("aria-hidden","true");
    applyNoImageState(true, rootRefs);
  };
}

/* Pregătește conținutul într-un wrapper (poate fi STAGE_WRAP) */
async function hydrateWrapperWithQuestion(root, q, idx, {resetSelections=false}={}){
  const R = collectRefs(root);
  // Set titlu + progres
  (R.qEl.querySelector(".chapter-text")||D.createElement("div")).textContent=chapterName;
  R.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(idx)}/${pad2(TOTAL)}`;

  // Întrebare + opțiuni (sanitizate)
  R.qText.innerHTML=""; R.qText.insertAdjacentHTML("afterbegin", sanitizeMaybe(q.Question||""));
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  R.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=R.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin", sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });

  // Explain text (sanitizat) – deja în DOM, dar ascuns
  if(R.accBody){
    R.accBody.innerHTML=""; const ex=q.__explainHTML||"";
    if(ex) R.accBody.insertAdjacentHTML("afterbegin", ex);
  }

  // Reset vizibilități & butoane
  if(R.feedbackWrap) R.feedbackWrap.style.display="none";
  if(R.correctAns) R.correctAns.textContent="";
  if(R.staticText) R.staticText.textContent=t("correct_label");
  renderExplainBtnUI(false);
  if(R.explainBtn) R.explainBtn.style.display="none";
  if(R.explainBtnMobile) R.explainBtnMobile.style.display="none";
  if(R.aiBtn) R.aiBtn.style.display="none";
  if(R.aiBtnMobile) R.aiBtnMobile.style.display="none";

  if(R.acc){ R.acc.style.display="none"; R.acc.classList.remove("open"); if(R.accContent) R.accContent.style.maxHeight="0px"; }
  if(R.accArrow){ try{ R.accArrow.style.removeProperty("transform"); }catch(_){ } }

  // Video pre-mount (dar ascuns)
  setVideoBlock(q.__videoURL||"");

  // Selection state
  SEL = resetSelections ? [] : SEL;
  ANSW=false;
  clearLetterStates(R.qEl); clearAllSelected(R.qEl); clearWrongCards(R.qEl);

  // Desktop: un singur buton până la verificare; mobil: layout Webflow
  if(root===ACTIVE_WRAP){ // doar pentru wrapperul activ setăm UI butoane
    setSingleBtnState(true);
    setSubmitStateBoth("verify");
  }

  // Imagine pregătită
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(q.Image, R); } else { await seamlessSetImage("", R); }

  return R;
}

/* ==========================
   Restore răspuns (respectă sesiunea în wrong-mode)
========================== */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
}

/* ==========================
   INIT
========================== */
const progSnap=await progRef.get();
let CUR_FROM_DB=null, FIN_FROM_DB=false;
if(progSnap.exists){
  CUR_FROM_DB=progSnap.data().currentIndex||null;
  FIN_FROM_DB=!!progSnap.data().finished;
  if(CUR_FROM_DB) CUR=CUR_FROM_DB;
  if(FIN_FROM_DB) FIN=true;
}
const persistedWM=await loadWrongModePersist();

/* Dacă lipsește structura minimă, abort elegant */
function hasMinimumStructure(root){
  const need = (sel)=>root.querySelector(sel);
  return !!(need(".question-text") && need(".progress-counter") && need(".options-wrapper") && a(".option-card",root).length);
}
if(!(ACTIVE_WRAP && hasMinimumStructure(ACTIVE_WRAP))){
  alert("Structura nu e completă. Verifică clasele HTML.");
  D.body.classList.remove("page-loading"); 
  return;
}

/* ——— Pregătire inițială ——— */
if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
  WRMODE=true;
  WRONG=persistedWM.list.slice(0);
  WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
  WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();
  await prefetchQuestion(WRONG[WRP]);
  await prefetchAhead(WRONG[WRP]);
  await hydrateWrapperWithQuestion(ACTIVE_WRAP, BUF[WRONG[WRP]], WRONG[WRP], {resetSelections:true});
  revealNow();
}else if(FIN){
  await showFinal();
  D.body.classList.remove("page-loading");
}else{
  await prefetchQuestion(CUR);
  await prefetchAhead(CUR);
  await hydrateWrapperWithQuestion(ACTIVE_WRAP, BUF[CUR], CUR, {resetSelections:false});
  revealNow();
}

/* ==========================
   Explain/AI – handlers (desktop + mobil, a11y)
========================== */
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
function ensureExplainHandlers(){
  // Accordion toggle
  const acc=refs.acc, c=refs.accContent, h=refs.accHeader;
  if(h && !h.dataset.boundAcc){
    bindPressFeedback(h,c);
    const toggle=()=>{
      if(!acc) return;
      const opening=!acc.classList.contains("open");
      acc.classList.toggle("open", opening);
      h.setAttribute("aria-expanded", opening ? "true" : "false");
      if(opening){
        if(c){
          const prev=c.style.transition;
          c.style.display="block"; c.style.transition="none"; c.style.maxHeight="";
          try{
            const imgs=[...c.querySelectorAll("img")];
            if(imgs.length) Promise.all(imgs.map(im=>im.decode?im.decode():Promise.resolve())).catch(()=>{});
          }catch(_){}
          const hgt=c.scrollHeight+"px";
          c.style.maxHeight=hgt; void c.offsetHeight;
          const scroller=acc.closest(".question-wrapper-inner")||getScrollParent(acc);
          const target=refs.accAnchor||refs.anchor;
          if(target) scrollContainerToAnchor(target,scroller,{behavior:"smooth"});
          requestAnimationFrame(()=>{ c.style.transition=prev||""; });
        }
      }else{
        if(refs.accContent){ refs.accContent.style.maxHeight="0px"; }
      }
    };
    h.addEventListener("click", toggle);
    h.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" ") { e.preventDefault(); toggle(); }});
    h.dataset.boundAcc='1';
  }
  // Explain button (desktop+mobile)
  const onExplain=()=>{
    vibrateShort();
    const opening = !isExplanationOpen();
    const scroller=refs.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(refs.qEl);
    if(opening){
      if(refs.videoWrap){ refs.videoWrap.style.display="block"; const v=refs.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
      if(refs.acc){ refs.acc.style.display="block"; refs.acc.classList.remove("open"); if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
      renderExplainBtnUI(true);
      scrollContainerToAnchor(refs.anchor,scroller,{behavior:"smooth"});
    }else{
      const v=refs.videoWrap?.querySelector("video");
      if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
      if(refs.videoWrap) refs.videoWrap.style.display="none";
      if(refs.acc){ refs.acc.classList.remove("open"); refs.acc.style.display="none"; if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
      if(refs.accHeader) refs.accHeader.setAttribute("aria-expanded","false");
      renderExplainBtnUI(false);
      scrollContainerToAnchor(refs.anchorTop,scroller,{behavior:"smooth"});
    }
  };
  const bindBtn=(btn)=>{
    if(!btn || btn.dataset.boundExp) return;
    btn.addEventListener("click", onExplain);
    btn.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" ") { e.preventDefault(); onExplain(); }});
    btn.dataset.boundExp='1';
  };
  bindBtn(refs.explainBtn); bindBtn(refs.explainBtnMobile);

  // AI button (desktop+mobile)
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
    AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS aici */ });
    return AIPop;
  }
  const onAiClick=()=>{
    vibrateShort();
    const v=refs.videoWrap?.querySelector("video");
    if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
    ensureAIPop().style.display="flex"; D.body.style.overflow="hidden";
  };
  const bindAi=(btn)=>{
    if(!btn || btn.dataset.boundAi) return;
    btn.addEventListener("click", onAiClick);
    btn.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" ") { e.preventDefault(); onAiClick(); }});
    btn.dataset.boundAi='1';
  };
  bindAi(refs.aiBtn); bindAi(refs.aiBtnMobile);

  applyAIChatText();
}
ensureExplainHandlers();

/* ==========================
   Update wrapper ACTIV – restore răspuns dacă există (same-day session)
========================== */
async function restoreAnswerIfAny(idx, rootRefs=refs){
  try{
    const snap=await ansCollection.doc(`${CHAP}_${idx}`).get();
    if(snap.exists){
      const d=snap.data();
      const selSaved=(d.selected||[]).map(x=>String(x||"").toUpperCase());
      const corSaved=(d.correct||[]).map(x=>String(x||"").toUpperCase());
      const answeredAtMs=+(d.answeredAtMs||0);
      const allowRestore = (!WRMODE) || (WRMODE && answeredAtMs && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
      if(allowRestore && selSaved.length>0){
        SEL=Array.from(new Set(selSaved)); applySelectedVisualsFromSEL(rootRefs.qEl);
        ANSW=true; clearLetterStates(rootRefs.qEl); applyLetterStatesByCorrect(rootRefs.qEl,corSaved); clearWrongCards(rootRefs.qEl); applyWrongCardsByCorrect(rootRefs.qEl,corSaved);
        const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
        if(rootRefs.staticText) rootRefs.staticText.textContent = same ? "Corect 100%! -" : "Greșit. Răspuns corect -";
        const ord=["A","B","C"].filter(x=>corSaved.includes(x)); if(rootRefs.correctAns) rootRefs.correctAns.textContent=ord.join(", ");
        if(rootRefs.feedbackWrap) rootRefs.feedbackWrap.style.setProperty("display","flex","important");
        if(rootRefs.explainBtn) rootRefs.explainBtn.style.setProperty("display","flex","important");
        if(rootRefs.explainBtnMobile) rootRefs.explainBtnMobile.style.setProperty("display","flex","important");
        if(rootRefs.aiBtn) rootRefs.aiBtn.style.setProperty("display","flex","important");
        if(rootRefs.aiBtnMobile) rootRefs.aiBtnMobile.style.setProperty("display","flex","important");
        applyAIChatText();
        if(rootRefs===refs){ // doar pe activ manipulăm bara de butoane
          setSingleBtnState(false);
          const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
          setSubmitStateBoth((lastWrong||lastNormal)?"finish":"next");
        }
      }
    }
  }catch(e){ log("Restore answer failed:",e); }
}

/* ==========================
   Swap întrebare (fără flicker)
========================== */
async function updateActiveToIndex(idx,{resetSelections=false}={}){
  setButtonsTransitionLock(true);
  const q=BUF[idx];
  const container=ACTIVE_WRAP||SINGLE_QWRAP||$(".question-wrapper")||D.body;
  const prevH=container.offsetHeight;
  container.classList.add("no-transition","is-preparing");
  if(prevH) container.style.minHeight=prevH+"px";

  if(STAGE_WRAP){ // Single wrapper + staging off-DOM
    STAGE_WRAP.innerHTML = ACTIVE_WRAP.innerHTML; // păstrăm structura
    const stageRefs = await hydrateWrapperWithQuestion(STAGE_WRAP, q, idx, {resetSelections});
    await restoreAnswerIfAny(idx, stageRefs);

    // Înlocuire rapidă a conținutului
    ACTIVE_WRAP.innerHTML = STAGE_WRAP.innerHTML;
    refs = collectRefs(ACTIVE_WRAP);
    ensureExplainHandlers();
  }else if(QWRAP_A && QWRAP_B){ // A/B existent
    const INACTIVE = ACTIVE_WRAP===QWRAP_A ? QWRAP_B : QWRAP_A;
    INACTIVE.classList.remove("visible");
    await hydrateWrapperWithQuestion(INACTIVE, q, idx, {resetSelections});
    await restoreAnswerIfAny(idx, collectRefs(INACTIVE));
    // crossfade
    INACTIVE.classList.add("visible");
    ACTIVE_WRAP.classList.remove("visible");
    ACTIVE_WRAP = INACTIVE;
    refs = collectRefs(ACTIVE_WRAP);
    ensureExplainHandlers();
  }else{
    // fallback: același wrapper
    await hydrateWrapperWithQuestion(ACTIVE_WRAP, q, idx, {resetSelections});
    await restoreAnswerIfAny(idx, refs);
  }

  requestAnimationFrame(()=>{
    container.classList.remove("no-transition","is-preparing");
    container.style.minHeight="";
    setButtonsTransitionLock(false);
  });
}

/* ==========================
   Final screen & WRONG prep
========================== */
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

  // pregătim WRONG list & preload
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

/* ==========================
   Submit / Next / Finish
========================== */
function getActiveIndex(){ return WRMODE?WRONG[WRP]:CUR; }

QSEC?.addEventListener("click",async(e)=>{
  const submitBtn=e.target.closest(".submit-btn, .submit-btn-mobile"); if(!submitBtn) return;
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
        WRMODE=false; try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await clearWrongModePersist(); await showFinal(); return;
      }
      await persistWrongMode({active:true,list:WRONG,pos:WRP});
      await prefetchAhead(WRONG[WRP]||0); pruneBUF(); SEL=[]; ANSW=false;
      await updateActiveToIndex(WRONG[WRP],{resetSelections:true}); return;
    }else{
      if(CUR<TOTAL){
        CUR++; try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}
        await prefetchAhead(CUR); pruneBUF(); SEL=[]; ANSW=false;
        await updateActiveToIndex(CUR,{resetSelections:false});
      }else{
        try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
        await showFinal();
      }
      return;
    }
  }

  if(isVerify){
    if(SEL.length===0){
      toast(t("select_answer"),1000);
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

    if(refs.staticText) refs.staticText.textContent=isFullyCorrect?"Corect 100%! -":"Greșit. Răspuns corect -";
    const ord=["A","B","C"].filter(x=>cor.includes(x)); if(refs.correctAns) refs.correctAns.textContent=ord.join(", ");

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

    // Explicație + AI devin vizibile instant (sunt pre-montate)
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
      log("Eroare salvare raspuns/progres:",err);
      toast("Conexiune slabă – încerc să salvez…",1200);
    });
  }
});

/* ==========================
   WRONG MODE – start + list
========================== */
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

  const loaderEl=$(".lesson-loader");
  const container=ACTIVE_WRAP||SINGLE_QWRAP||$(".question-wrapper")||D.body;

  if(container){
    const h=container.offsetHeight;
    container.classList.add("no-transition","is-preparing");
    if(h) container.style.minHeight=h+"px";
  }
  if(loaderEl) loaderEl.style.setProperty("display","flex","important");
  D.body.classList.add("page-loading");
  FINAL?.style.setProperty("display","none","important");
  if(QSEC){ QSEC.style.setProperty("display","flex","important"); QSEC.classList.add("visible"); }

  try{
    let list=(WRONG_PREPARED_READY?WRONG_PREPARED:null);
    if(!list||!list.length) list=await buildWrongListNow();

    if(!list.length){
      alert(t("no_wrong"));
      if(loaderEl) loaderEl.style.setProperty("display","none","important");
      FINAL?.style.setProperty("display","flex","important");
      if(container){ container.classList.remove("no-transition","is-preparing"); container.style.minHeight=""; }
      D.body.classList.remove("page-loading");
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
    await updateActiveToIndex(WRONG[WRP],{resetSelections:true});
    await prefetchAhead(WRONG[WRP]||0);

  }catch(e){
    log("EROARE la wrong-mode (safe):",e);
    alert(t("load_error"));
    FINAL?.style.setProperty("display","flex","important");
  }finally{
    if(loaderEl) loaderEl.style.setProperty("display","none","important");
    D.body.classList.remove("page-loading");
    if(container){ container.classList.remove("no-transition","is-preparing"); container.style.minHeight=""; }
    START_WRONG_IN_PROGRESS=false;
  }
}

/* ==========================
   Next chapter (manifest first)
========================== */
let NEXT_SLUG=null,NEXT_READY=false;
async function getNextChapterSlug(){
  if(NEXT_READY) return NEXT_SLUG;
  if(nextSlugFromManifest){ NEXT_SLUG=nextSlugFromManifest; NEXT_READY=true; return NEXT_SLUG; }
  try{
    const s=await db.collection("mediu_invatare_chapters").orderBy("Index").get(); const arr=[];
    s.forEach(d=>arr.push(d.id));
    const i=arr.indexOf(CHAP); NEXT_SLUG=(i!==-1&&i<arr.length-1)?arr[i+1]:null;
  }catch(_){ NEXT_SLUG=null; }
  NEXT_READY=true; return NEXT_SLUG;
}

/* ==========================
   Delegări Final screen
========================== */
D.addEventListener("click",async e=>{
  if(e.target.closest(".reset-wrong-questions-only")){ await startWrongModeSafe(); return; }
  if(e.target.closest(".next-chapter-btn")){
    vibrateShort(); stopActiveMedia(); await clearWrongModePersist();
    const next=await getNextChapterSlug(); if(next) location.replace(`${location.pathname}?chapter=${encodeURIComponent(next)}`);
    return;
  }
  if(e.target.closest(".reset-chapter-btn")){ vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="flex"; return; }
  if(e.target.closest(".confirm-reset-chapter")){
    vibrateShort(); stopActiveMedia(); const aw=$(".alert-wrapper");
    try{
      await progRef.delete();
      await clearWrongModePersist();
      const qs=await ansCollection.where("chapterSlug","==",CHAP).get();
      const batch=db.batch(); qs.forEach(doc=>batch.delete(doc.ref)); await batch.commit(); location.reload();
    }catch(_){
      alert(t("reset_error"));
      if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important");
    }
    return;
  }
  if(e.target.closest(".back-to-chapter-final-screen")){
    vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important"); return;
  }
});

/* ==========================
   QoL
========================== */
function primarySubmitBtn(){
  if(refs.submitBtnMobile && isVisible(refs.submitBtnMobile)) return refs.submitBtnMobile;
  return refs.submitBtn || null;
}
D.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    const btn=primarySubmitBtn();
    if(btn){ e.preventDefault(); btn.click(); }
  }else if(e.key==="Escape"){
    try{
      D.querySelectorAll(".alert-wrapper-new.active").forEach(w=>{w.classList.remove("active"); w.style.display="none";});
      const aiPop=$(".ask-ai-pop-up"); if(aiPop) aiPop.style.display="none";
      const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
      D.body.classList.remove("page-loading"); D.body.style.overflow="";
    }catch(_){}
  }
});

/* ==========================
   Idempotent: finalizează segmente bară finală dacă lipsesc
========================== */
(function(){ const o=$(".chapter-progress-bar-outer"); if(!o) return;
  if(!$(".chapter-final-screen .progress-green")){ const s=D.createElement("span"); s.className="progress-green"; o.appendChild(s); }
  if(!$(".chapter-final-screen .progress-red"))  { const s=D.createElement("span"); s.className="progress-red";   o.appendChild(s); }
  if(!$(".chapter-final-screen .progress-gap"))  { const s=D.createElement("span"); s.className="progress-gap";   o.appendChild(s); }
})();

/* Failsafe final */
D.body.classList.remove("page-loading");
blurActive();

}); // end Webflow.push

