window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* =========================
   HELPERS
   ========================= */
const W=window,D=document,$=(s,p=D)=>p.querySelector(s),a=(s,p=D)=>Array.from(p.querySelectorAll(s));
const pad2=n=>String(n).padStart(2,"0");
const rIC=W.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:500}):fn=>setTimeout(fn,80);
const HAS_PLYR=!!(W&&W.Plyr);
const isFastNet=()=> (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g");
function blurActive(){try{const ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch{}}
function vibrateShort(){if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(35);}

/* XSS safety: afișăm text ca atare dacă nu dorim HTML dinamic */
const SANITIZE_CONTENT = true;
const sanitizeMaybe = (html)=> SANITIZE_CONTENT ? (()=>{const d=D.createElement("div");d.textContent=String(html||"");return d.innerHTML;})() : (html||"");

/* =========================
   LOADER & ENV
   ========================= */
D.body.classList.add("page-loading");
(function(){const l=$(".lesson-loader"); if(!l) return;
  Object.assign(l.style,{display:"flex",justifyContent:"center",alignItems:"center",position:"fixed",inset:"0",zIndex:"999"});
})();

const params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); return; }

const auth=firebase.auth(),db=firebase.firestore();
const user=auth.currentUser||await new Promise(res=>auth.onAuthStateChanged(res));
if(!user){ alert("Trebuie să fii autentificat."); location.href="/login"; return; }

/* Dacă ai lock-ul tău single-active (nu schimb nimic aici) */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* =========================
   REFS PAGINĂ
   ========================= */
const QSEC=$(".question-section");
const TEMPLATE_WRAPPER=(QSEC&&QSEC.querySelector(".question-wrapper"))||$(".question-wrapper");
const STAGE = (function(){
  // creăm un container care va ține A/B buffers
  let s = $(".question-stage");
  if(!s){
    s = D.createElement("div");
    s.className="question-stage";
    TEMPLATE_WRAPPER.parentNode.insertBefore(s, TEMPLATE_WRAPPER);
  }
  return s;
})();

/* Final screen refs */
const FINAL=$(".chapter-final-screen");
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC) QSEC.style.setProperty("display","flex","important");
const chapterTextFinal=$(".chapter-text-final"),
      progressCounterFinal=$(".progress-counter-final"),
      barOuterFinal=$(".chapter-progress-bar-outer");
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
function setFinalPercent(v){ensureFinalPercentEl(); if(finalPercentEl) finalPercentEl.textContent=String(v);}

/* Sunete */
const correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
const wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
const alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(a){try{a.pause();a.currentTime=0;a.play();}catch{}}

/* Toast */
const AWrap=$(".alert-wrapper-new");
const findAlertTextEl=w=>w?.querySelector(".select-answer-text")||w?.querySelector(".alert-box .select-answer-text")||null;
let alertBoxTimeout=null;
function toast(txt,dur=1000){
  if(!AWrap) return;
  const t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(()=>{AWrap.classList.remove("active");alertBoxTimeout=setTimeout(()=>{AWrap.style.display="none";alertBoxTimeout=null;},300);},dur);
}

/* Static labels */
const STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
const STATIC_WRONG  =["Greșit. Răspuns corect -","Nu e bine. Răspuns core -","Din păcate, nu. Răspuns core -","Mai încearcă. Răspuns core -","Alegere greșită. Răspuns core -","Nu e varianta bună. Răspuns core -"];
const lastStaticIdx={correct:-1,wrong:-1};
const pickNonRepeat=(arr,key)=>{let i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return i in arr?arr[i]:arr[0];};

/* =========================
   FIRESTORE: chapter + total
   ========================= */
const chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu există în baza de date!"); return; }
const chapterName=chapterDoc.data().Name;
async function getTotalCount(){
  const s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get();
  return s.size;
}
const TOTAL=await getTotalCount();

/* User collections */
const progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
const ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
const progRef       =progCollection.doc(CHAP);

/* =========================
   PREFETCH & BUFFER STORE
   ========================= */
const BUF={}; // idx -> question data (+ __imgReady)
function primeImage(url,{priority="auto"}={}){
  const img=new Image(); img.decoding="async";
  try{img.fetchPriority=priority;}catch{try{img.setAttribute("fetchpriority",priority);}catch{}}
  img.src=url;
  const ready=img.decode?img.decode():new Promise(r=>{img.onload=img.onerror=r;});
  return {img,ready};
}
async function prefetchQuestion(idx){
  if(!idx||BUF[idx]) return;
  let snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",idx).limit(1).get();
  if(snap.empty){ try{ snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get(); }catch{} }
  if(snap.empty) return;
  const data=snap.docs[0].data(); BUF[idx]=data;
  if(data.Image){ try{ const {ready}=primeImage(data.Image,{priority:"auto"}); BUF[idx].__imgReady=ready; ready.catch(()=>{});}catch{BUF[idx].__imgReady=Promise.resolve();} }
  else BUF[idx].__imgReady=Promise.resolve();
}
async function prefetchMany(indices,priorityMap={}){
  const list=(indices||[]).filter(v=>v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]); if(!list.length) return;
  try{
    const qs=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","in",list.slice(0,10)).get();
    qs.forEach(doc=>{
      const d=doc.data(),i=d.Index; if(!i||BUF[i]) return; BUF[i]=d;
      if(d.Image){ const pr=priorityMap[i]||"low"; try{ const {ready}=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=ready; ready.catch(()=>{});}catch{BUF[i].__imgReady=Promise.resolve();} }
      else BUF[i].__imgReady=Promise.resolve();
    });
  }catch{ await Promise.all(list.map(v=>prefetchQuestion(v))); }
}
async function prefetchAhead(current){
  const fast=isFastNet(); const targets=[current+1]; if(fast) targets.push(current+2);
  const prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio); rIC(()=>{});
}

/* =========================
   BUILD BUFFER (clone template)
   ========================= */
function collectRefs(root){
  const need=(sel)=>root.querySelector(sel);
  const o={root};
  o.qEl = need(".questions-collection-list-item")||root;
  o.qWrap = need(".question-wrapper")||o.qEl;
  o.qInner= need(".question-wrapper-inner")||o.qWrap;
  o.qText= need(".question-text");
  o.progress= need(".progress-counter");
  o.mainWrap= need(".main-content-wrapper");
  o.optWrap= need(".options-wrapper");
  o.cards=[...o.optWrap.querySelectorAll(".option-card")];
  o.items=o.cards.map(c=>c.querySelector(".option-item"));
  o.imgWrap= need(".question-image-wrapper");
  o.img    = need(".question-image"); // va deveni layer A
  o.videoWrap= need(".explanation-video-wrapper");
  o.acc= need(".custom-accordion");
  o.accHeader=o.acc?.querySelector(".custom-accordion-header"); 
  o.accArrow =o.acc?.querySelector(".custom-accordion-arrow");
  o.accContent=o.acc?.querySelector(".custom-accordion-content");
  o.accBody  =o.acc?.querySelector(".custom-accordion-body");
  o.expLabelEl=o.acc?.querySelector(".custom-accordion-label");
  o.accAnchor=o.acc?.querySelector(".accordion-anchor");
  o.anchorTop= need(".explanation-anchor-top");
  o.anchor   = need(".explanation-anchor");
  o.feedbackWrap= need(".feedback-wrapper");
  o.staticText=o.feedbackWrap?.querySelector(".correct-answer-static");
  o.correctAns=o.feedbackWrap?.querySelector(".correct-answer");
  o.buttonsWrap= need(".submit-next-buttons");
  o.submitBtn   = o.buttonsWrap?.querySelector(".submit-btn");
  o.explainBtn  = o.buttonsWrap?.querySelector(".explanation-btn")||o.buttonsWrap?.querySelector(".explanation-card");
  o.aiBtn       = o.buttonsWrap?.querySelector(".ask-ai-btn")||o.buttonsWrap?.querySelector(".ai-pop-wrapper");
  // a11y pentru butoane non-<button>
  [o.explainBtn,o.aiBtn].forEach(btn=>{
    if(btn && btn.tagName!=="BUTTON"){ btn.setAttribute("role","button"); btn.setAttribute("tabindex","0"); }
  });
  // a11y accordion
  if(o.accHeader){
    o.accHeader.setAttribute("role","button");
    o.accHeader.setAttribute("tabindex","0");
    o.accHeader.setAttribute("aria-expanded", "false");
    const cid = o.accContent ? ("acc-content-" + Math.random().toString(36).slice(2,8)) : "";
    if(o.accContent){ o.accContent.id = cid; o.accHeader.setAttribute("aria-controls", cid); }
  }
  return o;
}
function buildBufferFromTemplate(name){
  const clone=TEMPLATE_WRAPPER.cloneNode(true);
  clone.classList.add("question-wrapper-buffer");
  clone.classList.remove("visible");
  clone.dataset.buffer=name;
  // ascundem orice stare rătăcită
  const fb=clone.querySelector(".feedback-wrapper"); if(fb) fb.style.display="none";
  const acc=clone.querySelector(".custom-accordion"); if(acc){ acc.classList.remove("open"); const cc=acc.querySelector(".custom-accordion-content"); if(cc){cc.style.maxHeight="0px"; cc.style.display="none";} }
  // montăm în stage
  STAGE.appendChild(clone);
  // colectăm refs
  const refs=collectRefs(clone);
  // pregătim straturi imagine (A= existent, B= nou)
  ensureImageLayers(refs);
  // bind selectare opțiuni
  bindOptionSelection(refs);
  // bind accordion/explanations
  bindAccordion(refs);
  bindExplainBtn(refs);
  bindAIBtn(refs);
  return refs;
}

/* =========================
   IMAGE LAYERS per buffer
   ========================= */
function ensureImageLayers(refs){
  if(!refs.imgWrap) return;
  const cs = getComputedStyle(refs.imgWrap);
  if(cs.position==="static") refs.imgWrap.style.position="relative";
  // layer A: fie .question-image existentă, fie o creăm
  if(!refs.img){
    const a=D.createElement("img");
    a.className="question-image img-layer active";
    a.alt=""; a.decoding="async"; a.draggable=false;
    refs.imgWrap.appendChild(a); refs.img=a;
  }else{
    refs.img.classList.add("img-layer","active"); refs.img.decoding="async"; refs.img.draggable=false;
  }
  // layer B:
  if(!refs.imgB){
    const b=D.createElement("img");
    b.className="img-layer"; b.alt=""; b.decoding="async"; b.draggable=false;
    refs.imgWrap.appendChild(b); refs.imgB=b;
  }
  refs.__activeLayer = "A";
}
async function swapImageInBuffer(refs,url,readyPromise){
  const hasNew=!!url;
  const current = (refs.__activeLayer==="A")?refs.img:refs.imgB;
  const next    = (refs.__activeLayer==="A")?refs.imgB:refs.img;

  // fără imagine
  if(!hasNew){
    current?.classList.remove("active");
    next?.classList.remove("active");
    applyNoImageState(refs,true);
    return;
  }

  try{ await (readyPromise||Promise.resolve()); }catch{}
  if(next && next.src!==url) next.src=url;

  // activăm next instant (fără tranziție), apoi reactivăm tranziția pentru fade-out al curentului
  if(next){
    next.style.transition="opacity 0s"; next.classList.add("active"); void next.offsetWidth;
    next.style.transition=""; // restabilim
  }
  applyNoImageState(refs,false);
  if(current) current.classList.remove("active");
  refs.__activeLayer = (refs.__activeLayer==="A")?"B":"A";
}
function applyNoImageState(refs,on){
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

/* =========================
   SELECTARE OPȚIUNI
   ========================= */
function getLetterFromCard(card){
  const el=card.querySelector(".option-letter"); if(!el) return "";
  for(const n of el.childNodes){
    if(n.nodeType===Node.TEXT_NODE){
      const t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase();
    }
  }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearAllSelected(scope){
  (scope||D).querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected").forEach(el=>el.classList.remove("selected"));
  (scope||D).querySelectorAll(".option-card.selected").forEach(el=>el.classList.remove("selected"));
}
function applySelectedVisuals(refs,SEL){
  refs.qEl.querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card), on=SEL.includes(L);
    card.classList.toggle("selected",on);
    card.querySelector(".option-letter")?.classList.toggle("selected",on);
    card.querySelector(".option-item")?.classList.toggle("selected",on);
    card.querySelector(".option-card-connector")?.classList.toggle("selected",on);
  });
}
function clearLetterStates(refs){ refs.qEl.querySelectorAll(".option-letter").forEach(el=>el.classList.remove("correct","wrong")); }
function markByCorrect(refs,corArr){
  const COR=new Set((corArr||[]).map(x=>String(x||"").trim().toUpperCase()));
  refs.qEl.querySelectorAll(".option-card").forEach(card=>{
    const L=getLetterFromCard(card),el=card.querySelector(".option-letter");
    if(!el||!L) return;
    el.classList.remove("correct","wrong"); el.classList.add(COR.has(L)?"correct":"wrong");
    card.classList.toggle("wrong-card",!COR.has(L));
  });
}
function bindOptionSelection(refs){
  refs.cards.forEach(card=>{
    if(card.dataset.boundSel==='1') return;
    card.addEventListener("click",()=>{
      if(STATE.ANSW) return;
      vibrateShort();
      const L=getLetterFromCard(card); if(!L) return;
      const set=STATE.SEL;
      const i=set.indexOf(L);
      if(i===-1) set.push(L); else set.splice(i,1);
      applySelectedVisuals(refs,set);
    },{passive:true});
    card.dataset.boundSel='1';
  });
}

/* =========================
   ACCORDION / EXPLICAȚII
   ========================= */
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
function scrollParent(el){
  const qwi=el.closest?.(".question-wrapper-inner"); if(qwi) return qwi;
  let p=el.parentElement; while(p){ const s=getComputedStyle(p),oy=s.overflowY; if(oy==="auto"||"scroll"===oy||"overlay"===oy) return p; p=p.parentElement; }
  return document.scrollingElement||document.documentElement;
}
function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function smoothScrollTo(target,container,{offset=0}={}){
  if(!target) return;
  const c=container||scrollParent(target);
  const isWin=(c===document.scrollingElement||c===document.documentElement||c===document.body);
  const getTop=()=> (isWin?target.getBoundingClientRect().top:(target.getBoundingClientRect().top - c.getBoundingClientRect().top)) + (isWin?window.pageYOffset:c.scrollTop) - offset;
  const to=Math.max(0,Math.round(getTop()));
  const start=isWin?window.pageYOffset:c.scrollTop,dist=to-start,dur=400; let st=null;
  const step=ts=>{ if(!st) st=ts; const p=Math.min((ts-st)/dur,1),y=Math.round(start+dist*easeInOut(p)); isWin?window.scrollTo(0,y):c.scrollTop=y; if(p<1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function bindAccordion(refs){
  if(!refs.accHeader || refs.accHeader.dataset.boundAcc) return;
  bindPressFeedback(refs.accHeader,refs.accContent);
  const toggle=(open)=>{
    const acc=refs.acc, c=refs.accContent; if(!acc) return;
    acc.classList.toggle("open", open);
    refs.accHeader.setAttribute("aria-expanded", open?"true":"false");
    if(open){ if(c){ c.style.display="block"; c.style.maxHeight=c.scrollHeight+"px"; } }
    else{ if(c){ c.style.maxHeight="0px"; } }
  };
  refs.accHeader.addEventListener("click",()=>toggle(!refs.acc?.classList.contains("open")));
  refs.accHeader.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); toggle(!refs.acc?.classList.contains("open")); }});
  refs.accHeader.dataset.boundAcc='1';
}
function bindExplainBtn(refs){
  if(!refs.explainBtn || refs.explainBtn.dataset.boundExp) return;
  refs.explainBtn.addEventListener("click",()=>{
    vibrateShort();
    const opening = !(refs.acc && refs.acc.classList.contains("open"));
    if(opening){
      refs.acc && (refs.acc.style.display="block");
      if(refs.acc && refs.accContent){
        refs.accContent.style.display="block";
        refs.accContent.style.maxHeight=refs.accContent.scrollHeight+"px";
      }
      refs.accHeader && refs.accHeader.setAttribute("aria-expanded","true");
      if(refs.videoWrap){ refs.videoWrap.style.display="block"; }
      smoothScrollTo(refs.anchor||refs.acc, scrollParent(refs.qEl));
    }else{
      if(refs.acc){ refs.acc.classList.remove("open"); }
      if(refs.accContent){ refs.accContent.style.maxHeight="0px"; }
      if(refs.videoWrap){ refs.videoWrap.style.display="none"; const v=refs.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch{} } }
      refs.accHeader && refs.accHeader.setAttribute("aria-expanded","false");
      smoothScrollTo(refs.anchorTop||refs.qEl, scrollParent(refs.qEl));
    }
  });
  // a11y: tastatură
  refs.explainBtn.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); refs.explainBtn.click(); }});
  refs.explainBtn.dataset.boundExp='1';
}

/* =========================
   VIDEO
   ========================= */
function setVideoBlock(refs,url){
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
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch{} }
    playerEl.addEventListener("click",(e)=>{ if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return; e.stopPropagation(); try{ playerEl.plyr? (playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play()) : (playerEl.paused?playerEl.play():playerEl.pause()); }catch{}; });
  }
}

/* =========================
   AI POP
   ========================= */
let AIPop=null;
function ensureAIPop(){
  if(AIPop) return AIPop;
  AIPop=$(".ask-ai-pop-up");
  if(!AIPop){
    AIPop=D.createElement("div"); AIPop.className="ask-ai-pop-up";
    Object.assign(AIPop.style,{display:"none",position:"fixed",inset:"0",justifyContent:"center",alignItems:"center",background:"rgba(0,0,0,.5)",backdropFilter:"blur(2px)",zIndex:"2147483647"});
    const box=D.createElement("div"); box.className="audio-btn"; Object.assign(box.style,{display:"flex",gap:"12px",alignItems:"center",background:"#121212",padding:"16px 20px",borderRadius:"12px",border:"1px solid #2a2a2a"});
    const mic=D.createElement("div"); mic.className="mic-icon-ai"; Object.assign(mic.style,{width:"36px",height:"36px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",overflow:"hidden"});
    const img=D.createElement("img"); img.alt="AI"; img.src="https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/685c48b463b6d0ce30731509_ChatGPT%20Image%20Jun%2020%2C%202025%2C%2001_39_41%20PM.png"; Object.assign(img.style,{width:"100%",height:"100%",objectFit:"cover"}); mic.appendChild(img);
    const audioBtn=D.createElement("button"); audioBtn.className="audio-ai-btn"; audioBtn.textContent="Audio AI"; Object.assign(audioBtn.style,{padding:"10px 14px",borderRadius:"10px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    const closeBtn=D.createElement("button"); closeBtn.className="ask-ai-pop-up-close"; closeBtn.textContent="Închide"; Object.assign(closeBtn.style,{marginLeft:"8px",padding:"8px 12px",borderRadius:"8px",border:"1px solid #3a3a3a",background:"#1d1d1d",color:"#fff",cursor:"pointer"});
    box.append(mic,audioBtn,closeBtn); AIPop.appendChild(box); D.body.appendChild(AIPop);
  }
  AIPop.addEventListener("click",e=>{ if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){ vibrateShort(); AIPop.style.display="none"; D.body.style.overflow=""; }});
  AIPop.querySelector(".audio-ai-btn")?.addEventListener("click",()=>{ vibrateShort(); /* hook STT/TTS aici */ });
  return AIPop;
}
function bindAIBtn(refs){
  if(!refs.aiBtn || refs.aiBtn.dataset.boundAi) return;
  if(refs.aiBtn && refs.aiBtn.tagName!=="BUTTON"){ refs.aiBtn.setAttribute("role","button"); refs.aiBtn.setAttribute("tabindex","0"); }
  refs.aiBtn.addEventListener("click",()=>{ vibrateShort(); ensureAIPop().style.display="flex"; D.body.style.overflow="hidden"; });
  refs.aiBtn.addEventListener("keydown",(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); refs.aiBtn.click(); }});
  refs.aiBtn.dataset.boundAi='1';
}

/* =========================
   STATE
   ========================= */
const STATE={
  CUR:1, FIN:false, SEL:[], ANSW:false,
  WRMODE:false, WRONG:[], WRP:0,
  // wrong-mode persist
  WRONG_STARTED_AT_MS:0,
  LS_WRONG_KEY:`wm:${user.uid}:${CHAP}`,
  ACTIVE_BUF:"A", // "A" sau "B"
  BUF_A:null, BUF_B:null // refs pentru buffers
};

/* Progress existent */
const progSnap=await progRef.get();
if(progSnap.exists){
  if(progSnap.data().currentIndex) STATE.CUR=progSnap.data().currentIndex;
  if(progSnap.data().finished) STATE.FIN=true;
}

/* =========================
   PREPARE BUFFERS A & B
   ========================= */
if(!TEMPLATE_WRAPPER){ alert("Structura nu e completă. Verifică clasele HTML."); D.body.classList.remove("page-loading"); return; }
// scoatem template-ul original din flux (devine doar sursă de clone, îl ascundem)
TEMPLATE_WRAPPER.style.display="none";

// construim A/B
STATE.BUF_A = buildBufferFromTemplate("A");
STATE.BUF_B = buildBufferFromTemplate("B");
// buffer A pornește vizibil
STATE.BUF_A.root.classList.add("visible");

/* =========================
   WRONG-MODE PERSIST
   ========================= */
async function persistWrongMode({active,list,pos}){
  try{
    const payload={active:!!active,list:Array.isArray(list)?list.map(v=>+v).filter(Number.isFinite):[],pos:Math.max(0,Math.min((Array.isArray(list)?list.length-1:0),(+pos||0))),startedAtMs: STATE.WRONG_STARTED_AT_MS||Date.now()};
    STATE.WRONG_STARTED_AT_MS=payload.startedAtMs;
    await progRef.set({wrongMode:payload},{merge:true});
    try{ localStorage.setItem(STATE.LS_WRONG_KEY,JSON.stringify(payload)); }catch{}
  }catch{
    try{ localStorage.setItem(STATE.LS_WRONG_KEY,JSON.stringify({active:!!active,list:list||[],pos:+pos||0,startedAtMs:STATE.WRONG_STARTED_AT_MS||Date.now()})); }catch{}
  }
}
async function loadWrongModePersist(){
  let out=null;
  try{
    const ps=await progRef.get(); const wm=ps.exists&&ps.data().wrongMode?ps.data().wrongMode:null;
    if(wm&&wm.active){ out={active:!!wm.active,list:(wm.list||[]).map(v=>+v).filter(Number.isFinite),pos:+wm.pos||0,startedAtMs:+wm.startedAtMs||0}; }
  }catch{}
  if(!out||!out.active){
    try{ const raw=localStorage.getItem(STATE.LS_WRONG_KEY); if(raw){ const wm=JSON.parse(raw); if(wm&&wm.active) out=wm; } }catch{}
  }
  return out;
}
async function clearWrongModePersist(){
  try{ await progRef.set({wrongMode:{active:false,list:[],pos:0,startedAtMs:0}},{merge:true}); }catch{}
  try{ localStorage.removeItem(STATE.LS_WRONG_KEY); }catch{}
}

/* =========================
   RENDER / HYDRATE ÎNTREBARE
   ========================= */
function setSubmitState(refs,state){
  const btn=refs.submitBtn; if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  switch(state){
    case "verify": btn.textContent="VERIFICĂ"; btn.classList.add("is-verify","_preload-full"); btn.style.gridColumn="1/2"; break;
    case "next": {
      const last=STATE.WRMODE?(STATE.WRP===STATE.WRONG.length-1):(STATE.CUR===TOTAL);
      btn.textContent=last?"FINALIZEAZĂ":"CONTINUĂ";
      if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
      btn.style.gridColumn="2/3"; break;
    }
    case "finish": btn.textContent="FINALIZEAZĂ"; btn.classList.add("is-finish","finish-chapter-btn"); btn.style.gridColumn="2/3"; break;
  }
}
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(x=>String(x||"").trim().toUpperCase()).filter(x=>x==="A"||x==="B"||x==="C");
}
function stopActiveMedia(refs){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch{}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch{}
  const v=refs.videoWrap?.querySelector("video");
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch{} }
}
function setButtonsLock(refs,on){
  if(!refs.buttonsWrap) return;
  if(on){ refs.buttonsWrap.style.setProperty("pointer-events","none","important"); refs.submitBtn?.setAttribute("aria-disabled","true"); }
  else { refs.buttonsWrap.style.removeProperty("pointer-events"); refs.submitBtn?.setAttribute("aria-disabled","false"); }
}

function fillQuestionIntoBuffer(refs,q,idx,{resetSelections=false}={}){
  // header + progress
  (refs.qEl.querySelector(".chapter-text")||D.createElement("div")).textContent=sanitizeMaybe(chapterName);
  if(refs.progress){
    if(STATE.WRMODE) refs.progress.textContent = `${pad2(STATE.WRP+1)}/${pad2(STATE.WRONG.length)}`;
    else refs.progress.textContent = `${pad2(STATE.CUR)}/${pad2(TOTAL)}`;
  }
  // întrebare
  refs.qText.innerHTML=""; refs.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(q.Question||""));
  // opțiuni
  const vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  refs.cards.forEach((card,i)=>{
    const val=vals[i]||""; const it=refs.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });
  // explicație
  if(refs.accBody){
    refs.accBody.innerHTML="";
    const ex=q["Explanation"]||"";
    if(ex) refs.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }
  if(refs.acc){ refs.acc.classList.remove("open"); if(refs.accContent){ refs.accContent.style.maxHeight="0px"; refs.accContent.style.display="none"; } }
  if(refs.accHeader){ refs.accHeader.setAttribute("aria-expanded","false"); }
  refs.feedbackWrap && (refs.feedbackWrap.style.display="none");
  refs.correctAns && (refs.correctAns.textContent="");
  refs.staticText && (refs.staticText.textContent="Răspunsul corect este:");
  // video
  setVideoBlock(refs, q["Explanation Video Link"]||"");
  // selections
  STATE.SEL = resetSelections ? [] : [];
  STATE.ANSW=false;
  clearLetterStates(refs); clearAllSelected(refs.qEl);
  refs.buttonsWrap?.classList.add("single-btn-state");
  setSubmitState(refs,"verify");
}

async function renderIntoInactiveBuffer(idx){
  const q=BUF[idx]; if(!q) return null;
  const inactive = (STATE.ACTIVE_BUF==="A") ? STATE.BUF_B : STATE.BUF_A;
  fillQuestionIntoBuffer(inactive,q,idx,{resetSelections:true});
  // imagine
  try{ await (q.Image ? (q.__imgReady||Promise.resolve()) : Promise.resolve()); }catch{}
  await swapImageInBuffer(inactive, q.Image||null, q.__imgReady);
  return inactive;
}
function swapBuffers(showRefs){
  const hideRefs = (showRefs===STATE.BUF_A) ? STATE.BUF_B : STATE.BUF_A;
  hideRefs.root.classList.remove("visible");
  showRefs.root.classList.add("visible");
  STATE.ACTIVE_BUF = (showRefs===STATE.BUF_A) ? "A" : "B";
}

/* =========================
   FINAL SCREEN
   ========================= */
async function showFinal(){
  if(chapterTextFinal) chapterTextFinal.textContent=chapterName;
  const answersSnap=await ansCollection.where("chapterSlug","==",CHAP).get();
  let correct=0,wrong=0;
  answersSnap.forEach(doc=>{
    const d=doc.data();
    const sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
    if(sel&&sel===cor) correct++; else if(sel) wrong++;
  });
  const safeTotal=(TOTAL&&TOTAL>0)?TOTAL:Math.max(1,correct+wrong);
  const cPct=Math.round((correct/safeTotal)*100);
  // mic anim text
  ensureFinalPercentEl(); setFinalPercent("0%");
  const start=performance.now(),dur=800;
  const step=(ts)=>{ const p=Math.min((ts-start)/dur,1),val=Math.round(p*(+cPct||0)); setFinalPercent(val+"%"); if(p<1) requestAnimationFrame(step); };
  requestAnimationFrame(step);

  FINAL?.style.setProperty("display","flex","important");
}

/* =========================
   FLOW INIT
   ========================= */
async function initialRender(){
  if(STATE.FIN){ await showFinal(); D.body.classList.remove("page-loading"); return; }
  await prefetchQuestion(STATE.CUR);
  await prefetchAhead(STATE.CUR);
  // randăm în bufferul activ pentru prima întrebare (A)
  fillQuestionIntoBuffer(STATE.BUF_A, BUF[STATE.CUR], STATE.CUR, {resetSelections:false});
  await swapImageInBuffer(STATE.BUF_A, BUF[STATE.CUR].Image||null, BUF[STATE.CUR].__imgReady);
  D.body.classList.remove("page-loading");
}
const wmPersist=await loadWrongModePersist();
if(wmPersist && wmPersist.active && (wmPersist.list||[]).length){
  STATE.WRMODE=true; STATE.WRONG=wmPersist.list.slice(0);
  STATE.WRP=Math.max(0,Math.min(STATE.WRONG.length-1,+wmPersist.pos||0));
  STATE.WRONG_STARTED_AT_MS=+wmPersist.startedAtMs||Date.now();
  await prefetchQuestion(STATE.WRONG[STATE.WRP]);
  await prefetchAhead(STATE.WRONG[STATE.WRP]);
  fillQuestionIntoBuffer(STATE.BUF_A, BUF[STATE.WRONG[STATE.WRP]], STATE.WRONG[STATE.WRP], {resetSelections:true});
  await swapImageInBuffer(STATE.BUF_A, BUF[STATE.WRONG[STATE.WRP]].Image||null, BUF[STATE.WRONG[STATE.WRP]].__imgReady);
  D.body.classList.remove("page-loading");
}else{
  await initialRender();
}

/* =========================
   SUBMIT/NEXT/FINISH – pe STAGE (delegate)
   ========================= */
function activeRefs(){ return (STATE.ACTIVE_BUF==="A")?STATE.BUF_A:STATE.BUF_B; }
function activeIndex(){ return STATE.WRMODE ? STATE.WRONG[STATE.WRP] : STATE.CUR; }

STAGE.addEventListener("click", async (e)=>{
  const submitBtn=e.target.closest(".submit-btn");
  if(!submitBtn) return;
  e.preventDefault(); vibrateShort();

  const refs=activeRefs();
  const idx=activeIndex();
  const isVerify=submitBtn.classList.contains("is-verify"),
        isFinish=submitBtn.classList.contains("is-finish")||submitBtn.classList.contains("finish-chapter-btn"),
        isNext=submitBtn.classList.contains("is-next");

  if(isFinish && STATE.ANSW){
    stopActiveMedia(refs);
    try{ await progRef.set({currentIndex:STATE.CUR,finished:true},{merge:true}); }catch{}
    STATE.WRMODE=false; await clearWrongModePersist(); await showFinal(); return;
  }

  if(isNext && STATE.ANSW){
    stopActiveMedia(refs); setButtonsLock(refs,true);
    if(STATE.WRMODE){
      STATE.WRP++;
      if(STATE.WRP>=STATE.WRONG.length){
        STATE.WRMODE=false;
        try{ await progRef.set({finished:true},{merge:true}); }catch{}
        await clearWrongModePersist(); await showFinal(); return;
      }
      await persistWrongMode({active:true,list:STATE.WRONG,pos:STATE.WRP});
      await prefetchAhead(STATE.WRONG[STATE.WRP]||0);
      STATE.SEL=[]; STATE.ANSW=false;

      const targetIdx=STATE.WRONG[STATE.WRP];
      await prefetchQuestion(targetIdx);
      const showBuffer=await renderIntoInactiveBuffer(targetIdx);
      swapBuffers(showBuffer);
      setButtonsLock(refs,false);
      return;
    }else{
      if(STATE.CUR<TOTAL){
        STATE.CUR++; try{ await progRef.set({currentIndex:STATE.CUR},{merge:true}); }catch{}
        await prefetchAhead(STATE.CUR);
        STATE.SEL=[]; STATE.ANSW=false;

        await prefetchQuestion(STATE.CUR);
        const showBuffer=await renderIntoInactiveBuffer(STATE.CUR);
        swapBuffers(showBuffer);
      }else{
        try{ await progRef.set({finished:true},{merge:true}); }catch{}
        await showFinal();
      }
      setButtonsLock(refs,false);
      return;
    }
  }

  if(isVerify){
    if(STATE.SEL.length===0){
      toast("Selectează un răspuns!",1000);
      playOne(alertSound);
      refs.buttonsWrap.classList.add("single-btn-state"); submitBtn.style.gridColumn="1/2";
      return;
    }
    const q=BUF[idx]; if(!q) return;
    const cor=parseCorrectLetters(q);
    STATE.ANSW=true;

    clearLetterStates(refs); markByCorrect(refs,cor);
    const selected=STATE.SEL.slice().sort().join(","), correct=cor.slice().sort().join(","),
          isFullyCorrect=selected.length>0&&selected===correct;

    refs.staticText.textContent=isFullyCorrect?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
    const ord=["A","B","C"].filter(x=>cor.includes(x)); refs.correctAns.textContent=ord.join(", ");
    refs.feedbackWrap.style.setProperty("display","flex","important");
    refs.buttonsWrap.classList.remove("single-btn-state");
    const lastWrong=STATE.WRMODE&&(STATE.WRP===STATE.WRONG.length-1), lastNormal=!STATE.WRMODE&&(STATE.CUR===TOTAL);
    setSubmitState(refs,(lastWrong||lastNormal)?"finish":"next");

    // sunet
    playOne(isFullyCorrect?correctSound:wrongSound);

    // scroll la explicații (ancora)
    requestAnimationFrame(()=>{ smoothScrollTo(refs.anchor||refs.qEl, scrollParent(refs.qEl)); });

    const nowMs=Date.now();
    Promise.all([
      ansCollection.doc(`${CHAP}_${idx}`).set({
        module:"mediu",chapterSlug:CHAP,index:idx,question:BUF[idx]?.Question||"",
        options:["A","B","C"].map(L=>({letter:L,value:BUF[idx]?.["Option "+L]||""})),
        selected:STATE.SEL.slice(),correct:cor.slice(),explanation:BUF[idx]?.["Explanation"]||"",
        answeredAt:firebase.firestore.FieldValue.serverTimestamp(),
        answeredAtMs: nowMs
      },{merge:true}),
      progRef.set({currentIndex:STATE.CUR,finished:false},{merge:true})
    ]).catch(err=>{ console.warn("Eroare salvare:",err); toast("Conexiune slabă – reîncerc…",1200); });
  }
});

/* selectare cu tastatura ENTER global pe submit */
D.addEventListener("keydown",(e)=>{
  if(e.key==="Enter"){ const btn=activeRefs().submitBtn; if(btn){ e.preventDefault(); btn.click(); } }
  else if(e.key==="Escape"){
    try{
      D.querySelectorAll(".alert-wrapper-new.active").forEach(w=>{w.classList.remove("active"); w.style.display="none";});
      const aiPop=$(".ask-ai-pop-up"); if(aiPop) aiPop.style.display="none";
      const loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
      D.body.classList.remove("page-loading"); D.body.style.overflow="";
    }catch{}
  }
});

/* =========================
   WRONG-MODE BUILD + START
   ========================= */
async function buildWrongList(){
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

async function startWrongMode(){
  vibrateShort(); stopActiveMedia(activeRefs());
  const l=$(".lesson-loader"); if(l) l.style.setProperty("display","flex","important");
  FINAL?.style.setProperty("display","none","important");

  try{
    let list=await buildWrongList();
    if(!list.length){
      alert("Nu ai nicio întrebare greșită de refăcut la acest capitol!");
      if(l) l.style.setProperty("display","none","important");
      FINAL?.style.setProperty("display","flex","important");
      return;
    }
    STATE.WRMODE=true; STATE.WRONG=list.slice(0); STATE.WRP=0; STATE.WRONG_STARTED_AT_MS=Date.now();
    await persistWrongMode({active:true,list:STATE.WRONG,pos:STATE.WRP});
    await prefetchMany(list,{[list[0]]:"high"});
    await prefetchQuestion(list[0]);

    const showBuffer=await renderIntoInactiveBuffer(list[0]);
    swapBuffers(showBuffer);
    await prefetchAhead(list[0]);
  }catch(e){
    console.error("WRONG MODE ERR:",e);
    alert("A apărut o eroare la încărcarea întrebărilor greșite.");
  }finally{
    if(l) l.style.setProperty("display","none","important");
  }
}

/* Butoane Finale (delegate global) */
D.addEventListener("click", async (e)=>{
  if(e.target.closest(".reset-wrong-questions-only")){ await startWrongMode(); return; }
  if(e.target.closest(".next-chapter-btn")){
    vibrateShort(); stopActiveMedia(activeRefs()); await clearWrongModePersist();
    // calc next by Index
    let NEXT=null;
    try{
      const s=await db.collection("mediu_invatare_chapters").orderBy("Index").get(); const arr=[];
      s.forEach(d=>arr.push(d.id));
      const i=arr.indexOf(CHAP); NEXT=(i!==-1&&i<arr.length-1)?arr[i+1]:null;
    }catch{}
    if(NEXT) location.replace(`${location.pathname}?chapter=${encodeURIComponent(NEXT)}`);
    return;
  }
  if(e.target.closest(".reset-chapter-btn")){ const aw=$(".alert-wrapper"); if(aw) aw.style.display="flex"; return; }
  if(e.target.closest(".confirm-reset-chapter")){
    vibrateShort(); stopActiveMedia(activeRefs()); const aw=$(".alert-wrapper");
    try{
      await progRef.delete();
      await clearWrongModePersist();
      const qs=await ansCollection.where("chapterSlug","==",CHAP).get();
      const batch=db.batch(); qs.forEach(doc=>batch.delete(doc.ref)); await batch.commit(); location.reload();
    }catch{
      alert("Eroare la resetarea progresului. Încearcă din nou.");
      if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important");
    }
    return;
  }
  if(e.target.closest(".back-to-chapter-final-screen")){
    vibrateShort(); const aw=$(".alert-wrapper"); if(aw) aw.style.display="none"; FINAL?.style.setProperty("display","flex","important"); return;
  }
});

/* DONE */
});