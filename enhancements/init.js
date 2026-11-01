// Startup: load state, migrate legacy data, wire up events and render.
// Loaded last so every function from the other enhancement files is already defined.
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
if(canShareBackupFiles())document.querySelectorAll("[data-share-backup]").forEach(button=>{button.hidden=false;button.addEventListener("click",shareBackup);});
document.getElementById("importBackup").addEventListener("click",openBackupPicker);
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
// Ask the browser not to evict local data (Safari clears storage of rarely used sites).
if(navigator.storage?.persist){navigator.storage.persisted?.().then(already=>already||navigator.storage.persist()).catch(()=>{});}

migrateUnifiedStore();renderAll();
