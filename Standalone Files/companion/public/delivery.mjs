export function deliveryStatus(pose, receipt) {
  if (!receipt || receipt.accepted !== true) return 'FiveM resource needs updating: replace the complete resource folder and restart webcam_mocap_animlab.';
  if (!pose.tracked) return 'FiveM connected · body confidence too low. Keep shoulders and hips visible.';
  const game = receipt.game;
  if (!game || game.ageMs > 2000) return 'Server received pose · waiting for the FiveM character. Check F8 and restart webcam_mocap_animlab.';
  if (game.state === 'unavailable') return 'FiveM connected · character unavailable (vehicle, ragdoll, or death).';
  if (game.state === 'untracked') return 'FiveM connected · waiting for a confident body pose.';
  const hands = ['leftHand','rightHand'].filter(n => game.parts?.includes(n));
  const body=[['spine','torso'],['leftFoot','left leg'],['rightFoot','right leg']].filter(([n])=>game.parts?.includes(n)).map(([,n])=>n);
  const bodyStatus=body.length?` Body targets driven: ${body.join(', ')}.`:'';
  if (!hands.length) return 'FiveM receiving pose · hands below confidence threshold. Keep both wrists visible.'+bodyStatus;
  const orientationRequested = ['leftHand','rightHand'].some(n=>pose.targets[n]?.orientation);
  const wristStatus = !orientationRequested ? '' : game.wrists?.length ? ' Wrist rotation driven.' :
    ' Wrist rotation pending: check updated resource and hand targets.';
  return `FiveM receiving pose · ${hands.length === 2 ? 'both hands' : hands[0] === 'leftHand' ? 'left hand' : 'right hand'} driven.${wristStatus}${bodyStatus}`;
}
