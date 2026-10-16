import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {makeLoop,CrossfadeBackground}=createRequire(import.meta.url)('../resource/webcam_mocap_animlab/hud/crossfade-audio.js');
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
