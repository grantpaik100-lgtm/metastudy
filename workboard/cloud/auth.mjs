import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './store.mjs';
const scrypt=promisify(scryptCallback);
export const SCOPES=['workboard:read','workboard:write'];
export const hash=value=>createHash('sha256').update(String(value)).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
const future=seconds=>new Date(Date.now()+seconds*1000).toISOString();
export async function passwordHash(password) {
  const salt=randomBytes(16).toString('hex');
  const digest=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt:${salt}:${digest.toString('hex')}`;
}
export async function passwordMatches(password,encoded='') {
  const parts=encoded.split(':');
  const valid=parts[0]==='scrypt'&&/^[a-f0-9]{32}$/.test(parts[1]||'')&&/^[a-f0-9]{128}$/.test(parts[2]||'');
  const digest=await scrypt(password,valid?parts[1]:'0'.repeat(32),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return valid&&timingSafeEqual(digest,Buffer.from(parts[2],'hex'));
}
export function createAuth(store,origin) {
  const resource=`${origin}/mcp`; const secure=origin.startsWith('https://');
  const cookieName=secure?'__Host-workboard':'workboard_local';
  const cookie=(token,age=604800)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  function cookieToken(req) {
    return String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)||'';
  }
  async function rate(key,limit,seconds) {
    if(!await store.rpc('workboard_rate_limit',{p_key:hash(key),p_limit:limit,p_seconds:seconds})) throw new HttpError(429,'요청이 너무 많아요. 잠시 후 다시 시도해주세요.','rate_limited');
  }
  async function member(id) {
    const user=await store.first('members',{id:`eq.${id}`,enabled:'eq.true'});
    if(!user) throw new HttpError(401,'다시 로그인해주세요.','unauthorized');
    return user;
  }
  async function issue(user,kind,{clientId=null,familyId=randomUUID(),label='',scope=SCOPES.join(' '),ttl=604800}={}) {
    const token=secret();
    await store.insert('sessions',{token_hash:hash(token),user_id:user.id,kind,client_id:clientId,
      family_id:familyId,label,scope,resource,expires_at:future(ttl)});
    return token;
  }
  async function authenticate(req,{mcp=false,initial=false}={}) {
    const token=mcp?/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(req.headers.authorization||'')?.[1]:cookieToken(req);
    if(!token) throw new HttpError(401,'로그인이 필요해요.','unauthorized');
    const session=await store.first('sessions',{token_hash:`eq.${hash(token)}`,consumed:'eq.false',expires_at:`gt.${new Date().toISOString()}`});
    if(!session||session.resource!==resource||(mcp?!['access','personal'].includes(session.kind):session.kind!=='web')) throw new HttpError(401,'로그인이 만료되었어요. 다시 연결해주세요.','unauthorized');
    const user=await member(session.user_id);
    if(!initial&&!user.password_changed) throw new HttpError(403,'계정 화면에서 초기 비밀번호를 변경해주세요.','password_change_required');
    return {user,session,token};
  }
  async function login(username,password,ip) {
    username=typeof username==='string'?username.trim().normalize('NFC'):'';
    if(typeof password!=='string'||password.length>128) throw new HttpError(400,'아이디와 비밀번호를 확인해주세요.');
    await rate(`login-ip:${ip}`,50,900); await rate(`login-user:${username}:${ip}`,10,300);
    const user=username.length<=40?await store.first('members',{username:`eq.${username}`,enabled:'eq.true'}):null;
    if(!await passwordMatches(password,user?.password_hash)||!user) throw new HttpError(401,'아이디 또는 비밀번호를 확인해주세요.','login_failed');
    return {user,token:await issue(user,'web')};
  }
  async function changePassword(user,current,next) {
    if(typeof current!=='string'||current.length>128||typeof next!=='string'||next.length<12||next.length>128||next===current) throw new HttpError(400,'새 비밀번호는 기존과 다르게 12~128자로 입력해주세요.');
    await rate(`password:${user.id}`,10,300);
    if(!await passwordMatches(current,user.password_hash)) throw new HttpError(400,'현재 비밀번호를 확인해주세요.');
    const changed=await store.rpc('workboard_change_password',{p_user_id:user.id,p_expected_hash:user.password_hash,p_hash:await passwordHash(next)});
    if(!changed) throw new HttpError(409,'계정이 변경됐어요. 다시 로그인해주세요.');
    return issue(user,'web');
  }
  const publicUser=user=>({id:user.id,name:user.username,mustChangePassword:!user.password_changed});
  function scopes(input) {
    const list=[...new Set(String(input||SCOPES.join(' ')).split(/\s+/).filter(Boolean))];
    if(!list.length||list.some(s=>!SCOPES.includes(s))) throw new HttpError(400,'지원하지 않는 접근 범위입니다.','invalid_scope');
    return list.join(' ');
  }
  function validRedirect(uri) {
    try {const url=new URL(uri);return !url.hash&&!url.username&&!url.password&&
      (url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)));}catch{return false;}
  }
  async function register(body,ip) {
    await rate(`register:${ip}`,20,3600);
    if(body.token_endpoint_auth_method&&body.token_endpoint_auth_method!=='none') throw new HttpError(400,'PKCE를 사용하는 public client만 지원합니다.','invalid_client_metadata');
    if(!Array.isArray(body.redirect_uris)||!body.redirect_uris.length||body.redirect_uris.length>8||body.redirect_uris.some(u=>typeof u!=='string'||u.length>2000||!validRedirect(u))) throw new HttpError(400,'올바른 redirect_uris가 필요합니다.','invalid_redirect_uri');
    const client={id:randomUUID(),name:String(body.client_name||'AI 앱').slice(0,100),redirect_uris:body.redirect_uris};
    await store.insert('oauth_clients',client);
    return {client_id:client.id,client_name:client.name,redirect_uris:client.redirect_uris,
      token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']};
  }
  async function authorization(input) {
    const client=await store.first('oauth_clients',{id:`eq.${String(input.client_id).slice(0,100)}`});
    if(!client||!client.redirect_uris.includes(input.redirect_uri)) throw new HttpError(400,'등록된 AI 앱의 콜백 주소를 확인해주세요.','invalid_request');
    if(input.response_type!=='code'||input.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge||'')) throw new HttpError(400,'PKCE S256 인증 요청이 필요합니다.','invalid_request');
    if(input.resource!==resource) throw new HttpError(400,'이 작업판의 MCP 주소로 연결해주세요.','invalid_target');
    if(input.state&&String(input.state).length>2000) throw new HttpError(400,'잘못된 state입니다.');
    return {client,scope:scopes(input.scope)};
  }
  async function consent(user,input,approve) {
    const {client,scope}=await authorization(input);const redirect=new URL(input.redirect_uri);
    redirect.searchParams.set('iss',origin);
    if(input.state) redirect.searchParams.set('state',input.state);
    if(approve) {
      const code=secret();
      await store.insert('oauth_codes',{code_hash:hash(code),user_id:user.id,client_id:client.id,redirect_uri:input.redirect_uri,
        challenge:input.code_challenge,scope,resource,expires_at:future(300)});
      redirect.searchParams.set('code',code);
    } else redirect.searchParams.set('error','access_denied');
    return {redirect_url:redirect.href};
  }
  async function tokenPair(user,clientId,scope,familyId=randomUUID()) {
    const access=secret(),refresh=secret();
    await store.insert('sessions',[
      {token_hash:hash(access),user_id:user.id,kind:'access',client_id:clientId,family_id:familyId,label:'AI 연결',scope,resource,expires_at:future(3600)},
      {token_hash:hash(refresh),user_id:user.id,kind:'refresh',client_id:clientId,family_id:familyId,label:'AI 연결',scope,resource,expires_at:future(2592000)}
    ]);
    return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope};
  }
  async function exchange(input,ip) {
    await rate(`token:${ip}`,100,300);
    if(input.resource!==resource) throw new HttpError(400,'잘못된 resource입니다.','invalid_target');
    if(input.grant_type==='authorization_code') {
      const record=await store.first('oauth_codes',{code_hash:`eq.${hash(input.code||'')}`,consumed:'eq.false',expires_at:`gt.${new Date().toISOString()}`});
      const verifier=String(input.code_verifier||'');
      const challenge=createHash('sha256').update(verifier).digest('base64url');
      if(!record||record.client_id!==input.client_id||record.redirect_uri!==input.redirect_uri||record.resource!==resource||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||record.challenge!==challenge) throw new HttpError(400,'인증 요청이 만료되었거나 일치하지 않습니다.','invalid_grant');
      const user=await member(record.user_id);
      if(!user.password_changed) throw new HttpError(403,'비밀번호를 먼저 변경해주세요.','access_denied');
      const consumed=await store.patch('oauth_codes',{code_hash:`eq.${record.code_hash}`,consumed:'eq.false'},{consumed:true});
      if(!consumed.length) throw new HttpError(400,'이미 사용한 인증 코드입니다.','invalid_grant');
      return tokenPair(user,input.client_id,record.scope);
    }
    if(input.grant_type==='refresh_token') {
      const record=await store.first('sessions',{token_hash:`eq.${hash(input.refresh_token||'')}`,kind:'eq.refresh'});
      if(!record||record.client_id!==input.client_id||record.resource!==resource||Date.parse(record.expires_at)<=Date.now()) throw new HttpError(400,'AI 연결을 다시 승인해주세요.','invalid_grant');
      if(record.consumed) {await store.remove('sessions',{family_id:`eq.${record.family_id}`});throw new HttpError(400,'이미 사용한 갱신 토큰입니다. 다시 연결해주세요.','invalid_grant');}
      const user=await member(record.user_id);
      const consumed=await store.patch('sessions',{token_hash:`eq.${record.token_hash}`,consumed:'eq.false'},{consumed:true});
      if(!consumed.length) throw new HttpError(400,'이미 갱신한 연결입니다.','invalid_grant');
      return tokenPair(user,record.client_id,record.scope,record.family_id);
    }
    throw new HttpError(400,'지원하지 않는 인증 방식입니다.','unsupported_grant_type');
  }
  return {resource,cookie,cookieToken,rate,authenticate,login,changePassword,publicUser,issue,register,authorization,consent,exchange};
}
