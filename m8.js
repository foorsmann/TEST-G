window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* ——— helpers scurte ——— */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0");
const HAS_PLYR=!!(W&&W.Plyr);
const rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");
const log=(...x)=>console.log("[Mediu]",...x);
const warn=(...x)=>console.warn("[Mediu]",...x);
const err=(...x)=>console.error("[Mediu]",...x);

/* ——— loader ——— */
function ensureLoaderOn(){
  const l=$(".lesson-loader");
  if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
}
function ensureLoaderOff(){
  const l=$(".lesson-loader");
  if(!l) return;
  l.style.setProperty("display","none","important");
}

/* ——— QoL ——— */
function blurActive(){try{const ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch(_){}}
const vibrateShort=()=>{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(40); };

/* ——— pornim cu loader on ——— */
D.body.classList.add("page-loading");
ensureLoaderOn();

/* ——— alert toast ——— */
const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{AWrap.classList.remove("active");
    alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);
  },dur);
}
function hideAlertBox(){
  if(!AWrap) return;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.classList.remove("active"); AWrap.style.display="none";
}

/* ——— sunete ——— */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}

/* ——— fraze feedback ——— */
const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Gresit. Raspuns corect -","Nu e bine. Raspuns core -","Din pacate, nu. Raspuns core -","Mai incearca. Raspuns core -","Alegere gresita. Raspuns core -","Nu e varianta buna. Raspuns core -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

/* ——— parametri & Firebase ——— */
const params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); ensureLoaderOff(); D.body.classList.remove("page-loading"); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); ensureLoaderOff(); D.body.classList.remove("page-loading"); return; }
const auth=firebase.auth(),db=firebase.firestore();
const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie sa fii autentificat."); ensureLoaderOff(); D.body.classList.remove("page-loading"); location.href="/login"; return; }

/* ——— lock activ (dacă există funcția definită de tine) ——— */
try{
  if (window.installSingleActiveLock) {
    window.installSingleActiveLock({
      lockKey: "chapter:" + CHAP,
      redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
      userId: user.uid
    });
  }
}catch(e){ warn("SingleActiveLock indisponibil:",e); }

/* ——— referințe globale DOM ——— */
const QSEC=$(".question-section");
const QWRAP=(QSEC&&QSEC.querySelector(".question-wrapper"))||$(".question-wrapper");
const FINAL=$(".chapter-final-screen");
const CNT=(QSEC&&QSEC.querySelector(".questions-collection-list-item-wrapper"))||QSEC||D.body;
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }
if(QWRAP) QWRAP.classList.add("q-fade");

/* ——— colecții ——— */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* ——— capitol & total ——— */
const chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu exista in baza de date!"); ensureLoaderOff(); D.body.classList.remove("page-loading"); return; }
const chapterName=chapterDoc.data().Name||"";
async function getTotalCount(){
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s.size||0;
}
const TOTAL=await getTotalCount();

/* ——— bară finală – elemente ——— */
const chapterTextFinal=$(".chapter-text-final"),progressCounterFinal=$(".progress-counter-final"),barOuterFinal=$(".chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),barRedFinal=$(".chapter-final-screen .progress-red"),barGapFinal=$(".chapter-final-screen .progress-gap");
const legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent"),resetWrongBtn=$(".reset-wrong-questions-only");
if(legacyPercentEl) legacyPercentEl.style.display="none";
const RADIUS_PX=3,GAP_PX=3,GAP_COLOR="#070707",ANIM_DUR=900;

/* ——— asigură segmentele barei finale ——— */
(function(){ const o=barOuterFinal; if(!o) return;
  if(!barGreenFinal){barGreenFinal=D.createElement("span");barGreenFinal.className="progress-green";o.appendChild(barGreenFinal);}
  if(!barRedFinal){barRedFinal=D.createElement("span");barRedFinal.className="progress-red";o.appendChild(barRedFinal);}
  if(!barGapFinal){barGapFinal=D.createElement("span");barGapFinal.className="progress-gap";o.appendChild(barGapFinal);}
})();

function applyFinalBarBaseStyles(){
  const o=barOuterFinal; if(!o) return;
  Object.assign(o.style,{overflow:"hidden",position:"relative",display:"flex",borderRadius:`${RADIUS_PX}px`});
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
  const o=barOuterFinal; if(!o) return;
  applyFinalBarBaseStyles();
  const answeredPct=Math.max(0,Math.min(100,(+cPct||0)+(+wPct||0)));
  const hasBoth=(+cPct>0)&&(+wPct>0);
  if(answeredPct>0&&+cPct>0){
    if(hasBoth){
      barGreenFinal.style.width=`calc(${(cPct/answeredPct)*100}% - ${GAP_PX/2}px)`; barGreenFinal.style.left="0";
    }else{ barGreenFinal.style.width="100%"; barGreenFinal.style.left="0"; }
  }else{ barGreenFinal.style.width="0%"; barGreenFinal.style.left="0"; }
  if(answeredPct>0&&+wPct>0){
    if(hasBoth){
      const leftPct=(cPct/answeredPct)*100;
      barRedFinal.style.left=`calc(${leftPct}% + ${GAP_PX/2}px)`;
      barRedFinal.style.width=`calc(${(wPct/answeredPct)*100}% - ${GAP_PX/2}px)`;
    }else{ barRedFinal.style.left="0"; barRedFinal.style.width="100%"; }
  }else{ barRedFinal.style.left="0"; barRedFinal.style.width="0%"; }
  if(barGapFinal){
    if(hasBoth){
      const leftPct=(cPct/answeredPct)*100;
      barGapFinal.style.display="block";
      barGapFinal.style.left=`calc(${leftPct}% - ${GAP_PX/2}px)`;
    }else barGapFinal.style.display="none";
  }
  o.style.transition=`width ${d}ms cubic-bezier(.68,-0.55,.27,1.55)`; o.style.width="0%";
  ensureFinalPercentEl(); setFinalPercent("0%");
  const start=performance.now();
  const step=ts=>{
    const p=Math.min((ts-start)/d,1),val=Math.round(p*(+cPct||0));
    setFinalPercent(val+"%"); if(p<1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  requestAnimationFrame(()=>{ setTimeout(()=>{ o.style.width=`${answeredPct}%`; },40); });
}

/* ——— state ——— */
let BUF={},SEL=[],ANSW=false; let CUR=1,FIN=false;
let WRONG=[],WRMODE=false,WRP=0;
/* wrong-mode session stamp, pentru restore condiționat */
let WRONG_STARTED_AT_MS=0;
/* persist LS */
const LS_WRONG_KEY=`wm:${user.uid}:${CHAP}`;

/* ——— utils wrong-mode persist ——— */
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

/* ——— prefetch & image decode ——— */
function primeImage(url,{priority="auto"}={}){ const img=new Image(); img.decoding="async"; try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){} } img.src=url; const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;}); return {img,ready}; }
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
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]);
  if(!list.length) return;
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
  const fast=isFastNet(); const targets=[current+1]; if(fast) targets.push(current+2);
  const prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio); rIC(()=>{});
}
function pruneBUF(){
  const keep=new Set();
  if(!WRMODE){ [CUR-1,CUR,CUR+1,CUR+2].forEach(i=>{ if(i>0&&i<=TOTAL) keep.add(i); }); }
  else{ const a=WRONG[WRP-1],b=WRONG[WRP],c=WRONG[WRP+1],d=WRONG[WRP+2]; [a,b,c,d].forEach(i=>{ if(typeof i==="number") keep.add(i); }); }
  Object.keys(BUF).forEach(k=>{ const i=+k; if(!keep.has(i)) delete BUF[i]; });
}

/* ——— mici utilitare DOM ——— */
function getScrollParent(el){
  const qwi=el.closest?.(".question-wrapper-inner"); if(qwi) return qwi;
  let p=el.parentElement;
  while(p){
    const s=getComputedStyle(p),oy=s.overflowY;
    if(oy==="auto"||oy==="scroll"||oy==="overlay") return p;
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

/* ——— selectors + referințe pentru pagina întrebării ——— */
const refs={
  qEl:null,qWrap:null,qText:null,progress:null,mainWrap:null,
  optWrap:null,cards:[],items:[],imgWrap:null,img:null,videoWrap:null,
  feedbackWrap:null,staticText:null,correctAns:null,
  buttonsWrap:null,submitBtn:null,explainBtn:null,aiBtn:null,
  acc:null,accHeader:null,accArrow:null,accContent:null,accBody:null,expLabelEl:null,accAnchor:null,
  anchorTop:null,anchor:null
};

/* ——— “hidratează” DOM cu clasele din proiect ——— */
function ensureAIChatLabel(force=false){
  if(!refs.aiBtn) return;
  const t=(refs.aiBtn.textContent||"").trim(); if(force||!t) refs.aiBtn.textContent="AI CHAT";
  refs.aiBtn.setAttribute("aria-label","AI CHAT"); refs.aiBtn.setAttribute("role","button");
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

function hydrateExistingDom(){
  const root=QSEC||D, need=sel=>root.querySelector(sel);
  refs.qEl=need(".questions-collection-list-item")||root;
  refs.qWrap=need(".question-wrapper")||refs.qEl;
  refs.anchorTop=need(".explanation-anchor-top")||null;

  refs.qText=need(".question-text");
  refs.progress=need(".progress-counter");
  refs.mainWrap=need(".main-content-wrapper");
  refs.optWrap=need(".options-wrapper");
  refs.imgWrap=need(".question-image-wrapper");
  refs.img=need(".question-image");
  refs.videoWrap=need(".explanation-video-wrapper")||null;

  if(!refs.qText||!refs.progress||!refs.mainWrap||!refs.optWrap){
    err("Structura lipsă. Verifică clasele: .question-text, .progress-counter, .main-content-wrapper, .options-wrapper");
    return false;
  }

  refs.cards=a(".option-card",refs.optWrap);
  refs.items=refs.cards.map(c=>c.querySelector(".option-item"));

  refs.acc=need(".custom-accordion")||null;
  refs.accHeader=refs.acc?.querySelector(".custom-accordion-header")||null;
  refs.accArrow =refs.acc?.querySelector(".custom-accordion-arrow")||null;
  refs.accContent=refs.acc?.querySelector(".custom-accordion-content")||null;
  refs.accBody  =refs.acc?.querySelector(".custom-accordion-body")||null;
  refs.expLabelEl=refs.acc?.querySelector(".custom-accordion-label")||null;
  refs.accAnchor=refs.acc?.querySelector(".accordion-anchor")||null;

  refs.anchor=need(".explanation-anchor")||null;
  refs.feedbackWrap=need(".feedback-wrapper");
  refs.staticText=refs.feedbackWrap?.querySelector(".correct-answer-static")||null;
  refs.correctAns=refs.feedbackWrap?.querySelector(".correct-answer")||null;

  refs.buttonsWrap=need(".submit-next-buttons");
  refs.submitBtn=refs.buttonsWrap?.querySelector(".submit-btn")||null;
  refs.explainBtn=refs.buttonsWrap?.querySelector(".explanation-btn")||refs.buttonsWrap?.querySelector(".explanation-card")||null;
  refs.aiBtn=refs.buttonsWrap?.querySelector(".ask-ai-btn")||refs.buttonsWrap?.querySelector(".ai-pop-wrapper")||null;
  ensureAIChatLabel(true);

  if(!refs.feedbackWrap||!refs.submitBtn){
    err("Structură butoane/feedback incompletă.");
    return false;
  }

  if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){} }

  // click pe card opțiune
  refs.cards.forEach(card=>{
    if(card.dataset.boundSel==='1') return;
    card.addEventListener("click",()=>{
      if(ANSW) return;
      vibrateShort();
      const L=getLetterFromCard(card); if(!L) return;
      SEL=SEL.includes(L)?SEL.filter(x=>x!==L):SEL.concat(L);
      applySelectedVisualsFromSEL(refs.qEl); hideAlertBox();
    },{passive:true});
    card.dataset.boundSel='1';
  });

  // accordion
  if(refs.accHeader && !refs.accHeader.dataset.boundAcc){
    bindPressFeedback(refs.accHeader,refs.accContent);
    refs.accHeader.addEventListener("click",async()=>{
      const acc=refs.acc, c=refs.accContent; if(!acc) return;
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
          const target=refs.accAnchor||refs.anchor;
          if(target) scrollContainerToAnchor(target,scroller,{behavior:"smooth"});
          requestAnimationFrame(()=>{ c.style.transition=prev||""; });
        }
      }else{
        if(refs.accContent){ refs.accContent.style.maxHeight="0px"; }
      }
    });
    refs.accHeader.dataset.boundAcc='1';
  }

  // buton explicație
  if(refs.explainBtn && !refs.explainBtn.dataset.boundExp){
    refs.explainBtn.addEventListener("click",()=>{
      vibrateShort();
      // toggle explicit
      const opening=(refs.explainBtn && refs.explainBtn.innerHTML.indexOf("<svg")===-1);
      const scroller=refs.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(refs.qEl);
      if(opening){
        if(refs.videoWrap){ refs.videoWrap.style.display="block"; const v=refs.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
        if(refs.acc){ refs.acc.style.display="block"; refs.acc.classList.remove("open"); if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
        refs.explainBtn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`;
        scrollContainerToAnchor(refs.anchor,scroller,{behavior:"smooth"});
      }else{
        const v=refs.videoWrap?.querySelector("video");
        if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
        if(refs.videoWrap) refs.videoWrap.style.display="none";
        if(refs.acc){ refs.acc.classList.remove("open"); refs.acc.style.display="none"; if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
        if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){ } }
        refs.explainBtn.textContent="EXPLICATIE";
        scrollContainerToAnchor(refs.anchorTop,scroller,{behavior:"smooth"});
      }
    });
    refs.explainBtn.dataset.boundExp='1';
  }

  // buton AI
  if(refs.aiBtn && !refs.aiBtn.dataset.boundAi){
    ensureAIChatLabel(true);
    refs.aiBtn.addEventListener("click",()=>{
      vibrateShort();
      const v=refs.videoWrap?.querySelector("video");
      if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
      ensureAIPop().style.display="flex"; D.body.style.overflow="hidden";
    });
    refs.aiBtn.dataset.boundAi='1';
  }

  return true;
}

/* ——— select/mark helpers ——— */
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

/* ——— video block ——— */
function setVideoBlock(url){
  if(!refs.videoWrap) return;
  refs.videoWrap.innerHTML=""; refs.videoWrap.style.display="none"; if(!url) return;

  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html=`<video class="explanation-video plyr-player" controls playsinline><source src="${url}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); const yt=m?m[1]:"";
    if(yt) html=`<div class="plyr__video-embed"><iframe src="https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0" allowfullscreen allowtransparency allow="autoplay"></iframe></div>`;
  }
  if(!html) return;
  refs.videoWrap.innerHTML=html; refs.videoWrap.style.display="none";

  const playerEl=refs.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    if(HAS_PLYR&&playerEl.plyr){
      playerEl.addEventListener("click",e=>{
        if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return;
        e.stopPropagation(); try{ playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play(); }catch(_){}
      });
    }else{
      playerEl.addEventListener("click",e=>{
        if(e.target.tagName==="BUTTON") return;
        e.stopPropagation(); try{ playerEl.paused?playerEl.play():playerEl.pause(); }catch(_){}
      });
    }

    // auto-pause când iese din viewport (după ce user a dat play)
    playerEl._hasUserPlayed=false; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false;
    playerEl.addEventListener("play",()=>{ playerEl._hasUserPlayed=true; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false; });
    const scroller=refs.qEl?.querySelector(".question-wrapper-inner")||getScrollParent(refs.qEl)||null, vw=refs.videoWrap;
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

function stopActiveMedia(){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  const lottieEl=refs.qEl?.querySelector(".lottie-animation-correct");
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  const v=refs.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}

/* ——— imagine ——— */
function applyNoImageState(on){
  if(!refs.optWrap || !refs.qEl) return;
  if(on){
    refs.qEl.classList.add("no-image");
    refs.optWrap.style.minHeight="40vh";
    if(refs.imgWrap) refs.imgWrap.style.display="none";
  }else{
    refs.qEl.classList.remove("no-image");
    refs.optWrap.style.minHeight="";
    if(refs.imgWrap) refs.imgWrap.style.display="";
  }
}
async function seamlessSetImage(url){
  if(!refs.img){ applyNoImageState(true); return; }
  if(!url){
    refs.img.removeAttribute("src");
    refs.img.style.display="none";
    refs.img.setAttribute("aria-hidden","true");
    applyNoImageState(true);
    return;
  }
  try{
    const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
    tmp.src=url;
    if(tmp.decode) await tmp.decode(); else await new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
  }catch(_){}
  if(refs.img.src!==url) refs.img.src=url;
  refs.img.classList.add("is-fading"); void refs.img.offsetWidth;
  refs.img.style.display=""; refs.img.removeAttribute("aria-hidden");
  applyNoImageState(false);
  requestAnimationFrame(()=>{ refs.img.classList.remove("is-fading"); });
  refs.img.onerror=()=>{
    refs.img.removeAttribute("src");
    refs.img.style.display="none";
    refs.img.setAttribute("aria-hidden","true");
    applyNoImageState(true);
  };
}

/* ——— reveal+failsafe ——— */
function revealNow(){
  D.body.classList.remove("page-loading");
  blurActive();
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (QWRAP||$(".question-wrapper"))?.classList.add("visible");
  ensureLoaderOff();
}

/* ——— image helper pentru pre-decode din buffer ——— */
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
}

/* ——— stare de tranziție butoane ——— */
let transitioning=false;
function setButtonsTransitionLock(on){
  transitioning=!!on;
  if(refs.submitBtn){ refs.submitBtn.setAttribute("aria-disabled",on?"true":"false"); refs.submitBtn.classList.toggle("is-disabled",on); }
  if(refs.buttonsWrap){ if(on) refs.buttonsWrap.style.setProperty("pointer-events","none","important"); else refs.buttonsWrap.style.removeProperty("pointer-events"); }
}

/* ——— state submit button ——— */
function setSubmitState(btn,state){
  if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify":
      btn.textContent="VERIFICA";
      btn.classList.add("is-verify","_preload-full");
      btn.style.gridColumn="1 / 2";
      break;
    case "next": {
      const last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZA":"CONTINUA";
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      btn.style.gridColumn="2 / 3";
      break;
    }
    case "finish":
      btn.textContent="FINALIZEAZA";
      btn.classList.add("is-finish","finish-chapter-btn");
      btn.style.gridColumn="2 / 3";
      break;
  }
}

/* ——— AI pop-up minimal (folosit la click pe AI) ——— */
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
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS (placeholder) */ });
  return AIPop;
}

/* ——— parser pentru răspunsuri corecte ——— */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"")
    .split(",")
    .map(x=>String(x||"").trim().toUpperCase())
    .filter(x=>x==="A"||x==="B"||x==="C");
}

/* ——— update UI in-place pentru indexul activ ——— */
async function updateInPlace(idx,{resetSelections=false}={}){
  setButtonsTransitionLock(true);
  const q=BUF[idx];
  if(!q){ await showFinal(); return; }

  const container=refs.qWrap||(QWRAP||$(".question-wrapper"))||D.body;
  const prevH=container.offsetHeight;
  container.classList.add("no-transition","is-preparing");
  if(prevH) container.style.minHeight=prevH+"px";

  (refs.qEl.querySelector(".chapter-text")||D.createElement("div")).textContent=chapterName||"";
  refs.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(CUR)}/${pad2(TOTAL)}`;

  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (QWRAP||refs.qWrap||refs.qEl)?.classList.add("visible");

  // text întrebare
  refs.qText.innerHTML=""; refs.qText.insertAdjacentHTML("afterbegin",String(q.Question||""));

  // opțiuni A/B/C
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  refs.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=refs.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",String(val)); }
    card.style.display = val ? "" : "none";
  });

  // explicații
  if(refs.accBody){
    refs.accBody.innerHTML=""; const ex=q["Explanation"]||"";
    if(ex) refs.accBody.insertAdjacentHTML("afterbegin",String(ex));
  }

  // ascunde feedback / accordeon la început
  refs.explainBtn&&(refs.explainBtn.style.display="none");
  refs.aiBtn&&(refs.aiBtn.style.display="none");
  if(refs.feedbackWrap) refs.feedbackWrap.style.display="none";
  if(refs.correctAns) refs.correctAns.textContent="";
  if(refs.staticText) refs.staticText.textContent="Raspunsul corect este:";
  if(refs.explainBtn) refs.explainBtn.textContent="EXPLICATIE";

  if(refs.acc){ refs.acc.style.display="none"; refs.acc.classList.remove("open"); if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
  if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){} }

  // video
  setVideoBlock(q["Explanation Video Link"]||"");

  // reset selecții/stări
  if(resetSelections) SEL=[];
  ANSW=false;
  clearLetterStates(refs.qEl);
  clearAllSelected(refs.qEl);
  clearWrongCards(refs.qEl);

  refs.buttonsWrap.classList.add("single-btn-state");
  setSubmitState(refs.submitBtn,"verify");

  // imagine (cu decode înainte)
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(q.Image); } else { await seamlessSetImage(""); }

  // restaurare răspuns doar dacă nu e wrong-mode SAU e wrong-mode din aceeași sesiune
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
        clearLetterStates(refs.qEl); applyLetterStatesByCorrect(refs.qEl,corSaved);
        clearWrongCards(refs.qEl);   applyWrongCardsByCorrect(refs.qEl,corSaved);

        const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
        if(refs.staticText) refs.staticText.textContent=same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
        const ord=["A","B","C"].filter(x=>corSaved.includes(x)); if(refs.correctAns) refs.correctAns.textContent=ord.join(", ");

        if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","flex","important");
        refs.explainBtn?.style.setProperty("display","flex","important");
        refs.aiBtn?.style.setProperty("display","flex","important"); ensureAIChatLabel(true);

        refs.buttonsWrap.classList.remove("single-btn-state");
        const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
        setSubmitState(refs.submitBtn,(lastWrong||lastNormal)?"finish":"next");
      }
    }
  }catch(e){ warn("Restore answer failed:",e); }

  requestAnimationFrame(()=>{
    container.classList.remove("no-transition","is-preparing");
    container.style.minHeight="";
    setButtonsTransitionLock(false);
  });
}

/* ——— Final screen + prebuild wrong list ——— */
let WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;

async function showFinal(){
  if(chapterTextFinal) chapterTextFinal.textContent=chapterName||"";

  const answersSnap=await ansCollection.where("chapterSlug","==",CHAP).get();

  // buton reset wrong vizibil doar dacă există greșite
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

  // calculează procente
  let correct=0,wrong=0;
  answersSnap.forEach(doc=>{
    const d=doc.data();
    const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
    if(sel&&sel===cor) correct++; else if(sel) wrong++;
  });
  const safeTotal=(TOTAL&&TOTAL>0)?TOTAL:Math.max(1,correct+wrong);
  const cPct=Math.round((correct/safeTotal)*100),wPct=Math.round((wrong/safeTotal)*100);

  ensureLoaderOff();
  ensureFinalPercentEl(); setFinalPercent("0%");
  animateFinalProgress(cPct,wPct,ANIM_DUR);
  FINAL?.style.setProperty("display","flex","important");

  // PREP wrong pentru start rapid + prefetch
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

/* ——— init progres ——— */
const progSnap=await progRef.get();
if(progSnap.exists){
  if(progSnap.data().currentIndex) CUR=progSnap.data().currentIndex;
  if(progSnap.data().finished) FIN=true;
}

/* ——— hidratează DOM înainte de orice ——— */
if(!hydrateExistingDom()){
  alert("Structura nu e completă. Verifică clasele HTML.");
  D.body.classList.remove("page-loading"); ensureLoaderOff();
  return;
}

/* ——— reluare wrong-mode dacă era activ ——— */
const persistedWM=await loadWrongModePersist();
if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
  WRMODE=true;
  WRONG=persistedWM.list.slice(0);
  WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
  WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();
  await prefetchQuestion(WRONG[WRP]);
  await prefetchAhead(WRONG[WRP]);
  await updateInPlace(WRONG[WRP],{resetSelections:true});
  revealNow();
}else if(FIN){
  await showFinal();
  D.body.classList.remove("page-loading"); ensureLoaderOff();
}else{
  await prefetchQuestion(CUR);
  await prefetchAhead(CUR);
  await updateInPlace(CUR,{resetSelections:false});
  revealNow();
}

/* ——— util index activ ——— */
const getActiveIndex=()=> WRMODE?WRONG[WRP]:CUR;

/* ——— handler SUBMIT/NEXT/FINISH ——— */
QSEC?.addEventListener("click",async(e)=>{
  const submitBtn=e.target.closest(".submit-btn"); if(!submitBtn) return;
  e.preventDefault(); vibrateShort();

  const idx=getActiveIndex(); if(!refs.qEl) return;
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
        await showFinal(); return;
      }
      await persistWrongMode({active:true,list:WRONG,pos:WRP});
      await prefetchAhead(WRONG[WRP]||0); pruneBUF(); SEL=[]; ANSW=false;
      await updateInPlace(WRONG[WRP],{resetSelections:true}); return;
    }else{
      if(CUR<TOTAL){
        CUR++; try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}
        await prefetchAhead(CUR); pruneBUF(); SEL=[]; ANSW=false;
        await updateInPlace(CUR,{resetSelections:false});
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
      refs.buttonsWrap.classList.add("single-btn-state"); submitBtn.style.gridColumn="1 / 2";
      return;
    }
    const q=BUF[idx]; if(!q) return;
    const cor=parseCorrectLetters(q);
    ANSW=true;

    clearLetterStates(refs.qEl); applyLetterStatesByCorrect(refs.qEl,cor);
    clearWrongCards(refs.qEl);   applyWrongCardsByCorrect(refs.qEl,cor);

    const selected=SEL.slice().sort().join(","), correct=cor.slice().sort().join(","),
          isFullyCorrect=selected.length>0&&selected===correct;

    if(refs.staticText) refs.staticText.textContent=isFullyCorrect?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
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

    if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","flex","important");
    refs.explainBtn?.style.setProperty("display","flex","important");
    refs.aiBtn?.style.setProperty("display","flex","important"); ensureAIChatLabel(true);

    refs.buttonsWrap.classList.remove("single-btn-state");
    const lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
    setSubmitState(refs.submitBtn,(lastWrong||lastNormal)?"finish":"next");

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
    ]).catch(er=>{
      err("Eroare salvare raspuns/progres:",er);
      toast("Conexiune slabă – reîncerc…",1200);
    });
  }
});

/* ——— Wrong list builder ——— */
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

/* ——— Wrong-mode start safe ——— */
async function startWrongModeSafe(){
  if(START_WRONG_IN_PROGRESS) return;
  START_WRONG_IN_PROGRESS=true;
  vibrateShort(); stopActiveMedia();

  const loaderEl=$(".lesson-loader");
  const container=refs.qWrap||(QWRAP||$(".question-wrapper"))||D.body;

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
      alert("Nu ai nicio intrebare gresita de refacut la acest capitol!");
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
    await updateInPlace(WRONG[WRP],{resetSelections:true});
    await prefetchAhead(WRONG[WRP]||0);

  }catch(e){
    err("EROARE la wrong-mode (safe):",e);
    alert("A apărut o eroare la încărcarea intrebarilor greșite.");
    FINAL?.style.setProperty("display","flex","important");
  }finally{
    if(loaderEl) loaderEl.style.setProperty("display","none","important");
    D.body.classList.remove("page-loading");
    if(container){ container.classList.remove("no-transition","is-preparing"); container.style.minHeight=""; }
    START_WRONG_IN_PROGRESS=false;
  }
}

/* ——— Next chapter ——— */
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

/* ——— delegări globale pe final screen ——— */
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
      alert("Eroare la resetarea progresului. Incearcă din nou.");
      if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important");
    }
    return;
  }
  if(e.target.closest(".back-to-chapter-final-screen")){
    vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important"); return;
  }
});

/* ——— acces rapid: Enter = submit, Esc = închide pop-up/loader ——— */
D.addEventListener("keydown",e=>{
  if(e.key==="Enter"){ const btn=refs.submitBtn; if(btn){ e.preventDefault(); btn.click(); } }
  else if(e.key==="Escape"){
    try{
      D.querySelectorAll(".alert-wrapper-new.active").forEach(w=>{w.classList.remove("active"); w.style.display="none";});
      const aiPop=$(".ask-ai-pop-up"); if(aiPop) aiPop.style.display="none";
      const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
      D.body.classList.remove("page-loading"); D.body.style.overflow="";
    }catch(_){}
  }
});

/* ——— failsafe final ——— */
D.body.classList.remove("page-loading");
ensureLoaderOff();
blurActive();

/* ——— END Webflow.push ——— */
});
