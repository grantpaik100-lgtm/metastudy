// Real browser/database integration, with isolated accounts/board and public Korean audio.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createStore} from './cloud/store.mjs';
import {createHandler} from './cloud/handler.mjs';
import {passwordHash,createAuth} from './cloud/auth.mjs';
import {createMeetings} from './cloud/meetings.mjs';
import {assets,mime} from './cloud/assets.mjs';
process.loadEnvFile(new URL('.env.local',import.meta.url));
const tag=randomBytes(4).toString('hex'),boardId='meeting-test-'+tag,checks=[],errors=[],speech=[];
const out=new URL('test-output/',import.meta.url);await mkdir(out,{recursive:true});
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId});
const service=createMeetings(store),users=['회의검증','상대검증','세번째검증'].map(n=>({id:randomUUID(),username:n+'-'+tag,password:randomBytes(22).toString('base64url')}));
const seed=JSON.parse(await readFile(new URL('study-spatial-seed.json',import.meta.url),'utf8'));
const fixtures=JSON.parse(await readFile(new URL('audio-fixtures/manifest.json',out),'utf8'));
const csp=JSON.parse(await readFile(new URL('vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
let handler,browser;const pages=[];
const server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/')||path.startsWith('/oauth/')||path==='/mcp')return handler(req,res);const file=path==='/'?'index.html':path.slice(1);if(!assets.includes(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime(file),'Content-Security-Policy':csp});res.end(await readFile(new URL(file,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
handler=createHandler({store,origin,env:{...process.env,CRON_SECRET:'fixture-cron-secret'}});
const auth=createAuth(store,origin);const cookies=[];
async function req(action,{body,user=0,method}={}){const r=await fetch(origin+'/api/meetings/'+action,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json',Origin:origin}:{}),Cookie:cookies[user]||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
const rpc=async(token,name,args={})=>{const r=await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return r.json();};
async function until(fn,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,400));}throw new Error('Condition timed out');}
function cer(reference,hypothesis){const norm=t=>[...t.normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'')],a=norm(reference),b=norm(hypothesis);let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]!==b[j-1]));row=next;}return {edits:row[b.length],characters:a.length,rate:row[b.length]/a.length};}
try{
 await store.insert('boards',{id:boardId,board:seed});for(const u of users)await store.insert('members',{id:u.id,username:u.username,password_hash:await passwordHash(u.password),password_changed:true});
 assert.equal((await req('list')).status,401);assert.equal((await req('maintenance')).status,401);
 for(const u of users){const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:u.username,password:u.password})});assert.equal(r.status,200);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
 const foreign=await fetch(origin+'/api/meetings/create',{method:'POST',headers:{Origin:'https://evil.example',Cookie:cookies[0],'Content-Type':'application/json'},body:'{}'});assert.equal(foreign.status,403);checks.push('로그인·출처 검사·예약 작업 인증');
 const require=createRequire(import.meta.url),{chromium}=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+fileURLToPath(new URL('audio-fixtures/korean-0.wav',out)),'--auto-select-desktop-capture-source=Entire screen','--enable-usermedia-screen-capturing','--autoplay-policy=no-user-gesture-required']});
 for(let i=0;i<3;i++){const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['microphone','camera']});const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('browser:',m.text().slice(0,300));});await page.goto(origin+'/login.html?next=%2F%23chat');await page.locator('[name=username]').fill(users[i].username);await page.locator('[name=password]').fill(users[i].password);await page.getByRole('button',{name:'작업판 들어가기'}).click();await page.locator('#chat-text').waitFor();}
 const [a,b,c]=pages;
 await a.locator('#chat-text').fill('회의 기능 검증: 녹음 보관은 30일, 삭제 전에 알림.');await a.locator('#chat-form [type=submit]').click();await b.getByText('회의 기능 검증: 녹음 보관은 30일, 삭제 전에 알림.',{exact:true}).waitFor();
 await b.locator('[data-reply]').first().click();await b.locator('#chat-text').fill('확인했어요. #spatial/button-start-free');await b.locator('#chat-form [type=submit]').click();await c.getByText('확인했어요.',{exact:false}).waitFor();
 await a.locator('#chat-file').setInputFiles({name:'회의-자료.txt',mimeType:'text/plain',buffer:Buffer.from('회의 자료 검증')});await a.locator('#chat-attachments').getByText('회의-자료.txt').waitFor();await a.locator('#chat-form [type=submit]').click();await b.getByRole('button',{name:/회의-자료.txt/}).waitFor();
 await b.reload();await b.getByRole('button',{name:/회의-자료.txt/}).waitFor();assert.equal(await b.locator('blockquote').count(),1);checks.push('세 테스트 계정의 채팅·답글·파일 저장·새로고침 후 복구');
 await a.getByRole('link',{name:/음성회의/}).click();await a.locator('#meeting-title').fill('음성·화면공유 실험');await a.locator('#new-meeting [type=submit]').click();await a.waitForURL(/#meetings\/[0-9a-f-]{36}$/);const callRoom=a.url().split('/').at(-1);
 for(const p of [b,c])await p.goto(origin+'/#meetings/'+callRoom);
 for(const p of pages){await p.locator('#join-call').click();await p.locator('#leave-call').waitFor();}
 for(const p of pages)await p.waitForFunction(()=>document.querySelectorAll('#call-people .call-person').length===3&&document.querySelector('#call-people').textContent.match(/연결됨/g)?.length===2,{},{timeout:60000});
 checks.push('세 브라우저 실제 WebRTC 음성 연결 (로컬 네트워크)');
 await a.locator('#mute-call').click();assert.equal(await a.locator('#mute-call').getAttribute('aria-pressed'),'true');await a.locator('#mute-call').click();
 await a.locator('#share-call').click();await a.locator('#screen-stage video').waitFor();await b.locator('#screen-stage video').waitFor();await b.waitForFunction(()=>document.querySelector('#screen-stage video')?.videoWidth>0);await a.screenshot({path:fileURLToPath(new URL('meetings-call.png',out)),fullPage:true});await a.locator('#share-call').click();await b.locator('#screen-stage').waitFor({state:'hidden'});checks.push('화면 캡처·상대 브라우저 영상 수신·공유 중지');
 await a.locator('#record-call').click();for(const p of pages)await p.locator('#recording-badge').waitFor();
 await a.getByRole('link',{name:/기획·아이디어/}).click();await a.locator('#active-meeting').waitFor();await a.locator('#active-meeting').click();
 await new Promise(r=>setTimeout(r,14000));await a.locator('#record-call').click();for(const p of pages)await p.locator('#recording-badge').waitFor({state:'hidden'});
 const clips=await until(async()=>{const data=await service.detail(callRoom);return data.media.filter(m=>m.kind==='audio').length>=3?data.media:false;},45000);
 for(const clip of clips)assert(clip.size>1000);
 const signed=await service.download(clips[0].id);const rms=await a.evaluate(async url=>{const {pcm16}=await import('/meeting-storage.js');const samples=await pcm16(await(await fetch(url)).blob());return Math.sqrt(samples.reduce((s,n)=>s+n*n,0)/samples.length);},signed.url);assert(rms>.001,'Recorded audio must contain the injected speech, not only silence');
 await a.locator('[data-play]').first().click();await a.locator('.clip-player audio').waitFor();await a.waitForFunction(()=>document.querySelector('.clip-player audio')?.duration>1);checks.push('녹음 표시·다른 작업공간 이동 중 통화 유지·참여자별 음성 저장·실제 음성 에너지·재생');
 for(const p of pages){await p.locator('#leave-call').click();}assert.equal((await service.detail(callRoom)).participants.length,3);
 // Known Korean samples run through the shipped browser worker, with the production CSP.
 await a.locator('#meeting-title').fill('한국어 기준 음성 변환 실험');await a.locator('#new-meeting [type=submit]').click();await a.waitForURL(url=>url.hash.startsWith('#meetings/')&&!url.hash.endsWith(callRoom));const speechRoom=a.url().split('/').at(-1);
 for(const fixture of fixtures.samples){await a.locator('#audio-import').setInputFiles(fileURLToPath(new URL('audio-fixtures/'+fixture.file,out)));await until(async()=>{const d=await service.detail(speechRoom);return d.media.length>=fixtures.samples.indexOf(fixture)+1;},45000);}
 await a.reload();await a.locator('#recordings .recording').first().waitFor();const start=Date.now();await a.locator('#transcribe').click();
 const progressTimer=setInterval(async()=>{console.log('speech:',await a.locator('#speech-progress').textContent().catch(()=>''));},20000);
 try{await a.waitForFunction(()=>document.querySelector('#speech-progress')?.textContent.includes('변환을 마쳤어요')||(!document.querySelector('#transcribe')?.disabled&&document.querySelector('#speech-progress')?.textContent.includes('실패')),{},{timeout:600000});}finally{clearInterval(progressTimer);}
 const transcribed=await service.detail(speechRoom);assert.equal(transcribed.media.filter(m=>m.transcript).length,3,await a.locator('#speech-progress').textContent());
 for(let i=0;i<fixtures.samples.length;i++){const f=fixtures.samples[i],m=transcribed.media[i],hypothesis=m.transcript.segments.map(s=>s.text).join(' ');speech.push({...f,hypothesis,cer:cer(f.reference,hypothesis)});assert(hypothesis.length>5);}
 console.log(JSON.stringify({speech,processingSeconds:(Date.now()-start)/1000}));await a.screenshot({path:fileURLToPath(new URL('meetings-transcript.png',out)),fullPage:true});checks.push('공개 한국어 음성 3개 실제 PC 변환·시간표시·원문 대비 문자 오류율 측정');
 const token=await auth.issue(users[0],'personal');const readOnly=await auth.issue(users[1],'personal',{scope:'workboard:read'});
 const detail=await rpc(token,'get_meeting',{roomId:speechRoom});assert.equal(detail.result.structuredContent.media.length,3);
 const summary={overview:'한국어 기준 음성 변환 검증',decisions:'자료는 설명문이며 팀의 확정 결정은 없음',openQuestions:'숫자와 고유명사 인식 정확도 확인',actions:'음성 원문과 비교 검토 · 담당자와 일정은 미정'};
 assert((await rpc(readOnly,'save_meeting_summary',{roomId:speechRoom,expectedVersion:0,summary})).result.isError);
 assert.equal((await rpc(token,'save_meeting_summary',{roomId:speechRoom,expectedVersion:0,summary})).result.structuredContent.ok,true);
 assert((await rpc(token,'save_meeting_summary',{roomId:speechRoom,expectedVersion:0,summary})).result.isError);await a.reload();await a.locator('#summary-form [name=overview]').waitFor();await a.waitForFunction(()=>document.querySelector('#summary-form [name=overview]')?.value==='한국어 기준 음성 변환 검증');checks.push('MCP 회의 원문 읽기·요약 저장·읽기 권한 제한·동시 수정 충돌·웹 반영');
 // Simulate elapsed retention time only for isolated fixture rows.
 const time=Date.now();await store.patch('media',{board_id:`eq.${boardId}`,room_id:`eq.${speechRoom}`},{expires_at:new Date(time+3*86400000-1000).toISOString()});await service.maintenance(time);
 let notices=await service.notices(users[0]);assert(notices.notices.some(n=>n.stage==='three-days'));await store.patch('meeting_notices',{board_id:`eq.${boardId}`},{created_at:new Date(time-2*86400000).toISOString()});await service.maintenance(time+2*86400000);notices=await service.notices(users[0]);assert(notices.notices.some(n=>n.stage==='one-day'));await service.maintenance(time+4*86400000);
 const expired=await service.detail(speechRoom);assert(expired.media.every(m=>m.deleted_at&&m.transcript));assert.equal(expired.room.summary.overview,summary.overview);assert.equal((await req('download?id='+expired.media[0].id)).status,410);
 await a.reload();await a.locator('#meeting-notification-button').click();await a.getByText(/원본 녹음이 .*삭제 예정이에요/).first().waitFor();await a.screenshot({path:fileURLToPath(new URL('meetings-notices.png',out)),fullPage:true});checks.push('삭제 3일 전·1일 전 알림·원본 삭제·회의록과 요약 보존');
 for(const width of [905,640,390,320]){await a.setViewportSize({width,height:900});await a.goto(origin+'/#chat');await a.locator('#chat-text').waitFor();assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow at '+width);await a.goto(origin+'/#meetings/'+speechRoom);await a.locator('#room-title').waitFor();assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'meeting overflow at '+width);}
 await a.screenshot({path:fileURLToPath(new URL('meetings-mobile.png',out)),fullPage:true});assert.deepEqual(errors,[]);checks.push('320~1440px 반응형·브라우저 런타임 오류 없음');
 await writeFile(new URL('meetings-result.json',out),JSON.stringify({passed:true,checks,speech,errors},null,2));console.log('PASS meetings: '+checks.join(' / '));
}catch(e){await writeFile(new URL('meetings-result.json',out),JSON.stringify({passed:false,checks,speech,error:e.stack,errors},null,2));for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:fileURLToPath(new URL(`meetings-failure-${i}.png`,out)),fullPage:true}).catch(()=>{});console.error(e.stack);process.exitCode=1;}
finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 const media=await store.rows('media',{board_id:`eq.${boardId}`,select:'object_path'}).catch(()=>[]);
 if(media.length)await fetch(process.env.SUPABASE_URL+'/storage/v1/object/workboard-meetings',{method:'DELETE',headers:{Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes:media.map(m=>m.object_path)})});
 await store.remove('media',{board_id:`eq.${boardId}`});await store.remove('chat',{board_id:`eq.${boardId}`});await store.remove('rooms',{board_id:`eq.${boardId}`});
 for(const u of users){await store.remove('presence',{user_id:`eq.${u.id}`});await store.remove('sessions',{user_id:`eq.${u.id}`});await store.remove('members',{id:`eq.${u.id}`});}
 await store.remove('boards',{id:`eq.${boardId}`});
}
