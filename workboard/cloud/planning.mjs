import {HttpError} from './store.mjs';
const uuid=v=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v||''))throw new HttpError(400,'항목 ID를 확인해주세요.');return v;};
const text=(v,n,required=false)=>{if(typeof v!=='string'||v.length>n||(required&&!v.trim()))throw new HttpError(400,'입력한 내용의 길이를 확인해주세요.');return v.trim();};
const version=v=>{if(!Number.isInteger(v)||v<0||v>2147483646)throw new HttpError(400,'조회한 버전이 필요해요.');return v;};
const oneOf=(v,options)=>{if(!options.includes(v))throw new HttpError(400,'선택한 값을 확인해주세요.');return v;};
function date(v){if(v===''||v==null)return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'2000-01-01'||v>'2199-12-31'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw new HttpError(400,'날짜를 확인해주세요.');return v;}
function time(v){if(v===''||v==null)return null;if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new HttpError(400,'시간을 확인해주세요.');return v;}
export function createPlanning(store){
 const scope={board_id:`eq.${store.boardId}`};
 async function experiment(id){const {board}=await store.snapshot();const found=board.experiments.find(e=>e.id===id);if(!found)throw new HttpError(404,'실험을 찾을 수 없어요.');return found;}
 async function list(){const [items,members,profiles]=await Promise.all([store.rows('plan_items',{...scope,order:'created_at.asc',limit:1000}),store.rows('members',{enabled:'eq.true',select:'id,username'}),store.rows('profiles',{...scope,select:'user_id,display_name'})]);return {items,members:members.map(m=>({id:m.id,name:profiles.find(p=>p.user_id===m.id)?.display_name||m.username})),limitReached:items.length===1000,timeZone:'Asia/Seoul'};}
 async function save(user,b,channel='web'){
  if(!b||typeof b!=='object')throw new HttpError(400,'일정 내용을 확인해주세요.');
  const v=b.item||{},kind=oneOf(v.kind,['phase','goal','task','event']);
  const data={kind,parent_id:v.parent_id?uuid(v.parent_id):null,title:text(v.title,160,true),notes:text(v.notes||'',8000),owner_id:v.owner_id?uuid(v.owner_id):null,start_date:date(v.start_date),due_date:date(v.due_date),start_time:time(v.start_time),due_time:time(v.due_time),category:oneOf(v.category||'team',['team','startup']),event_type:oneOf(v.event_type||'기타',['기타','회의','출시','내부 마감','지원사업','공모전·대회','교육·행사']),url:text(v.url||'',2000),status:oneOf(v.status||'todo',['todo','doing','done','cancelled']),archived:v.archived===true};
  if(['phase','event'].includes(kind)&&data.parent_id)throw new HttpError(400,'이 항목에는 상위 목표를 지정할 수 없어요.');
  if(data.owner_id&&!await store.first('members',{id:`eq.${data.owner_id}`,enabled:'eq.true',select:'id'}))throw new HttpError(400,'담당자를 다시 선택해주세요.');
  if(kind==='event'&&!data.start_date&&!data.due_date)throw new HttpError(400,'공유할 일정의 날짜를 지정해주세요.');
  if(data.start_time&&!data.start_date||data.due_time&&!data.due_date)throw new HttpError(400,'시간을 넣으려면 날짜도 필요해요.');
  if(data.start_date&&data.due_date&&(data.start_date>data.due_date||data.start_date===data.due_date&&data.start_time&&data.due_time&&data.start_time>data.due_time))throw new HttpError(400,'종료는 시작보다 늦게 지정해주세요.');
  if(data.url){try{const url=new URL(data.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();data.url=url.href;}catch{throw new HttpError(400,'관련 링크는 http 또는 https 주소로 입력해주세요.');}}
  const result=await store.rpc('workboard_save_plan_item',{p_board:store.boardId,p_id:uuid(b.id),p_version:version(b.expectedVersion),p_user:user.id,p_actor:user.username,p_channel:channel,p_value:data});
  if(result.error)throw new HttpError(409,({conflict:'다른 사람이 먼저 수정했어요. 최신 내용을 확인한 뒤 다시 저장해주세요.',kind:'항목 종류는 만든 뒤 바꿀 수 없어요.',parent:'같은 작업판의 올바른 상위 목표를 선택해주세요.',children:'하위 목표를 먼저 보관하거나 다른 목표로 옮겨주세요.'})[result.error]||'변경을 저장하지 못했어요.');
  return result;
 }
 async function history(id){uuid(id);return {changes:await store.rows('plan_edits',{...scope,item_id:`eq.${id}`,select:'actor,channel,before_value,after_value,created_at',order:'id.desc',limit:30})};}
 async function discussion(user,experimentId){
  const item=await experiment(experimentId);
  const [polls,feedback]=await Promise.all([store.rows('polls',{...scope,experiment_id:`eq.${item.id}`,order:'created_at.desc',limit:100}),store.rows('anonymous_feedback',{...scope,experiment_id:`eq.${item.id}`,select:'id,body',order:'id.asc',limit:500})]);
  const votes=polls.length?await store.rows('votes',{poll_id:`in.(${polls.map(p=>p.id).join(',')})`,select:'poll_id,user_id,choice'}):[];
  return {experiment:{id:item.id,title:item.title},polls:polls.map(p=>{const ownVotes=votes.filter(v=>v.poll_id===p.id);return {id:p.id,question:p.question,options:p.options,endsAt:p.ends_at,closed:p.closed||Boolean(p.ends_at&&Date.parse(p.ends_at)<=Date.now()),version:p.version,canClose:p.created_by===user.id,total:ownVotes.length,counts:p.options.map((_,i)=>ownVotes.filter(v=>v.choice===i).length),myChoice:ownVotes.find(v=>v.user_id===user.id)?.choice??null};}),feedback,feedbackLimitReached:feedback.length===500};
 }
 async function createPoll(user,b){
  await experiment(b.experimentId);const id=uuid(b.id),question=text(b.question,200,true);
  if(!Array.isArray(b.options)||b.options.length<2||b.options.length>6)throw new HttpError(400,'선택지는 2~6개로 적어주세요.');
  const options=b.options.map(v=>text(v,120,true));if(new Set(options.map(v=>v.toLowerCase())).size!==options.length)throw new HttpError(400,'선택지를 서로 다르게 적어주세요.');
  let endsAt=null;if(b.endsAt){if(typeof b.endsAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?(Z|\+09:00)$/.test(b.endsAt)||!Number.isFinite(Date.parse(b.endsAt))||Date.parse(b.endsAt)<=Date.now())throw new HttpError(400,'투표 마감은 현재보다 이후로 지정해주세요.');date(b.endsAt.slice(0,10));time(b.endsAt.slice(11,16));endsAt=new Date(b.endsAt).toISOString();}
  const rows=await store.rest('workboard_polls',{on_conflict:'id'},{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{id,board_id:store.boardId,experiment_id:b.experimentId,question,options,ends_at:endsAt,created_by:user.id}});
  if(!rows.length){const old=await store.first('polls',{...scope,id:`eq.${id}`});if(!old||old.created_by!==user.id||old.experiment_id!==b.experimentId||old.question!==question||JSON.stringify(old.options)!==JSON.stringify(options)||(old.ends_at?Date.parse(old.ends_at):null)!==(endsAt?Date.parse(endsAt):null))throw new HttpError(409,'다른 요청에 사용된 투표 ID예요.');}
  return {ok:true,id};
 }
 async function vote(user,b){
  if(b.choice!==null&&!Number.isInteger(b.choice))throw new HttpError(400,'투표할 선택지를 골라주세요.');
  const result=await store.rpc('workboard_cast_vote',{p_board:store.boardId,p_poll:uuid(b.pollId),p_user:user.id,p_choice:b.choice});
  if(result.error)throw new HttpError(result.error==='missing'?404:409,({closed:'마감된 투표예요.',choice:'선택지를 다시 확인해주세요.',missing:'투표를 찾을 수 없어요.'})[result.error]);return result;
 }
 async function closePoll(user,b){const rows=await store.patch('polls',{...scope,id:`eq.${uuid(b.pollId)}`,created_by:`eq.${user.id}`,version:`eq.${version(b.expectedVersion)}`},{closed:true,version:b.expectedVersion+1});if(!rows.length)throw new HttpError(409,'투표를 만든 사람만 마감할 수 있어요. 최신 내용을 확인해주세요.');return {ok:true};}
 async function feedback(user,b){
  await experiment(b.experimentId);const id=uuid(b.id),body=text(b.body,3000,true);
  const rows=await store.rest('workboard_anonymous_feedback',{on_conflict:'id'},{method:'POST',prefer:'resolution=ignore-duplicates,return=representation',body:{id,board_id:store.boardId,experiment_id:b.experimentId,body}});
  if(!rows.length){const old=await store.first('anonymous_feedback',{...scope,id:`eq.${id}`,select:'experiment_id,body'});if(!old||old.experiment_id!==b.experimentId||old.body!==body)throw new HttpError(409,'다른 의견에 사용된 요청 ID예요.');}return {ok:true};
 }
 return {list,save,history,discussion,createPoll,vote,closePoll,feedback};
}
