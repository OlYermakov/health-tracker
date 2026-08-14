const days = [
  {name:"Понеділок", workout:false, note:""},
  {name:"Вівторок", workout:false, note:""},
  {name:"Середа", workout:true, note:"Зал 30–40 хв, щадно для колін"},
  {name:"Четвер", workout:false, note:""},
  {name:"П’ятниця", workout:false, note:""},
  {name:"Субота", workout:true, note:"Зал або басейн 30–40 хв"},
  {name:"Неділя", workout:false, note:"За бажанням легка прогулянка"}
];

const KEY = "healthGlassTracker_v1";
let currentWeek = 1;

function blankWeek(){
  return {
    startWeight:"",
    endWeight:"",
    mood:"",
    days: days.map(d => ({
      breakfast:false,
      vegetables:false,
      water:false,
      workout:d.workout ? false : null
    }))
  };
}
function defaultState(){
  const weeks = Array.from({length:12}, blankWeek);
  return {weeks};
}
let state = load();

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if(!parsed.weeks || parsed.weeks.length!==12) return defaultState();
    return parsed;
  }catch(e){ return defaultState(); }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(state));
  renderAll();
}
function completionOf(w){
  let done=0,total=0;
  w.days.forEach((d,i)=>{
    ["breakfast","vegetables","water"].forEach(k=>{total++; if(d[k])done++;});
    if(days[i].workout){total++; if(d.workout)done++;}
  });
  return total ? done/total : 0;
}
function weightNumber(v){
  if(v===null || v===undefined || v==="") return null;
  const n = Number(String(v).replace(",","."));
  return Number.isFinite(n) ? n : null;
}

function renderWeekSelect(){
  const s = document.getElementById("weekSelect");
  s.innerHTML = "";
  for(let i=1;i<=12;i++){
    const o = document.createElement("option");
    o.value=i;o.textContent=`Тиждень ${i}`;
    if(i===currentWeek)o.selected=true;
    s.appendChild(o);
  }
}
function renderMood(){
  const s=document.getElementById("mood");
  s.innerHTML='<option value="">—</option>';
  for(let i=1;i<=10;i++){
    const o=document.createElement("option");o.value=i;o.textContent=i;
    s.appendChild(o);
  }
}
function renderRows(){
  const tbody=document.getElementById("weekRows");
  tbody.innerHTML="";
  const w=state.weeks[currentWeek-1];
  days.forEach((day,i)=>{
    const tr=document.createElement("tr");
    if(day.workout) tr.classList.add("workout");
    tr.innerHTML=`
      <td>${day.name}</td>
      <td>${checkHTML(i,"breakfast",w.days[i].breakfast)}</td>
      <td>${checkHTML(i,"vegetables",w.days[i].vegetables)}</td>
      <td>${checkHTML(i,"water",w.days[i].water)}</td>
      <td>${day.workout ? checkHTML(i,"workout",w.days[i].workout) : "—"}</td>
      <td>${day.note || ""}</td>`;
    tbody.appendChild(tr);
  });
}
function checkHTML(i,key,on){
  return `<button class="check ${on?'on':''}" onclick="toggleCheck(${i},'${key}')">✓</button>`;
}
function toggleCheck(i,key){
  const d=state.weeks[currentWeek-1].days[i];
  if(d[key]===null) return;
  d[key]=!d[key];
  save();
}
function renderFields(){
  const w=state.weeks[currentWeek-1];
  document.getElementById("startWeight").value=w.startWeight ?? "";
  document.getElementById("endWeight").value=w.endWeight ?? "";
  document.getElementById("mood").value=w.mood ?? "";
}
function renderWeekNav(){
  const nav=document.getElementById("weekNav");
  nav.innerHTML="";
  for(let i=1;i<=12;i++){
    const b=document.createElement("button");
    b.className="week-btn"+(i===currentWeek?" active":"");
    b.textContent=i;
    b.onclick=()=>{currentWeek=i;renderAll();};
    nav.appendChild(b);
  }
}
function renderCards(){
  const w=state.weeks[currentWeek-1];
  const pct=completionOf(w);
  document.getElementById("cardWeek").textContent=currentWeek;
  document.getElementById("cardCompletion").textContent=Math.round(pct*100)+"%";

  const firstStart = state.weeks.map(x=>weightNumber(x.startWeight)).find(x=>x!==null);
  const ends=state.weeks.map(x=>weightNumber(x.endWeight)).filter(x=>x!==null);
  const current=ends.length ? ends[ends.length-1] : null;
  document.getElementById("cardStart").textContent=firstStart!==undefined&&firstStart!==null?firstStart.toFixed(1)+" кг":"—";
  document.getElementById("cardCurrent").textContent=current!==null?current.toFixed(1)+" кг":"—";
  const delta=(firstStart!==undefined&&firstStart!==null&&current!==null)?current-firstStart:null;
  const deltaEl=document.getElementById("cardDelta");
  deltaEl.textContent=delta!==null?(delta>0?"+":"")+delta.toFixed(1)+" кг":"—";
  deltaEl.style.color=delta!==null&&delta<0?"var(--green)":"var(--red)";

  const dash=377*(1-pct);
  document.getElementById("ringArc").style.strokeDashoffset=dash;
  document.getElementById("ringPct").textContent=Math.round(pct*100)+"%";
}
function fitCanvas(c){
  const dpr=window.devicePixelRatio||1;
  const rect=c.getBoundingClientRect();
  c.width=Math.max(1,Math.floor(rect.width*dpr));
  c.height=Math.max(1,Math.floor(rect.height*dpr));
  const ctx=c.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w:rect.width,h:rect.height};
}
function drawLineChart(id, values, maxY, color, formatY){
  const c=document.getElementById(id);
  const {ctx,w,h}=fitCanvas(c);
  ctx.clearRect(0,0,w,h);
  const pad={l:42,r:16,t:14,b:30};
  const iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;

  ctx.strokeStyle="rgba(255,255,255,.08)";
  ctx.lineWidth=1;
  ctx.fillStyle="#9fb0c6";
  ctx.font="11px system-ui";
  ctx.textAlign="right";
  for(let i=0;i<=4;i++){
    const y=pad.t+ih*i/4;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
    const v=maxY*(1-i/4);
    ctx.fillText(formatY(v),pad.l-8,y+4);
  }
  ctx.textAlign="center";
  for(let i=0;i<12;i++){
    const x=pad.l+iw*(i/11);
    ctx.fillText(String(i+1),x,h-10);
  }

  const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);
  if(valid.length<1) return;

  function xy(item){
    const x=pad.l+iw*(item.i/11);
    const y=pad.t+ih*(1-item.v/maxY);
    return {x,y};
  }
  const grad=ctx.createLinearGradient(pad.l,0,w-pad.r,0);
  grad.addColorStop(0,color);
  grad.addColorStop(1,"#b79cff");

  ctx.strokeStyle=grad;ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";
  ctx.beginPath();
  valid.forEach((item,n)=>{
    const p=xy(item); if(n===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  });
  ctx.stroke();

  valid.forEach(item=>{
    const p=xy(item);
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=1.5;ctx.stroke();
  });
}
function drawCharts(){
  const weightVals=state.weeks.map(w=>weightNumber(w.endWeight));
  const known=weightVals.filter(v=>v!==null);
  let maxW=100;
  let minW=80;
  if(known.length){
    maxW=Math.ceil(Math.max(...known)+3);
    minW=Math.floor(Math.min(...known)-3);
  }
  drawWeightChart(weightVals,minW,maxW);
  drawLineChart("completionChart",state.weeks.map(w=>completionOf(w)),1,"#79e7ff",v=>Math.round(v*100)+"%");
}
function drawWeightChart(values,minY,maxY){
  const c=document.getElementById("weightChart");
  const {ctx,w,h}=fitCanvas(c);
  ctx.clearRect(0,0,w,h);
  const pad={l:42,r:16,t:14,b:30}, iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
  ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;ctx.fillStyle="#9fb0c6";ctx.font="11px system-ui";ctx.textAlign="right";
  for(let i=0;i<=4;i++){
    const y=pad.t+ih*i/4;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();
    const v=maxY-(maxY-minY)*i/4;
    ctx.fillText(v.toFixed(0),pad.l-8,y+4);
  }
  ctx.textAlign="center";
  for(let i=0;i<12;i++){const x=pad.l+iw*(i/11);ctx.fillText(String(i+1),x,h-10)}
  const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);
  if(!valid.length) return;
  function xy(item){
    const x=pad.l+iw*(item.i/11);
    const y=pad.t+ih*(1-(item.v-minY)/(maxY-minY));
    return {x,y};
  }
  const grad=ctx.createLinearGradient(pad.l,0,w-pad.r,0);
  grad.addColorStop(0,"#b79cff");grad.addColorStop(1,"#79e7ff");
  ctx.strokeStyle=grad;ctx.lineWidth=3;ctx.beginPath();
  valid.forEach((item,n)=>{const p=xy(item);n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();
  valid.forEach(item=>{const p=xy(item);ctx.fillStyle="#b79cff";ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill()});
}
function renderAll(){
  renderWeekSelect();
  renderRows();
  renderFields();
  renderWeekNav();
  renderCards();
  requestAnimationFrame(drawCharts);
}

document.getElementById("weekSelect").addEventListener("change",e=>{currentWeek=Number(e.target.value);renderAll()});
document.getElementById("startWeight").addEventListener("change",e=>{state.weeks[currentWeek-1].startWeight=e.target.value;save()});
document.getElementById("endWeight").addEventListener("change",e=>{state.weeks[currentWeek-1].endWeight=e.target.value;save()});
document.getElementById("mood").addEventListener("change",e=>{state.weeks[currentWeek-1].mood=e.target.value;save()});

window.addEventListener("resize",()=>requestAnimationFrame(drawCharts));
renderMood();
renderAll();