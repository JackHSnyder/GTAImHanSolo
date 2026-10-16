Add your own music here:

background.ogg - loops while walking around the visit room.
animation.ogg - starts from the beginning with each recorded animation.

Music is optional. No audio recordings are included in this package.
For MP3 or WAV files, use the real extension and change the corresponding filename in config.js. Do not rename an MP3 file to .ogg.

config.js -> music contains backgroundFile, animationFile, backgroundVolume and animationVolume (0 to 1). An empty filename disables that track.

The background pauses when the animation starts and resumes from its paused position afterward. Animation music does not loop; use a track at least as long as your animation if you want sound throughout. It starts with the animation, including its unscored countdown/delay, and stops at the animation's end even if the file is longer. Both tracks stop on room exit. On the next visit the background starts from the beginning.

Restart webcam_mocap_animlab after adding files or changing filenames/volume. Music is local to the visiting player, through the existing HUD; no camera connection is needed for music.