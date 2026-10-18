// Integration against isolated fixture rows in the configured database.
// Production board and the three real users are never edited by this test.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createStore} from './cloud/store.mjs';
import {createHandler} from './cloud/handler.mjs';
import {passwordHash} from './cloud/auth.mjs';
import {assets as publicAssets} from './cloud/assets.mjs';
process.loadEnvFile(new URL('./.env.local',import.meta.url));
const tag=randomBytes(5).toString('hex'),boardId='test-'+tag;
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId});
const seed=JSON.parse(readFileSync(new URL('./study-spatial-seed.json',import.meta.url),'utf8'));
const users=['A','B','C'].map(suffix=>({id:randomUUID(),username:'검증-'+tag+'-'+suffix,password:randomBytes(18).toString('base64url')}));
const clients=[],checks=[],errors=[];
const assets=new Set(publicAssets);
let handler,browser;
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path.startsWith('/api/')||path.startsWith('/oauth/')||path.startsWith('/.well-known/')||path==='/mcp')return handler(req,res);
  const file=path==='/'?'index.html':path.slice(1);if(!assets.has(file)){res.writeHead(404);return res.end();}
  const content=await readFile(new URL(file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript'});res.end(content);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
handler=createHandler({store,origin});
async function request(path,{body,cookie,token,headers={},method,redirect='manual'}={}) {
  const response=await fetch(origin+path,{method:method||(body===undefined?'GET':'POST'),redirect,
    headers:{...(body!==undefined?{'Content-Type':'application/json',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}return {status:response.status,data,headers:response.headers,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(user){const r=await request('/api/login',{body:{username:user.username,password:user.password}});assert.equal(r.status,200,JSON.stringify(r.data));return r.cookie;}
const rpc=(token,name,args={})=>request('/mcp',{token,body:{jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}}});
const op=(cookie,item,extra={})=>request('/api/op',{cookie,body:{requestId:randomUUID(),op:item,...extra}});
const node=seed.spatial.nodes[0],node2=seed.spatial.nodes[1];
const out=new URL('./test-output/',import.meta.url);mkdirSync(out,{recursive:true});
try {
  await store.insert('boards',{id:boardId,board:seed,rev:0});
  for(let i=0;i<users.length;i++)await store.insert('members',{id:users[i].id,username:users[i].username,password_hash:await passwordHash(users[i].password),password_changed:i!==2});
  assert.equal((await request('/api/state')).status,401);
  const unauth=await request('/mcp',{body:{jsonrpc:'2.0',id:1,method:'tools/list'}});assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate'),/resource_metadata/);
  assert.equal((await request('/cloud/auth.mjs')).status,404);assert.equal((await request('/.env.local')).status,404);
  const a=await login(users[0]),b=await login(users[1]),c=await login(users[2]);
  assert.equal((await request('/api/state',{cookie:c})).status,403);
  const nextPassword=randomBytes(18).toString('base64url');
  const changed=await request('/api/password',{cookie:c,body:{currentPassword:users[2].password,password:nextPassword}});assert.equal(changed.status,200);
  assert.equal((await request('/api/state',{cookie:c})).status,401);
  assert.equal((await request('/api/state',{cookie:changed.cookie})).status,200);users[2].password=nextPassword;
  assert.equal((await request('/api/login',{body:{username:'미등록-'+tag,password:'invalid-password'}})).status,401);
  assert.equal((await request('/api/op',{cookie:a,body:{},headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await request('/mcp',{cookie:a,body:{jsonrpc:'2.0',id:1,method:'tools/list'}})).status,401);
  checks.push('authentication, first-login password change, revocation, CSRF and private files');
  const stale={type:'spatial.node.update',id:node.id,expectedVersion:0,fields:{owner:'첫 편집'}};
  const races=await Promise.all([op(a,{...stale,by:'위조 이름'}),op(b,{...stale,fields:{owner:'다른 편집'}})]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
  const first=await store.snapshot();assert.equal(first.board.spatial.nodes[0].version,1);
  assert(users.some(u=>u.username===first.board.spatial.nodes[0].updatedBy));
  const concurrency=await Promise.all([op(a,{type:'spatial.node.update',id:node.id,expectedVersion:1,fields:{followup:'A 작업'}}),op(b,{type:'spatial.node.update',id:node2.id,expectedVersion:0,fields:{followup:'B 작업'}})]);
  assert(concurrency.every(r=>r.status===200),JSON.stringify(concurrency.map(r=>r.data)));
  const sameRequest={requestId:randomUUID(),op:{type:'spatial.node.update',id:node.id,expectedVersion:2,fields:{owner:'중복 없는 수정'}}};
  const once=await request('/api/op',{cookie:a,body:sameRequest}),twice=await request('/api/op',{cookie:a,body:sameRequest});
  assert.equal(once.data.rev,twice.data.rev);assert.equal(twice.data.duplicate,true);
  assert.equal((await request('/api/op',{cookie:a,body:{...sameRequest,op:{...sameRequest.op,fields:{owner:'잘못된 재사용'}}}})).status,409);
  checks.push('database transaction, same-node conflicts, concurrent different-node edits and idempotency');
  const registration=await request('/oauth/register',{body:{client_name:'Test '+tag,redirect_uris:['http://127.0.0.1:9876/callback'],token_endpoint_auth_method:'none'}});
  assert.equal(registration.status,201,JSON.stringify(registration.data));const client=registration.data;clients.push(client.client_id);
  assert.equal((await request('/oauth/register',{body:{redirect_uris:['javascript:alert(1)']}})).status,400);
  const verifier=randomBytes(32).toString('base64url');
  const authParams={client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:tag,scope:'workboard:read workboard:write',resource:origin+'/mcp'};
  assert.equal((await request('/oauth/authorize?'+new URLSearchParams({...authParams,redirect_uri:'https://evil.example'}))).status,400);
  assert.equal((await request('/oauth/authorize?'+new URLSearchParams(authParams))).status,302);
  const consent=await request('/api/oauth/consent',{cookie:a,body:{...authParams,approve:true}});assert.equal(consent.status,200);
  const callback=new URL(consent.data.redirect_url);assert.equal(callback.searchParams.get('state'),tag);assert.equal(callback.searchParams.get('iss'),origin);
  const exchange={grant_type:'authorization_code',client_id:client.client_id,code:callback.searchParams.get('code'),redirect_uri:authParams.redirect_uri,resource:authParams.resource,code_verifier:verifier};
  assert.equal((await request('/oauth/token',{body:{...exchange,code_verifier:'x'.repeat(43)}})).status,400);
  const pair=await request('/oauth/token',{body:exchange});assert.equal(pair.status,200,JSON.stringify(pair.data));
  assert.equal((await request('/oauth/token',{body:exchange})).status,400);
  const token=pair.data.access_token;
  const init=await request('/mcp',{token,body:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}}});assert.equal(init.data.result.serverInfo.name,'studymeta-workboard');
  assert.equal((await request('/mcp',{token,body:{jsonrpc:'2.0',method:'notifications/initialized'}})).status,202);
  assert.equal((await request('/mcp',{token})).status,405);
  const tools=await request('/mcp',{token,body:{jsonrpc:'2.0',id:2,method:'tools/list'}});assert.equal(tools.data.result.tools.length,8);
  assert.equal((await rpc(token,'get_workboard')).data.result.structuredContent.spatial.nodes.length,59);
  const current=await store.snapshot(),beforeRev=current.rev;
  const invalid=await rpc(token,'update_workboard',{requestId:randomUUID(),reason:'원자성 검증',operations:[{type:'spatial.node.update',id:node.id,expectedVersion:3,fields:{owner:'저장되면 안 됨'}},{type:'spatial.edge.create',item:{id:randomUUID(),title:'잘못된 연결',from:node.id,to:'missing'}}]});
  assert.equal(invalid.data.result.isError,true);assert.equal((await store.snapshot()).rev,beforeRev);
  const updated=await rpc(token,'update_workboard',{requestId:randomUUID(),reason:'AI 연결 검증',operations:[{type:'spatial.node.update',id:node.id,expectedVersion:3,fields:{followup:'AI가 기록한 후속 과제'}}]});assert.equal(updated.data.result.structuredContent.ok,true);
  const structureId='test-structure-'+tag;
  const structureCreate=await rpc(token,'update_workboard',{requestId:randomUUID(),reason:'구조 메타데이터 검증',operations:[{type:'spatial.node.create',item:{id:structureId,title:'구조 검증',plane:'backend',kind:'function',filePath:'src/pilot/example.ts',symbol:'Example.run',evidence:'code',codeRef:'fixture-ref',description:'가상 코드'}}]});assert.equal(structureCreate.data.result.structuredContent.ok,true);
  const structureSearch=await rpc(token,'search_workboard',{query:'src/pilot/example.ts'});assert.equal(structureSearch.data.result.structuredContent.items[0].symbol,'Example.run');
  const structureRead=await rpc(token,'get_workboard',{id:structureId});assert.equal(structureRead.data.result.structuredContent.item.codeRef,'fixture-ref');checks.push('MCP file/symbol metadata storage and search');
  const history=await store.history();assert.equal(history[0].channel,'mcp');assert.equal(history[0].actor,users[0].username);
  assert.equal((await store.snapshot()).board.spatial.nodes[0].updatedBy,users[0].username+' · AI');
  await store.patch('sessions',{user_id:`eq.${users[0].id}`,kind:'eq.access'},{expires_at:new Date(Date.now()-1000).toISOString()});
  assert((await request('/api/tokens',{cookie:a})).data.connections.some(c=>c.client_id===client.client_id),'An idle OAuth connection must remain revocable after its access token expires');
  const refreshBody={grant_type:'refresh_token',client_id:client.client_id,refresh_token:pair.data.refresh_token,resource:origin+'/mcp'};
  const refreshed=await request('/oauth/token',{body:refreshBody});assert.equal(refreshed.status,200);
  assert.equal((await request('/oauth/token',{body:refreshBody})).status,400);
  assert.equal((await rpc(refreshed.data.access_token,'get_workboard')).status,401);
  checks.push('MCP discovery, PKCE, exact redirects, code replay, token rotation, family revocation and tool writes');
  const personal=await request('/api/tokens',{cookie:b,body:{label:'Fixture AI'}});assert.equal(personal.status,201);
  const connections=(await request('/api/tokens',{cookie:b})).data.connections;const family=connections.find(c=>c.kind==='personal').family_id;
  await request('/api/tokens/revoke',{cookie:a,body:{familyId:family}});assert.equal((await rpc(personal.data.token,'get_workboard')).status,200);
  await request('/api/tokens/revoke',{cookie:b,body:{familyId:family}});assert.equal((await rpc(personal.data.token,'get_workboard')).status,401);
  checks.push('personal token ownership and revocation');
  const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({channel:'chrome',headless:true});
  const redirectContext=await browser.newContext();const redirectPage=await redirectContext.newPage();
  for(const [file,unsafeNext] of [['login.html','/\n/evil.example'],['account.html','/\\evil.example']]) {
    await redirectPage.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{name:'테스트',mustChangePassword:file==='account.html'},mcpUrl:origin+'/mcp',ok:true})}));
    await redirectPage.goto(origin+'/'+file+'?next='+encodeURIComponent(unsafeNext));
    if(file==='login.html') {await redirectPage.locator('[name=username]').fill('테스트');await redirectPage.locator('[name=password]').fill('temporary-password');await redirectPage.getByRole('button',{name:'작업판 들어가기'}).click();}
    else {await redirectPage.locator('#name').filter({hasText:'테스트'}).waitFor();for(const name of ['currentPassword','password','confirm'])await redirectPage.locator('[name='+name+']').fill('temporary-password');await redirectPage.getByRole('button',{name:'비밀번호 변경',exact:true}).click();}
    await redirectPage.waitForURL(origin+'/#spatial');
    await redirectPage.unroute('**/api/**');
  }
  await redirectContext.close();checks.push('same-origin redirects after login and first password change');
  const contextA=await browser.newContext({viewport:{width:1520,height:1000}}),contextB=await browser.newContext({viewport:{width:1400,height:950}});
  const pageA=await contextA.newPage(),pageB=await contextB.newPage();
  for(const page of [pageA,pageB])page.on('pageerror',e=>errors.push(e.message));
  async function browserLogin(page,user){await page.goto(origin+'/spatial.html');await page.waitForURL('**/login.html?**');await page.locator('[name=username]').fill(user.username);await page.locator('[name=password]').fill(user.password);await page.getByRole('button',{name:'작업판 들어가기'}).click();await page.waitForURL('**/spatial.html');await page.getByText('서버 연결됨',{exact:true}).waitFor();await page.locator('#element-tree').evaluate(el=>el.open=true);await page.locator('[data-select="'+node.id+'"]').first().click();}
  await pageA.goto(origin+'/login.html');await pageA.screenshot({path:new URL('cloud-login.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  await browserLogin(pageA,users[0]);await browserLogin(pageB,users[1]);
  await pageA.locator('[name=followup]').fill('브라우저 공동 편집 검증');await pageA.getByRole('button',{name:'변경 저장',exact:true}).click();
  await pageB.waitForFunction(()=>document.querySelector('[name=followup]')?.value==='브라우저 공동 편집 검증');
  await pageA.locator('[name=owner]').fill('저장하지 않은 내 초안');
  await pageB.locator('[name=owner]').fill('다른 사람이 먼저 저장');await pageB.getByRole('button',{name:'변경 저장',exact:true}).click();
  await pageA.locator('#edit-notice').waitFor({state:'visible'});await pageA.getByRole('button',{name:'변경 저장',exact:true}).click();
  await pageA.waitForFunction(()=>document.querySelector('#toast').textContent.includes('변경됐어요'));
  assert.equal(await pageA.locator('[name=owner]').inputValue(),'저장하지 않은 내 초안');
  await pageB.screenshot({path:new URL('cloud-spatial.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  await pageB.goto(origin+'/#spatial');await pageB.locator('iframe').waitFor();assert(await pageB.getByRole('link',{name:'계정 · AI 연결'}).isVisible());
  await pageB.goto(origin+'/#home');await pageB.getByRole('link',{name:'내 계정에서 AI 연결 →'}).waitFor();
  await pageB.goto(origin+'/#wireframe');const deleteButton=pageB.locator('[data-action=delete-screen]').first();await deleteButton.waitFor();
  const screenCount=await pageB.locator('.wire-card').count(),revisionBeforeFailure=await store.version();
  await pageB.route('**/api/op',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'conflict',message:'검증용 저장 충돌'})}));
  pageB.on('dialog',dialog=>dialog.accept());await deleteButton.click();
  await pageB.waitForFunction(()=>document.querySelector('#toast').textContent==='검증용 저장 충돌');
  assert.equal(await pageB.locator('.wire-card').count(),screenCount);
  await pageB.locator('#import-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
  await pageB.waitForResponse(response=>response.url().endsWith('/api/op')&&response.status()===409);
  await pageB.waitForFunction(()=>document.querySelector('#toast').textContent==='검증용 저장 충돌');
  assert.equal(await store.version(),revisionBeforeFailure);await pageB.unroute('**/api/op');
  checks.push('cloud AI guidance and failed import/delete preserve data and show the save error');
  const mobile=await browser.newContext({viewport:{width:390,height:844}});const mobilePage=await mobile.newPage();await browserLogin(mobilePage,users[2]);
  assert(await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobilePage.screenshot({path:new URL('cloud-mobile.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  assert.deepEqual(errors,[]);checks.push('browser login, two-user synchronization, draft preservation, board integration, mobile and runtime');
  writeFileSync(new URL('cloud-result.json',out),JSON.stringify({passed:true,checks,errors},null,2));
  console.log(JSON.stringify({passed:true,checks}));
} finally {
  if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  // Delete only fixture IDs generated by this test. Never delete by a broad prefix.
  await store.remove('changes',{board_id:`eq.${boardId}`});await store.remove('boards',{id:`eq.${boardId}`});
  for(const user of users){for(const table of ['presence','oauth_codes','sessions'])await store.remove(table,{user_id:`eq.${user.id}`});await store.remove('members',{id:`eq.${user.id}`});}
  for(const id of clients)await store.remove('oauth_clients',{id:`eq.${id}`});
}
