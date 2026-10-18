import {mkdirSync,copyFileSync} from 'node:fs';
export const assets=['index.html','app.js','styles.css','collab.css','spatial.html','spatial-view.js','structure.css','plane-content.js','product-ui-preview.html','product-preview-bridge.js','board-ops.js','spatial-ops.js','transport.js','login.html','account.html','authorize.html','account.css'];
const root=new URL('../',import.meta.url),out=new URL('public/',root);mkdirSync(out,{recursive:true});
for(const file of assets)copyFileSync(new URL(file,root),new URL(file,out));
console.log(`Workboard: ${assets.length} public assets prepared. Database, seeds and secrets are not public assets.`);
