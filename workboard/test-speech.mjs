import http from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {assets,mime} from './cloud/assets.mjs';
const out=new URL('test-output/',import.meta.url),fixtures=JSON.parse(await readFile(new URL('audio-fixtures/manifest.json',out),'utf8'));
const csp=JSON.parse(await readFile(new URL('vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{if(path==='/'){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':csp});return res.end('<!doctype html><html><body>음성인식 검증</body></html>');}const file=path.slice(1);if(assets.includes(file)){res.writeHead(200,{'Content-Type':mime(file)});return res.end(await readFile(new URL(file,import.meta.url)));}if(fixtures.samples.some(f=>f.file===file)){res.writeHead(200,{'Content-Type':'audio/wav'});return res.end(await readFile(new URL('audio-fixtures/'+file,out)));}res.writeHead(404);res.end();}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(import.meta.url)('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser;const results=[];
function cer(a,b){a=[...a.replace(/[\s\p{P}\p{S}]/gu,'')];b=[...b.replace(/[\s\p{P}\p{S}]/gu,'')];let d=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let n=[i];for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]+1,d[j]+1,d[j-1]+(a[i-1]!==b[j-1]));d=n;}return{edits:d[b.length],characters:a.length,rate:d[b.length]/a.length};}
try{browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>console.log(m.text().slice(0,240)));await page.goto(origin);
 await page.evaluate(()=>{window.testWorker=new Worker('/speech-worker.js',{type:'module'});});
 for(const fixture of fixtures.samples){const start=Date.now();const result=await page.evaluate(async f=>{const {pcm16}=await import('/meeting-storage.js');const samples=await pcm16(await(await fetch('/'+f.file)).blob());return new Promise((resolve,reject)=>{let last=0;window.testWorker.onmessage=({data})=>{if(data.type==='result')resolve(data);else if(data.type==='error')reject(new Error(data.message));else if(Date.now()-last>5000){console.log(JSON.stringify(data));last=Date.now();}};window.testWorker.onerror=e=>reject(new Error(e.message));window.testWorker.postMessage({samples,language:'korean'},[samples.buffer]);});},fixture);const hypothesis=result.segments.map(s=>s.text).join(' ');const measured={...fixture,hypothesis,cer:cer(fixture.reference,hypothesis),seconds:(Date.now()-start)/1000,model:result.model};results.push(measured);console.log(JSON.stringify(measured));}
 const total={edits:results.reduce((n,r)=>n+r.cer.edits,0),characters:results.reduce((n,r)=>n+r.cer.characters,0)};total.rate=total.edits/total.characters;
 await writeFile(new URL('speech-quality.json',out),JSON.stringify({results,total},null,2));assert(total.rate<.25,'Korean character error rate must be below 25% on these fixtures');assert(results.every(r=>r.cer.rate<.4),'No fixture may lose most of its content');console.log('PASS speech quality '+JSON.stringify(total));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
