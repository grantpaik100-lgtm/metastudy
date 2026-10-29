// 확인한 와이어프레임과 파일럿 코드의 연결 초안. 운영 상태·최초 기획일·담당자를 추정하지 않는다.
import {readFileSync,writeFileSync} from 'node:fs';
const board=JSON.parse(readFileSync(new URL('./study-project-2026-09-27.json',import.meta.url),'utf8'));
const base='https://github.com/grantpaik100-lgtm/studymeta-backend/blob/33787a1/';
const pr='https://github.com/grantpaik100-lgtm/studymeta-backend/pull/9';
const nodes=[],edges=[];
const features=['계획·자료','학습 시작','기록·상태','정리·종료','진단·제안','피드백','진입·화면'];
const concepts=[
 ['계획·자료','자료를 학습 구조로','강의·시험 범위와 선택 자료를 단원·개념으로 구조화합니다. 기존 자료와 학습 흔적을 유지하며 추가 자료를 연결합니다.','스캔 PDF와 다른 파일 형식의 지원 범위를 결정하기'],
 ['학습 시작','계획 없이도 바로 공부','계획의 범위를 선택하거나 자유 학습을 시작합니다. 오늘 목표는 선택이며 도중에 변경할 수 있습니다.','실제 호스트에서 첫 질문과 현재 범위가 일치하는지 검수하기'],
 ['기록·상태','관찰에서 근거로','Raw observation → Event → Evidence → State. 근거가 없는 상태는 유지하고 연구용 후보와 검증된 상태를 구분합니다.','원시 기록 없음과 판단 보류를 실제 사용자가 구별하는지 확인하기'],
 ['정리·종료','공부한 내용을 구조화','해당 세션의 저장된 기록을 기반으로 정리합니다. 종료 후에도 기록과 정리를 조회할 수 있습니다.','정리의 각 문장이 실제 기록과 연결되는지 검수하기'],
 ['진단·제안','근거 있는 다음 행동','학습 기록을 바탕으로 다음 학습을 제안합니다. 검증 전 후보를 공식 상태로 승격하지 않습니다.','모델별 관찰 정확도와 제안 품질 비교하기'],
 ['피드백','사용 경험을 개선으로','화면 맥락과 사용자의 피드백을 기록하고 개선 작업으로 연결합니다.','운영 피드백의 담당자·해결 상태를 연결하기'],
 ['진입·화면','대화와 화면을 연결','하나의 위젯에서 화면을 전환하고 필요한 시점에 대화를 이어갑니다.','작은 창 표시와 실제 클라이언트 호환성 확인하기']
];
function node(id,plane,feature,title,description,source,introduced='2026-09-28',extra={}){
 const n={id,plane,feature,title,description,source,introduced,planned:'',implemented:plane==='idea'?'':introduced,deployed:'',owner:'',followup:'담당자와 운영 반영 여부를 확인해주세요.',status:plane==='idea'?'기획':'구현',parentId:'',version:0,history:[],...extra};nodes.push(n);return n;
}
function edge(from,to,title,description='',source=base+'docs/ui-implementation-map.md',introduced='2026-09-28'){
 introduced=[introduced,nodes.find(n=>n.id===from)?.introduced||'',nodes.find(n=>n.id===to)?.introduced||''].sort().at(-1);
 edges.push({id:'e-'+edges.length,from,to,title,description,source,introduced,planned:'',implemented:'',deployed:'',owner:'',followup:'연결 의미와 담당자를 검토해주세요.',status:'확인 필요',feature:nodes.find(n=>n.id===from)?.feature||'기타',version:0,history:[]});
}
for(const [feature,title,description,followup] of concepts) node('idea-'+features.indexOf(feature),'idea',feature,title,description,base+'docs/phase2-goal-tree.md',feature==='학습 시작'?'2026-10-17':'2026-09-28',{followup});
const screenFeature=id=>/plan|p02|p03|bd1|a01|a02|a03/.test(id)?features[0]:/l01|l02/.test(id)?features[1]:/evidence/.test(id)?features[2]:/s01|s02|stop|notes/.test(id)?features[3]:/info/.test(id)?features[4]:features[6];
for(const screen of board.screens){const feature=screenFeature(screen.id);node('ux-'+screen.id,'ux',feature,screen.title,screen.purpose+'\n\n'+screen.sections,'원본: workboard-project (5).json · 2026-09-27 저장본','2026-09-27',{implemented:'',status:'기획',owner:screen.author||'',screenId:screen.id,followup:'9월 와이어프레임입니다. 최신 파일럿 UI와 차이를 검수해주세요.'});edge('idea-'+features.indexOf(feature),'ux-'+screen.id,'경험으로 구체화','기획과 화면의 관계를 사람이 검토한 초안입니다.');}
node('ux-free','ux',features[1],'자유 학습 · 오늘 목표','Plan 없이 시작하고 목표를 변경합니다. 시작 후 첫 질문 요청과 질문 이어받기를 지원합니다.',pr,'2026-10-17');
node('ux-record','ux',features[2],'기록 확인 · 처리 재시도','서버의 실제 저장 건수와 처리 대기 기록을 조회합니다.',pr,'2026-10-17');
node('ux-feedback','ux',features[5],'피드백 입력','텍스트·음성 피드백. 10,000자와 재시도 중복 방지 개선은 PR #9에 있습니다.',pr,'2026-09-28');
node('ux-cancel','ux',features[0],'분석 취소 · 입력으로','요청 취소와 단순 화면 이동을 구분하고 초안을 유지합니다.',pr,'2026-10-17');
const tools=[
 ['prepare_study_input','자료 제출',0,true,'UI 전용: 파일 본문과 폼 입력을 서버에 준비합니다.'],
 ['get_study_input_context','제출 자료 조회',0,true,'모델이 제출된 필드와 추출 본문을 조회합니다.'],
 ['cancel_study_input','분석 요청 취소',0,true,'UI 전용: 취소된 요청의 뒤늦은 저장을 차단합니다.'],
 ['get_study_session_context','현재 학습 조회',1,true,'세션·목표·선택 범위·실제 기록 건수의 기준입니다.'],
 ['update_study_session_goal','오늘 목표 변경',1,true,'목표와 변경 이력을 저장합니다.'],
 ['retry_study_event_processing','기록 처리 재시도',2,true,'원시 Event를 중복 저장하지 않고 후속 처리를 재시도합니다.'],
 ['delete_study_plan','Plan 삭제',0,false,'명시적 요청에 따라 관련 계획과 데이터를 삭제하는 도구입니다.'],
 ['get_my_study_strategy','학습 근거·제안 조회',4,false,'세션 근거와 후보 결과를 조회합니다. 진단과 정리용 응답을 구분합니다.'],
 ['get_study_plan_context','Plan·자료 조회',0,false,'저장된 계획과 자료 맥락을 조회합니다.'],
 ['start_studymeta','StudyMeta 진입',6,false,'사용자 맥락을 조회하고 기본 화면으로 진입합니다.'],
 ['render_studymeta_screen','학습 화면 표시',6,false,'의미 있는 화면 전환 시 카드를 표시합니다.'],
 ['save_study_plan','Plan 저장',0,false,'분석된 단원·개념 구조와 자료 연결을 저장합니다.'],
 ['add_study_material_analysis','자료 분석 병합',0,false,'기존 개념과 학습 흔적을 유지하며 추가 분석을 병합합니다.'],
 ['start_study_session','학습 세션 시작',1,false,'계획 기반 또는 자유 학습 세션을 시작합니다.'],
 ['record_study_event','학습 관찰 기록',2,false,'실제 관찰을 기록하고 Evidence와 연구용 후보 처리를 이어갑니다.'],
 ['stop_or_change_study','학습 종료·전환',3,false,'학습 중단과 정리 전환을 처리합니다.'],
 ['save_study_review','학습 정리 저장',3,false,'해당 세션에 저장된 기록을 근거로 정리를 저장합니다.'],
 ['submit_pilot_feedback','피드백 저장',5,false,'인증된 사용자의 피드백과 선택 맥락을 저장합니다.']
];
for(const [id,title,f,fresh,description] of tools){node('mcp-'+id,'mcp',features[f],title,description+'\n\n도구: '+id,base+'src/pilot/mcp.ts',fresh?'2026-10-17':'2026-09-28');}
const backends=[
 ['input',0,'파일 본문 추출·임시 저장','PDF·UTF-8 TXT 추출, 24시간 조회 제한. 만료 행은 다음 입력 요청 때 정리합니다.','src/pilot/study-input.ts',true],
 ['plan',0,'Plan·자료 저장','Plan과 개념·자료를 저장합니다. 병합 SQL 오류와 중복 요청 처리는 PR #9에서 수정했습니다.','src/pilot/service.ts',false],
 ['session',1,'세션·목표·선택 범위','자유 학습, 목표 이력, 세션 범위와 시간 검증을 처리합니다.','supabase/migrations/202610170001_pilot_feedback_recovery.sql',true],
 ['event',2,'원시 기록·재처리 상태','파생 처리 오류와 원시 기록 저장을 분리합니다.','supabase/migrations/202610170001_pilot_feedback_recovery.sql',true],
 ['evidence',2,'Evidence·후보 조회','Event → Evidence → State 후보 ID 연결을 수정합니다. 공식 Learner Model은 변경하지 않습니다.','src/pilot/data-api.ts',false],
 ['review',3,'세션 정리·종료 저장','기록 기반 정리, 종료 후 조회와 중복 종료 처리를 지원합니다.','src/pilot/service.ts',false],
 ['strategy',4,'근거 기반 제안 정책','연구용 후보와 운영 가능한 제안을 구분합니다.','src/pilot/intervention-policy.ts',false],
 ['feedback',5,'피드백 저장·중복 방지','피드백 저장과 요청 키 중복 방지. 10,000자 확대는 PR #9입니다.','supabase/migrations/202610170003_pilot_feedback_length.sql',true],
 ['ui',6,'카드·호스트 연결','위젯 화면 상태, MCP 호스트 연결과 지원 가능한 작은 창 표시를 처리합니다.','src/pilot/ui.ts',false]
];
for(const [id,f,title,description,path,fresh] of backends) node('be-'+id,'backend',features[f],title,description,base+path,fresh?'2026-10-17':'2026-09-28');
const routes={prepare_study_input:'input',get_study_input_context:'input',cancel_study_input:'input',get_study_session_context:'session',update_study_session_goal:'session',retry_study_event_processing:'event',delete_study_plan:'plan',get_my_study_strategy:'strategy',get_study_plan_context:'plan',start_studymeta:'ui',render_studymeta_screen:'ui',save_study_plan:'plan',add_study_material_analysis:'plan',start_study_session:'session',record_study_event:'event',stop_or_change_study:'review',save_study_review:'review',submit_pilot_feedback:'feedback'};
const uxRoutes={prepare_study_input:'ux-bd1c12ea-f638-4c36-b768-77d6ee9cf0e9',get_study_input_context:'ux-baek-p02-plan-making',cancel_study_input:'ux-cancel',get_study_session_context:'ux-record',update_study_session_goal:'ux-free',retry_study_event_processing:'ux-record',delete_study_plan:'ux-baek-m02-plan-detail',get_my_study_strategy:'ux-baek-m-info-01',get_study_plan_context:'ux-baek-m-plan-01-select',start_studymeta:'ux-baek-m01-main',render_studymeta_screen:'ux-infra-i01-ui-rendering',save_study_plan:'ux-baek-p02-plan-making',add_study_material_analysis:'ux-baek-a02-material-analyze',start_study_session:'ux-baek-l01-study-range',record_study_event:'ux-baek-l02-active-study',stop_or_change_study:'ux-baek-mc02-stop-confirm',save_study_review:'ux-baek-s01-review-summary',submit_pilot_feedback:'ux-feedback'};
for(const [id,,f,fresh] of tools){edge(uxRoutes[id],'mcp-'+id,'관련 도구','해당 사용자 흐름에서 쓰이는 도구입니다. 모든 연결이 버튼의 직접 호출을 뜻하지는 않습니다.',base+'src/pilot/mcp.ts',fresh?'2026-10-17':'2026-09-28');edge('mcp-'+id,'be-'+routes[id],'처리 위임','도구와 구현 책임의 대응입니다. 원문 코드를 근거로 세부 호출을 검토할 수 있습니다.',base+'src/pilot/service.ts',fresh?'2026-10-17':'2026-09-28');}
for(const n of nodes.filter(n=>['ux-free','ux-record','ux-feedback','ux-cancel'].includes(n.id)))edge('idea-'+features.indexOf(n.feature),n.id,'경험으로 구체화','피드백 수정본의 사용자 경험입니다.',pr,n.introduced);
edge('be-event','be-evidence','근거로 연결','관찰 기록에서 Evidence를 거쳐 후보 판단으로 이어집니다. 원시 입력은 State를 직접 변경하지 않습니다.',pr,'2026-10-17');
edge('be-evidence','be-review','정리 근거 제공','후보 State가 없더라도 저장된 원시 기록은 정리 근거가 됩니다.',pr,'2026-10-17');
board.spatial={version:1,nodes,edges};
writeFileSync(new URL('./study-spatial-seed.json',import.meta.url),JSON.stringify(board,null,2)+'\n');
console.log(JSON.stringify({screens:board.screens.length,nodes:nodes.length,edges:edges.length}));
