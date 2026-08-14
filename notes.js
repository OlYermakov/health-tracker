const NOTES_KEY = "healthGlassDayNotes_v1";

function emptyNotes(){
  return Array.from({length:12},()=>Array.from({length:7},()=>""));
}

function loadNotes(){
  try{
    const raw=localStorage.getItem(NOTES_KEY);
    if(!raw)return emptyNotes();
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)||parsed.length!==12)return emptyNotes();
    return Array.from({length:12},(_,w)=>
      Array.from({length:7},(_,d)=>typeof parsed?.[w]?.[d]==="string"?parsed[w][d]:"")
    );
  }catch(e){
    return emptyNotes();
  }
}

const dayNotes=loadNotes();

function saveNotes(){
  localStorage.setItem(NOTES_KEY,JSON.stringify(dayNotes));
}

function escapeNote(value){
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function autoSizeNote(el){
  el.style.height="auto";
  el.style.height=Math.min(Math.max(el.scrollHeight,38),112)+"px";
}

function updateDayNote(dayIndex,el){
  dayNotes[currentWeek-1][dayIndex]=el.value;
  saveNotes();
  autoSizeNote(el);
  el.classList.add("saved");
  clearTimeout(el._savedTimer);
  el._savedTimer=setTimeout(()=>el.classList.remove("saved"),500);
}

renderRows=function(){
  const tbody=document.getElementById("weekRows");
  tbody.innerHTML="";
  const w=state.weeks[currentWeek-1];

  days.forEach((day,i)=>{
    const tr=document.createElement("tr");
    if(day.recommended)tr.classList.add("workout");

    const hint=day.note||"Додати нотатку…";
    const note=dayNotes[currentWeek-1][i]||"";

    tr.innerHTML=`
      <td>${day.name}</td>
      <td>${checkHTML(i,"breakfast",w.days[i].breakfast)}</td>
      <td>${checkHTML(i,"vegetables",w.days[i].vegetables)}</td>
      <td>${checkHTML(i,"water",w.days[i].water)}</td>
      <td>${checkHTML(i,"workout",w.days[i].workout)}</td>
      <td class="note-cell">
        <textarea class="day-note" rows="1" maxlength="500"
          aria-label="Нотатка: ${day.name}"
          placeholder="${escapeNote(hint)}"
          oninput="updateDayNote(${i},this)">${escapeNote(note)}</textarea>
      </td>`;
    tbody.appendChild(tr);
  });

  requestAnimationFrame(()=>{
    document.querySelectorAll(".day-note").forEach(autoSizeNote);
  });
};

renderAll();
