window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0"),HAS_PLYR=!!(W&&W.Plyr),rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");
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

/* ===== Helpers UI: visibility + pressed feedback ===== */
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
/* NOTĂ: las login-ul inițial neschimbat pentru stabilitate platformă */
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

const QSEC=$(".question-section");
const QWRAP=(QSEC&&QSEC.querySelector(".question-wrapper"))||$(".question-wrapper");
if(QWRAP) QWRAP.classList.add("q-fade");
const FINAL=$(".chapter-final-screen");
const CNT=(QSEC&&QSEC.querySelector(".questions-collection-list-item-wrapper"))||QSEC||D.body;
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

/* Sunete */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}

/* Toast alert */
const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){ if(!AWrap) return; const t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{AWrap.classList.remove("active");alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);},dur);
}
function hideAlertBox(){ if(!AWrap) return; if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;} AWrap.classList.remove("active");AWrap.style.display="none"; }

/* Vibrație scurtă pe acțiuni */
const vibrateShort=()=>{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(50); };
D.body.addEventListener("click",e=>{
  if(e.target.closest(".custom-accordion-header,.back-btn,.next-chapter-btn,.reset-chapter-btn,.confirm-reset-chapter,.back-to-chapter-final-screen,.close-btn")) vibrateShort();
});

/* Texte statice */
const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Gresit. Raspuns corect -","Nu e bine. Raspuns core -","Din pacate, nu. Raspuns core -","Mai incearca. Raspuns core -","Alegere gresita. Raspuns core -","Nu e varianta buna. Raspuns core -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

/* === SANITIZARE ACTIVĂ — folosește allowlist dacă e disponibil === */
const SANITIZE_CONTENT=true;
const sanitizeMaybe = (html) => {
  if (!SANITIZE_CONTENT) return html || "";
  if (W.__sanitizeAllowlist) return W.__sanitizeAllowlist(html);
  if (W.__safeTextHTML) return W.__safeTextHTML(html);
  const d=D.createElement("div"); d.textContent=String(html||""); return d.innerHTML;
};

/* Capitol + TOTAL */
const chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu exista in baza de date!"); return; }
const chapterName=chapterDoc.data().Name;

async function getTotalCount(){ 
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get(); 
  return s.size; 
}
const TOTAL=await getTotalCount();

/* Colecții user */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* Elemente ecran final */
const chapterTextFinal=$(".chapter-text-final"),progressCounterFinal=$(".progress-counter-final"),barOuterFinal=$(".chapter-progress-bar-outer");
let barGreenFinal=$(".chapter-final-screen .progress-green"),barRedFinal=$(".chapter-final-screen .progress-red"),barGapFinal=$(".chapter-final-screen .progress-gap");
const legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent"),resetWrongBtn=$(".reset-wrong-questions-only");
if(legacyPercentEl) legacyPercentEl.style.display="none";

/* Bară progres finală */
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

/* --- State --- */
let BUF={},SEL=[],ANSW=false; let CUR=1,FIN=false; let WRONG=[],WRMODE=false,WRP=0;
let WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;
/* wrong-mode sesiune curentă */
let WRONG_STARTED_AT_MS=0;
/* persist localStorage */
const LS_WRONG_KEY=`wm:${user.uid}:${CHAP}`;

/* helpers wrong-mode persist */
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

/* ===== Prefetch imagini / întrebări ===== */
function primeImage(url,{priority="auto"}={}){ 
  const img=new Image(); 
  img.decoding="async"; 
  try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){} } 
  img.src=url; 
  const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;}); 
  return {img,ready}; 
}

/* Fetch 1-1 fallback (Index == idx) */
async function prefetchQuestion(idx){
  if(!idx||BUF[idx]) return;
  let snap=await db.collection("mediu_invatare_pages")
                  .where("chapterSlug","==",CHAP)
                  .where("Index","==",idx)
                  .limit(1).get();
  if(snap.empty){
    try{
      snap=await db.collection("mediu_invatare_pages")
                   .where("chapterSlug","==",CHAP)
                   .where("Index","==",String(idx))
                   .limit(1).get();
    }catch(_){}
  }
  if(snap.empty) return;
  const data=snap.docs[0].data(); BUF[idx]=data;
  if(data.Image){ 
    try{ const {ready}=primeImage(data.Image,{priority:"auto"}); BUF[idx].__imgReady=ready; ready.catch(()=>{}); }
    catch(_){ BUF[idx].__imgReady=Promise.resolve(); } 
  } else { BUF[idx].__imgReady=Promise.resolve(); }
}

/* ✅ CHUNKING „in ≤ 10”: grupuri de 10, fără a cere mai mult decât soliciți */
async function prefetchMany(indices,priorityMap={}){
  const pending=(indices||[])
    .filter(v => v && v>=1 && (!TOTAL || v<=TOTAL) && !BUF[v]);
  if(!pending.length) return;

  try{
    for(let i=0;i<pending.length;i+=10){
      const group=pending.slice(i,i+10);
      const qs=await db.collection("mediu_invatare_pages")
                       .where("chapterSlug","==",CHAP)
                       .where("Index","in",group)
                       .get();

      qs.forEach(doc=>{
        const d=doc.data(), idx=d.Index;
        if(!idx || BUF[idx]) return;
        BUF[idx]=d;

        if(d.Image){
          const pr = priorityMap[idx] || "low";
          try{
            const {ready} = primeImage(d.Image,{priority:pr});
            BUF[idx].__imgReady = ready; 
            ready.catch(()=>{});
          }catch(_){
            BUF[idx].__imgReady = Promise.resolve();
          }
        }else{
          BUF[idx].__imgReady = Promise.resolve();
        }
      });
    }
  }catch(_){
    // fallback 1-by-1 dacă „in” nu e disponibil
    await Promise.all(pending.map(v=>prefetchQuestion(v)));
  }
}

/* Prefetch „înainte” conservator (nu tragem mult) */
async function prefetchAhead(current){
  const fast=isFastNet();
  const targets=[current+1];
  if(fast) targets.push(current+2);
  const prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio);
  rIC(()=>{});
}

/* === PATCH critic: fără for..in pe obiecte string-likes — păstrat === */
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
  const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
}

/* ===== Stări buton submit (desktop + mobil) ===== */
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
function setSubmitStateBoth(state){
  setSubmitState(refs.submitBtn, state, {affectLayout:true});         /* Desktop */
  setSubmitState(refs.submitBtnMobile, state, {affectLayout:false});  /* Mobil */
}
function setSingleBtnState(on){
  if(refs.buttonsWrap) refs.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(refs.submitBtn) refs.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(refs.submitBtn) refs.submitBtn.style.removeProperty("grid-column"); }
}

/* ===== Eticheta AI CHAT – forțată pe desktop + mobile ===== */
function forceAIChatText(btn){
  if(!btn) return;
  btn.textContent="AI CHAT";
  btn.setAttribute("aria-label","AI CHAT");
  btn.setAttribute("role","button");
}
function applyAIChatText(){
  forceAIChatText(refs.aiBtn);
  forceAIChatText(refs.aiBtnMobile);
}

/* ===== Option helpers ===== */
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

/* ===== Explicații: UI sincron desktop + mobile ===== */
function isExplanationOpen(){
  const accOpen = !!(refs.acc && refs.acc.style.display!=="none" && (refs.acc.classList.contains("open") || (refs.accContent && refs.accContent.style.maxHeight && refs.accContent.style.maxHeight!=="0px")));
  const videoShown = !!(refs.videoWrap && refs.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(open){
  const setOpen = (btn)=>{ if(!btn) return; btn.innerHTML=`<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>`; };
  const setClosed = (btn)=>{ if(!btn) return; btn.textContent="EXPLICATIE"; };
  if(open){ setOpen(refs.explainBtn); setOpen(refs.explainBtnMobile); }
  else{ setClosed(refs.explainBtn); setClosed(refs.explainBtnMobile); }
}

/* ===== Final screen + pregătire WRONG ===== */
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
  document.querySelector(".lesson-loader")?.style.setProperty("display","none","important");
  ensureFinalPercentEl(); setFinalPercent("0%"); animateFinalProgress(cPct,wPct,ANIM_DUR);
  FINAL?.style.setProperty("display","flex","important");

  /* PREP wrong list + prefetch + decode pentru PRIMA întrebare */
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

/* ===== REFS (desktop + mobil) ===== */
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

/* ===== HYDRATE DOM (desktop + mobile) ===== */
function hydrateExistingDom(){
  const root=QSEC||document, need=sel=>root.querySelector(sel);
  refs.qEl=need(".questions-collection-list-item")||root;
  refs.qWrap=need(".question-wrapper")||refs.qEl;
  refs.anchorTop=need(".explanation-anchor-top")||null;
  refs.qText=need(".question-text"); if(!refs.qText) return false;
  refs.progress=need(".progress-counter"); if(!refs.progress) return false;
  refs.mainWrap=need(".main-content-wrapper"); if(!refs.mainWrap) return false;
  refs.optWrap=need(".options-wrapper"); if(!refs.optWrap) return false;
  refs.cards=Array.from(refs.optWrap.querySelectorAll(".option-card")); if(!refs.cards.length) return false;
  refs.items=refs.cards.map(c=>c.querySelector(".option-item"));
  refs.imgWrap=need(".question-image-wrapper");
  refs.img=need(".question-image");
  refs.videoWrap=need(".explanation-video-wrapper")||null;

  /* desktop */
  refs.buttonsWrap=need(".submit-next-buttons"); if(!refs.buttonsWrap) return false;
  refs.submitBtn=refs.buttonsWrap.querySelector(".submit-btn"); if(!refs.submitBtn) return false;
  refs.explainBtn=refs.buttonsWrap.querySelector(".explanation-btn")||refs.buttonsWrap.querySelector(".explanation-card");
  refs.aiBtn=refs.buttonsWrap.querySelector(".ask-ai-btn")||refs.buttonsWrap.querySelector(".ai-pop-wrapper");

  /* mobile (NU atingem layoutul din Webflow) */
  refs.buttonsWrapMobile=need(".submit-next-buttons-mobile")||null;
  if(refs.buttonsWrapMobile){
    refs.submitBtnMobile=refs.buttonsWrapMobile.querySelector(".submit-btn-mobile")||refs.buttonsWrapMobile.querySelector(".submit-btn")||null;
    refs.explainBtnMobile=refs.buttonsWrapMobile.querySelector(".explanation-btn-mobile")||refs.buttonsWrapMobile.querySelector(".explanation-btn")||null;
    refs.aiBtnMobile=refs.buttonsWrapMobile.querySelector(".ask-ai-btn-mobile")||refs.buttonsWrapMobile.querySelector(".ask-ai-btn")||null;
  }

  /* accordion */
  refs.acc=need(".custom-accordion")||null;
  refs.accHeader=refs.acc?.querySelector(".custom-accordion-header")||null;
  refs.accArrow =refs.acc?.querySelector(".custom-accordion-arrow")||null;
  refs.accContent=refs.acc?.querySelector(".custom-accordion-content")||null;
  refs.accBody  =refs.acc?.querySelector(".custom-accordion-body")||null;
  refs.expLabelEl=refs.acc?.querySelector(".custom-accordion-label")||null;
  refs.accAnchor=refs.acc?.querySelector(".accordion-anchor")||null;
  refs.anchor=need(".explanation-anchor")||null;

  refs.feedbackWrap=need(".feedback-wrapper"); if(!refs.feedbackWrap) return false;
  refs.staticText=refs.feedbackWrap.querySelector(".correct-answer-static");
  refs.correctAns=refs.feedbackWrap.querySelector(".correct-answer");

  /* Forțează eticheta AI CHAT pe ambele butoane */
  applyAIChatText();

  if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){ } }

  /* select/deselect opțiuni */
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

  /* accordion: feedback + toggle */
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

  /* toggling explicații – sincron desktop + mobil, fără a schimba layoutul mobil */
  const onExplainClick=()=>{
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
      if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
      if(refs.videoWrap) refs.videoWrap.style.display="none";
      if(refs.acc){ refs.acc.classList.remove("open"); refs.acc.style.display="none"; if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
      if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){ } }
      renderExplainBtnUI(false);
      scrollContainerToAnchor(refs.anchorTop,scroller,{behavior:"smooth"});
    }
  };
  if(refs.explainBtn && !refs.explainBtn.dataset.boundExp){
    refs.explainBtn.addEventListener("click", onExplainClick);
    refs.explainBtn.dataset.boundExp='1';
  }
  if(refs.explainBtnMobile && !refs.explainBtnMobile.dataset.boundExp){
    refs.explainBtnMobile.addEventListener("click", onExplainClick);
    refs.explainBtnMobile.dataset.boundExp='1';
  }

  /* AI Chat – pop-up (desktop + mobil) */
  const onAiClick=()=>{
    vibrateShort();
    const v=refs.videoWrap?.querySelector("video");
    if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
    ensureAIPop().style.display="flex"; document.body.style.overflow="hidden";
  };
  if(refs.aiBtn && !refs.aiBtn.dataset.boundAi){
    refs.aiBtn.addEventListener("click", onAiClick);
    refs.aiBtn.dataset.boundAi='1';
  }
  if(refs.aiBtnMobile && !refs.aiBtnMobile.dataset.boundAi){
    refs.aiBtnMobile.addEventListener("click", onAiClick);
    refs.aiBtnMobile.dataset.boundAi='1';
  }

  return true;
}

/* ===== Locks & aplicații vizuale ===== */
let transitioning=false;
function setButtonsTransitionLock(on){
  transitioning=!!on;
  if(refs.submitBtn){ refs.submitBtn.setAttribute("aria-disabled",on?"true":"false"); refs.submitBtn.classList.toggle("is-disabled",on); }
  if(refs.submitBtnMobile){ refs.submitBtnMobile.setAttribute("aria-disabled",on?"true":"false"); refs.submitBtnMobile.classList.toggle("is-disabled",on); }
  if(refs.buttonsWrap){ if(on) refs.buttonsWrap.style.setProperty("pointer-events","none","important"); else refs.buttonsWrap.style.removeProperty("pointer-events"); }
  if(refs.buttonsWrapMobile){ if(on) refs.buttonsWrapMobile.style.setProperty("pointer-events","none","important"); else refs.buttonsWrapMobile.style.removeProperty("pointer-events"); }
}
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

/* ===== Video block ===== */
function setVideoBlock(url){
  if(!refs.videoWrap) return;

  // ✅ cleanup observer înainte de a curăța conținutul vechi (evită observers orfani)
  try { refs.videoWrap.__observerInstance?.disconnect?.(); refs.videoWrap.__observerInstance=null; } catch(_){}

  refs.videoWrap.innerHTML=""; 
  refs.videoWrap.style.display="none"; 
  if(!url) return;

  let html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html=`<video class="explanation-video plyr-player" controls playsinline><source src="${url}" type="video/mp4">Video not supported.</video>`;
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    const m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); 
    const yt=m?m[1]:"";
    if(yt){
      html = `
      <div class="plyr__video-embed">
        <iframe 
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          referrerpolicy="no-referrer"
          src="https://www.youtube.com/embed/${yt}?origin=${location.origin}&iv_load_policy=3&modestbranding=1&rel=0"
          allowfullscreen
          allow="autoplay">
        </iframe>
      </div>`;
    }
  }
  if(!html) return;

  refs.videoWrap.innerHTML=html; 
  refs.videoWrap.style.display="none";

  const playerEl=refs.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    if(HAS_PLYR&&playerEl.plyr){ 
      playerEl.addEventListener("click",e=>{ 
        if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return; 
        e.stopPropagation(); 
        try{ playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play(); }catch(_){}; 
      }); 
    }
    else{ 
      playerEl.addEventListener("click",e=>{ 
        if(e.target.tagName==="BUTTON") return; 
        e.stopPropagation(); 
        try{ playerEl.paused?playerEl.play():playerEl.pause(); }catch(_){}; 
      }); 
    }

    playerEl._hasUserPlayed=false; 
    playerEl._autoPaused=false; 
    playerEl._manualClosed=false; 
    playerEl._suppressNextAutoResume=false;

    playerEl.addEventListener("play",()=>{ 
      playerEl._hasUserPlayed=true; 
      playerEl._autoPaused=false; 
      playerEl._manualClosed=false; 
      playerEl._suppressNextAutoResume=false; 
    });

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
      obs.observe(playerEl.parentElement||playerEl); 
      vw.__observerInstance=obs;
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

function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  const tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(r=>{tmp.onload=r; tmp.onerror=r;});
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
  refs.img.style.display="";
  refs.img.removeAttribute("aria-hidden");
  applyNoImageState(false);
  refs.img.onerror=()=>{
    refs.img.removeAttribute("src");
    refs.img.style.display="none";
    refs.img.setAttribute("aria-hidden","true");
    applyNoImageState(true);
  };
}

/* === restaurare stare “verificată” + randare întrebare === */
async function updateInPlace(idx,{resetSelections=false}={}){
  setButtonsTransitionLock(true);
  const q=BUF[idx]; if(!q){ await showFinal(); return; }
  const container=refs.qWrap||(QWRAP||document.querySelector(".question-wrapper"))||document.body;
  const prevH=container.offsetHeight;
  container.classList.add("no-transition","is-preparing");
  if(prevH) container.style.minHeight=prevH+"px";

  (refs.qEl.querySelector(".chapter-text")||document.createElement("div")).textContent=sanitizeMaybe(chapterName);
  refs.progress.textContent = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(CUR)}/${pad2(TOTAL)}`;
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (QWRAP||refs.qWrap||refs.qEl)?.classList.add("visible");

  /* întrebare + opțiuni */
  refs.qText.innerHTML=""; refs.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(q.Question||""));
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  refs.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=refs.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });

  /* explicație scrisă */
  if(refs.accBody){
    refs.accBody.innerHTML=""; const ex=q["Explanation"]||"";
    if(ex) refs.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }

  /* ascundem explicația + AI până după verificare */
  refs.feedbackWrap.style.display="none";
  refs.correctAns.textContent="";
  refs.staticText.textContent="Raspunsul corect este:";
  renderExplainBtnUI(false);
  if(refs.explainBtn) refs.explainBtn.style.display="none";
  if(refs.explainBtnMobile) refs.explainBtnMobile.style.display="none";
  if(refs.aiBtn) refs.aiBtn.style.display="none";
  if(refs.aiBtnMobile) refs.aiBtnMobile.style.display="none";

  if(refs.acc){ refs.acc.style.display="none"; refs.acc.classList.remove("open"); if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
  if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){ } }

  setVideoBlock(q["Explanation Video Link"]||"");
  SEL=[]; ANSW=false;
  clearLetterStates(refs.qEl); clearAllSelected(refs.qEl); clearWrongCards(refs.qEl);

  /* pe desktop arătăm un singur buton la început; pe mobil lăsăm layout-ul strict din Webflow */
  setSingleBtnState(true);
  setSubmitStateBoth("verify");

  /* imagine */
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(q.Image); } else { await seamlessSetImage(""); }

  /* restaurare din Firestore (condiționată de sesiune în wrong-mode) */
  try{
    const snap=await ansCollection.doc(`${CHAP}_${idx}`).get();
    if(snap.exists){
      const d=snap.data();
      const selSaved=(d.selected||[]).map(x=>String(x||"").toUpperCase());
      const corSaved=(d.correct||[]).map(x=>String(x||"").toUpperCase());
      const answeredAtMs=+(d.answeredAtMs||0);
      const allowRestore = (!WRMODE) || (WRMODE && answeredAtMs && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
      if(allowRestore && selSaved.length>0){
        SEL=Array.from(new Set(selSaved)); applySelectedVisualsFromSEL(refs.qEl);
        ANSW=true; clearLetterStates(refs.qEl); applyLetterStatesByCorrect(refs.qEl,corSaved); clearWrongCards(refs.qEl); applyWrongCardsByCorrect(refs.qEl,corSaved);
        const same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(","); refs.staticText.textContent=same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
        const ord=["A","B","C"].filter(x=>corSaved.includes(x)); refs.correctAns.textContent=ord.join(", ");
        refs.feedbackWrap.style.setProperty("display","flex","important");
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

  requestAnimationFrame(()=>{
    container.classList.remove("no-transition","is-preparing");
    container.style.minHeight="";
    setButtonsTransitionLock(false);
  });
}

/* --- Repara eventuale suprascrieri ale style.setProperty (instalare după definirea updateInPlace) --- */
function __repairStyleSetProperty(el){
  try{ if(el && el.style && typeof el.style.setProperty !== "function"){ delete el.style.setProperty; } }catch(_){}
}
(function(){
  const old = window.updateInPlace;
  if (typeof old === "function" && !old.__wrappedForRepair) {
    const wrapped = async function(idx, opts){
      const out = await old(idx, opts||{});
      __repairStyleSetProperty(refs.aiBtnMobile);
      return out;
    };
    wrapped.__wrappedForRepair = true;
    window.updateInPlace = wrapped;
  }
})();

/* === INIT cu reluare wrong-mode (dacă exista) — continuare flux === */
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

/* === AI pop-up === */
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
  AIPop.addEventListener("click",e=>{ if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){ vibrateShort(); AIPop.style.display="none"; document.body.style.overflow=""; }});
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT -> GPT -> TTS */ });
  return AIPop;
}

/* === Utilitar: litere corecte === */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
}


/* === [PATCH] Sanitizare cu allowlist (înlocuiește escape-ul total) =================== */
(function installAllowlistSanitizer(){
  const ALLOWED = new Set(['B','STRONG','I','EM','U','S','BR','P','UL','OL','LI','A']);

  function sanitizeAllowlist(html){
    const temp = document.createElement('div');
    temp.innerHTML = String(html || '');

    const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT, null);
    const toUnwrap = [];
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!ALLOWED.has(el.tagName)) { toUnwrap.push(el); continue; }
      if (el.tagName === 'A') {
        const href = (el.getAttribute('href') || '').trim();
        const safe = href && /^(https?:)?\/\//i.test(href);
        if (!safe) el.removeAttribute('href');
        el.setAttribute('rel','nofollow noopener noreferrer');
        el.setAttribute('target','_blank');
      }
      // elimină orice atribut de tip on*
      [...el.attributes].forEach(a => { if (a.name.startsWith('on')) el.removeAttribute(a.name); });
    }
    // „desfacem” tagurile nepermise păstrându-le copiii
    toUnwrap.forEach(n => n.replaceWith(...n.childNodes));
    return temp.innerHTML;
  }

  // suprascrie patch-ul anterior de insertAdjacentHTML doar pe zonele „sensibile”
  const orig = Element.prototype.insertAdjacentHTML;
  const SANITIZE_SEL = '.question-text, .question-title, .question_richtext, .option-item, .option-item-exam, [data-option-item], .custom-accordion-body, .accordion-body';
  Element.prototype.insertAdjacentHTML = function(position, html){
    try {
      const must = this.closest && this.closest(SANITIZE_SEL);
      if (must) return orig.call(this, position, sanitizeAllowlist(html));
    } catch(_) {}
    return orig.call(this, position, html);
  };
})();

/* === [PATCH] A11y: aria-live pe feedback ============================================ */
(function a11yFeedbackPolite(){
  const root = document.querySelector('.question-section') || document;
  const wrap = root.querySelector('.feedback-wrapper, .answer-feedback, .result-feedback');
  if (wrap) {
    wrap.setAttribute('aria-live','polite');
    wrap.setAttribute('role','status');
  }
})();

/* === [PATCH] prefetchMany cu CHUNKING (loturi de câte 10 pentru "in") ================ */
/* Această definiție va OMBRI pe cea anterioară din același scope. */
async function prefetchMany(indices, priorityMap = {}) {
  const pending = (indices || [])
    .filter(v => v && v >= 1 && (!TOTAL || v <= TOTAL) && !BUF[v]);
  if (!pending.length) return;

  // Grupează câte 10 elemente pentru .where("in", ...)
  const chunks = [];
  for (let i = 0; i < pending.length; i += 10) chunks.push(pending.slice(i, i + 10));

  try {
    for (const group of chunks) {
      const qs = await db.collection("mediu_invatare_pages")
        .where("chapterSlug","==", CHAP)
        .where("Index","in", group)
        .get();

      qs.forEach(doc => {
        const d = doc.data(), i = d.Index;
        if (!i || BUF[i]) return;
        BUF[i] = d;

        if (d.Image) {
          const pr = priorityMap[i] || "low";
          try {
            const { ready } = primeImage(d.Image, { priority: pr });
            BUF[i].__imgReady = ready; ready.catch(()=>{});
          } catch(_) {
            BUF[i].__imgReady = Promise.resolve();
          }
        } else {
          BUF[i].__imgReady = Promise.resolve();
        }
      });
    }
  } catch(_) {
    // fallback 1-by-1 dacă „in” nu e disponibil / eșuează
    await Promise.all(pending.map(v => prefetchQuestion(v)));
  }
}

/* === [PATCH] setVideoBlock: sandbox YouTube + cleanup observer înainte de clear ======= */
/* Această versiune înlocuiește funcția anterioară și păstrează aceeași semnătură. */
function setVideoBlock(url){
  if(!refs.videoWrap) return;

  // ✨ IMPORTANT: decuplează orice observer vechi ÎNAINTE de a goli containerul
  try { refs.videoWrap.__observerInstance?.disconnect?.(); refs.videoWrap.__observerInstance = null; } catch(_) {}

  refs.videoWrap.innerHTML = "";
  refs.videoWrap.style.display = "none";
  if(!url) return;

  let html = "";
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    html = `<video class="explanation-video plyr-player" controls playsinline>
              <source src="${url}" type="video/mp4">Video not supported.
            </video>`;
  } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const m = url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/);
    const yt = m ? m[1] : "";
    if (yt) {
      const origin = encodeURIComponent(location.origin);
      html = `<div class="plyr__video-embed">
                <iframe
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  referrerpolicy="no-referrer"
                  src="https://www.youtube.com/embed/${yt}?origin=${origin}&iv_load_policy=3&modestbranding=1&rel=0"
                  allowfullscreen
                  allow="autoplay">
                </iframe>
              </div>`;
    }
  }
  if(!html) return;

  refs.videoWrap.innerHTML = html;
  refs.videoWrap.style.display = "none";

  const playerEl = refs.videoWrap.querySelector("video");
  if (playerEl) {
    if (HAS_PLYR) {
      try {
        playerEl.plyr = new Plyr(playerEl, {
          controls:["play","progress","current-time","mute","volume","fullscreen"],
          ratio:"16:9",
          seekTime:5,
          settings:[]
        });
      } catch(_) {}
    }

    // toggle play/pause pe click pe video (în afara controalelor)
    if (HAS_PLYR && playerEl.plyr) {
      playerEl.addEventListener("click", e => {
        if (e.target.closest(".plyr__controls") || e.target.classList.contains("plyr__control") || e.target.tagName === "BUTTON") return;
        e.stopPropagation();
        try { playerEl.plyr.playing ? playerEl.plyr.pause() : playerEl.plyr.play(); } catch(_){}
      });
    } else {
      playerEl.addEventListener("click", e => {
        if (e.target.tagName === "BUTTON") return;
        e.stopPropagation();
        try { playerEl.paused ? playerEl.play() : playerEl.pause(); } catch(_){}
      });
    }

    playerEl._hasUserPlayed = false;
    playerEl._autoPaused    = false;
    playerEl._manualClosed  = false;
    playerEl._suppressNextAutoResume = false;

    playerEl.addEventListener("play", () => {
      playerEl._hasUserPlayed = true;
      playerEl._autoPaused = false;
      playerEl._manualClosed = false;
      playerEl._suppressNextAutoResume = false;
    });

    // Observer pentru auto-pause / auto-resume în viewport-ul containerului
    const scroller = refs.qEl?.querySelector(".question-wrapper-inner") || getScrollParent(refs.qEl) || null;
    const vw = refs.videoWrap;
    if (scroller) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const v = entry.target.querySelector("video") || playerEl;
          if (v !== playerEl || !playerEl._hasUserPlayed) return;

          if (entry.isIntersecting) {
            if (playerEl._autoPaused && !playerEl._manualClosed && !playerEl._suppressNextAutoResume) {
              try { playerEl.plyr ? playerEl.plyr.play() : playerEl.play(); } catch(_){}
              playerEl._autoPaused = false;
            }
          } else {
            const wasPlaying = (playerEl.plyr ? playerEl.plyr.playing : !playerEl.paused);
            if (wasPlaying) {
              playerEl._autoPaused = true;
              try { playerEl.plyr ? playerEl.plyr.pause() : playerEl.pause(); } catch(_){}
            }
          }
        });
      }, { root: scroller, threshold: .25 });

      obs.observe(playerEl.parentElement || playerEl);
      vw.__observerInstance = obs;
    }
  } else {
    // dacă e iframe YouTube, doar îl afișăm; Plyr se ocupă de embed dacă e configurat separat
  }
}

/* === [QoL] Asigură „AI CHAT” ca etichetă (în caz de rehidratare tardivă) ============== */
applyAIChatText?.();

/* === [QoL] Reasigurare aria-hidden pentru imagine goală după patch-uri ================= */
(function rehardenImageA11y(){
  const img = refs?.img;
  if (!img) return;
  if (!img.getAttribute('src')) {
    img.style.display = "none";
    img.setAttribute('aria-hidden','true');
  }
})();

/* === [QoL] Setați aria-expanded pe header dacă acordionul este deschis implicit ======= */
(function syncAccA11yOnLoad(){
  const acc = refs?.acc, header = refs?.accHeader, content = refs?.accContent;
  if (!acc || !header || !content) return;
  const open = acc.classList.contains('open') || (getComputedStyle(content).maxHeight && getComputedStyle(content).maxHeight !== '0px');
  header.setAttribute('aria-expanded', open ? 'true' : 'false');
})();

/* === [Final] Mic guard: scoate page-loading dacă ceva a rămas blocat =================== */
setTimeout(()=> document.body.classList.remove('page-loading'), 300);

