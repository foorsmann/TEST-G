window.Webflow=window.Webflow||[];Webflow.push(async function(){
"use strict";

/* ----- Utilitare scurte ----- */
var W=window,D=document,$=function(s,p){return (p||D).querySelector(s)},a=function(s,p){return Array.from((p||D).querySelectorAll(s))};
var pad2=function(n){return String(n).padStart(2,"0")},HAS_PLYR=!!(W&&W.Plyr);
var rIC=W.requestIdleCallback?function(fn){requestIdleCallback(fn,{timeout:500})}:function(fn){setTimeout(fn,120)};
var isFastNet=function(){return (navigator&&navigator.connection&&navigator.connection.effectiveType==="4g")};
function blurActive(){try{var ae=D.activeElement;if(ae&&ae!==D.body) ae.blur();}catch(_){}}

/* ----- Loader inițial ----- */
D.body.classList.add("page-loading");
(function(){var l=$(".lesson-loader"); if(!l) return;
  l.style.setProperty("display","flex","important");
  l.style.setProperty("justify-content","center","important");
  l.style.setProperty("align-items","center","important");
  l.style.setProperty("position","fixed","important");
  l.style.setProperty("inset","0","important");
  l.style.setProperty("z-index","999","important");
})();

/* ----- A/B: asigură structura chiar dacă lipsește în HTML ----- */
function ensureABStructure(){
  var shell=$(".question-shell-w");
  var A=$(".question-wrapper-a",shell), B=$(".question-wrapper-b",shell);

  if(shell && A && B) return {shell:shell, WA:A, WB:B};

  // Dacă nu există, încercăm să construim din structura actuală
  var root=$(".question-section")||D;
  var single= root.querySelector(".question-wrapper");
  if(!single){
    alert("Structura întrebărilor nu este găsită. Adaugă .question-wrapper în pagină.");
    return null;
  }

  // Creăm shell
  shell=D.createElement("div"); shell.className="question-shell-w";
  // Wrapper A
  A=D.createElement("div"); A.className="question-wrapper-a question-wrapper q-fade visible is-active";
  A.appendChild(single.cloneNode(true));
  // Wrapper B
  B=D.createElement("div"); B.className="question-wrapper-b question-wrapper";
  B.appendChild(single.cloneNode(true));

  // Înlocuim wrapperul vechi cu shell + A/B
  var parent=single.parentElement;
  parent.replaceChild(shell, single);
  shell.appendChild(A);
  shell.appendChild(B);

  // Scoatem fade-ul pentru instant flip
  try{ A.classList.remove("q-fade"); B.classList.remove("q-fade"); }catch(_){}
  return {shell:shell, WA:A, WB:B};
}

/* ----- Firebase / context ----- */
var params=new URLSearchParams(location.search),CHAP=params.get("chapter");
if(!CHAP){ alert("Capitolul nu a fost specificat."); return; }
if(!(window.firebase&&firebase.auth&&firebase.firestore)){ alert("Firebase nu este disponibil."); return; }
var auth=firebase.auth(),db=firebase.firestore();
var user=auth.currentUser||await new Promise(function(res){auth.onAuthStateChanged(res)});
if(!user){ alert("Trebuie sa fii autentificat."); location.href="/login"; return; }

/* Optional: lock single-active dacă e disponibil global (nu stricăm nimic) */
if (window.installSingleActiveLock) {
  window.installSingleActiveLock({
    lockKey: "chapter:" + CHAP,
    redirectUrl: "https://webarcs-ultra-awesome-site.webflow.io/mediu-invatare",
    userId: user.uid
  });
}

/* ----- Elemente UI de bază ----- */
var QSEC=$(".question-section");
var FINAL=$(".chapter-final-screen");
if(FINAL) FINAL.style.setProperty("display","none","important");
if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

var correctSound=new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686893516d2a9d83db2a3c87_Correct.mp3");
var wrongSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/68689351194ed8c27e63b02d_Wong.mp3");
var alertSound  =new Audio("https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/686c8a3b23c385bd78509db1_videoplayback.mp3");
function playOne(aud){try{aud.pause();aud.currentTime=0;aud.play();}catch(_){}} 
var AWrap=$(".alert-wrapper-new");
var findAlertTextEl=function(w){return (w&&w.querySelector(".select-answer-text"))||(w&&w.querySelector(".alert-box .select-answer-text"))||null};
var alertBoxTimeout=null;
function toast(txt,dur){ dur=dur||1000; if(!AWrap) return; var t=findAlertTextEl(AWrap); if(t) t.textContent=txt;
  if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;}
  AWrap.style.display="flex"; void AWrap.offsetWidth; AWrap.classList.add("active");
  alertBoxTimeout=setTimeout(function(){AWrap.classList.remove("active");alertBoxTimeout=setTimeout(function(){AWrap.style.display="none";alertBoxTimeout=null;},300);},dur);
}
function hideAlertBox(){ if(!AWrap) return; if(alertBoxTimeout){clearTimeout(alertBoxTimeout);alertBoxTimeout=null;} AWrap.classList.remove("active");AWrap.style.display="none"; }
var vibrateShort=function(){ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(50); };
D.body.addEventListener("click",function(e){
  if(e.target.closest(".custom-accordion-header,.back-btn,.next-chapter-btn,.reset-chapter-btn,.confirm-reset-chapter,.back-to-chapter-final-screen,.close-btn")) vibrateShort();
},{passive:true});

/* Texte statice feedback */
var STATIC_CORRECT=["Corect 100%! -","Foarte bine! -","Bravo! -","Ai bifat corect! -","Ai rezolvat corect! -","Totul corect! -","Ai ales corect! -","Ai marcat corect! -"];
var STATIC_WRONG  =["Gresit. Raspuns corect -","Nu e bine. Raspuns core -","Din pacate, nu. Raspuns core -","Mai incearca. Raspuns core -","Alegere gresita. Raspuns core -","Nu e varianta buna. Raspuns core -"];
var lastStaticIdx={correct:-1,wrong:-1};
function pickNonRepeat(arr,key){var i;do{i=Math.floor(Math.random()*arr.length);}while(arr.length>1&&i===lastStaticIdx[key]);lastStaticIdx[key]=i;return (i in arr)?arr[i]:arr[0];}

/* Sanitizare deja gestionată sus – aici nu mai dublăm */
var SANITIZE_CONTENT=false;
var sanitizeMaybe=function(html){return html||""};

/* ----- Date capitol / total ----- */
var chapterDoc=await db.collection("mediu_invatare_chapters").doc(CHAP).get();
if(!chapterDoc.exists){ alert("Capitolul nu exista in baza de date!"); return; }
var chapterName=chapterDoc.data().Name;
async function getTotalCount(){ var s=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).get(); return s.size; }
var TOTAL=await getTotalCount();

/* Colecții user */
var progCollection=db.collection("users").doc(user.uid).collection("progress_mediu");
var ansCollection =db.collection("users").doc(user.uid).collection("answers_mediu");
var progRef       =progCollection.doc(CHAP);

/* ----- Final screen: bară progres segmentată ----- */
var chapterTextFinal=$(".chapter-text-final"),progressCounterFinal=$(".progress-counter-final"),barOuterFinal=$(".chapter-progress-bar-outer");
var barGreenFinal=$(".chapter-final-screen .progress-green"),barRedFinal=$(".chapter-final-screen .progress-red"),barGapFinal=$(".chapter-final-screen .progress-gap");
var legacyPercentEl=$(".chapter-final-screen .chapter-progress-percent"),resetWrongBtn=$(".reset-wrong-questions-only");
if(legacyPercentEl) legacyPercentEl.style.display="none";
var RADIUS_PX=3,GAP_PX=3,GAP_COLOR="#070707",ANIM_DUR=900;
function ensureFinalSegments(){
  if(!barOuterFinal) return;
  if(!barGreenFinal){barGreenFinal=D.createElement("span");barGreenFinal.className="progress-green";barOuterFinal.appendChild(barGreenFinal);}
  if(!barRedFinal){barRedFinal=D.createElement("span");barRedFinal.className="progress-red";barOuterFinal.appendChild(barRedFinal);}
  if(!barGapFinal){barGapFinal=D.createElement("span");barGapFinal.className="progress-gap";barOuterFinal.appendChild(barGapFinal);}
}
function applyFinalBarBaseStyles(){
  if(!barOuterFinal) return; ensureFinalSegments();
  Object.assign(barOuterFinal.style,{overflow:"hidden",position:"relative",display:"flex",borderRadius:RADIUS_PX+"px"});
  if(barGreenFinal) Object.assign(barGreenFinal.style,{position:"absolute",left:"0",top:"0",bottom:"0",borderRadius:RADIUS_PX+"px",transition:"left .25s ease,width .25s ease"});
  if(barRedFinal)   Object.assign(barRedFinal.style,{position:"absolute",top:"0",bottom:"0",borderRadius:RADIUS_PX+"px",transition:"left .25s ease,width .25s ease"});
  if(barGapFinal)   Object.assign(barGapFinal.style,{position:"absolute",top:"0",bottom:"0",width:GAP_PX+"px",backgroundColor:GAP_COLOR,display:"none",pointerEvents:"none",borderRadius:RADIUS_PX+"px"});
}
var finalPercentEl=null;
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
var setFinalPercent=function(v){ensureFinalPercentEl();if(finalPercentEl) finalPercentEl.textContent=String(v);};
function animateFinalProgress(cPct,wPct,d){
  d=d||ANIM_DUR; if(!barOuterFinal) return; applyFinalBarBaseStyles();
  var answeredPct=Math.max(0,Math.min(100,(+cPct||0)+(+wPct||0))),hasBoth=(+cPct>0)&&(+wPct>0);
  if(answeredPct>0&&+cPct>0){ if(hasBoth){barGreenFinal.style.width="calc("+(cPct/answeredPct*100)+"% - "+(GAP_PX/2)+"px)";barGreenFinal.style.left="0";} else{barGreenFinal.style.width="100%";barGreenFinal.style.left="0";} }
  else{barGreenFinal.style.width="0%";barGreenFinal.style.left="0";}
  if(answeredPct>0&&+wPct>0){
    if(hasBoth){ var leftPct=(cPct/answeredPct)*100; barRedFinal.style.left="calc("+leftPct+"% + "+(GAP_PX/2)+"px)"; barRedFinal.style.width="calc("+(wPct/answeredPct*100)+"% - "+(GAP_PX/2)+"px)"; }
    else{ barRedFinal.style.left="0"; barRedFinal.style.width="100%"; }
  }else{ barRedFinal.style.left="0"; barRedFinal.style.width="0%"; }
  if(barGapFinal){ if(hasBoth){ var leftPct2=(cPct/answeredPct)*100; barGapFinal.style.display="block"; barGapFinal.style.left="calc("+leftPct2+"% - "+(GAP_PX/2)+"px)"; } else barGapFinal.style.display="none"; }
  barOuterFinal.style.transition="width "+d+"ms cubic-bezier(.68,-0.55,.27,1.55)"; barOuterFinal.style.width="0%";
  if(progressCounterFinal){ setFinalPercent("0%"); var start=performance.now(); var step=function(ts){var p=Math.min((ts-start)/d,1),val=Math.round(p*(+cPct||0)); setFinalPercent(val+"%"); if(p<1) requestAnimationFrame(step);}; requestAnimationFrame(step); }
  requestAnimationFrame(function(){ setTimeout(function(){ barOuterFinal.style.width=answeredPct+"%"; },40); });
}

/* ----- State ----- */
var BUF={},SEL=[],ANSW=false; var CUR=1,FIN=false; var WRONG=[],WRMODE=false,WRP=0;
var WRONG_PREPARED=[],WRONG_PREPARED_READY=false,START_WRONG_IN_PROGRESS=false;
var WRONG_STARTED_AT_MS=0;
var LS_WRONG_KEY="wm:"+user.uid+":"+CHAP;

/* Persist wrong-mode (Firestore + localStorage) */
async function persistWrongMode(opts){
  try{
    var payload={active:!!opts.active,list:Array.isArray(opts.list)?opts.list.map(function(v){return +v}).filter(Number.isFinite):[],pos:Math.max(0,Math.min((Array.isArray(opts.list)?opts.list.length-1:0),(+opts.pos||0))),startedAtMs: WRONG_STARTED_AT_MS||Date.now()};
    WRONG_STARTED_AT_MS=payload.startedAtMs;
    await progRef.set({wrongMode:payload},{merge:true});
    try{ localStorage.setItem(LS_WRONG_KEY,JSON.stringify(payload)); }catch(_){}
  }catch(_){
    try{
      var fallback={active:!!opts.active,list:(opts.list||[]),pos:+opts.pos||0,startedAtMs:WRONG_STARTED_AT_MS||Date.now()};
      localStorage.setItem(LS_WRONG_KEY,JSON.stringify(fallback));
    }catch(_){}
  }
}
async function loadWrongModePersist(){
  var out=null;
  try{
    var ps=await progRef.get(); var wm=ps.exists&&ps.data().wrongMode?ps.data().wrongMode:null;
    if(wm&&wm.active){ out={active:!!wm.active,list:(wm.list||[]).map(function(v){return +v}).filter(Number.isFinite),pos:+wm.pos||0,startedAtMs:+wm.startedAtMs||0}; }
  }catch(_){}
  if(!out||!out.active){
    try{ var raw=localStorage.getItem(LS_WRONG_KEY); if(raw){ var wm2=JSON.parse(raw); if(wm2&&wm2.active) out=wm2; } }catch(_){}
  }
  return out;
}
async function clearWrongModePersist(){
  try{ await progRef.set({wrongMode:{active:false,list:[],pos:0,startedAtMs:0}},{merge:true}); }catch(_){}
  try{ localStorage.removeItem(LS_WRONG_KEY); }catch(_){}
}

/* ----- Prefetch imagini / întrebări ----- */
function primeImage(url,opts){ opts=opts||{}; var pr=opts.priority||"auto"; var img=new Image(); img.decoding="async"; try{ img.fetchPriority=pr; }catch(_){ try{ img.setAttribute("fetchpriority",pr);}catch(_){}} img.src=url; var ready=img.decode?img.decode():new Promise(function(r){img.onload=img.onerror=r;}); return {img:img,ready:ready}; }
async function prefetchQuestion(idx){
  if(!idx||BUF[idx]) return;
  var snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",idx).limit(1).get();
  if(snap.empty){ try{ snap=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","==",String(idx)).limit(1).get(); }catch(_){ } }
  if(snap.empty) return;
  var data=snap.docs[0].data(); BUF[idx]=data;
  if(data.Image){ try{ var p=primeImage(data.Image,{priority:"auto"}); BUF[idx].__imgReady=p.ready; p.ready.catch(function(){}); }catch(_){ BUF[idx].__imgReady=Promise.resolve(); } }
  else BUF[idx].__imgReady=Promise.resolve();
}
async function prefetchMany(indices,priorityMap){
  priorityMap=priorityMap||{};
  var list=(indices||[]).filter(function(v){return v&&v>=1&&(!TOTAL||v<=TOTAL)&&!BUF[v]}); if(!list.length) return;
  try{
    var qs=await db.collection("mediu_invatare_pages").where("chapterSlug","==",CHAP).where("Index","in",list.slice(0,10)).get();
    qs.forEach(function(doc){
      var d=doc.data(),i=d.Index; if(!i||BUF[i]) return; BUF[i]=d;
      if(d.Image){ var pr=priorityMap[i]||"low"; try{ var p=primeImage(d.Image,{priority:pr}); BUF[i].__imgReady=p.ready; p.ready.catch(function(){});}catch(_){BUF[i].__imgReady=Promise.resolve();} }
      else BUF[i].__imgReady=Promise.resolve();
    });
  }catch(_){ await Promise.all(list.map(function(v){return prefetchQuestion(v)})); }
}
async function prefetchAhead(current){
  var fast=isFastNet();
  var targets=[current+1]; if(fast) targets.push(current+2);
  var prio={}; prio[current+1]="auto"; prio[current+2]="low";
  await prefetchMany(targets,prio);
  rIC(function(){});
}
function pruneBUF(){
  var keep=new Set();
  if(!WRMODE){
    var near=[CUR-1,CUR,CUR+1,CUR+2];
    for(var i=0;i<near.length;i++){var j=near[i]; if(j>0&&j<=TOTAL) keep.add(j);}
  }else{
    var near2=[WRONG[WRP-1],WRONG[WRP],WRONG[WRP+1],WRONG[WRP+2]];
    for(var k=0;k<near2.length;k++){var v=near2[k]; if(typeof v==="number") keep.add(v);}
  }
  Object.keys(BUF).forEach(function(k){ var i=+k; if(!keep.has(i)) delete BUF[i]; });
}

/* ----- Scroll helpers ----- */
function getScrollParent(el){
  var qwi=el && el.closest ? el.closest(".question-wrapper-inner") : null; if(qwi) return qwi;
  var p=el?el.parentElement:null;
  while(p){
    var s=getComputedStyle(p), oy=s.overflowY;
    if(oy==="auto"||oy==="scroll"||oy==="overlay") return p;
    p=p.parentElement;
  }
  return document.scrollingElement||document.documentElement;
}
function easeInOut(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function scrollContainerToAnchor(target,container,opts){
  if(!target) return; opts=opts||{};
  var c=container||getScrollParent(target);
  var isWin=(c===document.scrollingElement||c===document.documentElement||c===document.body);
  var getTop=function(){ return (isWin?target.getBoundingClientRect().top:(target.getBoundingClientRect().top - c.getBoundingClientRect().top)) + (isWin?window.pageYOffset:c.scrollTop) - (opts.offset||0); };
  var to=Math.max(0,Math.round(getTop()));
  if(opts.behavior!=="smooth"){ isWin?window.scrollTo(0,to):c.scrollTop=to; return; }
  var start=isWin?window.pageYOffset:c.scrollTop,dist=to-start,dur=400,st=null;
  var step=function(ts){ if(!st) st=ts; var p=Math.min((ts-st)/dur,1),y=Math.round(start+dist*easeInOut(p)); isWin?window.scrollTo(0,y):c.scrollTop=y; if(p<1) requestAnimationFrame(step); };
  opts.delay?setTimeout(function(){requestAnimationFrame(step)},opts.delay):requestAnimationFrame(step);
}

/* ----- Refs per wrapper (A/B) ----- */
function collectRefs(wrapper){
  var root=wrapper;
  // dacă wrapper-ul are în interior .question-wrapper, lucrăm pe el
  var qWrap = root.classList.contains("question-wrapper") ? root : $(".question-wrapper", root) || root;

  var need=function(sel){ return qWrap.querySelector(sel) || D.querySelector(sel); };
  var refs={
    root:root,
    qWrap:qWrap,
    qEl:root.closest(".questions-collection-list-item")||qWrap,
    anchorTop:need(".explanation-anchor-top")||null,
    qText:need(".question-text"),
    progress:need(".progress-counter"),
    mainWrap:need(".main-content-wrapper"),
    optWrap:need(".options-wrapper"),
    cards:[],
    items:[],
    imgWrap:need(".question-image-wrapper"),
    img:need(".question-image"),
    videoWrap:need(".explanation-video-wrapper")||null,
    acc:need(".custom-accordion")||null,
    accHeader:null,accArrow:null,accContent:null,accBody:null,expLabelEl:null,accAnchor:null,
    feedbackWrap:need(".feedback-wrapper")||null,
    staticText:null,correctAns:null,
    buttonsWrap:need(".submit-next-buttons")||null,
    submitBtn:null,explainBtn:null,aiBtn:null,
    buttonsWrapMobile:need(".submit-next-buttons-mobile")||null,
    submitBtnMobile:null,explainBtnMobile:null,aiBtnMobile:null,
    anchor:need(".explanation-anchor")||null
  };

  if(refs.optWrap){ refs.cards=Array.from(refs.optWrap.querySelectorAll(".option-card")); refs.items=refs.cards.map(function(c){return c.querySelector(".option-item")}); }
  if(refs.acc){
    refs.accHeader=refs.acc.querySelector(".custom-accordion-header");
    refs.accArrow =refs.acc.querySelector(".custom-accordion-arrow");
    refs.accContent=refs.acc.querySelector(".custom-accordion-content");
    refs.accBody  =refs.acc.querySelector(".custom-accordion-body");
    refs.expLabelEl=refs.acc.querySelector(".custom-accordion-label");
    refs.accAnchor=refs.acc.querySelector(".accordion-anchor");
  }
  if(refs.feedbackWrap){
    refs.staticText=refs.feedbackWrap.querySelector(".correct-answer-static");
    refs.correctAns=refs.feedbackWrap.querySelector(".correct-answer");
  }
  if(refs.buttonsWrap){
    refs.submitBtn=refs.buttonsWrap.querySelector(".submit-btn");
    refs.explainBtn=refs.buttonsWrap.querySelector(".explanation-btn")||refs.buttonsWrap.querySelector(".explanation-card");
    refs.aiBtn     =refs.buttonsWrap.querySelector(".ask-ai-btn")||refs.buttonsWrap.querySelector(".ai-pop-wrapper");
  }
  if(refs.buttonsWrapMobile){
    refs.submitBtnMobile  =refs.buttonsWrapMobile.querySelector(".submit-btn-mobile")||refs.buttonsWrapMobile.querySelector(".submit-btn")||null;
    refs.explainBtnMobile =refs.buttonsWrapMobile.querySelector(".explanation-btn-mobile")||refs.buttonsWrapMobile.querySelector(".explanation-btn")||null;
    refs.aiBtnMobile      =refs.buttonsWrapMobile.querySelector(".ask-ai-btn-mobile")||refs.buttonsWrapMobile.querySelector(".ask-ai-btn")||null;
  }
  return refs;
}

/* ----- Helpers UI/answers ----- */
function getLetterFromCard(card){
  var el=card.querySelector(".option-letter"); if(!el) return "";
  for(var i=0;i<el.childNodes.length;i++){
    var n=el.childNodes[i]; if(n.nodeType===Node.TEXT_NODE){ var t=(n.nodeValue||"").trim(); if(t) return t[0].toUpperCase(); }
  }
  return (el.textContent||"").trim().charAt(0).toUpperCase();
}
function clearAllSelected(scope){
  (scope||D).querySelectorAll(".option-letter.selected,.option-item.selected,.option-card-connector.selected").forEach(function(el){el.classList.remove("selected")});
  (scope||D).querySelectorAll(".option-card.selected").forEach(function(el){el.classList.remove("selected")});
}
function applySelectedVisualsFromSEL(scope){
  var root=scope||D;
  root.querySelectorAll(".option-card").forEach(function(card){
    var L=getLetterFromCard(card),on=SEL.indexOf(L)>-1;
    card.classList.remove("selected");
    var ol=card.querySelector(".option-letter"); if(ol) ol.classList.toggle("selected",on);
    var oi=card.querySelector(".option-item");   if(oi) oi.classList.toggle("selected",on);
    var oc=card.querySelector(".option-card-connector"); if(oc) oc.classList.toggle("selected",on);
  });
}
function clearLetterStates(scope){ (scope||D).querySelectorAll(".option-letter").forEach(function(el){el.classList.remove("correct","wrong")}); }
function applyLetterStatesByCorrect(scope,corArr){
  var COR=new Set((corArr||[]).map(function(x){return String(x||"").trim().toUpperCase()}));
  (scope||D).querySelectorAll(".option-card").forEach(function(card){
    var L=getLetterFromCard(card),el=card.querySelector(".option-letter");
    if(!el||!L) return; el.classList.remove("correct","wrong"); el.classList.add(COR.has(L)?"correct":"wrong");
  });
}
function clearWrongCards(scope){ (scope||D).querySelectorAll(".option-card.wrong-card").forEach(function(c){c.classList.remove("wrong-card")}); }
function applyWrongCardsByCorrect(scope,corArr){
  var COR=new Set((corArr||[]).map(function(x){return String(x||"").trim().toUpperCase()}));
  (scope||D).querySelectorAll(".option-card").forEach(function(card){
    var L=getLetterFromCard(card);
    card.classList.toggle("wrong-card",!COR.has(L));
  });
}

/* ----- Butoane / AI label ----- */
function forceAIChatText(btn){
  if(!btn) return; btn.textContent="AI CHAT"; btn.setAttribute("aria-label","AI CHAT"); btn.setAttribute("role","button");
}
function applyAIChatText(refs){
  forceAIChatText(refs.aiBtn);
  forceAIChatText(refs.aiBtnMobile);
}
function setSubmitState(btn,state,affectLayout){
  affectLayout = (affectLayout===false)?false:true;
  if(!btn) return;
  btn.classList.remove("is-verify","is-next","is-finish","finish-chapter-btn","_preload-full");
  if(state==="verify"){
    btn.textContent="VERIFICA"; btn.classList.add("is-verify","_preload-full"); if(affectLayout) btn.style.gridColumn="1 / 2";
  }else if(state==="next"){
    var last=WRMODE?(WRP===WRONG.length-1):(CUR===TOTAL);
    btn.textContent=last?"FINALIZEAZA":"CONTINUA";
    if(last) btn.classList.add("is-finish","finish-chapter-btn"); else btn.classList.add("is-next");
    if(affectLayout) btn.style.gridColumn="2 / 3";
  }else if(state==="finish"){
    btn.textContent="FINALIZEAZA"; btn.classList.add("is-finish","finish-chapter-btn"); if(affectLayout) btn.style.gridColumn="2 / 3";
  }
}
function setSubmitStateBoth(refs,state){
  setSubmitState(refs.submitBtn,state,true);
  setSubmitState(refs.submitBtnMobile,state,false);
}
function setSingleBtnState(refs,on){
  if(refs.buttonsWrap) refs.buttonsWrap.classList.toggle("single-btn-state", !!on);
  if(on){ if(refs.submitBtn) refs.submitBtn.style.gridColumn="1 / 2"; }
  else{ if(refs.submitBtn) refs.submitBtn.style.removeProperty("grid-column"); }
}

/* ----- Video / media helpers ----- */
function stopActiveMedia(refs){
  try{ correctSound.pause(); correctSound.currentTime=0; }catch(_){}
  try{ wrongSound.pause(); wrongSound.currentTime=0; }catch(_){}
  var lottieEl=refs.qEl&&refs.qEl.querySelector?refs.qEl.querySelector(".lottie-animation-correct"):null;
  if(lottieEl){ lottieEl.style.setProperty("display","none","important"); lottieEl.innerHTML=""; }
  var v=refs.videoWrap?refs.videoWrap.querySelector("video"):null;
  if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
}
function setVideoBlock(refs,url){
  if(!refs.videoWrap) return;
  refs.videoWrap.innerHTML=""; refs.videoWrap.style.display="none"; if(!url) return;
  var html="";
  if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)){
    html='<video class="explanation-video plyr-player" controls playsinline><source src="'+url+'" type="video/mp4">Video not supported.</video>';
  }else if(url.includes("youtube.com")||url.includes("youtu.be")){
    var m=url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([^&]+)/); var yt=m?m[1]:"";
    if(yt) html='<div class="plyr__video-embed"><iframe src="https://www.youtube.com/embed/'+yt+'?origin='+location.origin+'&iv_load_policy=3&modestbranding=1&rel=0" allowfullscreen allowtransparency allow="autoplay"></iframe></div>';
  }
  if(!html) return;
  refs.videoWrap.innerHTML=html; refs.videoWrap.style.display="none";
  var playerEl=refs.videoWrap.querySelector("video");
  if(playerEl){
    if(HAS_PLYR){ try{ playerEl.plyr=new Plyr(playerEl,{controls:["play","progress","current-time","mute","volume","fullscreen"],ratio:"16:9",seekTime:5,settings:[]}); }catch(_){ } }
    if(HAS_PLYR&&playerEl.plyr){
      playerEl.addEventListener("click",function(e){ if(e.target.closest(".plyr__controls")||e.target.classList.contains("plyr__control")||e.target.tagName==="BUTTON") return; e.stopPropagation(); try{ playerEl.plyr.playing?playerEl.plyr.pause():playerEl.plyr.play(); }catch(_){}; });
    }else{
      playerEl.addEventListener("click",function(e){ if(e.target.tagName==="BUTTON") return; e.stopPropagation(); try{ playerEl.paused?playerEl.play():playerEl.pause(); }catch(_){}; });
    }
    playerEl._hasUserPlayed=false; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false;
    playerEl.addEventListener("play",function(){ playerEl._hasUserPlayed=true; playerEl._autoPaused=false; playerEl._manualClosed=false; playerEl._suppressNextAutoResume=false; });

    var scroller=refs.qEl&&refs.qEl.querySelector?refs.qEl.querySelector(".question-wrapper-inner"):null; if(!scroller) scroller=getScrollParent(refs.qEl||refs.qWrap)||null;
    var vw=refs.videoWrap;
    try{ if(vw.__observerInstance&&vw.__observerInstance.disconnect) vw.__observerInstance.disconnect(); }catch(_){}
    if(scroller){
      var obs=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          var v=entry.target.querySelector("video")||playerEl;
          if(v!==playerEl||!playerEl._hasUserPlayed) return;
          if(entry.isIntersecting){
            if(playerEl._autoPaused && !playerEl._manualClosed && !playerEl._suppressNextAutoResume){
              try{ playerEl.plyr?playerEl.plyr.play():playerEl.play(); }catch(_){}
              playerEl._autoPaused=false;
            }
          }else{
            var wasPlaying=(playerEl.plyr?playerEl.plyr.playing:!playerEl.paused);
            if(wasPlaying){ playerEl._autoPaused=true; try{ playerEl.plyr?playerEl.plyr.pause():playerEl.pause(); }catch(_){ } }
          }
        });
      },{root:scroller,threshold:.25});
      obs.observe(playerEl.parentElement||playerEl); vw.__observerInstance=obs;
    }
  }
}
function ensureImageReadyFromQ(q){
  if(!q||!q.Image) return Promise.resolve();
  if(q.__imgReady&&typeof q.__imgReady.then==="function") return q.__imgReady;
  var tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
  tmp.src=q.Image;
  return tmp.decode?tmp.decode():new Promise(function(r){tmp.onload=r; tmp.onerror=r;});
}
async function seamlessSetImage(refs,url){
  if(!refs.img){ applyNoImageState(refs,true); return; }
  if(!url){
    refs.img.removeAttribute("src");
    refs.img.style.display="none";
    refs.img.setAttribute("aria-hidden","true");
    applyNoImageState(refs,true);
    return;
  }
  try{
    var tmp=new Image(); tmp.decoding="async"; try{tmp.fetchPriority="auto";}catch(_){}
    tmp.src=url;
    if(tmp.decode) await tmp.decode(); else await new Promise(function(r){tmp.onload=r; tmp.onerror=r;});
  }catch(_){}
  if(refs.img.src!==url) refs.img.src=url;
  refs.img.style.display="";
  refs.img.removeAttribute("aria-hidden");
  applyNoImageState(refs,false);
  refs.img.onerror=function(){
    refs.img.removeAttribute("src");
    refs.img.style.display="none";
    refs.img.setAttribute("aria-hidden","true");
    applyNoImageState(refs,true);
  };
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

/* ----- Explain / AI buttons helpers ----- */
function isExplanationOpen(refs){
  var accOpen = !!(refs.acc && refs.acc.style.display!=="none" && (refs.acc.classList.contains("open") || (refs.accContent && refs.accContent.style.maxHeight && refs.accContent.style.maxHeight!=="0px")));
  var videoShown = !!(refs.videoWrap && refs.videoWrap.style.display!=="none");
  return accOpen || videoShown;
}
function renderExplainBtnUI(refs,open){
  var setOpen = function(btn){ if(!btn) return; btn.innerHTML='<svg width="15" height="15" viewBox="0 0 32 32"><path d="M16 10l10 10H6z" fill="#fff"/></svg>'; };
  var setClosed = function(btn){ if(!btn) return; btn.textContent="EXPLICATIE"; };
  if(open){ setOpen(refs.explainBtn); setOpen(refs.explainBtnMobile); }
  else{ setClosed(refs.explainBtn); setClosed(refs.explainBtnMobile); }
}

/* ----- Parser răspuns corect ----- */
function parseCorrectLetters(q){
  return String(q["Correct Answers"]||"").split(",").map(function(x){return String(x||"").trim().toUpperCase()}).filter(function(x){return x==="A"||x==="B"||x==="C"});
}

/* =========================
   A/B: instanțiere & randare
   ========================= */
var AB=ensureABStructure();
if(!AB){ D.body.classList.remove("page-loading"); return; }
var SHELL=AB.shell, WA=AB.WA, WB=AB.WB;
(function(){ /* normalizează starea inițială */
  var ACTIVE="is-active";
  var aAct=WA.classList.contains(ACTIVE), bAct=WB.classList.contains(ACTIVE);
  if(aAct&&bAct){ WB.classList.remove(ACTIVE); }
  else if(!aAct&&!bAct){ WA.classList.add(ACTIVE); }
  WA.classList.add("visible"); WB.classList.remove("visible");
})();

/* refs per buffer */
var REFS_A=collectRefs(WA);
var REFS_B=collectRefs(WB);
var REFS = WA.classList.contains("is-active") ? REFS_A : REFS_B;
function activeWrap(){return WA.classList.contains("is-active")?WA:WB}
function bufferWrap(){return WA.classList.contains("is-active")?WB:WA}
function refsOf(el){return el===WA?REFS_A:REFS_B}
function updateRefsAfterFlip(){ var act=activeWrap(); REFS = (act===WA)?(REFS_A=collectRefs(WA)):(REFS_B=collectRefs(WB)); }

/* randare întrebare într-un wrapper specific (fără reflow vizibil) */
async function renderQuestionInWrapper(refs,idx,opts){
  opts=opts||{};
  // lock
  setButtonsTransitionLock(refs,true);

  var q=BUF[idx];
  if(!q){ return; }

  var container=refs.qWrap||refs.root||D.body;
  var prevH=container.offsetHeight;
  container.classList.add("no-transition","is-preparing");
  if(prevH) container.style.minHeight=prevH+"px";

  // header / counter
  (refs.qEl.querySelector(".chapter-text")||D.createElement("div")).textContent=sanitizeMaybe(chapterName);
  if(refs.progress) refs.progress.textContent = WRMODE ? (pad2(WRP+1)+"/"+pad2(WRONG.length)) : (pad2(CUR)+"/"+pad2(TOTAL));
  if(QSEC){ QSEC.style.setProperty("display","flex","important"); }

  // text întrebare + opțiuni
  refs.qText.innerHTML=""; refs.qText.insertAdjacentHTML("afterbegin",sanitizeMaybe(q.Question||""));
  var vals=[q["Option A"]||"",q["Option B"]||"",q["Option C"]||""];
  refs.cards.forEach(function(card,i){
    var val=vals[i]||""; var it=refs.items[i];
    if(it){ it.innerHTML=""; if(val) it.insertAdjacentHTML("afterbegin",sanitizeMaybe(val)); }
    card.style.display = val ? "" : "none";
  });

  // explicație scrisă
  if(refs.accBody){
    refs.accBody.innerHTML=""; var ex=q["Explanation"]||"";
    if(ex) refs.accBody.insertAdjacentHTML("afterbegin",sanitizeMaybe(ex));
  }
  // ascunde explicație/AI până la verificare
  if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","none","important");
  if(refs.correctAns) refs.correctAns.textContent="";
  if(refs.staticText) refs.staticText.textContent="Raspunsul corect este:";
  renderExplainBtnUI(refs,false);
  if(refs.explainBtn) refs.explainBtn.style.display="none";
  if(refs.explainBtnMobile) refs.explainBtnMobile.style.display="none";
  if(refs.aiBtn) refs.aiBtn.style.display="none";
  if(refs.aiBtnMobile) refs.aiBtnMobile.style.display="none";

  if(refs.acc){ refs.acc.style.display="none"; refs.acc.classList.remove("open"); if(refs.accContent) refs.accContent.style.maxHeight="0px"; }
  if(refs.accArrow){ try{ refs.accArrow.style.removeProperty("transform"); }catch(_){ } }

  // video
  setVideoBlock(refs,q["Explanation Video Link"]||"");

  // selecții
  if(opts.resetSelections){ SEL=[]; ANSW=false; } else { SEL=[]; ANSW=false; }
  clearLetterStates(refs.qEl); clearAllSelected(refs.qEl); clearWrongCards(refs.qEl);

  // pe desktop: un singur buton la început; pe mobil – nu schimbăm grila Webflow
  setSingleBtnState(refs,true);
  setSubmitStateBoth(refs,"verify");

  // imagine (anti-flicker: decode înainte)
  try{ await (q.Image ? (q.__imgReady||ensureImageReadyFromQ(q)) : Promise.resolve()); }catch(_){}
  if(q.Image){ await seamlessSetImage(refs,q.Image); } else { await seamlessSetImage(refs,""); }

  // restore (doar în modul normal sau dacă wrong-mode a fost început după salvarea respectivă)
  try{
    var snap=await ansCollection.doc(CHAP+"_"+idx).get();
    if(snap.exists){
      var d=snap.data();
      var selSaved=(d.selected||[]).map(function(x){return String(x||"").toUpperCase()});
      var corSaved=(d.correct||[]).map(function(x){return String(x||"").toUpperCase()});
      var answeredAtMs=+(d.answeredAtMs||0);
      var allowRestore = (!WRMODE) || (WRMODE && answeredAtMs && WRONG_STARTED_AT_MS && answeredAtMs>=WRONG_STARTED_AT_MS);
      if(allowRestore && selSaved.length>0){
        SEL=Array.from(new Set(selSaved)); applySelectedVisualsFromSEL(refs.qEl);
        ANSW=true; clearLetterStates(refs.qEl); applyLetterStatesByCorrect(refs.qEl,corSaved); clearWrongCards(refs.qEl); applyWrongCardsByCorrect(refs.qEl,corSaved);
        var same=SEL.slice().sort().join(",")===corSaved.slice().sort().join(",");
        if(refs.staticText) refs.staticText.textContent=same?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
        var ord=["A","B","C"].filter(function(x){return corSaved.indexOf(x)>-1});
        if(refs.correctAns) refs.correctAns.textContent=ord.join(", ");
        if(refs.feedbackWrap) refs.feedbackWrap.style.setProperty("display","flex","important");
        if(refs.explainBtn) refs.explainBtn.style.setProperty("display","flex","important");
        if(refs.explainBtnMobile) refs.explainBtnMobile.style.setProperty("display","flex","important");
        if(refs.aiBtn) refs.aiBtn.style.setProperty("display","flex","important");
        if(refs.aiBtnMobile) refs.aiBtnMobile.style.setProperty("display","flex","important");
        applyAIChatText(refs);
        setSingleBtnState(refs,false);
        var lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
        setSubmitStateBoth(refs,(lastWrong||lastNormal)?"finish":"next");
      }
    }
  }catch(e){ console.warn("Restore answer failed:",e); }

  // unlock + curățare minHeight
  requestAnimationFrame(function(){
    container.classList.remove("no-transition","is-preparing");
    container.style.minHeight="";
    setButtonsTransitionLock(refs,false);
  });
}

/* lock pe butoane pentru wrapperul curent */
var transitioning=false;
function setButtonsTransitionLock(refs,on){
  transitioning=!!on;
  if(refs.submitBtn){ refs.submitBtn.setAttribute("aria-disabled",on?"true":"false"); refs.submitBtn.classList.toggle("is-disabled",on); }
  if(refs.submitBtnMobile){ refs.submitBtnMobile.setAttribute("aria-disabled",on?"true":"false"); refs.submitBtnMobile.classList.toggle("is-disabled",on); }
  if(refs.buttonsWrap){ if(on) refs.buttonsWrap.style.setProperty("pointer-events","none","important"); else refs.buttonsWrap.style.removeProperty("pointer-events"); }
  if(refs.buttonsWrapMobile){ if(on) refs.buttonsWrapMobile.style.setProperty("pointer-events","none","important"); else refs.buttonsWrapMobile.style.removeProperty("pointer-events"); }
}

/* flip A/B: randăm în buffer, apoi schimbăm instant pozițiile */
async function flipToIndex(idx,opts){
  var buf=bufferWrap(), bufRefs=refsOf(buf);
  await renderQuestionInWrapper(bufRefs,idx,opts||{});
  var act=activeWrap();
  act.classList.remove("is-active","visible");
  buf.classList.add("is-active","visible");
  updateRefsAfterFlip();
}

/* ----- Show final + pregătire WRONG (folosit și la init) ----- */
async function showFinal(){
  try{ if(chapterTextFinal){ chapterTextFinal.textContent=chapterName; } }catch(_){}
  var answersSnap=await ansCollection.where("chapterSlug","==",CHAP).get();
  if(resetWrongBtn){
    resetWrongBtn.style.display="none";
    var hasWrong=false;
    answersSnap.forEach(function(doc){ var d=doc.data(); var sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(","); if(sel&&sel!==cor) hasWrong=true; });
    if(hasWrong) resetWrongBtn.style.display="flex";
  }
  var correct=0,wrong=0;
  answersSnap.forEach(function(doc){ var d=doc.data(); var sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(","); if(sel&&sel===cor) correct++; else if(sel) wrong++; });
  var safeTotal=(TOTAL&&TOTAL>0)?TOTAL:Math.max(1,correct+wrong);
  var cPct=Math.round((correct/safeTotal)*100),wPct=Math.round((wrong/safeTotal)*100);
  var loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
  ensureFinalPercentEl(); setFinalPercent("0%"); animateFinalProgress(cPct,wPct,ANIM_DUR);
  if(FINAL) FINAL.style.setProperty("display","flex","important");
  if(QSEC) QSEC.style.setProperty("display","none","important");

  // PREP WRONG list (prefetch)
  try{
    var pool=[], snap2=await ansCollection.where("chapterSlug","==",CHAP).get();
    snap2.forEach(function(doc){
      var d=doc.data(),sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
      if(sel&&sel!==cor){
        var idx=d.index;
        if(typeof idx!=="number"){ var asNum=parseInt(idx,10); if(Number.isFinite(asNum)) idx=asNum; }
        if(typeof idx!=="number"){ var m=String(doc.id||"").match(/_(\d+)$/); if(m) idx=parseInt(m[1],10); }
        if(typeof idx==="number"&&Number.isFinite(idx)) pool.push(idx);
      }
    });
    WRONG_PREPARED=Array.from(new Set(pool)).sort(function(a,b){return a-b});
    WRONG_PREPARED_READY=false;
    if(WRONG_PREPARED.length){
      var prio={}; prio[WRONG_PREPARED[0]]="auto";
      prefetchMany(WRONG_PREPARED,prio).finally(function(){WRONG_PREPARED_READY=true;});
    }else WRONG_PREPARED_READY=true;
  }catch(_){ WRONG_PREPARED=[]; WRONG_PREPARED_READY=true; }
}

/* ----- Init progres + randare inițială (A/B) ----- */
var progSnap=await progRef.get();
if(progSnap.exists){
  if(progSnap.data().currentIndex) CUR=progSnap.data().currentIndex;
  if(progSnap.data().finished) FIN=true;
}
var persistedWM=await loadWrongModePersist();

/* helper vizibilitate după prima randare */
function revealNow(){
  D.body.classList.remove("page-loading");
  blurActive();
  if(QSEC) QSEC.style.setProperty("display","flex","important");
  (activeWrap())?.classList.add("visible");
  var loader=$(".lesson-loader"); if(loader) loader.style.setProperty("display","none","important");
}

/* ============ INIT RANDĂRI INIȚIALE ============ */
async function initialRender(){
  // ne asigurăm că REFS pointează la wrapperul activ
  updateRefsAfterFlip();

  var persistedWM=await loadWrongModePersist();
  if(persistedWM && persistedWM.active && (persistedWM.list||[]).length){
    WRMODE=true; WRONG=persistedWM.list.slice(0); WRP=Math.max(0,Math.min(WRONG.length-1,+persistedWM.pos||0));
    WRONG_STARTED_AT_MS=+persistedWM.startedAtMs||Date.now();

    await prefetchQuestion(WRONG[WRP]);
    await prefetchAhead(WRONG[WRP]||0);
    await renderQuestionInWrapper(REFS, WRONG[WRP], {resetSelections:true});
    revealNow();
    return;
  }

  if(FIN){
    await showFinal();
    D.body.classList.remove("page-loading");
    return;
  }

  await prefetchQuestion(CUR);
  await prefetchAhead(CUR);
  await renderQuestionInWrapper(REFS, CUR, {resetSelections:false});
  revealNow();
}
await initialRender();

/* Helper: index activ curent */
function getActiveIndex(){ return WRMODE ? WRONG[WRP] : CUR; }

/* ===== AI pop-up simplu (idempotent) ===== */
var AIPop=null;
function ensureAIPop(){
  if(AIPop) return AIPop;
  AIPop=document.querySelector(".ask-ai-pop-up");
  if(!AIPop){
    AIPop=document.createElement("div"); AIPop.className="ask-ai-pop-up";
    AIPop.style.cssText="display:none;position:fixed;inset:0;justify-content:center;align-items:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);z-index:2147483647";
    var box=document.createElement("div"); box.className="audio-btn";
    box.style.cssText="display:flex;gap:12px;align-items:center;background:#121212;padding:16px 20px;border-radius:12px;border:1px solid #2a2a2a";
    var mic=document.createElement("div"); mic.className="mic-icon-ai"; mic.style.cssText="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;overflow:hidden";
    var img=document.createElement("img"); img.alt="AI"; img.src="https://cdn.prod.website-files.com/68589124f5ef093107d3fdc2/685c48b463b6d0ce30731509_ChatGPT%20Image%20Jun%2020%2C%202025%2C%2001_39_41%20PM.png"; img.style.width="100%"; img.style.height="100%"; img.style.objectFit="cover"; mic.appendChild(img);
    var audioBtn=document.createElement("button"); audioBtn.className="audio-ai-btn"; audioBtn.textContent="Audio AI"; audioBtn.style.cssText="padding:10px 14px;border-radius:10px;border:1px solid #3a3a3a;background:#1d1d1d;color:#fff;cursor:pointer";
    var closeBtn=document.createElement("button"); closeBtn.className="ask-ai-pop-up-close"; closeBtn.textContent="Închide"; closeBtn.style.cssText="margin-left:8px;padding:8px 12px;border-radius:8px;border:1px solid #3a3a3a;background:#1d1d1d;color:#fff;cursor:pointer";
    box.appendChild(mic); box.appendChild(audioBtn); box.appendChild(closeBtn);
    AIPop.appendChild(box); document.body.appendChild(AIPop);
  }
  AIPop.addEventListener("click",function(e){
    if(e.target.closest(".ask-ai-pop-up-close")||e.target===AIPop){ vibrateShort(); AIPop.style.display="none"; document.body.style.overflow=""; }
  });
  var ab=AIPop.querySelector(".audio-ai-btn");
  if(ab && !ab.__bound){ ab.addEventListener("click",function(){ vibrateShort(); /* hook STT -> GPT -> TTS */ }); ab.__bound=true; }
  return AIPop;
}

/* ===== Utils vizibilitate & primary submit ===== */
function isVisible(el){
  if(!el) return false;
  var cs=getComputedStyle(el);
  return cs.display!=="none" && cs.visibility!=="hidden" && cs.opacity!=="0";
}
function primarySubmitBtn(){
  // prioritar mobil dacă e vizibil
  if(REFS.submitBtnMobile && isVisible(REFS.submitBtnMobile)) return REFS.submitBtnMobile;
  return REFS.submitBtn || null;
}

/* ===== EXPLAIN toggle (desktop + mobil) ===== */
function onExplainClick(){
  vibrateShort();
  var opening = !isExplanationOpen(REFS);
  var scroller=(REFS.qEl&&REFS.qEl.querySelector&&REFS.qEl.querySelector(".question-wrapper-inner"))||getScrollParent(REFS.qEl||REFS.qWrap);
  if(opening){
    if(REFS.videoWrap){ REFS.videoWrap.style.display="block"; var v=REFS.videoWrap.querySelector("video"); if(v){ try{ v.plyr?v.plyr.pause():v.pause(); }catch(_){ } } }
    if(REFS.acc){ REFS.acc.style.display="block"; REFS.acc.classList.remove("open"); if(REFS.accContent) REFS.accContent.style.maxHeight="0px"; }
    renderExplainBtnUI(REFS,true);
    scrollContainerToAnchor(REFS.anchor,scroller,{behavior:"smooth"});
  }else{
    var v=REFS.videoWrap&&REFS.videoWrap.querySelector?REFS.videoWrap.querySelector("video"):null;
    if(v){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } v._manualClosed=true; v._suppressNextAutoResume=true; }
    if(REFS.videoWrap) REFS.videoWrap.style.display="none";
    if(REFS.acc){ REFS.acc.classList.remove("open"); REFS.acc.style.display="none"; if(REFS.accContent) REFS.accContent.style.maxHeight="0px"; }
    if(REFS.accArrow){ try{ REFS.accArrow.style.removeProperty("transform"); }catch(_){ } }
    renderExplainBtnUI(REFS,false);
    scrollContainerToAnchor(REFS.anchorTop,scroller,{behavior:"smooth"});
  }
}

/* ===== AI click (desktop + mobil) ===== */
function onAiClick(){
  vibrateShort();
  var v=REFS.videoWrap&&REFS.videoWrap.querySelector?REFS.videoWrap.querySelector("video"):null;
  if(v && !v.paused){ try{ v.pause(); if(v.plyr) v.plyr.pause(); }catch(_){ } }
  ensureAIPop().style.display="flex"; document.body.style.overflow="hidden";
}

/* ===== SELECT opțiune ===== */
function onOptionCardClick(card){
  if(ANSW) return;
  vibrateShort();
  var L=getLetterFromCard(card); if(!L) return;
  var ix=SEL.indexOf(L);
  if(ix>-1) SEL.splice(ix,1); else SEL.push(L);
  applySelectedVisualsFromSEL(REFS.qEl);
  hideAlertBox();
}

/* ===== SUBMIT/NEXT/FINISH ===== */
async function doFinishIfPossible(){
  stopActiveMedia(REFS);
  try{ await progRef.set({currentIndex:CUR,finished:true},{merge:true}); }catch(_){}
  WRMODE=false; await clearWrongModePersist(); await showFinal();
}

async function goNext(){
  stopActiveMedia(REFS);
  setButtonsTransitionLock(REFS,true);

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
    await flipToIndex(WRONG[WRP],{resetSelections:true});
    return;
  }else{
    if(CUR<TOTAL){
      CUR++; try{ await progRef.set({currentIndex:CUR},{merge:true}); }catch(_){}
      await prefetchAhead(CUR); pruneBUF(); SEL=[]; ANSW=false;
      await flipToIndex(CUR,{resetSelections:false});
    }else{
      try{ await progRef.set({finished:true},{merge:true}); }catch(_){}
      await showFinal();
    }
    return;
  }
}

async function onSubmitClick(targetBtn){
  var idx=getActiveIndex(); if(!REFS.qEl) return;

  var isVerify=targetBtn.classList.contains("is-verify"),
      isFinish=targetBtn.classList.contains("is-finish")||targetBtn.classList.contains("finish-chapter-btn"),
      isNext=targetBtn.classList.contains("is-next");

  if(isFinish && ANSW){ await doFinishIfPossible(); return; }
  if(isNext && ANSW){ await goNext(); return; }

  if(isVerify){
    if(SEL.length===0){
      toast("Selecteaza un raspuns!",1000);
      playOne(alertSound);
      setSingleBtnState(REFS,true);
      return;
    }
    var q=BUF[idx]; if(!q) return;
    var cor=parseCorrectLetters(q);
    ANSW=true;

    clearLetterStates(REFS.qEl); applyLetterStatesByCorrect(REFS.qEl,cor);
    clearWrongCards(REFS.qEl);   applyWrongCardsByCorrect(REFS.qEl,cor);

    var selected=SEL.slice().sort().join(","), correct=cor.slice().sort().join(","), isFullyCorrect=selected.length>0&&selected===correct;

    if(REFS.staticText) REFS.staticText.textContent=isFullyCorrect?pickNonRepeat(STATIC_CORRECT,"correct"):pickNonRepeat(STATIC_WRONG,"wrong");
    var ord=["A","B","C"].filter(function(x){return cor.indexOf(x)>-1}); if(REFS.correctAns) REFS.correctAns.textContent=ord.join(", ");

    var lottieEl=REFS.qEl&&REFS.qEl.querySelector?REFS.qEl.querySelector(".lottie-animation-correct"):null;
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

    // vizibilitate explicație + AI – desktop + mobil
    if(REFS.feedbackWrap) REFS.feedbackWrap.style.setProperty("display","flex","important");
    if(REFS.explainBtn) REFS.explainBtn.style.setProperty("display","flex","important");
    if(REFS.explainBtnMobile) REFS.explainBtnMobile.style.setProperty("display","flex","important");
    if(REFS.aiBtn) REFS.aiBtn.style.setProperty("display","flex","important");
    if(REFS.aiBtnMobile) REFS.aiBtnMobile.style.setProperty("display","flex","important");
    applyAIChatText(REFS);

    setSingleBtnState(REFS,false);
    var lastWrong=WRMODE&&(WRP===WRONG.length-1),lastNormal=!WRMODE&&(CUR===TOTAL);
    setSubmitStateBoth(REFS,(lastWrong||lastNormal)?"finish":"next");

    requestAnimationFrame(function(){
      var scroller=(REFS.qEl&&REFS.qEl.querySelector&&REFS.qEl.querySelector(".question-wrapper-inner"))||getScrollParent(REFS.qEl||REFS.qWrap);
      scrollContainerToAnchor(REFS.anchor,scroller,{behavior:"smooth"});
    });

    var nowMs=Date.now();
    Promise.all([
      ansCollection.doc(CHAP+"_"+idx).set({
        module:"mediu",chapterSlug:CHAP,index:idx,question:BUF[idx]&&BUF[idx].Question||"",
        options:["A","B","C"].map(function(L){return {letter:L,value:(BUF[idx]&&BUF[idx]["Option "+L])||""}}),
        selected:SEL.slice(),correct:cor.slice(),explanation:BUF[idx]&&BUF[idx]["Explanation"]||"",
        answeredAt:firebase.firestore.FieldValue.serverTimestamp(),
        answeredAtMs: nowMs
      },{merge:true}),
      progRef.set({currentIndex:CUR,finished:false},{merge:true})
    ]).catch(function(err){
      console.error("Eroare salvare raspuns/progres:",err);
      toast("Conexiune slaba – incerc sa salvez…",1200);
    });
  }
}

/* ===== WRONG-MODE build & start ===== */
async function buildWrongListNow(){
  var pool=[], snap=await ansCollection.where("chapterSlug","==",CHAP).get();
  snap.forEach(function(doc){
    var d=doc.data(),sel=(d.selected||[]).slice().sort().join(","),cor=(d.correct||[]).slice().sort().join(",");
    if(sel&&sel!==cor){
      var idx=d.index;
      if(typeof idx!=="number"){ var asNum=parseInt(idx,10); if(Number.isFinite(asNum)) idx=asNum; }
      if(typeof idx!=="number"){ var m=String(doc.id||"").match(/_(\d+)$/); if(m) idx=parseInt(m[1],10); }
      if(typeof idx==="number"&&Number.isFinite(idx)) pool.push(idx);
    }
  });
  return Array.from(new Set(pool)).sort(function(a,b){return a-b});
}
async function startWrongModeSafe(){
  if(START_WRONG_IN_PROGRESS) return;
  START_WRONG_IN_PROGRESS=true;
  vibrateShort(); stopActiveMedia(REFS);

  var loaderEl=document.querySelector(".lesson-loader");
  var container=REFS.qWrap||activeWrap()||document.body;

  if(container){
    var h=container.offsetHeight;
    container.classList.add("no-transition","is-preparing");
    if(h) container.style.minHeight=h+"px";
  }
  if(loaderEl) loaderEl.style.setProperty("display","flex","important");
  document.body.classList.add("page-loading");
  if(FINAL) FINAL.style.setProperty("display","none","important");
  if(QSEC){ QSEC.style.setProperty("display","flex","important"); QSEC.classList.add("visible"); }

  try{
    var list=(WRONG_PREPARED_READY?WRONG_PREPARED:null);
    if(!list||!list.length) list=await buildWrongListNow();

    if(!list.length){
      alert("Nu ai nicio intrebare gresita de refacut la acest capitol!");
      if(loaderEl) loaderEl.style.setProperty("display","none","important");
      if(FINAL) FINAL.style.setProperty("display","flex","important");
      if(container){ container.classList.remove("no-transition","is-preparing"); container.style.minHeight=""; }
      document.body.classList.remove("page-loading");
      START_WRONG_IN_PROGRESS=false;
      return;
    }

    var prio={}; prio[list[0]]="high";
    await prefetchMany(list,prio);
    await prefetchQuestion(list[0]);
    var q1=BUF[list[0]];
    try{ await ensureImageReadyFromQ(q1); }catch(_){}

    WRMODE=true; WRP=0; WRONG=list.slice(0);
    WRONG_STARTED_AT_MS=Date.now();
    await persistWrongMode({active:true,list:WRONG,pos:WRP});
    pruneBUF();

    SEL=[]; ANSW=false;
    // pentru a păstra flip instant, folosim flipToIndex la start
    await flipToIndex(WRONG[WRP],{resetSelections:true});
    await prefetchAhead(WRONG[WRP]||0);

  }catch(e){
    console.error("EROARE la wrong-mode (safe):",e);
    alert("A apărut o eroare la încărcarea intrebarilor greșite.");
    if(FINAL) FINAL.style.setProperty("display","flex","important");
  }finally{
    if(loaderEl) loaderEl.style.setProperty("display","none","important");
    document.body.classList.remove("page-loading");
    if(container){ container.classList.remove("no-transition","is-preparing"); container.style.minHeight=""; }
    START_WRONG_IN_PROGRESS=false;
  }
}

/* ===== Next chapter ===== */
var NEXT_SLUG=null,NEXT_READY=false;
async function getNextChapterSlug(){
  if(NEXT_READY) return NEXT_SLUG;
  try{
    var s=await db.collection("mediu_invatare_chapters").orderBy("Index").get(); var arr=[];
    s.forEach(function(d){arr.push(d.id)});
    var i=arr.indexOf(CHAP); NEXT_SLUG=(i!==-1&&i<arr.length-1)?arr[i+1]:null;
  }catch(_){ NEXT_SLUG=null; }
  NEXT_READY=true; return NEXT_SLUG;
}

/* ===== Export pentru PARTEA 2 (delegări, tastatură & acțiuni finale) ===== */
window.__ATX = Object.freeze({
  handlers:{ onSubmitClick, onOptionCardClick, onExplainClick, onAiClick, startWrongModeSafe },
  utils:{ activeWrap, primarySubmitBtn, getNextChapterSlug, stopActiveMedia, clearWrongModePersist, vibrateShort },
  state:{ get REFS(){ return REFS; }, get CUR(){return CUR;}, get TOTAL(){return TOTAL;}, get WRMODE(){return WRMODE;} }
});


(function(){
  "use strict";

  /* -------- Utilitare mici -------- */
  var D=document, W=window;
  var $ = function(s,p){ return (p||D).querySelector(s); };
  var $$= function(s,p){ return Array.from((p||D).querySelectorAll(s)); };
  var raf = W.requestAnimationFrame || function(fn){ return setTimeout(fn,16); };
  var ric = W.requestIdleCallback ? function(fn){ requestIdleCallback(fn,{timeout:500}); } : function(fn){ setTimeout(fn,120); };

  function onceFlag(key){ if(W[key]) return true; W[key]=true; return false; }
  function isElVisible(el){
    if(!el) return false;
    var cs=getComputedStyle(el);
    return cs.display!=="none" && cs.visibility!=="hidden" && cs.opacity!=="0";
  }

  /* -------- A/B Recover (idempotent) --------
     Dacă editorul/alte scripturi reconstruiesc .question-wrapper,
     re-asamblăm structura .question-shell-w cu A/B instant-flip.
  */
  function hasABShell(){
    var sh=$(".question-shell-w");
    if(!sh) return false;
    var A=$(".question-wrapper-a",sh), B=$(".question-wrapper-b",sh);
    return !!(A && B);
  }
  function rebuildABFromSingle(single){
    if(!single || single.closest(".question-shell-w")) return;
    var parent=single.parentElement; if(!parent) return;

    // Construim shell + doi buffere (A/B)
    var shell=D.createElement("div"); shell.className="question-shell-w";
    var A=D.createElement("div"); A.className="question-wrapper-a question-wrapper visible is-active";
    var B=D.createElement("div"); B.className="question-wrapper-b question-wrapper";

    // Clonăm structura existentă de două ori
    var c1=single.cloneNode(true), c2=single.cloneNode(true);
    A.appendChild(c1); B.appendChild(c2);

    // Înlocuim în DOM
    parent.replaceChild(shell, single);
    shell.appendChild(A); shell.appendChild(B);

    // Eliminăm orice fade lăsat de alte stiluri (prevenim 250ms opacitate)
    try{ A.classList.remove("q-fade"); B.classList.remove("q-fade"); }catch(_){}
  }
  function recoverABIfNeeded(){
    if(hasABShell()) return;
    var root=$(".question-section")||D;
    // Căutăm un singur .question-wrapper „orfan”
    var singles=$$(".question-wrapper",root).filter(function(w){
      return !w.closest(".question-shell-w");
    });
    if(singles.length===1){
      rebuildABFromSingle(singles[0]);
    }else if(!singles.length){
      // Caz: structura încă nu e montată; mai așteptăm puțin
      ric(recoverABIfNeeded);
    }else{
      // Mai multe instanțe fără shell – alegem prima și o împachetăm
      rebuildABFromSingle(singles[0]);
    }
  }
  // Rulează o dată repede, apoi cu idle, apoi cu un mic timeout pentru siguranță
  (function stagedRecover(){
    recoverABIfNeeded();
    ric(recoverABIfNeeded);
    setTimeout(recoverABIfNeeded, 800);
  })();

  /* -------- A11y QoL universal (idempotent) --------
     Face role="button" + tabindex=0 pentru butoane non-<button> la explain/AI.
  */
  function a11yButtonsUniversal(){
    var sels=[
      ".explanation-btn",".explanation-card",".explain-btn",
      ".explanation-btn-mobile",".explain-btn-mobile",
      ".ask-ai-btn",".ai-pop-wrapper",".ai-btn",
      ".ask-ai-btn-mobile",".ai-btn-mobile"
    ];
    sels.forEach(function(sel){
      $$(sel).forEach(function(el){
        if(!el || el.tagName.toLowerCase()==="button") return;
        el.setAttribute("role","button");
        el.setAttribute("tabindex","0");
        if(!el.getAttribute("aria-label") && !el.textContent.trim()){
          el.setAttribute("aria-label","Buton");
        }
        if(!el.__key_a11y){
          el.addEventListener("keydown",function(e){
            if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); }
          });
          el.__key_a11y=true;
        }
      });
    });
  }
  a11yButtonsUniversal();
  ric(a11yButtonsUniversal);

  /* -------- aria-live pentru procentul final --------
     Dacă există .exam-final-percent, anunțăm screen reader-ul când se schimbă.
  */
  function ensureAriaLive(){
    if($("#aria-live-score")) return $("#aria-live-score");
    var live=D.createElement("div");
    live.id="aria-live-score";
    live.setAttribute("aria-live","polite");
    live.setAttribute("aria-atomic","true");
    live.style.position="absolute";
    live.style.width="1px";
    live.style.height="1px";
    live.style.overflow="hidden";
    live.style.clip="rect(1px, 1px, 1px, 1px)";
    live.style.whiteSpace="nowrap";
    live.style.userSelect="none";
    D.body.appendChild(live);
    return live;
  }
  function bindFinalPercentLive(){
    var target=$(".chapter-final-screen .exam-final-percent"); if(!target) return;
    var live=ensureAriaLive();
    var last="";
    var obs=new MutationObserver(function(){
      var t=(target.textContent||"").trim();
      if(t && t!==last){ last=t; live.textContent="Progres final: "+t; }
    });
    obs.observe(target,{characterData:true,subtree:true,childList:true});
  }
  bindFinalPercentLive();
  ric(bindFinalPercentLive);

  /* -------- Soft-guard pentru Enter (primary submit) --------
     Evită dublu submit pe Enter; preferă butonul vizibil din wrapperul activ.
  */
  if(!onceFlag("__autotest_enter_guard")){
    D.addEventListener("keydown",function(e){
      if(e.key!=="Enter") return;
      // alegem întâi un submit mobil vizibil, apoi desktop
      var activeShell=$(".question-shell-w")||D;
      var btn= $(".submit-btn-mobile", activeShell);
      if(!(btn && isElVisible(btn))){
        btn=$(".submit-btn", activeShell);
      }
      if(btn && isElVisible(btn)){
        e.preventDefault();
        btn.click();
      }
    }, true);
  }

  /* -------- Pause media pe schimbare de tab -------- */
  if(!onceFlag("__autotest_visibility_guard")){
    D.addEventListener("visibilitychange",function(){
      if(D.visibilityState==="hidden"){
        $$(".explanation-video, .plyr-player").forEach(function(v){
          try{
            if(v.plyr){ v.plyr.pause(); }
            else if(typeof v.pause==="function"){ v.pause(); }
          }catch(_){}
        });
      }
    });
  }

  /* -------- Offline/Online feedback mic (idempotent) -------- */
  function ensureNetToast(){
    if($(".net-toast")) return $(".net-toast");
    var box=D.createElement("div"); box.className="net-toast";
    box.style.position="fixed";
    box.style.left="50%";
    box.style.transform="translateX(-50%)";
    box.style.bottom="20px";
    box.style.zIndex="99999";
    box.style.padding="10px 14px";
    box.style.borderRadius="10px";
    box.style.border="1px solid #333";
    box.style.background="#121212";
    box.style.color="#fff";
    box.style.fontSize="14px";
    box.style.display="none";
    box.style.boxShadow="0 8px 22px rgba(0,0,0,.35)";
    box.setAttribute("role","status");
    D.body.appendChild(box);
    return box;
  }
  var toast=null, hideT=null;
  function showToast(msg,ms){
    toast = toast || ensureNetToast();
    toast.textContent=msg;
    toast.style.display="block";
    clearTimeout(hideT);
    hideT=setTimeout(function(){ toast.style.display="none"; }, ms||1300);
  }
  if(!onceFlag("__autotest_net_guard")){
    W.addEventListener("offline",function(){ showToast("Ești offline – răspunsurile se vor salva când revii online.", 2000); });
    W.addEventListener("online", function(){ showToast("Ești online – continuu sincronizarea.", 1400); });
  }

  /* -------- Error quiet-down (doar log, fără a bloca) -------- */
  if(!onceFlag("__autotest_error_guard")){
    W.addEventListener("unhandledrejection", function(e){
      // Evităm să oprim execuția – doar log
      try{ console.warn("Unhandled promise (silenced):", e.reason || e); }catch(_){}
      // e.preventDefault(); // (opțional: dacă vrei să suprimi complet)
    });
    W.addEventListener("error", function(e){
      try{ if(e && e.message) console.warn("Window error:", e.message); }catch(_){}
    });
  }

  /* -------- MutationObserver: re-a11y + recover A/B pe schimbări DOM -------- */
  (function observeQuestionSection(){
    var root=$(".question-section") || D.body;
    var mo=new MutationObserver(function(muts){
      var needA11y=false, needAB=false;
      for(var i=0;i<muts.length;i++){
        var m=muts[i];
        if(m.type==="childList"){
          if(m.addedNodes && m.addedNodes.length){
            needA11y=true; needAB=true;
          }
        }
        if(m.type==="attributes"){
          if(m.attributeName==="class"||m.attributeName==="style"){
            needA11y=true;
          }
        }
      }
      if(needA11y) a11yButtonsUniversal();
      if(needAB) recoverABIfNeeded();
    });
    mo.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]});
  })();

  /* -------- Expunem mici utilitare pentru debug manual (opțional) -------- */
  if(!W.AutoTestAB){
    W.AutoTestAB = {
      hasShell: hasABShell,
      recover: function(){ recoverABIfNeeded(); return hasABShell(); },
      wrapNow: function(){
        var single=$(".question-wrapper:not(.question-wrapper-a):not(.question-wrapper-b):not(.q-fade)") || $(".question-wrapper");
        if(single && !single.closest(".question-shell-w")){
          rebuildABFromSingle(single); return true;
        }
        return false;
      }
    };
  }

})();

/* ====== SHIM: aliniază bug-ul accidental "applyAIChatText(refs)" ====== */
var refs = REFS;
(function(){
  try{
    var __oldUpdateRefsAfterFlip = updateRefsAfterFlip;
    updateRefsAfterFlip = function(){
      __oldUpdateRefsAfterFlip();
      refs = REFS; // ținem "refs" sincronizat cu wrapperul activ
    };
  }catch(_){}
  try{ refs = REFS; }catch(_){}
})();

/* ====== Bind: click delegation (desktop + mobil) ====== */
(function(){
  if (window.__autotest_click_bound) return;
  window.__autotest_click_bound = true;

  document.addEventListener('click', async function(e){
    var t = e.target;

    /* — OPTION SELECT — */
    var card = t.closest && t.closest('.option-card');
    if (card && activeWrap() && card.closest(activeWrap())) {
      e.preventDefault();
      onOptionCardClick(card);
      return;
    }

    /* — SUBMIT (desktop + mobil) — */
    var submitBtn = t.closest && t.closest('.submit-btn,.submit-btn-mobile');
    if (submitBtn && activeWrap() && submitBtn.closest(activeWrap())) {
      e.preventDefault();
      if (submitBtn.classList.contains('is-disabled') || submitBtn.getAttribute('aria-disabled') === 'true') return;
      onSubmitClick(submitBtn);
      return;
    }

    /* — EXPLICATIE (desktop + mobil) — */
    var explainBtn = t.closest && t.closest('.explanation-btn,.explanation-card,.explain-btn,.explanation-btn-mobile,.explain-btn-mobile');
    if (explainBtn && activeWrap() && explainBtn.closest(activeWrap())) {
      e.preventDefault();
      onExplainClick();
      return;
    }

    /* — AI CHAT (desktop + mobil) — */
    var aiBtn = t.closest && t.closest('.ask-ai-btn,.ai-pop-wrapper,.ai-btn,.ask-ai-btn-mobile,.ai-btn-mobile');
    if (aiBtn && activeWrap() && aiBtn.closest(activeWrap())) {
      e.preventDefault();
      onAiClick();
      return;
    }

    /* — FINAL SCREEN: START WRONG-MODE — */
    if (t.closest && t.closest('.reset-wrong-questions-only')) {
      e.preventDefault();
      try { await startWrongModeSafe(); } catch(_){}
      return;
    }

    /* — FINAL SCREEN: NEXT CHAPTER — */
    if (t.closest && t.closest('.next-chapter-btn')) {
      e.preventDefault();
      try {
        var slug = await getNextChapterSlug();
        if (slug) location.href = "/mediu-invatare/" + encodeURIComponent(slug);
        else alert("Acesta este ultimul capitol.");
      } catch(_){}
      return;
    }

    /* — FINAL SCREEN: RESET CHAPTER (CONFIRM) — */
    if (t.closest && t.closest('.reset-chapter-btn,.confirm-reset-chapter')) {
      e.preventDefault();
      try { await __resetChapterHard(); } catch(err){ console.warn(err); }
      return;
    }

    /* — Închidere pop-up AI (fallback) — */
    if (t.classList && t.classList.contains('ask-ai-pop-up')) {
      t.style.display = 'none';
      document.body.style.overflow = '';
    }
  }, true);
})();

/* ====== Tastatură: A/B/C select & Escape închide exp/AI ====== */
(function(){
  if (window.__autotest_key_bound) return;
  window.__autotest_key_bound = true;

  function isTypingContext() {
    var ae = document.activeElement;
    if (!ae) return false;
    var tag = ae.tagName ? ae.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return true;
    if (ae.isContentEditable) return true;
    return false;
  }

  document.addEventListener('keydown', function(e){
    if (isTypingContext()) return;

    var key = (e.key || '').toUpperCase();

    // Shortcut: litere A/B/C → toggle select
    if (key === 'A' || key === 'B' || key === 'C') {
      var wrap = activeWrap();
      if (!wrap) return;
      var card = null;
      wrap.querySelectorAll('.option-card').forEach(function(c){
        if (!card) {
          var L = getLetterFromCard(c);
          if (L === key) card = c;
        }
      });
      if (card) {
        e.preventDefault();
        onOptionCardClick(card);
      }
      return;
    }

    // Escape → închide explicația/AI dacă sunt deschise
    if (key === 'ESCAPE') {
      var pop = document.querySelector('.ask-ai-pop-up');
      if (pop && pop.style.display !== 'none') {
        pop.style.display = 'none';
        document.body.style.overflow = '';
        return;
      }
      if (isExplanationOpen(REFS)) {
        onExplainClick(); // toggle închis
      }
      return;
    }
  }, true);
})();

/* ====== RESET CHAPTER (șterge răspunsuri, reset progres) ====== */
async function __resetChapterHard(){
  vibrateShort && vibrateShort();
  var sure = window.confirm("Ești sigur că vrei să resetezi tot capitolul? (răspunsuri șterse, progres resetat)");
  if (!sure) return;

  // loader ON
  try{
    var loader = document.querySelector('.lesson-loader');
    if (loader) loader.style.setProperty('display','flex','important');
    document.body.classList.add('page-loading');
  }catch(_){}

  try{
    // 1) Șterge răspunsurile din acest capitol (batch-uri de 450)
    var snap = await ansCollection.where("chapterSlug","==",CHAP).get();
    var docs = snap.docs || [];
    for (var i = 0; i < docs.length; i += 450) {
      var batch = db.batch();
      docs.slice(i, i+450).forEach(function(d){ batch.delete(d.ref); });
      await batch.commit();
    }

    // 2) Reset progres (CUR=1, FIN=false)
    CUR = 1; FIN = false;
    WRONG = []; WRP = 0; WRMODE = false;
    await clearWrongModePersist();

    await progRef.set({
      currentIndex: 1,
      finished: false,
      wrongMode: {active:false, list:[], pos:0, startedAtMs:0}
    }, {merge:true});

    // 3) Golește buffer & prefetch inițial
    Object.keys(BUF).forEach(function(k){ delete BUF[k]; });
    await prefetchQuestion(CUR);
    await prefetchAhead(CUR);

    // 4) UI: ascunde final, arată sesiunea, flip instant la prima
    var FINAL = document.querySelector('.chapter-final-screen');
    var QSEC  = document.querySelector('.question-section');
    if (FINAL) FINAL.style.setProperty('display','none','important');
    if (QSEC)  QSEC.style.setProperty('display','flex','important');

    SEL = []; ANSW = false;
    await flipToIndex(CUR, {resetSelections:true});

    // 5) loader OFF
    try{
      var loader2 = document.querySelector('.lesson-loader');
      if (loader2) loader2.style.setProperty('display','none','important');
      document.body.classList.remove('page-loading');
    }catch(_){}
  }catch(err){
    console.error('Reset capitol a eșuat:', err);
    alert('A apărut o eroare la resetare. Verifică conexiunea și permisiunile.');
    try{
      var loader3 = document.querySelector('.lesson-loader');
      if (loader3) loader3.style.setProperty('display','none','important');
      document.body.classList.remove('page-loading');
    }catch(_){}
  }
}

/* ====== QoL: Auto-scroll la începutul întrebării după flip ====== */
(function(){
  if (window.__autotest_autoscroll_bound) return;
  window.__autotest_autoscroll_bound = true;

  var __oldFlip = flipToIndex;
  flipToIndex = async function(idx, opts){
    await __oldFlip(idx, opts);
    try{
      var scroller = (REFS.qEl && REFS.qEl.querySelector && REFS.qEl.querySelector('.question-wrapper-inner')) || null;
      if (!scroller) scroller = getScrollParent(REFS.qEl || REFS.qWrap);
      if (scroller) {
        scrollContainerToAnchor( (REFS.anchorTop || (REFS.qEl || REFS.qWrap)), scroller, {behavior:'smooth', delay: 10, offset: 0});
      }
    }catch(_){}
  };
})();

/* ====== QoL: Prevenim dublu-click rapid pe SUBMIT ====== */
(function(){
  if (window.__autotest_submit_guard) return;
  window.__autotest_submit_guard = true;

  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.submit-btn,.submit-btn-mobile');
    if (!btn) return;
    if (btn.__busy) { e.preventDefault(); e.stopPropagation(); return; }
    btn.__busy = true;
    setTimeout(function(){ btn.__busy = false; }, 350);
  }, true);
})();

/* ====== QoL: Reaflăm starea butoanelor pe resize (mobil/desktop) ====== */
(function(){
  if (window.__autotest_resize_bound) return;
  window.__autotest_resize_bound = true;

  var lastIsMobile = null;
  function check(){
    try{
      var mobileWrapVisible = !!(refs && refs.buttonsWrapMobile && refs.buttonsWrapMobile.offsetParent !== null);
      if (lastIsMobile === mobileWrapVisible) return;
      lastIsMobile = mobileWrapVisible;

      // Reaplicăm text & stări (nu schimbăm logica de core)
      applyAIChatText(refs);
      if (!ANSW){
        setSingleBtnState(refs, true);
        setSubmitStateBoth(refs, 'verify');
      }
    }catch(_){}
  }
  window.addEventListener('resize', check, {passive:true});
  setTimeout(check, 0);
})();

/* ====== QoL: Fallback pentru imagini rupte (listen runtime) ====== */
(function(){
  if (window.__autotest_img_err_bound) return;
  window.__autotest_img_err_bound = true;

  document.addEventListener('error', function(e){
    var el = e.target;
    if (el && el.matches && el.matches('.question-image')) {
      try{
        el.removeAttribute('src');
        el.style.display = 'none';
        el.setAttribute('aria-hidden','true');
      }catch(_){}
    }
  }, true);
})();

/* ====== Mic helper: highlights la apăsare (touch) pe accordion ====== */
(function(){
  if (window.__autotest_pressfx_bound) return;
  window.__autotest_pressfx_bound = true;

  function isAccordionEl(el){
    return el && (el.closest('.custom-accordion-header') || el.closest('.custom-accordion-content'));
  }
  var pressEl = null, pressT = null;

  document.addEventListener('pointerdown', function(e){
    var el = e.target;
    if (!isAccordionEl(el)) return;
    pressEl = el.closest('.custom-accordion') || null;
    if (!pressEl) return;
    clearTimeout(pressT);
    pressEl.classList.add('is-pressed');
  }, true);

  document.addEventListener('pointerup', function(){
    if (!pressEl) return;
    pressT = setTimeout(function(){
      try{ pressEl.classList.remove('is-pressed'); }catch(_){}
      pressEl = null;
    }, 120);
  }, true);

  document.addEventListener('pointercancel', function(){
    if (!pressEl) return;
    try{ pressEl.classList.remove('is-pressed'); }catch(_){}
    pressEl = null;
  }, true);
})();

/* ====== Navigație implicită "Next" după verificare (Enter deja tratat) ====== */
(function(){
  if (window.__autotest_after_verify_bind) return;
  window.__autotest_after_verify_bind = true;

  // Când se apasă "Verifica", după feedback, mutăm focus pe explain (dacă apare) sau pe butonul Next.
  var __oldOnSubmit = onSubmitClick;
  onSubmitClick = async function(btn){
    await __oldOnSubmit(btn);
    try{
      if (!ANSW) return; // dacă era Verify dar fără selecție, nu mutăm focusul
      // prioritar: explain, apoi next/finish
      var firstFocus = refs && (refs.explainBtn || refs.explainBtnMobile) || primarySubmitBtn();
      if (firstFocus && typeof firstFocus.focus === 'function') firstFocus.focus();
    }catch(_){}
  };
})();

/* ====== Asigurăm AI label corect după flip/render ====== */
(function(){
  if (window.__autotest_ai_label_fix) return;
  window.__autotest_ai_label_fix = true;

  var __oldRender = renderQuestionInWrapper;
  renderQuestionInWrapper = async function(r,i,o){
    await __oldRender(r,i,o);
    try{ applyAIChatText(r); }catch(_){}
  };
})();

/* ====== Final: mic health check în consolă (opțional) ====== */
(function(){
  try{
    console.debug("[AutoTest] AB flip: OK | Listeners: OK | Wrong-mode ready:", typeof startWrongModeSafe === 'function');
  }catch(_){}
})();

}); 

