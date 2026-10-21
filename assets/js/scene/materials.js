import {
  CanvasTexture, Color, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  RepeatWrapping, SRGBColorSpace,
} from '../vendor/three.module.js';

// Procedural textures: no image downloads, no third-party assets.
const canvasTexture = (size, draw, srgb) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
};

const speckle = (ctx, size, amount) => {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
};

// One tile/panel: flat fill, inset bevel line, dark seam on the edge.
const panel = (base, seam, inset) => (ctx, size) => {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = inset;
  ctx.lineWidth = size * 0.004;
  ctx.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
  ctx.strokeStyle = seam;
  ctx.lineWidth = size * 0.012;
  ctx.strokeRect(0, 0, size, size);
  speckle(ctx, size, 10);
};

const panelMaps = (repeatX, repeatY, tones) => {
  const map = canvasTexture(512, panel(...tones.colour), true);
  const roughnessMap = canvasTexture(512, panel(...tones.roughness), false);
  [map, roughnessMap].forEach((t) => t.repeat.set(repeatX, repeatY));
  return { map, roughnessMap };
};

const SURFACE = {
  colour: ['#e4e1da', '#a29f97', '#d6d3cc'],
  roughness: ['#8a8a8a', '#ffffff', '#b0b0b0'],
};

export const dustSprite = () => canvasTexture(64, (ctx, size) => {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}, true);

const emissive = (hex, intensity) => new MeshBasicMaterial({
  color: new Color(hex).multiplyScalar(intensity),
});

export const createMaterials = (room) => ({
  floor: new MeshStandardMaterial({
    ...panelMaps(room.width / 1.2, room.length / 1.2, SURFACE),
    color: 0xb4b0a7, roughness: 0.32,
  }),
  wall: new MeshStandardMaterial({
    ...panelMaps(room.length / 1.6, room.height / 2.6, SURFACE),
    color: 0xb3afa7, roughness: 0.8,
  }),
  ceiling: new MeshStandardMaterial({
    ...panelMaps(room.width / 2, room.length / 2, SURFACE),
    color: 0x9d9a93, roughness: 0.9,
  }),
  frame: new MeshStandardMaterial({ color: 0x9f9c94, roughness: 0.55 }),
  plastic: new MeshPhysicalMaterial({
    color: 0xf1efe9, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12,
  }),
  shell: new MeshPhysicalMaterial({
    color: 0xf4f2ed, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, side: 2,
  }),
  joint: new MeshStandardMaterial({ color: 0x2c2b29, roughness: 0.42, metalness: 0.6 }),
  steel: new MeshStandardMaterial({ color: 0x9a978f, roughness: 0.28, metalness: 1 }),
  cable: new MeshStandardMaterial({ color: 0x1e1e1d, roughness: 0.6 }),
  housing: new MeshStandardMaterial({ color: 0x8f8c85, roughness: 0.7 }),
  light: emissive(0xfffcf8, 3.2),
  glow: emissive(0xfff8ef, 6),
  neon: emissive(0xfdfd0d, 1.4),
});
