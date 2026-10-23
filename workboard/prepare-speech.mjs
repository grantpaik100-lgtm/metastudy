// Vendor pinned browser inference code. No package installer or install scripts are run.
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url),out=new URL('vendor/speech/',root),temp=new URL('test-output/speech-vendor/',root);
await mkdir(out,{recursive:true});await mkdir(temp,{recursive:true});
const versions=[['@huggingface/transformers','3.8.1'],['onnxruntime-web','1.22.0-dev.20250409-89f8206ba4']];
for(const [name,version] of versions){
 const pkg=await(await fetch(`https://registry.npmjs.org/${name}/${version}`)).json();
 const bytes=Buffer.from(await(await fetch(pkg.dist.tarball)).arrayBuffer());
 if(`sha512-${createHash('sha512').update(bytes).digest('base64')}`!==pkg.dist.integrity)throw new Error('Package integrity mismatch');
 const folder=new URL(name.includes('transformers')?'transformers/':'ort/',temp);await mkdir(folder,{recursive:true});
 const archive=new URL('package.tgz',folder);await writeFile(archive,bytes);
 execFileSync('tar',['-xzf',fileURLToPath(archive),'-C',fileURLToPath(folder)]);
 const files=name.includes('transformers')?['dist/transformers.min.js','LICENSE']:['dist/ort-wasm-simd-threaded.jsep.mjs','dist/ort-wasm-simd-threaded.jsep.wasm','README.md'];
 for(const f of files)await copyFile(new URL('package/'+f,folder),new URL(f==='LICENSE'?'TRANSFORMERS-LICENSE.txt':f==='README.md'?'ONNX-README.txt':f.split('/').at(-1),out));
 console.log(`${name}@${version} verified and copied`);
}
const license=await fetch('https://raw.githubusercontent.com/microsoft/onnxruntime/89f8206ba4f1c22c39e0297fb55272e8ce8cd7d0/LICENSE');
if(!license.ok)throw new Error('ONNX license download failed');await writeFile(new URL('ONNX-LICENSE.txt',out),await license.text());
