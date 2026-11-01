// Browser tests for loading, data migration, saving and backup restore.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const os=require("os");
const path=require("path");
const {setup,readStore}=require("./helpers");

let env;
test.before(async()=>{env=await setup();});
test.after(async()=>{await env.teardown();});

const seed=(entries)=>({fn:items=>{if(!sessionStorage.getItem("seeded")){sessionStorage.setItem("seeded","1");localStorage.clear();for(const [key,value] of Object.entries(items))localStorage.setItem(key,value);}},arg:entries});

test("app opens every screen without errors on phone and desktop",async()=>{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
    const page=await env.newPage({viewport});
    for(const screen of ["week","training","progress","more","today"]){
      await page.click(`[data-app-screen=${screen}]`);
      await page.waitForTimeout(150);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"horizontal scroll");
    assert.deepEqual(page.errors,[]);
    await page.context().close();
  }
});

test("legacy v1 data is migrated into the unified store",async()=>{
  const weeks=Array.from({length:12},()=>({startWeight:"",endWeight:"",mood:"",days:[],training:{}}));
  weeks[0]={startWeight:"92.5",endWeight:"91.8",mood:"4",days:[{breakfast:true,workout:true}],
    training:{A:{done:true,day:2,durationMinutes:45,completedAt:"2026-01-07T10:00:00.000Z",exercises:[true,true,true,true,false,false,false]}}};
  const notes=Array.from({length:12},()=>Array(7).fill(""));notes[0][1]="стара нотатка";
  const page=await env.newPage({init:seed({healthGlassTracker_v1:JSON.stringify({weeks}),healthGlassDayNotes_v1:JSON.stringify(notes)})});
  const store=await readStore(page);
  assert.equal(store.tracker.weeks[0].startWeight,"92.5");
  assert.equal(store.tracker.weeks[0].days[0].breakfast,true);
  assert.equal(store.tracker.weeks[0].days[0].activity,true,"old 'workout' flag becomes 'activity'");
  assert.equal(store.notes[0][1],"стара нотатка");
  const legacyRecords=store.enhancements.history.filter(record=>record.planKey==="A"&&record.weekIndex===0);
  assert.equal(legacyRecords.length,1,"completed legacy workout becomes one history record");
  assert.equal(legacyRecords[0].durationMinutes,"45");
  assert.equal(store.enhancements.weeks[0].logs.A[0].sets.every(set=>set.done),true,"done exercises mark their sets as done");
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});

test("corrupted main store falls back to the recovery copy",async()=>{
  const first=await env.newPage();
  await first.evaluate(()=>{state.weeks[2].startWeight="88";persist();flushUnifiedStore(true);});
  const recovery=await first.evaluate(()=>localStorage.getItem("healthTrackerRecovery_v1"));
  await first.context().close();
  const page=await env.newPage({init:seed({healthTrackerUnified_v3:"{broken json",healthTrackerRecovery_v1:recovery})});
  assert.equal(await page.evaluate(()=>state.weeks[2].startWeight),"88");
  await page.context().close();
});

test("garbage values in storage do not break the app",async()=>{
  const junk=JSON.stringify({tracker:{weeks:"nope"},notes:42,enhancements:{weeks:[null,{logs:{A:"x"}}],history:[null,{weekIndex:99},{weekIndex:1,planKey:"Z"}],startDate:"not a date"}});
  const page=await env.newPage({init:seed({healthTrackerUnified_v3:junk})});
  const result=await page.evaluate(()=>({weeks:state.weeks.length,notes:dayNotes.length,history:enhancements.history.length,plan:enhancements.history[0]?.planKey}));
  assert.deepEqual(result,{weeks:12,notes:12,history:1,plan:"A"});
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});

test("typed changes are saved after a short delay and on page close",async()=>{
  const page=await env.newPage();
  const note=page.locator(".today-note textarea");
  await note.fill("перша");
  await page.waitForTimeout(700);
  assert.match(await page.evaluate(()=>localStorage.getItem("healthTrackerUnified_v3")),/перша/);
  await note.fill("друга");
  await page.reload();
  assert.equal(await page.locator(".today-note textarea").inputValue(),"друга","pending write is flushed on pagehide");
  await page.context().close();
});

test("full storage drops the recovery copy, then warns the user",async()=>{
  const page=await env.newPage();
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      let used=0;for(const other of Object.keys(this))if(other!==key)used+=this.getItem(other).length;
      if(used+value.length>45000)throw new DOMException("full","QuotaExceededError");
      return original.call(this,key,value);
    };
    state.weeks[0].mood="5";
  });
  assert.equal(await page.evaluate(()=>flushUnifiedStore()),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem("healthTrackerRecovery_v1")),null);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException("full","QuotaExceededError");};state.weeks[0].mood="3";});
  assert.equal(await page.evaluate(()=>flushUnifiedStore()),false);
  assert.match(await page.locator("#appToast").textContent(),/закінчилося місце/);
  await page.context().close();
});

test("backup export can be restored in a fresh browser",async()=>{
  const source=await env.newPage();
  await source.evaluate(()=>{state.weeks[0].startWeight="95";dayNotes[3][4]="нотатка з копії";enhancements.weeks[1].waist="101";persist();saveNotes();persistEnhancements();});
  const [download]=await Promise.all([source.waitForEvent("download"),source.evaluate(()=>exportBackup())]);
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"backup-")),"backup.json");
  await download.saveAs(file);
  await source.context().close();

  const target=await env.newPage();
  await Promise.all([target.waitForEvent("load"),target.setInputFiles("#backupFile",file)]);
  await target.waitForFunction(()=>typeof state==="object");
  const restored=await target.evaluate(()=>({weight:state.weeks[0].startWeight,note:dayNotes[3][4],waist:enhancements.weeks[1].waist}));
  assert.deepEqual(restored,{weight:"95",note:"нотатка з копії",waist:"101"});
  await target.context().close();
});

test("an invalid backup file is rejected and data stays untouched",async()=>{
  const page=await env.newPage();
  await page.evaluate(()=>{state.weeks[0].startWeight="77";persist();flushUnifiedStore();});
  const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"backup-")),"bad.json");
  fs.writeFileSync(file,JSON.stringify({format:"something-else"}));
  await page.setInputFiles("#backupFile",file);
  await page.waitForFunction(()=>/не є коректною/.test(document.getElementById("appToast").textContent));
  assert.equal((await readStore(page)).tracker.weeks[0].startWeight,"77");
  await page.context().close();
});

test("guided workout, pool session and history undo work end to end",async()=>{
  const page=await env.newPage();
  page.on("dialog",dialog=>dialog.accept());
  // Gym workout A: pick a day, complete 4 exercises, finish.
  await page.evaluate(()=>{
    startGuidedWorkout("A");setGuidedDay("0");
    for(let exercise=0;exercise<4;exercise++)exerciseLog(currentWeek-1,"A",exercise).sets.forEach((_,set)=>toggleExerciseSet("A",exercise,set,true));
    finishGuidedWorkout();
  });
  let result=await page.evaluate(()=>({active:enhancements.activeWorkout,done:state.weeks[0].training.A.done,gym:enhancements.history.filter(r=>r.kind==="gym").length}));
  assert.deepEqual(result,{active:null,done:true,gym:1});

  // Pool session on another day.
  await page.evaluate(()=>{
    openPoolSession(0);
    [["day","3"],["durationMinutes","40"],["distanceMeters","1000"],["swimStyle","crawl"],["intensity","moderate"]].forEach(([key,value])=>updatePoolDraft(key,value));
    savePoolSession();
  });
  assert.equal(await page.evaluate(()=>enhancements.history.filter(r=>r.kind==="pool").length),1);

  // Cancel the gym record and undo the cancellation.
  await page.evaluate(()=>cancelHistoryRecord(encodeURIComponent(enhancements.history.find(r=>r.kind==="gym").id)));
  assert.equal(await page.evaluate(()=>enhancements.history.some(r=>r.kind==="gym")),false);
  await page.evaluate(()=>undoHistoryChange());
  result=await page.evaluate(()=>({gym:enhancements.history.filter(r=>r.kind==="gym").length,done:state.weeks[0].training.A.done}));
  assert.deepEqual(result,{gym:1,done:true});

  const store=await readStore(page);
  assert.equal(store.enhancements.history.length,2);
  assert.deepEqual(page.errors,[]);
  await page.context().close();
});
