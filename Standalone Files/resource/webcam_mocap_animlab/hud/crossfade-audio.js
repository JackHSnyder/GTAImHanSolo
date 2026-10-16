(function(root){
  'use strict';
  function makeLoop(context,input,seconds=.2) {
    const fade=Math.min(Math.floor(input.length/4),Math.max(0,Math.round(seconds*input.sampleRate)));
    if(fade<2)return input;
    const length=input.length-fade,output=context.createBuffer(input.numberOfChannels,length,input.sampleRate);
    for(let channel=0;channel<input.numberOfChannels;channel++) {
      const source=input.getChannelData(channel),target=output.getChannelData(channel);
      // Rotate the loop past its head, then blend its tail into that head.
      // The next repetition starts on the sample immediately after the head.
      target.set(source.subarray(fade,input.length-fade));
      for(let i=0;i<fade;i++) {
        const t=i/(fade-1);
        target[length-fade+i]=source[input.length-fade+i]*(1-t)+source[i]*t;
      }
    }
    return output;
  }
  class CrossfadeBackground {
    static supported(){return typeof(root.AudioContext||root.webkitAudioContext)==='function';}
    constructor({contextFactory=()=>new (root.AudioContext||root.webkitAudioContext)(),
      fetchAudio=url=>fetch(url),onError=()=>{},onPlaying=()=>{}}={}) {
      Object.assign(this,{contextFactory,fetchAudio,onError,onPlaying,offset:0,volume:.5,generation:0,requested:false,cache:new Map()});
    }
    setTrack(url,volume,seconds=.2) {
      const overlap=Number.isFinite(seconds)?Math.max(0,Math.min(2,seconds)):.2;
      const key=`${url}|${overlap}`;
      if(key!==this.key){this.pause(true);this.key=key;this.url=url;this.buffer=null;this.loopInfo=null;this.error=null;}
      this.volume=Math.max(0,Math.min(1,volume));
      if(this.gain)this.gain.gain.setValueAtTime(this.volume,this.context.currentTime);
      if(this.requested)return;
      this.requested=true;
      const generation=++this.generation;
      this.start(generation,key,url,overlap).catch(error=>{
        if(generation!==this.generation)return;
        this.error=error;this.requested=false;this.onError(`Background loop: ${error.message}`);
      });
    }
    async start(generation,key,url,overlap) {
      const context=this.context||(this.context=this.contextFactory());
      // Resume immediately when requested, without waiting on network/decode.
      const resumed=context.resume();
      if(!this.cache.has(key)) {
        const loading=this.fetchAudio(url).then(response=>{
          if(!response.ok)throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
          return response.arrayBuffer();
        }).then(bytes=>context.decodeAudioData(bytes)).then(input=>{
          const buffer=makeLoop(context,input,overlap);
          return {buffer,sourceSeconds:input.duration,crossfadeSeconds:input.duration-buffer.duration};
        });
        this.cache.set(key,loading);
        loading.catch(()=>{if(this.cache.get(key)===loading)this.cache.delete(key);});
      }
      const [loaded]=await Promise.all([this.cache.get(key),resumed]);
      if(generation!==this.generation||!this.requested)return;
      const {buffer}=loaded;
      this.loopInfo={backend:'decoded-crossfade',sourceSeconds:loaded.sourceSeconds,
        crossfadeSeconds:loaded.crossfadeSeconds,loopSeconds:buffer.duration,requestedCrossfadeSeconds:overlap};
      this.buffer=buffer;this.error=null;
      const source=context.createBufferSource(),gain=context.createGain();
      source.buffer=buffer;source.loop=true;gain.gain.setValueAtTime(this.volume,context.currentTime);
      source.connect(gain);gain.connect(context.destination);
      this.source=source;this.gain=gain;this.offset%=buffer.duration;this.startedAt=context.currentTime;
      source.start(context.currentTime,this.offset);this.onPlaying();
    }
    pause(reset=false) {
      if(this.source) {
        this.offset=this.position();this.source.stop();this.source.disconnect();this.gain.disconnect();
        this.source=null;this.gain=null;
      }
      if(this.requested){this.generation++;this.requested=false;}
      if(reset)this.offset=0;
    }
    position(){return this.buffer?(this.offset+(this.source?this.context.currentTime-this.startedAt:0))%this.buffer.duration:0;}
    snapshot(){return {backend:'decoded-crossfade',...this.loopInfo,contextState:this.context?.state||'not created',
      paused:!this.source,readyState:this.buffer?4:0,time:this.position(),volume:this.volume,errorCode:this.error?3:0};}
  }
  root.CrossfadeBackground=CrossfadeBackground;
  if(typeof module!=='undefined')module.exports={CrossfadeBackground,makeLoop};
})(globalThis);
