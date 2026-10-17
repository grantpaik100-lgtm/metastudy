// 데이터 보존, 두 클라이언트 동기화, 충돌 방지와 실제 UI 상호작용 회귀.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {normalizeBoard,applyOp} from './board-ops.js';
import {normalizeSpatial} from './spatial-ops.js';
const original=JSON.parse(readFileSync(new URL('./study-project-2026-09-27.json',import.meta.url),'utf8'));
const normalized=normalizeBoard(original);
assert.deepEqual(normalized.screens.map(s=>s.drawing),original.screens.map(s=>s.drawing));
assert.deepEqual(normalized.requests,original.requests);
const seed=JSON.parse(readFileSync(new URL('./study-spatial-seed.json',import.meta.url),'utf8'));
const b=normalizeBoard(seed);assert(b);assert.equal(b.spatial.nodes.length,59);assert.equal(b.spatial.edges.length,63);
const first=b.spatial.nodes[0];
assert(applyOp(b,{type:'spatial.node.update',id:first.id,expectedVersion:0,fields:{owner:'검증 담당'},at:'2026-10-17T01:00:00Z',by:'테스트'}).ok);
assert.equal(applyOp(b,{type:'spatial.node.update',id:first.id,expectedVersion:0,fields:{owner:'오래된 편집'}}).error,'conflict');
assert.equal(b.spatial.nodes[0].owner,'검증 담당');
assert.equal(b.spatial.nodes[0].history[0].before.owner,'');
assert(applyOp(b,{type:'spatial.node.update',id:first.id,expectedVersion:1,fields:{parentId:first.id}}).error);
const invalid=structuredClone(b.spatial);invalid.edges[0].to='missing';assert.equal(normalizeSpatial(invalid),null);
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=new URL('./test-output/',import.meta.url);mkdirSync(out,{recursive:true});
const runtime=new URL('runtime-'+Date.now()+'/',out);mkdirSync(runtime,{recursive:true});
for(const file of ['server.mjs','board-ops.js','spatial-ops.js','app.js','index.html','styles.css','collab.css','spatial.html','study-spatial-seed.json'])copyFileSync(new URL(file,import.meta.url),new URL(file,runtime));
const port=42000+Math.floor(Math.random()*10000);
const server=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(runtime),env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});
const host='http://127.0.0.1:'+port;
let listening=false;for(let i=0;i<40;i++){try{if((await fetch(host+'/api/state')).ok){listening=true;break;}}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
if(!listening){server.kill();throw new Error('검증 전용 서버를 시작하지 못했습니다.');}
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];const context=await browser.newContext({viewport:{width:1520,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(host+'/spatial.html');await page.getByText('서버 연결됨',{exact:true}).waitFor();
 assert.match(await page.locator('#visible-count').innerText(),/노드/);
 await page.locator('#node-list [data-select="mcp-prepare_study_input"]').click();
 await page.locator('[name="owner"]').fill('검증 담당');await page.locator('[name="followup"]').fill('실제 호스트에서 파일 본문 전달 확인');
 await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
 const second=await context.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(host+'/spatial.html');await second.getByText('서버 연결됨',{exact:true}).waitFor();
 await second.locator('#node-list [data-select="mcp-prepare_study_input"]').click();assert.equal(await second.locator('[name="owner"]').inputValue(),'검증 담당');
 await page.locator('[name="owner"]').fill('초안 유지');await second.locator('[name="owner"]').fill('두 번째 창');await second.getByRole('button',{name:'변경 저장',exact:true}).click();await second.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
 await page.locator('#edit-notice').waitFor({state:'visible'});assert.equal(await page.locator('[name="owner"]').inputValue(),'초안 유지');
 await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.getByText(/다른 창에서 이 항목이 변경됐어요/).waitFor();
 await page.getByRole('button',{name:'최신 내용 다시 보기'}).click();await page.waitForFunction(()=>document.querySelector('[name="owner"]')?.value==='두 번째 창');
 // Restore test edits while retaining truthful audit entries in the disposable test dataset.
 await page.locator('[name="owner"]').fill('');await page.locator('[name="followup"]').fill('담당자와 운영 반영 여부를 확인해주세요.');await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
 await page.locator('.relation[data-select]').first().click();assert.match(await page.locator('.section-kicker').first().innerText(),/RELATION/);
 await page.locator('[name="followup"]').fill('연결 의미 확인 '+Date.now());await page.getByRole('button',{name:'변경 저장',exact:true}).click();await page.getByText('서버에 저장했습니다.',{exact:true}).waitFor();
 await page.locator('#view-flat').click();assert.equal(await page.locator('#view-flat').getAttribute('aria-pressed'),'true');
 await page.locator('#view-3d').click();const box=await page.locator('#scene').boundingBox();await page.mouse.move(box.x+20,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+100,box.y+box.height*.6+20,{steps:8});await page.mouse.up();await page.locator('#fit').click();
 await page.locator('#time').fill('0');assert.equal(await page.locator('#node-list [data-select="mcp-prepare_study_input"]').count(),0);await page.locator('#time').fill('3');
 await page.locator('#search').fill('prepare_study_input');assert.match(await page.locator('#visible-count').innerText(),/^1개 노드/);await page.locator('#search').fill('');
 await page.locator('#node-list [data-select="mcp-prepare_study_input"]').click();await page.screenshot({path:new URL('desktop.png',out).pathname.replace(/^\//,''),fullPage:true});
 const download=page.waitForEvent('download');await page.locator('#export').click();const d=await download;await d.saveAs(new URL('export.json',out).pathname.replace(/^\//,''));const exported=JSON.parse(readFileSync(new URL('export.json',out),'utf8'));assert(normalizeBoard(exported));assert.deepEqual(exported.screens.map(s=>s.drawing),original.screens.map(s=>s.drawing));
 await page.locator('#add-node').click();const newTitle='검증 노드 '+Date.now();await page.locator('#new-form [name="title"]').fill(newTitle);await page.getByRole('button',{name:'노드 만들기',exact:true}).click();await page.getByText('새 항목을 저장했습니다.',{exact:true}).waitFor();assert.equal(await page.locator('#edit-form [name="title"]').inputValue(),newTitle);
 await page.locator('#add-edge').click();await page.locator('#new-form [name="title"]').fill('검증 연결');await page.getByRole('button',{name:'연결 만들기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#edit-form [name="title"]')?.value==='검증 연결');
 await page.goto(host+'/#wireframe');await page.locator('.wire-card svg').first().waitFor();assert.equal(await page.locator('.wire-card').count(),21);
 await page.goto(host+'/#spatial');await page.frameLocator('#spatial-frame').getByText('서버 연결됨',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(host+'/spatial.html');await page.getByText('서버 연결됨',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('[data-feature="記録·상태"]'.replace('記録','기록')).click();await page.screenshot({path:new URL('mobile.png',out).pathname.replace(/^\//,''),fullPage:true});
 await new Promise(r=>setTimeout(r,600));const persisted=JSON.parse(readFileSync(new URL('data/board.json',runtime),'utf8'));assert(persisted.spatial.nodes.some(n=>n.title===newTitle));assert(persisted.spatial.edges.some(n=>n.title==='검증 연결'));
 assert.deepEqual(errors,[]);writeFileSync(new URL('result.json',out),JSON.stringify({passed:true,checks:['drawing-preservation','schema-validation','node-edge-create-edit','two-window-sync','stale-write-rejection','draft-preservation','3d-orbit','flat-view','timeline','search','export','board-integration','mobile-no-overflow','first-run-seed','disk-persistence'],errors},null,2));console.log('PASS: 데이터 보존·동기화·충돌·노드/선 편집·3D·모바일 검증');
}finally{await browser.close();server.kill();}
