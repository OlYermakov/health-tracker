const LEGACY_ENHANCEMENTS_KEY="healthTrackerEnhancements_v2";
const ENHANCEMENTS_VERSION=5;
const AUTO_PAUSE_MS=5*60*1000;
const RESET_UNDO_MS=30*60*1000;

function makeId(prefix="item"){
  const random=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  return `${prefix}-${random}`;
}

function cloneData(value){return JSON.parse(JSON.stringify(value));}

function localISODate(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,"0");
  const d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function currentWeekMonday(date=new Date()){
  const monday=new Date(date);monday.setHours(0,0,0,0);
  monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  return monday;
}

function prescribedSetCount(exercise){
  const match=String(exercise?.dose||"").match(/^(\d+)\s*[×x]/i);
  return match?Math.max(1,Math.min(5,Number(match[1]))):1;
}

function blankSet(){return {weight:"",reps:"",done:false};}

function blankExerciseLog(planKey,exerciseIndex){
  const count=prescribedSetCount(WORKOUT_PLANS[planKey].exercises[exerciseIndex]);
  return {sets:Array.from({length:count},blankSet),skippedReason:""};
}

function blankPlanLogs(planKey){
  return WORKOUT_PLANS[planKey].exercises.map((_,index)=>blankExerciseLog(planKey,index));
}

function blankEnhancementWeek(){
  return {
    sleep:"",energy:"",activity:"",painLeft:"",painRight:"",waist:"",
    logs:{A:blankPlanLogs("A"),B:blankPlanLogs("B")}
  };
}

function defaultEnhancements(){
  return {
    version:ENHANCEMENTS_VERSION,
    programId:makeId("program"),
    startDate:localISODate(currentWeekMonday()),
    lastBackupAt:"",
    timerSignal:true,
    activeWorkout:null,
    history:[],
    archives:[],
    lastResetSnapshot:null,
    weeks:Array.from({length:12},blankEnhancementWeek)
  };
}

function normalizedSet(source={}){
  return {
    weight:source.weight===null||source.weight===undefined?"":String(source.weight).slice(0,20),
    reps:source.reps===null||source.reps===undefined?"":String(source.reps).slice(0,24),
    done:Boolean(source.done)
  };
}

function normalizeExerciseLog(source,planKey,exerciseIndex){
  const targetCount=prescribedSetCount(WORKOUT_PLANS[planKey].exercises[exerciseIndex]);
  if(Array.isArray(source?.sets)){
    const count=Math.max(targetCount,Math.min(5,source.sets.length));
    return {
      sets:Array.from({length:count},(_,index)=>normalizedSet(source.sets[index])),
      skippedReason:typeof source.skippedReason==="string"?source.skippedReason.slice(0,80):""
    };
  }
  const weights=String(source?.weight??"").split(/[,;\/]+/).map(value=>value.trim()).filter(Boolean);
  const reps=String(source?.reps??"").split(/[,;\/]+/).map(value=>value.trim()).filter(Boolean);
  return {
    sets:Array.from({length:targetCount},(_,index)=>normalizedSet({
      weight:weights[index]??weights[0]??"",
      reps:reps[index]??"",
      done:Boolean(source?.done)
    })),
    skippedReason:typeof source?.skippedReason==="string"?source.skippedReason.slice(0,80):""
  };
}

function normalizeActiveWorkout(source){
  if(!source||typeof source!=="object")return null;
  const week=Number(source.week),index=Number(source.index);
  const plan=source.plan==="B"?"B":"A";
  if(!Number.isInteger(week)||week<0||week>11||!Number.isInteger(index)||index<0||index>=WORKOUT_PLANS[plan].exercises.length)return null;
  return {
    week,plan,index,
    startedAt:typeof source.startedAt==="string"?source.startedAt:new Date().toISOString(),
    restUntil:typeof source.restUntil==="string"?source.restUntil:"",
    restRemainingSeconds:Math.max(0,Number(source.restRemainingSeconds)||0),
    restSignaled:Boolean(source.restSignaled),
    pausedAt:typeof source.pausedAt==="string"?source.pausedAt:"",
    pausedTotalMs:Math.max(0,Number(source.pausedTotalMs)||0),
    lastInteractionAt:typeof source.lastInteractionAt==="string"?source.lastInteractionAt:new Date().toISOString(),
    painBeforeLeft:String(source.painBeforeLeft??"").slice(0,2),
    painBeforeRight:String(source.painBeforeRight??"").slice(0,2),
    painAfterLeft:String(source.painAfterLeft??"").slice(0,2),
    painAfterRight:String(source.painAfterRight??"").slice(0,2)
  };
}

function normalizeHistoryExercise(source,planKey,index){
  const exercise=WORKOUT_PLANS[planKey].exercises[index];
  return {
    name:typeof source?.name==="string"?source.name.slice(0,140):exercise.name,
    skippedReason:typeof source?.skippedReason==="string"?source.skippedReason.slice(0,80):"",
    sets:Array.isArray(source?.sets)?source.sets.slice(0,5).map(normalizedSet):[]
  };
}

function normalizeHistoryRecord(source){
  if(!source||typeof source!=="object")return null;
  const weekIndex=Number(source.weekIndex),planKey=source.planKey==="B"?"B":"A";
  if(!Number.isInteger(weekIndex)||weekIndex<0||weekIndex>11)return null;
  const plan=WORKOUT_PLANS[planKey];
  return {
    id:typeof source.id==="string"?source.id:makeId("workout"),
    programId:typeof source.programId==="string"?source.programId:"",
    weekIndex,planKey,
    day:source.day===""?"":String(source.day??""),
    startedAt:typeof source.startedAt==="string"?source.startedAt:"",
    completedAt:typeof source.completedAt==="string"?source.completedAt:new Date().toISOString(),
    durationMinutes:String(source.durationMinutes??""),
    painBeforeLeft:String(source.painBeforeLeft??"").slice(0,2),
    painBeforeRight:String(source.painBeforeRight??"").slice(0,2),
    painAfterLeft:String(source.painAfterLeft??"").slice(0,2),
    painAfterRight:String(source.painAfterRight??"").slice(0,2),
    exercises:plan.exercises.map((_,index)=>normalizeHistoryExercise(source.exercises?.[index],planKey,index))
  };
}

function normalizeArchive(source){
  if(!source||typeof source!=="object")return null;
  return {
    id:typeof source.id==="string"?source.id:makeId("archive"),
    programId:typeof source.programId==="string"?source.programId:"",
    startDate:typeof source.startDate==="string"?source.startDate:"",
    archivedAt:typeof source.archivedAt==="string"?source.archivedAt:new Date().toISOString(),
    tracker:normalizeState(source.tracker),
    notes:normalizeNotes(source.notes),
    weeks:Array.from({length:12},(_,weekIndex)=>{
      const sourceWeek=source.weeks?.[weekIndex]||{};
      const week=blankEnhancementWeek();
      ["sleep","energy","activity","painLeft","painRight","waist"].forEach(key=>{week[key]=String(sourceWeek[key]??"");});
      ["A","B"].forEach(planKey=>{week.logs[planKey]=WORKOUT_PLANS[planKey].exercises.map((_,index)=>normalizeExerciseLog(sourceWeek.logs?.[planKey]?.[index],planKey,index));});
      return week;
    }),
    history:Array.isArray(source.history)?source.history.map(normalizeHistoryRecord).filter(Boolean):[]
  };
}

function normalizeEnhancements(parsed){
  const clean=defaultEnhancements();
  if(!parsed||typeof parsed!=="object")return clean;
  clean.programId=typeof parsed.programId==="string"&&parsed.programId?parsed.programId:clean.programId;
  clean.startDate=/^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate||"")?parsed.startDate:clean.startDate;
  clean.lastBackupAt=typeof parsed.lastBackupAt==="string"?parsed.lastBackupAt:"";
  clean.timerSignal=parsed.timerSignal!==false;
  clean.activeWorkout=normalizeActiveWorkout(parsed.activeWorkout);
  clean.history=Array.isArray(parsed.history)?parsed.history.map(normalizeHistoryRecord).filter(Boolean):[];
  clean.history.forEach(record=>{if(!record.programId)record.programId=clean.programId;});
  clean.archives=Array.isArray(parsed.archives)?parsed.archives.map(normalizeArchive).filter(Boolean):[];
  clean.lastResetSnapshot=parsed.lastResetSnapshot&&typeof parsed.lastResetSnapshot==="object"?cloneData(parsed.lastResetSnapshot):null;
  clean.weeks=Array.from({length:12},(_,weekIndex)=>{
    const source=parsed.weeks?.[weekIndex]||{};
    const week=blankEnhancementWeek();
    ["sleep","energy","activity","painLeft","painRight","waist"].forEach(key=>{
      week[key]=source[key]===null||source[key]===undefined?"":String(source[key]);
    });
    ["A","B"].forEach(planKey=>{
      week.logs[planKey]=WORKOUT_PLANS[planKey].exercises.map((_,exerciseIndex)=>
        normalizeExerciseLog(source.logs?.[planKey]?.[exerciseIndex],planKey,exerciseIndex));
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

// Older versions stored only one completion flag per exercise. Carry it into the new set log.
state.weeks.forEach((week,weekIndex)=>["A","B"].forEach(planKey=>{
  week.training[planKey].exercises.forEach((done,exerciseIndex)=>{
    if(done)enhancements.weeks[weekIndex].logs[planKey][exerciseIndex].sets.forEach(set=>{set.done=true;});
  });
}));

// Convert completed sessions from earlier versions into immutable records once.
state.weeks.forEach((week,weekIndex)=>["A","B"].forEach(planKey=>{
  const session=week.training[planKey];
  if(!session.done)return;
  const legacyId=`legacy-${enhancements.programId}-${weekIndex}-${planKey}`;
  if(enhancements.history.some(record=>record.id===legacyId))return;
  const fallbackDate=programDayDate(weekIndex,session.day)?.toISOString()||new Date().toISOString();
  enhancements.history.push({
    id:legacyId,programId:enhancements.programId,weekIndex,planKey,day:String(session.day??""),
    startedAt:"",completedAt:session.completedAt||fallbackDate,durationMinutes:String(session.durationMinutes||""),
    painBeforeLeft:"",painBeforeRight:"",painAfterLeft:"",painAfterRight:"",
    exercises:WORKOUT_PLANS[planKey].exercises.map((exercise,index)=>({
      name:exercise.name,skippedReason:enhancements.weeks[weekIndex].logs[planKey][index].skippedReason,
      sets:cloneData(enhancements.weeks[weekIndex].logs[planKey][index].sets)
    }))
  });
}));

function persistEnhancements(){writeUnifiedSection("enhancements",enhancements);}

function currentProgramHistory(){
  return enhancements.history.filter(record=>record.programId===enhancements.programId);
}

function completedTrainingRecordsForWeek(weekIndex){
  return currentProgramHistory().filter(record=>record.weekIndex===Number(weekIndex));
}

function trainingDayIsTaken(weekIndex,dayIndex,exceptPlan=""){
  const day=String(dayIndex);
  if(completedTrainingRecordsForWeek(weekIndex).some(record=>String(record.day)===day))return true;
  const training=state.weeks[weekIndex]?.training;
  return ["A","B"].some(planKey=>planKey!==exceptPlan&&String(training?.[planKey]?.day)===day);
}

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
  date.setHours(0,0,0,0);
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

function programDayDate(weekIndex,dayIndex){
  const start=parseProgramDate(enhancements.startDate);
  if(!start)return null;
  const date=new Date(start);
  date.setDate(start.getDate()+weekIndex*7+Number(dayIndex||0));
  return date;
}

function programPosition(date=new Date()){
  const start=parseProgramDate(enhancements.startDate);
  if(!start)return {status:"invalid"};
  const today=new Date(date);today.setHours(0,0,0,0);
  const diff=Math.round((today-start)/86400000);
  if(diff<0)return {status:"before",days:Math.abs(diff)};
  if(diff>=84)return {status:"after"};
  return {status:"active",weekIndex:Math.floor(diff/7),dayIndex:diff%7};
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
    ["sleep","energy","activity","painLeft","painRight","waist"].some(key=>extra[key]!=="")||
    completedTrainingRecordsForWeek(index).length);
}

function waistStats(){
  const values=enhancements.weeks.map(week=>weightNumber(week.waist)).filter(value=>value!==null);
  const start=values[0]??null;
  const current=values.length?values[values.length-1]:null;
  return {start,current,delta:start!==null&&current!==null?current-start:null};
}

function formatWaistDelta(delta){return delta===null?"—":`${delta>0?"+":""}${delta.toFixed(1)} см`;}

function renderSummary(){
  const active=state.weeks.map((week,index)=>({week,index})).filter(({week,index})=>activeWeek(week,index));
  const workouts=currentProgramHistory().length;
  const average=active.length?Math.round(active.reduce((sum,item)=>sum+completionOf(item.week),0)/active.length*100):0;
  const weights=programWeightStats();
  document.getElementById("summaryWorkouts").textContent=String(workouts);
  document.getElementById("summaryCompletion").textContent=`${average}%`;
  document.getElementById("summaryWeight").textContent=formatWeightDelta(weights.finalDelta);
  document.getElementById("summaryWaist").textContent=formatWaistDelta(waistStats().delta);
  document.getElementById("summaryBackup").textContent=enhancements.lastBackupAt?
    new Intl.DateTimeFormat("uk-UA",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(enhancements.lastBackupAt)):"Немає";
}

function renderWellbeing(){
  const week=enhancements.weeks[currentWeek-1];
  document.getElementById("sleepHours").value=week.sleep;
  document.getElementById("energyLevel").value=week.energy;
  document.getElementById("leftKneePain").value=week.painLeft;
  document.getElementById("rightKneePain").value=week.painRight;
  document.getElementById("waistCircumference").value=week.waist;
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
  renderWellbeing();renderToday();renderHistory();renderSummary();renderProgramArchive();updateChartSummaries();
}

function exerciseLog(weekIndex,planKey,exerciseIndex){
  return enhancements.weeks?.[weekIndex]?.logs?.[planKey]?.[exerciseIndex];
}

function syncExerciseCompletion(weekIndex,planKey,exerciseIndex){
  const log=exerciseLog(weekIndex,planKey,exerciseIndex);
  state.weeks[weekIndex].training[planKey].exercises[exerciseIndex]=Boolean(log?.sets?.length)&&log.sets.every(set=>set.done);
}

function updateExerciseSetValue(planKey,exerciseIndex,setIndex,key,value){
  if(!["weight","reps"].includes(key))return;
  const set=exerciseLog(currentWeek-1,planKey,exerciseIndex)?.sets?.[setIndex];
  if(!set)return;
  set[key]=String(value).slice(0,key==="weight"?20:24);persistEnhancements();
}

function updateGuidedSetValue(planKey,exerciseIndex,setIndex,key,value){
  if(enhancements.activeWorkout?.pausedAt)return;
  touchActiveWorkout();updateExerciseSetValue(planKey,exerciseIndex,setIndex,key,value);
}

function toggleExerciseSet(planKey,exerciseIndex,setIndex,fromGuided=false){
  if(fromGuided&&enhancements.activeWorkout?.pausedAt){showToast("Спочатку продовж тренування.");return;}
  const set=exerciseLog(currentWeek-1,planKey,exerciseIndex)?.sets?.[setIndex];
  if(!set)return;
  set.done=!set.done;syncExerciseCompletion(currentWeek-1,planKey,exerciseIndex);
  persistEnhancements();persist();
  if(fromGuided){touchActiveWorkout();if(set.done)startRestTimer(60);}
  renderTraining();
  if(fromGuided)renderGuidedWorkout();else renderHistory();
}

function exerciseFieldConfig(planKey,exerciseIndex){
  if(exerciseIndex===0)return {weight:"Опір / рівень",reps:"Час / дистанція",repsPlaceholder:"напр. 6 хв"};
  if(planKey==="A"&&exerciseIndex===5)return {weight:"Додаткова вага, кг",reps:"Повтори",repsPlaceholder:"напр. 12"};
  if(planKey==="A"&&exerciseIndex===6)return {weight:"Вага / опір",reps:"Повтори / сторона",repsPlaceholder:"напр. 10"};
  return {weight:"Вага, кг",reps:"Повтори",repsPlaceholder:"напр. 12"};
}

function formatSet(set,planKey="A",exerciseIndex=1){
  const weight=String(set?.weight||"").trim(),reps=String(set?.reps||"").trim();
  if(!weight&&!reps)return "—";
  if(exerciseIndex===0){
    if(weight&&reps)return `Опір ${weight} · ${reps}`;
    return weight?`Опір ${weight}`:reps;
  }
  const formattedWeight=weight&&/\bкг\b/i.test(weight)?weight:(weight?`${weight} кг`:"");
  if(formattedWeight&&reps)return `${formattedWeight} × ${reps}`;
  return formattedWeight||reps;
}

function previousExerciseResult(weekIndex,planKey,exerciseIndex){
  const recorded=currentProgramHistory()
    .filter(record=>record.planKey===planKey&&record.exercises?.[exerciseIndex]?.sets?.some(set=>set.weight||set.reps||set.done))
    .sort((a,b)=>new Date(b.completedAt).getTime()-new Date(a.completedAt).getTime())[0];
  if(recorded)return {week:recorded.weekIndex+1,date:recorded.completedAt,text:recorded.exercises[exerciseIndex].sets.map(set=>formatSet(set,planKey,exerciseIndex)).join(" · ")};
  for(let index=weekIndex-1;index>=0;index--){
    const log=exerciseLog(index,planKey,exerciseIndex);
    if(log?.sets?.some(set=>set.weight||set.reps||set.done))return {week:index+1,text:log.sets.map(set=>formatSet(set,planKey,exerciseIndex)).join(" · ")};
  }
  return null;
}

function setRowsHTML(planKey,exerciseIndex,log,guided=false){
  const fields=exerciseFieldConfig(planKey,exerciseIndex);
  return log.sets.map((set,setIndex)=>`
    <div class="set-row ${set.done?"done":""}">
      <span class="set-number">${setIndex+1}</span>
      <label><span>${fields.weight}</span><input type="text" inputmode="decimal" maxlength="20" value="${escapeNote(set.weight)}" placeholder="—" oninput="${guided?"updateGuidedSetValue":"updateExerciseSetValue"}('${planKey}',${exerciseIndex},${setIndex},'weight',this.value)"></label>
      <label><span>${fields.reps}</span><input type="text" inputmode="decimal" maxlength="24" value="${escapeNote(set.reps)}" placeholder="${fields.repsPlaceholder}" oninput="${guided?"updateGuidedSetValue":"updateExerciseSetValue"}('${planKey}',${exerciseIndex},${setIndex},'reps',this.value)"></label>
      <button class="set-done" type="button" onclick="toggleExerciseSet('${planKey}',${exerciseIndex},${setIndex},${guided})" aria-pressed="${set.done}" aria-label="Підхід ${setIndex+1}: ${set.done?"виконано":"позначити виконаним"}">✓</button>
    </div>`).join("");
}

function updateExerciseSkipReason(planKey,exerciseIndex,value){
  const log=exerciseLog(currentWeek-1,planKey,exerciseIndex);if(!log)return;
  log.skippedReason=String(value).slice(0,80);touchActiveWorkout();persistEnhancements();
}

function injectExerciseLogs(){
  const logs=enhancements.weeks[currentWeek-1].logs[currentPlan];
  document.querySelectorAll("#workoutPlan .exercise-card").forEach((card,index)=>{
    const main=card.querySelector(".exercise-main"),details=main?.querySelector(".technique-details");
    if(!main||main.querySelector(".set-log"))return;
    const previous=previousExerciseResult(currentWeek-1,currentPlan,index);
    const wrap=document.createElement("div");wrap.className="set-log";
    wrap.innerHTML=`<div class="previous-result"><span>Минулого разу</span><strong>${previous?`Тиждень ${previous.week}: ${escapeNote(previous.text)}`:"Ще немає запису"}</strong></div><div class="set-list">${setRowsHTML(currentPlan,index,logs[index])}</div>`;
    main.insertBefore(wrap,details||null);
  });
  document.getElementById("tabA").setAttribute("aria-selected",String(currentPlan==="A"));
  document.getElementById("tabB").setAttribute("aria-selected",String(currentPlan==="B"));
}

function renderToday(){
  const dateElement=document.getElementById("todayDate"),content=document.getElementById("todayContent");
  if(!dateElement||!content)return;
  dateElement.textContent=new Intl.DateTimeFormat("uk-UA",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  const position=programPosition();
  if(position.status==="before"){
    content.innerHTML=`<div class="today-empty"><strong>Програма ще не почалася</strong><span>До старту ${position.days} ${position.days===1?"день":"днів"}. За потреби зміни дату в календарі програми.</span></div>`;return;
  }
  if(position.status!=="active"){
    content.innerHTML=`<div class="today-empty"><strong>12 тижнів завершено</strong><span>Переглянь історію та підсумки нижче або встанови нову дату початку.</span></div>`;return;
  }
  const {weekIndex,dayIndex}=position,week=state.weeks[weekIndex],day=week.days[dayIndex];
  const habitItems=[["breakfast","Білковий сніданок"],["vegetables","Овочі"],["water","Вода"],["activity","Активний день"]];
  const habitButtons=habitItems.map(([key,label])=>{
    const on=key==="activity"?dayIsActive(week,dayIndex):day[key];
    return `<button class="today-habit ${on?"on":""}" type="button" onclick="toggleTodayHabit(${weekIndex},${dayIndex},'${key}')" aria-pressed="${on}"><span>${on?"✓":"○"}</span>${label}</button>`;
  }).join("");
  const completedToday=completedTrainingRecordsForWeek(weekIndex).filter(record=>Number(record.day)===dayIndex);
  const planned=["A","B"].filter(planKey=>String(week.training[planKey].day)===String(dayIndex)&&!completedToday.some(record=>record.planKey===planKey));
  const completedHTML=completedToday.map(record=>{
    const done=record.exercises.filter(exercise=>exercise.sets.length&&exercise.sets.every(set=>set.done)).length;
    return `<div class="today-workout done"><div><span>Завершено</span><strong>Тренування ${record.planKey}</strong><small>${done} / ${WORKOUT_PLANS[record.planKey].exercises.length} вправ · ${escapeNote(record.durationMinutes||"—")} хв</small></div><button type="button" onclick="openTodayWorkout(${weekIndex},'${record.planKey}',false)">Переглянути</button></div>`;
  }).join("");
  const plannedHTML=planned.map(planKey=>{
    const session=week.training[planKey],completed=session.exercises.filter(Boolean).length;
    return `<div class="today-workout"><div><span>Заплановано сьогодні</span><strong>Тренування ${planKey}</strong><small>${completed} / ${WORKOUT_PLANS[planKey].exercises.length} вправ</small></div><button type="button" onclick="openTodayWorkout(${weekIndex},'${planKey}',true)">Почати</button></div>`;
  }).join("");
  const workoutHTML=completedHTML||plannedHTML?completedHTML+plannedHTML:`<div class="today-no-workout"><span>Сьогодні тренування не заплановане.</span><button type="button" onclick="openTodayWorkout(${weekIndex},'A',false)">Відкрити програму</button></div>`;
  content.innerHTML=`<div class="today-context"><strong>${days[dayIndex].name} · тиждень ${weekIndex+1}</strong><span>Швидко відміть головне на сьогодні</span></div><div class="today-grid">${habitButtons}</div><div class="today-workouts">${workoutHTML}</div>`;
}

function toggleTodayHabit(weekIndex,dayIndex,key){
  const week=state.weeks[weekIndex];
  if(key==="activity"&&completedSessionOnDay(week,dayIndex)){showToast("Цей день уже зараховано завершеним тренуванням A або B.");return;}
  week.days[dayIndex][key]=!week.days[dayIndex][key];persist();
  if(currentWeek===weekIndex+1)renderAll();else{renderToday();renderSummary();}
}

function openTodayWorkout(weekIndex,planKey,guided){
  currentWeek=weekIndex+1;currentPlan=planKey;renderAll();
  document.getElementById("training")?.scrollIntoView({behavior:"smooth",block:"start"});
  if(guided)setTimeout(()=>startGuidedWorkout(planKey),250);
}

function trainingRecords(){
  return currentProgramHistory().map(record=>{
    const completedDate=record.completedAt?new Date(record.completedAt):programDayDate(record.weekIndex,record.day);
    const validDate=completedDate&&!Number.isNaN(completedDate.getTime())?completedDate:null;
    return {...record,date:validDate,sort:validDate?.getTime()||record.weekIndex};
  }).sort((a,b)=>b.sort-a.sort);
}

function renderHistory(){
  const list=document.getElementById("historyList"),count=document.getElementById("historyCount");if(!list||!count)return;
  const records=trainingRecords();count.textContent=`${records.length} ${records.length===1?"запис":"записів"}`;
  if(!records.length){list.innerHTML=`<div class="history-empty"><strong>Історія поки порожня</strong><span>Завершене тренування автоматично з’явиться тут разом із підходами та тривалістю.</span></div>`;return;}
  const dateFormat=new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long",year:"numeric"});
  list.innerHTML=records.map(record=>{
    const plan=WORKOUT_PLANS[record.planKey];
    const completed=record.exercises.filter(exercise=>exercise.sets.length&&exercise.sets.every(set=>set.done)).length;
    const rows=plan.exercises.map((exercise,index)=>{
      const snapshot=record.exercises[index];
      if(snapshot?.skippedReason)return `<li><span>${escapeNote(exercise.name)}</span><strong class="history-skipped">Пропущено: ${escapeNote(snapshot.skippedReason)}</strong></li>`;
      if(!snapshot?.sets?.some(set=>set.weight||set.reps||set.done))return "";
      return `<li><span>${escapeNote(exercise.name)}</span><strong>${escapeNote(snapshot.sets.map(set=>formatSet(set,record.planKey,index)).join(" · ")||"Виконано")}</strong></li>`;
    }).join("");
    const before=Math.max(Number(record.painBeforeLeft||0),Number(record.painBeforeRight||0));
    const after=Math.max(Number(record.painAfterLeft||0),Number(record.painAfterRight||0));
    const pain=(record.painBeforeLeft!==""||record.painBeforeRight!==""||record.painAfterLeft!==""||record.painAfterRight!=="")?`<span class="${after>=4?"pain-high":""}">Коліна: ${before}/10 → ${after}/10</span>`:"";
    return `<article class="history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>Тренування ${record.planKey}</h3></div><div class="history-metrics"><span>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"час не записано"}</span><span>${completed} / ${plan.exercises.length} вправ</span>${pain}</div></div><details><summary>Показати результати</summary><ul>${rows||"<li><span>Результати підходів не записані</span></li>"}</ul></details><button class="history-open" type="button" onclick="openHistorySession(${record.weekIndex},'${record.planKey}')">Відкрити тиждень ${record.weekIndex+1}</button></article>`;
  }).join("");
}

function openHistorySession(weekIndex,planKey){
  currentWeek=weekIndex+1;currentPlan=planKey;renderAll();document.getElementById("training")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function guidedWorkoutButtonLabel(planKey){
  const active=enhancements.activeWorkout;
  if(active&&active.week===currentWeek-1&&active.plan===planKey)return active.pausedAt?"▶ Продовжити з паузи":"▶ Продовжити тренування";
  return state.weeks[currentWeek-1].training[planKey].done?"＋ Повторити тренування":"▶ Почати тренування";
}

function startGuidedWorkout(planKey){
  currentPlan=planKey;
  const session=state.weeks[currentWeek-1].training[planKey],existing=enhancements.activeWorkout;
  if(existing&&(existing.week!==currentWeek-1||existing.plan!==planKey)){
    currentWeek=existing.week+1;currentPlan=existing.plan;renderAll();renderGuidedWorkout();
    const existingDialog=document.getElementById("guidedWorkoutDialog");document.body.classList.add("guided-open");
    if(existingDialog&&!existingDialog.open){if(typeof existingDialog.showModal==="function")existingDialog.showModal();else existingDialog.setAttribute("open","");}
    showToast(`Спочатку заверши або скинь тренування ${existing.plan}.`);return;
  }
  if(!existing||existing.week!==currentWeek-1||existing.plan!==planKey){
    if(session.done){
      session.done=false;session.completedAt="";session.durationMinutes="";session.day="";
      session.exercises=session.exercises.map(()=>false);
      enhancements.weeks[currentWeek-1].logs[planKey].forEach(log=>log.sets.forEach(set=>{set.done=false;}));
    }
    const firstIncomplete=session.exercises.findIndex(done=>!done);
    const now=new Date().toISOString();
    enhancements.activeWorkout={
      week:currentWeek-1,plan:planKey,index:firstIncomplete<0?0:firstIncomplete,startedAt:now,restUntil:"",restRemainingSeconds:0,
      restSignaled:false,pausedAt:"",pausedTotalMs:0,lastInteractionAt:now,
      painBeforeLeft:"",painBeforeRight:"",painAfterLeft:"",painAfterRight:""
    };
  }
  touchActiveWorkout();persistEnhancements();persist();renderGuidedWorkout();
  const dialog=document.getElementById("guidedWorkoutDialog");document.body.classList.add("guided-open");
  if(dialog&&!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
  ensureGuidedTimer();
}

function guidedDayOptions(planKey){
  const week=state.weeks[currentWeek-1],session=week.training[planKey];
  return `<option value="">Обери день</option>`+days.map((day,index)=>{
    const occupied=trainingDayIsTaken(currentWeek-1,index,planKey)&&String(session.day)!==String(index);
    return `<option value="${index}" ${String(session.day)===String(index)?"selected":""} ${occupied?"disabled":""}>${day.name}${occupied?" · вже є тренування":""}</option>`;
  }).join("");
}

function painOptions(value){
  return `<option value="">—</option>`+Array.from({length:11},(_,index)=>`<option value="${index}" ${String(value)===String(index)?"selected":""}>${index}</option>`).join("");
}

function skipReasonOptions(value){
  const choices=["","Біль у коліні","Інший дискомфорт","Тренажер зайнятий","Немає часу","Інше"];
  return choices.map(choice=>`<option value="${escapeNote(choice)}" ${choice===value?"selected":""}>${choice||"Не пропущено"}</option>`).join("");
}

function recentResetAvailable(active=enhancements.activeWorkout){
  const snapshot=enhancements.lastResetSnapshot,created=snapshot?.createdAt?new Date(snapshot.createdAt).getTime():0;
  return Boolean(active&&snapshot&&snapshot.programId===enhancements.programId&&snapshot.week===active.week&&snapshot.plan===active.plan&&Date.now()-created<RESET_UNDO_MS);
}

function renderGuidedWorkout(){
  const active=enhancements.activeWorkout,content=document.getElementById("guidedWorkoutContent");if(!active||!content)return;
  if(currentWeek!==active.week+1)currentWeek=active.week+1;currentPlan=active.plan;
  const plan=WORKOUT_PLANS[active.plan],exercise=plan.exercises[active.index],log=exerciseLog(active.week,active.plan,active.index);
  const technique=EXERCISE_TECHNIQUE?.[active.plan]?.[active.index],previous=previousExerciseResult(active.week,active.plan,active.index);
  const completed=state.weeks[active.week].training[active.plan].exercises.filter(Boolean).length;
  const paused=Boolean(active.pausedAt);
  const painBefore=Math.max(Number(active.painBeforeLeft||0),Number(active.painBeforeRight||0));
  const painAfter=Math.max(Number(active.painAfterLeft||0),Number(active.painAfterRight||0));
  const painWarning=Math.max(painBefore,painAfter)>=4?`<div class="guided-pain-warning">${Math.max(painBefore,painAfter)>=7?"Сильний біль: припини навантаження та обговори стан із лікарем або фізіотерапевтом.":"Коліна реагують на навантаження: зменш вагу й амплітуду або пропусти вправу."}</div>`:"";
  document.getElementById("guidedPlanLabel").textContent=`${plan.title} · тиждень ${active.week+1}`;
  document.getElementById("guidedProgress").textContent=`${active.index+1} / ${plan.exercises.length}`;
  const pauseButton=document.getElementById("guidedPauseButton");
  if(pauseButton){pauseButton.textContent=paused?"▶ Продовжити":"Ⅱ Пауза";pauseButton.setAttribute("aria-pressed",String(paused));}
  document.getElementById("guidedWorkoutDialog")?.classList.toggle("is-paused",paused);
  content.innerHTML=`
    <div class="guided-progress-track"><i style="width:${Math.round((active.index+1)/plan.exercises.length*100)}%"></i></div>
    ${paused?`<div class="guided-pause-banner"><div><strong>Тренування на паузі</strong><span>Час паузи не потрапить у тривалість. Таймер відпочинку також зупинено.</span></div><button type="button" onclick="resumeGuidedWorkout()">Продовжити</button></div>`:""}
    <div class="guided-paused-body" ${paused?"inert":""}>
    <div class="guided-layout"><div class="guided-visual"><img src="assets/exercises/${exercise.image}" alt="Людина виконує вправу «${escapeNote(exercise.name)}»" width="720" height="720"></div><div class="guided-copy"><div class="exercise-meta"><span>${escapeNote(exercise.tag)}</span><strong>${escapeNote(exercise.dose)}</strong></div><h2>${escapeNote(exercise.name)}</h2><p>${escapeNote(exercise.note)}</p><div class="guided-technique"><strong>Підготовка</strong><span>${escapeNote(technique?.setup||"")}</span>${technique?.steps?.[0]?`<small>Перший крок: ${escapeNote(technique.steps[0])}</small>`:""}</div><div class="previous-result guided-previous"><span>Минулого разу</span><strong>${previous?`Тиждень ${previous.week}: ${escapeNote(previous.text)}`:"Ще немає запису"}</strong></div></div></div>
    <div class="guided-sets"><div class="guided-section-title"><strong>Підходи</strong><span>${completed} / ${plan.exercises.length} вправ завершено</span></div>${setRowsHTML(active.plan,active.index,log,true)}<label class="guided-skip"><span>Якщо вправу пропущено — причина</span><select onchange="updateExerciseSkipReason('${active.plan}',${active.index},this.value)">${skipReasonOptions(log.skippedReason)}</select></label></div>
    <div class="guided-rest"><div><span>Відпочинок</span><strong id="restTimerDisplay">Готовий до наступного підходу</strong></div><div><button type="button" onclick="startRestTimer(60)">1:00</button><button type="button" onclick="startRestTimer(90)">1:30</button><button type="button" onclick="startRestTimer(120)">2:00</button><button class="timer-signal ${enhancements.timerSignal?"on":""}" type="button" onclick="toggleTimerSignal()" aria-pressed="${enhancements.timerSignal}">🔔 Сигнал</button><button class="rest-skip" type="button" onclick="skipRestTimer()">Пропустити</button></div></div>
    <div class="guided-pain"><div><strong>Коліна до і після тренування</strong><span>0 — болю немає, 10 — найсильніший біль</span></div><div class="guided-pain-grid"><label>Ліве · до<select onchange="updateGuidedPain('painBeforeLeft',this.value)">${painOptions(active.painBeforeLeft)}</select></label><label>Праве · до<select onchange="updateGuidedPain('painBeforeRight',this.value)">${painOptions(active.painBeforeRight)}</select></label><label>Ліве · після<select onchange="updateGuidedPain('painAfterLeft',this.value)">${painOptions(active.painAfterLeft)}</select></label><label>Праве · після<select onchange="updateGuidedPain('painAfterRight',this.value)">${painOptions(active.painAfterRight)}</select></label></div>${painWarning}</div>
    <div class="guided-day"><label for="guidedSessionDay">День тренування</label><select id="guidedSessionDay" onchange="setGuidedDay(this.value)">${guidedDayOptions(active.plan)}</select></div>
    <div class="guided-reset-panel"><div><strong>Почати заново?</strong><small>Перезапуск збереже вагу, повтори та вибраний день. Історія завершених спроб не видаляється.</small></div><div class="guided-reset-buttons">${recentResetAvailable(active)?`<button class="guided-undo" type="button" onclick="undoWorkoutReset()">↶ Відновити</button>`:""}<button type="button" onclick="restartGuidedWorkout(false)">↻ Перезапустити</button><details class="guided-danger-menu"><summary aria-label="Додаткові дії з тренуванням">⋯</summary><div class="guided-danger-popover"><strong>Очищення чернетки</strong><button class="guided-reset-all" type="button" onclick="restartGuidedWorkout(true)">Скинути повністю</button></div></details></div></div>
    <footer class="guided-actions"><button type="button" onclick="guidedNavigate(-1)" ${active.index===0?"disabled":""}>← Попередня</button>${active.index<plan.exercises.length-1?`<button class="guided-next" type="button" onclick="guidedNavigate(1)">Наступна →</button>`:`<button class="guided-finish" type="button" onclick="finishGuidedWorkout()">Завершити тренування</button>`}</footer>
    </div>`;
  updateRestTimer();
}

function setGuidedDay(value){const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;touchActiveWorkout();setSessionDay(active.plan,value);renderGuidedWorkout();}

function updateGuidedPain(key,value){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt||!["painBeforeLeft","painBeforeRight","painAfterLeft","painAfterRight"].includes(key))return;
  active[key]=value;touchActiveWorkout();persistEnhancements();renderGuidedWorkout();
}

function guidedNavigate(delta){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;
  active.index=Math.max(0,Math.min(WORKOUT_PLANS[active.plan].exercises.length-1,active.index+delta));touchActiveWorkout();persistEnhancements();renderGuidedWorkout();
  document.querySelector(".guided-shell")?.scrollTo({top:0,behavior:"smooth"});
}

function activeWorkoutMinutes(active=enhancements.activeWorkout){
  const started=active?.startedAt?new Date(active.startedAt).getTime():NaN;
  const currentPause=active?.pausedAt?Math.max(0,Date.now()-new Date(active.pausedAt).getTime()):0;
  return Number.isFinite(started)?Math.max(1,Math.round((Date.now()-started-Number(active.pausedTotalMs||0)-currentPause)/60000)):"";
}

function touchActiveWorkout(){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;
  active.lastInteractionAt=new Date().toISOString();
  clearTimeout(touchActiveWorkout.timer);touchActiveWorkout.timer=setTimeout(persistEnhancements,400);
}

function pauseGuidedWorkout(auto=false){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;
  const now=Date.now();
  if(active.restUntil){active.restRemainingSeconds=Math.max(0,Math.ceil((new Date(active.restUntil).getTime()-now)/1000));active.restUntil="";}
  active.pausedAt=new Date(now).toISOString();persistEnhancements();renderGuidedWorkout();
  if(auto)showToast("Тренування автоматично поставлено на паузу через бездіяльність.");
}

function resumeGuidedWorkout(){
  const active=enhancements.activeWorkout;if(!active||!active.pausedAt)return;
  const now=Date.now(),pausedAt=new Date(active.pausedAt).getTime();
  active.pausedTotalMs=Number(active.pausedTotalMs||0)+Math.max(0,now-pausedAt);active.pausedAt="";
  if(active.restRemainingSeconds>0){active.restUntil=new Date(now+active.restRemainingSeconds*1000).toISOString();active.restRemainingSeconds=0;active.restSignaled=false;}
  active.lastInteractionAt=new Date(now).toISOString();persistEnhancements();renderGuidedWorkout();ensureGuidedTimer();
}

function toggleGuidedPause(){enhancements.activeWorkout?.pausedAt?resumeGuidedWorkout():pauseGuidedWorkout(false);}

function autoPauseIfIdle(){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;
  const last=new Date(active.lastInteractionAt||active.startedAt).getTime();
  if(Number.isFinite(last)&&Date.now()-last>=AUTO_PAUSE_MS)pauseGuidedWorkout(true);
}

function restartGuidedWorkout(clearAll=false){
  const active=enhancements.activeWorkout;if(!active)return;
  const message=clearAll?
    "Буде очищено вагу, повтори, причини пропуску, позначки та вибраний день у поточній чернетці. Завершена історія залишиться, а очищення можна скасувати протягом 30 хвилин. Продовжити?":
    "Виконані підходи, таймер і тривалість буде скинуто. Вага, повтори та вибраний день залишаться. Перезапустити тренування?";
  if(!window.confirm(message))return;
  const session=state.weeks[active.week].training[active.plan];
  if(clearAll)enhancements.lastResetSnapshot={
    createdAt:new Date().toISOString(),programId:enhancements.programId,week:active.week,plan:active.plan,
    session:cloneData(session),log:cloneData(enhancements.weeks[active.week].logs[active.plan]),activeWorkout:cloneData(active)
  };
  session.exercises=session.exercises.map(()=>false);
  session.done=false;session.completedAt="";session.durationMinutes="";
  if(clearAll)session.day="";
  enhancements.weeks[active.week].logs[active.plan].forEach(log=>{
    log.skippedReason="";log.sets.forEach(set=>{set.done=false;if(clearAll){set.weight="";set.reps="";}});
  });
  const now=new Date().toISOString();
  active.index=0;active.startedAt=now;active.restUntil="";active.restRemainingSeconds=0;active.restSignaled=false;
  active.pausedAt="";active.pausedTotalMs=0;active.lastInteractionAt=now;
  active.painBeforeLeft="";active.painBeforeRight="";active.painAfterLeft="";active.painAfterRight="";
  persistEnhancements();persist();renderAll();renderGuidedWorkout();
  showToast(clearAll?"Чернетку очищено. Її можна відновити протягом 30 хвилин.":"Тренування перезапущено.");
}

function undoWorkoutReset(){
  const snapshot=enhancements.lastResetSnapshot,active=enhancements.activeWorkout;
  if(!recentResetAvailable(active)){showToast("Час відновлення минув.");return;}
  state.weeks[snapshot.week].training[snapshot.plan]=normalizeSession(snapshot.session,snapshot.plan);
  enhancements.weeks[snapshot.week].logs[snapshot.plan]=WORKOUT_PLANS[snapshot.plan].exercises.map((_,index)=>normalizeExerciseLog(snapshot.log?.[index],snapshot.plan,index));
  enhancements.activeWorkout=normalizeActiveWorkout(snapshot.activeWorkout);enhancements.lastResetSnapshot=null;
  persistEnhancements();persist();renderAll();renderGuidedWorkout();showToast("Дані до скидання відновлено.");
}

function finishGuidedWorkout(){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt){showToast("Продовж тренування перед завершенням.");return;}
  const session=state.weeks[active.week].training[active.plan];
  if(session.day===""){showToast("Обери день тренування перед завершенням.");document.getElementById("guidedSessionDay")?.focus();return;}
  session.exercises.forEach((_,index)=>syncExerciseCompletion(active.week,active.plan,index));
  const completed=session.exercises.filter(Boolean).length;
  if(completed<MIN_EXERCISES_TO_COMPLETE){showToast(`Заверши щонайменше ${MIN_EXERCISES_TO_COMPLETE} вправи.`);return;}
  if(trainingDayIsTaken(active.week,session.day,active.plan)){showToast("На цей день уже записане інше тренування.");return;}
  const completedAt=new Date().toISOString(),durationMinutes=activeWorkoutMinutes(active);
  session.done=true;session.completedAt=completedAt;session.durationMinutes=durationMinutes;
  enhancements.history.push({
    id:makeId("workout"),programId:enhancements.programId,weekIndex:active.week,planKey:active.plan,day:String(session.day),
    startedAt:active.startedAt,completedAt,durationMinutes:String(durationMinutes),
    painBeforeLeft:active.painBeforeLeft,painBeforeRight:active.painBeforeRight,painAfterLeft:active.painAfterLeft,painAfterRight:active.painAfterRight,
    exercises:WORKOUT_PLANS[active.plan].exercises.map((exercise,index)=>({name:exercise.name,...cloneData(exerciseLog(active.week,active.plan,index))}))
  });
  enhancements.activeWorkout=null;persistEnhancements();persist();closeGuidedWorkout();renderAll();showToast("Тренування збережено в історії.");
}

let guidedTimerInterval=null;
let guidedAudioContext=null;

function ensureGuidedTimer(){if(!guidedTimerInterval)guidedTimerInterval=setInterval(()=>{autoPauseIfIdle();updateRestTimer();},1000);}

function prepareTimerAudio(){
  if(!enhancements.timerSignal)return;
  try{guidedAudioContext=guidedAudioContext||new (window.AudioContext||window.webkitAudioContext)();guidedAudioContext.resume?.();}catch(e){}
}

function playTimerSignal(){
  if(!enhancements.timerSignal)return;
  try{
    prepareTimerAudio();const oscillator=guidedAudioContext.createOscillator(),gain=guidedAudioContext.createGain(),now=guidedAudioContext.currentTime;
    oscillator.frequency.setValueAtTime(880,now);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.18,now+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+.35);
    oscillator.connect(gain).connect(guidedAudioContext.destination);oscillator.start(now);oscillator.stop(now+.36);
  }catch(e){}
  navigator.vibrate?.([180,90,180]);
}

function startRestTimer(seconds){
  const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;
  prepareTimerAudio();touchActiveWorkout();active.restUntil=new Date(Date.now()+seconds*1000).toISOString();active.restRemainingSeconds=0;active.restSignaled=false;persistEnhancements();ensureGuidedTimer();updateRestTimer();
}

function skipRestTimer(){const active=enhancements.activeWorkout;if(!active||active.pausedAt)return;touchActiveWorkout();active.restUntil="";active.restRemainingSeconds=0;active.restSignaled=false;persistEnhancements();updateRestTimer();}

function toggleTimerSignal(){enhancements.timerSignal=!enhancements.timerSignal;if(enhancements.timerSignal)prepareTimerAudio();persistEnhancements();renderGuidedWorkout();}

function updateRestTimer(){
  const display=document.getElementById("restTimerDisplay"),active=enhancements.activeWorkout;if(!display||!active)return;
  const remaining=active.pausedAt?Number(active.restRemainingSeconds||0):(active.restUntil?Math.max(0,Math.ceil((new Date(active.restUntil).getTime()-Date.now())/1000)):0);
  display.closest(".guided-rest")?.classList.toggle("running",remaining>0);
  if(!remaining){
    if(active.restUntil&&!active.restSignaled){active.restSignaled=true;playTimerSignal();persistEnhancements();}
    display.textContent=active.restUntil?"Відпочинок завершено":"Готовий до наступного підходу";return;
  }
  display.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`;
}

function closeGuidedWorkout(){
  if(enhancements.activeWorkout&&!enhancements.activeWorkout.pausedAt)pauseGuidedWorkout(false);
  const dialog=document.getElementById("guidedWorkoutDialog");
  if(dialog?.open&&typeof dialog.close==="function")dialog.close();else dialog?.removeAttribute("open");
  document.body.classList.remove("guided-open");renderTraining();
}

function renderProgramArchive(){
  const status=document.getElementById("programArchiveStatus"),list=document.getElementById("programArchiveList");
  if(!status||!list)return;
  const currentCount=currentProgramHistory().length;
  status.textContent=`Поточна програма: ${currentCount} ${currentCount===1?"тренування":"тренувань"}. Архівів: ${enhancements.archives.length}.`;
  if(!enhancements.archives.length){list.innerHTML="";return;}
  const dateFormat=new Intl.DateTimeFormat("uk-UA",{day:"2-digit",month:"2-digit",year:"numeric"});
  list.innerHTML=`<details class="program-archive-details"><summary>Переглянути завершені програми (${enhancements.archives.length})</summary><div class="program-archive-list">${enhancements.archives.slice().reverse().map(archive=>{
    const workouts=archive.history?.length||0;
    const start=parseProgramDate(archive.startDate),end=start?new Date(start):null;if(end)end.setDate(end.getDate()+83);
    const startWeight=archive.tracker?.weeks?.map(week=>weightNumber(week.startWeight)).find(value=>value!==null)??null;
    const endWeights=archive.tracker?.weeks?.map(week=>weightNumber(week.endWeight)).filter(value=>value!==null)||[];
    const delta=startWeight!==null&&endWeights.length?endWeights[endWeights.length-1]-startWeight:null;
    return `<article><div><strong>${start?dateFormat.format(start):"Без дати"}${end?` — ${dateFormat.format(end)}`:""}</strong><span>Архівовано ${dateFormat.format(new Date(archive.archivedAt))}</span></div><div><b>${workouts} тренувань</b><span>${delta===null?"Вага: —":`Вага: ${delta>0?"+":""}${delta.toFixed(1)} кг`}</span></div></article>`;
  }).join("")}</div></details>`;
}

function archiveCurrentProgram(){
  if(!window.confirm("Поточні 12 тижнів буде перенесено в архів, після чого відкриється нова порожня програма. Резервна історія залишиться доступною. Продовжити?"))return;
  const programHistory=cloneData(currentProgramHistory());
  enhancements.archives.push({
    id:makeId("archive"),programId:enhancements.programId,startDate:enhancements.startDate,archivedAt:new Date().toISOString(),
    tracker:cloneData(state),notes:cloneData(dayNotes),weeks:cloneData(enhancements.weeks),history:programHistory
  });
  state=defaultState();dayNotes=emptyNotes();currentWeek=1;currentPlan="A";
  enhancements.programId=makeId("program");enhancements.startDate=localISODate(currentWeekMonday());
  enhancements.weeks=Array.from({length:12},blankEnhancementWeek);enhancements.activeWorkout=null;enhancements.lastResetSnapshot=null;
  migrateUnifiedStore();closeGuidedWorkout();renderAll();window.scrollTo({top:0,behavior:"smooth"});showToast("Програму архівовано. Нова 12-тижнева програма готова.");
}

function exportBackup(){
  const payload={format:"health-tracker-backup",version:ENHANCEMENTS_VERSION,exportedAt:new Date().toISOString(),tracker:state,notes:dayNotes,enhancements};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`health-tracker-backup-${localISODate()}.json`;link.click();URL.revokeObjectURL(url);
  enhancements.lastBackupAt=new Date().toISOString();persistEnhancements();renderSummary();showToast("Резервну копію завантажено.");
}

async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    if(payload?.format!=="health-tracker-backup"||!Array.isArray(payload?.tracker?.weeks)||payload.tracker.weeks.length!==12)throw new Error("invalid");
    const restored={version:ENHANCEMENTS_VERSION,tracker:normalizeState(payload.tracker),notes:normalizeNotes(payload.notes),enhancements:normalizeEnhancements(payload.enhancements)};
    localStorage.setItem(UNIFIED_KEY,JSON.stringify(restored));showToast("Копію відновлено. Оновлюю застосунок…");setTimeout(()=>location.reload(),700);
  }catch(e){showToast("Цей файл не є коректною резервною копією трекера.");}
}

fillNumberSelect("energyLevel",1,10);fillNumberSelect("leftKneePain",0,10);fillNumberSelect("rightKneePain",0,10);

document.getElementById("programStartDate").addEventListener("change",event=>{
  if(!parseProgramDate(event.target.value))return;enhancements.startDate=event.target.value;persistEnhancements();renderAll();
});

const wellbeingBindings={sleepHours:"sleep",energyLevel:"energy",leftKneePain:"painLeft",rightKneePain:"painRight"};
Object.entries(wellbeingBindings).forEach(([id,key])=>{
  document.getElementById(id).addEventListener("change",event=>{
    enhancements.weeks[currentWeek-1][key]=event.target.value;persistEnhancements();renderWellbeing();renderSummary();
  });
});

document.getElementById("waistCircumference").addEventListener("input",event=>{
  enhancements.weeks[currentWeek-1].waist=event.target.value;persistEnhancements();
});
document.getElementById("waistCircumference").addEventListener("blur",event=>{
  const value=event.target.value,valid=value===""||(Number.isFinite(Number(value))&&Number(value)>=40&&Number(value)<=200);
  event.target.classList.toggle("field-error",!valid);event.target.setAttribute("aria-invalid",String(!valid));
  if(!valid)showToast("Вкажи обхват талії від 40 до 200 см.");else renderAll();
});

document.getElementById("exportBackup").addEventListener("click",exportBackup);
document.getElementById("importBackup").addEventListener("click",()=>document.getElementById("backupFile").click());
document.getElementById("backupFile").addEventListener("change",event=>{const [file]=event.target.files;if(file)importBackup(file);event.target.value="";});
const guidedDialog=document.getElementById("guidedWorkoutDialog");
guidedDialog.addEventListener("cancel",event=>{event.preventDefault();closeGuidedWorkout();});
guidedDialog.addEventListener("close",()=>document.body.classList.remove("guided-open"));
guidedDialog.addEventListener("pointerdown",touchActiveWorkout,{passive:true});
guidedDialog.addEventListener("input",touchActiveWorkout,{passive:true});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")autoPauseIfIdle();});

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}

migrateUnifiedStore();renderAll();
