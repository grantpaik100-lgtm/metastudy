import {applyOp,normalizeBoard} from './board-ops.js';
// Add only missing records/metadata. Existing team edits and legacy drawings stay intact.
export function structureOperations(board,manifest){
 const graph=board.spatial,existing=new Set([...graph.nodes,...graph.edges].map(n=>n.id)),ops=[];
 for(const n of manifest.nodes)if(!existing.has(n.id))ops.push({type:'spatial.node.create',item:n});
 for(const e of manifest.edges)if(!existing.has(e.id))ops.push({type:'spatial.edge.create',item:e});
 for(const patch of manifest.patches){const n=graph.nodes.find(n=>n.id===patch.id);if(!n||n.kind)continue;ops.push({type:'spatial.node.update',id:n.id,expectedVersion:n.version,fields:patch.fields});}
 return ops;
}
export function withStructure(board,manifest){
 const result=normalizeBoard(structuredClone(board));if(!result)throw Error('Invalid source board');
 for(const op of structureOperations(result,manifest)){const r=applyOp(result,{...op,at:manifest.generatedAt,by:'구조 스냅샷 가져오기'});if(r.error)throw Error(r.message+' '+(op.item?.id||op.id));}
 return result;
}
