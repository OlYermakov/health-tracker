// Workout history: listing, correcting, cancelling and undoing records.
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
  return `<div class="history-actions"><button type="button" ${act("click","openHistoryEditor",id)}>Виправити</button><button class="history-cancel" type="button" ${act("click","cancelHistoryRecord",id)}>Скасувати запис</button></div>`;
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
    <footer class="history-edit-actions"><button type="button" ${act("click","closeHistoryEditor")}>Закрити</button><button class="history-edit-save" type="submit">Зберегти виправлення</button></footer>`;
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
      return `<article class="history-card pool-history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>🏊 Басейн</h3></div><div class="history-metrics"><span>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"час не записано"}</span>${record.distanceMeters?`<span>${escapeNote(record.distanceMeters)} м</span>`:""}${pain}</div></div><details><summary>Показати результати</summary><ul>${poolDetails||"<li><span>Додаткові показники не записані</span></li>"}</ul>${notes}</details><button class="history-open" type="button" ${act("click","openHistorySession",record.weekIndex,"POOL")}>Відкрити тиждень ${record.weekIndex+1}</button>${historyActionsHTML(record)}</article>`;
    }
    const plan=WORKOUT_PLANS[record.planKey];
    const completed=record.exercises.filter(exercise=>exercise.sets.length&&exercise.sets.every(set=>set.done)).length;
    const rows=plan.exercises.map((exercise,index)=>{
      const snapshot=record.exercises[index];
      if(snapshot?.skippedReason)return `<li><span>${escapeNote(exercise.name)}</span><strong class="history-skipped">Пропущено: ${escapeNote(snapshot.skippedReason)}</strong></li>`;
      if(!snapshot?.sets?.some(set=>set.weight||set.reps||set.done))return "";
      return `<li><span>${escapeNote(exercise.name)}</span><strong>${escapeNote(snapshot.sets.map(set=>formatSet(set,record.planKey,index)).join(" · ")||"Виконано")}</strong></li>`;
    }).join("");
    return `<article class="history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>Тренування ${record.planKey}</h3></div><div class="history-metrics"><span>${record.durationMinutes?`${escapeNote(record.durationMinutes)} хв`:"час не записано"}</span><span>${completed} / ${plan.exercises.length} вправ</span>${pain}</div></div><details><summary>Показати результати</summary><ul>${rows||"<li><span>Результати підходів не записані</span></li>"}</ul></details><button class="history-open" type="button" ${act("click","openHistorySession",record.weekIndex,record.planKey)}>Відкрити тиждень ${record.weekIndex+1}</button>${historyActionsHTML(record)}</article>`;
  }).join("");
}

function openHistorySession(weekIndex,planKey){
  currentWeek=weekIndex+1;if(planKey!=="POOL")currentPlan=planKey;renderAll();
  if(typeof navigateToAppScreen==="function")navigateToAppScreen("training",{updateHistory:true});
  else document.getElementById(planKey==="POOL"?"trainingHistory":"training")?.scrollIntoView({behavior:"smooth",block:"start"});
}
