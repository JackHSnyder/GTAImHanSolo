import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimestamp,parseYouTubeLink,YouTubeReference} from '../companion/public/youtube-reference.mjs';
test('YouTube links and timestamp fields are parsed without accepting arbitrary embed sites',()=>{
  for(const link of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&t=3','https://youtu.be/M7lc1UVf-VE','https://youtube.com/shorts/M7lc1UVf-VE','https://m.youtube.com/live/M7lc1UVf-VE'])assert.equal(parseYouTubeLink(link),'M7lc1UVf-VE');
  for(const link of ['javascript:alert(1)','https://youtube.com.evil.example/watch?v=M7lc1UVf-VE','https://youtube.com/playlist?list=abc','https://youtu.be/invalid'])assert.throws(()=>parseYouTubeLink(link));
  assert.equal(parseTimestamp('90'),90);assert.equal(parseTimestamp('1:30.5'),90.5);assert.equal(parseTimestamp('1:02:03'),3723);
  for(const timestamp of ['-1','1:99','abc','1:2:3:4'])assert.throws(()=>parseTimestamp(timestamp));
});
test('changing reference settings invalidates preparation, and a blank link keeps recording independent of YouTube',()=>{
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false});return elements.get(id);};
  const ref=new YouTubeReference({get});assert.equal(ref.validate(),null);
  get('youtubeUrl').value='https://youtu.be/M7lc1UVf-VE';get('youtubeStart').value='15';
  const calls=[];ref.player={pauseVideo:()=>calls.push('pause'),seekTo:n=>calls.push(n),getDuration:()=>100};
  ref.ready=true;ref.loadedId='M7lc1UVf-VE';ref.cue();assert.equal(ref.validate().start,15);
  get('youtubeStart').value='20';get('youtubeStart').oninput();assert.throws(()=>ref.validate(),/Prepare YouTube/);
  get('youtubeStart').value='150';ref.cue();assert.match(get('youtubeStatus').textContent,/beyond the end/);
});
