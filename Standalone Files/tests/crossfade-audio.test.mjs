import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {makeLoop,CrossfadeBackground,DecodedAnimation}=createRequire(import.meta.url)('../resource/webcam_mocap_animlab/hud/crossfade-audio.js');
function buffer(channels,length,rate) {
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return {numberOfChannels:channels,length,sampleRate:rate,duration:length/rate,getChannelData:i=>data[i]};
}
function context() {
  const sources=[],gains=[];
  return {currentTime:0,destination:{},sources,gains,createBuffer:buffer,resume:async()=>{},decodeAudioData:async()=>buffer(2,1000,100),
    createBufferSource(){const source={connect(){},disconnect(){},start(when,offset){this.startAt=when;this.offset=offset;},stop(){this.stopped=true;}};sources.push(source);return source;},
    createGain(){const gain={connect(){},disconnect(){},gain:{setValueAtTime(value){gain.volume=value;}}};gains.push(gain);return gain;}};
}
test('decoded background loop overlaps its head and tail on every channel without clipping or a rescheduling gap',()=>{
  const ctx=context(),input=buffer(2,10,10);
  input.getChannelData(0).set([0,1,2,3,4,5,6,7,8,9]);input.getChannelData(1).fill(-.5);
  const output=makeLoop(ctx,input,.2);
  assert.equal(output.length,8);assert.deepEqual([...output.getChannelData(0)],[2,3,4,5,6,7,8,1]);
  assert.deepEqual([...output.getChannelData(1)],Array(8).fill(-.5));
  assert.equal(makeLoop(ctx,input,0),input);
  assert.ok(makeLoop(ctx,input,100).length>=input.length*.75,'overlap bounded for short files');
});
test('background uses one continuous looping source, resumes its position and cancels decoding when stopped',async()=>{
  const ctx=context();let loads=0,playing=0;
  const player=new CrossfadeBackground({contextFactory:()=>ctx,fetchAudio:async()=>{loads++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};},onPlaying:()=>playing++});
  player.setTrack('background.ogg',.35,.2);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].loop,true);assert.equal(playing,1);
  assert.equal(ctx.sources[0].buffer.duration,9.8);
  ctx.currentTime=22;player.setTrack('background.ogg',.4,.2);
  assert.equal(ctx.sources.length,1,'heartbeats and multiple loop periods never restart the source');
  player.pause();assert.equal(ctx.sources[0].stopped,true);assert.ok(Math.abs(player.position()-2.4)<1e-5);
  player.setTrack('background.ogg',.4,.2);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.sources.length,2);assert.ok(Math.abs(ctx.sources[1].offset-2.4)<1e-5);assert.equal(loads,1);
  player.pause(true);assert.equal(player.position(),0);
  player.setTrack('new.ogg',.35,.2);player.pause(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.sources.length,2,'no late background audio starts after animation takes over or room closes');
});

test('changing overlap rebuilds the actual audio buffer and reports the amount applied',async()=>{
  const ctx=context(),player=new CrossfadeBackground({contextFactory:()=>ctx,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});
  player.setTrack('background.ogg',.35,.2);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(Math.abs(player.snapshot().crossfadeSeconds-.2)<1e-6);
  player.setTrack('background.ogg',.35,2);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.sources[0].stopped,true);
  assert.equal(player.snapshot().requestedCrossfadeSeconds,2);assert.equal(player.snapshot().crossfadeSeconds,2);
  assert.equal(player.snapshot().sourceSeconds,10);assert.equal(player.snapshot().loopSeconds,8);
  assert.equal(ctx.sources.at(-1).buffer.duration,8);player.pause(true);
});

test('decoded animation plays once on the audio clock without heartbeat seeks, caches decoding and restarts only for a new session',async()=>{
  const ctx=context();let now=0,loads=0;
  const player=new DecodedAnimation({contextFactory:()=>ctx,now:()=>now,fetchAudio:async()=>{loads++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
  player.setTrack('animation.ogg',.7,0,100);await new Promise(setImmediate);
  assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].loop,false);assert.equal(ctx.sources[0].buffer.duration,10);
  ctx.currentTime=1;now=1000;
  for(let seconds=1;seconds<9;seconds++)player.setTrack('animation.ogg',.6,seconds,100);
  assert.equal(ctx.sources.length,1);assert.equal(player.position(),1);assert.equal(ctx.sources[0].offset,0);
  assert.equal(player.snapshot().starts,1);assert.equal(player.snapshot().stops,0);assert.equal(player.snapshot().sessionChanges,1);
  assert.equal(ctx.gains[0].volume,.6);
  ctx.currentTime=10;ctx.sources[0].onended();player.setTrack('animation.ogg',.6,10,100);
  assert.equal(player.snapshot().ended,true);assert.equal(ctx.sources.length,1,'ended track stays ended');
  player.setTrack('animation.ogg',.7,0,200);await new Promise(setImmediate);
  assert.equal(loads,1);assert.equal(ctx.sources.length,2);assert.equal(ctx.sources[1].offset,0);
  player.pause(true);assert.equal(ctx.sources[1].stopped,true);assert.equal(player.snapshot().paused,true);
  assert.equal(player.snapshot().starts,2);assert.equal(player.snapshot().stops,1);assert.equal(player.snapshot().naturalEnds,1);
});

test('animation startup accounts for decode delay, uses latest timing and cancels stale pending playback',async()=>{
  const ctx=context();let now=0,release;
  const player=new DecodedAnimation({contextFactory:()=>ctx,now:()=>now,fetchAudio:()=>new Promise(resolve=>release=resolve)});
  player.setTrack('slow.ogg',.7,0,1);now=750;player.setTrack('slow.ogg',.7,.75,1);now=1000;
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await new Promise(setImmediate);
  assert.equal(ctx.sources[0].offset,1,'start at correct position rather than playing late from zero');
  player.setTrack('cancel.ogg',.7,0,2);player.pause(true);
  release({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});await new Promise(setImmediate);
  assert.equal(ctx.sources.length,1,'cancelled decode never starts late');
  player.setTrack('slow.ogg',.7,11,3);await new Promise(setImmediate);
  assert.equal(ctx.sources.length,1,'a startup after the file has ended does not replay it');
  assert.equal(player.snapshot().ended,true);
});

test('animation decoding failures are reported and retries are throttled',async()=>{
  const ctx=context(),errors=[];let now=0,loads=0;
  const player=new DecodedAnimation({contextFactory:()=>ctx,now:()=>now,onError:text=>errors.push(text),
    fetchAudio:async()=>{loads++;return {ok:false,status:404};}});
  player.setTrack('missing.ogg',.7,0,1);await new Promise(setImmediate);
  for(let i=0;i<20;i++)player.setTrack('missing.ogg',.7,i/20,1);
  assert.equal(loads,1);assert.match(errors[0],/HTTP 404/);
  now=2000;player.setTrack('missing.ogg',.7,2,1);await new Promise(setImmediate);assert.equal(loads,2);
  player.pause(true);
});
