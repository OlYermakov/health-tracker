// Guided workout dialog, pause/resume and rest timer.
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
    ${paused?`<div class="guided-pause-banner"><div><strong>Тренування на паузі</strong><span>Час паузи не потрапить у тривалість. Таймер відпочинку також зупинено.</span></div><button type="button" ${act("click","resumeGuidedWorkout")}>Продовжити</button></div>`:""}
    <div class="guided-paused-body" ${paused?"inert":""}>
    <div class="guided-layout"><button type="button" class="guided-visual" ${act("click","openExerciseImage",active.plan,active.index)} aria-label="Збільшити фото вправи «${escapeNote(exercise.name)}»"><img src="assets/exercises/${exercise.image}" alt="Людина виконує вправу «${escapeNote(exercise.name)}»" width="720" height="720"></button><div class="guided-copy"><div class="exercise-meta"><span>${escapeNote(exercise.tag)}</span><strong>${escapeNote(exercise.dose)}</strong></div><h2>${escapeNote(exercise.name)}</h2><p>${escapeNote(exercise.note)}</p><div class="guided-technique"><strong>Підготовка</strong><span>${escapeNote(technique?.setup||"")}</span>${technique?.steps?.[0]?`<small>Перший крок: ${escapeNote(technique.steps[0])}</small>`:""}</div><div class="previous-result guided-previous"><span>Минулого разу</span><strong>${previous?`Тиждень ${previous.week}: ${escapeNote(previous.text)}`:"Ще немає запису"}</strong></div>${progressionHintHTML(active.plan,active.index,previous)}</div></div>
    <div class="guided-sets"><div class="guided-section-title"><strong>Підходи</strong><span>${completed} / ${plan.exercises.length} вправ завершено</span></div>${setRowsHTML(active.plan,active.index,log,true)}<label class="guided-skip"><span>Якщо вправу пропущено — причина</span><select ${act("change","updateExerciseSkipReason",active.plan,active.index,"$value")}>${skipReasonOptions(log.skippedReason)}</select></label></div>
    <div class="guided-rest"><div><span>Відпочинок</span><strong id="restTimerDisplay">Готовий до наступного підходу</strong></div><div><button type="button" ${act("click","startRestTimer",60)}>1:00</button><button type="button" ${act("click","startRestTimer",90)}>1:30</button><button type="button" ${act("click","startRestTimer",120)}>2:00</button><button class="timer-signal ${enhancements.timerSignal?"on":""}" type="button" ${act("click","toggleTimerSignal")} aria-pressed="${enhancements.timerSignal}">🔔 Сигнал</button><button class="rest-skip" type="button" ${act("click","skipRestTimer")}>Пропустити</button></div></div>
    <div class="guided-pain"><div><strong>Коліна до і після тренування</strong><span>0 — болю немає, 10 — найсильніший біль</span></div><div class="guided-pain-grid"><label>Ліве · до<select ${act("change","updateGuidedPain","painBeforeLeft","$value")}>${painOptions(active.painBeforeLeft)}</select></label><label>Праве · до<select ${act("change","updateGuidedPain","painBeforeRight","$value")}>${painOptions(active.painBeforeRight)}</select></label><label>Ліве · після<select ${act("change","updateGuidedPain","painAfterLeft","$value")}>${painOptions(active.painAfterLeft)}</select></label><label>Праве · після<select ${act("change","updateGuidedPain","painAfterRight","$value")}>${painOptions(active.painAfterRight)}</select></label></div>${painWarning}</div>
    <div class="guided-day"><label for="guidedSessionDay">День тренування</label><select id="guidedSessionDay" ${act("change","setGuidedDay","$value")}>${guidedDayOptions(active.plan)}</select></div>
    <div class="guided-reset-panel"><div><strong>Почати заново?</strong><small>Перезапуск збереже вагу, повтори та вибраний день. Історія завершених спроб не видаляється.</small></div><div class="guided-reset-buttons">${recentResetAvailable(active)?`<button class="guided-undo" type="button" ${act("click","undoWorkoutReset")}>↶ Відновити</button>`:""}<button type="button" ${act("click","restartGuidedWorkout",false)}>↻ Перезапустити</button><details class="guided-danger-menu"><summary aria-label="Додаткові дії з тренуванням">⋯</summary><div class="guided-danger-popover"><strong>Очищення чернетки</strong><button class="guided-reset-all" type="button" ${act("click","restartGuidedWorkout",true)}>Скинути повністю</button></div></details></div></div>
    <footer class="guided-actions"><button type="button" ${act("click","guidedNavigate",-1)} ${active.index===0?"disabled":""}>← Попередня</button>${active.index<plan.exercises.length-1?`<button class="guided-next" type="button" ${act("click","guidedNavigate",1)}>Наступна →</button>`:`<button class="guided-finish" type="button" ${act("click","finishGuidedWorkout")}>Завершити тренування</button>`}</footer>
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
