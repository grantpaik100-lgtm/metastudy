import { HttpError } from './store.mjs';
const columns='user_id,display_name,has_photo,has_character,companion_enabled,version,updated_at';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function imageData(value){
  if(value===null)return null;
  if(typeof value!=='string'||value.length>350000)throw new HttpError(400,'이미지는 256KB 이하로 준비해주세요.');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)throw new HttpError(400,'PNG, JPEG, WebP 이미지만 사용할 수 있어요.');
  const bytes=Buffer.from(match[2],'base64'),kind=match[1];
  const valid=kind==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):kind==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!valid||bytes.length>256*1024||bytes.length<16)throw new HttpError(400,'이미지 파일을 확인해주세요.');
  return value;
}
export function createProfiles(store){
  const scope={board_id:`eq.${store.boardId}`};
  function present(row,member){
    const image=kind=>`/api/profiles/image?user=${member.id}&kind=${kind}&v=${row.version}`;
    return {userId:member.id,loginName:member.username,displayName:row?.display_name||member.username,photoUrl:row?.has_photo?image('photo'):null,characterUrl:row?.has_character?image('character'):null,companionEnabled:row?.companion_enabled??true,version:row?.version||0};
  }
  async function list(){
    const [rows,members]=await Promise.all([store.rows('profiles',{...scope,select:columns}),store.rows('members',{enabled:'eq.true',select:'id,username',order:'created_at.asc'})]);
    return {profiles:members.map(m=>present(rows.find(p=>p.user_id===m.id),m))};
  }
  async function save(user,input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['displayName','photoData','characterData','companionEnabled','expectedVersion'].includes(k)))throw new HttpError(400,'내 프로필의 설정만 변경할 수 있어요.');
    const name=typeof input.displayName==='string'?input.displayName.trim():'';
    if(!name||[...name].length>32||/[\u0000-\u001f\u007f]/.test(name))throw new HttpError(400,'표시 이름은 1~32자로 입력해주세요.');
    if(typeof input.companionEnabled!=='boolean'||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0)throw new HttpError(400,'프로필 설정을 다시 불러와주세요.');
    const values={display_name:name,companion_enabled:input.companionEnabled,updated_at:new Date().toISOString(),version:input.expectedVersion+1};
    for(const [field,column] of [['photoData','photo_data'],['characterData','character_data']])if(Object.hasOwn(input,field))values[column]=imageData(input[field]);
    let rows;
    if(input.expectedVersion===0)rows=await store.rest('workboard_profiles',{on_conflict:'board_id,user_id'},{method:'POST',body:{...values,board_id:store.boardId,user_id:user.id},prefer:'resolution=ignore-duplicates,return=representation'});
    else rows=await store.patch('profiles',{...scope,user_id:`eq.${user.id}`,version:`eq.${input.expectedVersion}`},values);
    if(!rows?.length)throw new HttpError(409,'다른 창에서 프로필을 바꿨어요. 새로고침 후 다시 저장해주세요.');
    return {profile:present(rows[0],user)};
  }
  async function image(userId,kind){
    if(!uuid.test(userId||'')||!['photo','character'].includes(kind))throw new HttpError(400,'이미지 주소를 확인해주세요.');
    const member=await store.first('members',{id:`eq.${userId}`,enabled:'eq.true',select:'id'});
    const row=member&&await store.first('profiles',{...scope,user_id:`eq.${userId}`,select:kind+'_data'});
    const value=row?.[kind+'_data'];if(!value)throw new HttpError(404,'등록된 이미지가 없어요.');
    const [header,encoded]=value.split(',');return {type:header.slice(5,-7),bytes:Buffer.from(encoded,'base64')};
  }
  return {list,save,image};
}
