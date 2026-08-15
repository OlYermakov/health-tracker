const LEGACY_ENHANCEMENTS_KEY="healthTrackerEnhancements_v2";

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
  return {sets:Array.from({length:count},blankSet)};
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
  return {version:4,startDate:localISODate(currentWeekMonday()),lastBackupAt:"",activeWorkout:null,weeks:Array.from({length:12},blankEnhancementWeek)};
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
    return {sets:Array.from({length:count},(_,index)=>normalizedSet(source.sets[index]))};
  }
  const weights=String(source?.weight??"").split(/[,;\/]+/).map(value=>value.trim()).filter(Boolean);
  const reps=String(source?.reps??"").split(/[,;\/]+/).map(value=>value.trim()).filter(Boolean);
  return {
    sets:Array.from({length:targetCount},(_,index)=>normalizedSet({
      weight:weights[index]??weights[0]??"",
      reps:reps[index]??"",
      done:Boolean(source?.done)
    }))
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
    restUntil:typeof source.restUntil==="string"?source.restUntil:""
  };
}

function normalizeEnhancements(parsed){
  const clean=defaultEnhancements();
  if(!parsed||typeof parsed!=="object")return clean;
  clean.startDate=/^\d{4}-\d{2}-\d{2}$/.test(parsed.startDate||"")?parsed.startDate:clean.startDate;
  clean.lastBackupAt=typeof parsed.lastBackupAt==="string"?parsed.lastBackupAt:"";
  clean.activeWorkout=normalizeActiveWorkout(parsed.activeWorkout);
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
    week.training.A.done||week.training.B.done);
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
  const workouts=state.weeks.reduce((sum,week)=>sum+completedGymCount(week),0);
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
  document.getElementById("activityMinutes").value=week.activity;
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
  renderWellbeing();renderToday();renderHistory();renderSummary();updateChartSummaries();
}

function exerciseLog(weekIndex,planKey,exerciseIndex){
  return enhancements.weeks?.[weekIndex]?.logs?.[planKey]?.[exerciseIndex];
}

function syncExerciseCompletion(weekIndex,planKey,exerciseIndex){
  const log=exerciseLog(weekIndex,planKey,exerciseIndex);
  state.weeks[weekIndex].training[planKey].exercises[exerciseIndex]=Boolean(log?.sets?.length)&&log.sets.every(set=>set.done);
}

function setAllExerciseSetsDone(weekIndex,planKey,exerciseIndex,done){
  const log=exerciseLog(weekIndex,planKey,exerciseIndex);
  if(!log)return;
  log.sets.forEach(set=>{set.done=Boolean(done);});persistEnhancements();
}

function updateExerciseSetValue(planKey,exerciseIndex,setIndex,key,value){
  if(!["weight","reps"].includes(key))return;
  const set=exerciseLog(currentWeek-1,planKey,exerciseIndex)?.sets?.[setIndex];
  if(!set)return;
  set[key]=String(value).slice(0,key==="weight"?20:24);persistEnhancements();
}

function updateGuidedSetValue(planKey,exerciseIndex,setIndex,key,value){updateExerciseSetValue(planKey,exerciseIndex,setIndex,key,value);}

function toggleExerciseSet(planKey,exerciseIndex,setIndex,fromGuided=false){
  const set=exerciseLog(currentWeek-1,planKey,exerciseIndex)?.sets?.[setIndex];
  if(!set)return;
  set.done=!set.done;syncExerciseCompletion(currentWeek-1,planKey,exerciseIndex);
  persistEnhancements();persist();
  if(fromGuided&&set.done)startRestTimer(60);
  renderTraining();
  if(fromGuided)renderGuidedWorkout();else renderHistory();
}

function formatSet(set){
  const weight=String(set?.weight||"").trim(),reps=String(set?.reps||"").trim();
  if(!weight&&!reps)return "—";
  if(weight&&reps)return `${weight} кг × ${reps}`;
  return weight?`${weight} кг`:reps;
}

function previousExerciseResult(weekIndex,planKey,exerciseIndex){
  for(let index=weekIndex-1;index>=0;index--){
    const log=exerciseLog(index,planKey,exerciseIndex);
    if(log?.sets?.some(set=>set.weight||set.reps||set.done))return {week:index+1,text:log.sets.map(formatSet).join(" · ")};
  }
  return null;
}

function setRowsHTML(planKey,exerciseIndex,log,guided=false){
  return log.sets.map((set,setIndex)=>`
    <div class="set-row ${set.done?"done":""}">
      <span class="set-number">${setIndex+1}</span>
      <label><span>Вага, кг</span><input type="text" inputmode="decimal" maxlength="20" value="${escapeNote(set.weight)}" placeholder="—" oninput="${guided?"updateGuidedSetValue":"updateExerciseSetValue"}('${planKey}',${exerciseIndex},${setIndex},'weight',this.value)"></label>
      <label><span>Повтори / час</span><input type="text" inputmode="decimal" maxlength="24" value="${escapeNote(set.reps)}" placeholder="напр. 12" oninput="${guided?"updateGuidedSetValue":"updateExerciseSetValue"}('${planKey}',${exerciseIndex},${setIndex},'reps',this.value)"></label>
      <button class="set-done" type="button" onclick="toggleExerciseSet('${planKey}',${exerciseIndex},${setIndex},${guided})" aria-pressed="${set.done}" aria-label="Підхід ${setIndex+1}: ${set.done?"виконано":"позначити виконаним"}">✓</button>
    </div>`).join("");
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
  const other=currentPlan==="A"?"B":"A",otherDay=state.weeks[currentWeek-1].training[other].day;
  const daySelect=document.getElementById("sessionDay");
  if(daySelect&&otherDay!==""){
    const option=daySelect.querySelector(`option[value="${otherDay}"]`);
    if(option&&String(daySelect.value)!==String(otherDay)){option.disabled=true;option.textContent+=` · зайнято тренуванням ${other}`;}
  }
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
  const planned=["A","B"].filter(planKey=>String(week.training[planKey].day)===String(dayIndex));
  const workoutHTML=planned.length?planned.map(planKey=>{
    const session=week.training[planKey],completed=session.exercises.filter(Boolean).length;
    return `<div class="today-workout ${session.done?"done":""}"><div><span>${session.done?"Завершено":"Заплановано сьогодні"}</span><strong>Тренування ${planKey}</strong><small>${completed} / ${WORKOUT_PLANS[planKey].exercises.length} вправ</small></div><button type="button" onclick="openTodayWorkout(${weekIndex},'${planKey}',${!session.done})">${session.done?"Переглянути":"Почати"}</button></div>`;
  }).join(""):`<div class="today-no-workout"><span>Сьогодні тренування не заплановане.</span><button type="button" onclick="openTodayWorkout(${weekIndex},'A',false)">Відкрити програму</button></div>`;
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
  const records=[];
  state.weeks.forEach((week,weekIndex)=>["A","B"].forEach(planKey=>{
    const session=week.training[planKey];if(!session.done)return;
    const completedDate=session.completedAt?new Date(session.completedAt):programDayDate(weekIndex,session.day);
    const validDate=completedDate&&!Number.isNaN(completedDate.getTime())?completedDate:null;
    records.push({weekIndex,planKey,session,date:validDate,sort:validDate?.getTime()||weekIndex});
  }));
  return records.sort((a,b)=>b.sort-a.sort);
}

function renderHistory(){
  const list=document.getElementById("historyList"),count=document.getElementById("historyCount");if(!list||!count)return;
  const records=trainingRecords();count.textContent=`${records.length} ${records.length===1?"запис":"записів"}`;
  if(!records.length){list.innerHTML=`<div class="history-empty"><strong>Історія поки порожня</strong><span>Завершене тренування автоматично з’явиться тут разом із підходами та тривалістю.</span></div>`;return;}
  const dateFormat=new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long",year:"numeric"});
  list.innerHTML=records.map(record=>{
    const plan=WORKOUT_PLANS[record.planKey],completed=record.session.exercises.filter(Boolean).length;
    const rows=plan.exercises.map((exercise,index)=>{
      const log=exerciseLog(record.weekIndex,record.planKey,index);
      if(!record.session.exercises[index]&&!log?.sets?.some(set=>set.weight||set.reps))return "";
      return `<li><span>${escapeNote(exercise.name)}</span><strong>${escapeNote(log?.sets?.map(formatSet).join(" · ")||"Виконано")}</strong></li>`;
    }).join("");
    return `<article class="history-card"><div class="history-card-top"><div><span>${record.date?dateFormat.format(record.date):`Тиждень ${record.weekIndex+1}`}</span><h3>Тренування ${record.planKey}</h3></div><div class="history-metrics"><span>${record.session.durationMinutes?`${escapeNote(record.session.durationMinutes)} хв`:"час не записано"}</span><span>${completed} / ${plan.exercises.length} вправ</span></div></div><details><summary>Показати результати</summary><ul>${rows||"<li><span>Результати підходів не записані</span></li>"}</ul></details><button class="history-open" type="button" onclick="openHistorySession(${record.weekIndex},'${record.planKey}')">Відкрити тиждень ${record.weekIndex+1}</button></article>`;
  }).join("");
}

function openHistorySession(weekIndex,planKey){
  currentWeek=weekIndex+1;currentPlan=planKey;renderAll();document.getElementById("training")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function guidedWorkoutButtonLabel(planKey){
  const active=enhancements.activeWorkout;
  return active&&active.week===currentWeek-1&&active.plan===planKey?"▶ Продовжити тренування":"▶ Почати тренування";
}

function startGuidedWorkout(planKey){
  currentPlan=planKey;
  const session=state.weeks[currentWeek-1].training[planKey],existing=enhancements.activeWorkout;
  if(!existing||existing.week!==currentWeek-1||existing.plan!==planKey){
    const firstIncomplete=session.exercises.findIndex(done=>!done);
    enhancements.activeWorkout={week:currentWeek-1,plan:planKey,index:firstIncomplete<0?0:firstIncomplete,startedAt:new Date().toISOString(),restUntil:""};
  }
  persistEnhancements();renderGuidedWorkout();
  const dialog=document.getElementById("guidedWorkoutDialog");document.body.classList.add("guided-open");
  if(dialog&&!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
  ensureGuidedTimer();
}

function guidedDayOptions(planKey){
  const week=state.weeks[currentWeek-1],session=week.training[planKey],other=planKey==="A"?"B":"A";
  return `<option value="">Обери день</option>`+days.map((day,index)=>{
    const occupied=String(week.training[other].day)===String(index)&&String(session.day)!==String(index);
    return `<option value="${index}" ${String(session.day)===String(index)?"selected":""} ${occupied?"disabled":""}>${day.name}${occupied?` · тренування ${other}`:""}</option>`;
  }).join("");
}

function renderGuidedWorkout(){
  const active=enhancements.activeWorkout,content=document.getElementById("guidedWorkoutContent");if(!active||!content)return;
  if(currentWeek!==active.week+1)currentWeek=active.week+1;currentPlan=active.plan;
  const plan=WORKOUT_PLANS[active.plan],exercise=plan.exercises[active.index],log=exerciseLog(active.week,active.plan,active.index);
  const technique=EXERCISE_TECHNIQUE?.[active.plan]?.[active.index],previous=previousExerciseResult(active.week,active.plan,active.index);
  const completed=state.weeks[active.week].training[active.plan].exercises.filter(Boolean).length;
  document.getElementById("guidedPlanLabel").textContent=`${plan.title} · тиждень ${active.week+1}`;
  document.getElementById("guidedProgress").textContent=`${active.index+1} / ${plan.exercises.length}`;
  content.innerHTML=`
    <div class="guided-progress-track"><i style="width:${Math.round((active.index+1)/plan.exercises.length*100)}%"></i></div>
    <div class="guided-layout"><div class="guided-visual"><img src="assets/exercises/${exercise.image}" alt="Людина виконує вправу «${escapeNote(exercise.name)}»" width="720" height="720"></div><div class="guided-copy"><div class="exercise-meta"><span>${escapeNote(exercise.tag)}</span><strong>${escapeNote(exercise.dose)}</strong></div><h2>${escapeNote(exercise.name)}</h2><p>${escapeNote(exercise.note)}</p><div class="guided-technique"><strong>Підготовка</strong><span>${escapeNote(technique?.setup||"")}</span>${technique?.steps?.[0]?`<small>Перший крок: ${escapeNote(technique.steps[0])}</small>`:""}</div><div class="previous-result guided-previous"><span>Минулого разу</span><strong>${previous?`Тиждень ${previous.week}: ${escapeNote(previous.text)}`:"Ще немає запису"}</strong></div></div></div>
    <div class="guided-sets"><div class="guided-section-title"><strong>Підходи</strong><span>${completed} / ${plan.exercises.length} вправ завершено</span></div>${setRowsHTML(active.plan,active.index,log,true)}</div>
    <div class="guided-rest"><div><span>Відпочинок</span><strong id="restTimerDisplay">Готовий до наступного підходу</strong></div><div><button type="button" onclick="startRestTimer(60)">1:00</button><button type="button" onclick="startRestTimer(90)">1:30</button><button type="button" onclick="startRestTimer(120)">2:00</button><button class="rest-skip" type="button" onclick="skipRestTimer()">Пропустити</button></div></div>
    <div class="guided-day"><label for="guidedSessionDay">День тренування</label><select id="guidedSessionDay" onchange="setGuidedDay(this.value)">${guidedDayOptions(active.plan)}</select></div>
    <div class="guided-reset-panel"><div><strong>Почати заново?</strong><small>Перезапуск збереже вагу, повтори та вибраний день. Повне скидання очистить усі дані цього тренування.</small></div><div class="guided-reset-buttons"><button type="button" onclick="restartGuidedWorkout(false)">↻ Перезапустити</button><button class="guided-reset-all" type="button" onclick="restartGuidedWorkout(true)">Скинути повністю</button></div></div>
    <footer class="guided-actions"><button type="button" onclick="guidedNavigate(-1)" ${active.index===0?"disabled":""}>← Попередня</button>${active.index<plan.exercises.length-1?`<button class="guided-next" type="button" onclick="guidedNavigate(1)">Наступна →</button>`:`<button class="guided-finish" type="button" onclick="finishGuidedWorkout()">Завершити тренування</button>`}</footer>`;
  updateRestTimer();
}

function setGuidedDay(value){const active=enhancements.activeWorkout;if(!active)return;setSessionDay(active.plan,value);renderGuidedWorkout();}

function guidedNavigate(delta){
  const active=enhancements.activeWorkout;if(!active)return;
  active.index=Math.max(0,Math.min(WORKOUT_PLANS[active.plan].exercises.length-1,active.index+delta));persistEnhancements();renderGuidedWorkout();
  document.querySelector(".guided-shell")?.scrollTo({top:0,behavior:"smooth"});
}

function activeWorkoutMinutes(active=enhancements.activeWorkout){
  const started=active?.startedAt?new Date(active.startedAt).getTime():NaN;
  return Number.isFinite(started)?Math.max(1,Math.round((Date.now()-started)/60000)):"";
}

function consumeActiveWorkoutDuration(planKey){
  const active=enhancements.activeWorkout;if(!active||active.week!==currentWeek-1||active.plan!==planKey)return "";
  const minutes=activeWorkoutMinutes(active);enhancements.activeWorkout=null;persistEnhancements();return minutes;
}

function restartGuidedWorkout(clearAll=false){
  const active=enhancements.activeWorkout;if(!active)return;
  const message=clearAll?
    "Буде видалено всі ваги, повтори, позначки виконання, вибраний день і запис в історії для цього тренування. Скинути повністю?":
    "Виконані підходи, таймер, тривалість і запис про завершення буде скинуто. Вага, повтори та вибраний день залишаться. Перезапустити тренування?";
  if(!window.confirm(message))return;
  const session=state.weeks[active.week].training[active.plan];
  session.exercises=session.exercises.map(()=>false);
  session.done=false;session.completedAt="";session.durationMinutes="";
  if(clearAll)session.day="";
  enhancements.weeks[active.week].logs[active.plan].forEach(log=>log.sets.forEach(set=>{
    set.done=false;
    if(clearAll){set.weight="";set.reps="";}
  }));
  active.index=0;active.startedAt=new Date().toISOString();active.restUntil="";
  persistEnhancements();persist();renderAll();renderGuidedWorkout();
  showToast(clearAll?"Дані тренування повністю скинуто.":"Тренування перезапущено.");
}

function finishGuidedWorkout(){
  const active=enhancements.activeWorkout;if(!active)return;
  const session=state.weeks[active.week].training[active.plan];
  if(session.day===""){showToast("Обери день тренування перед завершенням.");document.getElementById("guidedSessionDay")?.focus();return;}
  session.exercises.forEach((_,index)=>syncExerciseCompletion(active.week,active.plan,index));
  const completed=session.exercises.filter(Boolean).length;
  if(completed<MIN_EXERCISES_TO_COMPLETE){showToast(`Заверши щонайменше ${MIN_EXERCISES_TO_COMPLETE} вправи.`);return;}
  const other=active.plan==="A"?"B":"A",otherSession=state.weeks[active.week].training[other];
  if(otherSession.done&&String(otherSession.day)===String(session.day)){showToast(`Тренування ${other} вже зараховане в цей день.`);return;}
  session.done=true;session.completedAt=new Date().toISOString();session.durationMinutes=activeWorkoutMinutes(active);
  enhancements.activeWorkout=null;persistEnhancements();persist();closeGuidedWorkout();renderAll();showToast("Тренування збережено в історії.");
}

let guidedTimerInterval=null;

function ensureGuidedTimer(){if(!guidedTimerInterval)guidedTimerInterval=setInterval(updateRestTimer,1000);}

function startRestTimer(seconds){
  const active=enhancements.activeWorkout;if(!active)return;
  active.restUntil=new Date(Date.now()+seconds*1000).toISOString();persistEnhancements();ensureGuidedTimer();updateRestTimer();
}

function skipRestTimer(){if(!enhancements.activeWorkout)return;enhancements.activeWorkout.restUntil="";persistEnhancements();updateRestTimer();}

function updateRestTimer(){
  const display=document.getElementById("restTimerDisplay"),active=enhancements.activeWorkout;if(!display||!active)return;
  const remaining=active.restUntil?Math.max(0,Math.ceil((new Date(active.restUntil).getTime()-Date.now())/1000)):0;
  display.closest(".guided-rest")?.classList.toggle("running",remaining>0);
  if(!remaining){display.textContent=active.restUntil?"Відпочинок завершено":"Готовий до наступного підходу";return;}
  display.textContent=`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")}`;
}

function closeGuidedWorkout(){
  const dialog=document.getElementById("guidedWorkoutDialog");
  if(dialog?.open&&typeof dialog.close==="function")dialog.close();else dialog?.removeAttribute("open");
  document.body.classList.remove("guided-open");renderTraining();
}

function exportBackup(){
  const payload={format:"health-tracker-backup",version:4,exportedAt:new Date().toISOString(),tracker:state,notes:dayNotes,enhancements};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download=`health-tracker-backup-${localISODate()}.json`;link.click();URL.revokeObjectURL(url);
  enhancements.lastBackupAt=new Date().toISOString();persistEnhancements();renderSummary();showToast("Резервну копію завантажено.");
}

async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    if(payload?.format!=="health-tracker-backup"||!Array.isArray(payload?.tracker?.weeks)||payload.tracker.weeks.length!==12)throw new Error("invalid");
    const restored={version:4,tracker:normalizeState(payload.tracker),notes:normalizeNotes(payload.notes),enhancements:normalizeEnhancements(payload.enhancements)};
    localStorage.setItem(UNIFIED_KEY,JSON.stringify(restored));showToast("Копію відновлено. Оновлюю застосунок…");setTimeout(()=>location.reload(),700);
  }catch(e){showToast("Цей файл не є коректною резервною копією трекера.");}
}

fillNumberSelect("energyLevel",1,10);fillNumberSelect("leftKneePain",0,10);fillNumberSelect("rightKneePain",0,10);

document.getElementById("programStartDate").addEventListener("change",event=>{
  if(!parseProgramDate(event.target.value))return;enhancements.startDate=event.target.value;persistEnhancements();renderAll();
});

const wellbeingBindings={sleepHours:"sleep",energyLevel:"energy",activityMinutes:"activity",leftKneePain:"painLeft",rightKneePain:"painRight"};
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
document.getElementById("guidedWorkoutDialog").addEventListener("close",()=>document.body.classList.remove("guided-open"));

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}

migrateUnifiedStore();renderMood();renderAll();
