import {profileFor,escapeProfile as escape} from './profiles.js';
import {characterMarkup,standeeMarkup,defaultSkin,skinIndexFor,imageKind,DEFAULT_SKIN_COUNT} from './block-character.js';

// 회의실은 밤 숲속 모닥불 캠핑장이다. CSS 3D로 그리며 모든 길이는 텍셀 단위(var(--t))다.
// 좌표: x 오른쪽, y 아래, z 화면 쪽. 땅은 y=0, 모닥불은 원점. 화면 공유는 빔프로젝터 스크린에 비친다.
const t=n=>`calc(var(--t) * ${+(+n).toFixed(3)})`;
const shade=(c,k)=>k>0?`color-mix(in srgb, ${c}, white ${k}%)`:`color-mix(in srgb, ${c}, black ${-k}%)`;
function cuboid({w,h,d,x=0,y=0,z=0,ry=0,rz=0,color,top,faces={},cls=''}){
  const f={front:[w,h,`translateZ(${t(d/2)})`,color],back:[w,h,`rotateY(180deg) translateZ(${t(d/2)})`,shade(color,-22)],right:[d,h,`rotateY(-90deg) translateZ(${t(w/2)})`,shade(color,-14)],left:[d,h,`rotateY(90deg) translateZ(${t(w/2)})`,shade(color,-14)],top:[w,d,`rotateX(90deg) translateZ(${t(h/2)})`,top||shade(color,14)]};
  return `<div class="w3 cub ${cls}" style="width:${t(w)};height:${t(h)};margin:${t(-h/2)} 0 0 ${t(-w/2)};transform:translate3d(${t(x)},${t(y)},${t(z)}) rotateY(${ry}deg) rotateZ(${rz}deg)">${Object.entries(f).map(([k,[fw,fh,tr,bg]])=>`<i style="width:${t(fw)};height:${t(fh)};left:${t((w-fw)/2)};top:${t((h-fh)/2)};transform:${tr};background:${faces[k]||bg}"></i>`).join('')}</div>`;
}
function plane({w,h,x=0,y=0,z=0,rot='',cls='',style='',inner=''}){
  return `<div class="w3 plane ${cls}" style="width:${t(w)};height:${t(h)};margin:${t(-h/2)} 0 0 ${t(-w/2)};transform:translate3d(${t(x)},${t(y)},${t(z)}) ${rot};${style}">${inner}</div>`;
}
const group=(x,y,z,ry,inner,cls='')=>`<div class="w3 ${cls}" style="transform:translate3d(${t(x)},${t(y)},${t(z)}) rotateY(${ry}deg)">${inner}</div>`;

// 좌석(통나무): 위치·바라보는 방향
const SEATS=[{x:-24,z:2,ry:72},{x:24,z:2,ry:-72},{x:3,z:-25,ry:-8}];
// 빔 스크린: 위치·방향, 스크린 중심 높이
const SCREEN={x:-30,z:-48,ry:18,cy:-22};
const PROJECTOR={x:-17,z:-30};

function pine(x,z,s=1){
  const g='#2c4a3b';
  return group(x,0,z,(x*7+z*3)%40,cuboid({w:3*s,h:10*s,d:3*s,y:-5*s,color:'#5b4331'})+cuboid({w:16*s,h:7*s,d:16*s,y:-12*s,color:g,top:'#3b5d49'})+cuboid({w:12*s,h:7*s,d:12*s,y:-18.5*s,color:'#30523f',top:'#41664f'})+cuboid({w:7*s,h:7*s,d:7*s,y:-25*s,color:'#355a45',top:'#4a7058'}),'tree');
}
function cabin(){
  const logs=c=>`repeating-linear-gradient(0deg,${c} 0 calc(var(--t) * 1.7),${shade(c,-28)} 0 calc(var(--t) * 2))`;
  const wood='#7a5a3e',win=`linear-gradient(#ffd98a,#f3a952)`;
  const body=cuboid({w:32,h:15,d:22,y:-7.5,color:wood,faces:{front:logs(wood),back:logs(shade(wood,-22)),left:logs(shade(wood,-14)),right:logs(shade(wood,-14))}});
  const slab=(side)=>cuboid({w:23.5,h:1.6,d:27,x:side*9,y:-21.3,rz:side*38,color:'#5d4a3c',top:'#6f5a49'});
  const gable=z=>plane({w:32,h:14,y:-22,z,cls:'cabin-gable',style:`background:${logs(z>0?wood:shade(wood,-22))}`});
  return group(50,0,-64,-22,body+slab(-1)+slab(1)+gable(11.01)+gable(-11.01)
    +cuboid({w:4,h:14,d:4,x:-11,y:-24,z:-4,color:'#8b8580',faces:{front:'repeating-linear-gradient(0deg,#8b8580 0 calc(var(--t) * 1.4),#6f6964 0 calc(var(--t) * 1.6))'}})
    +plane({w:6.5,h:10,y:-5,z:11.05,cls:'cabin-door'})
    +plane({w:5.5,h:5,x:-10,y:-8,z:11.05,cls:'cabin-window',style:`background:${win}`,inner:'<i></i><i></i>'})
    +plane({w:5.5,h:5,x:10,y:-8,z:11.05,cls:'cabin-window',style:`background:${win}`,inner:'<i></i><i></i>'})
    +plane({w:5,h:4.5,y:-20,z:11.08,cls:'cabin-window',style:`background:${win}`,inner:'<i></i><i></i>'})
    +cuboid({w:12,h:1.4,d:4,y:-.7,z:13,color:'#6b5039'}),'cabin');
}
function campfire(){
  const stones=Array.from({length:9},(_,i)=>{const a=i/9*Math.PI*2;return cuboid({w:3,h:2.2,d:3,x:Math.cos(a)*6.4,y:-1.1,z:Math.sin(a)*6.4,ry:a*57,color:i%2?'#8a8580':'#77726d'});}).join('');
  const logs=[30,-30,90].map((ry,i)=>cuboid({w:11,h:2,d:2,y:-1.2-i*.9,ry,color:'#6b4a30',faces:{left:'radial-gradient(circle,#c99a62 30%,#8c6440 31% 45%,#c99a62 46% 60%,#6b4a30 61%)',right:'radial-gradient(circle,#c99a62 30%,#8c6440 31% 45%,#c99a62 46% 60%,#6b4a30 61%)'}})).join('');
  const flames=`<div class="w3 fire-billboard" style="transform:translate3d(0,${t(-2.6)},0) rotateY(calc(var(--yaw) * -1)) rotateX(var(--pitch))"><div class="flames"><i></i><i></i><i></i><b></b><b></b><b></b><b></b></div></div>`;
  return plane({w:60,h:60,y:-.08,rot:'rotateX(90deg)',cls:'fire-light'})+stones+logs+flames;
}
function projectorAndScreen(){
  const s=SCREEN,rad=s.ry*Math.PI/180;
  // 스크린 중심의 월드 좌표
  const sx=s.x+Math.sin(rad)*.4,sz=s.z+Math.cos(rad)*.4,sy=s.cy;
  // 프로젝터가 스크린 쪽을 보게 돌리고, 렌즈(앞면 중앙)에서 스크린 중심까지 빛을 쏜다.
  const aim=Math.atan2(-(sx-PROJECTOR.x),-(sz-PROJECTOR.z));
  const lens={x:PROJECTOR.x-Math.sin(aim)*3.05,y:-7.4,z:PROJECTOR.z-Math.cos(aim)*3.05};
  const dx=sx-lens.x,dy=sy-lens.y,dz=sz-lens.z,len=Math.hypot(dx,dy,dz),yaw=aim*180/Math.PI,pitch=Math.asin(dy/len)*180/Math.PI;
  const beam=(rot,half)=>`<div class="w3 beam" style="width:${t(len)};height:${t(half*2)};margin:${t(-half)} 0 0 ${t(-len/2)};transform:translate3d(0,0,${t(-len/2)}) ${rot};--n:${(1.2/half*50).toFixed(2)}%"></div>`;
  const stand=group(s.x,0,s.z,s.ry,
    cuboid({w:1.6,h:42,d:1.6,x:-35,y:-21,color:'#6b4f38'})+cuboid({w:1.6,h:42,d:1.6,x:35,y:-21,color:'#6b4f38'})+cuboid({w:72,h:1.4,d:1.4,y:-41.5,color:'#5d4430'})
    +`<div class="w3 room-wall" style="transform:translate3d(0,${t(s.cy)},${t(.4)})"><div class="room-idle"><span>STUDYMETA / CAMPFIRE</span><strong class="room-screen-title">함께 만드는 공간</strong><p>화면을 공유하면 프로젝터가 여기에 비춰요.</p><span class="room-idle-mark">✦</span></div><div id="screen-stage" class="screen-stage" hidden></div><span class="projected-light"></span></div>`,'screen-stand');
  const projector=cuboid({w:6,h:6,d:6,x:PROJECTOR.x,y:-3,z:PROJECTOR.z,color:'#6e5038',top:'radial-gradient(circle,#c99a62 30%,#8c6440 31% 45%,#c99a62 46% 60%,#6e5038 61%)'})
    +group(PROJECTOR.x,-7.4,PROJECTOR.z,yaw,cuboid({w:5.4,h:2.8,d:6,color:'#d8d3cb',top:'#ece8e1'})+plane({w:2,h:2,z:-3.05,rot:'rotateY(180deg)',cls:'lens'}),'projector');
  const beams=`<div class="w3 beam-cone" style="transform:translate3d(${t(lens.x)},${t(lens.y)},${t(lens.z)}) rotateY(${yaw.toFixed(2)}deg) rotateX(${pitch.toFixed(2)}deg)">${beam('rotateY(90deg)',18)}${beam('rotateY(90deg) rotateX(90deg)',32)}</div>`;
  return stand+projector+beams;
}
function scenery(){
  const trees=[[-78,-62,1.1],[-52,-80,1.25],[-96,-28,1],[-92,18,1.15],[-22,-88,1.2],[14,-96,1.3],[84,-30,1.1],[100,-62,1.25],[92,18,1],[-70,48,.9],[78,52,.95],[30,-84,.9]].map(([x,z,s])=>pine(x,z,s)).join('');
  return [
    plane({w:300,h:150,y:-60,z:-110,cls:'night-sky',inner:'<span class="moon"></span>'}),
    plane({w:220,h:150,x:-150,y:-60,z:-10,rot:'rotateY(90deg)',cls:'night-sky side'}),
    plane({w:220,h:150,x:150,y:-60,z:-10,rot:'rotateY(-90deg)',cls:'night-sky side'}),
    plane({w:320,h:300,z:30,rot:'rotateX(90deg)',cls:'forest-floor'}),
    plane({w:16,h:40,x:-6,y:-.04,z:26,rot:'rotateX(90deg) rotateZ(14deg)',cls:'dirt-path'}),
    trees,cabin(),projectorAndScreen(),campfire(),
    cuboid({w:5,h:1.6,d:3,x:30,y:-.8,z:20,ry:20,color:'#7d7873'}),cuboid({w:3,h:1.2,d:2.4,x:-34,y:-.6,z:16,color:'#86817b'}),
    group(-40,0,-10,30,cuboid({w:2,h:3,d:2,y:-1.5,color:'#4d7a5a'})+cuboid({w:1.6,h:2.4,d:1.6,x:1.6,y:-1.2,color:'#5d8c69'}),'bush'),
    group(36,0,-30,0,cuboid({w:5,h:4,d:5,y:-2,color:'#36553f',top:'#45694f'})+cuboid({w:4,h:3,d:4,x:4,y:-1.5,z:1,color:'#3b5c45'}),'bush')
  ].join('');
}
function seatMarkup(i,body,label){
  const s=SEATS[i],ring='radial-gradient(circle,#c99a62 25%,#8c6440 26% 38%,#c99a62 39% 52%,#5d4430 53%)';
  const log=cuboid({w:14,h:4,d:4.6,y:-2,color:body?'#6b4f38':'#7d6450',faces:{left:ring,right:ring}});
  return `<div class="w3 seat-group" style="transform:translate3d(${t(s.x)},0,${t(s.z)}) rotateY(${s.ry}deg);--r:${s.ry}deg">${log}<div class="w3 seat-body" style="transform:translate3d(0,${t(-4)},0) scale3d(1.3,1.3,1.3)">${body}</div><div class="w3 seat-tag" style="transform:translate3d(0,${t(body?-27.5:-9)},0) rotateY(calc(${-s.ry}deg - var(--yaw))) rotateX(var(--pitch))">${label}</div></div>`;
}

export function createVirtualRoom(mount){
  mount.className='virtual-room-wrap';
  mount.innerHTML=`<div class="room-toolbar"><span><i></i> OUR CAMPFIRE</span><div><a href="/account.html#profile-section">내 캐릭터 설정</a><button id="room-fullscreen" type="button" aria-pressed="false">⛶ 전체 화면</button><button id="room-screen-toggle" type="button" aria-expanded="false" disabled>공유 화면 크게</button></div></div>
  <div class="virtual-room campfire" role="region" tabindex="0" aria-label="캐릭터와 함께하는 숲속 모닥불 회의실 · 끌거나 좌우 방향키로 둘러보기, 두 번 눌러 원래 시점">
  <div class="room-world">${scenery()}<div class="w3 room-seats" aria-label="모닥불 자리"></div></div>
  <div class="room-night" aria-hidden="true"></div><div class="room-glow" aria-hidden="true"></div><div class="fireflies" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <span class="room-caption">모닥불 앞에서, 어디서든.</span><span class="room-hint" aria-hidden="true">↔ 끌어서 둘러보기</span></div>`;
  const room=mount.querySelector('.virtual-room'),world=room.querySelector('.room-world'),toggle=mount.querySelector('#room-screen-toggle');
  let signature='',last=null,yaw=-8,drag=null;
  const setYaw=v=>{yaw=Math.max(-60,Math.min(60,v));world.style.setProperty('--yaw',yaw+'deg');};setYaw(yaw);
  room.addEventListener('pointerdown',e=>{if(e.button!==0||room.classList.contains('screen-expanded'))return;drag={x:e.clientX,yaw};room.setPointerCapture(e.pointerId);room.classList.add('dragging');});
  room.addEventListener('pointermove',e=>{if(drag)setYaw(drag.yaw+(e.clientX-drag.x)*.28);});
  const end=()=>{drag=null;room.classList.remove('dragging');};room.addEventListener('pointerup',end);room.addEventListener('pointercancel',end);
  room.addEventListener('dblclick',()=>setYaw(-8));
  room.addEventListener('keydown',e=>{const d={ArrowLeft:-8,ArrowRight:8}[e.key];if(d&&!room.classList.contains('screen-expanded')){e.preventDefault();setYaw(yaw+d);}});
  // 전체 화면: 브라우저 전체 화면을 쓰고, 지원하지 않는 기기(iPhone 등)에서는 창 가득 채운다.
  const full=mount.querySelector('#room-fullscreen'),native=()=>document.fullscreenElement===mount;
  const syncFull=()=>{const on=native()||mount.classList.contains('room-maximized');mount.classList.toggle('is-full',on);full.setAttribute('aria-pressed',String(on));full.textContent=on?'전체 화면 끝내기':'⛶ 전체 화면';};
  full.onclick=async()=>{
    if(native())return document.exitFullscreen().catch(()=>{});
    if(mount.classList.contains('room-maximized')){mount.classList.remove('room-maximized');document.documentElement.classList.remove('room-maximized-page');return syncFull();}
    if(document.fullscreenEnabled&&mount.requestFullscreen){try{await mount.requestFullscreen();return;}catch{}}
    mount.classList.add('room-maximized');document.documentElement.classList.add('room-maximized-page');syncFull();room.focus();
  };
  document.addEventListener('fullscreenchange',syncFull);
  mount.addEventListener('keydown',e=>{if(e.key==='Escape'&&mount.classList.contains('room-maximized')){full.click();full.focus();}});
  toggle.onclick=()=>{const expanded=room.classList.toggle('screen-expanded');toggle.textContent=expanded?'모닥불로 돌아가기':'공유 화면 크게';toggle.setAttribute('aria-expanded',String(expanded));};
  function render(args){
    last=args;const {peers=[],title='함께 만드는 공간',selfId,connectionState}=args;
    mount.querySelector('.room-screen-title').textContent=title;
    const people=[...new Map(peers.map(p=>[p.user_id,p])).values()].sort((a,b)=>(a.joined_at||a.id).localeCompare(b.joined_at||b.id)).slice(0,3);
    // 캐릭터 이미지가 전개도인지 일반 그림인지 판별되면 다시 그린다.
    const looks=people.map(peer=>{const p=profileFor(peer.user_id,peer.name);return [p,p.characterUrl?imageKind(p.characterUrl,()=>last&&render(last)):null];});
    const used=new Set(),skins=people.map(peer=>{let k=skinIndexFor(peer.user_id);for(let n=0;n<DEFAULT_SKIN_COUNT&&used.has(k);n++)k=(k+1)%DEFAULT_SKIN_COUNT;used.add(k);return k;});
    const next=JSON.stringify([selfId,people.map((p,i)=>[p.id,p.user_id,p.muted,p.sharing,looks[i],connectionState?.(p)])]);if(next===signature)return;signature=next;
    mount.querySelector('.room-seats').innerHTML=[0,1,2].map(i=>{
      const peer=people[i];
      if(!peer)return `<div class="room-seat seat-${i} empty">${seatMarkup(i,'','<span class="seat-empty">빈자리</span>')}</div>`;
      const [p,kind]=looks[i],state=connectionState?.(peer)||'연결 중',ok=peer.id===selfId||state==='connected',name=escape(p.displayName),status=peer.sharing?'화면 공유 중':!ok?'연결 확인 중':peer.muted?'마이크 꺼짐':'마이크 켜짐';
      const who=`${p.displayName}의 캐릭터`,body=kind==='sprite'?standeeMarkup(p.characterUrl,{label:who}):characterMarkup(kind==='skin'?p.characterUrl:defaultSkin(skins[i]),{label:who});
      return `<div class="room-seat seat-${i}${peer.muted?'':' talking'}" data-user-id="${escape(peer.user_id)}">${seatMarkup(i,body,`<div class="seat-label"><strong>${name}${peer.id===selfId?' · 나':''}</strong><small class="${ok&&!peer.muted?'mic-on':''}">${status}</small></div>`)}</div>`;
    }).join('');
  }
  return {
    update:render,
    screenChanged(sharing){room.classList.toggle('has-screen',sharing);toggle.disabled=!sharing;if(!sharing){room.classList.remove('screen-expanded');toggle.textContent='공유 화면 크게';toggle.setAttribute('aria-expanded','false');}}
  };
}
