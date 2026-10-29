import {isSkinSize,characterMarkup} from './block-character.js';
const $=s=>document.querySelector(s);
let profile,pending={},processing=0;
async function api(body){const response=await fetch('/api/profiles',body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message||'프로필을 저장하지 못했어요.');return data;}
function status(text){$('#profile-status').textContent=text;}
function busy(value){for(const el of document.querySelectorAll('#profile-form input[type=file],#profile-form button'))el.disabled=value;}
function preview(kind,src){const img=$('#'+kind+'-preview');if(src){img.src=src;img.hidden=false;}else{img.removeAttribute('src');img.hidden=true;}$('#'+kind+'-empty').hidden=Boolean(src);if(kind==='character')preview3d(src);}
// 캐릭터 전개도(2:1 PNG)를 올리면 회의실과 같은 3D 블록 캐릭터로 돌려 보여준다.
let preview3dToken=0;
function preview3d(src){
  const token=++preview3dToken,box=$('#character-preview').parentElement;box.querySelector('.char3d-stage')?.remove();$('#character-3d-note')?.remove();
  if(!src)return;const probe=new Image();
  probe.onload=()=>{if(token!==preview3dToken||!isSkinSize(probe.naturalWidth,probe.naturalHeight))return;$('#character-preview').hidden=true;
    box.insertAdjacentHTML('beforeend',`<div class="char3d-stage"><div class="char3d-spin">${characterMarkup(src,{label:'내 캐릭터 3D 미리보기'})}</div></div>`);
    box.insertAdjacentHTML('afterend','<p id="character-3d-note" class="char3d-note">전개도를 인식했어요. 회의실에서 3D 블록 캐릭터로 서요.</p>');};
  probe.src=src;
}
async function prepareImage(file,kind){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('10MB 이하의 PNG, JPEG, WebP 이미지를 골라주세요.');
  const bitmap=await createImageBitmap(file);
  // 캐릭터 전개도는 픽셀이 뭉개지지 않게 확대·축소 보간 없이 PNG로 저장한다.
  if(kind==='character'&&isSkinSize(bitmap.width,bitmap.height))try{const w=Math.min(512,bitmap.width),canvas=document.createElement('canvas');canvas.width=w;canvas.height=w/2;const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0,w,w/2);const data=canvas.toDataURL('image/png');if(data.length>350000)throw new Error('전개도가 너무 복잡해요. 256×128 크기로 줄여서 올려주세요.');return data;}finally{bitmap.close();}
  try{const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/webp',.86);if(data.length>350000)throw new Error('이미지가 복잡해요. 조금 작은 이미지로 다시 올려주세요.');return data;}finally{bitmap.close();}
}
try{
  const response=await fetch('/api/session'),session=await response.json();
  if(response.ok&&!session.user.mustChangePassword){
    const data=await api();profile=data.profiles.find(p=>p.userId===session.user.id);
    $('#profile-section').hidden=false;$('#display-name').value=profile.displayName;$('#login-name').textContent=profile.loginName;
    $('#companion-enabled').checked=profile.companionEnabled;preview('photo',profile.photoUrl);preview('character',profile.characterUrl);
    for(const kind of ['photo','character']){
      $('#'+kind+'-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;processing++;busy(true);status('이미지를 준비하고 있어요…');try{const data=await prepareImage(file,kind);pending[kind+'Data']=data;preview(kind,data);status('미리보기를 확인한 뒤 저장해주세요.');}catch(error){status(error.message);}finally{processing--;busy(processing>0);e.target.value='';}});
      $('#remove-'+kind).onclick=()=>{pending[kind+'Data']=null;preview(kind,null);status('저장하면 이미지가 삭제돼요.');};
    }
    $('#profile-form').addEventListener('submit',async e=>{e.preventDefault();if(processing)return;busy(true);try{const result=await api({displayName:$('#display-name').value,companionEnabled:$('#companion-enabled').checked,expectedVersion:profile.version,...pending});profile=result.profile;pending={};preview('photo',profile.photoUrl);preview('character',profile.characterUrl);status('저장했어요. 작업판과 회의실에 반영됩니다.');}catch(error){status(error.message);}finally{busy(false);}});
  }
}catch(error){$('#profile-section').hidden=false;$('#save-profile').disabled=true;status(error.message);}
