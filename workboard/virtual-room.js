import {profileFor,escapeProfile as escape} from './profiles.js';
import {characterMarkup,standeeMarkup,defaultSkin,skinIndexFor,imageKind,DEFAULT_SKIN_COUNT} from './block-character.js';

// 회의실은 CSS 3D로 그린다. 모든 길이는 텍셀 단위(var(--t))이며 --t는 회의실 너비에 맞춰 정해진다.
// 좌표: x 오른쪽, y 아래, z 화면 쪽. 바닥은 y=0, 뒷벽은 z=-58.
const t=n=>`calc(var(--t) * ${+(+n).toFixed(3)})`;
const shade=(c,k)=>k>0?`color-mix(in srgb, ${c}, white ${k}%)`:`color-mix(in srgb, ${c}, black ${-k}%)`;
function cuboid({w,h,d,x=0,y=0,z=0,ry=0,color,top,cls=''}){
  const f={front:[w,h,`translateZ(${t(d/2)})`,color],back:[w,h,`rotateY(180deg) translateZ(${t(d/2)})`,shade(color,-18)],right:[d,h,`rotateY(-90deg) translateZ(${t(w/2)})`,shade(color,-12)],left:[d,h,`rotateY(90deg) translateZ(${t(w/2)})`,shade(color,-12)],top:[w,d,`rotateX(90deg) translateZ(${t(h/2)})`,top||shade(color,16)]};
  return `<div class="w3 cub ${cls}" style="width:${t(w)};height:${t(h)};margin:${t(-h/2)} 0 0 ${t(-w/2)};transform:translate3d(${t(x)},${t(y)},${t(z)}) rotateY(${ry}deg)">${Object.values(f).map(([fw,fh,tr,bg])=>`<i style="width:${t(fw)};height:${t(fh)};left:${t((w-fw)/2)};top:${t((h-fh)/2)};transform:${tr};background:${bg}"></i>`).join('')}</div>`;
}
function plane({w,h,x=0,y=0,z=0,rot='',cls='',style='',inner=''}){
  return `<div class="w3 plane ${cls}" style="width:${t(w)};height:${t(h)};margin:${t(-h/2)} 0 0 ${t(-w/2)};transform:translate3d(${t(x)},${t(y)},${t(z)}) ${rot};${style}">${inner}</div>`;
}
// 좌석: 위치·바라보는 방향(ry)·의자 색
const SEATS=[{x:-28,z:-6,ry:62,color:'#9fb39a'},{x:28,z:-6,ry:-62,color:'#a99ec0'},{x:-22,z:-43,ry:24,color:'#d2a084'}];
const TABLE={w:34,d:52,z:-6,top:-11};

function scenery(){
  const legs=[[-14,-23],[14,-23],[-14,23],[14,23]].map(([x,z])=>cuboid({w:2.4,h:-TABLE.top-.2,d:2.4,x,y:TABLE.top/2,z:TABLE.z+z,color:'#a88a68'})).join('');
  const books=['#c98e6b','#8fa58a','#a99ec0','#e3c27a','#7c8a9c','#d7a1a1'].map((c,i)=>cuboid({w:2.2+(i%2)*.6,h:7+i%3,d:4,x:47+i*2.8,y:-18.1-(i%3)/2,z:-54,color:c})).join('');
  return [
    plane({w:160,h:116,rot:'rotateX(90deg)',cls:'room-floor'}),
    plane({w:46,h:70,y:-.05,z:TABLE.z+2,rot:'rotateX(90deg)',cls:'room-rug'}),
    plane({w:160,h:72,y:-36,z:-58,cls:'room-back'}),
    plane({w:116,h:72,x:-80,y:-36,rot:'rotateY(90deg)',cls:'room-side'}),
    plane({w:116,h:72,x:80,y:-36,rot:'rotateY(-90deg)',cls:'room-side right'}),
    plane({w:34,h:30,x:-79.8,y:-40,z:-14,rot:'rotateY(90deg)',cls:'room-window',inner:'<i></i><i></i>'}),
    plane({w:160,h:3,y:-1.5,z:-57.8,cls:'room-baseboard'}),
    // 책장
    cuboid({w:30,h:30,d:1.4,x:56,y:-15,z:-57,color:'#c7ad8a'}),
    ...[-0.6,-14,-28.8].map(y=>cuboid({w:30,h:1.2,d:8,x:56,y,z:-53.5,color:'#c7ad8a',top:'#dcc6a4'})),
    ...[41,71].map(x=>cuboid({w:1.2,h:30,d:8,x,y:-15,z:-53.5,color:'#b89c79'})),books,
    ...['#e8cf9a','#9fb39a','#d2a084','#a99ec0'].map((c,i)=>cuboid({w:2.4,h:6+i%2,d:4.2,x:44+i*3,y:-3.6-(i%2)/2,z:-54,color:c})),
    cuboid({w:3,h:3,d:3,x:66,y:-31.5,z:-54,color:'#8fa58a'}),
    // 화분
    cuboid({w:7,h:7,d:7,x:-68,y:-3.5,z:-48,color:'#d9cbb8'}),cuboid({w:5,h:5,d:5,x:-68,y:-9.5,z:-48,color:'#86a07f'}),cuboid({w:4,h:6,d:4,x:-66,y:-14,z:-47,color:'#9cb894'}),cuboid({w:3,h:4,d:3,x:-70,y:-13,z:-49.5,color:'#7d9876'}),
    cuboid({w:6,h:6,d:6,x:66,y:-3,z:22,color:'#d9cbb8'}),cuboid({w:4.5,h:7,d:4.5,x:66,y:-9,z:22,color:'#8fa58a'}),cuboid({w:3,h:4,d:3,x:67.5,y:-13,z:21,color:'#a4bd9c'}),
    // 테이블
    cuboid({w:TABLE.w,h:1.6,d:TABLE.d,y:TABLE.top+.8,z:TABLE.z,color:'#d8bd96',top:'#ecd7b4',cls:'room-table'}),legs,
    plane({w:9,h:6,x:-8,y:TABLE.top-.05,z:TABLE.z-10,rot:'rotateX(90deg) rotateZ(-8deg)',cls:'room-paper'}),
    plane({w:8,h:5.5,x:9,y:TABLE.top-.05,z:TABLE.z+8,rot:'rotateX(90deg) rotateZ(12deg)',cls:'room-paper'}),
    cuboid({w:2.6,h:3.2,d:2.6,x:2,y:TABLE.top-1.6,z:TABLE.z-2,color:'#f3efe6',cls:'room-cup'})
  ].join('');
}
function seatMarkup(i,body,label){
  const s=SEATS[i],color=body?s.color:shade(s.color,45);
  const chair=cuboid({w:10,h:2.4,d:10,y:-1.2,color})+cuboid({w:10,h:9,d:2,y:-6.9,z:-5.6,color});
  return `<div class="w3 seat-group" style="transform:translate3d(${t(s.x)},0,${t(s.z)}) rotateY(${s.ry}deg);--r:${s.ry}deg">${chair}<div class="w3 seat-body" style="transform:translate3d(0,${t(-2.4)},0) scale3d(1.3,1.3,1.3)">${body}</div><div class="w3 seat-tag" style="transform:translate3d(0,${t(body?-27:-12)},0) rotateY(calc(${-s.ry}deg - var(--yaw))) rotateX(var(--pitch))">${label}</div></div>`;
}

export function createVirtualRoom(mount){
  mount.className='virtual-room-wrap';
  mount.innerHTML=`<div class="room-toolbar"><span><i></i> OUR MEETING ROOM</span><div><a href="/account.html#profile-section">내 캐릭터 설정</a><button id="room-screen-toggle" type="button" aria-expanded="false" disabled>공유 화면 크게</button></div></div>
  <div class="virtual-room" role="region" tabindex="0" aria-label="캐릭터와 함께하는 3D 회의실 · 끌거나 좌우 방향키로 둘러보기, 두 번 눌러 원래 시점">
  <div class="room-world">${scenery()}
  <div class="w3 room-wall"><div class="room-idle"><span>STUDYMETA / TEAM SPACE</span><strong class="room-screen-title">함께 만드는 공간</strong><p>화면을 공유하면 여기에 보여요.</p><span class="room-idle-mark">✦</span></div><div id="screen-stage" class="screen-stage" hidden></div></div>
  <div class="w3 room-seats" aria-label="회의실 좌석"></div></div>
  <span class="room-caption">같은 테이블에서, 어디서든.</span><span class="room-hint" aria-hidden="true">↔ 끌어서 둘러보기</span></div>`;
  const room=mount.querySelector('.virtual-room'),world=room.querySelector('.room-world'),toggle=mount.querySelector('#room-screen-toggle');
  let signature='',last=null,yaw=-10,drag=null;
  const setYaw=v=>{yaw=Math.max(-55,Math.min(55,v));world.style.setProperty('--yaw',yaw+'deg');};setYaw(yaw);
  room.addEventListener('pointerdown',e=>{if(e.button!==0||room.classList.contains('screen-expanded'))return;drag={x:e.clientX,yaw};room.setPointerCapture(e.pointerId);room.classList.add('dragging');});
  room.addEventListener('pointermove',e=>{if(drag)setYaw(drag.yaw+(e.clientX-drag.x)*.28);});
  const end=()=>{drag=null;room.classList.remove('dragging');};room.addEventListener('pointerup',end);room.addEventListener('pointercancel',end);
  room.addEventListener('dblclick',()=>setYaw(-10));
  room.addEventListener('keydown',e=>{const d={ArrowLeft:-8,ArrowRight:8}[e.key];if(d&&!room.classList.contains('screen-expanded')){e.preventDefault();setYaw(yaw+d);}});
  toggle.onclick=()=>{const expanded=room.classList.toggle('screen-expanded');toggle.textContent=expanded?'회의실로 돌아가기':'공유 화면 크게';toggle.setAttribute('aria-expanded',String(expanded));};
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
