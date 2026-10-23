import { pipeline, env } from './vendor/speech/transformers.min.js';
env.allowLocalModels=false;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/speech/',import.meta.url).href;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
let recognizer;
const model='onnx-community/whisper-small';
const revision='36050c46d777d46dc4b5f43f6d90574fc38f8732';
self.onmessage=async({data})=>{
 try {
  if(!recognizer)recognizer=await pipeline('automatic-speech-recognition',model,{revision,device:'wasm',dtype:'q8',progress_callback:p=>self.postMessage({type:'progress',status:p.status,file:p.file,progress:p.progress})});
  self.postMessage({type:'recognizing'});
  const samples=data.samples;
  let energy=0;for(const s of samples)energy+=s*s;
  if(Math.sqrt(energy/samples.length)<0.0002){self.postMessage({type:'result',segments:[],model:model+'@'+revision.slice(0,8)});return;}
  const result=await recognizer(samples,{language:data.language==='auto'?undefined:(data.language||'korean'),task:'transcribe',return_timestamps:true,chunk_length_s:25,stride_length_s:3,max_new_tokens:160,do_sample:false});
  const duration=samples.length/16000;
  const segments=(result.chunks||[{text:result.text,timestamp:[0,duration]}]).filter(c=>c.text.trim()).map(c=>({start:Math.min(duration,Math.max(0,c.timestamp?.[0]||0)),end:Math.min(duration,c.timestamp?.[1]??duration),text:c.text.trim()}));
  self.postMessage({type:'result',segments,model:model+'@'+revision.slice(0,8)});
 }catch(error){recognizer=null;self.postMessage({type:'error',message:error.message||'음성 변환에 실패했어요.'});}
};
