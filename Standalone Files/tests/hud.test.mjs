import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {packSkeleton} from '../companion/public/skeleton.mjs';
import {emptyPose} from '../companion/public/retarget.mjs';
const protocol=createRequire(import.meta.url)('../resource/webcam_mocap_animlab/protocol.js');
test('skeleton packets retain only bounded screen joints and fit the existing relay limit',()=>{
  const source=Array.from({length:33},()=>({x:.123456789,y:.7654321,z:100,visibility:.99,secret:'omit'}));
  const skeleton=packSkeleton(source,4/3),p={...emptyPose(1),skeleton};
  assert.ok(protocol.validate(p));assert.deepEqual(skeleton.points[0],[.1235,.7654,.99]);
  const clean=protocol.sanitize(p);source[0].x=.5;p.skeleton.points[0][0]=.9;
  assert.equal(clean.skeleton.points[0][0],.1235,'sanitized data is copied');
  assert.ok(JSON.stringify(clean).length<4096);
  for(const bad of [{...skeleton,aspect:NaN},{...skeleton,points:[]},
    {...skeleton,points:Array(33).fill([2,.5,1])},{...skeleton,points:Array(33).fill([.5,.5,NaN])}])
    assert.equal(protocol.validate({...emptyPose(1),skeleton:bad}),false);
  source[0].visibility=.1;source[1].x=-.1;source[2].y=NaN;
  assert.deepEqual(packSkeleton(source,4/3).points.slice(0,3),[null,null,null]);
  assert.equal(packSkeleton(null,4/3),null);
  assert.ok(protocol.validate(emptyPose(2)),'older packets without skeleton remain compatible');
});
test('HUD draws joints, mirrors without stretching, clears lost tracking and never takes input focus',async()=>{
  const elements=new Map(),lines=[],callbacks=[];let handler,watchdog,now=0;
  const ctx=new Proxy({}, {get:(_t,key)=>(...a)=>lines.push([key,...a]),set:()=>true});
  const get=id=>{
    if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',className:'',style:{},getContext:()=>ctx});
    return elements.get(id);
  };
  const script=await readFile(new URL('../resource/webcam_mocap_animlab/hud/hud.js',import.meta.url),'utf8');
  vm.runInContext(script,vm.createContext({document:{getElementById:get},window:{addEventListener:(name,fn)=>{if(name==='message')handler=fn;}},
    GetParentResourceName:()=> 'webcam_mocap_animlab',fetch:url=>{callbacks.push(url);return Promise.resolve({ok:true});},
    performance:{now:()=>now},setInterval:fn=>watchdog=fn}));
  const points=Array(33).fill(null);points[11]=[.3,.2,1];points[12]=[.7,.2,1];
  const data={type:'mocapComparison',visible:true,status:'live',mirrored:true,skeleton:{aspect:4/3,points},elapsed:2,duration:10};
  handler({data});assert.equal(get('panel').hidden,false);assert.equal(get('empty').hidden,true);
  handler({data:{...data,countdown:3}});assert.equal(get('countdown').hidden,false);assert.equal(get('countdown').textContent,'3');
  handler({data:{...data,countdown:null}});assert.equal(get('countdown').hidden,true);assert.equal(get('countdown').textContent,'');
  assert.ok(lines.some(l=>l[0]==='moveTo'&&Math.abs(l[1]-436)<.01),'left/right reflection uses the source aspect');
  lines.length=0;handler({data:{...data,status:'stale',skeleton:null}});
  assert.equal(get('empty').hidden,false);
  assert.ok(!lines.some(l=>l[0]==='arc'),'lost tracking clears old joints');
  handler({data:{...data,scoreVisible:true,score:{total:185,goal:500,lastPoints:85,samples:2,status:'scored'}}});
  assert.equal(get('scorePanel').hidden,false);assert.equal(get('scoreTotal').textContent,'185');
  assert.equal(get('scoreGoal').textContent,'500');
  assert.equal(get('scoreDetail').textContent,'+85 / 100');
  handler({data:{...data,visible:false,scoreVisible:true,score:{total:185,samples:2,finished:true}}});
  assert.equal(get('panel').hidden,true);assert.equal(get('scorePanel').hidden,false);
  assert.equal(get('scoreLabel').textContent,'FINAL SCORE');
  now=2000;watchdog();assert.equal(get('panel').hidden,true,'orphaned HUD disappears');
  assert.equal(get('scorePanel').hidden,true);
  assert.ok(!/getUserMedia|\.focus\(/.test(script),'HUD never requests a camera or input focus');
  assert.deepEqual(callbacks,['https://webcam_mocap_animlab/mocapHudReady','https://webcam_mocap_animlab/mocapHudRendered']);
  const manifest=await readFile(new URL('../resource/webcam_mocap_animlab/fxmanifest.lua',import.meta.url),'utf8');
  for(const path of ['hud/index.html','hud/hud.css','hud/hud.js'])assert.ok(manifest.includes(path));
});
test('visit music switches exclusively, resumes background, restarts replays and stops on watchdog or exit',async()=>{
  const handlers={},players=[];let watchdog,now=0;
  class Audio {
    constructor(src){Object.assign(this,{src,currentTime:0,duration:60,paused:true,plays:0,events:{}});players.push(this);}
    addEventListener(name,fn){this.events[name]=fn;}
    pause(){this.paused=true;}
    play(){this.paused=false;this.plays++;return Promise.resolve();}
  }
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/hud/hud.js',import.meta.url),'utf8'),vm.createContext({
    Audio,console,document:{getElementById:()=>({getContext:()=>ctx})},
    window:{addEventListener:(name,fn)=>handlers[name]=fn},performance:{now:()=>now},setInterval:fn=>watchdog=fn,
  }));
  const send=music=>handlers.message({data:{type:'mocapComparison',visible:false,music}});
  send({mode:'background',file:'background.ogg',volume:.35,session:null});
  const bg=players[0];assert.equal(bg.paused,false);assert.equal(bg.loop,true);assert.equal(bg.volume,.35);
  bg.currentTime=12;
  send({mode:'background',file:'background.ogg',volume:.35,session:null});assert.equal(bg.plays,1,'heartbeat does not restart audio');
  send({mode:'waiting',file:null});
  assert.equal(bg.paused,true);assert.equal(bg.currentTime,12,'music delay pauses background without resetting its position');
  assert.equal(players.length,1,'music wait never creates or starts the animation audio');
  send({mode:'animation',file:'dance.mp3',volume:.7,seconds:0,session:100});
  const dance=players[1];assert.equal(bg.paused,true);assert.equal(dance.paused,false);assert.equal(dance.loop,false);
  send({mode:'animation',file:'dance.mp3',volume:.7,seconds:4,session:100});
  assert.equal(dance.currentTime,0,'a stalled fallback player must not be re-seeked on every heartbeat');
  dance.currentTime=4; // Simulate normal device-clock progress.
  dance.duration=NaN;
  send({mode:'animation',file:'dance.mp3',seconds:7,session:100});
  dance.duration=60;dance.events.loadedmetadata();assert.equal(dance.currentTime,7);
  send({mode:'background',file:'background.ogg',session:null});
  assert.equal(dance.paused,true);assert.equal(bg.paused,false);assert.equal(bg.currentTime,12);
  send({mode:'animation',file:'dance.mp3',seconds:0,session:200});assert.equal(dance.currentTime,0);
  assert.equal(dance.plays,2,'each replay restarts animation music');
  send({mode:'off'});assert.ok(players.every(p=>p.paused&&p.currentTime===0));
  send({mode:'background',file:'background.ogg',session:null});now=2000;watchdog();
  assert.ok(players.every(p=>p.paused),'lost game messages stop music even with the HUD hidden');
  send({mode:'background',file:'../bad.ogg'});assert.equal(players.length,2);
  send({mode:'background',file:'background.ogg',session:null});handlers.pagehide();assert.ok(players.every(p=>p.paused));
});

test('audio playback rejection and decode errors reach FiveM diagnostics; a rejected play can retry',async()=>{
  const handlers={},reports=[],players=[];let now=0;
  class Audio {
    constructor(){Object.assign(this,{paused:true,currentTime:0,duration:60,events:{},attempts:0});players.push(this);}
    addEventListener(name,fn){this.events[name]=fn;}
    pause(){this.paused=true;}
    play(){if(++this.attempts===1)return Promise.reject(Object.assign(new Error('Playback blocked'),{name:'NotAllowedError'}));this.paused=false;return Promise.resolve();}
  }
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/hud/hud.js',import.meta.url),'utf8'),vm.createContext({
    Audio,document:{getElementById:()=>({getContext:()=>ctx})},window:{addEventListener:(name,fn)=>handlers[name]=fn},
    GetParentResourceName:()=> 'webcam_mocap_animlab',performance:{now:()=>now},setInterval(){},
    fetch:(url,options)=>{reports.push([url,JSON.parse(options.body)]);return Promise.resolve();},
  }));
  const send=()=>handlers.message({data:{type:'mocapComparison',music:{mode:'background',file:'background.ogg',session:null}}});
  send();await Promise.resolve();
  assert.ok(reports.some(r=>r[1].kind==='warning'&&r[1].detail.includes('HTML audio fallback')),'fallback cannot silently masquerade as crossfaded audio');
  assert.match(reports.at(-1)[1].detail,/NotAllowedError/);
  now=2500;send();await Promise.resolve();assert.equal(players[0].attempts,2);assert.equal(players[0].paused,false);
  players[0].error={code:3};players[0].events.error();assert.match(reports.at(-1)[1].detail,/decoding failed/);
  handlers.message({data:{type:'mocapMusicQuery'}});assert.equal(reports.at(-1)[1].kind,'status');
});

test('bundled HUD shares one audio context, reports source lifecycle and stops on exit/watchdog',async()=>{
  const handlers={},sources=[],players=[],contexts=[],reports=[];let watchdog,now=0;
  class AudioContext {
    constructor(){this.currentTime=0;this.state='running';this.destination={};contexts.push(this);}
    resume(){return Promise.resolve();}
    createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:i=>data[i]};}
    decodeAudioData(){return Promise.resolve(this.createBuffer(1,1000,100));}
    createGain(){return {gain:{setValueAtTime(){}},connect(){},disconnect(){}};}
    createBufferSource(){const source={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};sources.push(source);return source;}
  }
  class Audio {
    constructor(){players.push(this);this.currentTime=0;this.duration=60;this.paused=true;}
    addEventListener(){}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}
  }
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/hud/hud.js',import.meta.url),'utf8'),vm.createContext({
    AudioContext,Audio,document:{getElementById:()=>({getContext:()=>ctx})},
    window:{addEventListener:(name,fn)=>handlers[name]=fn},performance:{now:()=>now},setInterval:fn=>watchdog=fn,
    GetParentResourceName:()=> 'webcam_mocap_animlab',
    fetch:async(_url,options)=>{if(options)reports.push(JSON.parse(options.body));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};},
  }));
  const send=music=>handlers.message({data:{type:'mocapComparison',visible:false,music}});
  send({mode:'background',file:'background.ogg',volume:.35,crossfadeSeconds:2});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,0,'background uses decoded audio even when only hud.js is loaded');
  assert.equal(sources.length,1);assert.equal(sources[0].buffer.duration,8);assert.equal(sources[0].loop,true);
  send({mode:'animation',file:'animation.ogg',volume:.7,seconds:0,session:1});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(players.length,0,'animation also uses decoded Web Audio');assert.equal(sources[0].stopped,true);
  assert.equal(sources.length,2);assert.equal(sources[1].loop,false);assert.equal(sources[1].buffer.duration,10,'animation is not shortened or crossfaded');
  send({mode:'animation',file:'animation.ogg',volume:.7,seconds:6,session:1});
  assert.equal(sources.length,2,'large game-time drift does not interrupt or recreate the playing source');
  assert.equal(contexts.length,1,'background and animation must use the same audio device context');
  contexts[0].currentTime=3;
  handlers.message({data:{type:'mocapMusicQuery'}});
  const status=reports.at(-1);
  assert.equal(status.backend,'decoded-animation');assert.equal(status.starts,1);assert.equal(status.stops,0);
  assert.equal(status.time,3);assert.equal(status.audioClock,3);assert.equal(status.sessionChanges,1);
  assert.equal(status.diagnostics.messages,3);assert.equal(status.diagnostics.watchdogStops,0);
  send({mode:'background',file:'background.ogg',volume:.35,crossfadeSeconds:2});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(sources[1].stopped,true);assert.equal(sources.length,3);
  now=2000;watchdog();assert.equal(sources[2].stopped,true);
  handlers.message({data:{type:'mocapMusicQuery'}});assert.equal(reports.at(-1).diagnostics.watchdogStops,1);
  send({mode:'background',file:'background.ogg',volume:.35,crossfadeSeconds:2});
  await new Promise(resolve=>setImmediate(resolve));handlers.pagehide();assert.equal(sources[3].stopped,true);
});

test('the shipped HUD bundle includes its canonical crossfade engine and needs no separate browser script',async()=>{
  const root=new URL('../resource/webcam_mocap_animlab/hud/',import.meta.url);
  const [engine,core,bundle,html]=await Promise.all(['crossfade-audio.js','hud-core.js','hud.js','index.html'].map(name=>readFile(new URL(name,root),'utf8')));
  assert.ok(bundle.includes('MOCAP_CROSSFADE_BUNDLED'));
  assert.ok(bundle.endsWith(engine+'\n;\n'+core),'generated HUD matches the tested source');
  assert.ok(!html.includes('src="crossfade-audio.js"'));
});
test('visit pairing forwards validated skeletons and returns HUD mode; stopping revokes the token',async()=>{
  const commands={},messages=[];let httpHandler;
  vm.runInContext(await readFile(new URL('../resource/webcam_mocap_animlab/server.js',import.meta.url),'utf8'),vm.createContext({
    require:createRequire(import.meta.url),PoseProtocol:protocol,
    RegisterCommand:(name,fn)=>commands[name]=fn,IsPlayerAceAllowed:()=>true,
    emitNet:(...args)=>messages.push(args),on(){},onNet(){},setInterval(){},SetHttpHandler:fn=>httpHandler=fn,
  }));
  commands.mocaplabvisit(7,[]);const token=messages.at(-1)[4];
  function request() {
    let status,result,onData;
    httpHandler({path:'/pose',method:'POST',headers:{authorization:`Bearer ${token}`},setDataHandler:fn=>onData=fn},
      {writeHead:s=>status=s,send:s=>result=s});
    return {send:p=>onData(JSON.stringify(p)),status:()=>status,result:()=>result};
  }
  const p={...emptyPose(1),skeleton:packSkeleton(Array.from({length:33},()=>({x:.5,y:.5,visibility:1})),4/3)};
  const r=request();r.send(p);assert.equal(r.status(),200);assert.equal(JSON.parse(r.result()).mode,'visit');
  const event=messages.find(m=>m[0]==='webcam_mocap_animlab:pose');
  assert.equal(event[1],7);assert.deepEqual(JSON.parse(JSON.stringify(event[2].skeleton)),p.skeleton);
  commands.mocaplabvisit(7,['stop']);assert.equal(request().status(),401);
});
