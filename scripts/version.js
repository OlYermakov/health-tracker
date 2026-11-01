// Keeps the cache-busting asset version in sync across index.html, analytics.js and sw.js.
//   node scripts/version.js          -> bump to the next version
//   node scripts/version.js 40       -> set an explicit version
//   node scripts/version.js --check  -> fail if the files disagree (used by the tests)
const fs=require("fs");
const path=require("path");

const root=path.resolve(__dirname,"..");
const VERSIONED_FILES=["index.html","analytics.js"];
const ASSET_VERSION=/(\.(?:css|js)\?v=)(\d+)/g;
const SW_VERSION=/const VERSION="(\d+)";/;

function read(file){return fs.readFileSync(path.join(root,file),"utf8");}

function collectVersions(){
  const found=[];
  const swMatch=read("sw.js").match(SW_VERSION);
  if(!swMatch)throw new Error("sw.js: const VERSION not found");
  found.push({file:"sw.js",version:swMatch[1]});
  for(const file of VERSIONED_FILES){
    for(const match of read(file).matchAll(ASSET_VERSION))found.push({file,version:match[2]});
  }
  return found;
}

function currentVersion(){return Number(read("sw.js").match(SW_VERSION)[1]);}

function setVersion(version){
  const value=String(version);
  fs.writeFileSync(path.join(root,"sw.js"),read("sw.js").replace(SW_VERSION,`const VERSION="${value}";`));
  for(const file of VERSIONED_FILES)fs.writeFileSync(path.join(root,file),read(file).replace(ASSET_VERSION,`$1${value}`));
}

function check(){
  const versions=collectVersions();
  const distinct=[...new Set(versions.map(item=>item.version))];
  if(distinct.length!==1){
    const details=versions.map(item=>`  ${item.file}: v${item.version}`).join("\n");
    throw new Error(`Asset versions disagree:\n${details}\nRun: node scripts/version.js`);
  }
  return distinct[0];
}

if(require.main===module){
  const arg=process.argv[2];
  try{
    if(arg==="--check"){console.log(`Asset version v${check()} is consistent.`);}
    else{
      const next=arg?Number(arg):currentVersion()+1;
      if(!Number.isInteger(next)||next<1)throw new Error(`Invalid version: ${arg}`);
      setVersion(next);check();console.log(`Asset version set to v${next}.`);
    }
  }catch(error){console.error(error.message);process.exit(1);}
}

module.exports={check,collectVersions};
