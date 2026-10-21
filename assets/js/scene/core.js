import {
  CylinderGeometry, Group, Mesh, PointLight, SphereGeometry, TorusGeometry, Vector3,
} from '../vendor/three.module.js';
import { smootherstep } from './motion.js';

const RADIUS = 0.5;
const SPREAD = 0.3;
const CYCLE = 14;

// "Undone": a sphere of eight shells that slowly takes itself apart around a lit core.
export const createCore = (m) => {
  const group = new Group();

  const pedestal = new Mesh(new CylinderGeometry(0.16, 0.3, 0.95, 40), m.plastic);
  pedestal.position.y = -1.12;
  pedestal.castShadow = pedestal.receiveShadow = true;

  const core = new Mesh(new SphereGeometry(0.2, 32, 16), m.glow);
  const light = new PointLight(0xfff6ea, 0, 3, 2);

  const rings = [0, 1].map((i) => {
    const ring = new Mesh(new TorusGeometry(0.82 + i * 0.1, 0.022, 12, 128), m.steel);
    ring.rotation.set(Math.PI / 2 + i * 0.5, 0, i * 0.3);
    ring.castShadow = true;
    return ring;
  });

  const shells = [];
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      const phi = i * Math.PI / 2;
      const theta = j * Math.PI / 2;
      const mid = { phi: phi + Math.PI / 4, theta: theta + Math.PI / 4 };
      const mesh = new Mesh(new SphereGeometry(RADIUS, 32, 16, phi, Math.PI / 2, theta, Math.PI / 2), m.shell);
      mesh.castShadow = mesh.receiveShadow = true;
      const dir = new Vector3(
        -Math.cos(mid.phi) * Math.sin(mid.theta),
        Math.cos(mid.theta),
        Math.sin(mid.phi) * Math.sin(mid.theta),
      );
      shells.push({ mesh, dir, axis: new Vector3(0, 1, 0).cross(dir).normalize() });
    }
  }

  group.add(pedestal, core, light, ...rings, ...shells.map((s) => s.mesh));

  // Open, hold, close, hold — on a slow cycle.
  const openness = (time) => {
    const t = (time % CYCLE) / CYCLE;
    if (t < 0.3) return smootherstep(t / 0.3);
    if (t < 0.55) return 1;
    if (t < 0.85) return 1 - smootherstep((t - 0.55) / 0.3);
    return 0;
  };

  const update = (time) => {
    const a = openness(time);
    shells.forEach(({ mesh, dir, axis }) => {
      mesh.position.copy(dir).multiplyScalar(a * SPREAD);
      mesh.quaternion.setFromAxisAngle(axis, a * 0.35);
    });
    rings[0].rotation.z = time * 0.08;
    rings[1].rotation.y = -time * 0.05;
    light.intensity = 0.4 + a * 3;
  };

  return { object: group, update };
};
