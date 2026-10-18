// Explicit snapshot import. Never guesses runtime execution or deployment status.
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Provide the reviewed StudyMeta backend checkout path.');
const ref=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const base='https://github.com/grantpaik100-lgtm/studymeta-backend/blob/'+ref+'/';
const read=p=>readFileSync(resolve(root,p),'utf8').replace(/\r\n/g,'\n');
const source=(p,line=1)=>base+p+'#L'+line;
const stable=s=>createHash('sha256').update(s).digest('hex').slice(0,18);
const nodes=[],edges=[],patches=[];
const seed=JSON.parse(readFileSync(new URL('./study-spatial-seed.json',import.meta.url),'utf8'));
function node(id,plane,kind,title,feature,extra={}){const n={id,plane,kind,title,feature,description:'',owner:'',followup:'',status:'구현',introduced:'2026-10-18',planned:'',implemented:'',deployed:'',parentId:'',evidence:'code',codeRef:ref,source:'',version:0,history:[],...extra};nodes.push(n);return n;}
function edge(from,to,title,relation,path,line=1,evidence='code'){const e={id:'structure-'+stable([from,to,relation].join(':')),from,to,title,relation,evidence,feature:nodes.find(n=>n.id===from)?.feature||seed.spatial.nodes.find(n=>n.id===from)?.feature||'공통 구조',description:evidence==='code'?'확인한 코드 스냅샷의 연결입니다. 실제 운영 호출 기록은 아닙니다.':'기획·구현 대응 관계의 검토 초안입니다.',source:path?source(path,line):'',codeRef:ref,status:evidence==='code'?'구현':'확인 필요',introduced:'2026-10-18',owner:'',followup:'',version:0,history:[]};if(!edges.some(x=>x.id===e.id))edges.push(e);}
const featureOf=s=>/plan|input|material/i.test(s)?'계획·자료':/review|stop/i.test(s)?'정리·종료':/feedback/i.test(s)?'피드백':/event|record|candidate|insight/i.test(s)?'기록·상태':/strategy|intervention/i.test(s)?'진단·제안':/session|learning/i.test(s)?'학습 시작':'공통 구조';
const fileId=p=>'file-'+stable(p);
function addFile(p){let n=nodes.find(n=>n.id===fileId(p));if(n)return n;if(!existsSync(resolve(root,p)))return null;n=node(fileId(p),'backend','file',p.split('/').at(-1),featureOf(p),{filePath:p,source:source(p),description:'코드 파일 · '+p});return n;}
const tracked=['src/pilot/ui.ts','src/pilot/mcp.ts','src/pilot/service.ts','src/pilot/data-api.ts','src/pilot/study-input.ts','src/pilot/contracts.ts','src/pilot/intervention-policy.ts','src/supabase/studymeta-api.ts','src/services/default-services.ts','src/mcp/server.ts','src/mcp/http-handler.ts'];
for(const p of tracked){addFile(p);const content=read(p);for(const m of content.matchAll(/from\s+["'](\.[^"']+)["']/g)){const resolved=resolve(dirname(resolve(root,p)),m[1].replace(/\.js$/,'.ts'));const target=relative(root,resolved).replaceAll('\\','/');if(addFile(target))edge(fileId(p),fileId(target),'import','imports',p,content.slice(0,m.index).split('\n').length);}}
const service=read('src/pilot/service.ts').split('export class Unavailable')[0],repo=read('src/pilot/data-api.ts');
function methods(content){const matches=[...content.matchAll(/^  (?:async )?([a-zA-Z]\w*)\([^\n]*/gm)];return matches.map((m,i)=>({name:m[1],line:content.slice(0,m.index).split('\n').length,text:content.slice(m.index,matches[i+1]?.index||content.length)})).filter(x=>x.name!=='constructor');}
const serviceMethods=methods(service).filter(m=>!['unavailable'].includes(m.name)),repoMethods=methods(repo).filter(m=>!['constructor'].includes(m.name));
const symbolId=(file,symbol)=>'fn-'+stable(file+':'+symbol);
function addMethod(m,file,klass){const id=symbolId(file,m.name);if(nodes.some(n=>n.id===id))return id;node(id,'backend','function',klass+'.'+m.name+'()',featureOf(m.name),{parentId:fileId(file),filePath:file,symbol:klass+'.'+m.name,source:source(file,m.line),codeExcerpt:m.text.trim().slice(0,5000),description:'소속 파일: '+file});return id;}
for(const m of serviceMethods)addMethod(m,'src/pilot/service.ts','PilotService');
for(const m of repoMethods)addMethod(m,'src/pilot/data-api.ts','PilotDataApi');
for(const m of serviceMethods){for(const call of m.text.matchAll(/this\.repository\.(\w+)\(/g)){if(repoMethods.some(r=>r.name===call[1]))edge(symbolId('src/pilot/service.ts',m.name),symbolId('src/pilot/data-api.ts',call[1]),'저장소 호출','calls','src/pilot/service.ts',m.line);}}
const sqlFiles=readdirSync(resolve(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
for(const m of repoMethods){for(const call of m.text.matchAll(/this\.call(?:Single|Many)?(?:<[^>]+>)?\(\s*"([a-z_]+)"/g)){const rpc=call[1],id='rpc-'+rpc;let declaration=null;for(const f of sqlFiles){const p='supabase/migrations/'+f,c=read(p),re=new RegExp('create\\s+(?:or\\s+replace\\s+)?function\\s+studymeta_api\\.'+rpc+'\\s*\\(','i'),found=re.exec(c);if(found)declaration={p,c,start:found.index,line:c.slice(0,found.index).split('\n').length};}
 if(!nodes.some(n=>n.id===id)){const extra=declaration?{filePath:declaration.p,source:source(declaration.p,declaration.line),codeExcerpt:declaration.c.slice(declaration.start,(declaration.c.indexOf('$;',declaration.start)<0?declaration.start+5000:declaration.c.indexOf('$;',declaration.start)+3)).slice(0,5000)}:{source:source('src/pilot/data-api.ts',m.line),evidence:'unverified'};node(id,'backend','rpc','studymeta_api.'+rpc,featureOf(rpc),{symbol:rpc,...extra});if(declaration){addFile(declaration.p);nodes.find(n=>n.id===id).parentId=fileId(declaration.p);const body=declaration.c.slice(declaration.start,declaration.c.indexOf('$$;',declaration.start)+3);for(const table of body.matchAll(/(?:from|join|into|update)\s+(studymeta_(?:private|v2)\.[a-z_]+)/gi)){const tid='table-'+stable(table[1]);if(!nodes.some(n=>n.id===tid))node(tid,'backend','table',table[1],featureOf(table[1]),{symbol:table[1],source:source(declaration.p,declaration.line),description:'SQL 본문에서 직접 참조하는 테이블입니다.'});edge(id,tid,'SQL 테이블 참조','persists',declaration.p,declaration.line);}}}
 edge(symbolId('src/pilot/data-api.ts',m.name),id,'RPC 요청','calls','src/pilot/data-api.ts',m.line);
}}
const mcp=read('src/pilot/mcp.ts'),registrations=[...mcp.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)];
for(let i=0;i<registrations.length;i++){const m=registrations[i],block=mcp.slice(m.index,registrations[i+1]?.index||mcp.length),line=mcp.slice(0,m.index).split('\n').length,id='mcp-'+m[1];if(!seed.spatial.nodes.some(n=>n.id===id))continue;patches.push({id,fields:{kind:'tool',toolName:m[1],filePath:'src/pilot/mcp.ts',symbol:m[1],codeRef:ref,codeExcerpt:block.slice(0,5000),evidence:'code',source:source('src/pilot/mcp.ts',line)}});for(const call of block.matchAll(/services\.pilotService\.(\w+)\(/g)){if(serviceMethods.some(m=>m.name===call[1]))edge(id,symbolId('src/pilot/service.ts',call[1]),'핸들러 호출','calls','src/pilot/mcp.ts',line);}}
const screens=[['m01','홈','진입·화면'],['free_study','자유 학습 시작','학습 시작'],['my_plans','내 Plan','계획·자료'],['plan_detail','Plan 상세','계획·자료'],['plan_input','과목·범위 입력','계획·자료'],['plan_date','시험일 입력','계획·자료'],['plan_material','자료 선택','계획·자료'],['plan_building','Plan 분석 중','계획·자료'],['plan_structure','Plan 구조','계획·자료'],['learning_scope','학습 범위 선택','학습 시작'],['learning_active','학습 진행 카드','학습 시작'],['material_add','학습 자료 추가','계획·자료'],['material_analyzing','자료 분석 중','계획·자료'],['material_updated','자료 반영 결과','계획·자료'],['stop_confirm','학습 종료 확인','정리·종료'],['review_summary','정리 요약','정리·종료'],['review_full','정리 전체','정리·종료'],['review_evidence','정리 근거','정리·종료'],['notes','정리노트','정리·종료'],['my_info','내 정보','진단·제안']];
const ui=read('src/pilot/ui.ts'),uiLine=token=>ui.slice(0,Math.max(0,ui.indexOf(token))).split('\n').length;
for(const [screen,title,feature] of screens){node('screen-'+screen,'ux','screen',title,feature,{uiScreen:screen,filePath:'src/pilot/ui.ts',source:source('src/pilot/ui.ts',uiLine('function render(')),description:'실제 파일럿 UI 코드의 '+screen+' 화면. 미리보기는 가상 데이터로 실행합니다.'});const idea=seed.spatial.nodes.find(n=>n.plane==='idea'&&n.feature===feature);if(idea)edge(idea.id,'screen-'+screen,'경험으로 구체화','implements','src/pilot/ui.ts',uiLine('function render('),'draft')}
const actions=[
 ['start-free','free_study','자유 학습 시작','[data-start-free]','startSession','start_study_session','learning_active'],
 ['start-plan','learning_scope','선택 범위 학습 시작','[data-start-session]','startSession','start_study_session','learning_active'],
 ['goal','learning_active','목표 변경','[data-update-goal]','data-update-goal','update_study_session_goal','learning_active'],
 ['records','learning_active','기록 확인','[data-refresh-session]','refreshSession','get_study_session_context','learning_active'],
 ['question','learning_active','질문 이어받기','[data-first-question]','sendFirstQuestion','get_study_session_context','learning_active'],
 ['review','learning_active','정리하기','[data-review]','beginReview','get_study_session_context','review_summary'],
 ['stop','stop_confirm','여기서 중단하기','[data-stop]','stopSession','stop_or_change_study','stop_confirm'],
 ['plan-send','plan_material','자료 전달·분석 요청','[data-create-plan]','prepareInput','prepare_study_input','plan_building'],
 ['material-send','material_add','추가 자료 분석 요청','[data-start-material]','prepareInput','prepare_study_input','material_analyzing'],
 ['cancel','plan_building','분석 요청 취소','[data-cancel-input]','cancelInput','cancel_study_input','plan_material'],
 ['retry','learning_active','대기 기록 처리 재시도','[data-retry-events]','data-retry-events','retry_study_event_processing','learning_active']
];
for(const [id,screen,title,selector,fn,tool,next] of actions){const parent=nodes.find(n=>n.id==='screen-'+screen);node('button-'+id,'ux','button',title,parent.feature,{parentId:parent.id,uiScreen:screen,uiSelector:selector,toolName:tool,filePath:'src/pilot/ui.ts',symbol:fn,source:source('src/pilot/ui.ts',uiLine(fn)),description:'UI 이벤트 → '+tool+'. 결과 상태와 대화 요청은 실제 UI 코드에서 확인합니다.'});edge(parent.id,'button-'+id,'화면의 버튼','contains','src/pilot/ui.ts',uiLine(fn));edge('button-'+id,'mcp-'+tool,'버튼의 도구 호출','calls','src/pilot/ui.ts',uiLine(fn));edge('button-'+id,'screen-'+next,'응답 후 화면','navigates','src/pilot/ui.ts',uiLine(fn));}
const transitions=[['m01','free_study','학습하기'],['m01','my_plans','내 Plan'],['m01','notes','정리노트'],['m01','my_info','내 정보'],['my_plans','plan_input','새로운 Plan 추가'],['plan_input','plan_date','다음'],['plan_date','plan_material','다음'],['learning_active','material_add','자료 추가'],['learning_active','stop_confirm','학습 중단 / 변경']];
for(const [from,to,label] of transitions)edge('screen-'+from,'screen-'+to,label,'navigates','src/pilot/ui.ts',uiLine('function render('));
for(const n of seed.spatial.nodes.filter(n=>n.plane==='idea'))patches.push({id:n.id,fields:{kind:'goal',evidence:'draft'}});
const goalBreakdown={
 '진입·화면':[['현재 할 수 있는 행동 찾기','m01'],['등록한 Plan 확인하기','my_plans']],
 '학습 시작':[['계획 없이도 바로 시작하기','free_study'],['학습 중 목표를 조정하기','learning_active']],
 '계획·자료':[['과목·범위·날짜를 나눠 입력하기','plan_input'],['자료를 전달하고 분석 결과 확인하기','plan_material']],
 '정리·종료':[['기록을 근거로 정리하기','review_summary'],['학습 중단·변경을 명시하기','stop_confirm']],
 '기록·상태':[['학습 도중 저장된 기록 확인하기','learning_active'],['처리 대기 기록 재시도하기','learning_active']],
 '진단·제안':[['내 학습 맥락 확인하기','my_info']],
 '피드백':[['현재 화면에서 개선 의견 남기기','m01']]
};
for(const goal of seed.spatial.nodes.filter(n=>n.plane==='idea'))for(const [title,screen] of goalBreakdown[goal.feature]||[]){const id='idea-detail-'+stable(title);node(id,'idea','idea',title,goal.feature,{parentId:goal.id,status:'확인 필요',evidence:'draft',codeRef:'',description:'현재 기능에서 정리한 기획 분해 초안입니다. 팀이 목표와 범위를 조정해주세요.',source:'작업판 구조 정리 · 2026-10-18'});edge(goal.id,id,'목표 분해','contains',null,1,'draft');edge(id,'screen-'+screen,'화면으로 구체화','implements','src/pilot/ui.ts',uiLine('function render('),'draft');}
for(const [id,screen,title,selector,fn] of actions){const fid='ui-fn-'+stable(fn);if(!nodes.some(n=>n.id===fid))node(fid,'backend','function','UI · '+fn,featureOf(fn),{parentId:fileId('src/pilot/ui.ts'),filePath:'src/pilot/ui.ts',symbol:fn,source:source('src/pilot/ui.ts',uiLine(fn)),description:'버튼 이벤트를 처리하는 UI 함수 또는 이벤트 선택자입니다.'});edge('button-'+id,fid,'UI 이벤트 처리','calls','src/pilot/ui.ts',uiLine(fn));}
for(const [id,title,button,tool] of [['analysis','AI에게 자료 분석 요청','plan-send','save_study_plan'],['review','AI에게 기록 기반 정리 요청','review','save_study_review'],['question','AI에게 다음 질문 요청','question',null]]){const mid='chat-'+id;node(mid,'mcp','message',title,featureOf(id),{description:'UI가 후속 채팅 메시지를 전달합니다. AI가 맥락을 읽고 필요한 도구를 선택하는 단계입니다.',filePath:'src/pilot/ui.ts',source:source('src/pilot/ui.ts',uiLine('sendFollowUpMessage'))});edge('button-'+button,mid,'후속 채팅 요청','message','src/pilot/ui.ts',uiLine('sendFollowUpMessage'));if(tool&&seed.spatial.nodes.some(n=>n.id==='mcp-'+tool))edge(mid,'mcp-'+tool,'AI가 맥락에 따라 호출 · 검토 필요','suggests',null,1,'draft');}
// Topological ordering lets imports preserve validated parent relationships in each batch.
nodes.sort((a,b)=>(a.parentId?1:0)-(b.parentId?1:0));
const manifest={version:1,codeRef:ref,generatedAt:new Date().toISOString(),nodes,edges,patches};
writeFileSync(new URL('./structure-snapshot.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
// Only the synthetic fixture and the actual UI HTML are copied, never credentials or production data.
let preview=read('public/pilot-ui-preview.html');
preview=preview.replace('"m01","my_plans"','"free_study","plan_date","plan_material","m01","my_plans"');
preview=preview.replace('if(parent===window){render(current);return}','if(window.__WORKBOARD_PREVIEW__||parent===window){render(current);return}');
preview=preview.replace('function render(screen){current=screen||current;','function render(screen){current=screen||current;window.__atlasScreen?.(current);');
preview=preview.replace('<meta charset="utf-8">','<script src="./product-preview-bridge.js"></script><meta charset="utf-8">');
writeFileSync(new URL('./product-ui-preview.html',import.meta.url),preview);
console.log(JSON.stringify({codeRef:ref,nodes:nodes.length,edges:edges.length,patches:patches.length}));
