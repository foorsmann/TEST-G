window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* ===== Utilitare scurte ===== */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0"),HAS_PLYR=!!(W&&W.Plyr),rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");
const sanitizeMaybe=(html)=> (window.__SANITIZE_CONTENT ? window.__sanitizeHTMLAllowlist(html) : (html||""));

function blurActive(){try{const ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch(_){}}
D.body.classList.add("page-loading");
(function(){const l=$(".lesson-loader"); if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
})();

/* ===== Helpers UI: vizibilitate + feedback apăsare ===== */
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

/* ===== Setup Firebase / contexte ===== */
const params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); return; }
const auth=firebase.auth(),db=firebase.firestore();
const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie sa fii autentificat."); location.href="/login"; return; }

/* Single Active Lock (dacă e disponibil) */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* ===== Selectori principali + bootstrap DOUBLE BUFFER ===== */
const QSEC=$(".question-section");
let QWRAP=(QSEC&&QSEC.querySelector(".question-wrapper"))||$(".question-wrapper");
if(QWRAP) QWRAP.classList.add("q-fade");
const FINAL=$(".chapter-final-screen");
const CNT=(QSEC&&QSEC.querySelector(".questions-collection-list-item-wrapper"))||QSEC||D.body;
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

/* ——— Bootstrap A/B ——— */
const AB={active:'A',shell:null,A:null,B:null};
(function setupDoubleBuffer(){
  if(!QWRAP) return;
  const shell=document.createElement("div");
  shell.className="question-shell-w";
  QWRAP.parentNode.insertBefore(shell,QWRAP);

  const layerA=document.createElement("div");
  layerA.className="q-layer layer-A active";
  const layerB=document.createElement("div");
  layerB.className="q-layer layer-B";

  /* Mută wrapper-ul existent în A și clonează pentru B */
  layerA.appendChild(QWRAP);
  const clone=QWRAP.cloneNode(true);
  /* Mic cleanup inofensiv: elimină event-bound markers din clonă */
  clone.querySelectorAll("[data-boundSel],[data-boundAcc],[data-boundExp],[data-boundAi]").forEach(el=>{
    el.removeAttribute("data-boundSel"); el.removeAttribute("data-boundAcc"); el.removeAttribute("data-boundExp"); el.removeAttribute("data-boundAi");
  });
  layerB.appendChild(clone);

  shell.appendChild(layerA); shell.appendChild(layerB);

  AB.shell=shell; AB.A=layerA; AB.B=layerB; AB.active='A';

  /* Actualizează referința către wrapper-ul curent (A) */
  QWRAP = layerA.querySelector(".question-wrapper") || QWRAP;
})();

/* ===== Sunete ===== */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}

/* ===== Toast alert ===== */
const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{ AWrap.classList.remove("active");
    alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);
  },dur);
}
function hideAlertBox(){ if(!AWrap) return; if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;} AWrap.classList.remove("active");AWrap.style.display="none"; }

/* ===== Haptic ===== */
const vibrateShort=()=>{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(50); };
D.body.addEventListener("click",e=>{
  if(e.target.closest(".custom-accordion-header,.back-btn,.next-chapter-btn,.reset-chapter-btn,.confirm-reset-chapter,.back-to-chapter-final-screen,.close-btn")) vibrateShort();
});

/* Texte statice feedback */
const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Gresit. Raspuns corect -","Nu e bine. Raspuns core -","Din pacate, nu. Raspuns core -","Mai incearca. Raspuns core -","Alegere gresita. Raspuns core -","Nu e varianta buna. Raspuns core -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

/* ===== Video URL validator ===== */
function isSafeVideoUrl(url){
  if(!url) return false;
  try{
    const u=new URL(url, location.origin);
    if(u.protocol!=='https:') return false;
    const href=u.href.toLowerCase();
    if(href.includes('youtube.com')||href.includes('youtu.be')) return true;
    if(/\.(mp4|webm|ogg)(\?|#|$)/i.test(href)) return true;
    return false;
  }catch(_){ return false; }
}

/* ===== Date capitol + total ===== */
const chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu exista in baza de date!"); return; }
const chapterName=chapterDoc.data().Name;
async function getTotalCount(){ const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get(); return s.size; }
const TOTAL=await getTotalCount();

/* ===== Colecții progres/raspunsuri ===== */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* ===== Final screen UI ===== */
const chapterTextFinal=$(".chapter-text-final"),progressCounterFinal=$(".progress-counter-final"),barOuterFinal=$(".chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),barRedFinal=$(".chapter-final-screen .progress-red"),barGapFinal=$(".chapter-final-screen .progress-gap");
const legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent");
const resetWrongBtn=$(".reset-wrong-questions-only");
if(legacyPercentEl) legacyPercentEl.style.display="none";

/* Segmente bară finală */
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
  if(answeredPct>0&&+cPct>0){
    if(hasBoth){barGreenFinal.style.width=`calc(${((cPct/answeredPct)*100).toFixed(4)}% - ${GAP_PX/2}px)`;barGreenFinal.style.left="0";}
    else{barGreenFinal.style.width="100%";barGreenFinal.style.left="0";}
  } else {barGreenFinal.style.width="0%";barGreenFinal.style.left="0";}
  if(answeredPct>0&&+wPct>0){
    if(hasBoth){
      const leftPct=(cPct/answeredPct)*100;
      barRedFinal.style.left=`calc(${leftPct.toFixed(4)}% + ${GAP_PX/2}px)`;
      barRedFinal.style.width=`calc(${((wPct/answeredPct)*100).toFixed(4)}% - ${GAP_PX/2}px)`;
    } else { barRedFinal.style.left="0"; barRedFinal.style.width="100%"; }
  } else { barRedFinal.style.left="0"; barRedFinal.style.width="0%"; }
  if(barGapFinal){
    if(hasBoth){
      const leftPct=(cPct/answeredPct)*100;
      barGapFinal.style.display="block";
      barGapFinal.style.left=`calc(${leftPct.toFixed(4)}% - ${GAP_PX/2}px)`;
    } else barGapFinal.style.display="none";
  }
  barOuterFinal.style.transition=`width ${d}ms cubic-bezier(.68,-0.55,.27,1.55)`; barOuterFinal.style.width="0%";
  if(progressCounterFinal){
    setFinalPercent("0%");
    const start=performance.now();
    const step=ts=>{
      const p=Math.min((ts-start)/d,1),val=Math.round(p*(+cPct||0));
      setFinalPercent(val+"%"); if(p<1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  requestAnimationFrame(()=>{ setTimeout(()=>{ barOuterFinal.style.width=`${answeredPct}%`; },40); });
}

/* --- State general --- */
let BUF={},SEL=[],ANSW=false; let CUR=1,FIN=false; let WRONG=[],WRMODE=false,WRP=0;
let WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;
let WRONG_STARTED_AT_MS=0;
const LS_WRONG_KEY=`wm:${user.uid}:${CHAP}`;

/* ===== Persistență wrong-mode ===== */
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
    const ps=await progRef.get();
    const wm=ps.exists&&ps.data().wrongMode?ps.data().wrongMode:null;
    if(wm&&wm.active){
      out={active:!!wm.active,list:(wm.list||[]).map(v=>+v).filter(Number.isFinite),pos:+wm.pos||0,startedAtMs:+wm.startedAtMs||0};
    }
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

/* ===== Prefetch imagini / întrebări ===== */
function primeImage(url,{priority="auto"}={}){ const img=new Image(); img.decoding="async"; try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){}} img.src=url; const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;}); return {img,ready}; }

async function prefetchMany(indices,priorityMap={}){
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]);
  if(!list.length) return;
  const chunks=[]; for(let i=0;i<list.length;i+=10){ chunks.push(list.slice(i,i+10)); }

  for(const chunk of chunks){
    try{
      const qs=await db.collection("mediu_invatare_pages")
        .where("chapterSlug","==",CHAP)
        .where("Index","in",chunk)
        .get();
      qs.forEach(doc=>{
        const d=doc.data(),i=(typeof d.Index==="number")?d.Index:parseInt(d.Index,10);
        if(!i||BUF[i]) return;
        BUF[i]=d;
        if(d.Image){
          const pr=priorityMap[i]||"low";
          try{ const {ready}=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=ready; ready.catch(()=>{});}catch(_){BUF[i].__imgReady=Promise.resolve();}
        } else BUF[i].__imgReady=Promise.resolve();
      });

      /* completează lipsurile (Index ca string) */
      const found=new Set(qs.docs.map(x=>String(x.data().Index)));
      const missing=chunk.filter(v=>!found.has(String(v)));
      if(missing.length){
        const missingStr=missing.map(v=>String(v));
        const qs2=await db.collection("mediu_invatare_pages")
          .where("chapterSlug","==",CHAP)
          .where("Index","in",missingStr)
          .get();
        qs2.forEach(doc=>{
          const d=doc.data(),i=(typeof d.Index==="number")?d.Index:parseInt(d.Index,10);
          if(!i||BUF[i]) return;
          BUF[i]=d;
          if(d.Image){
            const pr=priorityMap[i]||"low";
            try{ const {ready}=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=ready; ready.catch(()=>{});}catch(_){BUF[i].__imgReady=Promise.resolve();}
          } else BUF[i].__imgReady=Promise.resolve();
        });
      }
    }catch(_){
      for(const v of chunk){
        if(BUF[v]) continue;
        await prefetchQuestion(v);
      }
    }
  }
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

function revealNow(){
  D.body.classList.remove("page-loading");
  blurActive();
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (QWRAP||$(".question-wrapper"))?.classList.add("visible");
}

/* ====== REFS globale și helpers parametrizabile ====== */
const refs={
  qEl:null,qWrap:null,qText:null,progress:null,mainWrap:null,
  optWrap:null,cards:[],items:[],imgWrap:null,img:null,videoWrap:null,
  feedbackWrap:null,staticText:null,correctAns:null,
  /* desktop */
  buttonsWrap:null,submitBtn:null,explainBtn:null,aiBtn:null,
  /* mobile */
  buttonsWrapMobile:null,submitBtnMobile:null,explainBtnMobile:null,aiBtnMobile:null,
  /* accordion + ancore */
  acc:null,accHeader:null,accArrow:null,accContent:null,accBody:null,expLabelEl:null,accAnchor:null,
  anchorTop:null,anchor:null
};

/* Build refs pentru UN LAYER (fără a polua refs global) */
function buildRefs(rootLayer){
  const root = rootLayer || (QSEC||document);
  const need=(sel)=>root.querySelector(sel);

  const r={...refs};
  r.qEl=need(".questions-collection-list-item")||root;
  r.qWrap=need(".question-wrapper")||r.qEl;
  r.anchorTop=need(".explanation-anchor-top")||null;
  r.qText=need(".question-text");
  r.progress=need(".progress-counter");
  r.mainWrap=need(".main-content-wrapper");
  r.optWrap=need(".options-wrapper");
  r.cards=Array.from(r.optWrap?.querySelectorAll(".option-card")||[]);
  r.items=r.cards.map(c=>c.querySelector(".option-item"));
  r.imgWrap=need(".question-image-wrapper");
  r.img=need(".question-image");
  r.videoWrap=need(".explanation-video-wrapper")||null;

  /* desktop */
  r.buttonsWrap=need(".submit-next-buttons");
  r.submitBtn=r.buttonsWrap?.querySelector(".submit-btn")||null;
  r.explainBtn=r.buttonsWrap?.querySelector(".explanation-btn")||r.buttonsWrap?.querySelector(".explanation-card")||null;
  r.aiBtn=r.buttonsWrap?.querySelector(".ask-ai-btn")||r.buttonsWrap?.querySelector(".ai-pop-wrapper")||null;

  /* mobile */
  r.buttonsWrapMobile=need(".submit-next-buttons-mobile")||null;
  r.submitBtnMobile=r.buttonsWrapMobile?.querySelector(".submit-btn-mobile")||r.buttonsWrapMobile?.querySelector(".submit-btn")||null;
  r.explainBtnMobile=r.buttonsWrapMobile?.querySelector(".explanation-btn-mobile")||r.buttonsWrapMobile?.querySelector(".explanation-btn")||null;
  r.aiBtnMobile=r.buttonsWrapMobile?.querySelector(".ask-ai-btn-mobile")||r.buttonsWrapMobile?.querySelector(".ask-ai-btn")||null;

  /* accordion */
  r.acc=need(".custom-accordion")||null;
  r.accHeader=r.acc?.querySelector(".custom-accordion-header")||null;
  r.accArrow =r.acc?.querySelector(".custom-accordion-arrow")||null;
  r.accContent=r.acc?.querySelector(".custom-accordion-content")||null;
  r.accBody  =r.acc?.querySelector(".custom-accordion-body")||null;
  r.expLabelEl=r.acc?.querySelector(".custom-accordion-label")||null;
  r.accAnchor=r.acc?.querySelector(".accordion-anchor")||null;
  r.anchor=need(".explanation-anchor")||null;

  r.feedbackWrap=need(".feedback-wrapper");
  r.staticText=r.feedbackWrap?.querySelector(".correct-answer-static")||null;
  r.correctAns=r.feedbackWrap?.querySelector(".correct-answer")||null;

  return r;
}

/* Bindări per-layer (select opțiuni, explain/AI toggle, a11y) */
function bindPerLayerInteractions(r){
  if(!r||!r.qEl) return;

  /* select/deselect opțiuni */
  (r.cards||[]).forEach(card=>{
    if(card.dataset.boundSel==='1') return;
    card.addEventListener("click",()=>{
      if(ANSW) return;
      vibrateShort();
      const L=getLetterFromCard(card); if(!L) return;
      SEL=SEL.includes(L)?SEL.filter(x=>x!==L):SEL.concat(L);
      applySelectedVisualsFromSEL(r.qEl);
      hideAlertBox();
    },{passive:true});
    card.dataset.boundSel='1';
  });

  /* accordion */
  if(r.accHeader && !r.accHeader.dataset.boundAcc){
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
          const scroller=r.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(r.qEl);
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

  /* explain toggle (desktop+mobil) */
  const onExplainClick=()=>{
    vibrateShort();
    const opening = !isExplanationOpen(r);
    const scroller=r.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(r.qEl);
    if(opening){
      if(r.videoWrap){ r.videoWrap.style.display="block"; const v=r.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
      if(r.acc){ r.acc.style.display="block"; r.acc.classList.remove("open"); if(r.accContent) r.accContent.style.maxHeight="0px"; }
      renderExplainBtnUI(true,r);
      scrollContainerToAnchor(r.anchor,scroller,{behavior:"smooth"});
    }else{
      const v=r.videoWrap?.querySelector("video");
      if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
      if(r.videoWrap) r.videoWrap.style.display="none";
      if(r.acc){ r.acc.classList.remove("open"); r.acc.style.display="none"; if(r.accContent) r.accContent.style.maxHeight="0px"; }
      if(r.accArrow){ try{ r.accArrow.style.removeProperty("transform"); }catch(_){ } }
      renderExplainBtnUI(false,r);
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

  /* AI Chat */
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

/* ===== Helpers parametrizate pe refs ===== */
function setSubmitState(btn,state,{affectLayout=true}={}){ if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify": btn.textContent="VERIFICA"; btn.classList.add("is-verify","_preload-full"); if(affectLayout) btn.style.gridColumn="1 / 2"; break;
    case "next":{
      const last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZA":"CONTINUA";
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      if(affectLayout) btn.style.gridColumn="2 / 3";
      break;
    }
    case "finish": btn.textContent="FINALIZEAZA"; btn.classList.add("is-finish","finish-chapter-btn"); if(affectLayout) btn.style.gridColumn="2 / 3"; break;
  }
}
function setSubmitStateBoth(state,r=refs){
  setSubmitState(r.submitBtn, state, {affectLayout:true});
  setSubmitState(r.submitBtnMobile, state, {affectLayout:false});
}
function setSingleBtnState(on,r=refs){
  if(r.buttonsWrap) r.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(r.submitBtn) r.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(r.submitBtn) r.submitBtn.style.removeProperty("grid-column"); }
}
function forceAIChatText(btn){ if(!btn) return; btn.textContent="AI CHAT"; btn.setAttribute("aria-label","AI CHAT"); btn.setAttribute("role","button"); }
function applyAIChatText(r=refs){ forceAIChatText(r.aiBtn); forceAIChatText(r.aiBtnMobile); }

function getLetterFromCard(card){
  const el=card.querySelector(".option-letter"); if(!el) return "";
  for(const n of el.childNodes){ if(n.nodeType===Node.TEXT_NODE){ const t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase(); } }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearAllSelected(scope){ (scope||document).querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected").forEach(el=>el.classList.remove("selected")); (scope||document).querySelectorAll(".option-card.selected").forEach(el=>el.classList.remove("selected")); }
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
function isExplanationOpen(r=refs){
  const accOpen = !!(r.acc && r.acc.style.display!=="none" && (r.acc.classList.contains("open") || (r.accContent && r.accContent.style.maxHeight && r.accContent.style.maxHeight!=="0px")));
  const videoShown = !!(r.videoWrap && r.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(open,r=refs){
  const setOpen = (btn)=>{ if(!btn) return; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
  const setClosed = (btn)=>{ if(!btn) return; btn.textContent="EXPLICATIE"; };
  if(open){ setOpen(r.explainBtn); setOpen(r.explainBtnMobile); }
  else{ setClosed(r.explainBtn); setClosed(r.explainBtnMobile); }
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

/* ===== HYDRATE DOM (global, pentru layerul activ inițial) ===== */
function hydrateExistingDom(){
  const r=buildRefs(AB.active==='A'?AB.A:AB.B);
  if(!r.qText||!r.progress||!r.mainWrap||!r.optWrap||!(r.cards||[]).length||!r.buttonsWrap||!r.submitBtn||!r.feedbackWrap) return false;

  /* Forțează eticheta AI CHAT pe ambele butoane */
  applyAIChatText(r);

  if(r.accArrow){ try{ r.accArrow.style.removeProperty("transform"); }catch(_){ } }

  bindPerLayerInteractions(r);

  /* setează refs global pe layerul activ */
  Object.assign(refs,r);
  return true;
}

/* ===== Locks & aplicații vizuale ===== */
let transitioning=false;
function setButtonsTransitionLock(on,r=refs){
  transitioning=!!on;
  if(r.submitBtn){ r.submitBtn.setAttribute("aria-disabled",on?"true":"false"); r.submitBtn.classList.toggle("is-disabled",on); }
  if(r.submitBtnMobile){ r.submitBtnMobile.setAttribute("aria-disabled",on?"true":"false"); r.submitBtnMobile.classList.toggle("is-disabled",on); }
  if(r.buttonsWrap){ if(on) r.buttonsWrap.style.setProperty("pointer-events","none","important"); else r.buttonsWrap.style.removeProperty("pointer-events"); }
  if(r.buttonsWrapMobile){ if(on) r.buttonsWrapMobile.style.setProperty("pointer-events","none","important"); else r.buttonsWrapMobile.style.removeProperty("pointer-events"); }
}
function applyNoImageState(on,r=refs){
  if(!r.optWrap || !r.qEl) return;
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

/* ===== Video block (whitelist) parametrizat pe refs ===== */
function setVideoBlock(url,r=refs){
  if(!r.videoWrap) return;
  r.videoWrap.innerHTML=""; r.videoWrap.style.display="none";
  if(!url || !isSafeVideoUrl(url)) return;

  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    const safeSrc = url;
    html=`<video class="explanation-video plyr-player" controls playsinline><source src="${safeSrc}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); const yt=m?m[1]:"";
    if(yt){
      const src=`https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0`;
      html=`<div class="plyr__video-embed"><iframe src="${src}" allowfullscreen allowtransparency allow="autoplay"></iframe></div>`;
    }
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
    } else {
      playerEl.addEventListener("click",e=>{
        if(e.target.tagName==="BUTTON") return;
        e.stopPropagation(); try{ playerEl.paused?playerEl.play():playerEl.pause(); }catch(_){}
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
function stopActiveMedia(r=refs){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  const lottieEl=r.qEl?.querySelector(".lottie-animation-correct");
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  const v=r.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
}
async function seamlessSetImage(url,r=refs){
  if(!r.img){ applyNoImageState(true,r); return; }
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

/* === Randare întrbare într-un ROOT (layer inactiv) === */
async function renderQuestionInto(idx, layerDiv, {resetSelections=false}={}){
  const q=BUF[idx]; if(!q) return null;
  const r=buildRefs(layerDiv);
  if(!r.qText||!r.progress||!r.mainWrap||!r.optWrap||!(r.cards||[]).length||!r.buttonsWrap||!r.submitBtn||!r.feedbackWrap) return null;

  bindPerLayerInteractions(r);
  applyAIChatText(r);

  (r.qEl.querySelector(".chapter-text")||document.createElement("div")).textContent=sanitizeMaybe(chapterName);
  r.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(CUR)}/${pad2(TOTAL)}`;

  /* întrebare + opțiuni */
  r.qText.innerHTML=""; r.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(q.Question||""));
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  r.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=r.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });

  /* explicație scrisă */
  if(r.accBody){
    r.accBody.innerHTML="";
    const ex=q["Explanation"]||"";
    if(ex) r.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }

  /* ascundem explicația + AI până după verificare */
  r.feedbackWrap.style.display="none";
  if(r.correctAns) r.correctAns.textContent="";
  if(r.staticText) r.staticText.textContent="Raspunsul corect este:";
  renderExplainBtnUI(false,r);
  if(r.explainBtn) r.explainBtn.style.display="none";
  if(r.explainBtnMobile) r.explainBtnMobile.style.display="none";
  if(r.aiBtn) r.aiBtn.style.display="none";
  if(r.aiBtnMobile) r.aiBtnMobile.style.display="none";

  if(r.acc){ r.acc.style.display="none"; r.acc.classList.remove("open"); if(r.accContent) r.accContent.style.maxHeight="0px"; }
  if(r.accArrow){ try{ r.accArrow.style.removeProperty("transform"); }catch(_){ } }

  setVideoBlock(q["Explanation Video Link"]||"",r);

  /* reset selecții & stări */
  if(resetSelections) SEL=[];
  ANSW=false;
  clearLetterStates(r.qEl); clearAllSelected(r.qEl); clearWrongCards(r.qEl);

  /* starea butoanelor */
  setSingleBtnState(true,r);
  setSubmitStateBoth("verify",r);

  /* imagine (seamless) */
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(q.Image,r); } else { await seamlessSetImage("",r); }

  /* restaurare din Firestore (respectă sesiunea wrong-mode) */
  try{
    const snap=await ansCollection.doc(`${CHAP}_${idx}`).get();
    if(snap.exists){
      const d=snap.data();
      const selSaved=(d.selected||[]).map(x=>String(x||"").toUpperCase());
      const corSaved=(d.correct||[]).map(x=>String(x||"").toUpperCase());
      const answeredAtMs=+(d.answeredAtMs||0);
      const allowRestore = (!WRMODE) || (WRMODE && answeredAtMs && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
      if(allowRestore && selSaved.length>0){
        SEL=Array.from(new Set(selSaved)); applySelectedVisualsFromSEL(r.qEl);
        ANSW=true; clearLetterStates(r.qEl); applyLetterStatesByCorrect(r.qEl,corSaved); clearWrongCards(r.qEl); applyWrongCardsByCorrect(r.qEl,corSaved);
        const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
        if(r.staticText) r.staticText.textContent=same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
        const ord=["A","B","C"].filter(x=>corSaved.includes(x)); if(r.correctAns) r.correctAns.textContent=ord.join(", ");
        r.feedbackWrap.style.setProperty("display","flex","important");
        if(r.explainBtn) r.explainBtn.style.setProperty("display","flex","important");
        if(r.explainBtnMobile) r.explainBtnMobile.style.setProperty("display","flex","important");
        if(r.aiBtn) r.aiBtn.style.setProperty("display","flex","important");
        if(r.aiBtnMobile) r.aiBtnMobile.style.setProperty("display","flex","important");
        applyAIChatText(r);
        setSingleBtnState(false,r);
        const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
        setSubmitStateBoth((lastWrong||lastNormal)?"finish":"next",r);
      }
    }
  }catch(e){ console.warn("Restore answer failed:",e); }

  return r;
}

/* === Orchestrator UPDATE cu DOUBLE BUFFER A/B === */
async function updateInPlace(idx,{resetSelections=false}={}){
  const q=BUF[idx]; if(!q){ await showFinal(); return; }
  /* dacă nu avem A/B, fallback (nu ar trebui) */
  if(!AB.A||!AB.B||!AB.shell){
    /* fallback minimal: randăm în layerul activ */
    const r = await renderQuestionInto(idx, (AB.active==='A'?AB.A:AB.B), {resetSelections});
    if(r){ Object.assign(refs,r); }
    return;
  }

  setButtonsTransitionLock(true,refs);

  const curLayer = (AB.active==='A') ? AB.A : AB.B;
  const nextLayer= (AB.active==='A') ? AB.B : AB.A;

  /* păstrează înălțimea shell-ului ca placeholder (anti-reflow) */
  const prevH = curLayer.offsetHeight;
  if(prevH) AB.shell.style.minHeight = prevH + "px";

  /* randăm invizibil pe layerul inactiv */
  const localRefs = await renderQuestionInto(idx, nextLayer, {resetSelections});
  if(!localRefs){ setButtonsTransitionLock(false,refs); return; }

  /* cross-fade: swap active */
  curLayer.classList.remove("active");
  nextLayer.classList.add("active");
  AB.active = (AB.active==='A') ? 'B' : 'A';

  /* actualizează refs global cu layerul nou activ */
  Object.assign(refs, localRefs);

  /* finalizează */
  requestAnimationFrame(()=>{
    setTimeout(()=>{ AB.shell.style.minHeight=""; }, 280);
    setButtonsTransitionLock(false,refs);
  });
}

/* --- Failsafe: repară eventuale suprascrieri ale style.setProperty după updateInPlace --- */
function __repairStyleSetProperty(el){
  try{ if(el && el.style && typeof el.style.setProperty !== "function"){ delete el.style.setProperty; } }catch(_){}
}
(function(){
  const old = window.updateInPlace;
  if (typeof old === "function" && !old?.__wrappedForRepair) {
    const wrapped = async function(idx, opts){
      const out = await old(idx, opts||{});
      __repairStyleSetProperty(refs.aiBtnMobile);
      return out;
    };
    wrapped.__wrappedForRepair = true;
    window.updateInPlace = wrapped;
  }
})();

/* === INIT cu reluare wrong-mode (dacă exista) === */
const progSnap=await progRef.get();
let CUR_FROM_DB=null, FIN_FROM_DB=false;
if(progSnap.exists){
  CUR_FROM_DB=progSnap.data().currentIndex||null;
  FIN_FROM_DB=!!progSnap.data().finished;
  if(CUR_FROM_DB) CUR=CUR_FROM_DB;
  if(FIN_FROM_DB) FIN=true;
}
const persistedWM=await loadWrongModePersist();
if(!hydrateExistingDom()){ alert("Structura nu e completă. Verifică clasele HTML."); document.body.classList.remove("page-loading"); return; }
__repairStyleSetProperty(refs.aiBtnMobile);

if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
  WRMODE=true; WRONG=persistedWM.list.slice(0); WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
  WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();
  await prefetchQuestion(WRONG[WRP]); await prefetchAhead(WRONG[WRP]); await updateInPlace(WRONG[WRP],{resetSelections:true}); revealNow();
}else if(FIN){
  await showFinal(); document.body.classList.remove("page-loading");
}else{
  await prefetchQuestion(CUR); await prefetchAhead(CUR); await updateInPlace(CUR,{resetSelections:false}); revealNow();
}

const getActiveIndex=()=> WRMODE?WRONG[WRP]:CUR;

/* === AI pop-up (on-demand) === */
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
    const closeBtn=document.createElement("button"); closeBtn.className="ask-ai-pop-up-close"; closeBtn.textContent="Închide"; Object.assign(closeBtn.style,{marginLeft:"8px",padding:"8px 12px",borderRadius:"8px",border:"1px solid #3a3a3a",background:"#1d1dd",color:"#fff",cursor:"pointer"});
    box.append(mic,audioBtn,closeBtn); AIPop.appendChild(box); document.body.appendChild(AIPop);
  }
  AIPop.addEventListener("click",e=>{ if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){ vibrateShort(); AIPop.style.display="none"; document.body.style.overflow=""; }});
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS */ });
  return AIPop;
}

/* === Utilitar: litere corecte === */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
}


/* ============================================================
   BLOCLU 3: DOUBLE BUFFER A/B (cross-fade fără reflow)
   - Stivuim două "question-wrapper" identice (A și B) într-un
     container relativ, le randăm alternativ și facem swap cu
     fade + animare pe înălțime ca să nu existe flicker.
   ============================================================ */

(function(){
  "use strict";

  if(!refs || !refs.qWrap) return; // siguranță

  /* --- Creează containerul de grupare pentru stacking absolut --- */
  const wrapA = refs.qWrap;                   // wrapperul existent (vizibil)
  const group = document.createElement('div');// container relativ
  group.className = 'question-wrapper-group';
  Object.assign(group.style, {
    position: 'relative',
    width: '100%',
    transition: 'height .25s cubic-bezier(.4,0,.2,1)',
    willChange: 'height'
  });

  // Introducem group înaintea wrapperului și mutăm wrapperul în el
  const parent = wrapA.parentElement;
  parent.insertBefore(group, wrapA);
  group.appendChild(wrapA);

  // Dăm un nume clar wrapperului A
  wrapA.classList.add('question-wrapper-A', 'q-fade');
  wrapA.classList.add('visible'); // A pornește vizibil

  // Clonăm skeletonul pentru B (fără ID-uri duplicate)
  const wrapB = wrapA.cloneNode(true);
  wrapB.classList.remove('question-wrapper-A');
  wrapB.classList.add('question-wrapper-B');
  wrapB.classList.remove('visible'); // pornește invizibil
  // curățăm orice id duplicat din clonă
  wrapB.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  group.appendChild(wrapB);

  // Ambele wrappers sunt poziționate absolut și stivuite
  [wrapA, wrapB].forEach(w=>{
    Object.assign(w.style, {
      position: 'absolute',
      inset: '0',
      width: '100%'
    });
    // asigurăm clasa pentru fade (din CSS: .q-fade/.visible)
    w.classList.add('q-fade');
  });

  // Setăm înălțimea grupului la înălțimea conținutului activ
  const measure = el => {
    // dezactivăm overflow ascuns temporar dacă există
    const prev = el.style.overflow;
    el.style.overflow = 'visible';
    const h = el.offsetHeight;
    el.style.overflow = prev || '';
    return h;
  };
  group.style.height = measure(wrapA) + 'px';

  /* ------ Utilitare pentru colectarea & legarea refs per wrapper ------ */

  function collectRefsFromWrapper(w){
    const root = w.closest('.questions-collection-list-item') || w;
    const need = sel => root.querySelector(sel);

    const R = {
      qEl: root,
      qWrap: w,
      anchorTop: need('.explanation-anchor-top') || null,
      qText: need('.question-text') || null,
      progress: need('.progress-counter') || null,
      mainWrap: need('.main-content-wrapper') || null,
      optWrap: need('.options-wrapper') || null,
      cards: [],
      items: [],
      imgWrap: need('.question-image-wrapper') || null,
      img: need('.question-image') || null,
      videoWrap: need('.explanation-video-wrapper') || null,
      buttonsWrap: need('.submit-next-buttons') || null,
      submitBtn: null,
      explainBtn: null,
      aiBtn: null,
      buttonsWrapMobile: need('.submit-next-buttons-mobile') || null,
      submitBtnMobile: null,
      explainBtnMobile: null,
      aiBtnMobile: null,
      acc: need('.custom-accordion') || null,
      accHeader: null,
      accArrow: null,
      accContent: null,
      accBody: null,
      expLabelEl: null,
      accAnchor: null,
      anchor: need('.explanation-anchor') || null,
      feedbackWrap: need('.feedback-wrapper') || null,
      staticText: null,
      correctAns: null
    };

    if(R.optWrap){
      R.cards = Array.from(R.optWrap.querySelectorAll('.option-card'));
      R.items = R.cards.map(c=>c.querySelector('.option-item'));
    }

    if(R.buttonsWrap){
      R.submitBtn = R.buttonsWrap.querySelector('.submit-btn');
      R.explainBtn = R.buttonsWrap.querySelector('.explanation-btn, .explanation-card');
      R.aiBtn = R.buttonsWrap.querySelector('.ask-ai-btn, .ai-pop-wrapper');
    }
    if(R.buttonsWrapMobile){
      R.submitBtnMobile = R.buttonsWrapMobile.querySelector('.submit-btn-mobile, .submit-btn');
      R.explainBtnMobile = R.buttonsWrapMobile.querySelector('.explanation-btn-mobile, .explanation-btn');
      R.aiBtnMobile = R.buttonsWrapMobile.querySelector('.ask-ai-btn-mobile, .ask-ai-btn');
    }

    if(R.acc){
      R.accHeader = R.acc.querySelector('.custom-accordion-header');
      R.accArrow  = R.acc.querySelector('.custom-accordion-arrow');
      R.accContent= R.acc.querySelector('.custom-accordion-content');
      R.accBody   = R.acc.querySelector('.custom-accordion-body');
      R.expLabelEl= R.acc.querySelector('.custom-accordion-label');
      R.accAnchor = R.acc.querySelector('.accordion-anchor');
    }

    if(R.feedbackWrap){
      R.staticText = R.feedbackWrap.querySelector('.correct-answer-static');
      R.correctAns = R.feedbackWrap.querySelector('.correct-answer');
    }

    return R;
  }

  function bindInteractions(R){
    if(!R || !R.qEl) return;

    // Forțăm etichetele AI CHAT pe ambele butoane
    applyAIChatText();

    // Select/deselect pe carduri (dataset flags per element)
    (R.cards||[]).forEach(card=>{
      if(card.dataset.boundSel==='1') return;
      card.addEventListener('click', ()=>{
        if(ANSW) return;
        const L = getLetterFromCard(card);
        if(!L) return;
        SEL = SEL.includes(L) ? SEL.filter(x=>x!==L) : SEL.concat(L);
        applySelectedVisualsFromSEL(R.qEl);
        hideAlertBox();
      }, {passive:true});
      card.dataset.boundSel='1';
    });

    // Feedback tactil + toggling pentru accordion
    if(R.accHeader && !R.accHeader.dataset.boundAcc){
      bindPressFeedback(R.accHeader, R.accContent);
      R.accHeader.addEventListener('click', ()=>{
        const acc = R.acc, c = R.accContent; if(!acc) return;
        const opening = !acc.classList.contains('open');
        acc.classList.toggle('open', opening);
        if(opening){
          if(c){
            const prev=c.style.transition;
            c.style.display="block"; c.style.transition="none"; c.style.maxHeight="";
            const imgs=[...c.querySelectorAll("img")];
            Promise.all(imgs.map(im=>im.decode?im.decode():Promise.resolve())).catch(()=>{});
            const h=c.scrollHeight+"px";
            c.style.maxHeight=h; void c.offsetHeight;
            const scroller=R.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(R.qEl);
            const target=R.accAnchor||R.anchor;
            if(target) scrollContainerToAnchor(target,scroller,{behavior:"smooth"});
            requestAnimationFrame(()=>{ c.style.transition=prev||""; });
          }
        }else{
          if(R.accContent) R.accContent.style.maxHeight="0px";
        }
      });
      R.accHeader.dataset.boundAcc='1';
    }

    // EXPLICATIE (desktop + mobil) sincron pentru R
    const isOpen = ()=> {
      const accOpen = !!(R.acc && R.acc.style.display!=="none" && (R.acc.classList.contains("open") || (R.accContent && R.accContent.style.maxHeight && R.accContent.style.maxHeight!=="0px")));
      const videoShown = !!(R.videoWrap && R.videoWrap.style.display!=="none");
      return accOpen || videoShown;
    };
    const setExplainUI = open => {
      const setOpen = (btn)=>{ if(!btn) return; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
      const setClosed = (btn)=>{ if(!btn) return; btn.textContent="EXPLICATIE"; };
      if(open){ setOpen(R.explainBtn); setOpen(R.explainBtnMobile); }
      else{ setClosed(R.explainBtn); setClosed(R.explainBtnMobile); }
    };
    const onExplainClick = ()=>{
      vibrateShort();
      const opening = !isOpen();
      const scroller=R.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(R.qEl);
      if(opening){
        if(R.videoWrap){ R.videoWrap.style.display="block"; const v=R.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
        if(R.acc){ R.acc.style.display="block"; R.acc.classList.remove("open"); if(R.accContent) R.accContent.style.maxHeight="0px"; }
        setExplainUI(true);
        scrollContainerToAnchor(R.anchor,scroller,{behavior:"smooth"});
      }else{
        const v=R.videoWrap?.querySelector("video");
        if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
        if(R.videoWrap) R.videoWrap.style.display="none";
        if(R.acc){ R.acc.classList.remove("open"); R.acc.style.display="none"; if(R.accContent) R.accContent.style.maxHeight="0px"; }
        if(R.accArrow){ try{ R.accArrow.style.removeProperty("transform"); }catch(_){ } }
        setExplainUI(false);
        scrollContainerToAnchor(R.anchorTop,scroller,{behavior:"smooth"});
      }
    };
    if(R.explainBtn && !R.explainBtn.dataset.boundExp){
      R.explainBtn.addEventListener('click', onExplainClick);
      R.explainBtn.dataset.boundExp='1';
    }
    if(R.explainBtnMobile && !R.explainBtnMobile.dataset.boundExp){
      R.explainBtnMobile.addEventListener('click', onExplainClick);
      R.explainBtnMobile.dataset.boundExp='1';
    }

    // AI Pop (desktop + mobil)
    const onAiClick = ()=>{
      vibrateShort();
      const v=R.videoWrap?.querySelector("video");
      if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
      ensureAIPop().style.display="flex"; document.body.style.overflow="hidden";
    };
    if(R.aiBtn && !R.aiBtn.dataset.boundAi){
      R.aiBtn.addEventListener('click', onAiClick);
      R.aiBtn.dataset.boundAi='1';
    }
    if(R.aiBtnMobile && !R.aiBtnMobile.dataset.boundAi){
      R.aiBtnMobile.addEventListener('click', onAiClick);
      R.aiBtnMobile.dataset.boundAi='1';
    }
  }

  // Refs pentru A și B
  const refsA = collectRefsFromWrapper(wrapA);
  const refsB = collectRefsFromWrapper(wrapB);
  bindInteractions(refsA);
  bindInteractions(refsB);

  // Utilitar: copiere valorile din R în refs (fără a reatribui obiectul)
  const assignRefs = (R)=>{
    for(const k of Object.keys(refs)){ refs[k] = (k in R) ? R[k] : refs[k]; }
  };
  const snapshotRefs = ()=>{
    const o={}; for(const k of Object.keys(refs)){ o[k]=refs[k]; } return o;
  };

  // Stare internă A/B
  const STATE = { active: 'A' };
  const REFS  = { A: refsA, B: refsB };
  const WRAPS = { A: wrapA, B: wrapB };

  // Pre-randare în wrapperul inactiv folosind updateInPlace existent (dar cu refs temporar)
  async function prerenderInto(targetKey, idx, {wrmode=false}={}){
    const R = REFS[targetKey];
    const backupRefs = snapshotRefs();
    const curWRMODE = WRMODE, curCUR = CUR, curWRP = WRP;

    // simulăm progresul corect pentru textul "xx/yy" la next
    WRMODE = !!wrmode;
    if(WRMODE){ WRP = Math.min(WRONG.length-1, (WRP+1)); } else { CUR = Math.min(TOTAL, (CUR+1)); }

    assignRefs(R);
    try{
      await updateInPlace(idx, {resetSelections: !wrmode}); // în wrong mode resetăm selecțiile (flow dedicat)
    } finally {
      // revenim la starea reală
      assignRefs(backupRefs);
      WRMODE = curWRMODE; CUR = curCUR; WRP = curWRP;
    }
  }

  // Swap vizual cu cross-fade + ajustare înălțime container
  async function crossfadeTo(targetKey){
    const fromKey = STATE.active;
    if(fromKey === targetKey) return;

    const toEl   = WRAPS[targetKey];
    const fromEl = WRAPS[fromKey];

    // măsurăm înălțimea țintă
    const targetH = measure(toEl);
    group.style.height = targetH + 'px';

    // cross-fade
    toEl.classList.add('visible');
    fromEl.classList.remove('visible');

    // după tranziție, schimbăm activul
    STATE.active = targetKey;
    assignRefs(REFS[targetKey]);
  }

  // Handler A/B pentru butonul "CONTINUA" (interceptează din faza de captură)
  if(QSEC){
    QSEC.addEventListener('click', async (e)=>{
      const btn = e.target.closest('.submit-btn, .submit-btn-mobile');
      if(!btn) return;

      const isNext   = btn.classList.contains('is-next');
      const isFinish = btn.classList.contains('is-finish') || btn.classList.contains('finish-chapter-btn');

      // Lăsăm handlerul original să proceseze "FINISH"
      if(isFinish) return;

      // Interceptăm exclusiv "NEXT" după ce s-a verificat (ANSW==true)
      if(!isNext || !ANSW) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      stopActiveMedia();
      setButtonsTransitionLock(true);

      try{
        // chei A/B
        const inactiveKey = STATE.active === 'A' ? 'B' : 'A';

        if(WRMODE){
          const nextPos = WRP + 1;
          if(nextPos >= WRONG.length){
            // fallback: dacă apare un edge case, lăsăm logica veche (finish) să preia
            setButtonsTransitionLock(false);
            return;
          }
          const nextIdx = WRONG[nextPos];

          // Pre-randăm în inactiv cu progresul "WRP+1/len"
          await prerenderInto(inactiveKey, nextIdx, {wrmode:true});

          // Persistăm noua poziție înainte de swap (ca să fie corect la refresh)
          WRP = nextPos;
          await persistWrongMode({active:true, list:WRONG, pos:WRP});

          // Cross-fade
          await crossfadeTo(inactiveKey);

          // Prefetch și prune
          await prefetchAhead(nextIdx||0);
          pruneBUF();

          // Reinițializări locale
          SEL=[]; ANSW=false;

        }else{
          if(CUR >= TOTAL){
            // nimic de "next" – lăsăm handlerul original pentru finish
            setButtonsTransitionLock(false);
            return;
          }
          const nextIdx = CUR + 1;

          // Pre-randăm în inactiv ca și cum am fi la CUR+1
          await prerenderInto(inactiveKey, nextIdx, {wrmode:false});

          // Persistăm progresul înainte de swap
          CUR = nextIdx;
          try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}

          // Cross-fade
          await crossfadeTo(inactiveKey);

          // Prefetch și prune
          await prefetchAhead(CUR);
          pruneBUF();

          // Reinițializări locale
          SEL=[]; ANSW=false;
        }

      } catch(err){
        console.error('A/B NEXT error:', err);
        // Dacă ceva a eșuat, dăm voie handlerului vechi la următorul click
      } finally {
        setButtonsTransitionLock(false);
      }
    }, true); // CAPTURE = true => interceptăm înainte de handlerul inițial
  }

  // Ajustăm înălțimea grupului la resize (în funcție de wrapperul activ)
  window.addEventListener('resize', ()=>{
    const activeEl = WRAPS[STATE.active];
    group.style.height = measure(activeEl) + 'px';
  });

  // La prima încărcare, sincronizăm refs către A (activ)
  assignRefs(refsA);
  // și setăm înălțimea în caz că încă nu era vizibil
  requestAnimationFrame(()=>{ group.style.height = measure(wrapA) + 'px'; });

})(); // end IIFE Double Buffer
