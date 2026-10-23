// Browser-to-browser media. Only signaling and durable recordings use the server.
export class MeetingCall extends EventTarget {
 constructor(api){super();this.api=api;this.connections=new Map();this.peers=[];this.cursor=0;this.muted=false;this.sharing=false;this.active=false;this.recording=false;this.pendingUploads=0;this.clockOffset=0;}
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 async start(room){
  if(this.active||this.stopping)throw new Error('현재 통화가 정리된 뒤 입장해주세요.');
  this.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  this.room=room;this.id=crypto.randomUUID();this.cursor=0;this.muted=false;
  try{const response=await this.api('call',{action:'join',roomId:room.id,peerId:this.id});this.active=true;this.lastOK=Date.now();this.clockOffset=Date.parse(response.serverTime)-Date.now();await this.consume(response);this.poll();}
  catch(error){this.local.getTracks().forEach(t=>t.stop());throw error;}
  this.local.getAudioTracks()[0].onended=()=>{if(this.active){this.emit('error','마이크 연결이 끊겼어요. 다시 입장해주세요.');this.stop();}};
  this.emit('state');
 }
 signal(to,payload){return this.api('call',{action:'signal',roomId:this.room.id,peerId:this.id,to,payload});}
 connection(p){
  if(this.connections.has(p.id))return this.connections.get(p.id);
  const pc=new RTCPeerConnection({iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]});
  const entry={pc,id:p.id,sessionId:this.id,makingOffer:false,ignoreOffer:false,settingAnswer:false,polite:this.id>p.id,candidates:[],chain:Promise.resolve()};this.connections.set(p.id,entry);
  for(const track of this.local.getTracks())pc.addTrack(track,this.local);
  entry.video=pc.addTransceiver('video',{direction:'sendrecv'}).sender;
  if(this.screen)entry.video.replaceTrack(this.screen.getVideoTracks()[0]);
  pc.onicecandidate=({candidate})=>{if(candidate&&this.active&&entry.sessionId===this.id)this.signal(p.id,{type:'candidate',candidate:candidate.toJSON()}).catch(e=>this.emit('error',e.message));};
  pc.onnegotiationneeded=async()=>{try{entry.makingOffer=true;await pc.setLocalDescription();if(this.active&&entry.sessionId===this.id)await this.signal(p.id,{type:pc.localDescription.type,sdp:pc.localDescription.sdp});}catch(e){if(this.active&&entry.sessionId===this.id)this.emit('error',e.message);}finally{entry.makingOffer=false;}};
  pc.ontrack=({track})=>this.emit('track',{peer:p,track,stream:new MediaStream([track])});
  pc.onconnectionstatechange=()=>{this.emit('state');if(pc.connectionState==='failed'&&this.active){pc.restartIce();this.emit('error',`${p.name}님과 직접 연결하지 못했어요. 다른 네트워크로 접속하거나 다시 입장해주세요.`);}};
  return entry;
 }
 async consume(data){
  if(!this.active)return;
  this.room=data.room;this.peers=data.peers;
  if(this.room.ended_at){await this.stop();return;}
  const ids=new Set(this.peers.map(p=>p.id));
  for(const [id,c] of this.connections)if(!ids.has(id)){c.pc.close();this.connections.delete(id);this.emit('remove',id);}
  for(const p of this.peers)if(p.id!==this.id)this.connection(p);
  for(const s of data.signals){const p=this.peers.find(p=>p.id===s.sender);if(!p)continue;const c=this.connection(p);
   c.chain=c.chain.then(async()=>{
    if(!this.active||c.sessionId!==this.id)return;
    const payload=s.payload;
    if(payload.type==='candidate'){if(c.pc.remoteDescription){try{await c.pc.addIceCandidate(payload.candidate);}catch(e){if(!c.ignoreOffer)throw e;}}else c.candidates.push(payload.candidate);return;}
    const collision=payload.type==='offer'&&!(!c.makingOffer&&(c.pc.signalingState==='stable'||c.settingAnswer));
    c.ignoreOffer=!c.polite&&collision;if(c.ignoreOffer)return;
    c.settingAnswer=payload.type==='answer';await c.pc.setRemoteDescription(payload);c.settingAnswer=false;
    for(const candidate of c.candidates.splice(0))await c.pc.addIceCandidate(candidate);
    if(payload.type==='offer'){await c.pc.setLocalDescription();if(this.active&&c.sessionId===this.id)await this.signal(p.id,{type:c.pc.localDescription.type,sdp:c.pc.localDescription.sdp});}
   }).catch(e=>{if(this.active)this.emit('error','통화 연결을 다시 확인 중이에요. '+e.message);});
  }
  this.cursor=data.cursor;
  if(data.room.recording&&!this.recording)this.startRecording();
  if(!data.room.recording&&this.recording)await this.stopRecording();
  if(this.sharing){const winner=this.peers.filter(p=>p.sharing).map(p=>p.id).sort()[0];if(winner&&winner!==this.id){await this.stopSharing();this.emit('error','다른 참여자가 먼저 화면을 공유했어요.');}}
  this.emit('state');
 }
 async poll(){
  if(!this.active)return;
  const sessionId=this.id;
  try{const data=await this.api('call',{action:'poll',roomId:this.room.id,peerId:sessionId,cursor:this.cursor,muted:this.muted,sharing:this.sharing});if(!this.active||this.id!==sessionId)return;await this.consume(data);this.lastOK=Date.now();}
  catch(e){if(this.active&&this.id===sessionId){this.emit('error',e.message);if(this.lastOK&&Date.now()-this.lastOK>40000)await this.stop();}}
  finally{if(this.active&&this.id===sessionId)this.timer=setTimeout(()=>this.poll(),1500);}
 }
 mute(){this.muted=!this.muted;for(const t of this.local?.getAudioTracks()||[])t.enabled=!this.muted;this.emit('state');}
 async share(){
  if(this.peers.some(p=>p.id!==this.id&&p.sharing))throw new Error('현재 공유가 끝난 뒤 화면을 공유해주세요.');
  const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30}},audio:false});
  this.screen=stream;this.sharing=true;const track=stream.getVideoTracks()[0];track.onended=()=>this.stopSharing();
  await Promise.all([...this.connections.values()].map(c=>c.video.replaceTrack(track)));
  this.emit('screen',stream);this.emit('state');
 }
 async stopSharing(){if(this.screen){for(const t of this.screen.getTracks()){t.onended=null;t.stop();}this.screen=null;}this.sharing=false;await Promise.all([...this.connections.values()].map(c=>c.video.replaceTrack(null).catch(()=>{})));this.emit('screen',null);this.emit('state');}
 startRecording(){
  if(this.recording||!this.active)return;
  if(!globalThis.MediaRecorder){this.emit('error','이 브라우저에서는 녹음을 지원하지 않아요.');return;}
  this.recording=true;this.recordChunk();this.emit('state');
 }
 recordChunk(){
  if(!this.recording||!this.active)return;
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(this.local,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:48000});
  const start=Date.now()+this.clockOffset,started=performance.now(),parts=[],roomId=this.room.id;
  this.recorder=recorder;
  recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
  recorder.onerror=e=>this.emit('error','녹음 장치를 확인해주세요. '+(e.error?.message||''));
  recorder.onstop=()=>{
   const duration=(performance.now()-started)/1000;
   if(parts.length&&duration>0.05){const blob=new Blob(parts,{type:recorder.mimeType});this.emit('recorded',{blob,roomId,startedAt:new Date(start).toISOString(),duration});}
   if(this.recording&&this.active)this.recordChunk();
   this.resolveRecording?.();this.resolveRecording=null;
  };
  recorder.start();this.chunkTimer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},20000);
 }
 async stopRecording(){
  this.recording=false;clearTimeout(this.chunkTimer);
  if(this.recorder&&this.recorder.state!=='inactive')await new Promise(resolve=>{this.resolveRecording=resolve;this.recorder.stop();});
  this.emit('state');
 }
 async stop(){
  if(!this.active)return;this.stopping=true;this.active=false;clearTimeout(this.timer);
  try{await this.stopRecording();await this.stopSharing();
   for(const c of this.connections.values())c.pc.close();this.connections.clear();
   for(const t of this.local?.getTracks()||[]){t.onended=null;t.stop();}
   await this.api('call',{action:'leave',roomId:this.room.id,peerId:this.id}).catch(()=>{});this.peers=[];
  }finally{this.stopping=false;this.emit('state');}
 }
}
