// Isolated relationship-map checks: actual button anchors, readable paths and evidence gaps.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {withStructure} from './structure-import.mjs';
import {traceGraph,coverage} from './trace-graph.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const board=withStructure(read('./study-spatial-seed.json'),read('./structure-snapshot.json')),graph=board.spatial;
const root='idea-detail-afeeef50ae447b05da',button='button-start-free';
const traced=traceGraph(graph,root);
assert(traced.has(button));assert(traced.has('mcp-start_study_session'));assert(traced.has('rpc-start_my_learning_session'));
assert(!traced.has('button-goal'),'do not expand every button in the result screen');
assert(!traced.has('button-start-plan'),'do not expand siblings through a shared ancestor');
assert(!traceGraph(graph,root,n=>n.introduced<'2026-10-18').has(button));
const missing={id:'test-missing-idea',title:'아직 관계를 기록하지 않은 기획',plane:'idea',kind:'idea',feature:'검증 전용',evidence:'draft',status:'기획',parentId:'',introduced:'',version:0,history:[]};graph.nodes.push(missing);
assert.equal(coverage([missing],[]).filter(c=>c.missing).length,3);
const cycle={nodes:[{id:'a',kind:'idea',plane:'idea'},{id:'b',kind:'tool',plane:'mcp'}],edges:[{id:'ab',from:'a',to:'b',relation:'calls'},{id:'ba',from:'b',to:'a',relation:'calls'}]};assert.equal(traceGraph(cycle,'a').size,4);
const out=new URL('./test-output/',import.meta.url),runtime=new URL('atlas-runtime-'+Date.now()+'/',out);mkdirSync(new URL('data/',runtime),{recursive:true});
for(const f of ['team-planning.js','planning-dates.js','lab-discussion.js','planning.css','profiles.js','profile-editor.js','profiles.css','companion.js','virtual-room.js','virtual-room.css','meetings.js','meetings.css','meeting-call.js','meeting-storage.js','server.mjs','board-ops.js','spatial-ops.js','transport.js','app.js','index.html','styles.css','collab.css','spatial.html','spatial-view.js','trace-graph.js','structure.css','plane-content.js','product-ui-preview.html','product-preview-bridge.js'])copyFileSync(new URL(f,import.meta.url),new URL(f,runtime));
writeFileSync(new URL('data/board.json',runtime),JSON.stringify(board));
const port=42000+Math.floor(Math.random()*10000),host='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(runtime),env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
const {chromium}=createRequire(import.meta.url)('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(host+'/api/state')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:process.env.ATLAS_BROWSER||'chrome',headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('workboard-collab-name','지도 검증'));await page.goto(host+'/#spatial');const frame=page.frameLocator('#spatial-frame');await frame.locator('.preview-anchor').waitFor({state:'attached'});
 assert.equal(await frame.locator('[data-trace-root]').inputValue(),root);assert.equal(await frame.locator('.face-ports').count(),0);
 const preview=frame.frameLocator('.map-preview');await preview.getByRole('button',{name:'자유 학습 시작',exact:true}).click();
 await frame.locator('#inspector>h2').filter({hasText:'자유 학습 시작'}).waitFor();assert.equal(await frame.locator('#edit-form [name=title]').inputValue(),'자유 학습 시작');assert.equal(await frame.locator('[data-trace-root]').inputValue(),root,'inspection preserves selected planning path');
 assert.equal(await preview.getByRole('button',{name:'목표 변경',exact:true}).count(),0,'inspection must not execute the action');
 const buttonRect=await preview.getByRole('button',{name:'자유 학습 시작',exact:true}).evaluate(el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};});
 const anchorRect=await frame.locator('.preview-anchor').evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:parseFloat(el.style.width),h:parseFloat(el.style.height)}));
 for(const k of ['x','y','w','h'])assert(Math.abs(buttonRect[k]-anchorRect[k])<1,'button geometry '+k);
 const edge=frame.locator('.spatial-relation[data-from="button-start-free"][data-to="mcp-start_study_session"]');await edge.waitFor();
 async function checkEndpoint(){return frame.locator('#scene').evaluate(el=>{const anchor=el.querySelector('[data-anchor="button-start-free"]'),r=anchor.getBoundingClientRect(),s=el.getBoundingClientRect(),p=el.querySelector('.spatial-relation[data-from="button-start-free"][data-to="mcp-start_study_session"] .spatial-link').getPointAtLength(0);return Math.hypot(p.x-(r.right-s.left),p.y-(r.y+r.height/2-s.top));});}
 assert(await checkEndpoint()<1);await frame.locator('#zoom-in').click();await page.waitForTimeout(150);assert(await checkEndpoint()<1,'zoom keeps line on actual button');await frame.locator('#read-size').click();
 await edge.focus();await page.keyboard.press('Enter');await frame.locator('#inspector>h2').filter({hasText:'버튼의 도구 호출'}).waitFor();assert.equal(await frame.locator('#edit-form [name=title]').inputValue(),'버튼의 도구 호출');assert.equal(await frame.locator('[data-trace-root]').inputValue(),root);
 assert.equal(await frame.locator('.spatial-relation.draft').count()>0,true);assert.match(await frame.locator('.face[data-plane=backend]').innerText(),/src\/pilot\/service.ts/);
 await frame.locator('.face[data-plane=backend] [data-anchor="fn-496098fdc192e78e2a"]').click();await frame.locator('#inspector>h2').filter({hasText:'PilotService.startSession()'}).waitFor();assert.equal(await frame.locator('[data-trace-root]').inputValue(),root,'crossing lines do not intercept function-card clicks');
 await frame.locator('[data-show-screen="learning_active"]').click();await frame.frameLocator('.map-preview').getByRole('button',{name:'목표 변경',exact:true}).waitFor();await frame.locator('[data-show-screen="free_study"]').first().click();await frame.locator('.preview-anchor').waitFor({state:'attached'});
 await frame.locator('[data-trace-root]').selectOption('test-missing-idea');await frame.locator('.map-gap').first().waitFor();assert.equal(await frame.locator('.map-gap').count(),3);assert.equal(await frame.locator('.spatial-relation').count(),0);assert.match(await frame.locator('.trace-summary').innerText(),/연결 미기록/);
 await frame.locator('[data-trace-root]').selectOption(root);await frame.locator('.preview-anchor').waitFor({state:'attached'});await frame.locator('#view-flat').click();await page.waitForTimeout(100);assert.equal(await frame.locator('.face:visible').count(),4);await frame.locator('#view-3d').click();
 await frame.locator('#fit').click();await page.waitForTimeout(150);assert(await frame.locator('#scene').evaluate(el=>{const r=el.getBoundingClientRect();return [...el.querySelectorAll('.face')].every(f=>{const b=f.getBoundingClientRect();return b.left>=r.left-2&&b.right<=r.right+2&&b.top>=r.top-2&&b.bottom<=r.bottom+2;});}),'fit reveals all four surfaces');await frame.locator('#read-size').click();
 for(const width of [905,640,390,320]){await page.setViewportSize({width,height:900});await page.waitForTimeout(150);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width<=390){assert(await frame.locator('.map-node strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=13);assert(await frame.locator('.world').evaluate(el=>!el.style.transform.includes('scale(0.')));}}
 await page.setViewportSize({width:1600,height:1100});await frame.locator('#fit').click();await frame.locator('body').evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('atlas-desktop.png',out)),fullPage:false});
 // Standalone full map for a shareable, uncropped evidence image.
 await page.goto(host+'/spatial.html');await page.locator('.preview-anchor').waitFor({state:'attached'});await page.locator('#stage').screenshot({path:fileURLToPath(new URL('atlas-map.png',out))});
 assert.deepEqual(errors,[]);writeFileSync(new URL('atlas-result.json',out),JSON.stringify({passed:true,browser:process.env.ATLAS_BROWSER||'chrome',checks:['directed trace without sibling fanout','cycle protection','date filtering','real button geometry','no header ports','selection preserves planning context','inspection does not execute UI','arrow endpoints after zoom','keyboard relation inspection','source file containers','screen transitions','honest missing-link state','four visible surfaces','readable mobile without overflow'],errors},null,2));console.log('PASS implementation atlas: actual button anchors, relationships, evidence gaps, mobile');
}finally{await browser?.close();server.kill();}
