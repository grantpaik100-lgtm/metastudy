import { createHandler } from '../cloud/handler.mjs';
let handler;
export default async function gateway(req,res) {
  try {handler ||= createHandler();await handler(req,res);}
  catch {res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({message:'작업판 서버 설정을 준비하고 있습니다.'}));}
}
