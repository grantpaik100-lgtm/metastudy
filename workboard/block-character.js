// 블록 캐릭터: 전개도(2:1 PNG) 한 장을 CSS 3D 상자 6개로 조립한다.
// 전개도 규격은 64×32 텍셀 기준이며, 같은 비율의 큰 이미지(128×64, 512×256 …)도 그대로 쓸 수 있다.
// 각 부위는 일반적인 상자 전개도(윗면·아랫면 / 오른쪽·앞·왼쪽·뒤)로 펼쳐져 있다.

export const SKIN_W=64,SKIN_H=32;
// u,v: 전개도 왼쪽 위 좌표 / w: 가로, h: 세로, d: 깊이 (텍셀) / x,y,z: 발밑 중심 기준 부위 중심 위치
export const PARTS={
  head:{label:'머리',u:0,v:0,w:8,h:8,d:8,x:0,y:-13,z:0},
  body:{label:'몸',u:32,v:0,w:8,h:6,d:4,x:0,y:-6,z:0},
  armR:{label:'오른팔',u:0,v:16,w:3,h:6,d:4,x:-5.5,y:-6,z:0},
  armL:{label:'왼팔',u:14,v:16,w:3,h:6,d:4,x:5.5,y:-6,z:0},
  legR:{label:'오른다리',u:28,v:16,w:4,h:3,d:4,x:-2,y:-1.5,z:0},
  legL:{label:'왼다리',u:44,v:16,w:4,h:3,d:4,x:2,y:-1.5,z:0}
};
// 캐릭터의 오른쪽(right)은 정면에서 볼 때 화면 왼쪽이다.
export function faceRects({u,v,w,h,d}){
  return {top:[u+d,v,w,d],bottom:[u+d+w,v,w,d],right:[u,v+d,d,h],front:[u+d,v+d,w,h],left:[u+d+w,v+d,d,h],back:[u+2*d+w,v+d,w,h]};
}
const FACE_TRANSFORM={
  front:(p)=>`translateZ(${p.d/2}px)`,
  back:(p)=>`rotateY(180deg) translateZ(${p.d/2}px)`,
  right:(p)=>`rotateY(-90deg) translateZ(${p.w/2}px)`,
  left:(p)=>`rotateY(90deg) translateZ(${p.w/2}px)`,
  top:(p)=>`rotateX(90deg) translateZ(${p.h/2}px)`,
  bottom:(p)=>`rotateX(-90deg) translateZ(${p.h/2}px)`
};
const t=n=>`calc(var(--t) * ${+n.toFixed(3)})`;
// px 단위로 쓴 transform 문자열의 숫자를 텍셀 단위(var(--t))로 바꾼다.
const tx=s=>s.replace(/(-?\d*\.?\d+)px/g,(_,n)=>t(+n));

export const isSkinSize=(w,h)=>w>=SKIN_W&&w<=1024&&w===h*2&&w%SKIN_W===0;

const kinds=new Map();
// 이미지가 전개도(skin)인지 일반 그림(sprite)인지 판별한다. 아직 모르면 undefined를 돌려주고 판별이 끝나면 onReady를 부른다.
export function imageKind(url,onReady){
  if(!url)return null;
  const known=kinds.get(url);if(known&&known!=='loading')return known;
  if(!known){kinds.set(url,'loading');const img=new Image();img.onload=()=>{kinds.set(url,isSkinSize(img.naturalWidth,img.naturalHeight)?'skin':'sprite');onReady?.();};img.onerror=()=>{kinds.set(url,'sprite');onReady?.();};img.src=url;}
  return undefined;
}

const css=s=>String(s).replace(/["'\\<>()]/g,'').replace(/&/g,'&amp;');
export function partMarkup(name,skin,{colors}={}){
  const p=PARTS[name],r=faceRects(p);
  const faces=Object.entries(r).map(([face,[fu,fv,fw,fh]])=>{
    const style=[`width:${t(fw)}`,`height:${t(fh)}`,`left:${t((p.w-fw)/2)}`,`top:${t((p.h-fh)/2)}`,`transform:${tx(FACE_TRANSFORM[face](p))}`];
    if(skin)style.push(`background-image:url('${css(skin)}')`,`background-position:${t(-fu)} ${t(-fv)}`);
    else if(colors)style.push(`background:${colors[face]||colors.side}`);
    return `<i class="bc-face bc-${face}" style="${style.join(';')}"></i>`;
  }).join('');
  return `<div class="bc-part bc-${name}" style="width:${t(p.w)};height:${t(p.h)};margin:${t(-p.h/2)} 0 0 ${t(-p.w/2)};--px:${t(p.x)};--py:${t(p.y)};--pz:${t(p.z)}">${faces}</div>`;
}
// 전개도 한 장으로 만든 3D 블록 캐릭터. 부모가 transform-style: preserve-3d 이고 --t(텍셀 크기)를 정해야 한다.
export function characterMarkup(skin,{label=''}={}){
  return `<div class="bc" role="img" aria-label="${css(label)}">${Object.keys(PARTS).map(n=>partMarkup(n,skin)).join('')}</div>`;
}
// 전개도 그림이 아닌 일반 캐릭터 이미지는 세워 둔 판(스탠디)으로 보여준다.
export function standeeMarkup(url,{label=''}={}){
  return `<div class="bc bc-standee"><img src="${css(url)}" alt="${css(label)}" draggable="false"></div>`;
}

// ── 기본 캐릭터 (오리지널) ─────────────────────────────────────────
function painter(ctx){
  const rect=(part,face)=>faceRects(PARTS[part])[face];
  const api={
    fill(part,face,color){const [x,y,w,h]=rect(part,face);ctx.fillStyle=color;ctx.fillRect(x,y,w,h);return api;},
    all(part,color){for(const f of ['top','bottom','right','front','left','back'])api.fill(part,f,color);return api;},
    px(part,face,x,y,w,h,color){const [fx,fy]=rect(part,face);ctx.fillStyle=color;ctx.fillRect(fx+x,fy+y,w,h);return api;},
    // 옆·앞·뒤 네 면을 같은 높이로 두르는 띠 (모자, 소매, 바지 등)
    band(part,y,h,color){for(const f of ['right','front','left','back']){const [,, w]=rect(part,f);api.px(part,f,0,y,w,h,color);}return api;}
  };
  return api;
}
const PRESETS=[
  // 0 · 새싹 비니
  (p)=>{const skin='#f1c7a3',hood='#efe6d4',hat='#7fa37a';
    p.all('head',skin).band('head',0,3,hat).band('head',2,1,'#6b8d66').fill('head','top',hat).px('head','top',3,3,2,2,'#9cc48f').px('head','top',4,3,1,1,'#b9dba9');
    p.band('head',3,1,'#5a4636').px('head','front',1,3,6,1,skin).px('head','back',0,3,8,2,'#5a4636');
    p.px('head','front',2,4,1,2,'#2d2a33').px('head','front',5,4,1,2,'#2d2a33').px('head','front',1,6,1,1,'#f2a1a1').px('head','front',6,6,1,1,'#f2a1a1').px('head','front',3,6,2,1,'#c07b67');
    p.all('body',hood).px('body','front',3,0,1,3,'#cbbfa8').px('body','front',5,0,1,3,'#cbbfa8').px('body','front',2,4,4,2,'#e2d7c2').px('body','back',1,0,6,2,'#e2d7c2');
    for(const a of ['armR','armL'])p.all(a,hood).band(a,5,1,skin).fill(a,'bottom',skin);
    for(const l of ['legR','legL'])p.all(l,'#6e5a4b').band(l,2,1,'#3e3a3a').fill(l,'bottom','#3e3a3a');},
  // 1 · 라벤더 단발
  (p)=>{const skin='#e8b892',hair='#8e78b8',knit='#a693c9';
    p.all('head',hair).px('head','front',0,3,8,5,skin).px('head','front',0,3,1,4,hair).px('head','front',7,3,1,4,hair).px('head','front',2,2,1,1,skin).px('head','front',5,2,1,1,skin).px('head','front',6,1,1,1,'#f3d36b');
    p.px('head','right',0,6,8,2,skin).px('head','left',0,6,8,2,skin).px('head','right',0,6,3,1,hair).px('head','left',5,6,3,1,hair).fill('head','bottom',skin);
    p.px('head','front',2,4,1,2,'#2d2a33').px('head','front',5,4,1,2,'#2d2a33').px('head','front',1,6,1,1,'#f2a1a1').px('head','front',6,6,1,1,'#f2a1a1').px('head','front',3,6,2,1,'#c07b67');
    p.all('body',knit).px('body','front',3,0,2,6,'#f7f4ee').px('body','front',3,0,2,1,'#e6e0d6').px('body','front',2,2,1,1,'#f3d36b').px('body','front',2,4,1,1,'#f3d36b');
    for(const a of ['armR','armL'])p.all(a,knit).band(a,4,1,'#9483b8').band(a,5,1,skin).fill(a,'bottom',skin);
    for(const l of ['legR','legL'])p.all(l,'#3d4566').band(l,2,1,'#8b5e4a').fill(l,'bottom','#8b5e4a');},
  // 2 · 클레이 안경
  (p)=>{const skin='#c98e6b',hair='#2f2b2b',coat='#c9775a';
    p.all('head',skin).fill('head','top',hair).band('head',0,2,hair).px('head','front',0,2,3,1,hair).px('head','back',0,2,8,3,hair).px('head','right',3,2,5,2,hair).px('head','left',0,2,5,2,hair);
    p.px('head','front',1,4,3,2,'#3a3436').px('head','front',4,4,3,2,'#3a3436').px('head','front',2,4,1,1,'#dfe7ea').px('head','front',5,4,1,1,'#dfe7ea').px('head','front',2,5,1,1,'#1d1b1b').px('head','front',5,5,1,1,'#1d1b1b').px('head','front',3,6,2,1,'#e7a58a');
    p.px('head','right',0,4,8,1,'#3a3436').px('head','left',0,4,8,1,'#3a3436');
    p.all('body',coat).band('body',0,1,'#b0624a').px('body','front',4,0,1,6,'#e9d8c4').px('body','front',1,3,2,1,'#b0624a');
    for(const a of ['armR','armL'])p.all(a,coat).band(a,5,1,skin).fill(a,'bottom',skin);
    for(const l of ['legR','legL'])p.all(l,'#7c7f86').band(l,2,1,'#f2efe8').fill(l,'bottom','#f2efe8');}
];
export const DEFAULT_SKIN_COUNT=PRESETS.length;
const skinCache=new Map();
export function defaultSkin(index){
  index=((index%PRESETS.length)+PRESETS.length)%PRESETS.length;
  if(skinCache.has(index))return skinCache.get(index);
  const c=document.createElement('canvas');c.width=SKIN_W;c.height=SKIN_H;PRESETS[index](painter(c.getContext('2d')));
  const url=c.toDataURL('image/png');skinCache.set(index,url);return url;
}
export const skinIndexFor=id=>[...String(id||'')].reduce((h,ch)=>(h*31+ch.codePointAt(0))>>>0,7)%PRESETS.length;

// 정면 모습 한 장(2D)으로 합친다. 떠 있는 캐릭터·미리보기용.
export async function frontSprite(skinUrl,scale=10){
  const img=new Image();img.src=skinUrl;await img.decode();
  const k=img.naturalWidth/SKIN_W,c=document.createElement('canvas');c.width=14*scale;c.height=17*scale;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  const draw=(part,dx,dy)=>{const [x,y,w,h]=faceRects(PARTS[part]).front;ctx.drawImage(img,x*k,y*k,w*k,h*k,dx*scale,dy*scale,w*scale,h*scale);};
  draw('armR',0,8);draw('armL',11,8);draw('legR',3,14);draw('legL',7,14);draw('body',3,8);draw('head',3,0);
  return c.toDataURL('image/png');
}
