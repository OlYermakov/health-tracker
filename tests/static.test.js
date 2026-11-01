// Checks that need no browser: versions, referenced files and the offline cache list.
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const {ROOT}=require("./helpers");
const {check}=require("../scripts/version");

const html=fs.readFileSync(path.join(ROOT,"index.html"),"utf8");
const localRefs=[...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(match=>match[1]);

function serviceWorkerShell(){
  const listeners={};
  const sandbox={self:{addEventListener:(type,fn)=>{listeners[type]=fn;},location:{origin:"http://x"}},caches:{},fetch(){}};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,"sw.js"),"utf8")+";this.APP_SHELL=APP_SHELL;",sandbox);
  return sandbox.APP_SHELL;
}

test("asset versions are consistent across files",()=>{assert.ok(check());});

test("every file referenced by index.html exists",()=>{
  assert.ok(localRefs.length>10);
  for(const ref of localRefs){
    const file=path.join(ROOT,ref.split("?")[0]);
    assert.ok(fs.existsSync(file),`missing ${ref}`);
  }
});

test("service worker caches every script, stylesheet and icon of the page",()=>{
  const shell=new Set(serviceWorkerShell());
  for(const ref of localRefs)assert.ok(shell.has(`./${ref}`),`${ref} is not in the offline cache`);
});

test("every file in the service worker cache exists",()=>{
  for(const entry of serviceWorkerShell()){
    if(entry==="./")continue;
    assert.ok(fs.existsSync(path.join(ROOT,entry.split("?")[0])),`missing ${entry}`);
  }
});

test("manifest has PNG icons for install and a separate maskable icon",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"manifest.webmanifest"),"utf8"));
  const sizes=manifest.icons.filter(icon=>icon.type==="image/png").map(icon=>icon.sizes);
  assert.ok(sizes.includes("192x192")&&sizes.includes("512x512"));
  assert.ok(manifest.icons.some(icon=>icon.purpose==="maskable"));
  assert.ok(!manifest.icons.some(icon=>/any.*maskable|maskable.*any/.test(icon.purpose)),"do not combine any+maskable");
  for(const icon of manifest.icons)assert.ok(fs.existsSync(path.join(ROOT,icon.src)),`missing ${icon.src}`);
});
