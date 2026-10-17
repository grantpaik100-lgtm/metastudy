// Cloud mode and the original offline/local server share the same screens.
let config={cloud:false},user=null;
try {const response=await fetch('/api/config');if(response.ok) config=await response.json();}catch{}
export const cloud=config.cloud===true;
function signIn() {
  const target=window.top===window?location.href:document.referrer;
  const next=new URL(target||location.href).pathname+new URL(target||location.href).search+new URL(target||location.href).hash;
  window.top.location.href='/login.html?next='+encodeURIComponent(next);
}
if(cloud) {
  const response=await fetch('/api/session');
  if(response.status===401) {signIn();await new Promise(()=>{});}
  if(!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다. 새로고침해주세요.');
  user=(await response.json()).user;
  if(user.mustChangePassword) {window.top.location.href='/account.html?first=1';await new Promise(()=>{});}
}
export const identity=user;
const presenceBodies=new Map();
export async function apiFetch(path,options={}) {
  if(path==='/api/presence'&&options.method==='POST') {try{const body=JSON.parse(options.body);presenceBodies.set(body.client,body);}catch{}}
  const response=await fetch(path,options);
  if(cloud&&response.status===401) signIn();
  return response;
}
class CloudEvents extends EventTarget {
  static CLOSED=2;
  readyState=0;onerror=null;closed=false;rev=-1;lastPresence=0;peers={};
  constructor(url){super();this.params=new URL(url,location.origin).searchParams;queueMicrotask(()=>this.poll());}
  emit(type,data){this.dispatchEvent(new MessageEvent(type,{data:JSON.stringify(data)}));}
  async poll(){
    if(this.closed)return;
    try {
      const response=await apiFetch('/api/state'+(this.rev<0?'':'?since='+this.rev));
      if(!response.ok)throw new Error('connection');const data=await response.json();this.readyState=1;
      if(Date.now()-this.lastPresence>15000){const responsePeers=await apiFetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(presenceBodies.get(this.params.get('client'))||{client:this.params.get('client'),color:this.params.get('color')})});if(responsePeers.ok)this.peers=(await responsePeers.json()).peers;this.lastPresence=Date.now();this.emit('presence',{peers:this.peers});}
      if(data.board){this.rev=data.rev;this.emit('hello',{...data,peers:this.peers});}
      this.dispatchEvent(new Event('open'));
    }catch{this.readyState=0;this.onerror?.(new Event('error'));}
    finally{if(!this.closed)this.timer=setTimeout(()=>this.poll(),document.hidden?10000:2500);}
  }
  close(){this.closed=true;this.readyState=2;clearTimeout(this.timer);}
}
export const connectEvents=url=>cloud?new CloudEvents(url):new EventSource(url);
