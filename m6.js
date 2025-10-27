
window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* =============== UTILITARE =============== */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0");
const HAS_PLYR=!!(W&&W.Plyr);
const rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,120);
const nowMs=()=>Date.now();

/* Anti-XSS: TRUE = afișează doar text “ca atare” (sigur 100%) */
const SANITIZE_CONTENT=true;
const sanitizeMaybe=html=>SANITIZE_CONTENT?(()=>{const d=D.createElement("div");d.textContent=String(html||"");return d.innerHTML;})():html||"";

/* vibrație scurtă (QoL) */
const vibrateShort=()=>{ try{ if(navigator&&navigator.vibrate) navigator.vibrate(40);}catch(_){} };

/* Sunete (opțional; există deja la tine în proiect) */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch(_){}}

/* Toast existent (alert-wrapper-new) */
const AWrap=$(".alert-wrapper-new");
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const t=AWrap.querySelector(".select-answer-text");
  if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{AWrap.classList.remove("active");alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);},dur);
}

/* =============== CONTEXT & FIREBASE =============== */
const params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); return; }
const auth=firebase.auth(),db=firebase.firestore();
const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie să fii autentificat."); location.href="/login"; return; }

const progRef=db.collection("users").doc(user.uid).collection("progress_mediu").doc(CHAP);
const ansCol =db.collection("users").doc(user.uid).collection("answers_mediu");

/* =============== STARE GLOBALĂ =============== */
let TOTAL=0, CUR=1, FIN=false;
let WRMODE=false, WRONG=[], WRP=0;
let WRONG_STARTED_AT_MS=0;

/* buffer de date întrebări + image decode promise */
const BUF=Object.create(null);

/* =============== DOM & AB WRAPPERS =============== */
const QSEC=$(".question-section");
if(!QSEC){ alert("Nu există .question-section în pagină."); return; }

function ensureABStructure(){
  // Căutăm stage: un container care ține A și B
  let stage=$(".ab-stage",QSEC);
  if(!stage){
    stage=D.createElement("div");
    stage.className="ab-stage";
    // caută un .question-wrapper existent ca model
    let base=$(".question-wrapper",QSEC);
    if(!base){ alert("Nu există .question-wrapper model."); return null; }
    // înlocuim wrapperul existent cu stage și clonăm 2 copii
    base.replaceWith(stage);

    const A=base.cloneNode(true); A.classList.add("question-buffer","active"); A.classList.add("question-wrapper-A");
    const B=base.cloneNode(true); B.classList.add("question-buffer");        B.classList.add("question-wrapper-B");
    // marcare pentru CSS existent
    A.classList.add("questions-collection-list-item");
    B.classList.add("questions-collection-list-item");
    stage.appendChild(A); stage.appendChild(B);
  }
  return stage;
}

const STAGE=ensureABStructure();
if(!STAGE){ alert("Structura A/B nu a putut fi creată."); return; }
const WRAPA=$(".question-wrapper-A",STAGE);
const WRAPB=$(".question-wrapper-B",STAGE);
if(!WRAPA||!WRAPB){ alert("Lipsește wrapperul A sau B."); return; }

function collectRefs(root){
  const r={root};
  const need=(sel)=>root.querySelector(sel);

  r.qWrap=root.querySelector(".question-wrapper")||root; // fallback
  r.qInner=need(".question-wrapper-inner")||root;
  r.progress=need(".progress-counter");
  r.qText=need(".question-text");
  r.mainWrap=need(".main-content-wrapper")||root;

  r.optWrap=need(".options-wrapper");
  r.cards=a(".option-card",r.optWrap);
  r.items=r.cards.map(c=>c.querySelector(".option-item"));
  r.letterEls=r.cards.map(c=>c.querySelector(".option-letter"));

  r.imgWrap=need(".question-image-wrapper");
  r.imgA = need(".question-image"); // poate exista deja una
  r.imgB = null; // o creăm la nevoie (layerul B)

  r.feedback=need(".feedback-wrapper");
  r.staticText=r.feedback? r.feedback.querySelector(".correct-answer-static"):null;
  r.correctAns=r.feedback? r.feedback.querySelector(".correct-answer"):null;

  r.btns=need(".submit-next-buttons") || need(".submit-next-buttons-mobile") || root;
  r.btnSubmit=r.btns?.querySelector(".submit-btn");
  r.btnExplain=r.btns?.querySelector(".explanation-btn") || r.btns?.querySelector(".explanation-card");
  r.btnAI=r.btns?.querySelector(".ask-ai-btn") || r.btns?.querySelector(".ai-pop-wrapper");

  r.acc=need(".custom-accordion");
  r.accHeader=r.acc?.querySelector(".custom-accordion-header");
  r.accArrow =r.acc?.querySelector(".custom-accordion-arrow");
  r.accContent=r.acc?.querySelector(".custom-accordion-content");
  r.accBody  =r.acc?.querySelector(".custom-accordion-body");

  r.anchorTop=need(".explanation-anchor-top");
  r.anchor=need(".explanation-anchor");

  r.videoWrap=need(".explanation-video-wrapper");
  return r;
}
const REFS_A=collectRefs(WRAPA);
const REFS_B=collectRefs(WRAPB);

function ensureImageLayers(refs){
  if(!refs.imgWrap) return;
  const cs=getComputedStyle(refs.imgWrap);
  if(cs.position==="static") refs.imgWrap.style.position="relative";

  if(!refs.imgA){
    const imgA=D.createElement("img");
    imgA.className="question-image img-layer active";
    imgA.alt=""; imgA.decoding="async"; imgA.draggable=false;
    refs.imgWrap.appendChild(imgA);
    refs.imgA=imgA;
  }else{
    refs.imgA.classList.add("img-layer","active"); refs.imgA.decoding="async"; refs.imgA.draggable=false;
  }
  if(!refs.imgB){
    const imgB=D.createElement("img");
    imgB.className="img-layer";
    imgB.alt=""; imgB.decoding="async"; imgB.draggable=false;
    refs.imgWrap.appendChild(imgB);
    refs.imgB=imgB;
  }
}
ensureImageLayers(REFS_A);
ensureImageLayers(REFS_B);

/* starea fiecărui buffer (selecții & “answered”) */
function makeBufState(){ return {SEL:[], ANSW:false}; }
let stateA=makeBufState(), stateB=makeBufState();
let activeBuf="A"; // A sau B

function getActiveRefs(){ return activeBuf==="A"?REFS_A:REFS_B; }
function getInactiveRefs(){ return activeBuf==="A"?REFS_B:REFS_A; }
function getActiveState(){ return activeBuf==="A"?stateA:stateB; }
function getInactiveState(){ return activeBuf==="A"?stateB:stateA; }

function swapBuffersInstant(){
  const A=WRAPA,B=WRAPB;
  if(activeBuf==="A"){ A.classList.remove("active"); B.classList.add("active"); activeBuf="B"; }
  else { B.classList.remove("active"); A.classList.add("active"); activeBuf="A"; }
}

/* Accesibilitate pentru header & butoane pseudo */
function ensureA11y(refs){
  if(refs.accHeader){
    refs.accHeader.setAttribute("role","button");
    refs.accHeader.setAttribute("tabindex","0");
    refs.accHeader.setAttribute("aria-expanded","false");
    if(refs.accContent){
      const id=refs.accContent.id || ("acc-content-"+Math.random().toString(36).slice(2));
      refs.accContent.id=id;
      refs.accHeader.setAttribute("aria-controls",id);
    }
  }
  if(refs.btnExplain && refs.btnExplain.tagName!=="BUTTON"){
    refs.btnExplain.setAttribute("role","button");
    refs.btnExplain.setAttribute("tabindex","0");
    refs.btnExplain.setAttribute("aria-label","Explicație");
  }
  if(refs.btnAI && refs.btnAI.tagName!=="BUTTON"){
    refs.btnAI.setAttribute("role","button");
    refs.btnAI.setAttribute("tabindex","0");
    refs.btnAI.setAttribute("aria-label","AI CHAT");
  }
  if(refs.btnSubmit && refs.btnSubmit.tagName!=="BUTTON"){
    refs.btnSubmit.setAttribute("role","button");
    refs.btnSubmit.setAttribute("tabindex","0");
    refs.btnSubmit.setAttribute("aria-label","Verifică / Continuă");
  }
}
ensureA11y(REFS_A); ensureA11y(REFS_B);

/* Helpers opțiuni */
function getLetterFromCard(card){
  const el=card.querySelector(".option-letter"); if(!el) return "";
  for(const n of el.childNodes){ if(n.nodeType===Node.TEXT_NODE){ const t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase(); } }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearSelections(refs){
  if(!refs.root) return;
  refs.root.querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected,.option-card.selected").forEach(el=>el.classList.remove("selected"));
}
function applySelections(refs,SELarr){
  const set=new Set(SELarr);
  refs.cards.forEach(card=>{
    const L=getLetterFromCard(card), on=set.has(L);
    card.classList.toggle("selected",on);
    card.querySelector(".option-letter")?.classList.toggle("selected",on);
    card.querySelector(".option-item")?.classList.toggle("selected",on);
    card.querySelector(".option-card-connector")?.classList.toggle("selected",on);
  });
}
function clearRightWrong(refs){
  refs.root.querySelectorAll(".option-letter.correct,.option-letter.wrong,.option-card.wrong-card").forEach(el=>{
    el.classList.remove("correct","wrong"); if(el.classList.contains("option-card")) el.classList.remove("wrong-card");
  });
}
function applyCorrectWrong(refs,correctArr){
  const COR=new Set(correctArr);
  refs.cards.forEach(card=>{
    const L=getLetterFromCard(card);
    const le=card.querySelector(".option-letter");
    if(le){ le.classList.add(COR.has(L)?"correct":"wrong"); }
    card.classList.toggle("wrong-card",!COR.has(L));
  });
}

/* imagine: crossfade pe layere, fără flicker */
async function swapImageIn(refs,url,readyPromise){
  ensureImageLayers(refs);
  const hasNew=!!url;

  // fără imagine
  if(!hasNew){
    refs.imgA.classList.remove("active");
    refs.imgB.classList.remove("active");
    refs.root.classList.add("no-image");
    return;
  }
  try{ await (readyPromise||Promise.resolve()); }catch(_){}
  // activăm “next layer”
  const currentActiveA=refs.imgA.classList.contains("active");
  const current=currentActiveA?refs.imgA:refs.imgB;
  const next=currentActiveA?refs.imgB:refs.imgA;

  if(next.src!==url) next.src=url;

  next.style.transition="opacity 0s"; next.classList.add("active"); void next.offsetWidth; next.style.transition="";
  current.classList.remove("active");
  refs.root.classList.remove("no-image");
}

/* Video / Plyr */
function setVideoBlock(refs,url){
  if(!refs.videoWrap) return;
  refs.videoWrap.innerHTML=""; refs.videoWrap.style.display="none";
  if(!url) return;

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
  }
}

/* progres / buton submit */
function setSubmitState(refs,state){
  const btn=refs.btnSubmit; if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify": btn.textContent="VERIFICA"; btn.classList.add("is-verify","_preload-full"); break;
    case "next": {
      const last=WRMODE ? (WRP===WRONG.length-1) : (CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZA":"CONTINUA";
      btn.classList.add(last?"is-finish":"is-next");
      if(last) btn.classList.add("finish-chapter-btn");
      break;
    }
    case "finish": btn.textContent="FINALIZEAZA"; btn.classList.add("is-finish","finish-chapter-btn"); break;
  }
}

/* =============== FIRESTORE: capitol, total, prefetch =============== */
async function getChapterMeta(){
  const doc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
  if(!doc.exists) throw new Error("Capitolul nu există.");
  return {name:doc.data().Name||"", slug:doc.id};
}
async function getTotalCount(){
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s.size||0;
}

function primeImage(url,{priority="auto"}={}){
  const img=new Image(); img.decoding="async";
  try{ img.fetchPriority=priority; }catch(_){ try{ img.setAttribute("fetchpriority",priority);}catch(_){} }
  img.src=url;
  const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;});
  return {img,ready};
}

async function loadQuestionByIndex(idx){
  if(BUF[idx]) return BUF[idx];
  let snap=await db.collection("mediu_invatare_pages")
    .where("chapterSlug","==",CHAP).where("Index","==",idx).limit(1).get();

  if(snap.empty){
    // încearcă și ca string
    snap=await db.collection("mediu_invatare_pages")
      .where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get();
  }
  if(snap.empty) return null;

  const d=snap.docs[0].data();
  // pregătim imaginea
  if(d.Image){
    try{ const {ready}=primeImage(d.Image,{priority:"auto"}); d.__imgReady=ready; }catch(_){ d.__imgReady=Promise.resolve(); }
  }else d.__imgReady=Promise.resolve();

  // normalizează
  d.__CORR=String(d["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
  d.__IDX = typeof d.Index==="number" ? d.Index : parseInt(d.Index,10);
  BUF[idx]=d;
  return d;
}

async function prefetchAhead(baseIdx){
  const targets=[baseIdx+1];
  try{
    await Promise.all(targets.map(i=>i>=1 && i<=TOTAL ? loadQuestionByIndex(i) : null));
  }catch(_){}
}

/* =============== RENDER ÎNTR-UN WRAPPER =============== */
function applyNoImageState(refs,on){
  if(on) refs.root.classList.add("no-image");
  else   refs.root.classList.remove("no-image");
}

async function renderInto(refs, qdata, {progressText, restoreFromFS}={}){
  if(!qdata) return;

  // PROGRES
  if(refs.progress) refs.progress.textContent=progressText||"";

  // TEXT + OPȚIUNI (sanitizate)
  if(refs.qText){ refs.qText.innerHTML=""; refs.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(qdata.Question||"")); }

  const vals=[qdata["Option A"]||"",qdata["Option B"]||"",qdata["Option C"]||""];
  refs.cards.forEach((card,i)=>{
    const it=refs.items[i]; const v=vals[i]||"";
    if(it){ it.innerHTML=""; if(v) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(v)); }
    card.style.display = v ? "" : "none";
  });

  // EXPLICAȚIE
  if(refs.accBody){
    refs.accBody.innerHTML="";
    const ex=qdata["Explanation"]||"";
    if(ex) refs.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }
  if(refs.acc){
    refs.acc.classList.remove("open");
    if(refs.accContent){ refs.accContent.style.maxHeight="0px"; refs.accContent.style.display="none"; }
    if(refs.accHeader){ refs.accHeader.setAttribute("aria-expanded","false"); }
    refs.acc.style.display="none";
  }

  // VIDEO (pregătit dar ascuns)
  setVideoBlock(refs,qdata["Explanation Video Link"]||"");

  // IMAGINE (pregătită & decodată înainte de activare)
  try{ await (qdata.Image ? (qdata.__imgReady||Promise.resolve()) : Promise.resolve()); }catch(_){}
  if(qdata.Image){ await swapImageIn(refs,qdata.Image,qdata.__imgReady); applyNoImageState(refs,false); }
  else { await swapImageIn(refs,null,null); applyNoImageState(refs,true); }

  // FEEDBACK ascuns
  if(refs.feedback){ refs.feedback.style.display="none"; }
  if(refs.staticText) refs.staticText.textContent="Raspunsul corect este:";
  if(refs.correctAns) refs.correctAns.textContent="";

  // butoane
  if(refs.btns) refs.btns.classList.add("single-btn-state");
  setSubmitState(refs,"verify");

  // curăță selecții & state vizuale
  clearSelections(refs); clearRightWrong(refs);

  // restaurare răspuns (din Firestore) doar în test normal (nu wrong-mode),
  // sau în wrong-mode dacă e răspuns după startul sesiunii curente
  if(restoreFromFS){
    try{
      const snap=await ansCol.doc(`${CHAP}_${qdata.__IDX}`).get();
      if(snap.exists){
        const d=snap.data();
        const sel=(d.selected||[]).map(x=>String(x||"").toUpperCase());
        const cor=(d.correct||[]).map(x=>String(x||"").toUpperCase());
        const answeredAtMs=+(d.answeredAtMs||0);
        const allow = (!WRMODE) || (WRMODE && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
        if(allow && sel.length){
          // aplicăm restaurarea doar vizual; logica de state o setăm la activare
          applySelections(refs,sel);
          clearRightWrong(refs); applyCorrectWrong(refs,new Set(cor));

          if(refs.feedback){ refs.feedback.style.display="flex"; }
          if(refs.btns) refs.btns.classList.remove("single-btn-state");
          setSubmitState(refs,(WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL))?"finish":"next");
        }
      }
    }catch(_){}
  }
}

/* =============== ACTIVARE WRAPPER CU STATE CORESPUNZĂTOR =============== */
function activateStateFor(refs, state, qdata){
  // reconstruim vizual conform state
  clearSelections(refs);
  if(state.SEL && state.SEL.length) applySelections(refs,state.SEL);

  clearRightWrong(refs);
  if(state.ANSW){
    applyCorrectWrong(refs,new Set(qdata.__CORR||[]));
    if(refs.feedback){ refs.feedback.style.display="flex"; }
    if(refs.btns) refs.btns.classList.remove("single-btn-state");
    setSubmitState(refs,(WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL))?"finish":"next");
  }else{
    if(refs.feedback) refs.feedback.style.display="none";
    if(refs.btns) refs.btns.classList.add("single-btn-state");
    setSubmitState(refs,"verify");
  }
}

/* =============== PREP + SWAP pentru NEXT (no flicker) =============== */
async function prepareInactiveWith(idx){
  const refs=getInactiveRefs(), st=getInactiveState();
  const q=await loadQuestionByIndex(idx);
  if(!q) return false;

  const pText = WRMODE ? `${pad2(WRP+1)}/${pad2(WRONG.length)}` : `${pad2(idx)}/${pad2(TOTAL)}`;
  await renderInto(refs,q,{progressText:pText, restoreFromFS:true});

  // resetăm starea bufferului inactiv
  st.SEL=[]; st.ANSW=false;
  return true;
}

/* =============== INIT =============== */
D.body.classList.add("page-loading");
$(".lesson-loader")?.style.setProperty("display","flex","important");

let chapterName="";
try{
  ({name:chapterName}=await getChapterMeta());
  TOTAL=await getTotalCount();
  const ps=await progRef.get();
  if(ps.exists){ if(ps.data().currentIndex) CUR=ps.data().currentIndex; if(ps.data().finished) FIN=true; }
}catch(e){
  alert("Eroare la încărcarea capitolului."); console.error(e); return;
}

if(FIN){
  // dacă ai ecranul final existent în pagină, îl poți lăsa – (nu detaliem aici pentru concizie)
  D.body.classList.remove("page-loading");
  $(".lesson-loader")?.style.setProperty("display","none","important");
  // …codul tău de final screen…
}else{
  // pregătim A (activ) cu întrebarea curentă
  await renderInto(REFS_A, await loadQuestionByIndex(CUR), {
    progressText:`${pad2(CUR)}/${pad2(TOTAL)}`, restoreFromFS:true
  });
  // pregătim B (inactiv) cu întrebarea următoare (dacă există)
  if(CUR<TOTAL) await prepareInactiveWith(CUR+1);

  WRAPA.classList.add("active");
  WRAPB.classList.remove("active");
  activeBuf="A"; stateA.SEL=[]; stateA.ANSW=false;

  D.body.classList.remove("page-loading");
  $(".lesson-loader")?.style.setProperty("display","none","important");
}

/* =============== INTERACȚIUNI (delegare pe STAGE) =============== */
function currentQIndex(){
  return WRMODE ? (WRONG[WRP]||CUR) : CUR;
}
function parseCorrectLetters(q){ return q.__CORR||[]; }

STAGE.addEventListener("click",async (e)=>{
  const refs=getActiveRefs(), state=getActiveState();
  const idx=currentQIndex();
  const q=BUF[idx];

  // Selectare opțiune
  const card=e.target.closest(".option-card");
  if(card){
    if(state.ANSW) return;
    vibrateShort();
    const L=getLetterFromCard(card); if(!L) return;
    const i=state.SEL.indexOf(L);
    if(i===-1) state.SEL.push(L); else state.SEL.splice(i,1);
    applySelections(refs,state.SEL);
    return;
  }

  // Submit
  const submit=e.target.closest(".submit-btn");
  if(submit){
    e.preventDefault(); vibrateShort();
    if(!q) return;

    const isVerify = submit.classList.contains("is-verify");
    const isNext   = submit.classList.contains("is-next");
    const isFinish = submit.classList.contains("is-finish")||submit.classList.contains("finish-chapter-btn");

    if(isVerify){
      if(!state.SEL.length){
        toast("Selecteaza un raspuns!",1000);
        playOne(alertSound);
        refs.btns?.classList.add("single-btn-state");
        return;
      }
      const COR=parseCorrectLetters(q);
      state.ANSW=true;
      applyCorrectWrong(refs,new Set(COR));
      if(refs.feedback){ refs.feedback.style.display="flex"; }
      refs.btns?.classList.remove("single-btn-state");

      const sel=state.SEL.slice().sort().join(","), cor=COR.slice().sort().join(",");
      const full=sel && (sel===cor);
      try{ full?playOne(correctSound):playOne(wrongSound);}catch(_){}

      if(refs.staticText) refs.staticText.textContent = full ? "Corect 100% -" : "Greșit. Răspuns corect -";
      if(refs.correctAns) refs.correctAns.textContent = ["A","B","C"].filter(x=>COR.includes(x)).join(", ");

      setSubmitState(refs,(WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL))?"finish":"next");

      // scroll către explicație (dacă există ancoră)
      const scroller=refs.qInner||document.scrollingElement;
      const target=refs.anchor||refs.acc||refs.feedback;
      if(target){ try{ target.scrollIntoView({behavior:"smooth",block:"start"});}catch(_){} }

      // salvare în FS
      const saveMs=nowMs();
      ansCol.doc(`${CHAP}_${idx}`).set({
        module:"mediu",chapterSlug:CHAP,index:idx,question:q?.Question||"",
        options:["A","B","C"].map(L=>({letter:L,value:q?.["Option "+L]||""})),
        selected:state.SEL.slice(),correct:COR.slice(),explanation:q?.["Explanation"]||"",
        answeredAt:firebase.firestore.FieldValue.serverTimestamp(),
        answeredAtMs: saveMs
      },{merge:true}).catch(console.warn);

      return;
    }

    if(isNext){
      // pregătim déjà inactive cu următoarea
      if(WRMODE){
        WRP++;
        if(WRP>=WRONG.length){
          // finalizează capitolul / ecran final (ne-implementat aici concis)
          setSubmitState(refs,"finish");
          return;
        }
        const nextIdx=WRONG[WRP];
        await prepareInactiveWith(nextIdx);
        swapBuffersInstant();
        activateStateFor(getActiveRefs(), getActiveState(), BUF[nextIdx]);
        // prefetch încă una
        rIC(()=>prefetchAhead(nextIdx));
        return;
      }else{
        if(CUR<TOTAL){
          const nextIdx=++CUR;
          await progRef.set({currentIndex:CUR,finished:false},{merge:true}).catch(()=>{});
          await prepareInactiveWith(nextIdx);
          swapBuffersInstant();
          activateStateFor(getActiveRefs(), getActiveState(), BUF[nextIdx]);
          rIC(()=>prefetchAhead(nextIdx));
        }else{
          // final – poți afișa ecranul final tău existent
          setSubmitState(refs,"finish");
        }
        return;
      }
    }

    if(isFinish){
      try{ await progRef.set({currentIndex:CUR,finished:true},{merge:true}); }catch(_){}
      // aici apelezi flow-ul tău de “final screen”
      // (pentru concizie nu-l expandăm; rămâne compatibil cu pagina ta)
      return;
    }
  }

  // Explicație (accordion toggle + video show/hide)
  const explain=e.target.closest(".explanation-btn,.explanation-card");
  if(explain){
    vibrateShort();
    // toggle
    const opening = !(refs.acc && refs.acc.classList.contains("open")) && !(refs.videoWrap && refs.videoWrap.style.display!=="none");
    if(opening){
      if(refs.acc){
        refs.acc.style.display="block"; refs.acc.classList.add("open");
        if(refs.accContent){ refs.accContent.style.display="block"; refs.accContent.style.maxHeight=refs.accContent.scrollHeight+"px"; }
        if(refs.accHeader){ refs.accHeader.setAttribute("aria-expanded","true"); }
      }
      if(refs.videoWrap) refs.videoWrap.style.display="block";
    }else{
      if(refs.videoWrap) refs.videoWrap.style.display="none";
      if(refs.acc){
        refs.acc.classList.remove("open"); refs.acc.style.display="none";
        if(refs.accContent){ refs.accContent.style.maxHeight="0px"; refs.accContent.style.display="none"; }
        if(refs.accHeader){ refs.accHeader.setAttribute("aria-expanded","false"); }
      }
    }
    return;
  }

  // AI
  const ai=e.target.closest(".ask-ai-btn,.ai-pop-wrapper");
  if(ai){
    vibrateShort();
    // aici deschizi pop-up-ul tău existent (logica păstrată)
    const pop=$(".ask-ai-pop-up"); if(pop){ pop.style.display="flex"; D.body.style.overflow="hidden"; }
    return;
  }

  // Accordion header (accesibilitate: Enter/Space)
  const header=e.target.closest(".custom-accordion-header");
  if(header){
    const opening = !(refs.acc && refs.acc.classList.contains("open"));
    if(refs.acc){
      refs.acc.style.display="block";
      refs.acc.classList.toggle("open",opening);
      if(refs.accHeader) refs.accHeader.setAttribute("aria-expanded",opening?"true":"false");
      if(refs.accContent){
        if(opening){
          refs.accContent.style.display="block";
          refs.accContent.style.maxHeight=refs.accContent.scrollHeight+"px";
        }else{
          refs.accContent.style.maxHeight="0px";
          refs.accContent.style.display="none";
        }
      }
    }
    return;
  }
});

/* Accesibilitate pentru tastatură (Enter/Space pe role="button") */
STAGE.addEventListener("keydown",(e)=>{
  if((e.key==="Enter"||e.key===" ") && e.target.getAttribute("role")==="button"){
    e.preventDefault(); e.target.click();
  }
});

/* =============== PREFETCH LA IDLE =============== */
rIC(()=>prefetchAhead(CUR));

/* =============== NOTE ===============
  - Gating / single-active-lock NU este implementat aici (conform cerinței tale).
  - Final screen & “wrong mode” complet pot rula pe scheletul tău existent; codul de mai sus e focusat pe A/B swap fără flicker și pe fluxul Verify/Next/Finish.
  - Sanitizarea e activă (SANITIZE_CONTENT=true). Dacă dorești să permiți HTML formatat din CMS, setează false (atenție la XSS).
====================================== */
});

