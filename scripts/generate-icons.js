// Renders PNG app icons from icon.svg (iOS and Android launchers need PNG).
// Usage: node scripts/generate-icons.js
const fs=require("fs");
const path=require("path");
const {chromium}=require("playwright");

const root=path.resolve(__dirname,"..");
const svg=fs.readFileSync(path.join(root,"icon.svg"),"utf8");
// Full-bleed square variant: iOS rounds corners itself and maskable icons are cropped by the launcher.
// The artwork stays inside the central 80% safe zone, so nothing important is cut off.
const squareSvg=svg.replace(/<rect([^>]*?)\s+rx="[^"]*"/,"<rect$1");

const outputs=[
  {file:"icons/icon-192.png",size:192,source:svg},
  {file:"icons/icon-512.png",size:512,source:svg},
  {file:"icons/icon-maskable-512.png",size:512,source:squareSvg},
  {file:"icons/apple-touch-icon.png",size:180,source:squareSvg}
];

(async()=>{
  fs.mkdirSync(path.join(root,"icons"),{recursive:true});
  const browser=await chromium.launch();
  const page=await browser.newPage();
  for(const {file,size,source} of outputs){
    await page.setViewportSize({width:size,height:size});
    const sized=source.replace("<svg ",`<svg width="${size}" height="${size}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.screenshot({path:path.join(root,file),omitBackground:true,clip:{x:0,y:0,width:size,height:size}});
    console.log("wrote",file);
  }
  await browser.close();
})();
