// Shared test helpers: a tiny static server for the repo and a Playwright browser.
const http=require("http");
const fs=require("fs");
const path=require("path");
const {chromium}=require("playwright");

const ROOT=path.resolve(__dirname,"..");
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp"};

function startServer(){
  const server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
    const file=path.join(ROOT,pathname.endsWith("/")?pathname+"index.html":pathname);
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){response.writeHead(404);response.end();return;}
    response.writeHead(200,{"Content-Type":TYPES[path.extname(file)]||"application/octet-stream"});
    fs.createReadStream(file).pipe(response);
  });
  return new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve({server,url:`http://127.0.0.1:${server.address().port}/`})));
}

async function setup(){
  const {server,url}=await startServer();
  const browser=await chromium.launch();
  return {
    url,browser,
    async newPage({viewport={width:390,height:844},init}={}){
      const context=await browser.newContext({viewport,serviceWorkers:"block"});
      if(init)await context.addInitScript(init.fn,init.arg);
      const page=await context.newPage();
      page.errors=[];
      page.on("pageerror",error=>page.errors.push(error.message));
      page.on("console",message=>{if(message.type()==="error")page.errors.push(message.text());});
      await page.goto(url);
      await page.waitForFunction(()=>typeof renderAll==="function"&&typeof enhancements==="object");
      return page;
    },
    async teardown(){await browser.close();server.close();}
  };
}

const readStore=page=>page.evaluate(()=>{flushUnifiedStore();return JSON.parse(localStorage.getItem("healthTrackerUnified_v3"));});

module.exports={ROOT,setup,readStore};
