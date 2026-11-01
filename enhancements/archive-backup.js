// Program archive, JSON backup export/import and program start date.
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
  const analytics=typeof getHealthAnalyticsBackup==="function"?await getHealthAnalyticsBackup():null;
  const payload={format:"health-tracker-backup",version:ENHANCEMENTS_VERSION,exportedAt:new Date().toISOString(),tracker:state,notes:dayNotes,enhancements,analytics};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`health-tracker-backup-${localISODate()}.json`;link.click();URL.revokeObjectURL(url);
  enhancements.lastBackupAt=new Date().toISOString();persistEnhancements();renderSummary();showToast("Резервну копію завантажено.");
}

async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    if(payload?.format!=="health-tracker-backup"||!Array.isArray(payload?.tracker?.weeks)||payload.tracker.weeks.length!==12)throw new Error("invalid");
    const restored={version:ENHANCEMENTS_VERSION,tracker:normalizeState(payload.tracker),notes:normalizeNotes(payload.notes),enhancements:normalizeEnhancements(payload.enhancements)};
    writeUnifiedStore(restored);
    if(payload.analytics&&typeof restoreHealthAnalyticsBackup==="function")await restoreHealthAnalyticsBackup(payload.analytics);
    showToast("Копію відновлено. Оновлюю застосунок…");setTimeout(()=>location.reload(),700);
  }catch(e){showToast("Цей файл не є коректною резервною копією трекера.");}
}

function updateProgramStartDate(event){
  const original=event.target.value,selected=parseProgramDate(original),normalized=normalizeProgramStartValue(original);
  if(!selected||!normalized){event.target.value=enhancements.startDate;showToast("Обери коректну дату початку програми.");return;}
  enhancements.startDate=normalized;recalculateCurrentPerformedDates();persistEnhancements();renderAll();
  if(normalized!==original)showToast("Початок тижня автоматично перенесено на понеділок.");
}
