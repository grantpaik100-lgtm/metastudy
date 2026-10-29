// Add only the private meeting bucket. Does not touch existing buckets or learner tables.
import {fileURLToPath} from 'node:url';
process.loadEnvFile(fileURLToPath(new URL('../.env.local',import.meta.url)));
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
const existing=await fetch(url+'/storage/v1/bucket/workboard-meetings',{headers});
if(existing.ok){const b=await existing.json();if(b.public)throw new Error('The meeting bucket must be private');const r=await fetch(url+'/storage/v1/bucket/workboard-meetings',{method:'PUT',headers,body:JSON.stringify({public:false,file_size_limit:10*1024*1024})});if(!r.ok)throw new Error('Bucket configuration failed');console.log('Private meeting bucket configured');}
else if(existing.status===404||existing.status===400){const r=await fetch(url+'/storage/v1/bucket',{method:'POST',headers,body:JSON.stringify({id:'workboard-meetings',name:'workboard-meetings',public:false,file_size_limit:10*1024*1024})});if(!r.ok)throw new Error('Bucket setup failed: '+r.status);console.log('Private meeting bucket created');}
else throw new Error('Bucket check failed: '+existing.status);
