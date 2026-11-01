// Weekly summary (week screen) and in-app reminders (Today screen).
// Pure calculations take explicit arguments so they can be tested with fixed dates.

const HABIT_LABELS={breakfast:"білковий сніданок",vegetables:"овочі",water:"вода"};
const WEEKLY_WORKOUT_TARGET=2;
const KNEE_PAIN_WARNING_LEVEL=4;
const BACKUP_REMINDER_DAYS=7;
const EVENING_HOUR=18;
const MORNING_UNTIL_HOUR=14;

const KNEE_PAIN_SEVERE_LEVEL=7;

function weeklySummary(weekIndex){
  const week=state.weeks[weekIndex];
  if(!week)return null;
  const habits=Object.keys(HABIT_LABELS).map(key=>({key,label:HABIT_LABELS[key],days:week.days.filter(day=>day[key]).length}));
  const records=completedTrainingRecordsForWeek(weekIndex);
  const wellbeing=weeklyWellbeingStats(weekIndex);
  const start=weightNumber(week.startWeight),end=weightNumber(week.endWeight);
  return {
    weekIndex,
    habits,
    // Same formula as the "Виконання тижня" ring, so both places show one number.
    completionPercent:Math.round(completionOf(week)*100),
    habitMarks:habits.reduce((sum,habit)=>sum+habit.days,0),
    activeDays:activityCount(week),
    workouts:records.length,
    gym:records.filter(record=>!isPoolRecord(record)).length,
    pool:records.filter(isPoolRecord).length,
    sleepAverage:wellbeing.sleepAverage,
    sleepDays:wellbeing.sleepDays,
    energyAverage:wellbeing.energyAverage,
    energyDays:wellbeing.energyDays,
    painAverage:wellbeing.painAverage,
    painMaximum:wellbeing.painMaximum,
    completeDays:wellbeing.completeDays,
    weightChange:start!==null&&end!==null?end-start:null,
    hasData:activeWeek(week,weekIndex)
  };
}

// Is this week still running? Then the summary talks about "the rest of the week", not "next week".
function weekProgress(weekIndex,now=new Date()){
  const position=programPosition(now);
  if(position.status==="active"&&position.weekIndex===weekIndex)return {inProgress:true,daysPassed:position.dayIndex+1,daysLeft:7-position.dayIndex};
  return {inProgress:false,daysPassed:7,daysLeft:0};
}

// Advice based on the weakest area. Knee pain always comes first.
function weeklyFocus(summary,progress={inProgress:false,daysPassed:7,daysLeft:0}){
  if(!summary?.hasData)return "";
  const live=progress.inProgress,dayWord=n=>n===1?"день":n<5?"дні":"днів";
  if(summary.painMaximum!==null&&summary.painMaximum>=KNEE_PAIN_SEVERE_LEVEL)
    return `Біль у колінах доходив до ${summary.painMaximum}/10 — це сильний біль. Не тренуйся через біль і обговори стан із лікарем або фізіотерапевтом.`;
  if(summary.painMaximum!==null&&summary.painMaximum>=KNEE_PAIN_WARNING_LEVEL)
    return `Біль у колінах доходив до ${summary.painMaximum}/10. ${live?"У найближчих тренуваннях":"Наступного тижня"} зменш вагу й амплітуду у вправах на ноги та стеж, чи немає набряку, блокування або нестабільності. Якщо біль не минає — порадься з лікарем чи фізіотерапевтом.`;
  if(summary.workouts<WEEKLY_WORKOUT_TARGET)
    return live
      ?`Поки що тренувань ${summary.workouts} з ${WEEKLY_WORKOUT_TARGET}, до кінця тижня ${progress.daysLeft} ${dayWord(progress.daysLeft)} — обери, коли надолужити.`
      :`Тренувань ${summary.workouts} з ${WEEKLY_WORKOUT_TARGET}. Спробуй заздалегідь обрати два дні наступного тижня.`;
  const weakest=[...summary.habits].sort((a,b)=>a.days-b.days)[0];
  const threshold=Math.ceil(progress.daysPassed*5/7);
  if(weakest&&weakest.days<threshold)
    return live
      ?`Поки що найменше днів із пунктом «${weakest.label}» (${weakest.days} з ${progress.daysPassed}) — варто підтягнути його до кінця тижня.`
      :`Найменше днів із пунктом «${weakest.label}» (${weakest.days}/7) — варто зробити його фокусом наступного тижня.`;
  if(summary.sleepAverage!==null&&summary.sleepAverage<7)return `Сон у середньому ${formatSleepAverage(summary.sleepAverage)} — спробуй лягати на 30 хвилин раніше.`;
  return live?"Тиждень іде добре — так тримати.":"Сильний тиждень — продовжуй у тому ж ритмі.";
}

function summaryMetricHTML(label,value,note="",tone=""){
  const notes=(Array.isArray(note)?note:[note]).filter(Boolean).map(text=>`<small>${text}</small>`).join("");
  return `<div class="weekly-metric ${tone}"><span>${label}</span><strong>${value}</strong>${notes}</div>`;
}

function weeklySummaryHTML(weekIndex){
  const summary=weeklySummary(weekIndex);
  if(!summary)return "";
  if(!summary.hasData)return `<div class="weekly-summary-empty">Підсумок з’явиться, коли за тиждень ${weekIndex+1} буде хоч один запис.</div>`;
  const previous=weekIndex>0?weeklySummary(weekIndex-1):null,compare=previous?.hasData?previous:null;
  // Change vs the previous week; nothing is shown when there is no change, to keep the cards calm.
  const vsPrev=(current,before,digits,unit)=>{
    if(!compare||current===null||before===null||before===undefined)return "";
    const delta=Number((current-before).toFixed(digits));
    return delta===0?"":`${formatSignedUk(delta,digits)}${unit} до тиж. ${weekIndex}`;
  };
  const coverage=days=>`${days} із 7 днів`;
  const painTone=summary.painMaximum===null?"":summary.painMaximum>=KNEE_PAIN_SEVERE_LEVEL?"danger":summary.painMaximum>=KNEE_PAIN_WARNING_LEVEL?"warn":"";
  const metrics=[
    summaryMetricHTML("Виконання",`${summary.completionPercent}%`,[`звички ${summary.habitMarks}/21 · активні ${Math.min(summary.activeDays,WEEKLY_ACTIVITY_TARGET)}/${WEEKLY_ACTIVITY_TARGET}`,vsPrev(summary.completionPercent,compare?.completionPercent,0," п.п.")]),
    summaryMetricHTML("Тренування",`${summary.workouts} / ${WEEKLY_WORKOUT_TARGET}`,summary.pool?`зал ${summary.gym} · басейн ${summary.pool}`:"",summary.workouts>=WEEKLY_WORKOUT_TARGET?"good":""),
    summaryMetricHTML("Активні дні",`${summary.activeDays} / 7`,vsPrev(summary.activeDays,compare?.activeDays,0,"")),
    summaryMetricHTML("Сон",formatSleepAverage(summary.sleepAverage),vsPrev(summary.sleepAverage,compare?.sleepAverage,1," год")||coverage(summary.sleepDays)),
    summaryMetricHTML("Енергія",summary.energyAverage===null?"—":`${formatNumberUk(summary.energyAverage,1)} / 10`,vsPrev(summary.energyAverage,compare?.energyAverage,1,"")||coverage(summary.energyDays)),
    summaryMetricHTML("Коліна",summary.painMaximum===null?"—":`макс. ${summary.painMaximum} / 10`,summary.painAverage===null?"":`середнє ${formatNumberUk(summary.painAverage,1)}`,painTone),
    summary.weightChange===null?"":summaryMetricHTML("Вага за тиждень",`${formatSignedUk(summary.weightChange,1)} кг`,"",summary.weightChange<0?"good":"")
  ].join("");
  const habits=summary.habits.map(habit=>`<li><span>${habit.label}</span><span class="weekly-habit-bar" style="--fill:${Math.round(habit.days/7*100)}%"></span><strong>${habit.days}/7</strong></li>`).join("");
  const focusTone=painTone?` ${painTone}`:"";
  return `<p class="weekly-coverage">Самопочуття заповнено повністю: ${coverage(summary.completeDays)}</p><div class="weekly-metrics">${metrics}</div><ul class="weekly-habits">${habits}</ul><p class="weekly-focus${focusTone}">${escapeNote(weeklyFocus(summary,weekProgress(weekIndex)))}</p>`;
}

function renderWeeklySummary(){
  const container=document.getElementById("weeklySummaryContent"),title=document.getElementById("weeklySummaryTitle");
  if(!container)return;
  if(title)title.textContent=weekProgress(currentWeek-1).inProgress?`Тиждень ${currentWeek} · поки що`:`Підсумок тижня ${currentWeek}`;
  container.innerHTML=weeklySummaryHTML(currentWeek-1);
}

// Reminders for the Today screen. `now` is injectable for tests.
function computeReminders(now=new Date()){
  const position=programPosition(now);
  if(position.status!=="active")return [];
  const {weekIndex,dayIndex}=position,week=state.weeks[weekIndex],day=week.days[dayIndex];
  const daily=enhancements.weeks[weekIndex].dailyWellbeing[dayIndex],hour=now.getHours(),reminders=[];

  if(hour<MORNING_UNTIL_HOUR&&daily.sleep==="")
    reminders.push({id:"sleep",text:"Внеси тривалість сну за минулу ніч."});

  const missing=Object.keys(HABIT_LABELS).filter(key=>!day[key]).map(key=>HABIT_LABELS[key]);
  if(hour>=EVENING_HOUR&&missing.length)
    reminders.push({id:"habits",text:`До кінця дня ще не відмічено: ${missing.join(", ")}.`});

  // Missing workouts are shown in the workout block of the Today screen itself, not repeated here.

  if(dayIndex===0&&weekIndex>0&&weeklySummary(weekIndex-1)?.hasData)
    reminders.push({id:"summary",text:`Підсумок тижня ${weekIndex} готовий.`,action:{label:"Переглянути",fn:"openWeeklySummary",args:[weekIndex-1]}});

  const hasAnyData=state.weeks.some((item,index)=>activeWeek(item,index));
  const backupAge=enhancements.lastBackupAt?now.getTime()-new Date(enhancements.lastBackupAt).getTime():Infinity;
  if(hasAnyData&&backupAge>BACKUP_REMINDER_DAYS*86400000)
    reminders.push({id:"backup",text:enhancements.lastBackupAt?`Остання резервна копія — ${Math.floor(backupAge/86400000)} дн. тому.`:"Резервної копії ще немає — дані живуть лише в цьому браузері.",
      action:{label:"Зберегти копію",fn:typeof canShareBackupFiles==="function"&&canShareBackupFiles()?"shareBackup":"exportBackup"}});
  return reminders;
}

function renderReminders(now=new Date()){
  const container=document.getElementById("todayReminders");
  if(!container)return;
  const reminders=computeReminders(now);
  container.hidden=!reminders.length;
  container.innerHTML=reminders.length?`<div class="eyebrow">Нагадування</div><ul>${reminders.map(item=>`<li data-reminder="${item.id}"><span>${escapeNote(item.text)}</span>${item.action?`<button type="button" class="btn" ${act("click",item.action.fn,...(item.action.args||[]))}>${item.action.label}</button>`:""}</li>`).join("")}</ul>`:"";
}

function goToTrainingScreen(){
  const position=programPosition();
  if(position.status==="active"&&currentWeek!==position.weekIndex+1){currentWeek=position.weekIndex+1;renderAll();}
  history.pushState(null,"",APP_SCREEN_HASHES.training);navigateToAppScreen("training",{scroll:true});
}

function openWeeklySummary(weekIndex){
  currentWeek=weekIndex+1;renderAll();
  history.pushState(null,"",APP_SCREEN_HASHES.week);navigateToAppScreen("week",{scroll:false});
  document.getElementById("weeklySummary")?.scrollIntoView({behavior:"smooth",block:"start"});
}

// Time-based reminders change during the day: refresh when the app comes back and every 10 minutes.
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")renderReminders();});
setInterval(()=>{if(document.visibilityState==="visible")renderReminders();},10*60*1000);
