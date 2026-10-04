import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {Matchmaker} from './matchmaker.mjs';
import {allowsDuelOrigin} from './origins.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
export async function startLocal({port=8787,host='127.0.0.1',transformHTML=html=>html}={}){
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'duel',protocol:4}));return;}
      const path=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
      if(!/^\/(index\.html|assets\/|vendor\/|LICENSE$)/.test(path))throw Error('Not a public asset');
      const file=resolve(root,'.'+path);
      if(!file.startsWith(root+'/'))throw Error('Invalid path');
      let data=await readFile(file);
      if(path==='/index.html')data=transformHTML(data.toString());
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  const sockets=new WebSocketServer({noServer:true,maxPayload:2048});
  const engine=new Matchmaker({send:(s,data)=>s.send(data),close:(s,code,reason)=>s.close(code,reason)});
  server.on('upgrade',(req,socket,head)=>{
    const origin=req.headers.origin;
    if(req.url!=='/ws'||!allowsDuelOrigin(origin,`http://${req.headers.host}`)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    sockets.handleUpgrade(req,socket,head,s=>{
      engine.connect(s);
      s.on('message',(raw,binary)=>engine.receive(s,binary?raw:raw.toString()));
      s.on('close',()=>engine.disconnect(s));s.on('error',()=>engine.disconnect(s));
    });
  });
  let then=performance.now();
  const timer=setInterval(()=>{const now=performance.now();if(engine.active())engine.tick((now-then)/1000);then=now;},1000/60);
  const sweep=setInterval(()=>engine.sweep(),15000);
  await new Promise(ok=>server.listen(port,host,ok));
  return {server,engine,url:`http://${host}:${server.address().port}`,
    async close(){clearInterval(timer);clearInterval(sweep);for(const s of sockets.clients)s.terminate();sockets.close();await new Promise(ok=>server.close(ok));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const app=await startLocal({port:Number(process.env.PORT)||8787,host:process.env.HOST||'127.0.0.1'});
  console.log(`Dahrooj: ${app.url}`);
}
