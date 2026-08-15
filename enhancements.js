const LEGACY_ENHANCEMENTS_KEY="healthTrackerEnhancements_v2";
const ENHANCEMENTS_VERSION=8;
const AUTO_PAUSE_MS=5*60*1000;
const RESET_UNDO_MS=30*60*1000;
const HISTORY_UNDO_MS=30*60*1000;

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

function blankDailyWellbeing(){return {sleep:"",energy:"",painLeft:"",painRight:""};}

function normalizeDailyWellbeing(source={}){
  return {
    sleep:source.sleep===null||source.sleep===undefined?"":String(source.sleep).slice(0,5),
    energy:source.energy===null||source.energy===undefined?"":String(source.energy).slice(0,2),
    painLeft:source.painLeft===null||source.painLeft===undefined?"":String(source.painLeft).slice(0,2),
    painRight:source.painRight===null||source.painRight===undefined?"":String(source.painRight).slice(0,2)
  };
}

function blankEnhancementWeek(){
  return {
    sleep:"",energy:"",activity:"",painLeft:"",painRight:"",waist:"",
    dailyWellbeing:Array.from({length:7},blankDailyWellbeing),
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
    poolDraft:null,
    history:[],
    archives:[],
    lastResetSnapshot:null,
    lastHistoryChangeSnapshot:null,
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

function normalizePoolDraft(source){
  if(!source||typeof source!=="object")return null;
  const week=Number(source.week);
  if(!Number.isInteger(week)||week<0||week>11)return null;
  return {
    week,
    day:source.day===""?"":String(source.day??""),
    replacesPlan:["A","B"].includes(source.replacesPlan)?source.replacesPlan:"",
    durationMinutes:String(source.durationMinutes??"").slice(0,3),
    distanceMeters:String(source.distanceMeters??"").slice(0,5),
    swimStyle:["crawl","backstroke","aqua","mixed","other"].includes(source.swimStyle)?source.swimStyle:"",
    intensity:["easy","moderate","hard"].includes(source.intensity)?source.intensity:"",
    painBeforeLeft:String(source.painBeforeLeft??"").slice(0,2),
    painBeforeRight:String(source.painBeforeRight??"").slice(0,2),
    painAfterLeft:String(source.painAfterLeft??"").slice(0,2),
    painAfterRight:String(source.painAfterRight??"").slice(0,2),
    notes:String(source.notes??"").slice(0,500)
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
  const weekIndex=Number(source.weekIndex);
  if(!Number.isInteger(weekIndex)||weekIndex<0||weekIndex>11)return null;
  const kind=source.kind==="pool"||source.activityType==="pool"||source.planKey==="POOL"?"pool":"gym";
  const planKey=kind==="pool"?"POOL":(source.planKey==="B"?"B":"A");
  const plan=kind==="gym"?WORKOUT_PLANS[planKey]:null;
  return {
    id:typeof source.id==="string"?source.id:makeId("workout"),
    programId:typeof source.programId==="string"?source.programId:"",
    weekIndex,kind,planKey,
    day:source.day===""?"":String(source.day??""),
    startedAt:typeof source.startedAt==="string"?source.startedAt:"",
    completedAt:typeof source.completedAt==="string"?source.completedAt:new Date().toISOString(),
    performedDate:/^\d{4}-\d{2}-\d{2}$/.test(source.performedDate||"")?source.performedDate:"",
    durationMinutes:String(source.durationMinutes??""),
    painBeforeLeft:String(source.painBeforeLeft??"").slice(0,2),
    painBeforeRight:String(source.painBeforeRight??"").slice(0,2),
    painAfterLeft:String(source.painAfterLeft??"").slice(0,2),
    painAfterRight:String(source.painAfterRight??"").slice(0,2),
    replacesPlan:["A","B"].includes(source.replacesPlan)?source.replacesPlan:"",
    distanceMeters:String(source.distanceMeters??"").slice(0,5),
    swimStyle:["crawl","backstroke","aqua","mixed","other"].includes(source.swimStyle)?source.swimStyle:"",
    intensity:["easy","moderate","hard"].includes(source.intensity)?source.intensity:"",
    notes:String(source.notes??"").slice(0,500),
    exercises:plan?plan.exercises.map((_,index)=>normalizeHistoryExercise(source.exercises?.[index],planKey,index)):[]
  };
}

function normalizeArchive(source){
  if(!source||typeof source!=="object")return null;
  const archive={
    id:typeof source.id==="string"?source.id:makeId("archive"),
    programId:typeof source.programId==="string"?source.programId:"",
    startDate:normalizeProgramStartValue(source.startDate)||"",
    archivedAt:typeof source.archivedAt==="string"?source.archivedAt:new Date().toISOString(),
    tracker:normalizeState(source.tracker),
    notes:normalizeNotes(source.notes),
    weeks:Array.from({length:12},(_,weekIndex)=>{
      const sourceWeek=source.weeks?.[weekIndex]||{};
      const week=blankEnhancementWeek();
      ["sleep","energy","activity","painLeft","painRight","waist"].forEach(key=>{week[key]=String(sourceWeek[key]??"");});
      week.dailyWellbeing=Array.from({length:7},(_,dayIndex)=>normalizeDailyWellbeing(sourceWeek.dailyWellbeing?.[dayIndex]));
      ["A","B"].forEach(planKey=>{week.logs[planKey]=WORKOUT_PLANS[planKey].exercises.map((_,index)=>normalizeExerciseLog(sourceWeek.logs?.[planKey]?.[index],planKey,index));});
      return week;
    }),
    history:Array.isArray(source.history)?source.history.map(normalizeHistoryRecord).filter(Boolean):[]
  };
  archive.history.forEach(record=>{
    if(!record.programId)record.programId=archive.programId;
    if(!record.performedDate){
      const date=dateForProgramDay(archive.startDate,record.weekIndex,record.day);
      if(date)record.performedDate=localISODate(date);
    }
  });
  archive.history=dedupeHistoryRecords(archive.history);
  return archive;
}

function normalizeEnhancements(parsed){
  const clean=defaultEnhancements();
  if(!parsed||typeof parsed!=="object")return clean;
  clean.programId=typeof parsed.programId==="string"&&parsed.programId?parsed.programId:clean.programId;
  clean.startDate=normalizeProgramStartValue(parsed.startDate)||clean.startDate;
  clean.lastBackupAt=typeof parsed.lastBackupAt==="string"?parsed.lastBackupAt:"";
  clean.timerSignal=parsed.timerSignal!==false;
  clean.activeWorkout=normalizeActiveWorkout(parsed.activeWorkout);
  clean.poolDraft=normalizePoolDraft(parsed.poolDraft);
  clean.history=Array.isArray(parsed.history)?parsed.history.map(normalizeHistoryRecord).filter(Boolean):[];
  clean.history.forEach(record=>{
    if(!record.programId)record.programId=clean.programId;
    if(!record.performedDate){
      const date=dateForProgramDay(clean.startDate,record.weekIndex,record.day);
      if(date)record.performedDate=localISODate(date);
    }
  });
  clean.history=dedupeHistoryRecords(clean.history);
  clean.archives=Array.isArray(parsed.archives)?parsed.archives.map(normalizeArchive).filter(Boolean):[];
  clean.lastResetSnapshot=parsed.lastResetSnapshot&&typeof parsed.lastResetSnapshot==="object"?cloneData(parsed.lastResetSnapshot):null;
  clean.lastHistoryChangeSnapshot=parsed.lastHistoryChangeSnapshot&&typeof parsed.lastHistoryChangeSnapshot==="object"?cloneData(parsed.lastHistoryChangeSnapshot):null;
  clean.weeks=Array.from({length:12},(_,weekIndex)=>{
    const source=parsed.weeks?.[weekIndex]||{};
    const week=blankEnhancementWeek();
    ["sleep","energy","activity","painLeft","painRight","waist"].forEach(key=>{
      week[key]=source[key]===null||source[key]===undefined?"":String(source[key]);
    });
    week.dailyWellbeing=Array.from({length:7},(_,dayIndex)=>normalizeDailyWellbeing(source.dailyWellbeing?.[dayIndex]));
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
  const matchingRecord=enhancements.history.some(record=>record.programId===enhancements.programId&&record.weekIndex===weekIndex&&record.planKey===planKey&&(
    record.id===legacyId||(session.completedAt&&record.completedAt===session.completedAt)
  ));
  if(matchingRecord)return;
  const performedDate=programDayDate(weekIndex,session.day);
  const fallbackDate=performedDate?.toISOString()||session.completedAt||new Date().toISOString();
  enhancements.history.push({
    id:legacyId,programId:enhancements.programId,weekIndex,kind:"gym",planKey,day:String(session.day??""),
    startedAt:"",completedAt:session.completedAt||fallbackDate,performedDate:performedDate?localISODate(performedDate):"",durationMinutes:String(session.durationMinutes||""),
    painBeforeLeft:"",painBeforeRight:"",painAfterLeft:"",painAfterRight:"",
    exercises:WORKOUT_PLANS[planKey].exercises.map((exercise,index)=>({
      name:exercise.name,skippedReason:enhancements.weeks[weekIndex].logs[planKey][index].skippedReason,
      sets:cloneData(enhancements.weeks[weekIndex].logs[planKey][index].sets)
    }))
  });
}));
enhancements.history=dedupeHistoryRecords(enhancements.history);

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
  if(enhancements.poolDraft?.week===Number(weekIndex)&&String(enhancements.poolDraft.day)===day)return true;
  const training=state.weeks[weekIndex]?.training;
  return ["A","B"].some(planKey=>planKey!==exceptPlan&&String(training?.[planKey]?.day)===day);
}

function isPoolRecord(record){return record?.kind==="pool"||record?.planKey==="POOL";}

const SWIM_STYLE_LABELS={crawl:"Кроль",backstroke:"На спині",aqua:"Акваходьба",mixed:"Змішано",other:"Інше"};
const INTENSITY_LABELS={easy:"Легка",moderate:"Помірна",hard:"Висока"};

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
  return Number.isNaN(date.getTime())||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day?null:date;
}

function normalizeProgramStartValue(value){
  const date=parseProgramDate(value);
  return date?localISODate(currentWeekMonday(date)):"";
}

function dateForProgramDay(startDate,weekIndex,dayIndex){
  const start=parseProgramDate(startDate),week=Number(weekIndex),day=Number(dayIndex);
  if(!start||!Number.isInteger(week)||week<0||week>11||!Number.isInteger(day)||day<0||day>6||dayIndex==="")return null;
  const date=new Date(start);date.setDate(start.getDate()+week*7+day);return date;
}

function dedupeHistoryRecords(records){
  const bySignature=new Map();
  records.forEach(record=>{
    const signature=[record.programId,record.weekIndex,record.planKey,record.day,record.completedAt].join("|");
    const existing=bySignature.get(signature);
    if(!existing||String(existing.id).startsWith("legacy-")&&!String(record.id).startsWith("legacy-"))bySignature.set(signature,record);
  });
  return Array.from(bySignature.values());
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
  return dateForProgramDay(enhancements.startDate,weekIndex,dayIndex);
}

function recalculateCurrentPerformedDates(){
  currentProgramHistory().forEach(record=>{
    const date=programDayDate(record.weekIndex,record.day);
    record.performedDate=date?localISODate(date):record.performedDate;
  });
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

function dailyMetricOptions(value,min,max){
  return `<option value="">—</option>`+Array.from({length:max-min+1},(_,offset)=>{
    const option=min+offset;return `<option value="${option}" ${String(value)===String(option)?"selected":""}>${option}</option>`;
  }).join("");
}

function dailyWellbeingHTML(weekIndex,dayIndex){
  const daily=enhancements.weeks?.[weekIndex]?.dailyWellbeing?.[dayIndex]||blankDailyWellbeing();
  return `<div class="daily-wellbeing-grid">
    <label><span>Сон, год</span><input type="number" inputmode="decimal" min="0" max="16" step="0.25" value="${escapeNote(daily.sleep)}" placeholder="7.5" aria-label="${days[dayIndex].name}: сон у годинах" oninput="updateDailyWellbeing(${weekIndex},${dayIndex},'sleep',this.value,this)"></label>
    <label><span>Енергія</span><select aria-label="${days[dayIndex].name}: енергія від 1 до 10" onchange="updateDailyWellbeing(${weekIndex},${dayIndex},'energy',this.value)">${dailyMetricOptions(daily.energy,1,10)}</select></label>
    <label><span>Ліве коліно</span><select aria-label="${days[dayIndex].name}: біль у лівому коліні від 0 до 10" onchange="updateDailyWellbeing(${weekIndex},${dayIndex},'painLeft',this.value)">${dailyMetricOptions(daily.painLeft,0,10)}</select></label>
    <label><span>Праве коліно</span><select aria-label="${days[dayIndex].name}: біль у правому коліні від 0 до 10" onchange="updateDailyWellbeing(${weekIndex},${dayIndex},'painRight',this.value)">${dailyMetricOptions(daily.painRight,0,10)}</select></label>
  </div>`;
}

function updateDailyWellbeing(weekIndex,dayIndex,key,value,element=null){
  if(!Number.isInteger(weekIndex)||weekIndex<0||weekIndex>11||!Number.isInteger(dayIndex)||dayIndex<0||dayIndex>6||!["sleep","energy","painLeft","painRight"].includes(key))return;
  const numeric=value===""?null:Number(value);
  const valid=value===""||(Number.isFinite(numeric)&&(key==="sleep"?numeric>=0&&numeric<=16:key==="energy"?numeric>=1&&numeric<=10:numeric>=0&&numeric<=10));
  element?.classList.toggle("field-error",!valid);element?.setAttribute("aria-invalid",String(!valid));
  if(!valid){showToast(key==="sleep"?"Вкажи сон від 0 до 16 годин.":"Вкажи значення у дозволеному діапазоні.");return;}
  enhancements.weeks[weekIndex].dailyWellbeing[dayIndex][key]=value===""?"":String(value).slice(0,key==="sleep"?5:2);
  persistEnhancements();renderWellbeing();renderSummary();
}

function weeklyWellbeingStats(weekIndex=currentWeek-1){
  const daily=enhancements.weeks[weekIndex].dailyWellbeing;
  const values=key=>daily.map(day=>weightNumber(day[key])).filter(value=>value!==null);
  const sleep=values("sleep"),energy=values("energy"),pain=[...values("painLeft"),...values("painRight")];
  const average=list=>list.length?list.reduce((sum,value)=>sum+value,0)/list.length:null;
  const completeDays=daily.filter(day=>["sleep","energy","painLeft","painRight"].every(key=>day[key]!=="")).length;
  return {sleepAverage:average(sleep),sleepDays:sleep.length,energyAverage:average(energy),energyDays:energy.length,painAverage:average(pain),painMaximum:pain.length?Math.max(...pain):null,completeDays};
}

function formatSleepAverage(value){
  if(value===null)return "—";
  let hours=Math.floor(value),minutes=Math.round((value-hours)*60/5)*5;
  if(minutes===60){hours+=1;minutes=0;}
  return minutes?`${hours} год ${minutes} хв`:`${hours} год`;
}

function activeWeek(week,index){
  const extra=enhancements.weeks[index];
  return Boolean(week.startWeight||week.endWeight||week.mood||week.days.some(day=>Object.values(day).some(Boolean))||
    ["sleep","energy","activity","painLeft","painRight","waist"].some(key=>extra[key]!=="")||extra.dailyWellbeing.some(day=>Object.values(day).some(value=>value!==""))||
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
  const backupAge=enhancements.lastBackupAt?Date.now()-new Date(enhancements.lastBackupAt).getTime():Infinity;
  const reminder=document.getElementById("backupReminder");if(reminder)reminder.hidden=backupAge<=7*86400000;
}

function renderWellbeing(){
  const week=enhancements.weeks[currentWeek-1];
  document.getElementById("waistCircumference").value=week.waist;
  const stats=weeklyWellbeingStats();
  document.getElementById("weeklySleepAverage").textContent=formatSleepAverage(stats.sleepAverage);
  document.getElementById("weeklySleepCoverage").textContent=`${stats.sleepDays} із 7 днів`;
  document.getElementById("weeklyEnergyAverage").textContent=stats.energyAverage===null?"—":`${stats.energyAverage.toFixed(1)} / 10`;
  document.getElementById("weeklyEnergyCoverage").textContent=`${stats.energyDays} із 7 днів`;
  document.getElementById("weeklyKneeAverage").textContent=stats.painAverage===null?"—":`${stats.painAverage.toFixed(1)} / 10`;
  document.getElementById("weeklyKneeMaximum").textContent=`Максимум: ${stats.painMaximum===null?"—":`${stats.painMaximum} / 10`}`;
  document.getElementById("weeklyWellbeingCoverage").textContent=`${Math.round(stats.completeDays/7*100)}%`;
  const pain=stats.painMaximum??0;
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
  const mobileStart=document.getElementById("mobileProgramStartDate"),mobileRange=document.getElementById("mobileCurrentWeekRange");
  if(mobileStart)mobileStart.value=enhancements.startDate;
  if(mobileRange)mobileRange.textContent=`Тиждень ${currentWeek}: ${range.long}`;
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
    .sort((a,b)=>new Date(b.performedDate||b.completedAt).getTime()-new Date(a.performedDate||a.completedAt).getTime())[0];
  if(recorded)return {week:recorded.weekIndex+1,date:recorded.performedDate||recorded.completedAt,text:recorded.exercises[exerciseIndex].sets.map(set=>formatSet(set,planKey,exerciseIndex)).join(" · ")};
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
  const planned=["A","B"].filter(planKey=>String(week.training[planKey].day)===String(dayIndex)&&!completedToday.some(record=>record.planKey===planKey)&&!(enhancements.poolDraft?.week===weekIndex&&Number(enhancements.poolDraft.day)===dayIndex&&enhancements.poolDraft.replacesPlan===planKey));
  const completedHTML=completedToday.map(record=>{
    if(isPoolRecord(record)){
      const details=[record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"",record.distanceMeters?`${escapeNote(record.distanceMeters)} м`:"",SWIM_STYLE_LABELS[record.swimStyle]||""].filter(Boolean).join(" · ");
      return `<div class="today-workout done pool"><div><span>Завершено</span><strong>Басейн${record.replacesPlan?` · замість ${record.replacesPlan}`:""}</strong><small>${details||"Тренування у воді"}</small></div><button type="button" onclick="openHistorySession(${weekIndex},'POOL')">Переглянути</button></div>`;
    }
    const done=record.exercises.filter(exercise=>exercise.sets.length&&exercise.sets.every(set=>set.done)).length;
    return `<div class="today-workout done"><div><span>Завершено</span><strong>Тренування ${record.planKey}</strong><small>${done} / ${WORKOUT_PLANS[record.planKey].exercises.length} вправ · ${escapeNote(record.durationMinutes||"—")} хв</small></div><button type="button" onclick="openTodayWorkout(${weekIndex},'${record.planKey}',false)">Переглянути</button></div>`;
  }).join("");
  const plannedHTML=planned.map(planKey=>{
    const session=week.training[planKey],completed=session.exercises.filter(Boolean).length;
    return `<div class="today-workout"><div><span>Заплановано сьогодні</span><strong>Тренування ${planKey}</strong><small>${completed} / ${WORKOUT_PLANS[planKey].exercises.length} вправ</small></div><button type="button" onclick="openTodayWorkout(${weekIndex},'${planKey}',true)">Почати</button></div>`;
  }).join("");
  const poolDraftHTML=enhancements.poolDraft?.week===weekIndex&&Number(enhancements.poolDraft.day)===dayIndex?
    `<div class="today-workout pool"><div><span>Чернетка</span><strong>Басейн</strong><small>Заповни результати після відвідування</small></div><button type="button" onclick="openPoolSession(${weekIndex})">Відкрити</button></div>`:"";
  const workoutHTML=completedHTML||plannedHTML||poolDraftHTML?completedHTML+plannedHTML+poolDraftHTML:`<div class="today-no-workout"><span>Сьогодні тренування не заплановане.</span><button type="button" onclick="openTodayWorkout(${weekIndex},'A',false)">Відкрити програму</button></div>`;
  content.innerHTML=`<div class="today-context"><strong>${days[dayIndex].name} · тиждень ${weekIndex+1}</strong><span>Швидко відміть головне на сьогодні</span></div><div class="today-grid">${habitButtons}</div><div class="today-workouts">${workoutHTML}</div>`;
}

function toggleTodayHabit(weekIndex,dayIndex,key){
  const week=state.weeks[weekIndex];
  if(key==="activity"&&completedSessionOnDay(week,dayIndex)){showToast("Цей день уже зараховано завершеним тренуванням або басейном.");return;}
  week.days[dayIndex][key]=!week.days[dayIndex][key];persist();
  if(currentWeek===weekIndex+1)renderAll();else{renderToday();renderSummary();}
}

function openTodayWorkout(weekIndex,planKey,guided){
  currentWeek=weekIndex+1;currentPlan=planKey;renderAll();
  if(typeof navigateToAppScreen==="function")navigateToAppScreen("training",{updateHistory:true});
  else document.getElementById("training")?.scrollIntoView({behavior:"smooth",block:"start"});
  if(guided)setTimeout(()=>startGuidedWorkout(planKey),250);
}

function trainingRecords(){
  return currentProgramHistory().map(record=>{
    const performedDate=record.performedDate?parseProgramDate(record.performedDate):programDayDate(record.weekIndex,record.day);
    const validDate=performedDate&&!Number.isNaN(performedDate.getTime())?performedDate:null;
    return {...record,date:validDate,sort:validDate?.getTime()||record.weekIndex};
  }).sort((a,b)=>b.sort-a.sort);
}

function recentHistoryUndoAvailable(){
  const snapshot=enhancements.lastHistoryChangeSnapshot,created=snapshot?.createdAt?new Date(snapshot.createdAt).getTime():0;
  return Boolean(snapshot&&Date.now()-created<HISTORY_UNDO_MS);
}

function historyActionsHTML(record){
  const id=encodeURIComponent(record.id);
  return `<div class="history-actions"><button type="button" onclick="openHistoryEditor('${id}')">Виправити</button><button class="history-cancel" type="button" onclick="cancelHistoryRecord('${id}')">Скасувати запис</button></div>`;
}

function captureHistorySnapshot(record,index,weekIndexes,type){
  const unique=[...new Set(weekIndexes.filter(value=>Number.isInteger(value)&&value>=0&&value<12))];
  return {
    type,createdAt:new Date().toISOString(),programId:enhancements.programId,index,record:cloneData(record),
    weeks:unique.map(weekIndex=>({weekIndex,tracker:cloneData(state.weeks[weekIndex]),enhancement:cloneData(enhancements.weeks[weekIndex])}))
  };
}

function historyCorrectionDayConflict(record,weekIndex,dayIndex){
  if(currentProgramHistory().some(item=>item.id!==record.id&&item.weekIndex===weekIndex&&String(item.day)===String(dayIndex)))return true;
  if(enhancements.poolDraft?.week===weekIndex&&String(enhancements.poolDraft.day)===String(dayIndex))return true;
  return ["A","B"].some(planKey=>{
    const session=state.weeks[weekIndex].training[planKey];
    if(String(session.day)!==String(dayIndex))return false;
    if(record.kind==="gym"&&record.planKey===planKey&&session.completedAt===record.completedAt)return false;
    if(record.kind==="pool"&&record.replacesPlan===planKey)return false;
    return true;
  });
}

function historyEditSetRows(record){
  if(isPoolRecord(record))return "";
  return `<div class="history-edit-sets"><strong>Підходи та повтори</strong>${record.exercises.map((exercise,exerciseIndex)=>`
    <details><summary>${escapeNote(exercise.name)}</summary>
      <label><span>Причина пропуску</span><select name="skip_${exerciseIndex}">${skipReasonOptions(exercise.skippedReason)}</select></label>
      <div>${exercise.sets.map((set,setIndex)=>`<div class="history-edit-set"><span>${setIndex+1}</span><label><small>Вага / опір</small><input name="weight_${exerciseIndex}_${setIndex}" maxlength="20" value="${escapeNote(set.weight)}"></label><label><small>Повтори / час</small><input name="reps_${exerciseIndex}_${setIndex}" maxlength="24" value="${escapeNote(set.reps)}"></label><label class="history-edit-done"><input name="done_${exerciseIndex}_${setIndex}" type="checkbox" ${set.done?"checked":""}> виконано</label></div>`).join("")}</div>
    </details>`).join("")}</div>`;
}

function openHistoryEditor(encodedId){
  const id=decodeURIComponent(encodedId),record=currentProgramHistory().find(item=>item.id===id);
  const dialog=document.getElementById("historyEditDialog"),content=document.getElementById("historyEditContent");
  if(!record||!dialog||!content)return;
  dialog.dataset.recordId=id;
  const start=parseProgramDate(enhancements.startDate),end=start?new Date(start):null;if(end)end.setDate(end.getDate()+83);
  const performedDate=record.performedDate||(programDayDate(record.weekIndex,record.day)?localISODate(programDayDate(record.weekIndex,record.day)):"");
  const poolFields=isPoolRecord(record)?`<div class="history-edit-grid">
    <label><span>Дистанція, м</span><input name="distanceMeters" type="number" min="0" max="20000" step="25" value="${escapeNote(record.distanceMeters)}"></label>
    <label><span>Вид активності</span><select name="swimStyle">${Object.entries(SWIM_STYLE_LABELS).map(([value,label])=>`<option value="${value}" ${record.swimStyle===value?"selected":""}>${label}</option>`).join("")}</select></label>
    <label><span>Інтенсивність</span><select name="intensity">${Object.entries(INTENSITY_LABELS).map(([value,label])=>`<option value="${value}" ${record.intensity===value?"selected":""}>${label}</option>`).join("")}</select></label>
    <label><span>Що замінює?</span><select name="replacesPlan"><option value="">Окреме тренування</option><option value="A" ${record.replacesPlan==="A"?"selected":""}>Тренування A</option><option value="B" ${record.replacesPlan==="B"?"selected":""}>Тренування B</option></select></label>
  </div><label class="history-edit-notes"><span>Нотатка</span><textarea name="notes" maxlength="500" rows="3">${escapeNote(record.notes)}</textarea></label>`:"";
  content.innerHTML=`<div class="history-edit-title"><span>${isPoolRecord(record)?"🏊 Басейн":`Тренування ${record.planKey}`}</span><strong>Зміни одразу оновлять календар, прогрес та історію.</strong></div>
    <div class="history-edit-grid">
      <label><span>Дата тренування</span><input name="performedDate" type="date" required min="${start?localISODate(start):""}" max="${end?localISODate(end):""}" value="${performedDate}"></label>
      <label><span>Тривалість, хв</span><input name="durationMinutes" type="number" min="1" max="600" value="${escapeNote(record.durationMinutes)}"></label>
      <label><span>Ліве коліно · до</span><select name="painBeforeLeft">${painOptions(record.painBeforeLeft)}</select></label>
      <label><span>Праве коліно · до</span><select name="painBeforeRight">${painOptions(record.painBeforeRight)}</select></label>
      <label><span>Ліве коліно · після</span><select name="painAfterLeft">${painOptions(record.painAfterLeft)}</select></label>
      <label><span>Праве коліно · після</span><select name="painAfterRight">${painOptions(record.painAfterRight)}</select></label>
    </div>${poolFields}${historyEditSetRows(record)}
    <footer class="history-edit-actions"><button type="button" onclick="closeHistoryEditor()">Закрити</button><button class="history-edit-save" type="submit">Зберегти виправлення</button></footer>`;
  document.body.classList.add("history-edit-open");
  if(!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
}

function closeHistoryEditor(){
  const dialog=document.getElementById("historyEditDialog");
  if(dialog?.open&&typeof dialog.close==="function")dialog.close();else dialog?.removeAttribute("open");
  document.body.classList.remove("history-edit-open");
}

function saveHistoryCorrection(event){
  event.preventDefault();
  const dialog=document.getElementById("historyEditDialog"),id=dialog?.dataset.recordId;
  const index=enhancements.history.findIndex(item=>item.programId===enhancements.programId&&item.id===id);
  if(index<0)return;
  const original=enhancements.history[index],form=new FormData(event.currentTarget),performedDate=String(form.get("performedDate")||"");
  const date=parseProgramDate(performedDate),position=date?programPosition(date):{status:"invalid"};
  if(position.status!=="active"){showToast("Дата має бути в межах поточної 12-тижневої програми.");return;}
  if(historyCorrectionDayConflict(original,position.weekIndex,position.dayIndex)){showToast("На цю дату вже заплановано або записано інше тренування.");return;}
  const duration=String(form.get("durationMinutes")||"");
  if(duration!==""&&(!Number.isFinite(Number(duration))||Number(duration)<1||Number(duration)>600)){showToast("Вкажи тривалість від 1 до 600 хвилин.");return;}
  const updated=cloneData(original),affectedWeeks=[original.weekIndex,position.weekIndex];
  const snapshot=captureHistorySnapshot(original,index,affectedWeeks,"edit");
  updated.weekIndex=position.weekIndex;updated.day=String(position.dayIndex);updated.performedDate=performedDate;updated.durationMinutes=duration;
  ["painBeforeLeft","painBeforeRight","painAfterLeft","painAfterRight"].forEach(key=>{updated[key]=String(form.get(key)||"");});
  if(isPoolRecord(updated)){
    const distance=String(form.get("distanceMeters")||"");
    if(distance!==""&&(!Number.isFinite(Number(distance))||Number(distance)<0||Number(distance)>20000)){showToast("Вкажи дистанцію від 0 до 20 000 метрів.");return;}
    updated.distanceMeters=distance;updated.swimStyle=String(form.get("swimStyle")||"");updated.intensity=String(form.get("intensity")||"");
    updated.replacesPlan=["A","B"].includes(String(form.get("replacesPlan")))?String(form.get("replacesPlan")):"";
    updated.notes=String(form.get("notes")||"").slice(0,500);
  }else{
    updated.exercises.forEach((exercise,exerciseIndex)=>{
      exercise.skippedReason=String(form.get(`skip_${exerciseIndex}`)||"").slice(0,80);
      exercise.sets.forEach((set,setIndex)=>{set.weight=String(form.get(`weight_${exerciseIndex}_${setIndex}`)||"").slice(0,20);set.reps=String(form.get(`reps_${exerciseIndex}_${setIndex}`)||"").slice(0,24);set.done=form.has(`done_${exerciseIndex}_${setIndex}`);});
    });
    const oldSession=state.weeks[original.weekIndex].training[original.planKey],linked=oldSession.completedAt===original.completedAt;
    if(linked){
      oldSession.done=false;oldSession.completedAt="";oldSession.durationMinutes="";oldSession.exercises=oldSession.exercises.map(()=>false);
      const target=state.weeks[updated.weekIndex].training[updated.planKey];
      target.day=updated.day;target.done=true;target.completedAt=updated.completedAt;target.durationMinutes=updated.durationMinutes;
      target.exercises=updated.exercises.map(exercise=>Boolean(exercise.sets.length)&&exercise.sets.every(set=>set.done));
      enhancements.weeks[updated.weekIndex].logs[updated.planKey]=updated.exercises.map((exercise,exerciseIndex)=>normalizeExerciseLog(exercise,updated.planKey,exerciseIndex));
    }
  }
  enhancements.history[index]=updated;enhancements.lastHistoryChangeSnapshot=snapshot;
  persistEnhancements();persist();closeHistoryEditor();renderAll();showToast("Запис виправлено. Зміну можна скасувати протягом 30 хвилин.");
}

function cancelHistoryRecord(encodedId){
  const id=decodeURIComponent(encodedId),index=enhancements.history.findIndex(item=>item.programId===enhancements.programId&&item.id===id);
  if(index<0)return;
  const record=enhancements.history[index];
  if(!window.confirm(`Скасувати запис «${isPoolRecord(record)?"Басейн":`Тренування ${record.planKey}`}»? Його можна буде відновити протягом 30 хвилин.`))return;
  enhancements.lastHistoryChangeSnapshot=captureHistorySnapshot(record,index,[record.weekIndex],"cancel");
  enhancements.history.splice(index,1);
  if(!isPoolRecord(record)){
    const session=state.weeks[record.weekIndex].training[record.planKey];
    if(session.completedAt===record.completedAt){session.done=false;session.completedAt="";session.durationMinutes="";session.exercises=session.exercises.map(()=>false);}
  }else if(record.replacesPlan){
    const session=state.weeks[record.weekIndex].training[record.replacesPlan];
    if(!session.done&&session.day==="")session.day=record.day;
  }
  persistEnhancements();persist();renderAll();showToast("Запис скасовано. Його можна відновити протягом 30 хвилин.");
}

function undoHistoryChange(){
  const snapshot=enhancements.lastHistoryChangeSnapshot;
  if(!recentHistoryUndoAvailable()){enhancements.lastHistoryChangeSnapshot=null;persistEnhancements();renderHistory();showToast("Час відновлення минув.");return;}
  snapshot.weeks.forEach(item=>{state.weeks[item.weekIndex]=normalizeState({weeks:Array.from({length:12},(_,index)=>index===item.weekIndex?item.tracker:blankWeek())}).weeks[item.weekIndex];enhancements.weeks[item.weekIndex]=normalizeEnhancements({weeks:Array.from({length:12},(_,index)=>index===item.weekIndex?item.enhancement:blankEnhancementWeek())}).weeks[item.weekIndex];});
  const existingIndex=enhancements.history.findIndex(item=>item.id===snapshot.record.id);
  if(existingIndex>=0)enhancements.history[existingIndex]=normalizeHistoryRecord(snapshot.record);else enhancements.history.splice(Math.min(snapshot.index,enhancements.history.length),0,normalizeHistoryRecord(snapshot.record));
  enhancements.lastHistoryChangeSnapshot=null;persistEnhancements();persist();renderAll();showToast("Попередній стан запису відновлено.");
}

function renderHistory(){
  const list=document.getElementById("historyList"),count=document.getElementById("historyCount");if(!list||!count)return;
  const records=trainingRecords();count.textContent=`${records.length} ${records.length===1?"запис":"записів"}`;
  const undo=document.getElementById("undoHistoryChange");if(undo)undo.hidden=!recentHistoryUndoAvailable();
  if(!records.length){list.innerHTML=`<div class="history-empty"><strong>Історія поки порожня</strong><span>Завершене тренування автоматично з’явиться тут разом із підходами та тривалістю.</span></div>`;return;}
  const dateFormat=new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long",year:"numeric"});
  list.innerHTML=records.map(record=>{
    const before=Math.max(Number(record.painBeforeLeft||0),Number(record.painBeforeRight||0));
    const after=Math.max(Number(record.painAfterLeft||0),Number(record.painAfterRight||0));
    const pain=(record.painBeforeLeft!==""||record.painBeforeRight!==""||record.painAfterLeft!==""||record.painAfterRight!=="")?`<span class="${after>=4?"pain-high":""}">Коліна: ${before}/10 → ${after}/10</span>`:"";
    if(isPoolRecord(record)){
      const poolDetails=[
        record.swimStyle?`Стиль: ${SWIM_STYLE_LABELS[record.swimStyle]}`:"",
        record.intensity?`Інтенсивність: ${INTENSITY_LABELS[record.intensity]}`:"",
        record.distanceMeters?`Дистанція: ${escapeNote(record.distanceMeters)} м`:"",
        record.replacesPlan?`Замість тренування ${record.replacesPlan}`:""
      ].filter(Boolean).map(text=>`<li><span>${text}</span></li>`).join("");
      const notes=record.notes?`<p class="history-pool-note">${escapeNote(record.notes)}</p>`:"";
      return `<article class="history-card pool-history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>🏊 Басейн</h3></div><div class="history-metrics"><span>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"час не записано"}</span>${record.distanceMeters?`<span>${escapeNote(record.distanceMeters)} м</span>`:""}${pain}</div></div><details><summary>Показати результати</summary><ul>${poolDetails||"<li><span>Додаткові показники не записані</span></li>"}</ul>${notes}</details><button class="history-open" type="button" onclick="openHistorySession(${record.weekIndex},'POOL')">Відкрити тиждень ${record.weekIndex+1}</button>${historyActionsHTML(record)}</article>`;
    }
    const plan=WORKOUT_PLANS[record.planKey];
    const completed=record.exercises.filter(exercise=>exercise.sets.length&&exercise.sets.every(set=>set.done)).length;
    const rows=plan.exercises.map((exercise,index)=>{
      const snapshot=record.exercises[index];
      if(snapshot?.skippedReason)return `<li><span>${escapeNote(exercise.name)}</span><strong class="history-skipped">Пропущено: ${escapeNote(snapshot.skippedReason)}</strong></li>`;
      if(!snapshot?.sets?.some(set=>set.weight||set.reps||set.done))return "";
      return `<li><span>${escapeNote(exercise.name)}</span><strong>${escapeNote(snapshot.sets.map(set=>formatSet(set,record.planKey,index)).join(" · ")||"Виконано")}</strong></li>`;
    }).join("");
    return `<article class="history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>Тренування ${record.planKey}</h3></div><div class="history-metrics"><span>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"час не записано"}</span><span>${completed} / ${plan.exercises.length} вправ</span>${pain}</div></div><details><summary>Показати результати</summary><ul>${rows||"<li><span>Результати підходів не записані</span></li>"}</ul></details><button class="history-open" type="button" onclick="openHistorySession(${record.weekIndex},'${record.planKey}')">Відкрити тиждень ${record.weekIndex+1}</button>${historyActionsHTML(record)}</article>`;
  }).join("");
}

function openHistorySession(weekIndex,planKey){
  currentWeek=weekIndex+1;if(planKey!=="POOL")currentPlan=planKey;renderAll();
  if(typeof navigateToAppScreen==="function")navigateToAppScreen("training",{updateHistory:true});
  else document.getElementById(planKey==="POOL"?"trainingHistory":"training")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function blankPoolDraft(weekIndex=currentWeek-1){
  return {week:weekIndex,day:"",replacesPlan:"",durationMinutes:"",distanceMeters:"",swimStyle:"",intensity:"",painBeforeLeft:"",painBeforeRight:"",painAfterLeft:"",painAfterRight:"",notes:""};
}

function poolDraftHasValues(draft){
  return Boolean(draft&&Object.entries(draft).some(([key,value])=>key!=="week"&&value!==""));
}

function poolDayIsTaken(draft,dayIndex){
  const day=String(dayIndex),week=state.weeks[draft.week];
  if(completedTrainingRecordsForWeek(draft.week).some(record=>String(record.day)===day))return true;
  return ["A","B"].some(planKey=>planKey!==draft.replacesPlan&&String(week.training[planKey].day)===day);
}

function poolDayOptions(draft){
  return `<option value="">Обери день</option>`+days.map((day,index)=>{
    const occupied=poolDayIsTaken(draft,index)&&String(draft.day)!==String(index);
    return `<option value="${index}" ${String(draft.day)===String(index)?"selected":""} ${occupied?"disabled":""}>${day.name}${occupied?" · вже є тренування":""}</option>`;
  }).join("");
}

function openPoolSession(weekIndex=currentWeek-1){
  if(enhancements.activeWorkout){
    const active=enhancements.activeWorkout,session=state.weeks[active.week].training[active.plan];
    const overwritesDraft=poolDraftHasValues(enhancements.poolDraft);
    const message=`Замінити активне тренування ${active.plan} басейном? Вага й повтори залишаться у чернетці, а виконані позначки буде скинуто.${overwritesDraft?" Поточну чернетку басейну буде замінено.":""}`;
    if(!window.confirm(message))return;
    session.done=false;session.completedAt="";session.durationMinutes="";session.exercises=session.exercises.map(()=>false);
    enhancements.weeks[active.week].logs[active.plan].forEach(log=>log.sets.forEach(set=>{set.done=false;}));
    enhancements.poolDraft=blankPoolDraft(active.week);
    enhancements.poolDraft.replacesPlan=active.plan;
    enhancements.poolDraft.day=session.day;
    enhancements.activeWorkout=null;
    const guidedDialog=document.getElementById("guidedWorkoutDialog");
    if(guidedDialog?.open&&typeof guidedDialog.close==="function")guidedDialog.close();else guidedDialog?.removeAttribute("open");
    document.body.classList.remove("guided-open");
    weekIndex=active.week;
    persistEnhancements();persist();
    showToast(`Тренування ${active.plan} замінено чернеткою басейну.`);
  }
  const targetWeek=Number.isInteger(Number(weekIndex))?Math.max(0,Math.min(11,Number(weekIndex))):currentWeek-1;
  if(enhancements.poolDraft&&enhancements.poolDraft.week!==targetWeek&&poolDraftHasValues(enhancements.poolDraft)&&!window.confirm("Є незавершена чернетка басейну для іншого тижня. Очистити її та створити нову?"))return;
  if(!enhancements.poolDraft||enhancements.poolDraft.week!==targetWeek)enhancements.poolDraft=blankPoolDraft(targetWeek);
  currentWeek=targetWeek+1;persistEnhancements();renderAll();renderPoolSession();
  const dialog=document.getElementById("poolSessionDialog");document.body.classList.add("pool-open");
  if(dialog&&!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
}

function renderPoolSession(){
  const draft=enhancements.poolDraft,content=document.getElementById("poolSessionContent");if(!draft||!content)return;
  const before=Math.max(Number(draft.painBeforeLeft||0),Number(draft.painBeforeRight||0));
  const after=Math.max(Number(draft.painAfterLeft||0),Number(draft.painAfterRight||0));
  const maxPain=Math.max(before,after);
  const painWarning=maxPain>=4?`<div class="pool-pain-warning">${maxPain>=7?"Сильний біль: припини навантаження та обговори стан із лікарем або фізіотерапевтом.":"Коліна реагують на навантаження. Обирай спокійний темп, кроль, плавання на спині або акваходьбу."}</div>`:"";
  document.getElementById("poolWeekLabel").textContent=`Басейн · тиждень ${draft.week+1}`;
  content.innerHTML=`
    <div class="pool-intro"><div aria-hidden="true">🏊</div><div><h2>Запис тренування у басейні</h2><p>Басейн зарахується як одне з двох тренувань тижня і як активність цього дня.</p></div></div>
    <div class="pool-form-grid">
      <label><span>Що замінює?</span><select onchange="updatePoolDraft('replacesPlan',this.value)"><option value="" ${draft.replacesPlan===""?"selected":""}>Окреме тренування</option><option value="A" ${draft.replacesPlan==="A"?"selected":""}>Замість тренування A</option><option value="B" ${draft.replacesPlan==="B"?"selected":""}>Замість тренування B</option></select></label>
      <label><span>День</span><select id="poolDay" onchange="updatePoolDraft('day',this.value)">${poolDayOptions(draft)}</select></label>
      <label><span>Тривалість, хв</span><input type="number" inputmode="numeric" min="5" max="240" step="1" value="${escapeNote(draft.durationMinutes)}" placeholder="Напр. 40" oninput="updatePoolDraft('durationMinutes',this.value)"></label>
      <label><span>Дистанція, м · необов’язково</span><input type="number" inputmode="numeric" min="0" max="20000" step="25" value="${escapeNote(draft.distanceMeters)}" placeholder="Напр. 800" oninput="updatePoolDraft('distanceMeters',this.value)"></label>
      <label><span>Вид активності</span><select onchange="updatePoolDraft('swimStyle',this.value)"><option value="">Обери</option>${Object.entries(SWIM_STYLE_LABELS).map(([value,label])=>`<option value="${value}" ${draft.swimStyle===value?"selected":""}>${label}</option>`).join("")}</select></label>
      <label><span>Інтенсивність</span><select onchange="updatePoolDraft('intensity',this.value)"><option value="">Обери</option>${Object.entries(INTENSITY_LABELS).map(([value,label])=>`<option value="${value}" ${draft.intensity===value?"selected":""}>${label}</option>`).join("")}</select></label>
    </div>
    <div class="pool-knee-panel"><div><strong>Коліна до і після</strong><span>0 — болю немає, 10 — найсильніший біль</span></div><div class="pool-pain-grid"><label>Ліве · до<select onchange="updatePoolDraft('painBeforeLeft',this.value)">${painOptions(draft.painBeforeLeft)}</select></label><label>Праве · до<select onchange="updatePoolDraft('painBeforeRight',this.value)">${painOptions(draft.painBeforeRight)}</select></label><label>Ліве · після<select onchange="updatePoolDraft('painAfterLeft',this.value)">${painOptions(draft.painAfterLeft)}</select></label><label>Праве · після<select onchange="updatePoolDraft('painAfterRight',this.value)">${painOptions(draft.painAfterRight)}</select></label></div>${painWarning}</div>
    <div class="pool-safety-note"><strong>Для колін</strong><span>Віддавай перевагу кролю, плаванню на спині або акваходьбі. Якщо «жаб’ячий» рух ногами під час брасу викликає дискомфорт — не використовуй його.</span></div>
    <label class="pool-notes"><span>Нотатка · необов’язково</span><textarea maxlength="500" rows="3" placeholder="Самопочуття, темп або що змінити наступного разу" oninput="updatePoolDraft('notes',this.value)">${escapeNote(draft.notes)}</textarea></label>
    <footer class="pool-actions"><button class="pool-reset" type="button" onclick="resetPoolDraft()">Очистити</button><button class="pool-save" type="button" onclick="savePoolSession()">Зарахувати басейн</button></footer>`;
}

function updatePoolDraft(key,value){
  const draft=enhancements.poolDraft;
  const allowed=["day","replacesPlan","durationMinutes","distanceMeters","swimStyle","intensity","painBeforeLeft","painBeforeRight","painAfterLeft","painAfterRight","notes"];
  if(!draft||!allowed.includes(key))return;
  draft[key]=String(value).slice(0,key==="notes"?500:20);
  if(key==="replacesPlan"&&draft.day!==""&&poolDayIsTaken(draft,draft.day))draft.day="";
  persistEnhancements();
  if(["replacesPlan","painBeforeLeft","painBeforeRight","painAfterLeft","painAfterRight"].includes(key))renderPoolSession();
  if(["day","replacesPlan"].includes(key))renderToday();
}

function resetPoolDraft(){
  const draft=enhancements.poolDraft;if(!draft)return;
  if(poolDraftHasValues(draft)&&!window.confirm("Очистити всі введені дані басейну?"))return;
  enhancements.poolDraft=blankPoolDraft(draft.week);persistEnhancements();renderAll();renderPoolSession();showToast("Чернетку басейну очищено.");
}

function savePoolSession(){
  const draft=enhancements.poolDraft;if(!draft)return;
  const duration=Number(draft.durationMinutes),distance=draft.distanceMeters===""?null:Number(draft.distanceMeters);
  if(draft.day===""){showToast("Обери день відвідування басейну.");document.getElementById("poolDay")?.focus();return;}
  if(poolDayIsTaken(draft,draft.day)){showToast("На цей день уже записане інше тренування.");return;}
  if(!Number.isFinite(duration)||duration<5||duration>240){showToast("Вкажи тривалість від 5 до 240 хвилин.");return;}
  if(distance!==null&&(!Number.isFinite(distance)||distance<0||distance>20000)){showToast("Вкажи дистанцію від 0 до 20 000 метрів.");return;}
  if(!draft.swimStyle){showToast("Обери вид активності у басейні.");return;}
  if(!draft.intensity){showToast("Обери інтенсивність тренування.");return;}
  const completedAt=new Date().toISOString();
  const performedDate=programDayDate(draft.week,draft.day);
  enhancements.history.push({
    id:makeId("pool"),programId:enhancements.programId,weekIndex:draft.week,kind:"pool",planKey:"POOL",day:String(draft.day),
    startedAt:"",completedAt,performedDate:performedDate?localISODate(performedDate):"",durationMinutes:String(duration),distanceMeters:distance===null?"":String(distance),swimStyle:draft.swimStyle,intensity:draft.intensity,
    replacesPlan:draft.replacesPlan,painBeforeLeft:draft.painBeforeLeft,painBeforeRight:draft.painBeforeRight,painAfterLeft:draft.painAfterLeft,painAfterRight:draft.painAfterRight,
    notes:draft.notes,exercises:[]
  });
  if(draft.replacesPlan){
    const replaced=state.weeks[draft.week].training[draft.replacesPlan];
    if(!replaced.done)replaced.day="";
  }
  enhancements.poolDraft=null;persistEnhancements();persist();closePoolSession();renderAll();showToast("Басейн зараховано як тренування.");
}

function closePoolSession(){
  const dialog=document.getElementById("poolSessionDialog");
  if(dialog?.open&&typeof dialog.close==="function")dialog.close();else dialog?.removeAttribute("open");
  document.body.classList.remove("pool-open");renderAll();
}

function guidedWorkoutButtonLabel(planKey){
  const active=enhancements.activeWorkout;
  if(active&&active.week===currentWeek-1&&active.plan===planKey)return active.pausedAt?"▶ Продовжити з паузи":"▶ Продовжити тренування";
  return state.weeks[currentWeek-1].training[planKey].done?"＋ Повторити тренування":"▶ Почати тренування";
}

function startGuidedWorkout(planKey){
  currentPlan=planKey;
  const session=state.weeks[currentWeek-1].training[planKey],existing=enhancements.activeWorkout;
  const poolConflict=enhancements.poolDraft?.week===currentWeek-1&&(
    enhancements.poolDraft.replacesPlan===planKey||(session.day!==""&&String(enhancements.poolDraft.day)===String(session.day))
  );
  if(!existing&&poolConflict){
    if(!window.confirm(`Для цього дня вже підготовлено басейн${enhancements.poolDraft.replacesPlan?` замість тренування ${enhancements.poolDraft.replacesPlan}`:""}. Очистити чернетку басейну й почати тренування ${planKey}?`))return;
    enhancements.poolDraft=null;persistEnhancements();renderAll();
  }
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
      enhancements.weeks[currentWeek-1].logs[planKey].forEach(log=>{
        log.skippedReason="";log.sets.forEach(set=>{set.done=false;});
      });
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
  const performedDate=programDayDate(active.week,session.day);
  session.done=true;session.completedAt=completedAt;session.durationMinutes=durationMinutes;
  enhancements.history.push({
    id:makeId("workout"),programId:enhancements.programId,weekIndex:active.week,kind:"gym",planKey:active.plan,day:String(session.day),
    startedAt:active.startedAt,completedAt,performedDate:performedDate?localISODate(performedDate):"",durationMinutes:String(durationMinutes),
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

function archiveHistoryRecordHTML(record,archive){
  const date=record.performedDate?parseProgramDate(record.performedDate):dateForProgramDay(archive.startDate,record.weekIndex,record.day);
  const dateLabel=date?new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long",year:"numeric"}).format(date):`Тиждень ${record.weekIndex+1}`;
  if(isPoolRecord(record)){
    const details=[record.durationMinutes?`${record.durationMinutes} хв`:"",record.distanceMeters?`${record.distanceMeters} м`:"",SWIM_STYLE_LABELS[record.swimStyle]||"",INTENSITY_LABELS[record.intensity]||"",record.replacesPlan?`замість ${record.replacesPlan}`:""].filter(Boolean).join(" · ");
    return `<article class="archive-session pool"><div><span>${dateLabel}</span><strong>🏊 Басейн</strong></div><p>${escapeNote(details||"Без додаткових показників")}</p>${record.notes?`<small>${escapeNote(record.notes)}</small>`:""}</article>`;
  }
  const rows=record.exercises.map((exercise,index)=>{
    const values=exercise.sets?.map(set=>formatSet(set,record.planKey,index)).filter(value=>value!=="—").join(" · ");
    return exercise.skippedReason?`<li><span>${escapeNote(exercise.name)}</span><b>Пропущено: ${escapeNote(exercise.skippedReason)}</b></li>`:(values?`<li><span>${escapeNote(exercise.name)}</span><b>${escapeNote(values)}</b></li>`:"");
  }).join("");
  return `<article class="archive-session"><div><span>${dateLabel}</span><strong>Тренування ${record.planKey}</strong></div><p>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"Тривалість не записано"}</p><details><summary>Підходи та повтори</summary><ul>${rows||"<li><span>Деталі не записані</span></li>"}</ul></details></article>`;
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
    return `<section class="program-archive-card"><header><div><strong>${start?dateFormat.format(start):"Без дати"}${end?` — ${dateFormat.format(end)}`:""}</strong><span>Архівовано ${dateFormat.format(new Date(archive.archivedAt))}</span></div><div><b>${workouts} тренувань</b><span>${delta===null?"Вага: —":`Вага: ${delta>0?"+":""}${delta.toFixed(1)} кг`}</span></div></header><details class="archive-history-details"><summary>Детальна історія (${workouts})</summary><div class="archive-session-list">${workouts?archive.history.slice().sort((a,b)=>String(b.performedDate||b.completedAt).localeCompare(String(a.performedDate||a.completedAt))).map(record=>archiveHistoryRecordHTML(record,archive)).join(""):'<div class="archive-empty">Записів тренувань немає.</div>'}</div></details></section>`;
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
  enhancements.weeks=Array.from({length:12},blankEnhancementWeek);enhancements.activeWorkout=null;enhancements.poolDraft=null;enhancements.lastResetSnapshot=null;enhancements.lastHistoryChangeSnapshot=null;
  migrateUnifiedStore();closeGuidedWorkout();renderAll();window.scrollTo({top:0,behavior:"smooth"});showToast("Програму архівовано. Нова 12-тижнева програма готова.");
}

async function exportBackup(){
  try{await navigator.storage?.persist?.();}catch(e){}
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
    writeUnifiedStore(restored);showToast("Копію відновлено. Оновлюю застосунок…");setTimeout(()=>location.reload(),700);
  }catch(e){showToast("Цей файл не є коректною резервною копією трекера.");}
}

function updateProgramStartDate(event){
  const original=event.target.value,selected=parseProgramDate(original),normalized=normalizeProgramStartValue(original);
  if(!selected||!normalized){event.target.value=enhancements.startDate;showToast("Обери коректну дату початку програми.");return;}
  enhancements.startDate=normalized;recalculateCurrentPerformedDates();persistEnhancements();renderAll();
  if(normalized!==original)showToast("Початок тижня автоматично перенесено на понеділок.");
}
document.getElementById("programStartDate").addEventListener("change",updateProgramStartDate);
document.getElementById("mobileProgramStartDate")?.addEventListener("change",updateProgramStartDate);

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
const poolDialog=document.getElementById("poolSessionDialog");
poolDialog.addEventListener("cancel",event=>{event.preventDefault();closePoolSession();});
poolDialog.addEventListener("close",()=>document.body.classList.remove("pool-open"));
const historyEditDialog=document.getElementById("historyEditDialog");
historyEditDialog.addEventListener("cancel",event=>{event.preventDefault();closeHistoryEditor();});
historyEditDialog.addEventListener("close",()=>document.body.classList.remove("history-edit-open"));

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}

migrateUnifiedStore();renderAll();
