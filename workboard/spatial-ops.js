// 구조 지도 데이터 계약. 학습자 데이터와 제품 코드는 변경하지 않는다.
// 노드와 연결 모두 독립 버전·담당·근거·후속 과제·수정 이력을 가진다.
export const PLANES = ['idea', 'ux', 'mcp', 'backend'];
export const STATES = ['기획', '구현', '검증', '운영', '확인 필요'];
const text = (v, n = 4000) => String(v ?? '').slice(0, n);
const idOk = v => typeof v === 'string' && /^[\w.-]{1,120}$/.test(v);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : '';
const keys = ['title','description','owner','followup','status','introduced','planned','implemented','deployed','source','feature','parentId','plane','from','to','x','y','kind','filePath','symbol','codeRef','codeExcerpt','uiScreen','uiSelector','toolName','relation','evidence'];
function fields(input = {}) {
  const out = {};
  for (const key of keys) {
    if (!(key in input)) continue;
    const v = input[key];
    if (['introduced','planned','implemented','deployed'].includes(key)) out[key] = date(v);
    else if (key === 'plane') { if (PLANES.includes(v)) out[key] = v; }
    else if (key === 'status') out[key] = STATES.includes(v) ? v : '확인 필요';
    else if (['x','y'].includes(key)) { if (Number.isFinite(v)) out[key] = Math.max(-600, Math.min(600, v)); }
    else out[key] = text(v, ['title','owner','feature','parentId','from','to'].includes(key) ? 200 : 8000);
  }
  return out;
}
function item(input) {
  if (!input || !idOk(input.id) || typeof input.title !== 'string' || !input.title.trim()) return null;
  return {id:input.id,title:'',description:'',owner:'',followup:'',status:'확인 필요',introduced:'',planned:'',implemented:'',deployed:'',source:'',feature:'기타',parentId:'',...fields(input),version:Number.isSafeInteger(input.version) && input.version >= 0 ? input.version : 0,updatedAt:text(input.updatedAt,40),updatedBy:text(input.updatedBy,80),history:Array.isArray(input.history) ? input.history.slice(-50).map(h=>({at:text(h.at,40),by:text(h.by,80),before:fields(h.before),after:fields(h.after)})) : []};
}
export function normalizeSpatial(input) {
  if (input == null) return {version:1,nodes:[],edges:[]};
  if (input.version !== 1 || !Array.isArray(input.nodes) || !Array.isArray(input.edges) || input.nodes.length > 500 || input.edges.length > 1500) return null;
  const graph = {version:1,nodes:input.nodes.map(item),edges:input.edges.map(item)};
  if ([...graph.nodes,...graph.edges].some(n=>!n)) return null;
  const all = [...graph.nodes,...graph.edges];
  if (new Set(all.map(n=>n.id)).size !== all.length) return null;
  const nodes = new Map(graph.nodes.map(n=>[n.id,n]));
  for (const n of graph.nodes) {
    if (!PLANES.includes(n.plane)) return null;
    const seen = new Set([n.id]); let p = n.parentId;
    while(p) { const parent=nodes.get(p); if (!parent || parent.plane!==n.plane || seen.has(p)) return null; seen.add(p); p=parent.parentId; }
  }
  for (const e of graph.edges) if (!nodes.has(e.from) || !nodes.has(e.to) || e.from===e.to) return null;
  return graph;
}
export function applySpatialOp(board, op, trusted=false) {
  if (!board.spatial) board.spatial = normalizeSpatial(null);
  const invalid = message => ({error:'invalid',message});
  const match = /^spatial\.(node|edge)\.(create|update)$/.exec(op.type);
  if (!match) return invalid('지원하지 않는 지도 변경입니다.');
  const listKey=match[1]==='node'?'nodes':'edges', action=match[2];
  const graph=structuredClone(board.spatial), list=graph[listKey];
  let record;
  if(action==='create') {
    record=item(op.item);
    if(!record || [...graph.nodes,...graph.edges].some(n=>n.id===record.id)) return invalid('항목 ID가 중복되거나 제목이 비어 있어요.');
    record.version=1;record.history=[];list.push(record);
  } else {
    record=list.find(n=>n.id===op.id);
    if(!record) return invalid('항목을 찾을 수 없어요.');
    if(!trusted && op.expectedVersion!==record.version) return {error:'conflict',message:'다른 창에서 이 항목이 변경됐어요. 초안은 남아 있습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.'};
    const patch=fields(op.fields);
    if('title' in patch && !patch.title.trim()) return invalid('제목을 입력해주세요.');
    const before=Object.fromEntries(Object.keys(patch).map(k=>[k,record[k]]));
    Object.assign(record,patch); record.version++;
    record.history.push({at:op.at||'',by:op.by||'',before,after:patch});record.history=record.history.slice(-50);
  }
  record.updatedAt=op.at||'';record.updatedBy=op.by||'';
  const valid=normalizeSpatial(graph);
  if(!valid) return invalid('연결 대상·상위 노드·면을 확인해주세요. 순환 위계는 저장할 수 없어요.');
  board.spatial=valid;
  return {ok:true,op:structuredClone(op)};
}
