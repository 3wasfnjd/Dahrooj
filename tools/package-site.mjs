import {cp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
await rm(resolve(root,'site'),{recursive:true,force:true});
await mkdir(resolve(root,'site'));
for(const name of ['index.html','manifest.webmanifest','assets','vendor','LICENSE'])await cp(resolve(root,name),resolve(root,'site',name),{recursive:true});
