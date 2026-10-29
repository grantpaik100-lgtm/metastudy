// Cloud mode and the original offline/local server share the same screens.
const BRIDGE='__workboardSharedTransport';
let parentTransport;
try {
  // Only the workboard's own same-origin map inherits its authenticated transport.
  if(window.parent!==window&&window.frameElement?.id==='spatial-frame') parentTransport=window.parent[BRIDGE];
}catch{} // A standalone or cross-origin embed keeps its own connection.
let config=parentTransport?{cloud:parentTransport.cloud}:{cloud:false},user=parentTransport?.identity||null;
if(!parentTransport) try {const response=await fetch('/api/config');if(response.ok) config=await response.json();}catch{}
export const cloud=config.cloud===true;
function signIn() {
  const target=window.top===window?location.href:document.referrer;
  const next=new URL(target||location.href).pathname+new URL(target||location.href).search+new URL(target||location.href).hash;
  window.top.location.href='/login.html?next='+encodeURIComponent(next);
}
if(cloud&&!parentTransport) {
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
// One polling loop per browser tab. Embedded maps subscribe to the parent's feed.
// Calls/recording and deletion notices use their own transport and are not paused here.
class CloudFeed {
  clients=new Set();snapshot=null;peers={};rev=-1;lastPresence=0;lastPoll=0;
  lastActivity=Date.now();failures=0;timer=null;inflight=null;forceFull=false;params=null;
  constructor(){
    this.wake=()=>{
      clearTimeout(this.timer);this.timer=null;
      if(!this.canPoll())return;
      this.lastActivity=Date.now();
      this.poll().catch(()=>{});
    };
    document.addEventListener('visibilitychange',this.wake);
    window.addEventListener('online',this.wake);
    window.addEventListener('offline',this.wake);
    window.addEventListener('focus',()=>{if(Date.now()-this.lastPoll>1000)this.wake();});
  }
  activity(){
    const idle=Date.now()-this.lastActivity>=60000;
    this.lastActivity=Date.now();if(idle)this.wake();
  }
  canPoll(){return this.clients.size>0&&!document.hidden&&navigator.onLine!==false;}
  add(client){
    this.clients.add(client);this.params ||= client.params;
    queueMicrotask(()=>{
      if(!this.clients.has(client))return;
      this.replay(client);
      if(!this.timer&&!this.inflight)this.poll().catch(()=>{});
    });
  }
  remove(client){
    this.clients.delete(client);
    if(!this.clients.size){clearTimeout(this.timer);this.timer=null;}
  }
  replay(client){
    if(this.snapshot){client.deliver('hello',{...this.snapshot,peers:this.peers});client.deliver('open');}
  }
  emit(type,data){for(const client of this.clients)client.deliver(type,data);}
  schedule(){
    clearTimeout(this.timer);this.timer=null;
    if(!this.canPoll())return;
    const interval=Date.now()-this.lastActivity>=60000?10000:2500;
    const delay=this.failures?Math.min(60000,2500*2**Math.min(this.failures,5)):interval;
    this.timer=setTimeout(()=>{this.timer=null;this.poll().catch(()=>{});},delay);
  }
  async refresh(){
    // A save/reload must fetch a full snapshot even while the tab is hidden.
    this.forceFull=true;
    if(this.inflight)await this.inflight.catch(()=>{});
    return this.poll(true);
  }
  poll(explicit=false){
    if(this.inflight)return this.inflight;
    if(!explicit&&!this.canPoll())return Promise.resolve();
    clearTimeout(this.timer);this.timer=null;
    const full=this.forceFull;this.forceFull=false;
    this.inflight=this.fetchSnapshot(full).finally(()=>{this.inflight=null;this.schedule();});
    return this.inflight;
  }
  async fetchSnapshot(full){
    try {
      const response=await apiFetch('/api/state'+(full||this.rev<0?'':'?since='+this.rev),{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('connection');
      const data=await response.json();this.lastPoll=Date.now();
      if(data.board){
        if(data.rev!==this.rev)this.lastActivity=Date.now();
        this.rev=data.rev;this.snapshot=data;
        this.emit('hello',{...data,peers:this.peers});
      }
      this.failures=0;this.emit('open');
      // A hidden tab does not keep its board presence alive. Calls have their own heartbeat.
      if(this.canPoll()&&Date.now()-this.lastPresence>=20000){
        const body=presenceBodies.get(this.params.get('client'))||Object.fromEntries(this.params);
        try {
          const responsePeers=await apiFetch('/api/presence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
          if(!responsePeers.ok)throw new Error('presence');
          this.peers=(await responsePeers.json()).peers;
          this.emit('presence',{peers:this.peers});
        }catch{/* Presence failure does not discard an otherwise current board snapshot. */}
        finally{this.lastPresence=Date.now();}
      }
    }catch(error){this.failures++;this.emit('error');throw error;}
  }
}
const feed=cloud?(parentTransport?.feed||new CloudFeed()):null;
const localClients=new Set();
let active=window===window.parent||!!window.frameElement?.getClientRects().length;
class CloudEvents extends EventTarget {
  static CLOSED=2;
  readyState=0;onerror=null;closed=false;
  constructor(url){
    super();this.params=new URL(url,location.origin).searchParams;
    localClients.add(this);if(active)feed.add(this);
  }
  deliver(type,data){
    if(this.closed||!active)return;
    if(type==='error'){this.readyState=0;this.onerror?.(new Event('error'));}
    else if(type==='open'||type==='hello')this.readyState=1;
    this.dispatchEvent(data===undefined?new Event(type):new MessageEvent(type,{data:JSON.stringify(data)}));
  }
  close(){this.closed=true;this.readyState=2;localClients.delete(this);feed.remove(this);}
}
function setActive(next){
  if(active===next)return;active=next;
  for(const client of localClients){if(active)feed.add(client);else feed.remove(client);}
}
if(cloud){
  for(const type of ['pointerdown','keydown','input','wheel'])document.addEventListener(type,()=>feed.activity(),{passive:true,capture:true});
  window.addEventListener('pagehide',()=>setActive(false));
  window.addEventListener('pageshow',()=>setActive(window===window.parent||!!window.frameElement?.getClientRects().length));
}
window[BRIDGE]=Object.freeze({cloud,identity,feed,setActive});
export function setEmbeddedBoardActive(frame,next){
  try{frame?.contentWindow?.[BRIDGE]?.setActive(next);}catch{}
}
export const refreshBoard=()=>feed.refresh();
export const connectEvents=url=>cloud?new CloudEvents(url):new EventSource(url);
