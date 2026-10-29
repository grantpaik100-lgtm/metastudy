import { applyOp, normalizeBoard } from '../board-ops.js';
import { createHash } from 'node:crypto';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;

export class HttpError extends Error {
  constructor(status, message, code='request_error') { super(message); this.status=status; this.code=code; }
}
export function createStore({ url, key, boardId='studymeta' }) {
  if (!url || !key) throw new Error('Workboard database configuration is missing');
  async function rest(table, query={}, {method='GET',body,prefer}={}) {
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${table}?${new URLSearchParams(query)}`,{
      method, headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',
        Prefer:prefer||'return=representation'}, body:body===undefined?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      // Never forward database messages, URLs or credentials to clients.
      console.error('Workboard database request failed',table,response.status);
      throw new HttpError(503,'공유 저장소에 연결하지 못했어요. 잠시 후 다시 시도해주세요.','storage_unavailable');
    }
    const raw=await response.text();return raw?JSON.parse(raw):null;
  }
  const rpc=(name,body)=>rest(`rpc/${name}`,{},{method:'POST',body});
  const rows=(table,query)=>rest(`workboard_${table}`,query);
  const first=async(table,query)=>(await rows(table,{...query,limit:1}))[0]||null;
  const insert=(table,body)=>rest(`workboard_${table}`,{},{method:'POST',body});
  const patch=(table,query,body)=>rest(`workboard_${table}`,query,{method:'PATCH',body});
  const remove=(table,query)=>rest(`workboard_${table}`,query,{method:'DELETE'});
  async function snapshot() {
    const row=await first('boards',{id:`eq.${boardId}`});
    if (!row) throw new HttpError(503,'작업판 초기 데이터를 준비하고 있어요.','board_missing');
    return {board:row.board,rev:Number(row.rev)};
  }
  async function version() {
    const row=await first('boards',{id:`eq.${boardId}`,select:'rev'});
    if(!row) throw new HttpError(503,'작업판 초기 데이터를 준비하고 있어요.','board_missing');
    return Number(row.rev);
  }
  async function change(actor, operations, {requestId,expectedRev,reason='',channel='web'}={}) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(requestId||'')) throw new HttpError(400,'올바른 UUID 변경 요청 ID가 필요해요.');
    if (!Array.isArray(operations)||!operations.length||operations.length>30) throw new HttpError(400,'한 번에 1~30개의 변경을 보내주세요.');
    if (!operations.every(op=>op&&typeof op.type==='string')) throw new HttpError(400,'변경 형식을 확인해주세요.');
    if (typeof reason!=='string'||reason.length>2000) throw new HttpError(400,'변경 이유는 2,000자 이내의 문장으로 입력해주세요.');
    const requestHash=createHash('sha256').update(JSON.stringify(canonical({operations,expectedRev:expectedRev??null,reason,channel}))).digest('hex');
    const previous=await first('changes',{board_id:`eq.${boardId}`,request_id:`eq.${requestId}`,select:'user_id,rev,operations'});
    if(previous) {
      if(previous.user_id!==actor.id) throw new HttpError(409,'다른 사용자가 사용한 요청 ID입니다.');
      if(previous.operations[0]?.requestHash!==requestHash) throw new HttpError(409,'같은 요청 ID에 다른 변경이 들어왔어요. 새 변경에는 새 UUID를 사용해주세요.','idempotency_conflict');
      return {ok:true,rev:Number(previous.rev),duplicate:true};
    }
    if(operations.some(op=>!op.type.startsWith('spatial.'))&&!Number.isSafeInteger(expectedRev)) throw new HttpError(400,'화면 변경에는 조회한 작업판 버전이 필요해요.');
    for(let retry=0;retry<4;retry++) {
      const current=await snapshot();
      if(expectedRev!==undefined&&expectedRev!==current.rev) throw new HttpError(409,'다른 사람이 작업판을 변경했어요. 최신 내용을 확인한 뒤 다시 저장해주세요.','conflict');
      const board=structuredClone(current.board); const applied=[];
      for(const raw of operations) {
        const op={...raw,at:new Date().toISOString(),by:actor.username+(channel==='mcp'?' · AI':'')};
        const result=applyOp(board,op);
        if(result.error) throw new HttpError(result.error==='conflict'?409:400,result.message,result.error);
        applied.push({...result.op,requestHash});
      }
      const normalized=normalizeBoard(board);
      if(!normalized||JSON.stringify(normalized).length>2000000) throw new HttpError(400,'작업판 형식이나 크기를 확인해주세요.');
      const result=await rpc('workboard_commit',{p_board_id:boardId,p_expected_rev:current.rev,p_board:normalized,
        p_request_id:requestId,p_user_id:actor.id,p_channel:channel,p_reason:reason,p_operations:applied});
      if(result.error)throw new HttpError(409,'같은 요청 ID에 다른 변경이 들어왔어요.','idempotency_conflict');
      if(!result.conflict) return result;
    }
    throw new HttpError(409,'동시에 변경이 들어왔어요. 최신 내용을 확인한 뒤 다시 저장해주세요.','conflict');
  }
  async function history(limit=30) {
    return rows('changes',{board_id:`eq.${boardId}`,select:'rev,actor,channel,reason,operations,created_at',order:'rev.desc',limit:Math.min(100,Math.max(1,Number(limit)||30))});
  }
  return {rest,rpc,rows,first,insert,patch,remove,snapshot,version,change,history,boardId};
}
