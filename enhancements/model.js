// Data model: defaults, normalization and loading of the enhancements store.
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
