import {profileFor,profileEvents,identity} from './profiles.js';
if(identity){
  const key='workboard-companion-'+identity.id;
  const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
  const write=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
  let position;try{position=JSON.parse(read(key+'-position'));if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y))position=null;}catch{}
  let hidden=read(key+'-hidden')==='yes',drag=null,moved=false;
  const host=document.createElement('aside');host.id='personal-companion';host.setAttribute('aria-label','내 캐릭터');
  host.innerHTML='<a class="companion-setup" href="/account.html#profile-section">✦ 캐릭터 등록</a><button class="companion-restore" hidden>캐릭터 보이기</button><div class="companion-body" hidden><div class="companion-menu" hidden><a href="/account.html#profile-section">이름 · 이미지 설정</a><button class="companion-hide">잠시 숨기기</button></div><button class="companion-drag" aria-label="내 캐릭터 · 끌어서 이동, 방향키로 이동, 클릭하면 설정" aria-expanded="false"><img alt="내 캐릭터" draggable="false"></button><span class="companion-name"></span></div>';
  document.body.append(host);
  const body=host.querySelector('.companion-body'),button=host.querySelector('.companion-drag'),menu=host.querySelector('.companion-menu'),restore=host.querySelector('.companion-restore');
  function place(){const w=body.offsetWidth||112,h=body.offsetHeight||136;position={x:Math.max(8,Math.min(innerWidth-w-8,position?.x??innerWidth-w-24)),y:Math.max(72,Math.min(innerHeight-h-16,position?.y??innerHeight-h-24))};body.style.left=position.x+'px';body.style.top=position.y+'px';menu.style.top=position.y<120?'100%':'auto';menu.style.bottom=position.y<120?'auto':'100%';menu.style.left=position.x<180?'0':'auto';menu.style.right=position.x<180?'auto':'0';}
  function render(){const p=profileFor(identity.id,identity.name),ready=Boolean(p.characterUrl&&p.companionEnabled),setup=host.querySelector('.companion-setup');setup.hidden=ready;setup.textContent=p.characterUrl?'✦ 캐릭터 설정':'✦ 캐릭터 등록';body.hidden=!ready||hidden;restore.hidden=!ready||!hidden;const img=button.querySelector('img');if(p.characterUrl&&img.getAttribute('src')!==p.characterUrl)img.src=p.characterUrl;host.querySelector('.companion-name').textContent=p.displayName;place();}
  function close(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
  button.addEventListener('pointerdown',e=>{if(e.button!==0)return;moved=false;drag={x:e.clientX,y:e.clientY,left:position.x,top:position.y};button.setPointerCapture(e.pointerId);});
  button.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){close();position={x:drag.left+dx,y:drag.top+dy};place();}});
  function finish(){if(drag&&moved)write(key+'-position',JSON.stringify(position));drag=null;}
  button.addEventListener('pointerup',finish);button.addEventListener('pointercancel',finish);
  button.addEventListener('click',()=>{if(moved){moved=false;return;}menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));});
  button.addEventListener('keydown',e=>{const d={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(d){e.preventDefault();position.x+=d[0];position.y+=d[1];place();write(key+'-position',JSON.stringify(position));}if(e.key==='Escape')close();});
  host.querySelector('.companion-hide').onclick=()=>{hidden=true;write(key+'-hidden','yes');close();render();restore.focus();};
  restore.onclick=()=>{hidden=false;write(key+'-hidden','no');render();button.focus();};
  profileEvents.addEventListener('change',render);window.addEventListener('resize',place);render();
}
