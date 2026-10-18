import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHandler} from './handler.mjs';
try{process.loadEnvFile(fileURLToPath(new URL('../.env.local',import.meta.url)));}catch{}
const port=Number(process.env.PORT)||4176;
const handler=createHandler();
const assets=new Set(['index.html','app.js','styles.css','collab.css','spatial.html','spatial-view.js','structure.css','plane-content.js','product-ui-preview.html','product-preview-bridge.js','board-ops.js','spatial-ops.js','transport.js','login.html','account.html','authorize.html','account.css']);
http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')||pathname.startsWith('/oauth/')||pathname.startsWith('/.well-known/')||pathname==='/mcp')return handler(req,res);
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!assets.has(file)){res.writeHead(404);return res.end();}
  try{const body=await readFile(new URL('../'+file,import.meta.url));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Cloud-backed workboard preview: http://127.0.0.1:${port}`));
