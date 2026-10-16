// Seconds the animation plays before the countdown ends.
// If this is greater than 3, show 3 / 2 / 1 during its final three seconds.
// The first score check is one second AFTER this delay (5 means first at 6s).
// Change this value and restart the resource, or use /mocaplabdelay 5 in game
// to change the delay for the next replay without restarting.
globalThis.MocapLabConfig = {
  // Select the exported _mirrored animation dictionary for all dancers.
  // First install the matching compiled *_mirrored.ycd in stream (see MIRRORING.md).
  mirrorRecordedAnimation: false,
  // Keep the supporting foot on the stage during recorded playback.
  // Set false for clips with intentional jumps / both feet leaving the floor.
  groundRecordedFeet: true,
  // Timing offset after approach (-120 to 120 seconds, fractions supported).
  // Positive: delay dancers; music starts immediately. Negative: delay music
  // by the absolute value; dancers start immediately. Zero: start together.
  // Background audio pauses during a negative offset's music wait.
  animationStartDelaySeconds: -0.2,
  scoringDelaySeconds: 20,
  // Put your own audio files in this resource's audio folder. Use '' to disable a track.
  // MP3, OGG and WAV filenames are supported. Restart the resource after changes.
  music: {
    backgroundFile: 'background.ogg',
    animationFile: 'animation.ogg',
    backgroundVolume: 0.35,
    animationVolume: 0.7,
    // Background loop overlap in seconds; 0 disables the crossfade.
    backgroundCrossfadeSeconds: 0.3
  }
};
