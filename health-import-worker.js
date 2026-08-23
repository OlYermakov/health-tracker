const RELEVANT_TYPES=new Set([
  "StepCount","DistanceWalkingRunning","ActiveEnergyBurned","BasalEnergyBurned",
  "HeartRate","RestingHeartRate","RespiratoryRate","OxygenSaturation","SleepAnalysis",
  "WalkingSpeed","WalkingStepLength","WalkingDoubleSupportPercentage","WalkingAsymmetryPercentage",
  "AppleWalkingSteadiness","BodyMass","BodyMassIndex","VO2Max"
]);

const TYPE_PREFIXES=["HKQuantityTypeIdentifier","HKCategoryTypeIdentifier"];
const textDecoder=new TextDecoder("utf-8",{fatal:false});

self.onmessage=async event=>{
  if(event.data?.type!=="import"||!event.data.file)return;
  try{
    const file=event.data.file;
    if(/\.json$/i.test(file.name)||file.type==="application/json"){
      const parsed=JSON.parse(await file.text());
      const data=parsed?.format==="health-analytics-v1"?parsed:(parsed?.analytics?.format==="health-analytics-v1"?parsed.analytics:null);
      if(!data)throw new Error("Цей JSON не містить даних аналітики Apple Health.");
      self.postMessage({type:"complete",data});return;
    }
    let stream,totalBytes,routes=[];
    if(/\.zip$/i.test(file.name)||/zip/i.test(file.type)){
      const entries=await readZipEntries(file);
      const xmlEntries=entries.filter(entry=>/\.xml$/i.test(entry.name)&&!/cda/i.test(entry.name));
      const main=xmlEntries.sort((a,b)=>b.uncompressedSize-a.uncompressedSize)[0];
      if(!main)throw new Error("У ZIP не знайдено основний XML Apple Health.");
      stream=await openZipEntryStream(file,main);totalBytes=main.uncompressedSize;
      const routeEntries=entries.filter(entry=>/\.gpx$/i.test(entry.name));
      routes=await parseRouteEntries(file,routeEntries);
    }else{
      stream=file.stream();totalBytes=file.size;
    }
    const data=await parseHealthXML(stream,totalBytes,file.name,routes);
    self.postMessage({type:"complete",data});
  }catch(error){
    self.postMessage({type:"error",message:error?.message||"Не вдалося прочитати файл Apple Health."});
  }
};

async function readZipEntries(file){
  const tailSize=Math.min(file.size,65557);
  const tail=new Uint8Array(await file.slice(file.size-tailSize).arrayBuffer());
  const view=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
  let eocd=-1;
  for(let i=tail.length-22;i>=0;i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw new Error("ZIP пошкоджений або має непідтримуваний формат.");
  const count=view.getUint16(eocd+10,true),centralSize=view.getUint32(eocd+12,true),centralOffset=view.getUint32(eocd+16,true);
  const central=new Uint8Array(await file.slice(centralOffset,centralOffset+centralSize).arrayBuffer());
  const centralView=new DataView(central.buffer,central.byteOffset,central.byteLength),entries=[];
  let offset=0;
  for(let index=0;index<count&&offset+46<=central.length;index++){
    if(centralView.getUint32(offset,true)!==0x02014b50)break;
    const flags=centralView.getUint16(offset+8,true),method=centralView.getUint16(offset+10,true);
    const compressedSize=centralView.getUint32(offset+20,true),uncompressedSize=centralView.getUint32(offset+24,true);
    const nameLength=centralView.getUint16(offset+28,true),extraLength=centralView.getUint16(offset+30,true),commentLength=centralView.getUint16(offset+32,true);
    const localOffset=centralView.getUint32(offset+42,true);
    const nameBytes=central.slice(offset+46,offset+46+nameLength);
    const name=new TextDecoder((flags&0x800)?"utf-8":"utf-8",{fatal:false}).decode(nameBytes);
    entries.push({name,method,compressedSize,uncompressedSize,localOffset});
    offset+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}

async function openZipEntryStream(file,entry){
  const headerBytes=new Uint8Array(await file.slice(entry.localOffset,entry.localOffset+30).arrayBuffer());
  const header=new DataView(headerBytes.buffer,headerBytes.byteOffset,headerBytes.byteLength);
  if(header.getUint32(0,true)!==0x04034b50)throw new Error("Пошкоджений запис ZIP.");
  const nameLength=header.getUint16(26,true),extraLength=header.getUint16(28,true);
  const start=entry.localOffset+30+nameLength+extraLength;
  const compressed=file.slice(start,start+entry.compressedSize);
  if(entry.method===0)return compressed.stream();
  if(entry.method===8&&"DecompressionStream" in self){
    try{return compressed.stream().pipeThrough(new DecompressionStream("deflate-raw"));}
    catch(error){throw new Error("Safari не зміг розпакувати ZIP. Розпакуй архів і вибери основний XML-файл.");}
  }
  throw new Error("Цей спосіб стиснення ZIP не підтримується. Розпакуй архів і вибери XML-файл.");
}

async function streamToText(stream){
  const reader=stream.getReader();let output="";
  while(true){const {done,value}=await reader.read();if(done)break;output+=textDecoder.decode(value,{stream:true});}
  return output+textDecoder.decode();
}

async function parseRouteEntries(file,entries){
  const routes=[];
  for(const entry of entries.slice(0,20)){
    try{
      const xml=await streamToText(await openZipEntryStream(file,entry));
      const raw=[];let match;
      const pointPattern=/<trkpt\s+([^>]*)>([\s\S]*?)<\/trkpt>/gi;
      while((match=pointPattern.exec(xml))){
        const attrs=attrsFromTag(`<trkpt ${match[1]}>`),time=match[2].match(/<time>([^<]+)<\/time>/i)?.[1]||"";
        const lat=Number(attrs.lat),lon=Number(attrs.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        raw.push({lat,lon,time});
      }
      if(!raw.length)continue;
      const stride=Math.max(1,Math.ceil(raw.length/240));
      const points=raw.filter((_,index)=>index%stride===0||index===raw.length-1);
      routes.push({name:entry.name.split("/").pop(),start:raw[0].time,end:raw[raw.length-1].time,points});
    }catch(error){}
  }
  return routes;
}

function decodeXML(value){
  return String(value||"").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&");
}

function attrsFromTag(tag){
  const attrs={};let match;const pattern=/([:\w-]+)="([^"]*)"/g;
  while((match=pattern.exec(tag)))attrs[match[1]]=decodeXML(match[2]);
  return attrs;
}

function shortType(type=""){
  for(const prefix of TYPE_PREFIXES)if(type.startsWith(prefix))return type.slice(prefix.length);
  return type.replace(/^HKWorkoutActivityType/,"");
}

function numeric(value){const number=Number(String(value??"").replace(",","."));return Number.isFinite(number)?number:null;}
function dateKey(value){return /^\d{4}-\d{2}-\d{2}/.test(value||"")?value.slice(0,10):"";}
function dateMs(value){
  if(!value)return NaN;
  const normalized=value.replace(" ","T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");
  return Date.parse(normalized);
}
function plusDays(key,amount){const [y,m,d]=key.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d+amount));return date.toISOString().slice(0,10);}
function sleepNightKey(start){const key=dateKey(start);if(!key)return "";const hour=Number(start.slice(11,13));return hour>=18?plusDays(key,1):key;}
function durationHours(start,end){const value=(dateMs(end)-dateMs(start))/3600000;return Number.isFinite(value)&&value>0&&value<36?value:0;}

function makeAggregate(){return {sources:{}};}
function addAggregate(day,key,source,value){
  if(value===null||!Number.isFinite(value))return;
  const metric=day[key]||(day[key]=makeAggregate()),sourceKey=source||"Невідоме джерело";
  const item=metric.sources[sourceKey]||(metric.sources[sourceKey]={sum:0,count:0,min:value,max:value});
  item.sum+=value;item.count++;item.min=Math.min(item.min,value);item.max=Math.max(item.max,value);
}
function bestAggregate(metric,mode="mean"){
  if(!metric)return null;const sources=Object.entries(metric.sources);if(!sources.length)return null;
  const selected=sources.sort((a,b)=>mode==="sum"?b[1].sum-a[1].sum:b[1].count-a[1].count)[0];
  const data=selected[1];return {value:mode==="sum"?data.sum:data.sum/data.count,min:data.min,max:data.max,count:data.count,source:selected[0]};
}

async function parseHealthXML(stream,totalBytes,fileName,routes){
  const days=new Map(),sleepNights=new Map(),weights=[],bmis=[],workouts=[],workoutKeys=new Set(),typeCounts={},sourceCounts={};
  let currentWorkout=null,recordCount=0,processed=0,lastProgress=0,buffer="",exportDate="";
  const ensureDay=key=>{if(!days.has(key))days.set(key,{date:key});return days.get(key);};
  const reader=stream.getReader(),decoder=new TextDecoder("utf-8",{fatal:false});

  const processTag=tag=>{
    if(tag.startsWith("<ExportDate")){exportDate=attrsFromTag(tag).value||exportDate;return;}
    if(tag.startsWith("<Record ")){
      const attrs=attrsFromTag(tag),type=shortType(attrs.type),key=dateKey(attrs.startDate),value=numeric(attrs.value);
      recordCount++;typeCounts[type]=(typeCounts[type]||0)+1;
      const source=attrs.sourceName||"Невідоме джерело";sourceCounts[source]=(sourceCounts[source]||0)+1;
      if(!key||!RELEVANT_TYPES.has(type))return;
      const day=ensureDay(key),unit=attrs.unit||"";
      if(type==="SleepAnalysis"){
        const nightKey=sleepNightKey(attrs.startDate),hours=durationHours(attrs.startDate,attrs.endDate);if(!nightKey||!hours)return;
        const night=sleepNights.get(nightKey)||{date:nightKey,sources:{}};sleepNights.set(nightKey,night);
        const sleepSource=night.sources[source]||(night.sources[source]={core:0,deep:0,rem:0,unspecified:0,awake:0,inBed:0,start:attrs.startDate,end:attrs.endDate});
        const category=String(attrs.value||"").replace("HKCategoryValueSleepAnalysis","");
        if(category==="AsleepCore")sleepSource.core+=hours;else if(category==="AsleepDeep")sleepSource.deep+=hours;else if(category==="AsleepREM")sleepSource.rem+=hours;else if(category.startsWith("Asleep"))sleepSource.unspecified+=hours;else if(category==="Awake")sleepSource.awake+=hours;else if(category==="InBed")sleepSource.inBed+=hours;
        if(dateMs(attrs.startDate)<dateMs(sleepSource.start))sleepSource.start=attrs.startDate;if(dateMs(attrs.endDate)>dateMs(sleepSource.end))sleepSource.end=attrs.endDate;
        return;
      }
      if(type==="BodyMass"){if(value!==null)weights.push({date:key,time:dateMs(attrs.startDate),value:unit==="lb"?value*.453592:value,source});return;}
      if(type==="BodyMassIndex"){if(value!==null)bmis.push({date:key,time:dateMs(attrs.startDate),value,source});return;}
      const conversions={
        OxygenSaturation:v=>v<=1?v*100:v,WalkingDoubleSupportPercentage:v=>v<=1?v*100:v,
        WalkingAsymmetryPercentage:v=>v<=1?v*100:v,AppleWalkingSteadiness:v=>v<=1?v*100:v,
        DistanceWalkingRunning:v=>unit==="m"?v/1000:v,WalkingSpeed:v=>unit==="m/s"?v*3.6:v
      };
      addAggregate(day,type,source,value===null?null:(conversions[type]?conversions[type](value):value));
      return;
    }
    if(tag.startsWith("<ActivitySummary ")){
      const attrs=attrsFromTag(tag),key=attrs.dateComponents;if(!key)return;const day=ensureDay(key);
      day.activitySummary={activeEnergy:numeric(attrs.activeEnergyBurned),activeEnergyGoal:numeric(attrs.activeEnergyBurnedGoal),exerciseMinutes:numeric(attrs.appleExerciseTime),exerciseGoal:numeric(attrs.appleExerciseTimeGoal),standHours:numeric(attrs.appleStandHours),standGoal:numeric(attrs.appleStandHoursGoal)};return;
    }
    if(tag.startsWith("<Workout ")){
      const attrs=attrsFromTag(tag);currentWorkout={type:shortType(attrs.workoutActivityType||"Other"),source:attrs.sourceName||"Apple Health",start:attrs.startDate||"",end:attrs.endDate||"",date:dateKey(attrs.startDate),duration:numeric(attrs.duration),distance:numeric(attrs.totalDistance),distanceUnit:attrs.totalDistanceUnit||"",energy:numeric(attrs.totalEnergyBurned),energyUnit:attrs.totalEnergyBurnedUnit||"",hasRoute:false};
      if(tag.endsWith("/>"))finalizeWorkout();return;
    }
    if(tag.startsWith("<WorkoutStatistics ")&&currentWorkout){
      const attrs=attrsFromTag(tag),type=shortType(attrs.type),sum=numeric(attrs.sum),unit=attrs.unit||"";
      if(type==="ActiveEnergyBurned"&&sum!==null){currentWorkout.energy=sum;currentWorkout.energyUnit=unit;}
      if((type==="DistanceWalkingRunning"||type==="DistanceCycling"||type==="DistanceSwimming")&&sum!==null){currentWorkout.distance=unit==="m"?sum/1000:sum;currentWorkout.distanceUnit=unit==="m"?"km":unit;}
      return;
    }
    if(tag.startsWith("<WorkoutRoute ")&&currentWorkout){currentWorkout.hasRoute=true;return;}
    if(tag.startsWith("</Workout>")){finalizeWorkout();}
  };

  const finalizeWorkout=()=>{
    if(!currentWorkout)return;const key=[currentWorkout.type,currentWorkout.start,currentWorkout.end,currentWorkout.source].join("|");
    if(!workoutKeys.has(key)){workoutKeys.add(key);workouts.push(currentWorkout);}currentWorkout=null;
  };

  while(true){
    const {done,value}=await reader.read();if(done)break;
    processed+=value.byteLength;buffer+=decoder.decode(value,{stream:true});
    const lastClose=buffer.lastIndexOf(">");
    if(lastClose>=0){const ready=buffer.slice(0,lastClose+1);buffer=buffer.slice(lastClose+1);const tags=ready.match(/<[^>]+>/g)||[];for(const tag of tags)processTag(tag);}
    if(Date.now()-lastProgress>350){
      const percent=totalBytes?Math.min(98,Math.round(processed/totalBytes*100)):0;
      self.postMessage({type:"progress",percent,records:recordCount,label:`Оброблено ${recordCount.toLocaleString("uk-UA")} записів`});lastProgress=Date.now();
    }
  }
  buffer+=decoder.decode();for(const tag of buffer.match(/<[^>]+>/g)||[])processTag(tag);finalizeWorkout();
  self.postMessage({type:"progress",percent:99,records:recordCount,label:"Формую денні підсумки…"});

  for(const night of sleepNights.values()){
    const candidates=Object.entries(night.sources).map(([source,value])=>({source,...value,total:value.core+value.deep+value.rem+value.unspecified})).filter(item=>item.total>0);
    if(!candidates.length)continue;const selected=candidates.sort((a,b)=>b.total-a.total)[0],day=ensureDay(night.date);
    day.sleep={hours:selected.total,core:selected.core,deep:selected.deep,rem:selected.rem,unspecified:selected.unspecified,awake:selected.awake,inBed:selected.inBed,start:selected.start,end:selected.end,source:selected.source};
  }
  const latestByDay=(items,target)=>{
    items.sort((a,b)=>a.time-b.time).forEach(item=>{const existing=target.get(item.date);if(!existing||item.time>=existing.time)target.set(item.date,item);});
  };
  const dailyWeight=new Map(),dailyBMI=new Map();latestByDay(weights,dailyWeight);latestByDay(bmis,dailyBMI);

  const outputDays=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>{
    const steps=bestAggregate(day.StepCount,"sum"),distance=bestAggregate(day.DistanceWalkingRunning,"sum"),energy=bestAggregate(day.ActiveEnergyBurned,"sum");
    const heart=bestAggregate(day.HeartRate),restingHeart=bestAggregate(day.RestingHeartRate),respiration=bestAggregate(day.RespiratoryRate),spo2=bestAggregate(day.OxygenSaturation);
    const walkingSpeed=bestAggregate(day.WalkingSpeed),stepLength=bestAggregate(day.WalkingStepLength),doubleSupport=bestAggregate(day.WalkingDoubleSupportPercentage),asymmetry=bestAggregate(day.WalkingAsymmetryPercentage),steadiness=bestAggregate(day.AppleWalkingSteadiness),vo2=bestAggregate(day.VO2Max);
    const activityEnergy=day.activitySummary?.activeEnergy??energy?.value??null;
    return {
      date:day.date,steps:steps?.value??null,stepSource:steps?.source||"",distance:distance?.value??null,distanceSource:distance?.source||"",
      activeEnergy:activityEnergy,activeEnergyGoal:day.activitySummary?.activeEnergyGoal??null,exerciseMinutes:day.activitySummary?.exerciseMinutes??null,standHours:day.activitySummary?.standHours??null,
      heartAvg:heart?.value??null,heartMin:heart?.min??null,heartMax:heart?.max??null,heartSource:heart?.source||"",restingHeartRate:restingHeart?.value??null,
      respiratoryRate:respiration?.value??null,spo2:spo2?.value??null,walkingSpeed:walkingSpeed?.value??null,stepLength:stepLength?.value??null,
      doubleSupport:doubleSupport?.value??null,asymmetry:asymmetry?.value??null,steadiness:steadiness?.value??null,vo2max:vo2?.value??null,
      sleep:day.sleep||null,weight:dailyWeight.get(day.date)?.value??null,weightSource:dailyWeight.get(day.date)?.source||"",bmi:dailyBMI.get(day.date)?.value??null
    };
  });
  const start=outputDays[0]?.date||"",end=outputDays[outputDays.length-1]?.date||"";
  return {
    format:"health-analytics-v1",version:1,importedAt:new Date().toISOString(),exportDate,fileName,
    coverage:{start,end,days:outputDays.length},totals:{records:recordCount,workouts:workouts.length,routes:routes.length},
    typeCounts,sourceCounts,days:outputDays,workouts:workouts.sort((a,b)=>String(a.start).localeCompare(String(b.start))),routes,
    processing:{stepMethod:"max-source-per-day",sleepMethod:"most-complete-source-per-night",rawRecordsStored:false}
  };
}
