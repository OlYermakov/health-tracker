// Per-exercise set logging and the Today screen.
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
  if(recorded)return {week:recorded.weekIndex+1,date:recorded.performedDate||recorded.completedAt,sets:recorded.exercises[exerciseIndex].sets,record:recorded,text:recorded.exercises[exerciseIndex].sets.map(set=>formatSet(set,planKey,exerciseIndex)).join(" · ")};
  for(let index=weekIndex-1;index>=0;index--){
    const log=exerciseLog(index,planKey,exerciseIndex);
    if(log?.sets?.some(set=>set.weight||set.reps||set.done))return {week:index+1,sets:log.sets,record:null,text:log.sets.map(set=>formatSet(set,planKey,exerciseIndex)).join(" · ")};
  }
  return null;
}

const PROGRESSION_STEP_KG=2.5;
const KNEE_PAIN_HOLD_LEVEL=4;
const KNEE_LOADED_TAGS=["Ноги","Сідниці"];

// Upper bound of the prescribed rep range: "2 × 10–12" -> 12, "2 × 10 / сторона" -> 10.
function prescribedRepTarget(exercise){
  const match=String(exercise?.dose||"").match(/[×x]\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
  return match?Number(match[2]||match[1]):null;
}

function leadingNumber(value){
  const match=String(value??"").replace(",",".").match(/\d+(?:\.\d+)?/);
  return match?Number(match[0]):null;
}

function formatKg(value){return `${Number.isInteger(value)?value:value.toFixed(1).replace(".",",")} кг`;}

// Suggests the next working weight from the previous result (double progression):
// once every prescribed set hit the top of the rep range, add a small step.
function progressionHint(planKey,exerciseIndex,previous){
  const exercise=WORKOUT_PLANS[planKey]?.exercises?.[exerciseIndex];
  if(!exercise||exerciseIndex===0||!previous?.sets?.length)return null;
  const target=prescribedRepTarget(exercise);
  if(!target)return null;
  const sets=previous.sets.slice(0,prescribedSetCount(exercise));
  if(sets.length<prescribedSetCount(exercise))return null;
  const weights=sets.map(set=>leadingNumber(set.weight)),reps=sets.map(set=>leadingNumber(set.reps));
  if(weights.some(value=>value===null)||reps.some(value=>value===null))return null;
  const weight=Math.max(...weights);
  const kneePain=Math.max(leadingNumber(previous.record?.painAfterLeft)??0,leadingNumber(previous.record?.painAfterRight)??0);
  if(KNEE_LOADED_TAGS.includes(exercise.tag)&&kneePain>=KNEE_PAIN_HOLD_LEVEL)
    return {type:"hold",text:`Після минулого тренування коліно боліло на ${kneePain}/10 — залиш ${formatKg(weight)} і стеж за відчуттями.`};
  const allTop=sets.every((set,index)=>set.done&&reps[index]>=target);
  if(allTop)return {type:"up",text:`Усі підходи на ${target} повторів — можна спробувати ${formatKg(weight+PROGRESSION_STEP_KG)}.`};
  return {type:"keep",text:`Залиш ${formatKg(weight)}, доки всі підходи не дійдуть до ${target} повторів.`};
}

function progressionHintHTML(planKey,exerciseIndex,previous){
  const hint=progressionHint(planKey,exerciseIndex,previous);
  return hint?`<div class="progression-hint ${hint.type}">${escapeNote(hint.text)}</div>`:"";
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
    wrap.innerHTML=`<div class="previous-result"><span>Минулого разу</span><strong>${previous?`Тиждень ${previous.week}: ${escapeNote(previous.text)}`:"Ще немає запису"}</strong></div>${progressionHintHTML(currentPlan,index,previous)}<div class="set-list">${setRowsHTML(currentPlan,index,logs[index])}</div>`;
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
  const todayNote=dayNotes[weekIndex]?.[dayIndex]||"";
  content.innerHTML=`<div class="today-context"><strong>${days[dayIndex].name} · тиждень ${weekIndex+1}</strong><span>Швидко відміть головне на сьогодні</span></div>
    <div class="today-grid">${habitButtons}</div>
    <section class="today-wellbeing" aria-label="Самопочуття сьогодні">
      <div class="today-section-heading"><strong>Самопочуття</strong><span>Коліна: 0 — болю немає, 10 — найсильніший біль</span></div>
      ${dailyWellbeingHTML(weekIndex,dayIndex)}
      <label class="today-note"><span>Замітка</span><textarea rows="2" maxlength="500" placeholder="Самопочуття, активність або що варто пам’ятати…" aria-label="Замітка на сьогодні" oninput="updateTodayNote(${weekIndex},${dayIndex},this)">${escapeNote(todayNote)}</textarea></label>
    </section>
    <div class="today-workouts">${workoutHTML}</div>`;
  requestAnimationFrame(()=>content.querySelectorAll(".today-note textarea").forEach(autoSizeNote));
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
