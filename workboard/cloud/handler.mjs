import { createStore, HttpError } from './store.mjs';
import { createAuth, hash, SCOPES } from './auth.mjs';
import { handleMcp } from './mcp.mjs';
import { createMeetings, cronAuthorized } from './meetings.mjs';
import { createProfiles } from './profiles.mjs';
import { createPlanning } from './planning.mjs';

const MAX_BODY=2*1024*1024;
export async function bodyOf(req) {
  if(req.body!==undefined) {
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(Buffer.byteLength(raw)>MAX_BODY) throw new HttpError(413,'요청이 너무 큽니다.');
    if(typeof req.body==='object') return req.body;
    return decodeBody(raw,req.headers['content-type']);
  }
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY) throw new HttpError(413,'요청이 너무 큽니다.');chunks.push(chunk);}
  return decodeBody(Buffer.concat(chunks).toString('utf8'),req.headers['content-type']);
}
function decodeBody(raw,type='') {
  if(type.startsWith('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try{return JSON.parse(raw||'{}');}catch{throw new HttpError(400,'요청 형식을 확인해주세요.');}
}
export function createHandler({store,origin,env=process.env}={}) {
  origin=origin||env.WORKBOARD_URL;
  if(!origin) throw new Error('WORKBOARD_URL is required');
  origin=new URL(origin).origin;
  store=store||createStore({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY,boardId:env.WORKBOARD_BOARD_ID});
  const auth=createAuth(store,origin),resource=auth.resource;
  const meetings=createMeetings(store,env);
  const profiles=createProfiles(store);
  const planning=createPlanning(store);
  const metadata={resource,authorization_servers:[origin],scopes_supported:SCOPES,resource_name:'StudyMeta 공동 작업판',bearer_methods_supported:['header']};
  const oauth={issuer:origin,authorization_endpoint:`${origin}/oauth/authorize`,token_endpoint:`${origin}/oauth/token`,
    registration_endpoint:`${origin}/oauth/register`,revocation_endpoint:`${origin}/oauth/revoke`,
    scopes_supported:SCOPES,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],
    token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true};
  const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Frame-Options':'SAMEORIGIN'};
  const json=(res,status,data,headers={})=>{res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8',...headers});res.end(data===undefined?undefined:JSON.stringify(data));};
  const redirect=(res,url)=>{res.writeHead(302,{...security,Location:url});res.end();};
  function originCheck(req,optional=false) {
    const source=req.headers.origin;
    if(source!==origin&&!(optional&&!source)) throw new HttpError(403,'이 작업판에서 보낸 요청만 허용됩니다.','origin_rejected');
  }
  const ipOf=req=>String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  return async function handler(req,res) {
    let path='';
    try {
      const url=new URL(req.url,origin);path=url.searchParams.get('route')||url.pathname;
      const method=req.method;
      if(path==='/api/meetings/maintenance'&&method==='GET') {
        if(!cronAuthorized(req.headers.authorization,env.CRON_SECRET))throw new HttpError(401,'예약 작업 인증이 필요합니다.');
        return json(res,200,await meetings.maintenance());
      }
      if(path.startsWith('/.well-known/oauth-protected-resource')) return json(res,200,metadata,{'Access-Control-Allow-Origin':'*'});
      if(path==='/.well-known/oauth-authorization-server') return json(res,200,oauth,{'Access-Control-Allow-Origin':'*'});
      if(path==='/api/config') return json(res,200,{cloud:true,origin,mcpUrl:resource});
      if(['/mcp','/oauth/token','/oauth/register','/oauth/revoke'].includes(path)) {
        // Native MCP clients omit Origin. Browser clients must be this application.
        originCheck(req,true);
        if(method==='OPTIONS') return json(res,204,undefined,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type, MCP-Protocol-Version','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Expose-Headers':'WWW-Authenticate'});
      }
      if(method==='POST'&&!['/mcp','/oauth/token','/oauth/register','/oauth/revoke'].includes(path)) originCheck(req);
      if(path==='/oauth/register'&&method==='POST') return json(res,201,await auth.register(await bodyOf(req),ipOf(req)));
      if(path==='/oauth/token'&&method==='POST') return json(res,200,await auth.exchange(await bodyOf(req),ipOf(req)));
      if(path==='/oauth/revoke'&&method==='POST') {
        const input=await bodyOf(req);await auth.rate(`revoke:${ipOf(req)}`,50,300);
        const record=await store.first('sessions',{token_hash:`eq.${hash(input.token||'')}`});
        if(record&&record.client_id===input.client_id) await store.remove('sessions',{family_id:`eq.${record.family_id}`});
        return json(res,200,{});
      }
      if(path==='/oauth/authorize'&&method==='GET') {
        await auth.authorization(Object.fromEntries(url.searchParams));
        url.searchParams.delete('route');return redirect(res,`/authorize.html?${url.searchParams}`);
      }
      if(path==='/api/login'&&method==='POST') {
        const input=await bodyOf(req),result=await auth.login(input.username,input.password,ipOf(req));
        return json(res,200,{user:auth.publicUser(result.user)},{'Set-Cookie':auth.cookie(result.token)});
      }
      if(path==='/api/logout'&&method==='POST') {
        const token=auth.cookieToken(req);if(token) await store.remove('sessions',{token_hash:`eq.${hash(token)}`,kind:'eq.web'});
        return json(res,200,{ok:true},{'Set-Cookie':auth.cookie('',0)});
      }
      if(path==='/mcp') {
        const identity=await auth.authenticate(req,{mcp:true});
        if(method!=='POST') return json(res,405,{message:'Use POST for stateless Streamable HTTP'},{Allow:'POST'});
        const version=req.headers['mcp-protocol-version'];
        if(version&&!['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(version)) throw new HttpError(400,'Unsupported MCP protocol version');
        const result=await handleMcp(await bodyOf(req),identity,store,meetings,planning);
        return json(res,result?200:202,result||undefined);
      }
      const initial=['/api/session','/api/password'].includes(path);
      const {user,session}=await auth.authenticate(req,{initial});
      if(path==='/api/planning/items'&&method==='GET')return json(res,200,await planning.list());
      if(path==='/api/planning/history'&&method==='GET')return json(res,200,await planning.history(url.searchParams.get('id')));
      if(path==='/api/lab/discussion'&&method==='GET')return json(res,200,await planning.discussion(user,url.searchParams.get('experiment')));
      const planningWrites={'/api/planning/save':'save','/api/lab/poll':'createPoll','/api/lab/vote':'vote','/api/lab/close':'closePoll','/api/lab/feedback':'feedback'};
      if(method==='POST'&&planningWrites[path]){
        await auth.rate(`planning:${user.id}:${path}`,path==='/api/lab/feedback'?10:60,60);
        return json(res,200,await planning[planningWrites[path]](user,await bodyOf(req)));
      }
      if(path==='/api/profiles'&&method==='GET')return json(res,200,await profiles.list());
      if(path==='/api/profiles'&&method==='POST'){
        await auth.rate(`profile:${user.id}`,30,60);
        return json(res,200,await profiles.save(user,await bodyOf(req)));
      }
      if(path==='/api/profiles/image'&&method==='GET'){
        const image=await profiles.image(url.searchParams.get('user'),url.searchParams.get('kind'));
        res.writeHead(200,{...security,'Content-Type':image.type,'Content-Length':image.bytes.length});return res.end(image.bytes);
      }
      if(path.startsWith('/api/meetings/')) {
        const action=path.slice('/api/meetings/'.length);
        if(method==='GET') {
          if(action==='list')return json(res,200,await meetings.list());
          if(action==='detail')return json(res,200,await meetings.detail(url.searchParams.get('id')));
          if(action==='chat')return json(res,200,await meetings.chat(Object.fromEntries(url.searchParams)));
          if(action==='download')return json(res,200,await meetings.download(url.searchParams.get('id')));
          if(action==='notices')return json(res,200,await meetings.notices(user));
        }
        const writes={send:'send',create:'createRoom',update:'updateRoom',summary:'summary',call:'call',upload:'upload','file-prepare':'prepareFile','file-complete':'completeFile',transcript:'transcript',read:'readNotice'};
        if(method==='POST'&&writes[action]) {
          if(action!=='call')await auth.rate(`meetings:${user.id}:${action}`,action==='upload'?180:120,60);
          return json(res,200,await meetings[writes[action]](user,await bodyOf(req)));
        }
        throw new HttpError(404,'회의 기능을 찾을 수 없어요.');
      }
      if(path==='/api/session'&&method==='GET') return json(res,200,{user:auth.publicUser(user),mcpUrl:resource});
      if(path==='/api/password'&&method==='POST') {
        const input=await bodyOf(req),token=await auth.changePassword(user,input.currentPassword,input.password);
        return json(res,200,{ok:true},{'Set-Cookie':auth.cookie(token)});
      }
      if(path==='/api/oauth/request'&&method==='GET') {
        const input=Object.fromEntries(url.searchParams);delete input.route;
        const details=await auth.authorization(input);
        return json(res,200,{client:{name:details.client.name},scope:details.scope,user:auth.publicUser(user),redirectUri:input.redirect_uri});
      }
      if(path==='/api/oauth/consent'&&method==='POST') {
        const input=await bodyOf(req);return json(res,200,await auth.consent(user,input,input.approve===true));
      }
      if(path==='/api/tokens'&&method==='GET') {
        const rows=await store.rows('sessions',{user_id:`eq.${user.id}`,kind:'in.(access,refresh,personal)',consumed:'eq.false',expires_at:`gt.${new Date().toISOString()}`,select:'family_id,label,kind,client_id,created_at,expires_at',order:'created_at.desc'});
        const connections=[...new Map(rows.map(row=>[row.family_id,row])).values()];
        return json(res,200,{connections});
      }
      if(path==='/api/tokens'&&method==='POST') {
        await auth.rate(`personal:${user.id}`,10,3600);
        const input=await bodyOf(req),label=String(input.label||'개인 AI 연결').slice(0,80);
        const token=await auth.issue(user,'personal',{label,ttl:7776000});
        return json(res,201,{token,expiresInDays:90,mcpUrl:resource});
      }
      if(path==='/api/tokens/revoke'&&method==='POST') {
        const input=await bodyOf(req);
        if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.familyId||'')) throw new HttpError(400,'연결 ID를 확인해주세요.');
        await store.remove('sessions',{user_id:`eq.${user.id}`,family_id:`eq.${input.familyId}`,kind:'in.(access,refresh,personal)'});
        return json(res,200,{ok:true});
      }
      if(path==='/api/state'&&method==='GET') {
        if(url.searchParams.has('since')) {
          const rev=await store.version();
          if(Number(url.searchParams.get('since'))===rev) return json(res,200,{rev,user:auth.publicUser(user)});
        }
        return json(res,200,{...await store.snapshot(),user:auth.publicUser(user)});
      }
      if(path==='/api/op'&&method==='POST') {
        const input=await bodyOf(req);
        return json(res,200,await store.change(user,[input.op],{requestId:input.requestId,expectedRev:input.expectedRev,reason:input.reason||'',channel:'web'}));
      }
      if(path==='/api/history'&&method==='GET') return json(res,200,{changes:await store.history(url.searchParams.get('limit'))});
      if(path==='/api/presence') {
        if(method==='POST') {
          const input=await bodyOf(req);
          if(!/^[\w-]{1,80}$/.test(input.client||'')) throw new HttpError(400,'연결 ID를 확인해주세요.');
          const clientId=`${user.id}:${input.client}`;
          await store.rest('workboard_presence',{on_conflict:'client_id'},{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{board_id:store.boardId,client_id:clientId,user_id:user.id,name:user.username,color:/^#[0-9a-f]{6}$/i.test(input.color)?input.color:'#2563eb',editing:typeof input.editing==='string'?input.editing.slice(0,120):null,mode:input.mode==='move'?'move':input.mode==='edit'?'edit':null,seen_at:new Date().toISOString()}});
        } else if(method!=='GET') throw new HttpError(405,'지원하지 않는 요청입니다.');
        const peers=await store.rows('presence',{board_id:`eq.${store.boardId}`,seen_at:`gt.${new Date(Date.now()-45000).toISOString()}`});
        return json(res,200,{peers:Object.fromEntries(peers.map(p=>[p.client_id.split(':').slice(1).join(':'),{name:p.name,color:p.color,editing:p.editing,mode:p.mode,userId:p.user_id}]))});
      }
      throw new HttpError(404,'요청한 기능을 찾을 수 없어요.');
    } catch(error) {
      const known=error instanceof HttpError;
      if(!known) console.error('Workboard request failed',error.name);
      const headers=path==='/mcp'&&error.status===401?{'WWW-Authenticate':`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${SCOPES.join(' ')}"`}:{};
      json(res,known?error.status:500,{error:known?error.code:'server_error',message:known?error.message:'서버에서 요청을 처리하지 못했어요.'},headers);
    }
  };
}
