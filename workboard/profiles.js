import {cloud,identity,apiFetch} from './transport.js';
export const profileEvents=new EventTarget();
let profiles=new Map(),loading;
export const profileFor=(id,fallback='팀원')=>profiles.get(id)||{userId:id,displayName:fallback,photoUrl:null,characterUrl:null,companionEnabled:true};
export const escapeProfile=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function avatarMarkup(id,fallback){const p=profileFor(id,fallback);return p.photoUrl?`<img class="profile-photo" src="${escapeProfile(p.photoUrl)}" alt="">`:escapeProfile([...p.displayName][0]||'?');}
export async function refreshProfiles(){
  if(!cloud)return;
  if(loading)return loading;
  loading=(async()=>{const response=await apiFetch('/api/profiles');if(!response.ok)throw new Error('프로필을 불러오지 못했어요.');const data=await response.json(),next=new Map(data.profiles.map(p=>[p.userId,p]));if(JSON.stringify([...next])!==JSON.stringify([...profiles])){profiles=next;profileEvents.dispatchEvent(new Event('change'));}})();
  try{await loading;}finally{loading=null;}
}
if(cloud){refreshProfiles().catch(()=>{});setInterval(()=>{if(!document.hidden)refreshProfiles().catch(()=>{});},30000);window.addEventListener('focus',()=>refreshProfiles().catch(()=>{}));}
export {identity};
