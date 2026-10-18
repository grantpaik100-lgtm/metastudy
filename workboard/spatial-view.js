import {planeContent,mapContent,names,colors} from './plane-content.js';
import {coverage,evidenceLabel} from './trace-graph.js';
const planes=Object.keys(names),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NS='http://www.w3.org/2000/svg';
export function createSpatialView({stage,scene,getState,choose,traceFrom,openPlane}) {
 let signature='',previewScreen='free_study',active='idea',mode='3d',yaw=-3,zoom=1,panX=0,panY=0,drag=null,pending=false,lastRoot=null,scope='path',width=1520,height=1100,fitAll=false;
 scene.innerHTML='<div class="world"></div><svg class="spatial-lines" aria-label="요소 사이의 구현 관계"></svg>';
 const world=scene.querySelector('.world'),svg=scene.querySelector('svg');
 const nav=document.createElement('div');nav.className='trace-nav';stage.before(nav);
 const tabs=document.createElement('nav');tabs.className='plane-tabs';tabs.setAttribute('aria-label','분야별 상세 공간');tabs.innerHTML=planes.map(p=>`<button data-face="${p}" style="--plane-color:${colors[p]}">${names[p]} ↗</button>`).join('');stage.before(tabs);
 const path=document.createElement('div');path.className='selected-path';path.setAttribute('aria-label','선택 항목의 연결 경로');stage.after(path);
 function schedule(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;draw();});}}
 const observer=new ResizeObserver(()=>{if(mode!=='flat'){layout();lines();}});
 function state(){const s=getState();if(mode==='flat'||scope==='context'||!s.root)return s;const nodes=s.nodes.filter(n=>s.trace.has(n.id));const ids=new Set(nodes.map(n=>n.id));return {...s,nodes,edges:s.edges.filter(e=>s.trace.has(e.id)&&ids.has(e.from)&&ids.has(e.to))};}
 function draw(){
  const s=state(),root=s.allNodes.find(n=>n.id===s.root);
  if(lastRoot!==s.root){lastRoot=s.root;panX=panY=0;zoom=1;fitAll=false;if(mode!=='flat'){const button=s.nodes.find(n=>n.kind==='button'&&s.trace.has(n.id));previewScreen=button?.uiScreen||s.nodes.find(n=>n.kind==='screen')?.uiScreen||previewScreen;}}
  scene.classList.toggle('flat',mode==='flat');scene.classList.toggle('spread',mode==='spread');stage.classList.toggle('flat-stage',mode==='flat');document.body.classList.toggle('detail-mode',mode==='flat');
  document.body.classList.toggle('map-mode',mode!=='flat');
  const key=JSON.stringify([mode==='flat',s.nodes.map(n=>[n.id,n.version]),s.allNodes.filter(n=>s.nodes.some(c=>c.parentId===n.id)).map(n=>[n.id,n.version]),s.edges.map(e=>[e.id,e.version])]);
  if(key!==signature){signature=key;
   for(const p of planes){let face=world.querySelector(`[data-plane="${p}"]`);if(!face){face=document.createElement('section');face.className='face';face.dataset.plane=p;face.style.setProperty('--plane-color',colors[p]);face.innerHTML=`<header class="face-head"><div><small>${String(planes.indexOf(p)+1).padStart(2,'0')}</small><h3>${names[p]}</h3></div><button data-open-plane="${p}" aria-label="${names[p]} 상세 공간 열기">상세 ↗</button></header><div class="face-body"></div>`;world.append(face);observer.observe(face);}
    const body=face.querySelector('.face-body'),html=(mode==='flat'?planeContent:mapContent)(p,{...s,previewScreen});
    // Preserve the simulator and form contents during selection, polling and unrelated edits.
    const temp=document.createElement('div');temp.innerHTML=html;
    const old=body.querySelector('.product-preview'),next=temp.querySelector('.product-preview');
    const preserved=old?.closest('.live-preview,.map-screen');
    if(preserved&&next&&(mode==='flat'||old.getAttribute('src')===next.getAttribute('src'))){
      const incoming=next.closest('.live-preview,.map-screen');
      const select=preserved.querySelector('select');if(select)select.innerHTML=incoming.querySelector('select').innerHTML;
      for(const child of [...body.children])if(child!==preserved)child.remove();
      let before=true;for(const child of [...temp.children]){if(child===incoming){before=false;continue;}if(before)body.insertBefore(child,preserved);else body.append(child);}
    }else body.replaceChildren(...temp.childNodes);
    const frame=body.querySelector('.map-preview');if(frame)frame.addEventListener('load',()=>requestAnchors());
   }
  }
  for(const face of world.children)face.hidden=mode==='flat'&&face.dataset.plane!==active;
  world.querySelectorAll('[data-anchor]').forEach(el=>{el.setAttribute('aria-pressed',el.dataset.anchor===s.selected);el.classList.toggle('on-path',s.trace.has(el.dataset.anchor));});
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.face===active&&mode==='flat'));
  const ideas=s.allNodes.filter(n=>n.plane==='idea');
  // Do not replace a focused select while someone is using its native menu.
  const navHTML=`<label class="trace-chooser">기획에서 구현 따라가기<select aria-label="따라갈 기획" data-trace-root><option value="">기획 항목을 선택하세요</option>${ideas.map(n=>`<option value="${esc(n.id)}" ${n.id===s.root?'selected':''}>${n.parentId?'↳ ':''}${esc(n.title)}</option>`).join('')}</select></label><div class="trace-summary"><strong>${esc(root?.title||'항목을 골라 구현 관계를 확인하세요')}</strong><span>${s.nodes.length}개 요소 · ${s.edges.length}개 관계</span><div class="coverage">${coverage(s.nodes,s.edges).map(c=>`<span class="${c.missing?'missing':''}">${names[c.plane]} ${c.missing?'연결 미기록':c.verified?'코드 '+c.verified+'개':'근거 확인 필요'}</span>`).join('')}</div></div><button data-scope aria-pressed="${scope==='context'}">${scope==='context'?'주변 관계 함께 보기':'구현 경로만 보기'}</button>`;
  if(document.activeElement===nav.querySelector('[data-trace-root]')){const temp=document.createElement('div');temp.innerHTML=navHTML;nav.querySelector('.trace-summary')?.replaceWith(temp.querySelector('.trace-summary'));}else nav.innerHTML=navHTML;
  const selected=s.allNodes.find(n=>n.id===s.selected)||s.edges.find(e=>e.id===s.selected);
  const edges=s.edges.filter(e=>s.trace.has(e.id)||!s.root),byId=new Map(s.allNodes.map(n=>[n.id,n]));
  path.innerHTML=`<div class="relation-key"><span>━ 코드 확인</span><span>┄ 검토 초안 / 확인 필요</span><span>화살표: 기록된 관계 방향</span></div>${selected?`<div class="selected-context"><strong>${esc(selected.title)}</strong><span>${esc(selected.filePath||selected.description?.slice(0,130)||'')}</span><button data-retrace="${esc(selected.id)}">여기서부터 따라가기</button><button data-edit-details>담당자 · 날짜 · 근거 편집 ↓</button></div>`:''}<details class="all-paths" ${mode==='flat'?'open':''}><summary>관계 목록 ${edges.length}개 · 선이 겹치면 여기서 확인</summary><div class="path-edges">${edges.map(e=>`<div class="path-edge"><button data-jump="${esc(e.from)}">${esc(byId.get(e.from)?.title)}${byId.get(e.from)?.toolName?' · '+esc(byId.get(e.from).toolName):''}</button><button class="path-label" data-select="${esc(e.id)}">${esc(e.title)} → <small>${evidenceLabel(e)}</small></button><button data-jump="${esc(e.to)}">${esc(byId.get(e.to)?.title)}${byId.get(e.to)?.toolName?' · '+esc(byId.get(e.to).toolName):''}</button></div>`).join('')}</div></details><p>기획 대응은 팀 검토 초안입니다. 코드 확인은 기록된 소스 버전의 정적 관계이며, 운영 배포·실행을 뜻하지 않습니다. 연결이 없다고 미구현으로 단정하지 않습니다.</p>`;
  if(mode==='flat'){world.style.cssText='';stage.style.height='';}else layout();
  requestAnchors();lines();
 }
 function layout(){
  if(mode==='flat')return;
  const idea=world.querySelector('[data-plane=idea]'),ux=world.querySelector('[data-plane=ux]'),mcp=world.querySelector('[data-plane=mcp]'),backend=world.querySelector('[data-plane=backend]');if(!backend)return;
  const narrow=scene.clientWidth<650;
  world.classList.toggle('narrow-world',narrow);world.style.setProperty('--map-mobile-width',(scene.clientWidth-28)+'px');
  const positions=narrow?[[14,38,0],[14,idea.offsetHeight+110,0],[14,idea.offsetHeight+ux.offsetHeight+180,0],[14,idea.offsetHeight+ux.offsetHeight+mcp.offsetHeight+250,0]]:[[35,50,0],[440,35,12],[1010,65,-12],[440,Math.max(ux.offsetHeight,mcp.offsetHeight)+145,0]];
  width=narrow?scene.clientWidth:1520;
  // Reflow first when switching narrow/wide layout.
  for(let i=0;i<planes.length;i++){const face=world.querySelector(`[data-plane=${planes[i]}]`),[x,y,z]=positions[i];face.style.left=x+'px';face.style.top=y+'px';face.style.transform=mode==='3d'&&!narrow?`perspective(2400px) rotateY(${yaw+(i===0?2:0)}deg) translateZ(${z}px)`:'none';}
  height=Math.max(...[...world.children].map(f=>parseFloat(f.style.top)+f.offsetHeight))+70;
  const overviewHeight=Math.max(600,Math.min(1000,innerHeight-60));
  const fit=fitAll?Math.min((scene.clientWidth-16)/width,(overviewHeight-65)/height):narrow?1:Math.min(1.1,(scene.clientWidth-16)/width),scale=Math.max(.1,fit)*zoom;
  world.style.width=width+'px';world.style.height=height+'px';world.style.transform=`translate(${panX+(fitAll?(scene.clientWidth-width*scale)/2:0)}px,${panY}px) scale(${scale})`;
  stage.style.height=(fitAll?overviewHeight:Math.max(700,height*Math.max(.1,fit)+65))+'px';
 }
 function requestAnchors(){const frame=world.querySelector('.map-preview');if(!frame)return;const s=state();frame.contentWindow?.postMessage({type:'workboard-inspect',buttons:s.nodes.filter(n=>n.kind==='button'&&n.uiScreen===frame.dataset.screen).map(n=>({id:n.id,selector:n.uiSelector})),selected:s.selected},location.origin);}
 function lines(){
  if(mode==='flat'){svg.innerHTML='';return;}
  const focused=svg.contains(document.activeElement)?document.activeElement.closest('[data-select]')?.dataset.select:null;
  const s=state(),r=scene.getBoundingClientRect(),anchors=new Map();
  world.querySelectorAll('[data-anchor],[data-screen-anchor]').forEach(el=>{const b=el.getBoundingClientRect();if(!b.width||!b.height)return;anchors.set(el.dataset.anchor||el.dataset.screenAnchor,{left:b.left-r.left,right:b.right-r.left,top:b.top-r.top,bottom:b.bottom-r.top,x:b.x+b.width/2-r.x,y:b.y+b.height/2-r.y});});
  svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);svg.innerHTML='<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="context-stroke"/></marker></defs>';
  // Connections may pass behind other cards. Clip both paint and hit-testing out
  // of their interiors, so a relationship can never steal a node/button click.
  const clip=document.createElementNS(NS,'clipPath');clip.id='relation-gaps';clip.setAttribute('clipPathUnits','userSpaceOnUse');
  const cutout=document.createElementNS(NS,'path');let holes=`M0,0H${r.width}V${r.height}H0Z`;
  world.querySelectorAll('.map-node,.file-anchor,.preview-anchor,.screen-destinations button').forEach(el=>{const b=el.getBoundingClientRect();if(b.width<4||b.height<4)return;const x=b.left-r.left+2,y=b.top-r.top+2;holes+=` M${x},${y}h${b.width-4}v${b.height-4}h${4-b.width}Z`;});
  cutout.setAttribute('d',holes);cutout.setAttribute('clip-rule','evenodd');clip.append(cutout);svg.querySelector('defs').append(clip);
  const byId=new Map(s.allNodes.map(n=>[n.id,n]));
  const relevant=s.edges.filter(e=>anchors.has(e.from)&&anchors.has(e.to));
  for(const [i,e] of relevant.entries()){
   const a=anchors.get(e.from),b=anchors.get(e.to),same=byId.get(e.from)?.plane===byId.get(e.to)?.plane;
   let ax,ay,bx,by,d,lx,ly;
   if(same&&Math.abs(a.x-b.x)<130){ax=a.left;ay=a.y;bx=b.left;by=b.y;const lane=Math.min(ax,bx)-22-(i%3)*7;d=`M${ax},${ay} C${lane},${ay} ${lane},${by} ${bx},${by}`;lx=lane;ly=(ay+by)/2;}
   else if(Math.abs(a.x-b.x)>Math.abs(a.y-b.y)*.65){const forward=b.x>a.x;ax=forward?a.right:a.left;ay=a.y;bx=forward?b.left:b.right;by=b.y;const bend=Math.max(30,Math.abs(bx-ax)*.5);d=`M${ax},${ay} C${ax+(forward?bend:-bend)},${ay} ${bx+(forward?-bend:bend)},${by} ${bx},${by}`;lx=(ax+bx)/2;ly=(ay+by)/2;}
   else{const down=b.y>a.y;ax=a.x;ay=down?a.bottom:a.top;bx=b.x;by=down?b.top:b.bottom;const bend=Math.max(30,Math.abs(by-ay)*.5);d=`M${ax},${ay} C${ax},${ay+(down?bend:-bend)} ${bx},${by+(down?-bend:bend)} ${bx},${by}`;lx=(ax+bx)/2;ly=(ay+by)/2;}
   const group=document.createElementNS(NS,'g');group.setAttribute('class','spatial-relation'+(same?' internal':' cross')+(e.evidence==='code'?' verified':' draft')+(e.id===s.selected||e.from===s.selected||e.to===s.selected?' selected':''));group.dataset.select=e.id;group.dataset.from=e.from;group.dataset.to=e.to;group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',`${byId.get(e.from)?.title} → ${e.title} → ${byId.get(e.to)?.title} · ${evidenceLabel(e)}`);
   group.setAttribute('clip-path','url(#relation-gaps)');
   const line=document.createElementNS(NS,'path');line.setAttribute('d',d);line.setAttribute('class','spatial-link');line.setAttribute('marker-end','url(#arrow)');group.append(line);
   const hit=document.createElementNS(NS,'path');hit.setAttribute('d',d);hit.setAttribute('class','link-hit');group.append(hit);
   const dot=document.createElementNS(NS,'circle');dot.setAttribute('cx',ax);dot.setAttribute('cy',ay);dot.setAttribute('r','3');dot.setAttribute('class','link-origin');group.append(dot);
   const label=document.createElementNS(NS,'text');label.setAttribute('x',lx);label.setAttribute('y',ly-7);label.setAttribute('text-anchor','middle');label.setAttribute('class','link-label');label.textContent=e.title;group.append(label);
   const title=document.createElementNS(NS,'title');title.textContent=group.getAttribute('aria-label');group.append(title);svg.append(group);
  }
  if(focused)svg.querySelector(`[data-select="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
 }
 function focus(p,detail=false){if(!planes.includes(p))return;active=p;if(detail){mode='flat';signature='';schedule();}else if(mode==='flat')openPlane(p);else{const face=world.querySelector(`[data-plane=${p}]`);face?.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});}}
 function view(next){mode=next;zoom=1;panX=panY=0;fitAll=false;signature='';schedule();}
 nav.addEventListener('change',e=>{if(e.target.matches('[data-trace-root]')&&e.target.value)traceFrom(e.target.value);});
 nav.addEventListener('click',e=>{if(e.target.closest('[data-scope]')){scope=scope==='path'?'context':'path';signature='';schedule();}});
 tabs.addEventListener('click',e=>{const p=e.target.closest('[data-face]')?.dataset.face;if(p)openPlane(p);});
 stage.addEventListener('click',e=>{const p=e.target.closest('[data-open-plane]')?.dataset.openPlane;if(p)openPlane(p);const screen=e.target.closest('[data-show-screen]')?.dataset.showScreen;if(screen){previewScreen=screen;signature='';schedule();}});
 path.addEventListener('click',e=>{const id=e.target.closest('[data-jump]')?.dataset.jump;if(id){choose(id);world.querySelector(`[data-anchor="${CSS.escape(id)}"]`)?.scrollIntoView({block:'center'});}const root=e.target.closest('[data-retrace]')?.dataset.retrace;if(root)traceFrom(root);if(e.target.closest('[data-edit-details]'))document.getElementById('inspector').scrollIntoView({block:'start'});});
 world.addEventListener('scroll',lines,true);world.addEventListener('toggle',schedule,true);
 scene.addEventListener('pointerdown',e=>{if(e.button||mode==='flat'||e.target.closest('button,a,input,select,iframe,summary,.face,.spatial-relation'))return;drag={x:e.clientX,y:e.clientY};scene.setPointerCapture(e.pointerId);});
 scene.addEventListener('pointermove',e=>{if(!drag)return;panX+=e.clientX-drag.x;panY+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};layout();lines();});
 scene.addEventListener('pointerup',e=>{drag=null;if(scene.hasPointerCapture(e.pointerId))scene.releasePointerCapture(e.pointerId);});scene.addEventListener('pointercancel',()=>{drag=null;});
 scene.addEventListener('wheel',e=>{if(mode==='flat'||!e.ctrlKey)return;e.preventDefault();zoom=Math.max(.5,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));layout();lines();},{passive:false});
 scene.addEventListener('keydown',e=>{if(e.target!==scene)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();panX+=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0;panY+=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;layout();lines();}});
 svg.addEventListener('keydown',e=>{const id=e.target.closest('[data-select]')?.dataset.select;if(id&&['Enter',' '].includes(e.key)){e.preventDefault();choose(id);}});
 world.addEventListener('change',e=>{if(e.target.matches('[data-preview-screen]')){previewScreen=e.target.value;if(mode==='flat'){world.querySelector('.product-preview').src='./product-ui-preview.html?screen='+encodeURIComponent(previewScreen);}else{signature='';schedule();}}});
 window.addEventListener('message',e=>{
  const frame=world.querySelector('.product-preview');if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.type!=='workboard-preview')return;const d=e.data,live=world.querySelector('.preview-live');
  if(d.event==='anchors'&&frame.classList.contains('map-preview')){
   if(d.screen!==frame.dataset.screen)return;const shell=frame.parentElement;const h=Math.max(200,Math.min(1200,Number(d.height)||500));if(Math.abs(frame.clientHeight-h)>2)frame.style.height=h+'px';
   shell.querySelectorAll('.preview-anchor').forEach(a=>a.remove());for(const a of d.anchors||[]){if(!state().nodes.some(n=>n.id===a.id)||![a.x,a.y,a.width,a.height].every(Number.isFinite)||a.y<0||a.y+a.height>h)continue;const marker=document.createElement('span');marker.className='preview-anchor';marker.dataset.anchor=a.id;marker.setAttribute('aria-hidden','true');Object.assign(marker.style,{left:a.x+'px',top:a.y+'px',width:a.width+'px',height:a.height+'px'});shell.append(marker);}
   world.querySelectorAll('[data-button-fallback]').forEach(el=>{el.hidden=!!shell.querySelector(`[data-anchor="${CSS.escape(el.dataset.buttonFallback)}"]`);});layout();lines();return;
  }
  if(d.event==='screen'&&mode==='flat'){previewScreen=d.screen;const select=world.querySelector('[data-preview-screen]');if(select)select.value=d.screen;}
  if(d.event==='button') {const n=getState().allNodes.find(n=>n.kind==='button'&&n.uiSelector===d.selector&&n.uiScreen===d.screen);if(n){if(mode==='flat'||!getState().trace.has(n.id))traceFrom(n.id);else choose(n.id);if(live)live.textContent=n.title+' · '+(n.toolName||'연결된 화면·코드 확인');}else if(d.targetScreen&&mode==='flat'){const n=getState().allNodes.find(n=>n.uiScreen===d.targetScreen&&n.kind==='screen');if(n)choose(n.id);}}
  if(d.event==='tool'&&live)live.textContent=(d.phase==='response'?'응답 완료: ':'요청: ')+d.name+' · 가상 실행';
  if(d.event==='chat'&&live)live.textContent='AI에게 후속 대화를 요청하는 단계입니다. 실제 메시지는 전송하지 않습니다.';
 });
 return {draw:schedule,view,focus,rotate:delta=>{yaw=Math.max(-18,Math.min(18,yaw+delta/5));schedule();},zoom:factor=>{zoom=Math.max(.5,Math.min(2.5,zoom*factor));schedule();},fit:()=>{zoom=1;panX=panY=0;fitAll=true;schedule();},readSize:()=>{zoom=1;panX=panY=0;fitAll=false;schedule();},jump:focus};
}
