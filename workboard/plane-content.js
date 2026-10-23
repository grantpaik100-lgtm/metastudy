import {evidenceLabel} from './trace-graph.js';
export const names={idea:'기획·아이디어',ux:'UI/UX',mcp:'MCP',backend:'백엔드'};
export const colors={idea:'#7760b5',ux:'#2563eb',mcp:'#168f86',backend:'#b87c36'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={goal:'큰 목표',idea:'아이디어',screen:'화면',button:'버튼',tool:'도구',file:'파일',function:'함수',rpc:'DB 함수',table:'테이블'};
export function planeContent(plane,{nodes,edges,allNodes,selected,previewScreen='free_study'}){
 const ns=nodes.filter(n=>n.plane===plane),byId=new Map(allNodes.map(n=>[n.id,n]));
 const card=(n,compact=false)=>`<button type="button" class="structure-node ${compact?'compact':''}" data-select="${esc(n.id)}" data-anchor="${esc(n.id)}" aria-pressed="${n.id===selected}" style="--plane-color:${colors[plane]}"><small>${kinds[n.kind]||'구조 항목'} · ${n.evidence==='code'?'코드 확인':'검토 초안'}</small><strong>${esc(n.title)}</strong>${!compact&&n.description?`<span>${esc(n.description.slice(0,130))}</span>`:''}${n.toolName?`<code>${esc(n.toolName)}</code>`:''}${n.filePath?`<code>${esc(n.filePath)}</code>`:''}</button>`;
 const outgoing=n=>edges.filter(e=>e.from===n.id&&byId.get(e.to)?.plane===plane);
 const relations=n=>outgoing(n).map(e=>`<button class="structure-transition" data-select="${esc(e.id)}">${esc(e.title)} → ${esc(byId.get(e.to)?.title)}</button>`).join('');
 const hierarchy=(n,seen=new Set())=>{if(seen.has(n.id))return '';const next=new Set(seen).add(n.id);return `<li>${card(n)}${ns.some(c=>c.parentId===n.id)?`<ul>${ns.filter(c=>c.parentId===n.id).map(c=>hierarchy(c,next)).join('')}</ul>`:''}${relations(n)}</li>`;};
 if(plane==='idea')return `<div class="plane-intro">문제에서 목표로, 목표에서 기능으로</div><ul class="idea-tree">${ns.filter(n=>!ns.some(p=>p.id===n.parentId)).map(n=>hierarchy(n)).join('')}</ul>${ns.length?'':'<p class="plane-empty">선택한 범위에 기획 항목이 없어요.</p>'}`;
 if(plane==='ux'){
   const screens=ns.filter(n=>n.kind==='screen'),legacy=ns.filter(n=>!n.kind),screenList=allNodes.filter(n=>n.plane==='ux'&&n.kind==='screen');
   return `<div class="plane-intro">실제 UI 코드 미리보기 · 가상 데이터 · 학습 DB 저장 없음</div><div class="live-preview"><label>미리볼 화면<select data-preview-screen aria-label="미리볼 UI 화면">${screenList.map(n=>`<option value="${esc(n.uiScreen)}" ${previewScreen===n.uiScreen?'selected':''}>${esc(n.title)}</option>`).join('')}</select></label><iframe class="product-preview" title="StudyMeta 실제 UI 미리보기" src="./product-ui-preview.html?screen=${encodeURIComponent(previewScreen)}" sandbox="allow-scripts allow-same-origin"></iframe><div class="preview-live" aria-live="polite">버튼을 누르면 해당 MCP·코드 연결을 강조해요.</div></div><h3 class="structure-heading">화면과 버튼의 흐름</h3><div class="screen-flow">${screens.map(n=>`<article class="screen-structure">${card(n)}<div class="screen-actions">${ns.filter(b=>b.parentId===n.id).map(b=>card(b,true)+relations(b)).join('')}</div>${relations(n)}</article>`).join('')}</div>${legacy.length?`<details class="legacy-structure"><summary>이전 와이어프레임 · 검토 초안 ${legacy.length}</summary>${legacy.map(n=>card(n)).join('')}</details>`:''}`;
 }
 if(plane==='mcp')return `<div class="plane-intro">UI 또는 대화 → 도구 요청 → 코드 처리 → 응답</div><div class="mcp-lanes"><span>요청</span><span>도구</span><span>응답</span></div>${ns.map(n=>{const incoming=edges.filter(e=>e.to===n.id&&byId.get(e.from)?.plane==='ux');const handlers=edges.filter(e=>e.from===n.id&&e.relation==='calls');return `<article class="tool-flow"><div class="tool-in">${incoming.length?incoming.map(e=>`<button data-select="${esc(e.from)}">${esc(byId.get(e.from)?.title)}</button>`).join(''):'<span>채팅 · AI 도구 호출</span>'}<span aria-hidden="true">↓</span></div>${card(n)}<div class="tool-out">${handlers.map(e=>`<button data-select="${esc(e.to)}">${esc(byId.get(e.to)?.title)} → 반환</button>`).join('')}<small>성공 결과 또는 오류가 호출한 UI·AI로 돌아갑니다.</small></div></article>`;}).join('')}`;
 const fileNodes=ns.filter(n=>n.kind==='file');
 const includedFiles=new Map(fileNodes.map(n=>[n.id,n]));for(const n of ns)if(n.parentId&&byId.get(n.parentId)?.kind==='file')includedFiles.set(n.parentId,byId.get(n.parentId));
 const fileBlocks=[...includedFiles.values()].sort((a,b)=>a.filePath.localeCompare(b.filePath)).map(n=>`<details class="code-file" open><summary>${esc(n.filePath)}</summary>${card(n)}<div class="code-members">${ns.filter(c=>c.parentId===n.id).map(c=>card(c,true)+relations(c)).join('')}</div>${relations(n)}</details>`).join('');
 return `<div class="plane-intro">파일 → 함수 → RPC → 테이블 · 소스 스냅샷 기준</div><div class="code-tree">${fileBlocks}${ns.filter(n=>n.kind!=='file'&&!includedFiles.has(n.parentId)).map(n=>card(n)+relations(n)).join('')}</div>${ns.length?'':'<p class="plane-empty">선택한 범위에 코드 항목이 없어요.</p>'}`;
}

// Each surface has its own grammar; anchors always belong to real graph elements.
export function mapContent(plane,{nodes,edges,allNodes,selected,previewScreen}) {
 const ns=nodes.filter(n=>n.plane===plane), byId=new Map(allNodes.map(n=>[n.id,n]));
 const card=n=>`<button class="map-node ${n.evidence==='code'?'verified':'unverified'}" data-anchor="${esc(n.id)}" data-select="${esc(n.id)}" aria-pressed="${selected===n.id}"><span class="node-kind">${kinds[n.kind]||'항목'} <i>${evidenceLabel(n)}</i></span><strong>${esc(n.title)}</strong>${n.plane==='idea'?`<span>${esc(n.description)}</span>`:''}${n.toolName?`<code>${esc(n.toolName)}</code>`:''}<small>${esc(n.owner||'담당 미정')}${n.implemented?' · 구현 '+esc(n.implemented):''}${n.followup?' · 후속 과제 있음':''}</small></button>`;
 const empty=`<div class="map-gap"><strong>연결된 ${names[plane]} 항목이 없어요</strong><p>아직 구현하지 않았거나, 구현 관계를 기록하지 않은 부분입니다.</p><small>실제 구현 여부를 확인한 뒤 노드와 연결을 추가하세요.</small></div>`;
 if(!ns.length)return empty;
 if(plane==='idea') {
   const tree=(n,seen=new Set())=>seen.has(n.id)?'':`<li>${card(n)}${ns.some(c=>c.parentId===n.id)?`<ul>${ns.filter(c=>c.parentId===n.id).map(c=>tree(c,new Set(seen).add(n.id))).join('')}</ul>`:''}</li>`;
   return `<p class="map-intro">왜 만들었나 · 목표와 세부 아이디어</p><ul class="idea-tree">${ns.filter(n=>!ns.some(p=>p.id===n.parentId)).map(n=>tree(n)).join('')}</ul>`;
 }
 if(plane==='ux') {
   const screens=ns.filter(n=>n.kind==='screen');
   const screen=screens.find(n=>n.uiScreen===previewScreen)||screens.find(n=>ns.some(b=>b.parentId===n.id&&b.kind==='button'))||screens[0];
   const buttons=ns.filter(n=>n.kind==='button');
   const options=screens.map(n=>`<option value="${esc(n.uiScreen)}" ${n.id===screen?.id?'selected':''}>${esc(n.title)}</option>`).join('');
   return `<p class="map-intro">어디서 쓰나 · 실제 UI 코드의 화면과 버튼</p>${screen?`<div class="map-screen" data-screen-anchor="${esc(screen.id)}"><label>화면 보기<select data-preview-screen aria-label="지도에서 볼 실제 화면">${options}</select></label><div class="preview-shell"><iframe class="product-preview map-preview" data-screen="${esc(screen.uiScreen)}" title="구현 지도 실제 화면" src="./product-ui-preview.html?screen=${encodeURIComponent(screen.uiScreen)}&inspect=1" sandbox="allow-scripts allow-same-origin"></iframe></div><p class="preview-live" aria-live="polite">실제 버튼을 선택하면 구현 경로를 강조해요.</p></div>`:''}<div class="screen-destinations">${screens.filter(n=>n.id!==screen?.id).map(n=>`<button data-show-screen="${esc(n.uiScreen)}" data-anchor="${esc(n.id)}" data-select="${esc(n.id)}"><small>연결된 화면</small>${esc(n.title)} ↗</button>`).join('')}</div><div class="button-fallbacks">${buttons.map(n=>`<button data-button-fallback="${esc(n.id)}" data-show-screen="${esc(n.uiScreen)}" data-select="${esc(n.id)}"><small>화면에서 찾기</small>${esc(n.title)}</button>`).join('')}</div>${ns.filter(n=>!n.kind).map(card).join('')}<small class="preview-note">가상 데이터로 표시합니다. 지도에서는 버튼 실행 없이 연결을 확인해요. 실제 흐름 체험은 UI/UX 공간에서 할 수 있어요.</small>`;
 }
 if(plane==='mcp')return `<p class="map-intro">무엇을 주고받나 · 요청과 결과</p>${ns.map(n=>{
   const input=/inputSchema:\s*([\w.]+)/.exec(n.codeExcerpt||'')?.[1],output=/outputSchema:\s*([\w.]+)/.exec(n.codeExcerpt||'')?.[1];
   return `<article class="map-tool"><div class="io-note"><b>요청 ↓</b><code>${esc(input||'요청 형식 · 소스에서 확인')}</code></div>${card(n)}<div class="io-note"><b>↑ 결과</b><code>${esc(output||'응답 형식 · 소스에서 확인')}</code></div></article>`;
 }).join('')}`;
 const files=new Map();for(const n of ns){if(n.kind==='file')files.set(n.id,n);else if(byId.get(n.parentId)?.kind==='file')files.set(n.parentId,byId.get(n.parentId));}
 return `<p class="map-intro">어디서 처리하나 · 파일 안의 함수와 데이터 관계</p><div class="map-code-files">${[...files.values()].map(f=>`<section class="map-code-file"><button class="file-anchor" data-anchor="${esc(f.id)}" data-select="${esc(f.id)}"><span>파일</span><code>${esc(f.filePath||f.title)}</code></button>${ns.filter(n=>n.parentId===f.id).map(card).join('')}</section>`).join('')}</div><div class="map-tables">${ns.filter(n=>n.kind!=='file'&&!files.has(n.parentId)).map(card).join('')}</div>`;
}
