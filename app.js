const days = [
  {name:"Понеділок", recommended:false, note:""},
  {name:"Вівторок", recommended:false, note:""},
  {name:"Середа", recommended:true, note:"Зручний варіант для тренування A або B"},
  {name:"Четвер", recommended:false, note:""},
  {name:"П’ятниця", recommended:false, note:""},
  {name:"Субота", recommended:true, note:"Зручний варіант для залу або басейну"},
  {name:"Неділя", recommended:false, note:"За бажанням легка прогулянка"}
];

const WORKOUT_PLANS = {
  A: {
    title:"Тренування A",
    subtitle:"База + корпус",
    goal:"Спокійне тренування всього тіла з контрольованим навантаженням на коліна.",
    exercises:[
      {name:"Велотренажер", dose:"5–7 хв", tag:"Розминка", note:"Легкий опір, рівний темп. Мета — розігрітися, а не втомитися."},
      {name:"Жим від грудей у тренажері", dose:"2 × 10–12", tag:"Груди", note:"Лопатки притиснуті, рух плавний. Залишай приблизно 3 повторення в запасі."},
      {name:"Горизонтальна тяга сидячи", dose:"2 × 10–12", tag:"Спина", note:"Тягни ліктями назад без ривка, корпус стабільний."},
      {name:"Згинання ніг у тренажері", dose:"2 × 10–12", tag:"Ноги", note:"Повільно, без ривків. Якщо коліно реагує дискомфортом — зменш амплітуду або вагу."},
      {name:"Жим ногами — неглибока амплітуда", dose:"2 × 8–10", tag:"Ноги", note:"Стопи стабільно, коліна по лінії стоп. Не опускай платформу глибоко; працюй тільки без болю."},
      {name:"Ягодичний міст / hip thrust", dose:"2 × 10–12", tag:"Сідниці", note:"Піднімай таз за рахунок сідниць, не прогинай поперек."},
      {name:"Pallof press", dose:"2 × 10 / сторона", tag:"Корпус", note:"Корпус не розвертай. Рух руками повільний і контрольований."}
    ]
  },
  B: {
    title:"Тренування B",
    subtitle:"Спина + плечі",
    goal:"Другий повнотілий день з іншим акцентом, але тією ж щадною логікою для колін.",
    exercises:[
      {name:"Велотренажер або еліпс", dose:"5–7 хв", tag:"Розминка", note:"Легкий опір. Якщо еліпс неприємний для колін — обирай велотренажер."},
      {name:"Вертикальна тяга до грудей", dose:"2 × 10–12", tag:"Спина", note:"Тягни до верхньої частини грудей, не відхиляй корпус назад."},
      {name:"Жим плечима у тренажері", dose:"2 × 10–12", tag:"Плечі", note:"Починай з легкої ваги, не піднімай плечі до вух."},
      {name:"Згинання ніг у тренажері", dose:"2 × 10–12", tag:"Ноги", note:"Контрольований темп; навантаження має відчуватися в задній поверхні стегна."},
      {name:"Жим ногами — неглибока амплітуда", dose:"2 × 8–10", tag:"Ноги", note:"Без глибокого згинання коліна. Якщо некомфортно — пропусти вправу та обговори альтернативу з фізіотерапевтом."},
      {name:"Відведення стегон у тренажері", dose:"2 × 12–15", tag:"Сідниці", note:"Без розгойдування корпусу, пауза в кінцевій точці."},
      {name:"Face pull / тяга каната до обличчя", dose:"2 × 12–15", tag:"Плечі", note:"Лікті трохи вище кистей, рух легкий і контрольований."}
    ]
  }
};

const KEY = "healthGlassTracker_v1";
const WEEKLY_WORKOUT_TARGET = 2;
let currentWeek = 1;
let currentPlan = "A";

function blankSession(planKey){
  return {day:"", done:false, exercises:WORKOUT_PLANS[planKey].exercises.map(()=>false)};
}
function blankWeek(){
  return {
    startWeight:"",
    endWeight:"",
    mood:"",
    days:days.map(()=>({breakfast:false,vegetables:false,water:false,workout:false})),
    training:{A:blankSession("A"),B:blankSession("B")}
  };
}
function defaultState(){ return {weeks:Array.from({length:12}, blankWeek)}; }
function normalizeSession(oldSession, planKey){
  const clean=blankSession(planKey);
  clean.day=oldSession?.day ?? "";
  clean.done=Boolean(oldSession?.done);
  clean.exercises=WORKOUT_PLANS[planKey].exercises.map((_,i)=>Boolean(oldSession?.exercises?.[i]));
  return clean;
}
function normalizeState(parsed){
  if(!parsed || !Array.isArray(parsed.weeks) || parsed.weeks.length!==12) return defaultState();
  return {
    weeks:parsed.weeks.map((week)=>({
      startWeight:week?.startWeight ?? "",
      endWeight:week?.endWeight ?? "",
      mood:week?.mood ?? "",
      days:days.map((_,i)=>({
        breakfast:Boolean(week?.days?.[i]?.breakfast),
        vegetables:Boolean(week?.days?.[i]?.vegetables),
        water:Boolean(week?.days?.[i]?.water),
        workout:Boolean(week?.days?.[i]?.workout)
      })),
      training:{
        A:normalizeSession(week?.training?.A,"A"),
        B:normalizeSession(week?.training?.B,"B")
      }
    }))
  };
}
let state=load();

function load(){
  try{
    const raw=localStorage.getItem(KEY);
    return raw?normalizeState(JSON.parse(raw)):defaultState();
  }catch(e){ return defaultState(); }
}
function persist(){ localStorage.setItem(KEY,JSON.stringify(state)); }
function save(){ persist(); renderAll(); }
function workoutCount(w){ return w.days.filter(d=>d.workout).length; }
function completionOf(w){
  let done=0;
  w.days.forEach(d=>["breakfast","vegetables","water"].forEach(k=>{if(d[k])done++;}));
  done+=Math.min(workoutCount(w),WEEKLY_WORKOUT_TARGET);
  return done/(21+WEEKLY_WORKOUT_TARGET);
}
function weightNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(String(v).replace(",","."));
  return Number.isFinite(n)?n:null;
}

function renderWeekSelect(){
  const s=document.getElementById("weekSelect");
  s.innerHTML="";
  for(let i=1;i<=12;i++){
    const o=document.createElement("option");o.value=i;o.textContent=`Тиждень ${i}`;o.selected=i===currentWeek;s.appendChild(o);
  }
}
function renderMood(){
  const s=document.getElementById("mood");
  s.innerHTML='<option value="">—</option>';
  for(let i=1;i<=10;i++){const o=document.createElement("option");o.value=i;o.textContent=i;s.appendChild(o);}
}
function renderRows(){
  const tbody=document.getElementById("weekRows");
  tbody.innerHTML="";
  const w=state.weeks[currentWeek-1];
  days.forEach((day,i)=>{
    const tr=document.createElement("tr");
    if(day.recommended)tr.classList.add("workout");
    tr.innerHTML=`
      <td>${day.name}</td>
      <td>${checkHTML(i,"breakfast",w.days[i].breakfast)}</td>
      <td>${checkHTML(i,"vegetables",w.days[i].vegetables)}</td>
      <td>${checkHTML(i,"water",w.days[i].water)}</td>
      <td>${checkHTML(i,"workout",w.days[i].workout)}</td>
      <td>${day.note||""}</td>`;
    tbody.appendChild(tr);
  });
}
function checkHTML(i,key,on){
  return `<button class="check ${on?'on':''}" type="button" onclick="toggleCheck(${i},'${key}')" aria-label="${on?'Виконано':'Не виконано'}">✓</button>`;
}
function toggleCheck(i,key){
  const w=state.weeks[currentWeek-1];
  const d=w.days[i];
  d[key]=!d[key];
  if(key==="workout" && !d.workout){
    ["A","B"].forEach(planKey=>{
      const s=w.training[planKey];
      if(s.done && Number(s.day)===i) s.done=false;
    });
  }
  save();
}
function renderFields(){
  const w=state.weeks[currentWeek-1];
  document.getElementById("startWeight").value=w.startWeight??"";
  document.getElementById("endWeight").value=w.endWeight??"";
  document.getElementById("mood").value=w.mood??"";
}
function renderWeekNav(){
  const nav=document.getElementById("weekNav");nav.innerHTML="";
  for(let i=1;i<=12;i++){
    const b=document.createElement("button");
    b.className="week-btn"+(i===currentWeek?" active":"");b.type="button";b.textContent=i;
    b.onclick=()=>{currentWeek=i;renderAll();};nav.appendChild(b);
  }
}
function renderCards(){
  const w=state.weeks[currentWeek-1],pct=completionOf(w);
  document.getElementById("cardWeek").textContent=currentWeek;
  document.getElementById("cardCompletion").textContent=Math.round(pct*100)+"%";
  const firstStart=state.weeks.map(x=>weightNumber(x.startWeight)).find(x=>x!==null);
  const ends=state.weeks.map(x=>weightNumber(x.endWeight)).filter(x=>x!==null);
  const current=ends.length?ends[ends.length-1]:null;
  document.getElementById("cardStart").textContent=firstStart!==undefined&&firstStart!==null?firstStart.toFixed(1)+" кг":"—";
  document.getElementById("cardCurrent").textContent=current!==null?current.toFixed(1)+" кг":"—";
  const delta=(firstStart!==undefined&&firstStart!==null&&current!==null)?current-firstStart:null;
  const deltaEl=document.getElementById("cardDelta");
  deltaEl.textContent=delta!==null?(delta>0?"+":"")+delta.toFixed(1)+" кг":"—";
  deltaEl.style.color=delta!==null&&delta<0?"var(--green)":"var(--red)";
  document.getElementById("ringArc").style.strokeDashoffset=377*(1-pct);
  document.getElementById("ringPct").textContent=Math.round(pct*100)+"%";
  const count=workoutCount(w);
  document.getElementById("workoutStatus").textContent=`${count} / ${WEEKLY_WORKOUT_TARGET} тренування`;
}

function selectPlan(planKey){ currentPlan=planKey; renderTraining(); }
function renderTraining(){
  const w=state.weeks[currentWeek-1];
  const plan=WORKOUT_PLANS[currentPlan];
  const session=w.training[currentPlan];
  document.getElementById("trainingWeek").textContent=currentWeek;
  document.getElementById("trainingWeekStatus").textContent=`${Math.min(workoutCount(w),2)} / 2`;
  document.getElementById("tabA").classList.toggle("active",currentPlan==="A");
  document.getElementById("tabB").classList.toggle("active",currentPlan==="B");
  const doneExercises=session.exercises.filter(Boolean).length;
  const pct=Math.round(doneExercises/plan.exercises.length*100);
  const dayOptions=days.map((d,i)=>`<option value="${i}" ${String(session.day)===String(i)?'selected':''}>${d.name}</option>`).join("");
  const exercises=plan.exercises.map((ex,i)=>`
    <article class="exercise-card ${session.exercises[i]?'done':''}">
      <button class="exercise-check ${session.exercises[i]?'on':''}" type="button" onclick="toggleExercise('${currentPlan}',${i})" aria-label="${session.exercises[i]?'Виконано':'Позначити виконаним'}">✓</button>
      <div class="exercise-number">${String(i+1).padStart(2,'0')}</div>
      <div class="exercise-main">
        <div class="exercise-meta"><span>${ex.tag}</span><strong>${ex.dose}</strong></div>
        <h3>${ex.name}</h3>
        <p>${ex.note}</p>
      </div>
    </article>`).join("");
  const actionText=session.done?"Тренування зараховано ✓":"Зарахувати тренування";
  document.getElementById("workoutPlan").innerHTML=`
    <div class="plan-toolbar">
      <div>
        <div class="plan-kicker">${plan.title} · ${plan.subtitle}</div>
        <h3>${plan.goal}</h3>
      </div>
      <div class="plan-progress" aria-label="Прогрес вправ">
        <div><span>${doneExercises} / ${plan.exercises.length} вправ</span><b>${pct}%</b></div>
        <div class="progress-track"><i style="width:${pct}%"></i></div>
      </div>
    </div>
    <div class="exercise-list">${exercises}</div>
    <div class="session-footer">
      <div class="session-field">
        <label for="sessionDay">Коли тренуєшся?</label>
        <select id="sessionDay" onchange="setSessionDay('${currentPlan}',this.value)">
          <option value="">Обери день</option>${dayOptions}
        </select>
      </div>
      <button class="complete-session ${session.done?'done':''}" type="button" onclick="toggleSessionDone('${currentPlan}')" ${session.day===''?'disabled':''}>${actionText}</button>
      <div class="session-note">Перші 2 тижні тримай вагу помірною: закінчуй підхід із запасом приблизно 3–4 повторення. Коли верхня межа повторів дається чисто у двох підходах і коліна спокійні — наступного разу додай найменший крок ваги.</div>
    </div>`;
}
function toggleExercise(planKey,index){
  const session=state.weeks[currentWeek-1].training[planKey];
  session.exercises[index]=!session.exercises[index];
  persist();renderTraining();
}
function dayUsedByOtherCompletedSession(w,planKey,dayIndex){
  return ["A","B"].some(k=>k!==planKey && w.training[k].done && String(w.training[k].day)===String(dayIndex));
}
function setSessionDay(planKey,value){
  const w=state.weeks[currentWeek-1];
  const session=w.training[planKey];
  const oldDay=session.day;
  if(session.done && oldDay!=="" && !dayUsedByOtherCompletedSession(w,planKey,oldDay)) w.days[Number(oldDay)].workout=false;
  session.day=value;
  if(session.done && value!=="") w.days[Number(value)].workout=true;
  save();
}
function toggleSessionDone(planKey){
  const w=state.weeks[currentWeek-1];
  const session=w.training[planKey];
  if(session.day==="")return;
  session.done=!session.done;
  const dayIndex=Number(session.day);
  if(session.done){
    w.days[dayIndex].workout=true;
  }else if(!dayUsedByOtherCompletedSession(w,planKey,dayIndex)){
    w.days[dayIndex].workout=false;
  }
  save();
}

function fitCanvas(c){
  const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect();
  c.width=Math.max(1,Math.floor(rect.width*dpr));c.height=Math.max(1,Math.floor(rect.height*dpr));
  const ctx=c.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w:rect.width,h:rect.height};
}
function drawLineChart(id,values,maxY,color,formatY){
  const c=document.getElementById(id),{ctx,w,h}=fitCanvas(c);ctx.clearRect(0,0,w,h);
  const pad={l:42,r:16,t:14,b:30},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;
  ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;ctx.fillStyle="#9fb0c6";ctx.font="11px system-ui";ctx.textAlign="right";
  for(let i=0;i<=4;i++){const y=pad.t+ih*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(formatY(maxY*(1-i/4)),pad.l-8,y+4);}
  ctx.textAlign="center";for(let i=0;i<12;i++){const x=pad.l+iw*(i/11);ctx.fillText(String(i+1),x,h-10);}
  const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);if(!valid.length)return;
  const xy=item=>({x:pad.l+iw*(item.i/11),y:pad.t+ih*(1-item.v/maxY)});
  const grad=ctx.createLinearGradient(pad.l,0,w-pad.r,0);grad.addColorStop(0,color);grad.addColorStop(1,"#b79cff");
  ctx.strokeStyle=grad;ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  valid.forEach((item,n)=>{const p=xy(item);n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();
  valid.forEach(item=>{const p=xy(item);ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=1.5;ctx.stroke();});
}
function drawCharts(){
  const weightVals=state.weeks.map(w=>weightNumber(w.endWeight)),known=weightVals.filter(v=>v!==null);
  let maxW=100,minW=80;if(known.length){maxW=Math.ceil(Math.max(...known)+3);minW=Math.floor(Math.min(...known)-3);}
  drawWeightChart(weightVals,minW,maxW);
  drawLineChart("completionChart",state.weeks.map(w=>completionOf(w)),1,"#79e7ff",v=>Math.round(v*100)+"%");
}
function drawWeightChart(values,minY,maxY){
  const c=document.getElementById("weightChart"),{ctx,w,h}=fitCanvas(c);ctx.clearRect(0,0,w,h);
  const pad={l:42,r:16,t:14,b:30},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b;
  ctx.strokeStyle="rgba(255,255,255,.08)";ctx.lineWidth=1;ctx.fillStyle="#9fb0c6";ctx.font="11px system-ui";ctx.textAlign="right";
  for(let i=0;i<=4;i++){const y=pad.t+ih*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const v=maxY-(maxY-minY)*i/4;ctx.fillText(v.toFixed(0),pad.l-8,y+4);}
  ctx.textAlign="center";for(let i=0;i<12;i++){const x=pad.l+iw*(i/11);ctx.fillText(String(i+1),x,h-10);}
  const valid=values.map((v,i)=>({v,i})).filter(x=>x.v!==null);if(!valid.length)return;
  const xy=item=>({x:pad.l+iw*(item.i/11),y:pad.t+ih*(1-(item.v-minY)/(maxY-minY))});
  const grad=ctx.createLinearGradient(pad.l,0,w-pad.r,0);grad.addColorStop(0,"#b79cff");grad.addColorStop(1,"#79e7ff");
  ctx.strokeStyle=grad;ctx.lineWidth=3;ctx.beginPath();valid.forEach((item,n)=>{const p=xy(item);n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();
  valid.forEach(item=>{const p=xy(item);ctx.fillStyle="#b79cff";ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();});
}
function renderAll(){
  renderWeekSelect();renderRows();renderFields();renderWeekNav();renderCards();renderTraining();requestAnimationFrame(drawCharts);
}

document.getElementById("weekSelect").addEventListener("change",e=>{currentWeek=Number(e.target.value);renderAll();});
document.getElementById("startWeight").addEventListener("change",e=>{state.weeks[currentWeek-1].startWeight=e.target.value;save();});
document.getElementById("endWeight").addEventListener("change",e=>{state.weeks[currentWeek-1].endWeight=e.target.value;save();});
document.getElementById("mood").addEventListener("change",e=>{state.weeks[currentWeek-1].mood=e.target.value;save();});
window.addEventListener("resize",()=>requestAnimationFrame(drawCharts));
renderMood();renderAll();
