fx_version 'cerulean'
game 'gta5'
author 'Webcam Mocap Animation Lab'
description 'Animation lab: live crouch and wrists, plus recorded YCD playback'
version '0.3.22'
ui_page 'hud/index.html'
files {
  'hud/index.html',
  'hud/hud.css',
  'hud/hud.js',
  'audio/*.ogg',
  'audio/*.mp3',
  'audio/*.wav'
}
shared_script 'protocol.js'
client_scripts {
  'config.js',
  'score-math.js',
  'client.js'
}
server_script 'server.js'
