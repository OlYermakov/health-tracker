const LEGACY_ENHANCEMENTS_KEY="healthTrackerEnhancements_v2";

function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function blankExerciseLog(planKey){
  return WORKOUT_PLANS[planKey].exercises.map(()=>({weight:"",reps:""}));
}

function blankEnhancementWeek(){
  return {
    sleep:"",energy:"",activity:"",painLeft:"",painRight:"",
    logs:{A:blankExerciseLog("A"),B:blankExerciseLog("B")}
  };
}

function defaultEnhancements(){return {version:3,startDate:localISODate(),lastBackupAt:"",weeks:Array.from({length:12},blankEnhancementWeek)};}

function normalizeEnhancements(parsed){
  const clean=defaultEnhancements();
  if(!parsed||typeof parsed!=="object")return clean;
  clean.startDate=/^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate||"")?parsed.startDate:clean.startDate;
  clean.lastBackupAt=typeof parsed.lastBackupAt==="string"?parsed.lastBackupAt:"";
  clean.weeks=Array.from({length:12},(_,weekIndex)=>{
    const source=parsed.weeks?.[weekIndex]||{};
    const week=blankEnhancementWeek();
    ["sleep","energy","activity","painLeft","painRight"].forEach(key=>{
      week[key]=source[key]===null||source[key]===undefined?"":String(source[key]);
    });
    ["A","B"].forEach(planKey=>{
      week.logs[planKey]=WORKOUT_PLANS[planKey].exercises.map((_,exerciseIndex)=>{
        const log=source.logs?.[planKey]?.[exerciseIndex]||{};
        return {
          weight:log.weight===null||log.weight===undefined?"":String(log.weight),
          reps:log.reps===null||log.reps===undefined?"":String(log.reps)
        };
      });
    });
    return week;
  });
  return clean;
}

function loadEnhancements(){
  try{
    const unified=readUnifiedStore();
    if(unified?.enhancements)return normalizeEnhancements(unified.enhancements);
    return normalizeEnhancements(JSON.parse(localStorage.getItem(LEGACY_ENHANCEMENTS_KEY)||"null"));
  }
  catch(e){return defaultEnhancements();}
}

let enhancements=loadEnhancements();

function persistEnhancements(){writeUnifiedSection("enhancements",enhancements);}

function showToast(message){
  const toast=document.getElementById("appToast");
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove("show"),2600);
}

function parseProgramDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return null;
  const [year,month,day]=value.split("-").map(Number);
  const date=new Date(year,month-1,day);
  return Number.isNaN(date.getTime())?null:date;
}

function weekDates(weekNumber){
  const start=parseProgramDate(enhancements.startDate);
  if(!start)return {short:"—",long:"Дата початку не вказана"};
  const from=new Date(start);from.setDate(start.getDate()+(weekNumber-1)*7);
  const to=new Date(from);to.setDate(from.getDate()+6);
  const shortFormat=new Intl.DateTimeFormat("uk-UA",{day:"2-digit",month:"2-digit"});
  const longFormat=new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long",year:"numeric"});
  return {short:`${shortFormat.format(from)}–${shortFormat.format(to)}`,long:`${longFormat.format(from)} — ${longFormat.format(to)}`};
}

function fillNumberSelect(id,min,max){
  const select=document.getElementById(id);
  if(!select||select.options.length)return;
  select.appendChild(new Option("—",""));
  for(let value=min;value<=max;value++)select.appendChild(new Option(String(value),String(value)));
}

function activeWeek(week,index){
  const extra=enhancements.weeks[index];
  return Boolean(week.startWeight||week.endWeight||week.mood||week.days.some(day=>Object.values(day).some(Boolean))||
    ["sleep","energy","activity","painLeft","painRight"].some(key=>extra[key]!=="")||
    week.training.A.done||week.training.B.done);
}

function renderSummary(){
  const active=state.weeks.map((week,index)=>({week,index})).filter(({week,index})=>activeWeek(week,index));
  const workouts=state.weeks.reduce((sum,week)=>sum+completedGymCount(week),0);
  const average=active.length?Math.round(active.reduce((sum,item)=>sum+completionOf(item.week),0)/active.length*100):0;
  const weights=programWeightStats();
  document.getElementById("summaryWorkouts").textContent=String(workouts);
  document.getElementById("summaryCompletion").textContent=`${average}%`;
  document.getElementById("summaryWeight").textContent=formatWeightDelta(weights.finalDelta);
  document.getElementById("summaryBackup").textContent=enhancements.lastBackupAt?
    new Intl.DateTimeFormat("uk-UA",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(enhancements.lastBackupAt)):"Немає";
}

function renderWellbeing(){
  const week=enhancements.weeks[currentWeek-1];
  document.getElementById("sleepHours").value=week.sleep;
  document.getElementById("energyLevel").value=week.energy;
  document.getElementById("activityMinutes").value=week.activity;
  document.getElementById("leftKneePain").value=week.painLeft;
  document.getElementById("rightKneePain").value=week.painRight;
  const pain=Math.max(Number(week.painLeft||0),Number(week.painRight||0));
  const warning=document.getElementById("painWarning");
  warning.hidden=pain<4;
  warning.textContent=pain>=7?
    "Біль оцінено як сильний. Не тренуйся через біль; обговори стан із лікарем або фізіотерапевтом.":
    "Коліна реагують на навантаження. Зменш вагу та амплітуду і стеж, чи немає набряку, блокування або нестабільності.";
}

function updateChartSummaries(){
  const weights=state.weeks.map((week,index)=>({week:index+1,value:weightNumber(week.endWeight)})).filter(item=>item.value!==null);
  document.getElementById("weightChartSummary").textContent=weights.length?
    `Вага за заповненими тижнями: ${weights.map(item=>`тиждень ${item.week} — ${item.value.toFixed(1)} кг`).join(", ")}.`:
    "Даних про вагу поки немає.";
  const active=state.weeks.map((week,index)=>({week:index+1,pct:Math.round(completionOf(week)*100)})).filter(item=>item.pct>0);
  document.getElementById("completionChartSummary").textContent=active.length?
    `Виконання: ${active.map(item=>`тиждень ${item.week} — ${item.pct}%`).join(", ")}.`:
    "Виконання за тижнями ще не заповнене.";
}

function renderEnhancements(){
  const range=weekDates(currentWeek);
  document.getElementById("programStartDate").value=enhancements.startDate;
  document.getElementById("currentWeekRange").textContent=`Тиждень ${currentWeek}: ${range.long}`;
  document.querySelectorAll("#weekSelect option").forEach((option,index)=>{option.textContent=`Тиждень ${index+1} · ${weekDates(index+1).short}`;});
  document.querySelectorAll("#weekNav .week-btn").forEach((button,index)=>{button.title=weekDates(index+1).long;button.setAttribute("aria-label",`Тиждень ${index+1}, ${weekDates(index+1).long}`);});
  renderWellbeing();
  renderSummary();
  updateChartSummaries();
}

function updateExerciseLog(planKey,index,key,value){
  enhancements.weeks[currentWeek-1].logs[planKey][index][key]=String(value).slice(0,20);
  persistEnhancements();
}

function injectExerciseLogs(){
  const logs=enhancements.weeks[currentWeek-1].logs[currentPlan];
  document.querySelectorAll("#workoutPlan .exercise-card").forEach((card,index)=>{
    const main=card.querySelector(".exercise-main");
    const details=main?.querySelector(".technique-details");
    if(!main||main.querySelector(".exercise-log"))return;
    const wrap=document.createElement("div");
    wrap.className="exercise-log";
    const fields=[{key:"weight",label:"Вага / опір",placeholder:"напр. 20 кг"},{key:"reps",label:"Повтори / час",placeholder:"напр. 12, 12"}];
    fields.forEach(field=>{
      const label=document.createElement("label");
      label.textContent=field.label;
      const input=document.createElement("input");
      input.type="text";input.inputMode="decimal";input.maxLength=20;input.placeholder=field.placeholder;
      input.value=logs[index][field.key];
      input.setAttribute("aria-label",`${WORKOUT_PLANS[currentPlan].exercises[index].name}: ${field.label}`);
      input.addEventListener("input",event=>updateExerciseLog(currentPlan,index,field.key,event.target.value));
      label.appendChild(input);wrap.appendChild(label);
    });
    main.insertBefore(wrap,details||null);
  });
  const other=currentPlan==="A"?"B":"A";
  const otherDay=state.weeks[currentWeek-1].training[other].day;
  const daySelect=document.getElementById("sessionDay");
  if(daySelect&&otherDay!==""){
    const option=daySelect.querySelector(`option[value="${otherDay}"]`);
    if(option&&String(daySelect.value)!==String(otherDay)){
      option.disabled=true;
      option.textContent+=` · зайнято тренуванням ${other}`;
    }
  }
  document.getElementById("tabA").setAttribute("aria-selected",String(currentPlan==="A"));
  document.getElementById("tabB").setAttribute("aria-selected",String(currentPlan==="B"));
}

function exportBackup(){
  const payload={
    format:"health-tracker-backup",version:3,exportedAt:new Date().toISOString(),
    tracker:state,
    notes:dayNotes,
    enhancements
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=`health-tracker-backup-${localISODate()}.json`;link.click();
  URL.revokeObjectURL(url);
  enhancements.lastBackupAt=new Date().toISOString();persistEnhancements();renderSummary();
  showToast("Резервну копію завантажено.");
}

async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    if(payload?.format!=="health-tracker-backup"||!Array.isArray(payload?.tracker?.weeks)||payload.tracker.weeks.length!==12)throw new Error("invalid");
    const restored={
      version:3,
      tracker:normalizeState(payload.tracker),
      notes:normalizeNotes(payload.notes),
      enhancements:normalizeEnhancements(payload.enhancements)
    };
    localStorage.setItem(UNIFIED_KEY,JSON.stringify(restored));
    showToast("Копію відновлено. Оновлюю застосунок…");
    setTimeout(()=>location.reload(),700);
  }catch(e){showToast("Цей файл не є коректною резервною копією трекера.");}
}

fillNumberSelect("energyLevel",1,10);
fillNumberSelect("leftKneePain",0,10);
fillNumberSelect("rightKneePain",0,10);

document.getElementById("programStartDate").addEventListener("change",event=>{
  if(!parseProgramDate(event.target.value))return;
  enhancements.startDate=event.target.value;persistEnhancements();renderAll();
});

const wellbeingBindings={sleepHours:"sleep",energyLevel:"energy",activityMinutes:"activity",leftKneePain:"painLeft",rightKneePain:"painRight"};
Object.entries(wellbeingBindings).forEach(([id,key])=>{
  document.getElementById(id).addEventListener("change",event=>{
    enhancements.weeks[currentWeek-1][key]=event.target.value;persistEnhancements();renderWellbeing();renderSummary();
  });
});

document.getElementById("exportBackup").addEventListener("click",exportBackup);
document.getElementById("importBackup").addEventListener("click",()=>document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change",event=>{
  const [file]=event.target.files;if(file)importBackup(file);event.target.value="";
});

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}

migrateUnifiedStore();
renderMood();
renderAll();
