const HEALTH_DB_NAME="healthTrackerAnalytics";
const HEALTH_DB_VERSION=1;
const HEALTH_STORE="datasets";
const HEALTH_CURRENT_KEY="current";
const ANALYTICS_RANGE_KEY="healthAnalyticsRange_v1";
const ANALYTICS_TAB_KEY="healthAnalyticsTab_v1";
const ANALYTICS_STEP_GOAL_KEY="healthAnalyticsStepGoal_v1";
const ANALYTICS_WEIGHT_GOAL_KEY="healthAnalyticsWeightGoal_v1";
const ANALYTICS_TABS=new Set(["overview","activity","sleep","gait","heart","weight","workouts"]);
let healthAnalyticsData=null;
let analyticsRange=localStorage.getItem(ANALYTICS_RANGE_KEY)||"28";
let analyticsTab=ANALYTICS_TABS.has(localStorage.getItem(ANALYTICS_TAB_KEY))?localStorage.getItem(ANALYTICS_TAB_KEY):"overview";
let analyticsWorkoutFilter="all";
let selectedRouteIndex=0;
const analyticsChartRegistry=new Map();

function openHealthDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(HEALTH_DB_NAME,HEALTH_DB_VERSION);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(HEALTH_STORE))request.result.createObjectStore(HEALTH_STORE);};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}

async function healthDBAction(mode,action){
  const db=await openHealthDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(HEALTH_STORE,mode),store=transaction.objectStore(HEALTH_STORE),request=action(store);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);transaction.oncomplete=()=>db.close();
  });
}

async function loadHealthAnalytics(){try{return await healthDBAction("readonly",store=>store.get(HEALTH_CURRENT_KEY));}catch(error){return null;}}
async function saveHealthAnalytics(data){await healthDBAction("readwrite",store=>store.put(data,HEALTH_CURRENT_KEY));}
async function deleteHealthAnalytics(){await healthDBAction("readwrite",store=>store.delete(HEALTH_CURRENT_KEY));}
async function getHealthAnalyticsBackup(){return healthAnalyticsData;}
async function restoreHealthAnalyticsBackup(data){if(data?.format==="health-analytics-v1")await saveHealthAnalytics(data);}

function analyticsEscape(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function analyticsNumber(value){if(value===null||value===undefined||value==="")return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function analyticsAverage(values){const clean=values.map(analyticsNumber).filter(value=>value!==null);return clean.length?clean.reduce((sum,value)=>sum+value,0)/clean.length:null;}
function analyticsSum(values){return values.map(analyticsNumber).filter(value=>value!==null).reduce((sum,value)=>sum+value,0);}
function analyticsLatest(days,key){for(let index=days.length-1;index>=0;index--){const value=typeof key==="function"?key(days[index]):days[index]?.[key];if(analyticsNumber(value)!==null)return {value:Number(value),day:days[index]};}return null;}
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function round(value,digits=0){if(analyticsNumber(value)===null)return null;const power=10**digits;return Math.round(value*power)/power;}
function formatInteger(value){return analyticsNumber(value)===null?"—":Math.round(value).toLocaleString("uk-UA");}
function formatDecimal(value,digits=1){return analyticsNumber(value)===null?"—":Number(value).toLocaleString("uk-UA",{minimumFractionDigits:digits,maximumFractionDigits:digits});}
function formatDateLabel(date,{year=false}={}){if(!date)return "—";return new Intl.DateTimeFormat("uk-UA",year?{day:"numeric",month:"short",year:"numeric"}:{day:"numeric",month:"short"}).format(new Date(`${date}T12:00:00`));}
function formatDateRange(start,end){return start&&end?`${formatDateLabel(start,{year:true})} — ${formatDateLabel(end,{year:true})}`:"—";}
function pluralDays(value){const mod10=value%10,mod100=value%100;return mod10===1&&mod100!==11?"день":mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?"дні":"днів";}

function addCalendarDays(dateString,amount){const date=new Date(`${dateString}T12:00:00`);date.setDate(date.getDate()+amount);return localISODate(date);}
function daysBetween(a,b){return Math.round((new Date(`${b}T12:00:00`)-new Date(`${a}T12:00:00`))/86400000);}

function allImportedDays(){return Array.isArray(healthAnalyticsData?.days)?healthAnalyticsData.days:[];}
function filteredAnalyticsDays(){
  const all=allImportedDays();if(!all.length||analyticsRange==="all")return all;
  const count=Math.max(1,Number(analyticsRange)||28),end=all[all.length-1].date,start=addCalendarDays(end,-count+1);
  return all.filter(day=>day.date>=start&&day.date<=end);
}

function manualHealthByDate(){
  const result=new Map();if(typeof enhancements!=="object"||!enhancements?.startDate)return result;
  enhancements.weeks?.forEach((week,weekIndex)=>week.dailyWellbeing?.forEach((entry,dayIndex)=>{
    const date=addCalendarDays(enhancements.startDate,weekIndex*7+dayIndex),trackerDay=state?.weeks?.[weekIndex]?.days?.[dayIndex];
    result.set(date,{date,sleep:analyticsNumber(entry.sleep),energy:analyticsNumber(entry.energy),painLeft:analyticsNumber(entry.painLeft),painRight:analyticsNumber(entry.painRight),activity:Boolean(trackerDay?.activity),note:dayNotes?.[weekIndex]?.[dayIndex]||""});
  }));return result;
}

function localWorkouts(){
  if(typeof enhancements!=="object"||!Array.isArray(enhancements?.history))return [];
  return enhancements.history.map(record=>({
    source:"Health tracker",date:record.performedDate||String(record.completedAt||"").slice(0,10),start:record.startedAt||record.completedAt||"",end:record.completedAt||"",
    type:record.kind==="pool"?"Swimming":`Gym${record.planKey||""}`,duration:analyticsNumber(record.durationMinutes),distance:record.kind==="pool"&&analyticsNumber(record.distanceMeters)!==null?Number(record.distanceMeters)/1000:null,
    distanceUnit:"km",energy:null,local:true,notes:record.notes||"",planKey:record.planKey||"",painAfterLeft:analyticsNumber(record.painAfterLeft),painAfterRight:analyticsNumber(record.painAfterRight)
  })).filter(item=>item.date);
}

function allAnalyticsWorkouts(){return [...(healthAnalyticsData?.workouts||[]),...localWorkouts()].sort((a,b)=>String(b.start||b.date).localeCompare(String(a.start||a.date)));}
function workoutsInPeriod(days=filteredAnalyticsDays()){
  if(!days.length)return [];const start=days[0].date,end=days[days.length-1].date;return allAnalyticsWorkouts().filter(item=>item.date>=start&&item.date<=end);
}

function metricCoverage(days,getter){const filled=days.filter(day=>analyticsNumber(getter(day))!==null).length;return {filled,total:days.length,pct:days.length?Math.round(filled/days.length*100):0};}
function trendComparison(values){
  const clean=values.map(analyticsNumber).filter(value=>value!==null);if(clean.length<4)return {text:"Недостатньо даних",className:"neutral"};
  const half=Math.max(1,Math.floor(clean.length/2)),before=analyticsAverage(clean.slice(0,half)),after=analyticsAverage(clean.slice(-half));
  if(!before)return {text:"Без порівняння",className:"neutral"};const pct=(after-before)/Math.abs(before)*100;
  return {text:`${pct>0?"↑":pct<0?"↓":"→"} ${Math.abs(pct).toFixed(0)}% до попереднього періоду`,className:Math.abs(pct)<2?"neutral":pct>0?"":"down"};
}

function metricCard(label,value,caption="",tone="cyan"){
  const glow={cyan:"rgba(121,231,255,.2)",blue:"rgba(74,168,255,.2)",green:"rgba(66,230,164,.2)",violet:"rgba(183,156,255,.2)",amber:"rgba(255,209,102,.18)",red:"rgba(255,124,148,.18)"}[tone];
  return `<article class="analytics-kpi glass" style="--kpi-glow:${glow}"><span>${analyticsEscape(label)}</span><strong>${value}</strong>${caption?`<small>${caption}</small>`:""}</article>`;
}

function qualityNote(text="Дані очищено від очевидних дублів. Кроки беруться з найповнішого джерела за день, сон — із найповнішого джерела за ніч."){
  return `<div class="analytics-quality"><span>i</span><div><strong>Як розраховано</strong><p>${analyticsEscape(text)}</p></div></div>`;
}

function downsampleDays(days,series,maxPoints=180){
  if(days.length<=maxPoints)return days.map(day=>({date:day.date,values:series.map(item=>analyticsNumber(item.get(day)))}));
  const size=Math.ceil(days.length/maxPoints),result=[];
  for(let index=0;index<days.length;index+=size){
    const group=days.slice(index,index+size);result.push({date:group[group.length-1].date,values:series.map(item=>analyticsAverage(group.map(item.get)))});
  }
  return result;
}

function lineChart(id,days,series,{height=230,min=null,max=null}={}){
  const points=downsampleDays(days,series),allValues=points.flatMap(point=>point.values).filter(value=>value!==null);
  if(!allValues.length)return `<div class="analytics-chart-empty">Для цього графіка поки немає достатньо даних.</div>`;
  let minY=min??Math.min(...allValues),maxY=max??Math.max(...allValues);if(minY===maxY){minY-=1;maxY+=1;}const padding=(maxY-minY)*.08;minY=min??(minY-padding);maxY=max??(maxY+padding);
  const width=typeof mobileAppEnabled==="function"&&mobileAppEnabled()?360:720,pad={left:42,right:14,top:15,bottom:28},innerW=width-pad.left-pad.right,innerH=height-pad.top-pad.bottom;
  const x=index=>pad.left+(points.length===1?innerW/2:innerW*index/(points.length-1)),y=value=>pad.top+innerH*(1-(value-minY)/(maxY-minY));
  const grids=Array.from({length:5},(_,index)=>{const value=maxY-(maxY-minY)*index/4,cy=pad.top+innerH*index/4;return `<line class="grid" x1="${pad.left}" y1="${cy}" x2="${width-pad.right}" y2="${cy}"/><text x="${pad.left-7}" y="${cy+3}" text-anchor="end">${series[0].axisFormat?series[0].axisFormat(value):round(value,0)}</text>`;}).join("");
  const paths=series.map((item,seriesIndex)=>{
    let path="",active=false;points.forEach((point,index)=>{const value=point.values[seriesIndex];if(value===null){active=false;return;}path+=`${active?"L":"M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `;active=true;});
    return `<path class="${seriesIndex?"line-alt":"line-main"}" style="stroke:${item.color||""}" d="${path.trim()}"/>`;
  }).join("");
  const labels=[0,Math.floor((points.length-1)/2),points.length-1].filter((value,index,array)=>value>=0&&array.indexOf(value)===index).map(index=>`<text x="${x(index)}" y="${height-8}" text-anchor="middle">${formatDateLabel(points[index].date)}</text>`).join("");
  analyticsChartRegistry.set(id,{points,series,minY,maxY,width,height,pad});
  return `<div class="analytics-chart-wrap"><svg class="analytics-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-interactive-chart="${id}" role="img" aria-label="${analyticsEscape(series.map(item=>item.name).join(", "))}">${grids}<line class="axis" x1="${pad.left}" y1="${height-pad.bottom}" x2="${width-pad.right}" y2="${height-pad.bottom}"/>${paths}${labels}<line class="chart-focus" data-chart-focus x1="0" x2="0" y1="${pad.top}" y2="${height-pad.bottom}" hidden/><rect class="chart-hit" x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}"/></svg><div class="analytics-tooltip" hidden></div></div><div class="analytics-legend">${series.map(item=>`<span><i style="background:${item.color||"var(--cyan)"}"></i>${analyticsEscape(item.name)}</span>`).join("")}</div>`;
}

function barChart(id,days,getter,{goal=0,label="Значення",format=formatInteger}={}){
  const series=[{name:label,get:getter,axisFormat:value=>Math.round(value/1000)+"k",format}],points=downsampleDays(days,series,90),values=points.map(point=>point.values[0]).filter(value=>value!==null);
  if(!values.length)return `<div class="analytics-chart-empty">Для цього графіка поки немає даних.</div>`;
  const width=typeof mobileAppEnabled==="function"&&mobileAppEnabled()?360:720,height=230,pad={left:42,right:14,top:15,bottom:28},innerW=width-pad.left-pad.right,innerH=height-pad.top-pad.bottom,maxY=Math.max(goal,...values)*1.1||1,barWidth=Math.max(2,innerW/points.length*.68);
  const x=index=>pad.left+innerW*(index+.5)/points.length,y=value=>pad.top+innerH*(1-value/maxY);
  const grids=Array.from({length:5},(_,index)=>{const value=maxY*(1-index/4),cy=pad.top+innerH*index/4;return `<line class="grid" x1="${pad.left}" y1="${cy}" x2="${width-pad.right}" y2="${cy}"/><text x="${pad.left-7}" y="${cy+3}" text-anchor="end">${Math.round(value/1000)}k</text>`;}).join("");
  const bars=points.map((point,index)=>{const value=point.values[0];if(value===null)return "";return `<rect class="bar ${value>=goal&&goal?"goal":""}" x="${x(index)-barWidth/2}" y="${y(value)}" width="${barWidth}" height="${height-pad.bottom-y(value)}" rx="${Math.min(4,barWidth/2)}"/>`;}).join("");
  const goalLine=goal?`<line x1="${pad.left}" y1="${y(goal)}" x2="${width-pad.right}" y2="${y(goal)}" stroke="var(--green)" stroke-dasharray="5 5"/><text x="${width-pad.right}" y="${y(goal)-5}" text-anchor="end">ціль ${formatInteger(goal)}</text>`:"";
  analyticsChartRegistry.set(id,{points,series,minY:0,maxY,width,height,pad});
  return `<div class="analytics-chart-wrap"><svg class="analytics-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-interactive-chart="${id}" role="img" aria-label="${analyticsEscape(label)}">${grids}${goalLine}${bars}<text x="${pad.left}" y="${height-8}">${formatDateLabel(points[0].date)}</text><text x="${width-pad.right}" y="${height-8}" text-anchor="end">${formatDateLabel(points[points.length-1].date)}</text><line class="chart-focus" data-chart-focus x1="0" x2="0" y1="${pad.top}" y2="${height-pad.bottom}" hidden/><rect class="chart-hit" x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}"/></svg><div class="analytics-tooltip" hidden></div></div>`;
}

function wireAnalyticsCharts(){
  document.querySelectorAll("[data-interactive-chart]").forEach(svg=>{
    const config=analyticsChartRegistry.get(svg.dataset.interactiveChart);if(!config)return;
    const show=event=>{
      const rect=svg.getBoundingClientRect(),relative=clamp((event.clientX-rect.left)/rect.width,0,1),innerStart=config.pad.left/config.width,innerEnd=1-config.pad.right/config.width;
      const ratio=clamp((relative-innerStart)/(innerEnd-innerStart),0,1),index=Math.round(ratio*(config.points.length-1)),point=config.points[index],tooltip=svg.parentElement.querySelector(".analytics-tooltip"),focus=svg.querySelector("[data-chart-focus]");
      if(!point||!tooltip)return;const x=config.pad.left+(config.points.length===1?(config.width-config.pad.left-config.pad.right)/2:(config.width-config.pad.left-config.pad.right)*index/(config.points.length-1));
      focus.hidden=false;focus.setAttribute("x1",x);focus.setAttribute("x2",x);tooltip.hidden=false;tooltip.style.left=`${clamp(relative*100,12,88)}%`;tooltip.style.top=`${Math.max(48,event.clientY-rect.top)}px`;
      tooltip.innerHTML=`<strong>${formatDateLabel(point.date,{year:true})}</strong>${config.series.map((series,seriesIndex)=>`<span>${analyticsEscape(series.name)}: ${point.values[seriesIndex]===null?"—":(series.format?series.format(point.values[seriesIndex]):formatDecimal(point.values[seriesIndex],1))}</span>`).join("")}`;
    };
    svg.addEventListener("pointerdown",show);svg.addEventListener("pointermove",event=>{if(event.pointerType!=="touch")show(event);});svg.addEventListener("pointerleave",()=>{svg.parentElement.querySelector(".analytics-tooltip").hidden=true;svg.querySelector("[data-chart-focus]").hidden=true;});
  });
}

function recoverySummary(days){
  const manual=manualHealthByDate(),sleep=analyticsLatest(days,day=>day.sleep?.hours),resting=analyticsLatest(days,"restingHeartRate"),rhrValues=days.map(day=>day.restingHeartRate).filter(value=>analyticsNumber(value)!==null),rhrBase=analyticsAverage(rhrValues);
  let energy=null,knee=null;for(let index=days.length-1;index>=0;index--){const item=manual.get(days[index].date);if(!item)continue;if(energy===null&&item.energy!==null)energy=item.energy;if(knee===null&&(item.painLeft!==null||item.painRight!==null))knee=analyticsAverage([item.painLeft,item.painRight]);}
  const parts=[];if(sleep)parts.push({name:"Сон",score:clamp(100-Math.abs(sleep.value-8)*22,20,100)});if(resting&&rhrBase)parts.push({name:"Пульс",score:clamp(100-Math.max(0,resting.value-rhrBase)*9,20,100)});if(energy!==null)parts.push({name:"Енергія",score:clamp(energy/5*100,0,100)});if(knee!==null)parts.push({name:"Коліна",score:clamp(100-knee*10,0,100)});
  return {score:parts.length>=2?Math.round(analyticsAverage(parts.map(part=>part.score))):null,parts};
}

function overviewInsights(days){
  const insights=[],sleepValues=days.map(day=>day.sleep?.hours).filter(value=>analyticsNumber(value)!==null),steps=days.map(day=>day.steps).filter(value=>analyticsNumber(value)!==null),manual=manualHealthByDate();
  if(sleepValues.length>=4){const avg=analyticsAverage(sleepValues),variance=analyticsAverage(sleepValues.map(value=>(value-avg)**2)),deviation=Math.sqrt(variance);insights.push({tone:deviation<=1?"positive":"attention",title:deviation<=1?"Сон достатньо регулярний":"Нерівномірний сон",text:`Середнє відхилення тривалості — ${formatDecimal(deviation,1)} год.`});}
  if(steps.length>=4){const trend=trendComparison(steps);insights.push({tone:trend.className==="down"?"attention":"positive",title:"Динаміка кроків",text:trend.text});}
  const paired=days.map(day=>({sleep:day.sleep?.hours,energy:manual.get(day.date)?.energy})).filter(item=>analyticsNumber(item.sleep)!==null&&analyticsNumber(item.energy)!==null);
  if(paired.length>=7){const correlation=pearson(paired.map(item=>[item.sleep,item.energy]));insights.push({tone:"",title:"Сон та енергія",text:`За ${paired.length} заповненими днями зв’язок ${correlationText(correlation)}. Це спостереження, а не доказ причини.`});}
  if(!insights.length)insights.push({tone:"",title:"Аналітика накопичується",text:"Заповнюй сон, енергію та стан колін щодня — тоді з’являться персональні зіставлення."});
  return insights;
}

function insightsHTML(items){return `<div class="analytics-insights">${items.map(item=>`<article class="analytics-insight ${item.tone||""}"><strong>${analyticsEscape(item.title)}</strong><span>${analyticsEscape(item.text)}</span></article>`).join("")}</div>`;}

function renderOverview(days){
  const stepValues=days.map(day=>day.steps),sleepValues=days.map(day=>day.sleep?.hours),rhrValues=days.map(day=>day.restingHeartRate),weight=analyticsLatest(days,"weight"),workouts=workoutsInPeriod(days),stepGoal=analyticsStepGoal(),active=days.filter(day=>isActiveHealthDay(day,workouts)).length,recovery=recoverySummary(days);
  const recoveryMarkup=recovery.score===null?`<div class="analytics-chart-empty">Потрібні щонайменше два показники: сон, пульс спокою, енергія або стан колін.</div>`:`<div class="recovery-score"><div class="recovery-ring" style="--score:${recovery.score}"><div><strong>${recovery.score}</strong><span>зі 100</span></div></div><div class="recovery-parts">${recovery.parts.map(part=>`<div class="recovery-part"><span>${part.name}</span><i style="--part:${Math.round(part.score)}%"></i><b>${Math.round(part.score)}</b></div>`).join("")}</div></div>`;
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Головне за період</div><h2>Огляд здоров’я</h2></div><p>Короткий підсумок без медичних висновків. Торкнися графіка, щоб побачити конкретний день.</p></header><div class="analytics-kpi-grid">${metricCard("Середні кроки",formatInteger(analyticsAverage(stepValues)),`${metricCoverage(days,day=>day.steps).filled} ${pluralDays(metricCoverage(days,day=>day.steps).filled)} з даними`,"cyan")}${metricCard("Середній сон",analyticsAverage(sleepValues)===null?"—":`${formatDecimal(analyticsAverage(sleepValues),1)} год`,`${metricCoverage(days,day=>day.sleep?.hours).filled} ночей`,"violet")}${metricCard("Пульс спокою",analyticsAverage(rhrValues)===null?"—":`${formatInteger(analyticsAverage(rhrValues))} уд/хв`,`середнє за період`,"red")}${metricCard("Поточна вага",weight?`${formatDecimal(weight.value,1)} кг`:"—",weight?formatDateLabel(weight.day.date,{year:true}):"немає вимірювань","amber")}${metricCard("Активні дні",`${active} / ${days.length}`,`${workouts.length} тренувань · ціль ${formatInteger(stepGoal)} кроків`,"green")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Щоденна активність</h3><p>Кроки з найповнішого джерела кожного дня</p></div><span class="analytics-badge">${metricCoverage(days,day=>day.steps).pct}% покриття</span></div>${lineChart("overviewSteps",days,[{name:"Кроки",get:day=>day.steps,color:"var(--cyan)",format:formatInteger,axisFormat:value=>`${Math.round(value/1000)}k`}])}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Індекс відновлення</h3><p>Прозорий орієнтир із доступних показників</p></div><span class="analytics-badge ${recovery.score>=75?"good":recovery.score!==null&&recovery.score<55?"warn":""}">${recovery.score===null?"ще рано":recovery.score>=75?"добре":recovery.score>=55?"помірно":"увага"}</span></div>${recoveryMarkup}</article></div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Що помітно</h3><p>Автоматичні спостереження з достатньою кількістю збігів</p></div></div>${insightsHTML(overviewInsights(days))}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Повнота даних</h3><p>${formatDateRange(days[0]?.date,days[days.length-1]?.date)}</p></div></div>${coverageHTML(days)}</article></div>${qualityNote()}</div>`;
}

function coverageHTML(days){
  const items=[{label:"Кроки",value:metricCoverage(days,day=>day.steps).pct},{label:"Сон",value:metricCoverage(days,day=>day.sleep?.hours).pct},{label:"Пульс спокою",value:metricCoverage(days,day=>day.restingHeartRate).pct},{label:"Хода",value:metricCoverage(days,day=>day.walkingSpeed).pct}];
  return `<div class="recovery-parts">${items.map(item=>`<div class="recovery-part"><span>${item.label}</span><i style="--part:${item.value}%"></i><b>${item.value}%</b></div>`).join("")}</div>`;
}

function analyticsStepGoal(){const saved=Number(localStorage.getItem(ANALYTICS_STEP_GOAL_KEY));return Number.isFinite(saved)&&saved>=1000&&saved<=30000?saved:7000;}
function workoutDates(workouts){return new Set(workouts.map(item=>item.date));}
function isActiveHealthDay(day,workouts){const dates=workoutDates(workouts);return (analyticsNumber(day.steps)!==null&&day.steps>=analyticsStepGoal())||(day.activeEnergyGoal&&day.activeEnergy>=day.activeEnergyGoal)||dates.has(day.date);}

function renderActivity(days){
  const goal=analyticsStepGoal(),workouts=workoutsInPeriod(days),active=days.filter(day=>isActiveHealthDay(day,workouts)).length,totalSteps=analyticsSum(days.map(day=>day.steps)),distance=analyticsSum(days.map(day=>day.distance)),energy=analyticsSum(days.map(day=>day.activeEnergy));
  const calendarDays=days.slice(-Math.min(196,days.length)),maxSteps=Math.max(goal,...calendarDays.map(day=>day.steps||0));
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Рух і регулярність</div><h2>Активність</h2></div><p>Активний день: виконана ціль кроків, ціль руху Apple або зафіксоване тренування.</p></header><div class="analytics-kpi-grid">${metricCard("Кроків усього",formatInteger(totalSteps),`у вибраному періоді`,"cyan")}${metricCard("Середнє за день",formatInteger(analyticsAverage(days.map(day=>day.steps))),`ціль ${formatInteger(goal)}`,"green")}${metricCard("Відстань",`${formatDecimal(distance,1)} км`,`ходьба та біг`,"violet")}${metricCard("Активна енергія",`${formatInteger(energy)} ккал`,`сума за період`,"amber")}${metricCard("Активні дні",`${active} / ${days.length}`,days.length?`${Math.round(active/days.length*100)}% періоду`:"—","green")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Кроки по днях</h3><p>Зелений стовпчик означає виконану ціль</p></div><span class="analytics-badge">${formatInteger(goal)} кроків</span></div>${barChart("activitySteps",days,day=>day.steps,{goal,label:"Кроки",format:formatInteger})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Правило активного дня</h3><p>Ціль можна змінити під фактичне навантаження</p></div></div><div class="analytics-settings"><label><strong>Денна ціль кроків</strong>Від 1 000 до 30 000</label><input id="analyticsStepGoal" type="number" inputmode="numeric" min="1000" max="30000" step="500" value="${goal}"></div>${insightsHTML([{tone:active/days.length>=.5?"positive":"attention",title:"Регулярність",text:days.length?`Активними були ${active} із ${days.length} днів.`:"Дані відсутні."},{tone:"",title:"Джерела без подвійного рахунку",text:"Якщо iPhone і Zepp записували кроки одночасно, застосунок не складає їх, а бере найповніше джерело дня."}])}</article></div><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Календар активності</h3><p>Інтенсивність кольору відповідає частці виконаної цілі</p></div><span class="analytics-badge">останні ${calendarDays.length} днів</span></div><div class="activity-calendar">${calendarDays.map(day=>{const ratio=(day.steps||0)/Math.max(goal,1),level=day.steps===null?0:clamp(Math.ceil(ratio*4),1,4);return `<button class="activity-day" type="button" data-activity-date="${day.date}" data-level="${level}" aria-label="${formatDateLabel(day.date,{year:true})}: ${formatInteger(day.steps)} кроків" title="${formatDateLabel(day.date,{year:true})}: ${formatInteger(day.steps)} кроків"></button>`;}).join("")}</div><div class="activity-calendar-caption"><span>${formatDateLabel(calendarDays[0]?.date)}</span><span>менше → більше</span><span>${formatDateLabel(calendarDays[calendarDays.length-1]?.date)}</span></div></article>${qualityNote()}</div>`;
}

function renderSleep(days){
  const sleepDays=days.filter(day=>analyticsNumber(day.sleep?.hours)!==null),avg=analyticsAverage(sleepDays.map(day=>day.sleep.hours)),stageTotals={core:0,deep:0,rem:0,unspecified:0,awake:0};sleepDays.forEach(day=>Object.keys(stageTotals).forEach(key=>stageTotals[key]+=day.sleep?.[key]||0));
  const asleepTotal=stageTotals.core+stageTotals.deep+stageTotals.rem+stageTotals.unspecified,regularity=sleepRegularity(sleepDays),rhr=analyticsAverage(days.map(day=>day.restingHeartRate));
  const donut=sleepDonut(stageTotals,asleepTotal);
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Нічний ритм</div><h2>Сон і відновлення</h2></div><p>Сегменти сну об’єднано у ночі. Перекриття «у ліжку» не додається до фактичного сну.</p></header><div class="analytics-kpi-grid">${metricCard("Середній сон",avg===null?"—":`${formatDecimal(avg,1)} год`,`${sleepDays.length} ${pluralDays(sleepDays.length)} з даними`,"violet")}${metricCard("Глибокий сон",asleepTotal?`${Math.round(stageTotals.deep/asleepTotal*100)}%`:"—",`${formatDecimal(stageTotals.deep/Math.max(sleepDays.length,1),1)} год/ніч`,"blue")}${metricCard("REM",asleepTotal?`${Math.round(stageTotals.rem/asleepTotal*100)}%`:"—",`${formatDecimal(stageTotals.rem/Math.max(sleepDays.length,1),1)} год/ніч`,"cyan")}${metricCard("Регулярність",regularity===null?"—":`${formatDecimal(regularity,1)} год`,`середнє відхилення тривалості`,regularity!==null&&regularity<=1?"green":"amber")}${metricCard("Пульс спокою",rhr===null?"—":`${formatInteger(rhr)} уд/хв`,`паралельно зі сном`,"red")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Тривалість сну</h3><p>Фактичний сон за кожну ніч</p></div><span class="analytics-badge ${avg>=7&&avg<=9?"good":""}">${avg===null?"немає даних":avg>=7&&avg<=9?"у цільовому діапазоні":"поза 7–9 год"}</span></div>${lineChart("sleepHours",days,[{name:"Сон, год",get:day=>day.sleep?.hours,color:"var(--violet)",format:value=>`${formatDecimal(value,1)} год`,axisFormat:value=>formatDecimal(value,0)}],{min:0,max:Math.max(10,...sleepDays.map(day=>day.sleep.hours))})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Структура сну</h3><p>Середній розподіл доступних фаз</p></div></div>${donut}</article></div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Пульс спокою</h3><p>Допоміжний показник відновлення</p></div></div>${lineChart("sleepRhr",days,[{name:"Пульс спокою",get:day=>day.restingHeartRate,color:"var(--red)",format:value=>`${formatInteger(value)} уд/хв`}])}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Сон і власна оцінка</h3><p>Порівняння з полями «Сон» та «Енергія» у трекері</p></div></div>${sleepManualComparison(days)}</article></div>${qualityNote("Для кожної ночі використовується джерело з найповнішим набором фаз. Дані годинника можуть відрізнятися від медичного дослідження сну.")}</div>`;
}

function sleepRegularity(days){const values=days.map(day=>day.sleep?.hours).filter(value=>analyticsNumber(value)!==null);if(values.length<3)return null;const avg=analyticsAverage(values);return Math.sqrt(analyticsAverage(values.map(value=>(value-avg)**2)));}
function sleepDonut(stages,total){
  if(!total)return `<div class="analytics-chart-empty">Фази сну відсутні.</div>`;const radius=50,circumference=2*Math.PI*radius,items=[{key:"deep",label:"Глибокий",color:"#705cff"},{key:"core",label:"Основний",color:"#4aa8ff"},{key:"rem",label:"REM",color:"#79e7ff"},{key:"unspecified",label:"Без фази",color:"#9fb0c6"}],circles=[];let offset=0;
  items.forEach(item=>{const fraction=stages[item.key]/total,length=circumference*fraction;if(length>0)circles.push(`<circle cx="66" cy="66" r="${radius}" stroke="${item.color}" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}"/>`);offset+=length;});
  return `<div class="sleep-composition"><div class="sleep-donut-center"><svg class="sleep-donut" viewBox="0 0 132 132"><circle cx="66" cy="66" r="${radius}" stroke="rgba(255,255,255,.07)"/>${circles.join("")}</svg><div><span>у середньому</span><strong>${formatDecimal(total/Math.max(1,filteredAnalyticsDays().filter(day=>day.sleep).length),1)}<small>год</small></strong></div></div><div class="sleep-stages">${items.map(item=>`<div class="sleep-stage"><i style="background:${item.color}"></i><span>${item.label}</span><b>${Math.round(stages[item.key]/total*100)}%</b></div>`).join("")}</div></div>`;
}

function sleepManualComparison(days){
  const manual=manualHealthByDate(),pairs=days.map(day=>({apple:day.sleep?.hours,manual:manual.get(day.date)?.sleep,energy:manual.get(day.date)?.energy})).filter(item=>analyticsNumber(item.apple)!==null&&(analyticsNumber(item.manual)!==null||analyticsNumber(item.energy)!==null));
  if(pairs.length<3)return insightsHTML([{tone:"",title:"Потрібно більше щоденних записів",text:`Зараз є ${pairs.length} зіставлені дні. Заповни хоча б 7 днів сну та енергії.`}]);
  const sleepPairs=pairs.filter(item=>item.manual!==null),difference=sleepPairs.length?analyticsAverage(sleepPairs.map(item=>Math.abs(item.apple-item.manual))):null,energyPairs=pairs.filter(item=>item.energy!==null),correlation=energyPairs.length>=5?pearson(energyPairs.map(item=>[item.apple,item.energy])):null;
  const missing=Math.max(0,5-energyPairs.length);
  return insightsHTML([{tone:difference!==null&&difference<=.75?"positive":"",title:"Apple Health і ручний запис",text:difference===null?"Немає збігів.":`Середня різниця — ${formatDecimal(difference,1)} год за ${sleepPairs.length} днів.`},{tone:"",title:"Сон та енергія",text:correlation===null?`Потрібно ще ${missing} ${pluralDays(missing)} для першого зіставлення.`:`Зв’язок ${correlationText(correlation)} за даними ${energyPairs.length} днів.`}]);
}

function latestMetric(days,key){const latest=analyticsLatest(days,key);return latest?latest.value:null;}
function renderGait(days){
  const manual=manualHealthByDate(),latestManual=[...days].reverse().map(day=>manual.get(day.date)).find(item=>item&&(item.painLeft!==null||item.painRight!==null)),pairs=days.map(day=>{const item=manual.get(day.date);return {metric:day.asymmetry,pain:item?analyticsAverage([item.painLeft,item.painRight]):null};}).filter(item=>item.metric!==null&&item.pain!==null),correlation=pairs.length>=7?pearson(pairs.map(item=>[item.metric,item.pain])):null;
  const metrics=[{label:"Асиметрія",value:latestMetric(days,"asymmetry"),unit:"%",digits:1},{label:"Швидкість ходи",value:latestMetric(days,"walkingSpeed"),unit:"км/год",digits:1},{label:"Довжина кроку",value:latestMetric(days,"stepLength"),unit:"см",digits:0},{label:"Подвійна опора",value:latestMetric(days,"doubleSupport"),unit:"%",digits:1},{label:"Стабільність",value:latestMetric(days,"steadiness"),unit:"%",digits:0}];
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Мобільність</div><h2>Хода й коліна</h2></div><p>Показники iPhone зіставляються з вашими оцінками лівого та правого коліна.</p></header><div class="analytics-kpi-grid">${metrics.map((item,index)=>metricCard(item.label,item.value===null?"—":`${formatDecimal(item.value,item.digits)} ${item.unit}`,index===0?"останнє доступне вимірювання":"за останній доступний день",index===0?"amber":index===4?"green":"cyan")).join("")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Асиметрія ходи</h3><p>Менше значення означає більш симетричний крок</p></div><span class="analytics-badge">індикатор, не діагноз</span></div>${lineChart("gaitAsymmetry",days,[{name:"Асиметрія",get:day=>day.asymmetry,color:"var(--amber)",format:value=>`${formatDecimal(value,1)}%`}],{min:0})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Реакція колін</h3><p>Оцінка 0–10 із щоденного трекера</p></div></div>${insightsHTML([{tone:latestManual&&Math.max(latestManual.painLeft||0,latestManual.painRight||0)>=5?"attention":"",title:"Останній ручний запис",text:latestManual?`Ліве: ${latestManual.painLeft??"—"}/10 · праве: ${latestManual.painRight??"—"}/10.`:"Поки немає заповнених оцінок колін."},{tone:"",title:"Асиметрія та дискомфорт",text:correlation===null?`Потрібно щонайменше 7 спільних днів; зараз ${pairs.length}.`:`За ${pairs.length} днями зв’язок ${correlationText(correlation)}. Кореляція не доводить причину.`}])}</article></div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Швидкість ходи</h3><p>Середня швидкість у записаних інтервалах</p></div></div>${lineChart("gaitSpeed",days,[{name:"Швидкість",get:day=>day.walkingSpeed,color:"var(--cyan)",format:value=>`${formatDecimal(value,1)} км/год`}],{min:0})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Інші показники ходи</h3><p>Останні доступні значення</p></div></div><div class="gait-metric-list">${metrics.slice(2).map(item=>`<div class="gait-metric"><span>${item.label}</span><strong>${item.value===null?"—":`${formatDecimal(item.value,item.digits)} ${item.unit}`}</strong><small>Не використовувати окремо для медичних висновків</small></div>`).join("")}</div></article></div>${qualityNote("Показники ходи залежать від того, чи був iPhone при вас і як саме він рухався. Вони корисні для тренду, але не замінюють оцінку лікаря або фізіотерапевта.")}</div>`;
}

function pearson(pairs){if(pairs.length<2)return null;const xs=pairs.map(pair=>pair[0]),ys=pairs.map(pair=>pair[1]),mx=analyticsAverage(xs),my=analyticsAverage(ys),numerator=analyticsSum(pairs.map(pair=>(pair[0]-mx)*(pair[1]-my))),dx=Math.sqrt(analyticsSum(xs.map(value=>(value-mx)**2))),dy=Math.sqrt(analyticsSum(ys.map(value=>(value-my)**2)));return dx&&dy?numerator/(dx*dy):0;}
function correlationText(value){if(value===null)return "ще не розраховано";const magnitude=Math.abs(value),strength=magnitude<.2?"майже відсутній":magnitude<.4?"слабкий":magnitude<.65?"помірний":"помітний";return `${strength} (${value>=0?"прямий":"зворотний"}, r=${value.toFixed(2)})`;}

function renderHeart(days){
  const rhr=analyticsAverage(days.map(day=>day.restingHeartRate)),resp=analyticsAverage(days.map(day=>day.respiratoryRate)),spo2=analyticsAverage(days.map(day=>day.spo2)),heartMax=analyticsLatest(days,"heartMax"),vo2=analyticsLatest(days,"vo2max"),recent=[...days].reverse().filter(day=>day.heartMin!==null&&day.heartMax!==null).slice(0,7);
  const minRange=recent.length?Math.min(...recent.map(day=>day.heartMin)):40,maxRange=recent.length?Math.max(...recent.map(day=>day.heartMax)):180;
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Серцево-дихальні показники</div><h2>Серце і дихання</h2></div><p>Довгі тренди важливіші за одиничні вимірювання годинника.</p></header><div class="analytics-kpi-grid">${metricCard("Пульс спокою",rhr===null?"—":`${formatInteger(rhr)} уд/хв`,`середнє за період`,"red")}${metricCard("Середній пульс",analyticsAverage(days.map(day=>day.heartAvg))===null?"—":`${formatInteger(analyticsAverage(days.map(day=>day.heartAvg)))} уд/хв`,`за всіма вимірами`,"cyan")}${metricCard("Частота дихання",resp===null?"—":`${formatDecimal(resp,1)}/хв`,`середнє`,"violet")}${metricCard("SpO₂",spo2===null?"—":`${formatDecimal(spo2,1)}%`,`середнє значення`,"blue")}${metricCard("VO₂max",vo2?`${formatDecimal(vo2.value,0)}`:"—",vo2?"мл/кг/хв · одиничні дані":"немає даних","green")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Пульс у часі</h3><p>Середній денний та пульс спокою</p></div><span class="analytics-badge">${metricCoverage(days,day=>day.heartAvg).pct}% покриття</span></div>${lineChart("heartTrend",days,[{name:"Середній",get:day=>day.heartAvg,color:"var(--cyan)",format:value=>`${formatInteger(value)} уд/хв`},{name:"У спокої",get:day=>day.restingHeartRate,color:"var(--red)",format:value=>`${formatInteger(value)} уд/хв`}],{min:35})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Останні діапазони</h3><p>Мінімум і максимум за день</p></div></div>${recent.length?`<div class="heart-range">${recent.map(day=>{const width=(day.heartMax-day.heartMin)/Math.max(1,maxRange-minRange)*100;return `<div class="heart-range-row"><span>${formatDateLabel(day.date)}</span><div class="heart-range-track"><i style="margin-left:${(day.heartMin-minRange)/Math.max(1,maxRange-minRange)*100}%;width:${Math.max(3,width)}%"></i></div><b>${formatInteger(day.heartMin)}–${formatInteger(day.heartMax)}</b></div>`;}).join("")}</div>`:'<div class="analytics-chart-empty">Немає денних діапазонів.</div>'}</article></div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Частота дихання</h3><p>Середнє за записані інтервали</p></div></div>${lineChart("respTrend",days,[{name:"Вдихів/хв",get:day=>day.respiratoryRate,color:"var(--violet)",format:value=>`${formatDecimal(value,1)}/хв`}],{min:8})}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Кисень у крові</h3><p>Спостереження з годинника</p></div></div>${lineChart("spo2Trend",days,[{name:"SpO₂",get:day=>day.spo2,color:"var(--blue)",format:value=>`${formatDecimal(value,1)}%`}],{min:80,max:100})}</article></div>${qualityNote("Окремі незвичні значення пульсу чи SpO₂ можуть бути похибкою датчика. Дашборд показує тренд і не встановлює діагноз; стійкі симптоми або повторні низькі значення варто обговорити з лікарем.")}</div>`;
}

function combinedWeights(){
  const values=allImportedDays().filter(day=>analyticsNumber(day.weight)!==null).map(day=>({date:day.date,value:Number(day.weight),source:day.weightSource||"Apple Health"}));
  if(typeof state==="object"&&typeof enhancements==="object")state.weeks?.forEach((week,index)=>{const value=weightNumber(week.endWeight);if(value===null)return;const date=addCalendarDays(enhancements.startDate,index*7+6);if(!values.some(item=>Math.abs(daysBetween(item.date,date))<=1&&Math.abs(item.value-value)<.06))values.push({date,value,source:"Health tracker"});});
  return values.sort((a,b)=>a.date.localeCompare(b.date));
}

function weightRegression(values){
  const recent=values.filter(item=>daysBetween(item.date,values[values.length-1]?.date)<=365).slice(-12);if(recent.length<3)return null;
  const start=recent[0].date,xs=recent.map(item=>daysBetween(start,item.date)/7),ys=recent.map(item=>item.value),mx=analyticsAverage(xs),my=analyticsAverage(ys),den=analyticsSum(xs.map(x=>(x-mx)**2));if(!den)return null;
  const slope=analyticsSum(xs.map((x,index)=>(x-mx)*(ys[index]-my)))/den;return {slope,points:recent.length};
}

function renderWeight(days){
  const start=days[0]?.date,end=days[days.length-1]?.date,all=combinedWeights(),values=all.filter(item=>analyticsRange==="all"||(item.date>=start&&item.date<=end)),latest=all[all.length-1],first=values[0],change=first&&latest?latest.value-first.value:null,bmi=analyticsLatest(allImportedDays(),"bmi"),goal=Number(localStorage.getItem(ANALYTICS_WEIGHT_GOAL_KEY))||"",regression=weightRegression(all);
  const chartDays=values.map(item=>({date:item.date,weight:item.value}));let projection="Внеси щонайменше три актуальні вимірювання, щоб побачити темп.";
  if(regression){projection=`Орієнтовний темп за останні ${regression.points} вимірювання: ${regression.slope>0?"+":""}${formatDecimal(regression.slope,2)} кг/тиждень.`;if(goal&&latest&&regression.slope<-.02&&goal<latest.value){const weeks=(latest.value-goal)/-regression.slope;projection+=` За незмінного темпу ціль може бути досягнута приблизно через ${Math.round(weeks)} тижнів.`;}}
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Динаміка тіла</div><h2>Вага</h2></div><p>Вимірювання Apple Health об’єднані з вагою із 12‑тижневої програми.</p></header><div class="analytics-kpi-grid">${metricCard("Поточна вага",latest?`${formatDecimal(latest.value,1)} кг`:"—",latest?formatDateLabel(latest.date,{year:true}):"немає даних","amber")}${metricCard("Зміна за період",change===null?"—":`${change>0?"+":""}${formatDecimal(change,1)} кг`,first?`від ${formatDateLabel(first.date)}`:"—",change!==null&&change<0?"green":"red")}${metricCard("BMI",bmi?formatDecimal(bmi.value,1):"—",bmi?formatDateLabel(bmi.day.date,{year:true}):"немає даних","violet")}${metricCard("Вимірювань",formatInteger(values.length),analyticsRange==="all"?"за весь час":"у вибраному періоді","cyan")}${metricCard("Темп",regression?`${regression.slope>0?"+":""}${formatDecimal(regression.slope,2)} кг/тиж`:"—","лінійний орієнтир","green")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Динаміка ваги</h3><p>Точки — фактичні вимірювання, без заповнення проміжків</p></div><span class="analytics-badge ${values.length>=3?"good":"warn"}">${values.length} записів</span></div>${lineChart("weightHealth",chartDays,[{name:"Вага",get:item=>item.weight,color:"var(--violet)",format:value=>`${formatDecimal(value,1)} кг`}])}</article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Ціль і прогноз</h3><p>Прогноз з’являється лише за достатнього тренду</p></div></div><div class="weight-projection"><strong>${goal?`Ціль: ${formatDecimal(goal,1)} кг`:"Ціль не задана"}</strong><span>${analyticsEscape(projection)}</span></div><div class="weight-controls"><label>Цільова вага, кг<input id="analyticsWeightGoal" type="number" inputmode="decimal" min="50" max="200" step="0.1" value="${goal}"></label><label>Останнє джерело<input type="text" value="${analyticsEscape(latest?.source||"—")}" readonly></label></div></article></div><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Останні вимірювання</h3><p>Джерела показано для контролю дублів</p></div></div><div class="workout-list">${all.slice(-8).reverse().map(item=>`<article class="analytics-workout"><header><div><span>${formatDateLabel(item.date,{year:true})}</span><h4>${formatDecimal(item.value,1)} кг</h4></div><span class="workout-source">${analyticsEscape(item.source)}</span></header></article>`).join("")||'<div class="analytics-chart-empty">Вимірювань немає.</div>'}</div></article>${qualityNote("Близькі за часом однакові значення з різних застосунків не враховуються двічі. Прогноз є математичною екстраполяцією, а не гарантією результату.")}</div>`;
}

function workoutCategory(item){const type=String(item.type||"").toLowerCase();if(type.includes("swim"))return "pool";if(type.includes("gym")||type.includes("strength")||type.includes("other"))return "gym";return "cardio";}
function workoutLabel(item){const type=String(item.type||"");if(type==="Swimming")return "Басейн";if(type.startsWith("Gym"))return `Тренування ${type.slice(3)||"у залі"}`;const labels={FunctionalStrengthTraining:"Силове тренування",Cycling:"Велосипед",Running:"Біг",Walking:"Ходьба",Other:"Інше тренування"};return labels[type]||type||"Тренування";}

function renderRouteMap(route){
  if(!route?.points?.length)return '<div class="analytics-chart-empty">GPS-маршрутів у вибраному архіві немає.</div>';
  const lats=route.points.map(point=>point.lat),lons=route.points.map(point=>point.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),spanLat=Math.max(.000001,maxLat-minLat),spanLon=Math.max(.000001,maxLon-minLon),pad=12;
  const points=route.points.map(point=>`${pad+(point.lon-minLon)/spanLon*(100-pad*2)},${100-pad-(point.lat-minLat)/spanLat*(100-pad*2)}`).join(" "),start=points.split(" ")[0].split(","),end=points.split(" ").at(-1).split(",");
  return `<svg class="route-map" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="GPS-маршрут"><defs><linearGradient id="routeGradient"><stop stop-color="var(--cyan)"/><stop offset="1" stop-color="var(--violet)"/></linearGradient></defs><polyline points="${points}"/><circle cx="${start[0]}" cy="${start[1]}" r="1.8"/><circle cx="${end[0]}" cy="${end[1]}" r="1.8"/></svg><div class="analytics-legend"><span><i style="background:var(--green)"></i>старт</span><span><i style="background:var(--red)"></i>фініш</span></div>`;
}

function renderWorkouts(days){
  const all=workoutsInPeriod(days),filtered=analyticsWorkoutFilter==="all"?all:all.filter(item=>workoutCategory(item)===analyticsWorkoutFilter),minutes=analyticsSum(all.map(item=>item.duration)),routes=healthAnalyticsData?.routes||[],route=routes[selectedRouteIndex]||routes[0],counts={gym:all.filter(item=>workoutCategory(item)==="gym").length,pool:all.filter(item=>workoutCategory(item)==="pool").length,cardio:all.filter(item=>workoutCategory(item)==="cardio").length};
  return `<div class="analytics-view"><header class="analytics-view-head"><div><div class="eyebrow">Імпорт і власний журнал</div><h2>Тренування</h2></div><p>Apple Health, зал і басейн показуються в одній хронології без точних дублів.</p></header><div class="analytics-kpi-grid">${metricCard("Тренувань",formatInteger(all.length),"у вибраному періоді","cyan")}${metricCard("Тривалість",`${formatInteger(minutes)} хв`,"усього","violet")}${metricCard("Зал",formatInteger(counts.gym),"силові та інші","green")}${metricCard("Басейн",formatInteger(counts.pool),"записи трекера й Apple","blue")}${metricCard("Кардіо",formatInteger(counts.cardio),"ходьба, біг, велосипед","amber")}</div><div class="analytics-grid"><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Історія тренувань</h3><p>${filtered.length} записів у вибраній категорії</p></div></div><div class="workout-toolbar">${[["all","Усі"],["gym","Зал"],["pool","Басейн"],["cardio","Кардіо"]].map(([key,label])=>`<button class="analytics-chip ${analyticsWorkoutFilter===key?"active":""}" type="button" data-workout-filter="${key}">${label}</button>`).join("")}</div><div class="workout-list" style="margin-top:10px">${filtered.slice(0,24).map(item=>`<article class="analytics-workout"><header><div><span>${formatDateLabel(item.date,{year:true})}</span><h4>${analyticsEscape(workoutLabel(item))}</h4></div><span class="workout-source">${analyticsEscape(item.source||"Apple Health")}</span></header><dl><div><dt>Тривалість</dt><dd>${item.duration?`${formatInteger(item.duration)} хв`:"—"}</dd></div><div><dt>Відстань</dt><dd>${item.distance?`${formatDecimal(item.distance,2)} км`:"—"}</dd></div><div><dt>Енергія</dt><dd>${item.energy?`${formatInteger(item.energy)} ккал`:"—"}</dd></div></dl></article>`).join("")||'<div class="analytics-chart-empty">У цьому періоді тренувань немає.</div>'}</div></article><article class="analytics-card glass"><div class="analytics-card-head"><div><h3>Маршрути</h3><p>GPS зберігається тільки на цьому пристрої</p></div><span class="analytics-badge ${routes.length?"good":""}">${routes.length} маршрутів</span></div>${routes.length>1?`<div class="workout-toolbar" style="margin-bottom:10px">${routes.map((item,index)=>`<button class="analytics-chip ${selectedRouteIndex===index?"active":""}" type="button" data-route-index="${index}">Маршрут ${index+1}</button>`).join("")}</div>`:""}${renderRouteMap(route)}${routes.length?`<div class="analytics-quality" style="margin-top:10px"><span>!</span><div><strong>Конфіденційність маршруту</strong><p>Карта може показувати місце проживання або роботи. Вона не потрапляє у код чи на сервер.</p></div></div>`:""}</article></div>${qualityNote("Точні дублікати тренувань із тим самим типом, джерелом і часом враховуються один раз. Історичних тренувань Apple Health у цьому архіві небагато, тому дашборд ставатиме кориснішим із новими записами.")}</div>`;
}

function renderHealthAnalytics(){
  const content=document.getElementById("healthAnalyticsContent"),toolbar=document.getElementById("analyticsToolbar"),tabs=document.getElementById("analyticsTabs"),clear=document.getElementById("healthClearButton"),status=document.getElementById("healthAnalyticsStatus");if(!content)return;
  if(!healthAnalyticsData?.days?.length){toolbar.hidden=true;tabs.hidden=true;clear.hidden=true;status.textContent="Імпортуй ZIP або основний XML Apple Health — дані буде оброблено тільки на цьому пристрої.";content.innerHTML=`<section class="analytics-empty glass"><div class="analytics-empty-icon">⌁</div><h3>Дашборди готові до даних</h3><p>Підтримуються ZIP-архів Apple Health, основний XML і резервна JSON-копія. Сирі мільйони вимірювань не зберігаються — лише компактні денні підсумки.</p><button class="btn primary" type="button" data-start-health-import>Обрати файл</button></section>`;wireAnalyticsControls();return;}
  toolbar.hidden=false;tabs.hidden=false;clear.hidden=false;const days=filteredAnalyticsDays(),totals=healthAnalyticsData.totals||{};
  status.textContent=`${formatDateRange(healthAnalyticsData.coverage?.start,healthAnalyticsData.coverage?.end)} · ${formatInteger(totals.records)} записів · імпорт ${formatDateLabel(String(healthAnalyticsData.importedAt||"").slice(0,10),{year:true})}`;
  document.getElementById("analyticsPeriodCaption").textContent=formatDateRange(days[0]?.date,days[days.length-1]?.date);
  document.querySelectorAll("[data-analytics-range]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.analyticsRange===analyticsRange)));
  document.querySelectorAll("[data-analytics-tab]").forEach(button=>button.setAttribute("aria-selected",String(button.dataset.analyticsTab===analyticsTab)));
  analyticsChartRegistry.clear();const renderers={overview:renderOverview,activity:renderActivity,sleep:renderSleep,gait:renderGait,heart:renderHeart,weight:renderWeight,workouts:renderWorkouts};content.innerHTML=renderers[analyticsTab](days);wireAnalyticsControls();wireAnalyticsCharts();
}

function wireAnalyticsControls(){
  document.querySelectorAll("[data-start-health-import]").forEach(button=>button.onclick=()=>document.getElementById("healthImportFile")?.click());
  document.querySelectorAll("[data-workout-filter]").forEach(button=>button.onclick=()=>{analyticsWorkoutFilter=button.dataset.workoutFilter;renderHealthAnalytics();});
  document.querySelectorAll("[data-route-index]").forEach(button=>button.onclick=()=>{selectedRouteIndex=Number(button.dataset.routeIndex)||0;renderHealthAnalytics();});
  document.querySelectorAll("[data-activity-date]").forEach(button=>button.onclick=()=>{
    const day=allImportedDays().find(item=>item.date===button.dataset.activityDate);if(day)showToast(`${formatDateLabel(day.date,{year:true})}: ${formatInteger(day.steps)} кроків · ${formatDecimal(day.distance,1)} км · ${formatInteger(day.activeEnergy)} ккал`);
  });
  const stepGoal=document.getElementById("analyticsStepGoal");if(stepGoal)stepGoal.onchange=()=>{const value=clamp(Number(stepGoal.value)||7000,1000,30000);localStorage.setItem(ANALYTICS_STEP_GOAL_KEY,String(value));renderHealthAnalytics();};
  const weightGoal=document.getElementById("analyticsWeightGoal");if(weightGoal)weightGoal.onchange=()=>{const value=Number(weightGoal.value);if(value>=50&&value<=200)localStorage.setItem(ANALYTICS_WEIGHT_GOAL_KEY,String(value));else localStorage.removeItem(ANALYTICS_WEIGHT_GOAL_KEY);renderHealthAnalytics();};
}

async function startHealthImport(file){
  if(!file)return;const progress=document.getElementById("healthImportProgress"),bar=document.getElementById("healthImportProgressBar"),value=document.getElementById("healthImportProgressValue"),label=document.getElementById("healthImportProgressLabel"),button=document.getElementById("healthImportButton");
  progress.hidden=false;bar.value=0;value.textContent="0%";label.textContent="Перевіряю файл…";button.disabled=true;
  const worker=new Worker("./health-import-worker.js?v=34");
  worker.onmessage=async event=>{
    if(event.data?.type==="progress"){bar.value=event.data.percent||0;value.textContent=`${event.data.percent||0}%`;label.textContent=event.data.label||"Обробка…";return;}
    if(event.data?.type==="error"){worker.terminate();progress.hidden=true;button.disabled=false;showToast(event.data.message||"Не вдалося імпортувати Apple Health.");return;}
    if(event.data?.type==="complete"){
      try{bar.value=100;value.textContent="100%";label.textContent="Зберігаю підсумки…";await saveHealthAnalytics(event.data.data);healthAnalyticsData=event.data.data;try{await navigator.storage?.persist?.();}catch(error){}renderHealthAnalytics();showToast(`Імпорт завершено: ${formatInteger(healthAnalyticsData.totals?.records)} записів.`);}catch(error){showToast("Дані оброблено, але Safari не дозволив їх зберегти.");}
      finally{worker.terminate();progress.hidden=true;button.disabled=false;}
    }
  };
  worker.onerror=()=>{worker.terminate();progress.hidden=true;button.disabled=false;showToast("Сталася помилка під час локальної обробки файлу.");};
  worker.postMessage({type:"import",file});
}

function initializeHealthAnalytics(){
  const importButton=document.getElementById("healthImportButton"),input=document.getElementById("healthImportFile"),clear=document.getElementById("healthClearButton"),tabs=document.getElementById("analyticsTabs"),toolbar=document.getElementById("analyticsToolbar");if(!importButton||!input)return;
  importButton.addEventListener("click",()=>input.click());input.addEventListener("change",event=>{const [file]=event.target.files;if(file)startHealthImport(file);event.target.value="";});
  clear.addEventListener("click",async()=>{if(!confirm("Видалити лише імпортовані показники Apple Health? Дані 12-тижневої програми та історія тренувань залишаться."))return;await deleteHealthAnalytics();healthAnalyticsData=null;renderHealthAnalytics();showToast("Імпортовані показники видалено.");});
  tabs.addEventListener("click",event=>{const button=event.target.closest("[data-analytics-tab]");if(!button)return;analyticsTab=button.dataset.analyticsTab;localStorage.setItem(ANALYTICS_TAB_KEY,analyticsTab);renderHealthAnalytics();document.getElementById("healthAnalyticsContent")?.scrollIntoView({behavior:"smooth",block:"start"});});
  toolbar.addEventListener("click",event=>{const button=event.target.closest("[data-analytics-range]");if(!button)return;analyticsRange=button.dataset.analyticsRange;localStorage.setItem(ANALYTICS_RANGE_KEY,analyticsRange);renderHealthAnalytics();});
  let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(healthAnalyticsData)renderHealthAnalytics();},120);});
  loadHealthAnalytics().then(data=>{healthAnalyticsData=data||null;renderHealthAnalytics();});
}

initializeHealthAnalytics();
