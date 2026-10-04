import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {allowsDuelOrigin} from '../server/origins.mjs';

const source=readFileSync(new URL('../assets/duel-online/client.js',import.meta.url),'utf8');
test('the original Pages address connects to the Duel Worker without navigating away',()=>{
  for(const [address,expected] of [
    ['https://3wasfnjd.github.io/Dahrooj/','wss://dahrooj-duel.glory-noon.workers.dev/ws'],
    ['https://3wasfnjd.github.io/Dahrooj/index.html?play=1','wss://dahrooj-duel.glory-noon.workers.dev/ws'],
    ['https://dahrooj-duel.glory-noon.workers.dev/','wss://dahrooj-duel.glory-noon.workers.dev/ws'],
    ['http://127.0.0.1:8787/','ws://127.0.0.1:8787/ws'],
    ['https://preview.example/','wss://preview.example/ws']
  ]){
    const opened=[],location=new URL(address),context={
      location,URL,addEventListener(){},removeEventListener(){},
      setTimeout(){},clearTimeout(){},clearInterval(){},
      WebSocket:class {constructor(url){opened.push(url.href);}close(){}}
    };
    runInNewContext(source,context);
    const client=new context.DahroojDuelClient();
    assert.equal(opened.length,0,'Other modes do not connect');
    client.enter('fabric');assert.deepEqual(opened,[expected]);
    assert.equal(location.href,address,'The player keeps the original address');
    client.leave();
  }
});

test('only the exact Pages origin and the server origin may enter Duel',()=>{
  const server='https://dahrooj-duel.glory-noon.workers.dev';
  assert(allowsDuelOrigin(server,server));
  assert(allowsDuelOrigin('https://3wasfnjd.github.io',server));
  for(const origin of [null,undefined,'null','https://unrelated.example','https://other.github.io',
    'https://3wasfnjd.github.io.unrelated.example','http://3wasfnjd.github.io','https://3wasfnjd.github.io/Dahrooj/']){
    assert.equal(allowsDuelOrigin(origin,server),false,String(origin));
  }
});
