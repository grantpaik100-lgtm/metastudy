import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore} from './store.mjs';
import {structureOperations,withStructure} from '../structure-import.mjs';
process.loadEnvFile(fileURLToPath(new URL('../.env.local',import.meta.url)));
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId:process.env.WORKBOARD_BOARD_ID||'studymeta'});
const manifest=JSON.parse(readFileSync(new URL('../structure-snapshot.json',import.meta.url),'utf8'));
const before=await store.snapshot(),operations=structureOperations(before.board,manifest);
withStructure(before.board,manifest); // Validate everything before the first database write.
const backup=new URL('../test-output/',import.meta.url);mkdirSync(backup,{recursive:true});writeFileSync(new URL('structure-before-'+Date.now()+'.json',backup),JSON.stringify(before));
const actor=await store.first('members',{username:'eq.백현승',select:'id,username'});if(!actor)throw Error('Requested workboard owner not found');
for(let i=0;i<operations.length;i+=30)await store.change(actor,operations.slice(i,i+30),{requestId:randomUUID(),reason:'요청한 네 상세 공간과 실제 코드 스냅샷 연결 추가 · '+manifest.codeRef,channel:'mcp'});
const after=await store.snapshot();if(JSON.stringify(before.board.screens)!==JSON.stringify(after.board.screens))throw Error('Concurrent legacy-screen edits detected; inspect backup, do not overwrite.');
console.log(JSON.stringify({operations:operations.length,rev:after.rev,nodes:after.board.spatial.nodes.length,edges:after.board.spatial.edges.length,codeRef:manifest.codeRef}));
