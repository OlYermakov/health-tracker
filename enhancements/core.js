// Shared helpers: persistence, dates, toast, wellbeing and summary rendering.
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
    <label><span>Сон, год</span><input type="number" inputmode="decimal" min="0" max="16" step="0.25" value="${escapeNote(daily.sleep)}" placeholder="7.5" aria-label="${days[dayIndex].name}: сон у годинах" ${act("input","updateDailyWellbeing",weekIndex,dayIndex,"sleep","$value","$el")}></label>
    <label><span>Енергія</span><select aria-label="${days[dayIndex].name}: енергія від 1 до 10" ${act("change","updateDailyWellbeing",weekIndex,dayIndex,"energy","$value")}>${dailyMetricOptions(daily.energy,1,10)}</select></label>
    <label><span>Ліве коліно</span><select aria-label="${days[dayIndex].name}: біль у лівому коліні від 0 до 10" ${act("change","updateDailyWellbeing",weekIndex,dayIndex,"painLeft","$value")}>${dailyMetricOptions(daily.painLeft,0,10)}</select></label>
    <label><span>Праве коліно</span><select aria-label="${days[dayIndex].name}: біль у правому коліні від 0 до 10" ${act("change","updateDailyWellbeing",weekIndex,dayIndex,"painRight","$value")}>${dailyMetricOptions(daily.painRight,0,10)}</select></label>
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
