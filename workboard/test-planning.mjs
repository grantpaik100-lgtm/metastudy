// Real DB and browsers, isolated board/accounts; never modify the team's records.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createStore} from './cloud/store.mjs';
import {createHandler} from './cloud/handler.mjs';
import {createAuth,passwordHash} from './cloud/auth.mjs';
import {createPlanning} from './cloud/planning.mjs';
import {assets,mime} from './cloud/assets.mjs';
import {koreaToday,monthDays,moveMonth,onDate,dateLabel} from './planning-dates.js';
process.loadEnvFile(new URL('.env.local',import.meta.url));
const tag=randomBytes(5).toString('hex'),boardId='planning-test-'+tag,checks=[],errors=[],out=new URL('test-output/',import.meta.url);await mkdir(out,{recursive:true});
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId}),service=createPlanning(store);
const users=['일정검증','투표검증','익명검증'].map(username=>({id:randomUUID(),username:username+'-'+tag,password:randomBytes(22).toString('base64url')}));
const experimentId='experiment-'+tag,seed=JSON.parse(await readFile(new URL('study-spatial-seed.json',import.meta.url),'utf8'));seed.experiments=[{id:experimentId,title:'다음 학습 흐름 실험',question:'빠르게 시작할 수 있나요?',status:'진행 중',url:''}];
const csp=JSON.parse(await readFile(new URL('vercel.json',import.meta.url),'utf8')).headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
let handler,browser;const pages=[];
const server=http.createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path.startsWith('/api/')||path.startsWith('/oauth/')||path==='/mcp')return handler(req,res);const file=path==='/'?'index.html':path.slice(1);if(!assets.includes(file)){res.writeHead(404);return res.end();}res.writeHead(200,{'Content-Type':mime(file),'Content-Security-Policy':csp});res.end(await readFile(new URL(file,import.meta.url)));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;handler=createHandler({store,origin});
const json=async(page,path,body)=>page.evaluate(async({path,body})=>{const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};},{path,body});
const saved=(kind,title,extra={})=>({id:randomUUID(),expectedVersion:0,item:{kind,title,...extra}});
const rejectStatus=(status)=>e=>e.status===status;
try{
 assert.equal(koreaToday(new Date('2026-10-18T15:00:00Z')),'2026-10-19');assert(monthDays('2028-02').includes('2028-02-29'));assert(!monthDays('2027-02').includes('2027-02-29'));assert.equal(monthDays('2026-11')[0],'2026-11-01');assert.equal(moveMonth('2026-12',1),'2027-01');assert.equal(moveMonth('2027-01',-1),'2026-12');assert(onDate({start_date:'2026-10-19',due_date:'2026-10-21'},'2026-10-20'));assert.equal(dateLabel({start_date:'2026-10-19',start_time:'09:30'}),'2026-10-19 09:30');
 checks.push('Korean date boundary, leap year, month/year navigation and inclusive ranges');
 await store.insert('boards',{id:boardId,board:seed});for(const u of users)await store.insert('members',{id:u.id,username:u.username,password_hash:await passwordHash(u.password),password_changed:true});
 assert.equal((await fetch(origin+'/api/planning/items')).status,401);assert.equal((await fetch(origin+'/api/lab/discussion?experiment='+experimentId)).status,401);assert.equal((await fetch(origin+'/cloud/planning.sql')).status,404);
 const {chromium}=createRequire(import.meta.url)('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');browser=await chromium.launch({channel:process.env.TEST_BROWSER||'chrome',headless:true});
 for(const u of users){const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'America/Los_Angeles'}),p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/login.html?next=%2F%23todos');await p.locator('[name=username]').fill(u.username);await p.locator('[name=password]').fill(u.password);await p.getByRole('button',{name:'작업판 들어가기'}).click();await p.locator('#planning-space').waitFor();await p.getByRole('button',{name:'＋ Phase',exact:true}).waitFor();}
 const [a,b,c]=pages,today=koreaToday();
 const submit=async()=>{await a.locator('#plan-form [type=submit]').click();await a.locator('#plan-editor').waitFor({state:'hidden'});await a.getByText('저장했어요. 팀원의 할 일과 일정에도 반영됩니다.',{exact:true}).waitFor();};
 await a.getByRole('button',{name:'＋ Phase',exact:true}).click();await a.locator('#plan-form [name=title]').fill('첫 고객 검증');await submit();
 let items=(await json(a,'/api/planning/items')).data.items,phase=items.find(i=>i.kind==='phase');assert(phase);
 await a.locator(`[data-plan-id="${phase.id}"] [data-add-kind=goal]`).click();await a.locator('#plan-form [name=title]').fill('사용자 인터뷰');await submit();
 items=(await json(a,'/api/planning/items')).data.items;const goal=items.find(i=>i.kind==='goal');assert.equal(goal.parent_id,phase.id);
 await a.locator(`[data-plan-id="${goal.id}"] [data-add-kind=task]`).click();await a.locator('#plan-form [name=title]').fill('질문지 준비');await a.locator('#plan-form [name=owner_id]').selectOption(users[1].id);await a.locator('#plan-form [name=due_date]').fill(today);await a.locator('#plan-form [name=due_time]').fill('17:00');await submit();
 items=(await json(a,'/api/planning/items')).data.items;let task=items.find(i=>i.kind==='task');assert.equal(task.parent_id,goal.id);assert.equal(task.owner_id,users[1].id);await b.getByRole('button',{name:'질문지 준비',exact:true}).waitFor({timeout:20000});
 // Editor drafts survive background refresh, and stale saves cannot overwrite.
 await a.getByRole('button',{name:'질문지 준비',exact:true}).click();await a.locator('#plan-form [name=notes]').fill('내가 작성 중인 초안');
 const changed=await json(b,'/api/planning/save',{id:task.id,expectedVersion:task.version,item:{...task,notes:'다른 팀원의 변경'}});assert.equal(changed.status,200,JSON.stringify(changed.data));
 await a.waitForTimeout(7500);assert.equal(await a.locator('#plan-form [name=notes]').inputValue(),'내가 작성 중인 초안');await a.locator('#plan-form [type=submit]').click();await a.locator('#plan-edit-status').filter({hasText:'다른 사람이 먼저 수정'}).waitFor();assert(await a.locator('#plan-editor').isVisible());await a.locator('#plan-form [data-plan-close]').first().click();
 task=(await json(a,'/api/planning/items')).data.items.find(i=>i.id===task.id);assert.equal(task.notes,'다른 팀원의 변경');
 assert.equal((await json(a,'/api/planning/save',{id:phase.id,expectedVersion:phase.version,item:{...phase,archived:true}})).status,409);
 await assert.rejects(service.save(users[0],saved('task','잘못된 상위',{parent_id:phase.id})),rejectStatus(409));
 for(const extra of [{due_date:'2026-02-30'},{start_date:'2026-12-02',due_date:'2026-12-01'},{due_time:'29:90'},{url:'javascript:alert(1)'},{owner_id:randomUUID()}])await assert.rejects(service.save(users[0],saved('task','잘못된 값',extra)),rejectStatus(400));
 const otherStore={...store,boardId:'missing-board'};await assert.rejects(createPlanning(otherStore).save(users[0],{id:task.id,expectedVersion:task.version,item:task}),rejectStatus(409));
 const race=await Promise.allSettled([service.save(users[0],{id:task.id,expectedVersion:task.version,item:{...task,status:'doing'}}),service.save(users[1],{id:task.id,expectedVersion:task.version,item:{...task,status:'done'}})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
 checks.push('Real three-level hierarchy, owner, two-account sharing, preserved drafts, conflict protection and invalid input rejection');
 await a.locator('[data-plan-tab=startup]').click();await a.locator('#plan-add').click();await a.locator('#plan-form [name=title]').fill('팀이 등록한 창업 지원사업');await a.locator('#plan-form [name=event_type]').selectOption('지원사업');await a.locator('#plan-form [name=url]').fill('https://example.com/program');await a.locator('#plan-form [name=due_time]').fill('18:00');await submit();
 let event=(await json(a,'/api/planning/items')).data.items.find(i=>i.kind==='event');assert.equal(event.category,'startup');assert.equal(event.due_date,today);
 await a.locator('[data-plan-tab=calendar]').click();await a.locator(`[data-day="${today}"]`).click();await a.locator('.plan-agenda').getByRole('button',{name:'팀이 등록한 창업 지원사업',exact:true}).waitFor();await a.locator('#calendar-filter').selectOption('startup');assert.equal(await a.locator('.plan-agenda [data-plan-id]').count(),1);await a.locator('#calendar-filter').selectOption('all');
 await service.save(users[1],saved('event','출시 전 내부 마감',{category:'team',event_type:'내부 마감',due_date:today}));
 await a.locator('.plan-agenda').getByRole('button',{name:'출시 전 내부 마감',exact:true}).waitFor({timeout:20000});
 await a.screenshot({path:fileURLToPath(new URL('planning-calendar.png',out)),fullPage:true});
 await b.goto(origin+'/#todos/'+event.id);await b.locator('#plan-editor').waitFor();assert.equal(await b.locator('#plan-form [name=title]').inputValue(),event.title);await b.locator('#plan-form [data-plan-close]').first().click();
 await a.locator(`[data-plan-id="${event.id}"] [data-archive]`).click();await a.locator(`[data-plan-id="${event.id}"]`).waitFor({state:'hidden'});await a.locator('[data-plan-tab=archive]').click();await a.locator(`[data-plan-id="${event.id}"] [data-archive]`).click();await a.locator(`[data-plan-id="${event.id}"]`).waitFor({state:'hidden'});
 checks.push('Team deadlines and startup programs in one calendar, filters, shared item links, archive and restore');
 const auth=createAuth(store,origin),token=await auth.issue(users[0],'personal'),readOnly=await auth.issue(users[1],'personal',{scope:'workboard:read'});
 const rpc=async(token,name,args={})=>{const r=await fetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}})});return (await r.json()).result;};
 assert((await rpc(token,'get_team_planning')).structuredContent.items.some(i=>i.id===event.id));
 assert.equal((await rpc(readOnly,'save_team_plan_item',saved('task','권한 없는 변경'))).isError,true);
 const aiItem=(await rpc(token,'save_team_plan_item',saved('task','AI로 등록한 후속 작업'))).structuredContent.item;assert(aiItem);assert.equal((await service.history(aiItem.id)).changes[0].channel,'mcp');
 checks.push('MCP shared schedule read/write, read-only scope enforcement and AI edit history');
 for(const p of pages){await p.goto(origin+'/#lab');await p.locator(`[data-lab-discuss="${experimentId}"]`).click();await p.locator('#lab-title').filter({hasText:seed.experiments[0].title}).waitFor();}
 await a.locator('#new-poll-details summary').click();await a.locator('#new-poll-form [name=question]').fill('다음 주부터 실험할까요?');await a.locator('#new-poll-form [type=submit]').click();await a.locator('.lab-poll h4').filter({hasText:'다음 주부터 실험할까요?'}).waitFor();
 const poll=(await service.discussion(users[0],experimentId)).polls[0];assert(poll);await b.locator(`[data-vote="${poll.id}"]`).first().waitFor({timeout:15000});await c.locator(`[data-vote="${poll.id}"]`).first().waitFor({timeout:15000});
 for(const [p,choice] of [[a,0],[b,1],[c,0]]){await p.locator(`[data-vote="${poll.id}"][value="${choice}"]`).check();await p.locator('#lab-status').filter({hasText:'내 투표를 저장했어요.'}).waitFor();}
 let discussion=await service.discussion(users[0],experimentId);assert.deepEqual(discussion.polls[0].counts,[2,1,0]);assert.equal(discussion.polls[0].myChoice,0);assert(!JSON.stringify(discussion).includes(users[1].id));
 await service.vote(users[0],{pollId:poll.id,choice:2});await service.vote(users[0],{pollId:poll.id,choice:2});assert.equal((await service.discussion(users[0],experimentId)).polls[0].total,3);
 await b.locator(`[data-cancel-vote="${poll.id}"]`).click();await b.locator('#lab-status').filter({hasText:'내 투표를 취소했어요.'}).waitFor();assert.equal((await service.discussion(users[0],experimentId)).polls[0].total,2);
 await assert.rejects(service.closePoll(users[1],{pollId:poll.id,expectedVersion:poll.version}),rejectStatus(409));
 await a.locator(`[data-close-poll="${poll.id}"]`).click();await a.locator('#lab-status').filter({hasText:'투표를 마감했어요.'}).waitFor();await assert.rejects(service.vote(users[2],{pollId:poll.id,choice:1}),rejectStatus(409));await c.waitForFunction(id=>document.querySelector(`[data-vote="${id}"]`)?.matches(':disabled'),poll.id,{timeout:15000});
 const expired={id:randomUUID(),experimentId,question:'기한 검증',options:['진행','보류']};await service.createPoll(users[0],expired);await service.createPoll(users[0],expired);await store.patch('polls',{id:'eq.'+expired.id},{ends_at:'2026-01-01T00:00:00Z'});await assert.rejects(service.vote(users[0],{pollId:expired.id,choice:0}),rejectStatus(409));
 for(const options of [['하나'],['중복','중복'],Array(7).fill('선택')])await assert.rejects(service.createPoll(users[0],{...expired,id:randomUUID(),options}),rejectStatus(400));
 const concurrentPoll={id:randomUUID(),experimentId,question:'마감과 겹치는 투표',options:['진행','보류']};await service.createPoll(users[0],concurrentPoll);await Promise.allSettled([service.closePoll(users[0],{pollId:concurrentPoll.id,expectedVersion:1}),service.vote(users[1],{pollId:concurrentPoll.id,choice:1})]);await assert.rejects(service.vote(users[1],{pollId:concurrentPoll.id,choice:0}),rejectStatus(409));
 checks.push('Three-account vote totals, change/cancel, one vote per account, creator close, expired vote rejection, concurrent close protection');
 const note='설명이 더 있으면 좋겠어요. <img src=x onerror="window.injected=true">';await b.locator('#anonymous-form [name=body]').fill(note);await b.locator('#anonymous-form [type=submit]').click();await b.locator('#lab-status').filter({hasText:'작성자 정보 없이 의견을 남겼어요.'}).waitFor();await a.locator('.anonymous-note p').filter({hasText:note}).waitFor({timeout:15000});assert.equal(await a.locator('.anonymous-note img').count(),0);assert.equal(await a.evaluate(()=>window.injected),undefined);
 const feedback=(await service.discussion(users[0],experimentId)).feedback[0];assert.deepEqual(Object.keys(feedback).sort(),['body','id']);const row=await store.first('anonymous_feedback',{id:'eq.'+feedback.id});assert.deepEqual(Object.keys(row).sort(),['board_id','body','experiment_id','id']);
 await service.feedback(users[1],{...feedback,experimentId});assert.equal((await service.discussion(users[2],experimentId)).feedback.length,1);assert(!JSON.stringify(await store.snapshot()).includes(note));assert(!JSON.stringify(await store.history()).includes(note));assert.equal((await rpc(readOnly,'get_experiment_discussion',{experimentId})).structuredContent.feedback[0].body,note);
 checks.push('Anonymous feedback shared across accounts, no author/time columns or audit linkage, retry deduplication and HTML escaping');
 await a.screenshot({path:fileURLToPath(new URL('lab-discussion.png',out)),fullPage:true});await a.locator('#close-lab').click();
 for(const width of [905,640,390,320]){await a.setViewportSize({width,height:900});for(const route of ['todos','todos/calendar','todos/startup']){await a.goto(origin+'/#'+route);await a.locator('#planning-space').waitFor();assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+route+' '+width);}await a.locator('#plan-add').click();assert(await a.locator('#plan-editor').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'editor overflow '+width);await a.locator('#plan-form [data-plan-close]').first().click();await a.goto(origin+'/#lab');await a.locator('[data-lab-discuss]').click();await a.locator('#lab-title').filter({hasText:seed.experiments[0].title}).waitFor();assert(await a.locator('#lab-discussion').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'lab overflow '+width);await a.locator('#close-lab').click();}
 await a.goto(origin+'/#todos/calendar');await a.locator('.calendar-grid').waitFor();await a.screenshot({path:fileURLToPath(new URL('planning-mobile.png',out)),fullPage:true});checks.push('Chrome/Edge target browser, calendar in US browser timezone, 320–1440px pages/dialogs without overflow');
 assert.deepEqual(errors,[]);await writeFile(new URL('planning-result-'+(process.env.TEST_BROWSER||'chrome')+'.json',out),JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS planning: '+checks.join(' / '));
}catch(e){await writeFile(new URL('planning-result-'+(process.env.TEST_BROWSER||'chrome')+'.json',out),JSON.stringify({passed:false,checks,error:e.stack,errors},null,2));for(let i=0;i<pages.length;i++)await pages[i].screenshot({path:fileURLToPath(new URL(`planning-failure-${i}.png`,out)),fullPage:true}).catch(()=>{});console.error(e.stack);process.exitCode=1;}
finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 for(const table of ['plan_items','polls','anonymous_feedback','profiles','presence'])await store.remove(table,{board_id:`eq.${boardId}`});
 for(const u of users){await store.remove('sessions',{user_id:`eq.${u.id}`});await store.remove('members',{id:`eq.${u.id}`});}await store.remove('boards',{id:`eq.${boardId}`});
}
