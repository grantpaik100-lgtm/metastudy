import {profileFor,escapeProfile as escape} from './profiles.js';
export function createVirtualRoom(mount){
  mount.className='virtual-room-wrap';
  mount.innerHTML=`<div class="room-toolbar"><span><i></i> OUR MEETING ROOM</span><div><a href="/account.html#profile-section">내 캐릭터 설정</a><button id="room-screen-toggle" type="button" aria-expanded="false" disabled>공유 화면 크게</button></div></div>
  <div class="virtual-room" role="region" aria-label="캐릭터와 함께하는 가상 회의실">
  <svg class="room-scenery" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="room-back" x2="0" y2="1"><stop stop-color="#f4efe8"/><stop offset="1" stop-color="#e0d8d0"/></linearGradient><linearGradient id="room-floor" x2="0" y2="1"><stop stop-color="#c0b3a8"/><stop offset="1" stop-color="#e8ded3"/></linearGradient><linearGradient id="room-table" x2="0" y2="1"><stop stop-color="#f0ddbd"/><stop offset="1" stop-color="#d8bd96"/></linearGradient><linearGradient id="room-window" x2="0" y2="1"><stop stop-color="#c9e0e7"/><stop offset="1" stop-color="#f2eeed"/></linearGradient></defs>
  <path fill="url(#room-back)" d="M160 50H840V330H160Z"/><path fill="#dbd1c8" d="M0 0L160 50V330L0 560Z"/><path fill="#e9e1d8" d="M1000 0L840 50V330L1000 560Z"/><path fill="#faf6ef" d="M0 0H1000L840 50H160Z"/><path fill="url(#room-floor)" d="M160 330H840L1000 560H0Z"/>
  <g stroke="#b7a99b" opacity=".3"><path d="M160 330L0 560M330 330L245 560M500 330V560M670 330L755 560M840 330L1000 560M123 383H877M70 458H930"/></g>
  <path d="M25 70L131 101V279L25 348Z" fill="url(#room-window)" stroke="#fff" stroke-width="8"/><path d="M78 87V313M27 211L131 190" stroke="#fff" stroke-width="5"/>
  <path d="M873 103L968 76V286L873 320Z" fill="#b8c6ae"/><path d="M884 116L956 96V269L884 294Z" fill="#eef0e7"/><path d="M901 272Q895 212 938 150Q899 192 901 272M907 232Q930 205 946 222M908 218Q887 198 888 180" fill="none" stroke="#a2b59b" stroke-width="6"/>
  <path d="M300 52V18M700 52V18" stroke="#a79c93" stroke-width="3"/><path d="M264 57Q300 4 336 57ZM664 57Q700 4 736 57Z" fill="#6f6970"/><path d="M272 58H328M672 58H728" stroke="#fff6d8" stroke-width="5"/>
  <g fill="#8e9d83"><ellipse cx="110" cy="342" rx="31" ry="50" transform="rotate(-25 110 342)"/><ellipse cx="143" cy="332" rx="24" ry="54" transform="rotate(20 143 332)"/></g><path d="M100 376H151L144 422H108Z" fill="#f6f1e9"/>
  <ellipse cx="500" cy="477" rx="320" ry="38" fill="#786b6522"/><path d="M314 323V455H340V324M660 324V455H686V323" fill="#a48e73"/><path d="M307 303H693L816 442V461H184V442Z" fill="#b59a78"/><path d="M307 292H693L816 442H184Z" fill="url(#room-table)"/><path d="M356 317H644L695 386H305Z" fill="#c7d0cb" stroke="#fff6e5" stroke-width="5"/>
  <path d="M260 387L310 382L323 402L270 408ZM681 360L728 368L713 385L666 377Z" fill="#faf8f1"/><path d="M279 392L307 389M276 398L315 393M684 369L716 375" stroke="#d2ccc3" stroke-width="2"/>
  <ellipse cx="500" cy="321" rx="14" ry="6" fill="#6f7b76"/><path d="M500 321V305Q500 298 506 298" fill="none" stroke="#6f7b76" stroke-width="3"/>
  </svg>
  <div class="room-wall"><div class="room-idle"><span>STUDYMETA / TEAM SPACE</span><strong class="room-screen-title">함께 만드는 공간</strong><p>화면을 공유하면 여기에 보여요.</p><span class="room-idle-mark">✦</span></div><div id="screen-stage" class="screen-stage" hidden></div></div>
  <div class="room-seats" aria-label="회의실 좌석"></div><span class="room-caption">같은 테이블에서, 어디서든.</span></div>`;
  const room=mount.querySelector('.virtual-room'),toggle=mount.querySelector('#room-screen-toggle');let signature='';
  toggle.onclick=()=>{const expanded=room.classList.toggle('screen-expanded');toggle.textContent=expanded?'회의실로 돌아가기':'공유 화면 크게';toggle.setAttribute('aria-expanded',String(expanded));};
  return {
    update({peers=[],title='함께 만드는 공간',selfId,connectionState}){
      mount.querySelector('.room-screen-title').textContent=title;
      const people=[...new Map(peers.map(p=>[p.user_id,p])).values()].sort((a,b)=>(a.joined_at||a.id).localeCompare(b.joined_at||b.id)).slice(0,3);
      const next=JSON.stringify([selfId,people.map(p=>[p.id,p.user_id,p.muted,p.sharing,profileFor(p.user_id,p.name),connectionState?.(p)])]);if(next===signature)return;signature=next;
      mount.querySelector('.room-seats').innerHTML=[0,1,2].map(i=>{const peer=people[i];if(!peer)return `<div class="room-seat seat-${i} empty"><span class="seat-chair"></span><span class="seat-empty">빈자리</span></div>`;const p=profileFor(peer.user_id,peer.name),url=p.characterUrl||p.photoUrl,state=connectionState?.(peer)||'연결 중',ok=peer.id===selfId||state==='connected',name=escape(p.displayName),status=peer.sharing?'화면 공유 중':!ok?'연결 확인 중':peer.muted?'마이크 꺼짐':'마이크 켜짐';return `<div class="room-seat seat-${i}" data-user-id="${escape(peer.user_id)}"><span class="seat-chair"></span><div class="seat-person ${p.characterUrl?'has-character':'has-portrait'}">${url?`<img src="${escape(url)}" alt="${name}의 ${p.characterUrl?'캐릭터':'프로필'}">`:`<span class="seat-initial">${escape([...p.displayName][0])}</span>`}</div><div class="seat-label"><strong>${name}${peer.id===selfId?' · 나':''}</strong><small class="${ok&&!peer.muted?'mic-on':''}">${status}</small></div></div>`;}).join('');
    },
    screenChanged(sharing){room.classList.toggle('has-screen',sharing);toggle.disabled=!sharing;if(!sharing){room.classList.remove('screen-expanded');toggle.textContent='공유 화면 크게';toggle.setAttribute('aria-expanded','false');}}
  };
}
