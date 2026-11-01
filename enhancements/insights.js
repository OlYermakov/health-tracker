// Weekly summary (week screen) and in-app reminders (Today screen).
// Pure calculations take explicit arguments so they can be tested with fixed dates.

const HABIT_LABELS={breakfast:"білковий сніданок",vegetables:"овочі",water:"вода"};
const WEEKLY_WORKOUT_TARGET=2;
const KNEE_PAIN_WARNING_LEVEL=4;
const BACKUP_REMINDER_DAYS=7;
const EVENING_HOUR=18;
const MORNING_UNTIL_HOUR=14;

function weeklySummary(weekIndex){
  const week=state.weeks[weekIndex];
  if(!week)return null;
  const habits=Object.keys(HABIT_LABELS).map(key=>({key,label:HABIT_LABELS[key],days:week.days.filter(day=>day[key]).length}));
  const habitDays=habits.reduce((sum,habit)=>sum+habit.days,0);
  const records=completedTrainingRecordsForWeek(weekIndex);
  const wellbeing=weeklyWellbeingStats(weekIndex);
  const start=weightNumber(week.startWeight),end=weightNumber(week.endWeight);
  return {
    weekIndex,
    habits,
    habitPercent:Math.round(habitDays/21*100),
    activeDays:activityCount(week),
    workouts:records.length,
    gym:records.filter(record=>!isPoolRecord(record)).length,
    pool:records.filter(isPoolRecord).length,
    sleepAverage:wellbeing.sleepAverage,
    energyAverage:wellbeing.energyAverage,
    painMaximum:wellbeing.painMaximum,
    weightChange:start!==null&&end!==null?end-start:null,
    hasData:activeWeek(week,weekIndex)
  };
}

function signedNumber(value,digits=1,unit=""){
  if(value===null||value===undefined)return "";
  const rounded=Number(value.toFixed(digits));
  if(rounded===0)return `±0${unit}`;
  return `${rounded>0?"+":"−"}${Math.abs(rounded).toFixed(digits).replace(".",",")}${unit}`;
}

// Short advice for the next week, based on the weakest area.
function weeklyFocus(summary){
  if(!summary?.hasData)return "";
  if(summary.painMaximum!==null&&summary.painMaximum>=KNEE_PAIN_WARNING_LEVEL)
    return `Біль у колінах доходив до ${summary.painMaximum}/10. Наступного тижня зменш навантаження на ноги, а якщо біль не минає — порадься з лікарем чи фізіотерапевтом.`;
  if(summary.workouts<WEEKLY_WORKOUT_TARGET)
    return `Тренувань ${summary.workouts} з ${WEEKLY_WORKOUT_TARGET}. Спробуй заздалегідь обрати два дні наступного тижня.`;
  const weakest=[...summary.habits].sort((a,b)=>a.days-b.days)[0];
  if(weakest&&weakest.days<5)return `Найменше днів із пунктом «${weakest.label}» (${weakest.days}/7) — варто зробити його фокусом наступного тижня.`;
  if(summary.sleepAverage!==null&&summary.sleepAverage<7)return `Сон у середньому ${formatSleepAverage(summary.sleepAverage)} — спробуй лягати на 30 хвилин раніше.`;
  return "Сильний тиждень — продовжуй у тому ж ритмі.";
}

function summaryMetricHTML(label,value,delta="",tone=""){
  return `<div class="weekly-metric ${tone}"><span>${label}</span><strong>${value}</strong>${delta?`<small>${delta}</small>`:""}</div>`;
}

function weeklySummaryHTML(weekIndex){
  const summary=weeklySummary(weekIndex);
  if(!summary)return "";
  if(!summary.hasData)return `<div class="weekly-summary-empty">Підсумок з’явиться, коли за тиждень ${weekIndex+1} буде хоч один запис.</div>`;
  const previous=weekIndex>0?weeklySummary(weekIndex-1):null,compare=previous?.hasData?previous:null;
  const vsPrev=(current,before,digits,unit)=>compare&&current!==null&&before!==null?`${signedNumber(current-before,digits,unit)} до тиж. ${weekIndex}`:"";
  const metrics=[
    summaryMetricHTML("Звички",`${summary.habitPercent}%`,vsPrev(summary.habitPercent,compare?.habitPercent,0," п.п.")),
    summaryMetricHTML("Тренування",`${summary.workouts} / ${WEEKLY_WORKOUT_TARGET}`,summary.pool?`зал ${summary.gym} · басейн ${summary.pool}`:"",summary.workouts>=WEEKLY_WORKOUT_TARGET?"good":""),
    summaryMetricHTML("Активні дні",`${summary.activeDays} / 7`,vsPrev(summary.activeDays,compare?.activeDays,0,"")),
    summaryMetricHTML("Сон",formatSleepAverage(summary.sleepAverage),vsPrev(summary.sleepAverage,compare?.sleepAverage,1," год")),
    summaryMetricHTML("Енергія",summary.energyAverage===null?"—":`${summary.energyAverage.toFixed(1).replace(".",",")} / 10`,vsPrev(summary.energyAverage,compare?.energyAverage,1,"")),
    summaryMetricHTML("Біль у колінах",summary.painMaximum===null?"—":`макс. ${summary.painMaximum} / 10`,"",summary.painMaximum!==null&&summary.painMaximum>=KNEE_PAIN_WARNING_LEVEL?"warn":""),
    summaryMetricHTML("Вага за тиждень",summary.weightChange===null?"—":signedNumber(summary.weightChange,1," кг"),"",summary.weightChange!==null&&summary.weightChange<0?"good":"")
  ].join("");
  const habits=summary.habits.map(habit=>`<li><span>${habit.label}</span><span class="weekly-habit-bar" style="--fill:${Math.round(habit.days/7*100)}%"></span><strong>${habit.days}/7</strong></li>`).join("");
  return `<div class="weekly-metrics">${metrics}</div><ul class="weekly-habits">${habits}</ul><p class="weekly-focus">${escapeNote(weeklyFocus(summary))}</p>`;
}

function renderWeeklySummary(){
  const container=document.getElementById("weeklySummaryContent"),title=document.getElementById("weeklySummaryTitle");
  if(!container)return;
  if(title)title.textContent=`Підсумок тижня ${currentWeek}`;
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

  const workoutsLeft=Math.max(0,WEEKLY_WORKOUT_TARGET-completedTrainingRecordsForWeek(weekIndex).length);
  const daysLeft=7-dayIndex;
  if(workoutsLeft>0&&daysLeft<=workoutsLeft+1)
    reminders.push({id:"workouts",text:workoutsLeft>=daysLeft
      ?`До плану (${WEEKLY_WORKOUT_TARGET} тренування на тиждень) бракує ще ${workoutsLeft}, а днів залишилось ${daysLeft} — сьогодні гарний день для залу чи басейну.`
      :`Цього тижня ще ${workoutsLeft} тренування — залишилось ${daysLeft} ${daysLeft===1?"день":"дні"}.`,
      action:{label:"До тренувань",fn:"goToTrainingScreen"}});

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
