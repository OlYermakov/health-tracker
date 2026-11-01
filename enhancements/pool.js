// Pool sessions.
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
    <div class="pool-intro"><div aria-hidden="true">${poolIconSVG()}</div><div><h2>Запис тренування у басейні</h2><p>Басейн зарахується як одне з двох тренувань тижня і як активність цього дня.</p></div></div>
    <div class="pool-form-grid">
      <label><span>Що замінює?</span><select ${act("change","updatePoolDraft","replacesPlan","$value")}><option value="" ${draft.replacesPlan===""?"selected":""}>Окреме тренування</option><option value="A" ${draft.replacesPlan==="A"?"selected":""}>Замість тренування A</option><option value="B" ${draft.replacesPlan==="B"?"selected":""}>Замість тренування B</option></select></label>
      <label><span>День</span><select id="poolDay" ${act("change","updatePoolDraft","day","$value")}>${poolDayOptions(draft)}</select></label>
      <label><span>Тривалість, хв</span><input type="number" inputmode="numeric" min="5" max="240" step="1" value="${escapeNote(draft.durationMinutes)}" placeholder="Напр. 40" ${act("input","updatePoolDraft","durationMinutes","$value")}></label>
      <label><span>Дистанція, м · необов’язково</span><input type="number" inputmode="numeric" min="0" max="20000" step="25" value="${escapeNote(draft.distanceMeters)}" placeholder="Напр. 800" ${act("input","updatePoolDraft","distanceMeters","$value")}></label>
      <label><span>Вид активності</span><select ${act("change","updatePoolDraft","swimStyle","$value")}><option value="">Обери</option>${Object.entries(SWIM_STYLE_LABELS).map(([value,label])=>`<option value="${value}" ${draft.swimStyle===value?"selected":""}>${label}</option>`).join("")}</select></label>
      <label><span>Інтенсивність</span><select ${act("change","updatePoolDraft","intensity","$value")}><option value="">Обери</option>${Object.entries(INTENSITY_LABELS).map(([value,label])=>`<option value="${value}" ${draft.intensity===value?"selected":""}>${label}</option>`).join("")}</select></label>
    </div>
    <div class="pool-knee-panel"><div><strong>Коліна до і після</strong><span>0 — болю немає, 10 — найсильніший біль</span></div><div class="pool-pain-grid"><label>Ліве · до<select ${act("change","updatePoolDraft","painBeforeLeft","$value")}>${painOptions(draft.painBeforeLeft)}</select></label><label>Праве · до<select ${act("change","updatePoolDraft","painBeforeRight","$value")}>${painOptions(draft.painBeforeRight)}</select></label><label>Ліве · після<select ${act("change","updatePoolDraft","painAfterLeft","$value")}>${painOptions(draft.painAfterLeft)}</select></label><label>Праве · після<select ${act("change","updatePoolDraft","painAfterRight","$value")}>${painOptions(draft.painAfterRight)}</select></label></div>${painWarning}</div>
    <div class="pool-safety-note"><strong>Для колін</strong><span>Віддавай перевагу кролю, плаванню на спині або акваходьбі. Якщо «жаб’ячий» рух ногами під час брасу викликає дискомфорт — не використовуй його.</span></div>
    <label class="pool-notes"><span>Нотатка · необов’язково</span><textarea maxlength="500" rows="3" placeholder="Самопочуття, темп або що змінити наступного разу" ${act("input","updatePoolDraft","notes","$value")}>${escapeNote(draft.notes)}</textarea></label>
    <footer class="pool-actions"><button class="pool-reset" type="button" ${act("click","resetPoolDraft")}>Очистити</button><button class="pool-save" type="button" ${act("click","savePoolSession")}>Зарахувати басейн</button></footer>`;
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
