// Run only from the owner's machine after applying schema.sql.
// Initial passwords are generated locally and never printed or deployed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { passwordHash } from './auth.mjs';
import { createStore } from './store.mjs';
import { normalizeBoard } from '../board-ops.js';
const root=new URL('../',import.meta.url);
process.loadEnvFile(fileURLToPath(new URL('.env.local',root)));
const store=createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY,boardId:process.env.WORKBOARD_BOARD_ID});
const privateDir=new URL('private/',root);mkdirSync(privateDir,{recursive:true});
const credentials=new URL('initial-accounts.json',privateDir);
let accounts;
if(existsSync(credentials))accounts=JSON.parse(readFileSync(credentials,'utf8'));
else {
  const names=JSON.parse(process.env.WORKBOARD_USERNAMES||'[]');
  if(!Array.isArray(names)||names.length!==3||new Set(names).size!==3||names.some(n=>typeof n!=='string'||!n.trim()||n.length>40))throw new Error('Set WORKBOARD_USERNAMES to a JSON array of three unique login names.');
  accounts=names.map(username=>({id:randomUUID(),username:username.trim().normalize('NFC'),password:randomBytes(18).toString('base64url')}));
  writeFileSync(credentials,JSON.stringify(accounts,null,2),{flag:'wx',mode:0o600});
}
let created=0;
for(const account of accounts) {
  const existing=await store.first('members',{username:`eq.${account.username}`});
  if(existing)continue;
  await store.insert('members',{id:account.id,username:account.username,password_hash:await passwordHash(account.password)});created++;
}
const existingBoard=await store.first('boards',{id:`eq.${store.boardId}`});
if(!existingBoard) {
  const saved=new URL('data/board.json',root),seed=existsSync(saved)?saved:new URL('study-spatial-seed.json',root);
  const board=normalizeBoard(JSON.parse(readFileSync(seed,'utf8')));
  if(!board)throw new Error('Invalid initial board');
  await store.insert('boards',{id:store.boardId,board,rev:0});
}
const guide=new URL('로그인-안내.txt',privateDir);
const text=`StudyMeta 공동 작업판\n${process.env.WORKBOARD_URL}\n\n각자 본인의 계정만 전달해주세요. 첫 로그인 후 비밀번호를 바꿔야 작업판을 사용할 수 있습니다.\n초기 비밀번호는 변경 후에는 사용할 수 없습니다.\n\n`+accounts.map(a=>`아이디: ${a.username}\n초기 비밀번호: ${a.password}`).join('\n\n')+`\n\nAI 연결 주소: ${process.env.WORKBOARD_URL}/mcp\nAI 앱의 원격 MCP 연결에서 위 주소를 입력하고 작업판 계정으로 로그인해 승인하세요.\n계정 · AI 연결 화면에서 연결을 해제하거나 개인 연결 토큰을 만들 수 있습니다.\n이 파일은 로컬에만 있으며 Git과 배포 파일에서 제외됩니다.\n`;
writeFileSync(guide,text,{mode:0o600});
console.log(JSON.stringify({created,accounts:accounts.map(a=>a.username),board:existingBoard?'preserved':'initialized',credentialsFile:fileURLToPath(guide)}));
