import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {withStructure,structureOperations} from './structure-import.mjs';
import {applyOp,normalizeBoard} from './board-ops.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const seed=read('./study-spatial-seed.json'),manifest=read('./structure-snapshot.json'),board=withStructure(seed,manifest);
assert.deepEqual(board.screens,normalizeBoard(seed).screens);assert.equal(structureOperations(board,manifest).length,0);
assert(board.spatial.nodes.some(n=>n.kind==='table'));assert(board.spatial.nodes.some(n=>n.kind==='idea'&&n.parentId));
for(const e of board.spatial.edges.filter(e=>e.evidence==='code'))assert(e.source.includes(manifest.codeRef));
const button=board.spatial.nodes.find(n=>n.id==='button-start-free');assert.equal(button.uiSelector,'[data-start-free]');
const reachable=new Set([button.id]);for(let i=0;i<8;i++)for(const e of board.spatial.edges)if(reachable.has(e.from)&&e.relation==='calls')reachable.add(e.to);
assert(reachable.has('mcp-start_study_session'));assert(board.spatial.nodes.some(n=>n.symbol==='PilotService.startSession'&&reachable.has(n.id)));assert(board.spatial.nodes.some(n=>n.kind==='rpc'&&reachable.has(n.id)));
const edited=structuredClone(board);assert(applyOp(edited,{type:'spatial.node.update',id:button.id,expectedVersion:button.version,fields:{filePath:'src/pilot/ui.ts',symbol:'new-symbol',uiSelector:'[data-test]',followup:'검증'}}).ok);assert.equal(normalizeBoard(edited).spatial.nodes.find(n=>n.id===button.id).symbol,'new-symbol');
const out=new URL('./test-output/',import.meta.url),runtime=new URL('structure-runtime-'+Date.now()+'/',out);mkdirSync(new URL('data/',runtime),{recursive:true});
for(const f of ['meetings.js','meetings.css','meeting-call.js','meeting-storage.js','server.mjs','board-ops.js','spatial-ops.js','transport.js','app.js','index.html','styles.css','collab.css','spatial.html','spatial-view.js','structure.css','plane-content.js','product-ui-preview.html','product-preview-bridge.js'])copyFileSync(new URL(f,import.meta.url),new URL(f,runtime));
writeFileSync(new URL('data/board.json',runtime),JSON.stringify(board));
const port=42000+Math.floor(Math.random()*10000),host='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(runtime),env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(host+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1520,height:1050}}),errors=[],previewRequests=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
 page.on('request',r=>{if(r.frame()?.url().includes('product-ui-preview.html'))previewRequests.push(r.url());});
 await page.addInitScript(()=>localStorage.setItem('workboard-collab-name','검증'));await page.goto(host+'/#ux');const frame=page.frameLocator('#spatial-frame');await frame.getByText('서버 연결됨',{exact:true}).waitFor();await page.locator('.nav-subitem[aria-current=page]').filter({hasText:'UI/UX'}).waitFor();
 const preview=frame.frameLocator('.product-preview');await preview.getByRole('button',{name:'자유 학습 시작',exact:true}).click();await preview.getByRole('button',{name:'목표 변경',exact:true}).waitFor();
 await frame.locator('#edit-form [name=title]').waitFor();assert.equal(await frame.locator('#edit-form [name=title]').inputValue(),'자유 학습 시작');
 assert.match(await frame.locator('.selected-path').innerText(),/start_study_session/);assert.match(await frame.locator('.selected-path').innerText(),/PilotService.startSession/);
 await preview.getByRole('button',{name:'목표 변경',exact:true}).click();await frame.locator('#edit-form [name=title]').filter({visible:true}).waitFor();await page.waitForTimeout(250);assert.equal(await frame.locator('#edit-form [name=title]').inputValue(),'목표 변경');
 await preview.getByRole('button',{name:'정리하기',exact:true}).click();await page.waitForTimeout(350);assert.equal(await frame.locator('#edit-form [name=title]').inputValue(),'정리하기');assert.match(await frame.locator('.selected-path').innerText(),/후속 채팅 요청/);
 assert(previewRequests.every(url=>!url.includes('/api/')&&!url.includes('supabase')));
 await frame.locator('[data-preview-screen]').selectOption('plan_input');await preview.locator('#plan-course-form').waitFor();
 await page.screenshot({path:fileURLToPath(new URL('structure-ux.png',out)),fullPage:true});
 await page.goto(host+'/#backend');await frame.getByText('서버 연결됨',{exact:true}).waitFor();assert.match(await frame.locator('.code-tree').innerText(),/src\/pilot\/service.ts/);
 const handler=board.spatial.nodes.find(n=>n.symbol==='PilotService.startSession');await frame.locator('[data-anchor="'+handler.id+'"]').click();await frame.locator('[name=followup]').fill('파일 관계 검증');await frame.getByRole('button',{name:'변경 저장',exact:true}).click();await frame.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
 const state=(await(await fetch(host+'/api/state')).json()).board;assert.equal(state.spatial.nodes.find(n=>n.id===handler.id).followup,'파일 관계 검증');assert.equal(state.spatial.nodes.find(n=>n.id===handler.id).filePath,'src/pilot/service.ts');
 await page.screenshot({path:fileURLToPath(new URL('structure-backend.png',out)),fullPage:true});
 await page.goto(host+'/#spatial/button-start-free');await frame.getByText('서버 연결됨',{exact:true}).waitFor();assert.equal(await frame.locator('#feature-title').innerText(),'학습 시작');await frame.locator('.spatial-link').first().waitFor({state:'visible'});
 const faces=await frame.locator('.face').evaluateAll(es=>es.map(el=>getComputedStyle(el).transform));assert.equal(new Set(faces).size,4);assert(faces.every(x=>x.startsWith('matrix3d')));
 const matrix=await frame.locator('.world').evaluate(el=>el.style.transform);await frame.locator('#rotate-right').click();await page.waitForTimeout(150);assert.notEqual(await frame.locator('.world').evaluate(el=>el.style.transform),matrix);
 await frame.locator('#rotate-left').click();await frame.locator('#element-tree').evaluate(el=>el.open=true);await frame.locator('#node-list [data-select="button-start-free"]').click();await frame.locator('#element-tree').evaluate(el=>el.open=false);await frame.locator('body').evaluate(()=>scrollTo(0,0));await frame.locator('.spatial-link').first().waitFor({state:'visible'});await page.screenshot({path:fileURLToPath(new URL('structure-3d.png',out)),fullPage:true});
 for(const route of ['idea','ux','mcp','backend','spatial']){await page.goto(host+'/#'+route);await frame.getByText('서버 연결됨',{exact:true}).waitFor();assert(await page.locator('.nav-item[aria-current=page]').count()===1);for(const width of [905,768,640,390,320]){await page.setViewportSize({width,height:844});if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))console.log('OVERFLOW',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right})).slice(0,12)));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' outer overflow');assert(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' inner overflow');}await page.setViewportSize({width:1520,height:1050});}
 assert.deepEqual(errors,[]);writeFileSync(new URL('structure-result.json',out),JSON.stringify({passed:true,nodes:board.spatial.nodes.length,edges:board.spatial.edges.length,codeRef:manifest.codeRef,checks:['source relationships','real UI buttons','simulated requests','shared node edit','four orthogonal faces','rotation','five workspace routes','320/390 mobile overflow','legacy drawings retained','idempotent import','metadata roundtrip'],errors},null,2));console.log('PASS structure: sources, preview, graph edits, 3D, routes, mobile');
}finally{if(browser)await browser.close();server.kill();}
