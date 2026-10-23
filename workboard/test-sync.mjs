// Real screens against an in-memory server: no production accounts, DB, or external requests.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {applyOp,normalizeBoard} from './board-ops.js';
import {assets,mime} from './cloud/assets.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let board=normalizeBoard(JSON.parse(await readFile(new URL('study-spatial-seed.json',import.meta.url),'utf8'))),rev=1;
const requests=[],errors=[],checks=[];
let failState=false,holdState=false,releaseState;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname,who=req.headers['x-test-user']||'a';
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    if(path.startsWith('/api/')){
      requests.push({who,path,method:req.method,query:url.search,referer:req.headers.referer});
      if(path==='/api/config')return json({cloud:true});
      if(path==='/api/session')return json({user:{id:who,name:'검증 '+who,username:'검증 '+who,mustChangePassword:false}});
      if(path==='/api/profiles')return json({profiles:[]});
      if(path==='/api/state'){
        if(failState)return json({message:'검증용 일시 오류'},503);
        const data=Number(url.searchParams.get('since'))===rev?{rev}:{board:structuredClone(board),rev};
        if(holdState){holdState=false;releaseState=()=>{releaseState=undefined;json(data);};return;}
        return json(data);
      }
      if(path==='/api/presence')return json({peers:{}});
      if(path==='/api/meetings/notices')return json({notices:[]});
      if(path==='/api/meetings/list')return json({rooms:[]});
      if(path==='/api/meetings/chat')return json({messages:[],hasMore:false});
      if(path==='/api/planning/items')return json({items:[],members:[]});
      if(path==='/api/op'){
        let body='';for await(const chunk of req)body+=chunk;
        const input=JSON.parse(body),result=applyOp(board,input.op,{by:'검증 '+who,at:new Date().toISOString()});
        if(result.error)return json(result,409);
        rev++;return json({ok:true,rev});
      }
      return json({error:'unexpected test endpoint'},404);
    }
    const file=path==='/'?'index.html':path.slice(1);
    if(!assets.includes(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':mime(file)});res.end(await readFile(new URL(file,import.meta.url)));
  }catch(error){errors.push(error.stack);if(!res.headersSent)json({error:'test server error'},500);else res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const count=(path,who='a')=>requests.filter(r=>r.path===path&&r.who===who).length;
let browser;
async function newPage(who,route='/#spatial'){
  const context=await browser.newContext({viewport:{width:1440,height:1050},extraHTTPHeaders:{'x-test-user':who}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(()=>{
    window.testHidden=false;window.testOffline=false;
    Object.defineProperty(document,'hidden',{get:()=>window.testHidden});
    Object.defineProperty(navigator,'onLine',{get:()=>!window.testOffline});
    localStorage.setItem('workboard-collab-migrated','1');
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const time=new Date('2026-10-23T07:00:00Z');
  await page.clock.install({time});await page.clock.pauseAt(time);
  await page.goto(origin+route);
  await page.waitForFunction(()=>!!window.__workboardSharedTransport?.feed?.snapshot);
  await settle(page);
  return page;
}
async function settle(page){await page.waitForFunction(()=>!window.__workboardSharedTransport.feed.inflight);}
async function step(page,ms){await page.clock.runFor(ms);await settle(page);}
async function hidden(page,value){await page.evaluate(value=>{window.testHidden=value;document.dispatchEvent(new Event('visibilitychange'));},value);await settle(page);}
try{
  browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true});
  const a=await newPage('a'),map=a.frameLocator('#spatial-frame');
  await map.locator('#add-node').waitFor();
  await a.waitForFunction(()=>window.__workboardSharedTransport.feed.clients.size===2);
  assert.equal(count('/api/config'),1);assert.equal(count('/api/session'),1);
  assert.equal(count('/api/state'),1);assert.equal(count('/api/presence'),1);
  const start=count('/api/state');
  for(let i=0;i<4;i++)await step(a,2500);
  assert.equal(count('/api/state')-start,4,'one state request per interval, including the embedded map');
  assert(requests.filter(r=>r.path==='/api/state'&&r.who==='a').every(r=>!r.referer.includes('spatial.html')));
  checks.push('map shares one authentication, state loop and initial presence heartbeat with parent');

  const b=await newPage('b'),other=b.frameLocator('#spatial-frame');
  await other.locator('#add-node').waitFor();
  await map.locator('#add-node').click();
  await map.locator('#new-form [name="title"]').fill('동기화 검증 노드');
  await map.locator('#new-form button[type="submit"]').click();
  await map.locator('#edit-form [name="title"]').waitFor();
  assert(board.spatial.nodes.some(n=>n.title==='동기화 검증 노드'));
  await step(b,2500);
  assert((await other.locator('#node-list').textContent()).includes('동기화 검증 노드'));
  assert.equal(await a.evaluate(()=>window.__workboardSharedTransport.feed.rev),rev);
  checks.push('map save refreshes parent immediately and reaches a second user');

  await map.locator('#add-node').click();
  await map.locator('#new-form [name="title"]').fill('미저장 초안');
  await a.locator('#nav a[href="#todos"]').click();
  await a.locator('#app').waitFor({state:'hidden'});
  assert.equal(await a.locator('#app').isHidden(),true);
  assert.equal(await a.evaluate(()=>window.__workboardSharedTransport.feed.clients.size),1);
  board.projectName='다른 팀원의 변경';rev++;
  await step(a,2500);
  await a.locator('#nav a[href="#spatial"]').click();
  await a.locator('#app').waitFor({state:'visible'});
  assert.equal(await map.locator('#new-form [name="title"]').inputValue(),'미저장 초안');
  assert.equal(await a.evaluate(()=>window.__workboardSharedTransport.feed.clients.size),2);
  await map.locator('#cancel-create').click();
  checks.push('inactive map unsubscribes, preserves drafts, and resumes the latest shared snapshot');

  for(const route of ['chat','meetings','spatial','idea','ux','backend','spatial']){
    await a.locator(`#nav a[href="#${route}"]`).click();
    if(['chat','meetings'].includes(route))await a.waitForFunction(()=>window.__workboardSharedTransport.feed.clients.size===1);
    else {
      await a.waitForFunction(()=>!document.querySelector('#app').hidden);
      await a.frameLocator('#spatial-frame').locator('#add-node').waitFor();
      await a.waitForFunction(()=>window.__workboardSharedTransport.feed.clients.size===2);
    }
  }
  const before=count('/api/state');await step(a,2500);
  assert.equal(count('/api/state')-before,1,'route navigation does not accumulate pollers');
  checks.push('route changes do not leak iframe subscriptions or duplicate state timers');

  await hidden(a,true);
  const pausedState=count('/api/state'),pausedPresence=count('/api/presence'),notices=count('/api/meetings/notices');
  await step(a,90000);
  assert.equal(count('/api/state'),pausedState);assert.equal(count('/api/presence'),pausedPresence);
  assert(count('/api/meetings/notices')>notices,'recording deletion notices continue in the background');
  board.projectName='복귀 즉시 최신 작업판';rev++;
  await hidden(a,false);
  assert.equal(await a.locator('#project-breadcrumb').textContent(),board.projectName);
  assert.equal(count('/api/state'),pausedState+1);
  checks.push('hidden tabs stop board polling and presence; notices continue; resume refreshes immediately');

  await a.clock.fastForward(60000);await settle(a);
  const idle=count('/api/state');
  await step(a,9000);assert.equal(count('/api/state'),idle);
  await step(a,1000);assert.equal(count('/api/state'),idle+1);
  // Input inside the iframe must wake the parent-owned timer too.
  await a.frameLocator('#spatial-frame').locator('#search').fill('동기화');await settle(a);
  assert.equal(count('/api/state'),idle+2);
  await step(a,2500);assert.equal(count('/api/state'),idle+3);
  checks.push('visible idle polling slows to ten seconds and iframe interaction restores active polling');

  await a.evaluate(()=>{window.testOffline=true;window.dispatchEvent(new Event('offline'));});
  const offline=count('/api/state');await step(a,30000);assert.equal(count('/api/state'),offline);
  await a.evaluate(()=>{window.testOffline=false;window.dispatchEvent(new Event('online'));});await settle(a);
  assert.equal(count('/api/state'),offline+1);
  failState=true;await step(a,2500);
  assert((await a.locator('#collab-presence').textContent()).includes('연결 끊김'));
  failState=false;await step(a,5000);
  assert((await a.locator('#collab-presence').textContent()).includes('접속 중'));
  checks.push('offline pauses requests; successful unchanged revision restores connection after a failure');

  holdState=true;await a.clock.runFor(2500);
  await a.waitForFunction(()=>!!window.__workboardSharedTransport.feed.inflight);
  while(!releaseState)await new Promise(resolve=>setTimeout(resolve,10));
  const held=count('/api/state');
  const refresh=a.evaluate(async()=>{const {refreshBoard}=await import('./transport.js');await Promise.all([refreshBoard(),refreshBoard()]);});
  board.projectName='진행 중 조회와 저장 겹침';rev++;
  releaseState();await refresh;await settle(a);
  assert.equal(count('/api/state'),held+1,'concurrent full refreshes share one follow-up request');
  assert.equal(await a.locator('#project-breadcrumb').textContent(),board.projectName);
  checks.push('concurrent refreshes wait for in-flight state and coalesce a full snapshot without losing changes');

  const standalone=await newPage('standalone','/spatial.html');
  await standalone.locator('#add-node').waitFor();
  assert.equal(count('/api/state','standalone'),1);
  await standalone.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await step(standalone,30000);assert.equal(count('/api/state','standalone'),1);
  await standalone.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await settle(standalone);assert.equal(count('/api/state','standalone'),2);
  checks.push('standalone map works and page lifecycle suspends/resumes its connection');

  await a.setViewportSize({width:390,height:844});
  assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no mobile page overflow');
  assert.deepEqual(errors,[]);
  const out=new URL('test-output/',import.meta.url);await mkdir(out,{recursive:true});
  await a.screenshot({path:new URL('sync-mobile.png',out).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await writeFile(new URL('sync-results.json',out),JSON.stringify({checks,errors,requests:requests.length},null,2));
  console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
}finally{
  releaseState?.();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
