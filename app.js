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
      {name:"Велотренажер", image:"stationary-bike.webp", dose:"5–7 хв", tag:"Розминка", note:"Легкий опір, рівний темп. Мета — розігрітися, а не втомитися."},
      {name:"Жим від грудей у тренажері", image:"chest-press.webp", dose:"2 × 10–12", tag:"Груди", note:"Лопатки притиснуті, рух плавний. Залишай приблизно 3 повторення в запасі."},
      {name:"Горизонтальна тяга сидячи", image:"seated-row.webp", dose:"2 × 10–12", tag:"Спина", note:"Тягни ліктями назад без ривка, корпус стабільний."},
      {name:"Згинання ніг у тренажері", image:"leg-curl.webp", dose:"2 × 10–12", tag:"Ноги", note:"Повільно, без ривків. Якщо коліно реагує дискомфортом — зменш амплітуду або вагу."},
      {name:"Жим ногами — неглибока амплітуда", image:"leg-press.webp", dose:"2 × 8–10", tag:"Ноги", note:"Стопи стабільно, коліна по лінії стоп. Не опускай платформу глибоко; працюй тільки без болю."},
      {name:"Ягодичний міст / hip thrust", image:"hip-thrust.webp", dose:"2 × 10–12", tag:"Сідниці", note:"Піднімай таз за рахунок сідниць, не прогинай поперек."},
      {name:"Pallof press", image:"pallof-press.webp", dose:"2 × 10 / сторона", tag:"Корпус", note:"Корпус не розвертай. Рух руками повільний і контрольований."}
    ]
  },
  B: {
    title:"Тренування B",
    subtitle:"Спина + плечі",
    goal:"Другий повнотілий день з іншим акцентом, але тією ж щадною логікою для колін.",
    exercises:[
      {name:"Велотренажер або еліпс", image:"elliptical.webp", dose:"5–7 хв", tag:"Розминка", note:"Легкий опір. Якщо еліпс неприємний для колін — обирай велотренажер."},
      {name:"Вертикальна тяга до грудей", image:"lat-pulldown.webp", dose:"2 × 10–12", tag:"Спина", note:"Тягни до верхньої частини грудей, не відхиляй корпус назад."},
      {name:"Жим плечима у тренажері", image:"shoulder-press.webp", dose:"2 × 10–12", tag:"Плечі", note:"Починай з легкої ваги, не піднімай плечі до вух."},
      {name:"Згинання ніг у тренажері", image:"leg-curl.webp", dose:"2 × 10–12", tag:"Ноги", note:"Контрольований темп; навантаження має відчуватися в задній поверхні стегна."},
      {name:"Жим ногами — неглибока амплітуда", image:"leg-press.webp", dose:"2 × 8–10", tag:"Ноги", note:"Без глибокого згинання коліна. Якщо некомфортно — пропусти вправу та обговори альтернативу з фізіотерапевтом."},
      {name:"Відведення стегон у тренажері", image:"hip-abduction.webp", dose:"2 × 12–15", tag:"Сідниці", note:"Без розгойдування корпусу, пауза в кінцевій точці."},
      {name:"Face pull / тяга каната до обличчя", image:"face-pull.webp", dose:"2 × 12–15", tag:"Плечі", note:"Лікті трохи вище кистей, рух легкий і контрольований."}
    ]
  }
};

const LEGACY_TRACKER_KEY = "healthGlassTracker_v1";
const LEGACY_NOTES_KEY = "healthGlassDayNotes_v1";
const UNIFIED_KEY = "healthTrackerUnified_v3";
const WEEKLY_ACTIVITY_TARGET = 2;
const MIN_EXERCISES_TO_COMPLETE = 4;
let currentWeek = 1;
let currentPlan = "A";

function readUnifiedStore(){
  try{
    const parsed=JSON.parse(localStorage.getItem(UNIFIED_KEY)||"null");
    return parsed&&typeof parsed==="object"?parsed:null;
  }catch(e){return null;}
}

function writeUnifiedSection(section,value){
  const current=readUnifiedStore()||{};
  localStorage.setItem(UNIFIED_KEY,JSON.stringify({...current,version:4,[section]:value}));
}

function blankSession(planKey){
  return {day:"",done:false,completedAt:"",durationMinutes:"",exercises:WORKOUT_PLANS[planKey].exercises.map(()=>false)};
}
function blankWeek(){
  return {
    startWeight:"",
    endWeight:"",
    mood:"",
    days:days.map(()=>({breakfast:false,vegetables:false,water:false,activity:false})),
    training:{A:blankSession("A"),B:blankSession("B")}
  };
}
function defaultState(){ return {weeks:Array.from({length:12}, blankWeek)}; }
function normalizeSession(oldSession, planKey){
  const clean=blankSession(planKey);
  clean.day=oldSession?.day ?? "";
  clean.done=Boolean(oldSession?.done);
  clean.completedAt=typeof oldSession?.completedAt==="string"?oldSession.completedAt:"";
  clean.durationMinutes=oldSession?.durationMinutes===null||oldSession?.durationMinutes===undefined?"":String(oldSession.durationMinutes);
  clean.exercises=WORKOUT_PLANS[planKey].exercises.map((_,i)=>Boolean(oldSession?.exercises?.[i]));
  return clean;
}
function normalizeState(parsed){
  if(!parsed || !Array.isArray(parsed.weeks) || parsed.weeks.length!==12) return defaultState();
  return {
    weeks:parsed.weeks.map((week)=>{
      const training={
        A:normalizeSession(week?.training?.A,"A"),
        B:normalizeSession(week?.training?.B,"B")
      };
      return {
        startWeight:week?.startWeight ?? "",
        endWeight:week?.endWeight ?? "",
        mood:week?.mood ?? "",
        days:days.map((_,i)=>{
          const oldDay=week?.days?.[i]||{};
          const migratedActivity=oldDay.activity!==undefined?Boolean(oldDay.activity):Boolean(oldDay.workout);
          return {
            breakfast:Boolean(oldDay.breakfast),
            vegetables:Boolean(oldDay.vegetables),
            water:Boolean(oldDay.water),
            activity:migratedActivity
          };
        }),
        training
      };
    })
  };
}

function load(){
  try{
    const unified=readUnifiedStore();
    if(unified?.tracker)return normalizeState(unified.tracker);
    const legacy=localStorage.getItem(LEGACY_TRACKER_KEY);
    return legacy?normalizeState(JSON.parse(legacy)):defaultState();
  }catch(e){ return defaultState(); }
}
let state=load();

function emptyNotes(){return Array.from({length:12},()=>Array.from({length:7},()=>""));}
function normalizeNotes(parsed){
  if(!Array.isArray(parsed)||parsed.length!==12)return emptyNotes();
  return Array.from({length:12},(_,weekIndex)=>
    Array.from({length:7},(_,dayIndex)=>typeof parsed?.[weekIndex]?.[dayIndex]==="string"?parsed[weekIndex][dayIndex]:""));
}
function loadNotes(){
  try{
    const unified=readUnifiedStore();
    if(unified?.notes)return normalizeNotes(unified.notes);
    return normalizeNotes(JSON.parse(localStorage.getItem(LEGACY_NOTES_KEY)||"null"));
  }catch(e){return emptyNotes();}
}
const dayNotes=loadNotes();

function migrateUnifiedStore(){
  localStorage.setItem(UNIFIED_KEY,JSON.stringify({version:4,tracker:state,notes:dayNotes,enhancements}));
}
function persist(){writeUnifiedSection("tracker",state);}
function save(){ persist(); renderAll(); }
function completedSessionOnDay(w,dayIndex){
  return [w.training.A,w.training.B].some(session=>session.done&&Number(session.day)===dayIndex);
}
function dayIsActive(w,dayIndex){return Boolean(w.days[dayIndex].activity)||completedSessionOnDay(w,dayIndex);}
function activityCount(w){return w.days.reduce((total,_,index)=>total+Number(dayIsActive(w,index)),0);}
function completedGymCount(w){return Number(w.training.A.done)+Number(w.training.B.done);}
function completionOf(w){
  let done=0;
  w.days.forEach(d=>["breakfast","vegetables","water"].forEach(k=>{if(d[k])done++;}));
  done+=Math.min(activityCount(w),WEEKLY_ACTIVITY_TARGET);
  return done/(21+WEEKLY_ACTIVITY_TARGET);
}
function weightNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(String(v).replace(",","."));
  return Number.isFinite(n)?n:null;
}
function programWeightStats(){
  const start=state.weeks.map(week=>weightNumber(week.startWeight)).find(value=>value!==null)??null;
  const ends=state.weeks.map(week=>weightNumber(week.endWeight)).filter(value=>value!==null);
  const current=ends.length?ends[ends.length-1]:null;
  const final=weightNumber(state.weeks[11].endWeight);
  return {
    start,current,final,
    currentDelta:start!==null&&current!==null?current-start:null,
    finalDelta:start!==null&&final!==null?final-start:null
  };
}
function formatWeightDelta(delta){return delta===null?"—":`${delta>0?"+":""}${delta.toFixed(1)} кг`;}

function saveNotes(){writeUnifiedSection("notes",dayNotes);}
function escapeNote(value){
  return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function autoSizeNote(element){
  element.style.height="auto";
  element.style.height=Math.min(Math.max(element.scrollHeight,38),112)+"px";
}
function updateDayNote(dayIndex,element){
  dayNotes[currentWeek-1][dayIndex]=element.value;
  saveNotes();autoSizeNote(element);element.classList.add("saved");
  clearTimeout(element._savedTimer);
  element._savedTimer=setTimeout(()=>element.classList.remove("saved"),500);
}

function renderWeekSelect(){
  const s=document.getElementById("weekSelect");
  s.innerHTML="";
  for(let i=1;i<=12;i++){
    const o=document.createElement("option");o.value=i;o.textContent=`Тиждень ${i}`;o.selected=i===currentWeek;s.appendChild(o);
  }
}
function renderRows(){
  const tbody=document.getElementById("weekRows");
  tbody.innerHTML="";
  const w=state.weeks[currentWeek-1];
  days.forEach((day,i)=>{
    const tr=document.createElement("tr");
    if(day.recommended)tr.classList.add("workout");
    const hint=day.note||"Додати нотатку…";
    const note=dayNotes[currentWeek-1][i]||"";
    tr.innerHTML=`
      <td>${day.name}</td>
      <td>${checkHTML(i,"breakfast",w.days[i].breakfast)}</td>
      <td>${checkHTML(i,"vegetables",w.days[i].vegetables)}</td>
      <td>${checkHTML(i,"water",w.days[i].water)}</td>
      <td>${checkHTML(i,"activity",dayIsActive(w,i))}</td>
      <td class="note-cell">
        <textarea class="day-note" rows="1" maxlength="500"
          aria-label="Нотатка: ${day.name}"
          placeholder="${escapeNote(hint)}"
          oninput="updateDayNote(${i},this)">${escapeNote(note)}</textarea>
      </td>`;
    tbody.appendChild(tr);
  });
  requestAnimationFrame(()=>document.querySelectorAll(".day-note").forEach(autoSizeNote));
}
function checkHTML(i,key,on){
  const labels={breakfast:"білковий сніданок",vegetables:"овочі",water:"вода",activity:"активний день"};
  const action=on?"Виконано":"Не виконано";
  return `<button class="check ${on?'on':''}" type="button" onclick="toggleCheck(${i},'${key}')" aria-pressed="${on}" aria-label="${days[i].name}: ${labels[key]}. ${action}">✓</button>`;
}
function toggleCheck(i,key){
  const w=state.weeks[currentWeek-1];
  const d=w.days[i];
  if(key==="activity"&&completedSessionOnDay(w,i)){
    showToast("Цей день уже зараховано завершеним тренуванням A або B.");
    return;
  }
  d[key]=!d[key];
  save();
}
function renderFields(){
  const w=state.weeks[currentWeek-1];
  document.getElementById("startWeight").value=w.startWeight??"";
  document.getElementById("endWeight").value=w.endWeight??"";
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
  const weights=programWeightStats();
  document.getElementById("cardStart").textContent=weights.start!==null?weights.start.toFixed(1)+" кг":"—";
  document.getElementById("cardCurrent").textContent=weights.current!==null?weights.current.toFixed(1)+" кг":"—";
  const deltaEl=document.getElementById("cardDelta");
  deltaEl.textContent=formatWeightDelta(weights.currentDelta);
  deltaEl.style.color=weights.currentDelta!==null&&weights.currentDelta<0?"var(--green)":"var(--red)";
  document.getElementById("ringArc").style.strokeDashoffset=377*(1-pct);
  document.getElementById("ringPct").textContent=Math.round(pct*100)+"%";
}

function selectPlan(planKey){ currentPlan=planKey; renderTraining(); }
function renderTraining(){
  const w=state.weeks[currentWeek-1];
  const plan=WORKOUT_PLANS[currentPlan];
  const session=w.training[currentPlan];
  document.getElementById("trainingWeek").textContent=currentWeek;
  document.getElementById("trainingWeekStatus").textContent=`${completedGymCount(w)} / 2`;
  document.getElementById("tabA").classList.toggle("active",currentPlan==="A");
  document.getElementById("tabB").classList.toggle("active",currentPlan==="B");
  const doneExercises=session.exercises.filter(Boolean).length;
  const pct=Math.round(doneExercises/plan.exercises.length*100);
  const dayOptions=days.map((d,i)=>`<option value="${i}" ${String(session.day)===String(i)?'selected':''}>${d.name}</option>`).join("");
  const exercises=plan.exercises.map((ex,i)=>`
    <article class="exercise-card ${session.exercises[i]?'done':''}">
      <span class="exercise-check ${session.exercises[i]?'on':''}" role="img" aria-label="${session.exercises[i]?'Усі підходи виконано':'Вправа ще не завершена'}">✓</span>
      <div class="exercise-number">${String(i+1).padStart(2,'0')}</div>
      <div class="exercise-main">
        <div class="exercise-overview">
          <button class="exercise-visual" type="button" onclick="openExerciseImage('${currentPlan}',${i})" aria-label="Збільшити зображення: ${ex.name}">
            <img src="assets/exercises/${ex.image}" alt="Людина виконує вправу «${ex.name}»" width="720" height="720" loading="lazy">
            <span aria-hidden="true">⌕</span>
          </button>
          <div class="exercise-copy">
            <div class="exercise-meta"><span>${ex.tag}</span><strong>${ex.dose}</strong></div>
            <h3>${ex.name}</h3>
            <p>${ex.note}</p>
          </div>
        </div>
      </div>
    </article>`).join("");
  const guidedAction=typeof guidedWorkoutButtonLabel==="function"?guidedWorkoutButtonLabel(currentPlan):"▶ Почати тренування";
  document.getElementById("workoutPlan").innerHTML=`
    <div class="plan-toolbar">
      <div>
        <div class="plan-kicker">${plan.title} · ${plan.subtitle}</div>
        <h3>${plan.goal}</h3>
        <button class="start-workout" type="button" onclick="startGuidedWorkout('${currentPlan}')">${guidedAction}</button>
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
      <div class="session-status ${session.done?'done':''}"><span>${session.done?'Завершено':'Завершення'}</span><strong>${session.done?'Тренування зараховано ✓':'У покроковому режимі'}</strong></div>
      <div class="session-note">Перші 2 тижні тримай вагу помірною: закінчуй підхід із запасом приблизно 3–4 повторення. Коли верхня межа повторів дається чисто у двох підходах і коліна спокійні — наступного разу додай найменший крок ваги.</div>
    </div>`;
  if(typeof injectExerciseTechnique==="function")injectExerciseTechnique();
  if(typeof injectExerciseLogs==="function")injectExerciseLogs();
}
function openExerciseImage(planKey,index){
  const exercise=WORKOUT_PLANS[planKey]?.exercises?.[index];
  const dialog=document.getElementById("exerciseImageDialog");
  if(!exercise||!dialog)return;
  const image=dialog.querySelector("img");
  image.src=`assets/exercises/${exercise.image}`;
  image.alt=`Людина виконує вправу «${exercise.name}»`;
  dialog.querySelector("figcaption").textContent=exercise.name;
  if(typeof dialog.showModal==="function")dialog.showModal();
  else dialog.setAttribute("open","");
}
function closeExerciseImage(){document.getElementById("exerciseImageDialog")?.close();}
function setSessionDay(planKey,value){
  const w=state.weeks[currentWeek-1];
  const session=w.training[planKey];
  const other=planKey==="A"?"B":"A";
  const otherSession=w.training[other];
  if(value!==""&&String(otherSession.day)===String(value)){
    showToast(`Тренування ${other} вже заплановане на цей день. Залиши день відпочинку.`);
    renderTraining();return;
  }
  session.day=value;
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
  renderWeekSelect();renderRows();renderFields();renderWeekNav();renderCards();renderTraining();
  if(typeof renderEnhancements==="function")renderEnhancements();
  requestAnimationFrame(drawCharts);
}

function validateWeightInput(input){
  const value=input.value;
  const invalid=value!==""&&(!Number.isFinite(Number(value))||Number(value)<40||Number(value)>250);
  input.classList.toggle("field-error",invalid);
  input.setAttribute("aria-invalid",String(invalid));
  if(invalid)showToast("Вкажи вагу від 40 до 250 кг.");
  return !invalid;
}

document.getElementById("weekSelect").addEventListener("change",e=>{currentWeek=Number(e.target.value);renderAll();});
[
  ["startWeight","startWeight"],
  ["endWeight","endWeight"]
].forEach(([id,key])=>{
  const input=document.getElementById(id);
  input.addEventListener("input",event=>{state.weeks[currentWeek-1][key]=event.target.value;persist();});
  input.addEventListener("blur",event=>{if(validateWeightInput(event.target))renderAll();});
});
window.addEventListener("resize",()=>requestAnimationFrame(drawCharts));
