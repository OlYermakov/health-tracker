// Event delegation instead of inline onclick/oninput/... attributes.
// Markup declares   data-click="fnName" data-click-args='["A",1]'
// and one listener per event type on document calls the global function.
// Special arguments: "$value" -> element.value, "$el" -> the element, "$event" -> the event.
// This keeps the page compatible with a strict Content-Security-Policy (no inline script).
const DELEGATED_EVENTS=["click","input","change","submit"];

function escapeActionAttr(value){
  return String(value).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

// Builds the attributes for a template: `<button ${act("click","selectPlan","A")}>`.
function act(type,fn,...args){
  return `data-${type}="${fn}"${args.length?` data-${type}-args="${escapeActionAttr(JSON.stringify(args))}"`:""}`;
}

function resolveActionArg(arg,element,event){
  if(arg==="$value")return element.value;
  if(arg==="$el")return element;
  if(arg==="$event")return event;
  return arg;
}

function dispatchDelegatedEvent(event){
  const type=event.type;
  let element=event.target instanceof Element?event.target:event.target?.parentElement;
  // Walk up like inline handlers would bubble, calling every declared handler.
  for(;element&&element!==document.documentElement;element=element.parentElement){
    const name=element.getAttribute(`data-${type}`);
    if(!name)continue;
    const handler=window[name];
    if(typeof handler!=="function"){console.error(`Unknown ${type} handler: ${name}`);continue;}
    let args=[];
    try{args=JSON.parse(element.getAttribute(`data-${type}-args`)||"[]");}catch(error){console.error(error);continue;}
    handler(...args.map(arg=>resolveActionArg(arg,element,event)));
    if(event.cancelBubble)break;
  }
}

DELEGATED_EVENTS.forEach(type=>document.addEventListener(type,dispatchDelegatedEvent));
