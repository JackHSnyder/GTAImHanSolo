import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCompanion} from '../companion/server.mjs';
test('recording page, conversion modules, Blender tool and guide are downloadable without pairing',async()=>{
  let forwarded=0;
  const server=createCompanion({relay:()=>{forwarded++;throw new Error('Recording must not relay');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const root=`http://127.0.0.1:${server.address().port}`;
    for(const [path,expected] of [['/','Record locally'],['/recording.mjs','buildAnimation'],
      ['/recorder-ui.mjs','OfflineRecorder'],['/youtube-reference.mjs','YouTubeReference'],['/skeleton.mjs','packSkeleton'],['/resource/webcam_mocap_animlab/score-math.js','relativeHands'],['/gta-importer.py','export_xml'],['/recording-guide','Convert to GTA']]) {
      const response=await fetch(root+path);assert.equal(response.status,200,path);
      assert.ok((await response.text()).includes(expected),path);
    }
    assert.equal(forwarded,0);
  }finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
