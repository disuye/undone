import {
  FogExp2, NeutralToneMapping, PCFShadowMap, PerspectiveCamera, PMREMGenerator,
  RectAreaLightUniformsLib, RoomEnvironment, Scene, SRGBColorSpace, Color, Vector3, WebGLRenderer,
} from '../vendor/three.module.js';
import { buildLab, CELL } from './lab.js';
import { createPost } from './post.js';
import { damp } from './motion.js';

const TIERS = {
  high: { pixelRatio: 1.5, dust: 900, shadowMap: 1024 },
  low: { pixelRatio: 1, dust: 400, shadowMap: 512 },
};
const SLOW_FRAME_MS = 1000 / 40;

const canvas = document.querySelector('[data-is="scene"]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lowSpec = navigator.hardwareConcurrency <= 2 || navigator.deviceMemory <= 2;

// Single source of truth for the ground colour: the CSS token.
const pageTint = () => getComputedStyle(document.documentElement)
  .getPropertyValue('--warmgray-rgb').trim().split(/\s+/).map((v) => Number(v) / 255);

const pickTier = () => {
  const coarse = matchMedia('(pointer: coarse)').matches;
  return coarse || (navigator.hardwareConcurrency ?? 4) < 8 ? 'low' : 'high';
};

const scrollProgress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? scrollY / max : 0;
};

const createRenderer = () => {
  const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
};

const createScene = (renderer, tint, tier) => {
  const scene = new Scene();
  const fog = new Color().setRGB(...tint, SRGBColorSpace);
  scene.background = fog;
  scene.fog = new FogExp2(fog, 0.042);

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  RectAreaLightUniformsLib.init();
  const lab = buildLab({ dustCount: TIERS[tier].dust });
  lab.group.traverse((o) => { if (o.isSpotLight) o.shadow.mapSize.setScalar(TIERS[tier].shadowMap); });
  scene.add(lab.group);
  return { scene, lab };
};

// Camera dollies down the hall with page scroll; pointer adds a little parallax.
const createRig = (camera) => {
  const goal = { p: scrollProgress(), x: 0, y: 0 };
  const now = { ...goal };
  const look = new Vector3();

  addEventListener('scroll', () => { goal.p = scrollProgress(); }, { passive: true });
  addEventListener('pointermove', (e) => {
    goal.x = e.clientX / innerWidth * 2 - 1;
    goal.y = e.clientY / innerHeight * 2 - 1;
  }, { passive: true });

  return (time, dt) => {
    now.p = damp(now.p, goal.p, 3, dt);
    now.x = damp(now.x, goal.x, 2, dt);
    now.y = damp(now.y, goal.y, 2, dt);
    const drift = Math.sin(time * 0.05) * 0.25;
    camera.position.set(drift + now.x * 0.35, 2.6 - now.p * 0.5 - now.y * 0.12, 8.5 - now.p * 9);
    look.set(now.x * 0.15, 0.85 + now.p * 0.4, CELL.z - 1 - now.p * 4);
    camera.lookAt(look);
    return camera.position.distanceTo(CELL);
  };
};

const boot = () => {
  let tier = pickTier();
  const tint = pageTint();
  const renderer = createRenderer();
  const { scene, lab } = createScene(renderer, tint, tier);
  const camera = new PerspectiveCamera(38, 1, 0.1, 80);
  const rig = createRig(camera);
  let post = createPost(renderer, scene, camera, { tier, tint });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier].pixelRatio));
    renderer.setSize(w, h, false);
    post.setPixelRatio(renderer.getPixelRatio());
    post.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 52 : 38;
    camera.updateProjectionMatrix();
  };

  const draw = (time, dt) => {
    lab.update(time);
    post.render(time, rig(time, dt));
  };

  // Drop to the cheaper tier once if the GPU can't hold ~40fps.
  let frames = 0;
  let slowTime = 0;
  const watchFrameRate = (dt) => {
    if (tier === 'low' || frames++ < 30 || frames > 150) return;
    slowTime += dt;
    if (frames < 150 || slowTime / 120 * 1000 < SLOW_FRAME_MS) return;
    tier = 'low';
    post.dispose();
    post = createPost(renderer, scene, camera, { tier, tint });
    resize();
  };

  let last = performance.now();
  const frame = (ms) => {
    const dt = Math.min((ms - last) / 1000, 0.1);
    last = ms;
    draw(ms / 1000, dt);
    watchFrameRate(dt);
  };

  resize();
  addEventListener('resize', reducedMotion ? () => { resize(); draw(6, 1); } : resize);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    renderer.setAnimationLoop(null);
    delete canvas.dataset.ready;
  });

  draw(6, 1);
  canvas.dataset.ready = '';
  if (!reducedMotion) renderer.setAnimationLoop(frame);
};

if (canvas && !lowSpec) {
  try { boot(); } catch (error) { console.warn('scene disabled:', error.message); }
}
