// test/helpers/syntheticSkeleton.js — a small Spine 3.8 skeleton built in code (no art): impostor clip-bounds tests
// (test/render/impostor-bounds.test.js, test/render/clip-bounds-table.test.js). `rt`: @pixi-spine/runtime-3.8.

/**
 * A synthetic skeleton: a 100 × 200 body on the root (setup x −50…50, y −200…0 in pixi-spine's y-down world), a 50 × 50
 * flag on the 'arm' bone at x 100 (75…125), a 'flash' slot that is empty in the setup pose, and a 'ghost' slot drawn at
 * alpha 0. Clips: 'Wave' (the arm out to x + 300 at 0.5 s and back), 'Flash' (the flash shown 0.50–0.55 s only, at
 * x 900), 'Ghost' (the ghost bone moved far out: never drawn), 'Still'.
 */
export function syntheticSkeleton(rt) {
  const data = new rt.SkeletonData();
  const bone = (i, name, parent) => { const b = new rt.BoneData(i, name, parent); data.bones.push(b); return b; };
  const root = bone(0, 'root', null), arm = bone(1, 'arm', root), ghostBone = bone(2, 'ghost', root);
  const slot = (i, name, b, att) => { const s = new rt.SlotData(i, name, b); s.attachmentName = att; data.slots.push(s); return s; };
  slot(0, 'body', root, 'body'); slot(1, 'flag', arm, 'flag'); slot(2, 'flash', root, null);
  slot(3, 'ghost', ghostBone, 'ghost').color.a = 0;
  const skin = new rt.Skin('default');
  const region = (name, w, h, x, y) => { const a = new rt.RegionAttachment(name); a.width = w; a.height = h; a.x = x; a.y = y; return a; };
  skin.setAttachment(0, 'body', region('body', 100, 200, 0, 100));
  skin.setAttachment(1, 'flag', region('flag', 50, 50, 100, 0));
  skin.setAttachment(2, 'flash', region('flash', 20, 20, 900, 0));
  skin.setAttachment(3, 'ghost', region('ghost', 10, 10, 0, 0));
  data.skins.push(skin);
  data.defaultSkin = skin;
  const wave = new rt.TranslateTimeline(3);
  wave.boneIndex = 1;
  wave.setFrame(0, 0, 0, 0); wave.setFrame(1, 0.5, 300, 0); wave.setFrame(2, 1, 0, 0);
  const flash = new rt.AttachmentTimeline(3);
  flash.slotIndex = 2;
  flash.setFrame(0, 0, null); flash.setFrame(1, 0.5, 'flash'); flash.setFrame(2, 0.55, null);
  const ghost = new rt.TranslateTimeline(2);
  ghost.boneIndex = 2;
  ghost.setFrame(0, 0, 5000, 0); ghost.setFrame(1, 1, 5000, 0);
  data.animations.push(new rt.Animation('Wave', [wave], 1), new rt.Animation('Flash', [flash], 1),
    new rt.Animation('Ghost', [ghost], 1), new rt.Animation('Still', [], 0));
  return data;
}
