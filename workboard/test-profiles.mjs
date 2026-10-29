// Isolated members and board: real profile persistence and WebRTC room integration.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createStore} from './cloud/store.mjs';
import {createHandler} from './cloud/handler.mjs';
import {passwordHash} from './cloud/auth.mjs';
import {createMeetings} from './cloud/meetings.mjs';
import {assets,mime} from './cloud/assets.mjs';
process.loadEnvFile(new URL('.env.local',import.meta.url));
const tag=randomBytes(4).toString('hex'),boardId='profile-test-'+tag,checks=[],errors=[],out=new URL('test-output/',import.meta.url);await mkdir(out,{recursive:true});
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId}),service=createMeetings(store);
const users=['프로필검증','화면검증','좌석검증'].map(username=>({id:randomUUID(),username:username+'-'+tag,password:randomBytes(22).toString('base64url')}));
const csp=JSON.parse(await readFile(new URL('vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
let handler,browser;const pages=[];
const server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/')||path.startsWith('/oauth/')||path==='/mcp')return handler(req,res);const file=path==='/'?'index.html':path.slice(1);if(!assets.includes(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime(file),'Content-Security-Policy':csp});res.end(await readFile(new URL(file,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;handler=createHandler({store,origin});
const json=async(page,path,body)=>page.evaluate(async({path,body})=>{const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};},{path,body});
try{
 await store.insert('boards',{id:boardId,board:JSON.parse(await readFile(new URL('study-spatial-seed.json',import.meta.url),'utf8'))});
 for(const u of users)await store.insert('members',{id:u.id,username:u.username,password_hash:await passwordHash(u.password),password_changed:true});
 assert.equal((await fetch(origin+'/api/profiles')).status,401);assert.equal((await fetch(origin+'/api/profiles/image?user='+users[0].id+'&kind=photo')).status,401);
 const {chromium}=createRequire(import.meta.url)('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+fileURLToPath(new URL('audio-fixtures/korean-0.wav',out)),'--auto-select-desktop-capture-source=Entire screen','--enable-usermedia-screen-capturing','--autoplay-policy=no-user-gesture-required']});
 for(let i=0;i<3;i++){
  const context=await browser.newContext({viewport:{width:1440,height:1050},permissions:['microphone','camera']}),page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/login.html?next=%2Faccount.html');await page.locator('[name=username]').fill(users[i].username);await page.locator('[name=password]').fill(users[i].password);await page.getByRole('button',{name:'작업판 들어가기'}).click();await page.locator('#profile-section').waitFor();
  const png=await page.evaluate(i=>{const c=document.createElement('canvas');c.width=512;c.height=512;const x=c.getContext('2d'),colors=['#b9a0de','#e6b18d','#93b9ad'];x.fillStyle=colors[i];x.beginPath();x.ellipse(256,326,140,140,0,0,7);x.fill();x.beginPath();x.ellipse(256,208,155,133,0,0,7);x.fill();for(const [a,rot] of [[154,-.3],[354,.3]]){x.beginPath();x.ellipse(a,104,42,91,rot,0,7);x.fill();}x.fillStyle='#fff6ec';x.beginPath();x.ellipse(256,350,90,80,0,0,7);x.fill();x.fillStyle='#58445a';for(const a of [205,307]){x.beginPath();x.ellipse(a,199,10,17,0,0,7);x.fill();}x.lineWidth=6;x.strokeStyle='#58445a';x.beginPath();x.arc(256,223,20,.2,2.94);x.stroke();x.fillStyle='#f2c0c3';for(const a of [168,344]){x.beginPath();x.ellipse(a,230,21,13,0,0,7);x.fill();}return c.toDataURL('image/png').split(',')[1];},i);
  const image={name:'my-character.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};await page.locator('#display-name').fill(['보라 토끼','살구 토끼','민트 토끼'][i]);
  await page.locator('#photo-file').setInputFiles(image);await page.locator('#save-profile').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#save-profile').disabled);await page.locator('#character-file').setInputFiles(image);await page.waitForFunction(()=>!document.querySelector('#save-profile').disabled);await page.locator('#save-profile').click();await page.getByText('저장했어요. 작업판과 회의실에 반영됩니다.',{exact:true}).waitFor();
  await page.reload();await page.locator('#character-preview').waitFor();assert.equal(await page.locator('#display-name').inputValue(),['보라 토끼','살구 토끼','민트 토끼'][i]);assert.equal(await page.locator('#login-name').textContent(),users[i].username);
 }
 const [a,b,c]=pages,profiles=(await json(a,'/api/profiles')).data.profiles,own=profiles.find(p=>p.userId===users[0].id);
 const invalid={displayName:'새 이름',companionEnabled:true,expectedVersion:own.version};
 assert.equal((await json(a,'/api/profiles',{...invalid,userId:users[1].id})).status,400);
 assert.equal((await json(a,'/api/profiles',{...invalid,characterData:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 assert.equal((await json(a,'/api/profiles',{...invalid,expectedVersion:0})).status,409);
 assert.equal((await json(a,'/api/profiles',{...invalid,expectedVersion:99})).status,409);
 assert.equal(await a.evaluate(async id=>(await fetch('/api/profiles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:'x',companionEnabled:true,expectedVersion:1,user_id:id})})).status,users[1].id),400);
 const stored=await store.first('profiles',{board_id:`eq.${boardId}`,user_id:`eq.${users[0].id}`});assert.equal(stored.display_name,'보라 토끼');assert(stored.character_data.startsWith('data:image/webp;'));
 checks.push('이미지 크기 조정·이름/사진/캐릭터 저장·로그인 ID 보존·익명 차단·다른 계정 수정 거절·SVG 거절·동시 수정 충돌');
 await a.screenshot({path:fileURLToPath(new URL('profile-settings.png',out)),fullPage:true});
 for(const p of pages){await p.goto(origin+'/#chat');await p.locator('#chat-text').waitFor();await p.locator('.companion-body').waitFor();}
 await a.locator('.companion-drag').focus();const before=await a.locator('.companion-body').boundingBox();assert(before.x>700&&before.y>500,'Default companion must be near bottom right');await a.keyboard.press('ArrowLeft');const after=await a.locator('.companion-body').boundingBox();assert(after.x<before.x);
 const dragBox=await a.locator('.companion-drag').boundingBox();await a.mouse.move(dragBox.x+40,dragBox.y+40);await a.mouse.down();await a.mouse.move(dragBox.x-120,dragBox.y-30,{steps:8});await a.mouse.up();const afterDrag=await a.locator('.companion-body').boundingBox();assert(afterDrag.x<after.x-100);await a.locator('.companion-drag').click();await a.locator('.companion-hide').click();await a.locator('.companion-restore').waitFor();await a.reload();await a.locator('.companion-restore').waitFor();await a.locator('.companion-restore').click();const restored=await a.locator('.companion-body').boundingBox();assert(Math.abs(restored.x-afterDrag.x)<2&&Math.abs(restored.y-afterDrag.y)<2,'Restore must keep the dragged position');
 await a.locator('#chat-text').fill('캐릭터와 함께하는 회의 검증');await a.locator('#chat-form [type=submit]').click();await b.getByText('캐릭터와 함께하는 회의 검증',{exact:true}).waitFor();assert.equal(await b.locator('.message-author strong').last().textContent(),'보라 토끼');assert.equal(await b.locator('.message-author img').count(),1);
 checks.push('캐릭터 이동·숨김·새로고침 복구·상대 채팅에서 표시 이름과 사진 확인');
 await a.goto(origin+'/#meetings');await a.locator('#meeting-title').fill('우리의 다음 아이디어');await a.locator('#new-meeting [type=submit]').click();await a.waitForURL(/#meetings\/[0-9a-f-]{36}$/);const roomId=a.url().split('/').at(-1);for(const p of [b,c])await p.goto(origin+'/#meetings/'+roomId);
 for(const p of pages){await p.locator('#join-call').click();await p.locator('#leave-call').waitFor();}
 for(const p of pages)await p.waitForFunction(()=>document.querySelectorAll('.room-seat[data-user-id]').length===3&&document.querySelector('#call-people').textContent.match(/연결됨/g)?.length===2,{},{timeout:60000});
 assert.equal(await b.locator('.seat-person.has-character img').count(),3);await a.locator('#mute-call').click();await b.waitForFunction(id=>document.querySelector(`[data-user-id="${id}"] small`)?.textContent==='마이크 꺼짐',users[0].id);await a.locator('#mute-call').click();
 await a.locator('#virtual-meeting-room').screenshot({path:fileURLToPath(new URL('virtual-room-closeup.png',out))});await a.screenshot({path:fileURLToPath(new URL('virtual-room-desktop.png',out)),fullPage:true});
 await a.locator('#share-call').click();await b.locator('#screen-stage video').waitFor();await b.waitForFunction(()=>document.querySelector('#screen-stage video')?.videoWidth>0);assert.equal(await b.locator('.room-wall #screen-stage video').count(),1);await b.locator('#room-screen-toggle').click();assert.equal(await b.locator('#room-screen-toggle').getAttribute('aria-expanded'),'true');await b.locator('#room-screen-toggle').click();
 await b.screenshot({path:fileURLToPath(new URL('virtual-room-sharing.png',out)),fullPage:true});await a.locator('#share-call').click();await b.locator('#screen-stage').waitFor({state:'hidden'});assert(await b.locator('#room-screen-toggle').isDisabled());checks.push('세 계정 실제 음성 연결·회의실 좌석/캐릭터·음소거 동기화·벽면 실제 공유 영상 수신·확대·공유 중지');
 await a.locator('#record-call').click();await b.locator('#recording-badge').waitFor();await new Promise(r=>setTimeout(r,4000));await a.locator('#record-call').click();await a.waitForFunction(()=>document.querySelector('#recordings .recording'),{},{timeout:45000});
 const detail=await service.detail(roomId);assert(detail.media.some(m=>m.size>1000));checks.push('가상 회의실에서 기존 음성 녹음 저장 유지');
 for(const p of pages)await p.locator('#leave-call').click();await a.waitForFunction(()=>document.querySelectorAll('.room-seat.empty').length===3);
 // Hold a heartbeat between its read and write, then leave: exercise the DB condition itself.
 const raceId=randomUUID();await service.call(users[0],{action:'join',roomId,peerId:raceId});let release,entered;const gate=new Promise(r=>release=r),atWrite=new Promise(r=>entered=r);
 const delayed=createMeetings({...store,patch:async(table,query,body)=>{if(table==='call_peers'&&body.seen_at!=='1970-01-01T00:00:00.000Z'){entered();await gate;}return store.patch(table,query,body);}});
 const late=delayed.call(users[0],{action:'poll',roomId,peerId:raceId}).catch(e=>e);await atWrite;await service.call(users[0],{action:'leave',roomId,peerId:raceId});release();assert.equal((await late).status,409);assert.equal((await store.first('call_peers',{id:'eq.'+raceId})).seen_at,'1970-01-01T00:00:00+00:00');
 const ignored=await a.evaluate(async()=>{const {MeetingCall}=await import('/meeting-call.js');let deliver,consumed=0;const call=new MeetingCall(async(_,b)=>b.action==='poll'?new Promise(r=>deliver=r):{});call.active=true;call.id='old';call.room={id:'room'};call.consume=async()=>{consumed++;};const polling=call.poll();await call.stop();call.id='new';call.active=true;deliver({});await polling;call.active=false;clearTimeout(call.timer);return consumed;});assert.equal(ignored,0);checks.push('퇴장과 겹친 서버 heartbeat·이전 통화 응답이 새 좌석을 되살리지 않음');
 await a.locator('#join-call').click();await a.locator('#leave-call').waitFor();await a.waitForFunction(()=>document.querySelectorAll('.room-seat[data-user-id]').length===1);await a.locator('#leave-call').click();await a.waitForFunction(()=>document.querySelectorAll('.room-seat.empty').length===3);checks.push('퇴장 후 재입장·좌석 복구');
 for(const width of [905,640,390,320]){await a.setViewportSize({width,height:900});await a.goto(origin+'/#meetings/'+roomId);await a.locator('.virtual-room').waitFor();await a.locator('#room-title').filter({hasText:'우리의 다음 아이디어'}).waitFor();assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'meeting overflow '+width);await a.goto(origin+'/account.html');await a.locator('#profile-section').waitFor();assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'profile overflow '+width);}
 await a.goto(origin+'/#meetings/'+roomId);await a.locator('.virtual-room').waitFor();await a.locator('#room-title').filter({hasText:'우리의 다음 아이디어'}).waitFor();await a.screenshot({path:fileURLToPath(new URL('virtual-room-mobile.png',out)),fullPage:true});await a.emulateMedia({reducedMotion:'reduce'});assert.equal(await a.locator('.companion-drag img').evaluate(el=>getComputedStyle(el).animationName),'none');
 await a.goto(origin+'/account.html');await a.locator('#profile-section').waitFor();await a.locator('#remove-character').click();await a.locator('#save-profile').click();await a.getByText('저장했어요. 작업판과 회의실에 반영됩니다.',{exact:true}).waitFor();await a.goto(origin+'/#chat');await a.locator('.companion-setup').waitFor();assert.equal(await a.locator('.companion-body').isVisible(),false);
 checks.push('퇴장 좌석 초기화·320~1440px 모바일·움직임 줄이기·캐릭터 삭제 반영');
 assert.deepEqual(errors,[]);await writeFile(new URL('profiles-result.json',out),JSON.stringify({passed:true,browser:process.env.TEST_BROWSER||'chrome',checks,errors},null,2));console.log('PASS profiles: '+checks.join(' / '));
}catch(e){await writeFile(new URL('profiles-result.json',out),JSON.stringify({passed:false,checks,error:e.stack,errors},null,2));for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:fileURLToPath(new URL(`profiles-failure-${i}.png`,out)),fullPage:true}).catch(()=>{});console.error(e.stack);process.exitCode=1;}
finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 const media=await store.rows('media',{board_id:`eq.${boardId}`,select:'object_path'}).catch(()=>[]);if(media.length)await fetch(process.env.SUPABASE_URL+'/storage/v1/object/workboard-meetings',{method:'DELETE',headers:{Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY,apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({prefixes:media.map(m=>m.object_path)})});
 for(const table of ['media','chat','rooms','profiles','presence'])await store.remove(table,{board_id:`eq.${boardId}`});
 for(const u of users){await store.remove('sessions',{user_id:`eq.${u.id}`});await store.remove('members',{id:`eq.${u.id}`});}
 await store.remove('boards',{id:`eq.${boardId}`});
}
