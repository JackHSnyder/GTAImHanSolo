export function parseTimestamp(value) {
  const text=String(value).trim();
  if(!text)return 0;
  if(/^\d+(?:\.\d+)?$/.test(text)&&Number.isFinite(Number(text)))return Number(text);
  const parts=text.split(':');
  if(parts.length<2||parts.length>3||!parts.every((p,i)=>i===parts.length-1?/^\d{1,2}(?:\.\d+)?$/.test(p):/^\d+$/.test(p))||parts.slice(1).some(p=>Number(p)>=60))
    throw new Error('Use seconds, M:SS, or H:MM:SS for the video start.');
  const seconds=parts.reduce((n,p)=>n*60+Number(p),0);
  if(!Number.isFinite(seconds))throw new Error('Choose a finite video start timestamp.');
  return seconds;
}
export function parseYouTubeLink(value) {
  let url;
  try {url=new URL(String(value).trim());}catch{throw new Error('Paste a full YouTube video link.');}
  if(!['https:','http:'].includes(url.protocol))throw new Error('Use a YouTube video link.');
  const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  let id;
  if(['youtu.be','www.youtu.be'].includes(host))id=parts[0];
  else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host))
    id=['embed','shorts','live'].includes(parts[0])?parts[1]:url.pathname==='/watch'?url.searchParams.get('v'):null;
  if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))throw new Error('This link must identify a YouTube video (watch, youtu.be, Shorts or live link).');
  return id;
}
let apiPromise;
export function loadYouTubeAPI() {
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>{apiPromise=null;reject(new Error('YouTube did not load. Check your connection or browser content blocker.'));},15000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);resolve(window.YT);};
    script.src='https://www.youtube.com/iframe_api';
    script.onerror=()=>{clearTimeout(timer);apiPromise=null;reject(new Error('Cannot load the YouTube player.'));};
    document.head.append(script);
  });
  return apiPromise;
}
export class YouTubeReference {
  constructor({get=id=>document.getElementById(id),loadAPI=loadYouTubeAPI}={}) {
    this.get=get;this.loadAPI=loadAPI;this.player=null;this.ready=false;this.prepared=false;this.busy=false;this.generation=0;
    get('youtubeLoad').onclick=()=>this.load();
    get('youtubePreview').onclick=()=>this.preview();
    get('youtubeCue').onclick=()=>this.cue();
    for(const id of ['youtubeUrl','youtubeStart'])get(id).oninput=()=>{this.prepared=false;this.say('Settings changed. Load the video if needed, preview it, then cue the start again.');};
  }
  say(text){this.get('youtubeStatus').textContent=text;}
  selection(){return {id:parseYouTubeLink(this.get('youtubeUrl').value),start:parseTimestamp(this.get('youtubeStart').value)};}
  async load() {
    if(this.busy)return;
    let selected;
    try{selected=this.selection();}catch(error){this.say(error.message);return;}
    const generation=++this.generation;
    this.prepared=false;this.ready=false;this.say('Loading YouTube…');
    this.player?.destroy();this.player=null;
    const holder=this.get('youtubeHolder');holder.replaceChildren();
    const target=document.createElement('div');holder.append(target);
    try {
      const YT=await this.loadAPI();if(generation!==this.generation)return;
      this.player=new YT.Player(target,{width:'100%',height:'100%',videoId:selected.id,
        playerVars:{playsinline:1,controls:1,origin:window.location.origin,start:Math.floor(selected.start)},
        events:{
          onReady:()=>{if(generation!==this.generation)return;this.ready=true;this.loadedId=selected.id;
            this.player.cueVideoById({videoId:selected.id,startSeconds:selected.start});
            this.say('Play Preview, finish any ads using YouTube’s controls, then choose Ready / cue start.');},
          onAutoplayBlocked:()=>this.say('YouTube blocked playback. Play Preview once using the player controls before recording again.'),
          onError:event=>{this.prepared=false;this.say(`YouTube error ${event.data}. This video may be unavailable or disallow embedding. Choose another link.`);},
          onStateChange:event=>{
            if(this.recording&&[0,2,3].includes(event.data))this.say('Reference video ended, paused or is buffering. Motion recording continues; this take may be out of sync.');
            else if(this.recording&&event.data===1)this.say('YouTube playing alongside the recording. Buffering or ads can affect synchronization.');
          }
        }});
    }catch(error){if(generation===this.generation)this.say(error.message);}
  }
  preview() {
    if(this.busy)return;
    if(!this.ready)return this.say('Load a YouTube video first.');
    this.prepared=false;this.player.playVideo();
    this.say('Finish any ads in the player. When the video itself is ready, click Ready / cue start.');
  }
  cue() {
    if(this.busy)return;
    try {
      const selected=this.selection();
      if(!this.ready||selected.id!==this.loadedId)throw new Error('Load this video first.');
      const duration=this.player.getDuration();
      if(duration>0&&selected.start>=duration)throw new Error('The start timestamp is beyond the end of this video.');
      this.player.pauseVideo();this.player.seekTo(selected.start,true);
      this.prepared=true;this.cuedStart=selected.start;
      this.say('Cued and paused. Record locally will request playback when the three-second countdown finishes. YouTube may still show ads or buffer.');
    }catch(error){this.say(error.message);}
  }
  validate() {
    if(!this.get('youtubeUrl').value.trim())return null;
    const selected=this.selection();
    if(!this.ready||!this.prepared||selected.id!==this.loadedId||selected.start!==this.cuedStart)
      throw new Error('Prepare YouTube first: Load video → Preview / finish ads → Ready / cue start.');
    return selected;
  }
  arm() {
    const selected=this.validate();this.takeReference=selected;this.recording=false;
    if(selected){this.player.pauseVideo();this.player.seekTo(selected.start,true);}
    return selected?{provider:'youtube',videoId:selected.id,startSeconds:selected.start}:null;
  }
  start() {
    if(!this.takeReference)return;
    this.recording=true;this.player.playVideo();
    this.say('Playback requested at the recording start. If playback is blocked, use Preview before the next take.');
  }
  stop() {
    if(this.takeReference)this.player?.pauseVideo();
    this.recording=false;this.takeReference=null;
  }
  setBusy(value) {
    this.busy=value;
    for(const id of ['youtubeUrl','youtubeStart','youtubeLoad','youtubePreview','youtubeCue'])this.get(id).disabled=value;
  }
}
