import { randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from './store.mjs';
export const CHANNELS=['일반','기획','개발','피드백'];
const DAY=86400000, BUCKET='workboard-meetings';
const uuid=value=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||''))throw new HttpError(400,'항목 ID를 확인해주세요.');return value;};
const text=(value,max,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new HttpError(400,'입력한 내용의 길이와 형식을 확인해주세요.');return value.trim();};
const now=()=>new Date().toISOString();
export function cronAuthorized(header,secret) {
 const a=Buffer.from(header||''),b=Buffer.from(`Bearer ${secret||''}`);
 return Boolean(secret)&&a.length===b.length&&timingSafeEqual(a,b);
}
export function createMeetings(store,env=process.env) {
 const scope={board_id:`eq.${store.boardId}`};
 async function storage(path,{method='GET',body,headers={}}={}) {
  const response=await fetch(`${env.SUPABASE_URL}/storage/v1/${path}`,{method,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...headers},body,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new HttpError(503,'파일 저장소에 연결하지 못했어요. 다시 시도해주세요.');
  return response;
 }
 async function room(id) {const row=await store.first('rooms',{...scope,id:`eq.${uuid(id)}`});if(!row)throw new HttpError(404,'회의를 찾을 수 없어요.');return row;}
 async function media(id) {const row=await store.first('media',{...scope,id:`eq.${uuid(id)}`});if(!row)throw new HttpError(404,'파일을 찾을 수 없어요.');return row;}
 async function peer(user,id,roomId) {const row=await store.first('call_peers',{id:`eq.${uuid(id)}`,user_id:`eq.${user.id}`,room_id:`eq.${uuid(roomId)}`});if(!row||Date.parse(row.seen_at)<Date.now()-45000)throw new HttpError(409,'통화 연결이 만료됐어요. 다시 입장해주세요.');return row;}
 async function list() {return {rooms:await store.rows('rooms',{...scope,order:'created_at.desc',limit:100}),channels:CHANNELS};}
 async function detail(id) {
  const r=await room(id);
  const [clips,messages,peers,edits]=await Promise.all([
   store.rows('media',{...scope,room_id:`eq.${r.id}`,ready:'eq.true',order:'started_at.asc,created_at.asc',limit:3000}),
   chat({roomId:r.id}),store.rows('call_peers',{room_id:`eq.${r.id}`,order:'joined_at.asc'}),
   store.rows('meeting_edits',{room_id:`eq.${r.id}`,order:'created_at.desc',limit:30})]);
  return {room:r,media:clips.map(({object_path,...m})=>m),messages:messages.messages,participants:peers,edits};
 }
 async function chat({channel='일반',roomId,before}={}) {
  if(roomId)await room(roomId);else if(!CHANNELS.includes(channel))throw new HttpError(400,'채널을 확인해주세요.');
  const query={...scope,channel:`eq.${roomId?'회의':channel}`,room_id:roomId?`eq.${uuid(roomId)}`:'is.null',order:'created_at.desc,id.desc',limit:100};
  if(before){if(!Number.isFinite(Date.parse(before)))throw new HttpError(400,'이전 메시지 시간을 확인해주세요.');query.created_at=`lt.${before}`;}
  const messages=await store.rows('chat',query);return {messages:messages.reverse(),hasMore:messages.length===100};
 }
 async function send(user,b) {
  const id=uuid(b.id),channel=b.roomId?'회의':b.channel||'일반';
  if(b.roomId)await room(b.roomId);else if(!CHANNELS.includes(channel))throw new HttpError(400,'채널을 확인해주세요.');
  const previous=await store.first('chat',{id:`eq.${id}`});
  const attachments=Array.isArray(b.attachments)?b.attachments.map(uuid):[];
  if(attachments.length>5)throw new HttpError(400,'파일은 한 번에 5개까지 첨부해주세요.');
  const body=text(b.text||'',6000);if(!body&&!attachments.length)throw new HttpError(400,'내용이나 파일을 넣어주세요.');
  if(previous){if(previous.user_id!==user.id||previous.board_id!==store.boardId||previous.text!==body||previous.channel!==channel||previous.room_id!==(b.roomId||null)||previous.reply_to!==(b.replyTo||null)||JSON.stringify(previous.attachments.map(a=>a.id))!==JSON.stringify(attachments))throw new HttpError(409,'이미 사용한 메시지 ID입니다.');return {message:previous};}
  const files=[];
  for(const fileId of attachments){const f=await media(fileId);if(f.user_id!==user.id||!f.ready||f.kind!=='attachment'||f.deleted_at)throw new HttpError(400,'첨부 파일을 확인해주세요.');files.push({id:f.id,name:f.name,mime:f.mime,size:f.size});}
  if(b.replyTo){const parent=await store.first('chat',{...scope,id:`eq.${uuid(b.replyTo)}`,channel:`eq.${channel}`,room_id:b.roomId?`eq.${b.roomId}`:'is.null'});if(!parent)throw new HttpError(400,'이 채널의 메시지에 답글을 남겨주세요.');}
  const rows=await store.insert('chat',{id,board_id:store.boardId,channel,room_id:b.roomId||null,user_id:user.id,author:user.username,text:body,reply_to:b.replyTo||null,attachments:files});return {message:rows[0]};
 }
 async function createRoom(user,b) {
  const id=uuid(b.id),title=text(b.title,120,true),existing=await store.first('rooms',{id:`eq.${id}`});
  if(existing){if(existing.created_by!==user.id||existing.board_id!==store.boardId||existing.title!==title)throw new HttpError(409,'이미 사용한 회의 ID입니다.');return {room:existing};}
  return {room:(await store.insert('rooms',{id,board_id:store.boardId,title,created_by:user.id}))[0]};
 }
 async function updateRoom(user,b) {
  const r=await room(b.roomId);const fields={};
  if(b.action==='end'){fields.ended_at=r.ended_at||now();fields.recording=false;}
  else if(b.action==='record'){if(r.ended_at)throw new HttpError(409,'끝난 회의입니다.');await peer(user,b.peerId,r.id);fields.recording=b.recording===true;}
  else if(b.action==='links'){
   if(!Array.isArray(b.links)||b.links.length>30)throw new HttpError(400,'연결은 30개까지 추가해주세요.');
   const {board}=await store.snapshot(),ids=new Set(board.spatial.nodes.map(n=>n.id));
   if(b.links.some(id=>!ids.has(id)))throw new HttpError(400,'작업판 항목을 선택해주세요.');fields.links=[...new Set(b.links)];
  }else throw new HttpError(400,'지원하지 않는 회의 변경입니다.');
  return {room:(await store.patch('rooms',{...scope,id:`eq.${r.id}`},fields))[0]};
 }
 async function summary(user,b,channel='web') {
  const r=await room(b.roomId);
  if(!Number.isInteger(b.expectedVersion))throw new HttpError(400,'조회한 요약 버전이 필요해요.');
  const value={};for(const key of ['overview','decisions','openQuestions','actions'])value[key]=text(b.summary?.[key]||'',12000);
  if(!await store.rpc('workboard_save_meeting_summary',{p_room:r.id,p_version:b.expectedVersion,p_value:value,p_actor:user.username+(channel==='mcp'?' · AI':'')}))throw new HttpError(409,'요약이 변경됐어요. 최신 내용을 읽고 다시 저장해주세요.','conflict');
  return {ok:true,version:b.expectedVersion+1};
 }
 async function call(user,b) {
  const r=await room(b.roomId),id=uuid(b.peerId);
  if(b.action==='join'){
   const result=await store.rpc('workboard_join_call',{p_room:r.id,p_peer:id,p_user:user.id});
   if(result.error)throw new HttpError(409,({full:'통화는 세 명까지 입장할 수 있어요.',duplicate:'다른 창에서 이미 통화 중이에요. 먼저 나가주세요.',closed:'끝난 회의입니다.'})[result.error]||'통화에 입장하지 못했어요.');
  }else if(b.action==='leave'){
   await store.patch('call_peers',{id:`eq.${id}`,room_id:`eq.${r.id}`,user_id:`eq.${user.id}`},{seen_at:'1970-01-01T00:00:00.000Z',sharing:false,muted:true});return {ok:true};
  }else{
   await peer(user,id,r.id);
   if(b.action==='signal'){
    const recipient=uuid(b.to);const target=await store.first('call_peers',{id:`eq.${recipient}`,room_id:`eq.${r.id}`,seen_at:`gt.${new Date(Date.now()-45000).toISOString()}`});
    if(!target)throw new HttpError(409,'상대가 통화에서 나갔어요.');
    if(!b.payload||JSON.stringify(b.payload).length>100000||!['offer','answer','candidate'].includes(b.payload.type))throw new HttpError(400,'통화 연결 정보를 확인해주세요.');
    await store.insert('call_signals',{room_id:r.id,sender:id,recipient,payload:b.payload});return {ok:true};
   }
   if(b.action!=='poll')throw new HttpError(400,'지원하지 않는 통화 요청입니다.');
   // Only one participant shares a screen at a time; peers resolve a rare simultaneous request in the UI.
   // A heartbeat that read the peer before leave must not revive the departed seat.
   const updated=await store.patch('call_peers',{id:`eq.${id}`,user_id:`eq.${user.id}`,seen_at:`gt.${new Date(Date.now()-45000).toISOString()}`},{seen_at:now(),muted:b.muted===true,sharing:b.sharing===true});
   if(!updated.length)throw new HttpError(409,'통화에서 나갔어요. 다시 입장해주세요.');
  }
  const cursor=Number(b.cursor)||0;
  const [peers,signals]=await Promise.all([store.rows('call_peers',{room_id:`eq.${r.id}`,seen_at:`gt.${new Date(Date.now()-45000).toISOString()}`,order:'joined_at.asc'}),store.rows('call_signals',{room_id:`eq.${r.id}`,recipient:`eq.${id}`,id:`gt.${cursor}`,order:'id.asc',limit:200})]);
  return {room:r,peers,signals,cursor:signals.at(-1)?.id||cursor,serverTime:now()};
 }
 async function upload(user,b) {
  const id=uuid(b.id),kind=b.kind==='audio'?'audio':'attachment';
  const previous=await store.first('media',{id:`eq.${id}`});
  if(previous){if(previous.user_id!==user.id||previous.board_id!==store.boardId)throw new HttpError(409,'이미 사용한 파일 ID입니다.');if(previous.deleted_at)throw new HttpError(410,'보관 기간이 끝난 녹음입니다.');if(previous.ready)return {id,ready:true};}
  const name=text(b.name,180,true),mime=text(b.mime||'application/octet-stream',120,true);
  if(!/^[\w.+-]+\/[\w.+-]+(?:;[\w= -]+)?$/.test(mime))throw new HttpError(400,'파일 형식을 확인해주세요.');
  if(typeof b.data!=='string'||b.data.length>1500000||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))throw new HttpError(413,'파일 조각은 1MB 이하로 올려주세요.');
  const bytes=Buffer.from(b.data,'base64');if(!bytes.length||bytes.length>1000000)throw new HttpError(413,'파일은 1MB 이하로 올려주세요.');
  let r=null;if(b.roomId)r=await room(b.roomId);
  let started=null,duration=null;
  if(kind==='audio'){
   if(!r||!mime.startsWith('audio/'))throw new HttpError(400,'녹음할 회의와 음성 파일을 확인해주세요.');
   if(Date.parse(r.created_at)+30*DAY<=Date.now())throw new HttpError(410,'이 회의의 녹음 보관 기간이 끝났어요. 새 회의를 만들어주세요.');
   started=Number.isFinite(Date.parse(b.startedAt))?new Date(b.startedAt).toISOString():now();duration=Number(b.duration);
   if(!Number.isFinite(duration)||duration<=0||duration>120||Date.parse(started)<Date.parse(r.created_at)-DAY||Date.parse(started)>Date.now()+60000)throw new HttpError(400,'음성 조각의 시간 정보를 확인해주세요.');
  }
  const objectPath=`${store.boardId}/${id}`;
  if(!previous)await store.insert('media',{id,board_id:store.boardId,room_id:r?.id||null,user_id:user.id,author:user.username,kind,name,mime,size:bytes.length,object_path:objectPath,started_at:started,duration,expires_at:kind==='audio'?new Date(Date.parse(r.created_at)+30*DAY).toISOString():null});
  await storage(`object/${BUCKET}/${objectPath}`,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'true'},body:bytes});
  await store.patch('media',{...scope,id:`eq.${id}`},{ready:true});return {id,ready:true};
 }
 async function prepareFile(user,b) {
  const id=uuid(b.id),name=text(b.name,180,true),mime=text(b.mime||'application/octet-stream',120,true),size=Number(b.size);
  if(!/^[\w.+-]+\/[\w.+-]+$/.test(mime)||!Number.isSafeInteger(size)||size<1||size>10*1024*1024)throw new HttpError(400,'첨부 파일은 10MB 이하로 선택해주세요.');
  if(b.roomId)await room(b.roomId);
  const old=await store.first('media',{id:`eq.${id}`});
  if(old)throw new HttpError(409,'이미 사용한 파일 ID입니다.');
  const objectPath=`${store.boardId}/${id}`;
  await store.insert('media',{id,board_id:store.boardId,room_id:b.roomId||null,user_id:user.id,author:user.username,kind:'attachment',name,mime,size,object_path:objectPath});
  const signed=await(await storage(`object/upload/sign/${BUCKET}/${objectPath}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  return {id,url:`${env.SUPABASE_URL}/storage/v1${signed.url}`};
 }
 async function completeFile(user,b) {
  const f=await media(b.id);if(f.user_id!==user.id||f.kind!=='attachment')throw new HttpError(403,'본인이 올린 파일만 완료할 수 있어요.');
  const info=await(await storage(`object/info/${BUCKET}/${f.object_path}`)).json();const size=Number(info.size??info.metadata?.size);
  if(size!==f.size||size>10*1024*1024)throw new HttpError(400,'업로드된 파일 크기가 맞지 않아요. 다시 올려주세요.');
  await store.patch('media',{...scope,id:`eq.${f.id}`},{ready:true});return {ok:true};
 }
 async function download(id) {
  const f=await media(id);if(!f.ready||f.deleted_at)throw new HttpError(410,'원본 파일이 삭제됐어요. 회의록과 요약은 계속 볼 수 있어요.');
  const result=await(await storage(`object/sign/${BUCKET}/${f.object_path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})})).json();
  return {url:`${env.SUPABASE_URL}/storage/v1${result.signedURL}`,name:f.name,mime:f.mime};
 }
 async function transcript(user,b) {
  const f=await media(b.mediaId);if(f.kind!=='audio')throw new HttpError(400,'음성 파일만 글로 변환할 수 있어요.');
  if(!Number.isInteger(b.expectedVersion)||!Array.isArray(b.segments)||b.segments.length>500)throw new HttpError(400,'회의록 형식을 확인해주세요.');
  const segments=b.segments.map(s=>{const start=Number(s.start),end=Number(s.end);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||end>f.duration+3)throw new HttpError(400,'회의록의 시간을 확인해주세요.');return {start,end,text:text(s.text,3000,true)};});
  if(JSON.stringify(segments).length>100000)throw new HttpError(413,'회의록이 너무 큽니다.');
  const changed=await store.patch('media',{...scope,id:`eq.${f.id}`,transcript_version:`eq.${b.expectedVersion}`},{transcript:{segments,model:text(b.model||'직접 수정',120)},transcript_version:b.expectedVersion+1,transcript_by:user.username,transcript_at:now()});
  if(!changed.length)throw new HttpError(409,'회의록이 변경됐어요. 다시 불러와주세요.','conflict');return {ok:true};
 }
 async function notices(user) {
  const rows=await store.rows('meeting_notices',{...scope,order:'created_at.desc',limit:100});
  const read=await store.rows('meeting_reads',{user_id:`eq.${user.id}`,select:'notice_id',limit:1000});const ids=new Set(read.map(r=>r.notice_id));
  return {notices:rows.map(n=>({...n,read:ids.has(n.id)}))};
 }
 async function readNotice(user,b) {
  const n=await store.first('meeting_notices',{...scope,id:`eq.${uuid(b.id)}`});if(!n)throw new HttpError(404,'알림을 찾을 수 없어요.');
  await store.rest('workboard_meeting_reads',{on_conflict:'notice_id,user_id'},{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:{notice_id:n.id,user_id:user.id}});return {ok:true};
 }
 async function maintenance(clock=Date.now()) {
  const due=await store.rows('media',{...scope,kind:'eq.audio',deleted_at:'is.null',expires_at:`lte.${new Date(clock+3*DAY).toISOString()}`,order:'expires_at.asc',limit:3000});
  const rooms=new Map();for(const f of due)if(!rooms.has(f.room_id))rooms.set(f.room_id,await room(f.room_id));
  let deleted=0;
  for(const [id,r] of rooms){
   const expiry=Math.min(...due.filter(f=>f.room_id===id).map(f=>Date.parse(f.expires_at)));
   const stage=expiry<=clock+DAY?'one-day':'three-days';
   await store.rest('workboard_meeting_notices',{on_conflict:'room_id,stage'},{method:'POST',prefer:'resolution=ignore-duplicates,return=minimal',body:{board_id:store.boardId,room_id:id,stage,title:`「${r.title}」 원본 녹음이 ${new Date(expiry).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})} 삭제 예정이에요. 필요한 파일을 미리 내려받으세요.`}});
   // A missed scheduler never silently deletes without at least 24h of warning.
   const warning=await store.first('meeting_notices',{...scope,room_id:`eq.${id}`,stage:'in.(three-days,one-day)',created_at:`lte.${new Date(clock-DAY).toISOString()}`,order:'created_at.asc'});
   if(!warning)continue;
   const expired=due.filter(f=>f.room_id===id&&Date.parse(f.expires_at)<=clock);
   for(let i=0;i<expired.length;i+=100){const batch=expired.slice(i,i+100);if(!batch.length)continue;
    await storage(`object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:batch.map(f=>f.object_path)})});
    await store.patch('media',{...scope,id:`in.(${batch.map(f=>f.id).join(',')})`},{deleted_at:new Date(clock).toISOString()});deleted+=batch.length;
   }
  }
  // Signal payloads are ephemeral, and never part of a meeting archive.
  const boardRooms=await store.rows('rooms',{...scope,select:'id',limit:1000});
  if(boardRooms.length)await store.remove('call_signals',{room_id:`in.(${boardRooms.map(r=>r.id).join(',')})`,created_at:`lt.${new Date(clock-DAY).toISOString()}`});
  return {ok:true,deleted};
 }
 // 회의 기록 삭제: 저장소의 녹음·첨부 파일을 지우고 회의 행을 지운다. 대화·참여자·신호·회의록 수정 이력·알림은 DB에서 함께 지워진다(on delete cascade).
 async function deleteRoom(user,b={}) {
  const r=await room(b.roomId);
  if(b.title!==r.title)throw new HttpError(409,'회의 제목이 바뀌었어요. 새로고침한 뒤 다시 시도해주세요.');
  const live=await store.rows('call_peers',{room_id:`eq.${r.id}`,seen_at:`gt.${new Date(Date.now()-45000).toISOString()}`,limit:1});
  if(live.length)throw new HttpError(409,'아직 통화 중인 사람이 있어요. 모두 나간 뒤 삭제해주세요.');
  const files=await store.rows('media',{...scope,room_id:`eq.${r.id}`,deleted_at:'is.null',limit:3000});
  for(let i=0;i<files.length;i+=100){const batch=files.slice(i,i+100).map(f=>f.object_path).filter(Boolean);if(batch.length)await storage(`object/${BUCKET}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:batch})});}
  await store.remove('rooms',{...scope,id:`eq.${r.id}`});
  return {ok:true,deleted:{id:r.id,title:r.title,files:files.length,by:user.username}};
 }
 return {list,detail,chat,send,createRoom,updateRoom,deleteRoom,summary,call,upload,prepareFile,completeFile,download,transcript,notices,readNotice,maintenance};
}
