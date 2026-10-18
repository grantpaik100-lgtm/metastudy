import {mkdirSync,copyFileSync} from 'node:fs';
import {assets} from './assets.mjs';
export {assets};
const root=new URL('../',import.meta.url),out=new URL('public/',root);mkdirSync(out,{recursive:true});
for(const file of assets){mkdirSync(new URL('./',new URL(file,out)),{recursive:true});copyFileSync(new URL(file,root),new URL(file,out));}
console.log(`Workboard: ${assets.length} public assets prepared. Database, seeds and secrets are not public assets.`);
