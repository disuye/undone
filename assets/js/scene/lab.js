import {
  BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Group, HemisphereLight, Mesh,
  PlaneGeometry, Points, PointsMaterial, RectAreaLight, RingGeometry, RoundedBoxGeometry,
  SpotLight, TubeGeometry, Vector3, AdditiveBlending,
} from '../vendor/three.module.js';
import { aimYaw, createArm } from './arm.js';
import { createCore } from './core.js';
import { createMaterials, dustSprite } from './materials.js';

export const ROOM = { width: 11, height: 5.2, length: 46, near: 9 };
export const CELL = new Vector3(0, 1.65, -6);

const BAY = 6;
const far = ROOM.near - ROOM.length;
const midZ = (ROOM.near + far) / 2;

const mesh = (geometry, material, { cast = false, receive = true } = {}) => {
  const m = new Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};

const place = (object, x, y, z, ry = 0) => {
  object.position.set(x, y, z);
  object.rotation.y = ry;
  return object;
};

const shell = (m) => {
  const { width: w, height: h, length: l } = ROOM;
  const floor = mesh(new PlaneGeometry(w, l), m.floor);
  floor.rotation.x = -Math.PI / 2;
  const ceiling = mesh(new PlaneGeometry(w, l), m.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  const walls = [-1, 1].map((side) => place(mesh(new PlaneGeometry(l, h), m.wall), side * w / 2, h / 2, midZ, -side * Math.PI / 2));
  const end = place(mesh(new PlaneGeometry(w, h), m.wall), 0, h / 2, far);

  [floor, ceiling].forEach((p) => p.position.set(0, p === ceiling ? h : 0, midZ));
  return [floor, ceiling, ...walls, end];
};

// Portal frames, ceiling light panels and floor kick-lights, one set per bay.
const bays = (m) => {
  const { width: w, height: h } = ROOM;
  const column = new RoundedBoxGeometry(0.5, h, 0.7, 3, 0.06);
  const beam = new RoundedBoxGeometry(w, 0.6, 0.7, 3, 0.06);
  const housing = new BoxGeometry(2.8, 0.06, 1.6);
  const panel = new BoxGeometry(2.6, 0.02, 1.4);
  const objects = [];

  for (let z = ROOM.near - 3; z > far + 2; z -= BAY) {
    objects.push(
      place(mesh(column, m.frame, { cast: true }), -w / 2 + 0.25, h / 2, z),
      place(mesh(column, m.frame, { cast: true }), w / 2 - 0.25, h / 2, z),
      place(mesh(beam, m.frame), 0, h - 0.3, z),
    );
    [-2.4, 2.4].forEach((x) => objects.push(
      place(mesh(housing, m.housing), x, h - 0.03, z - BAY / 2),
      place(mesh(panel, m.light), x, h - 0.07, z - BAY / 2),
    ));
  }

  const kick = new BoxGeometry(0.04, 0.03, ROOM.length);
  [-1, 1].forEach((side) => objects.push(place(mesh(kick, m.light), side * (w / 2 - 0.02), 0.22, midZ)));
  return objects;
};

// Equipment cabinets along the walls give the far depth something to resolve.
const cabinets = (m) => {
  const objects = [];
  [-1, 1].forEach((side) => {
    for (let z = ROOM.near - 6; z > far + 3; z -= 3.1) {
      const nearFrame = Math.abs(((z - (ROOM.near - 3)) % BAY + BAY) % BAY) < 0.9;
      if (Math.abs(z - CELL.z) < 3 || nearFrame) continue;
      const tall = 1.6 + ((Math.abs(z * 7.3) % 1) * 0.9);
      const body = place(mesh(new RoundedBoxGeometry(0.9, tall, 1.3, 3, 0.05), m.plastic, { cast: true }), side * (ROOM.width / 2 - 0.55), tall / 2, z);
      const led = place(mesh(new BoxGeometry(0.02, 0.03, 0.5), Math.abs(z * 13) % 2 > 1.4 ? m.neon : m.light), side * (ROOM.width / 2 - 1.01), tall - 0.25, z);
      objects.push(body, led);
    }
  });
  return objects;
};

// Floor cable from an arm base to the nearest wall, with a lazy S-bend.
const cable = (m, base, side, offset) => {
  const y = 0.035;
  const wall = side * (ROOM.width / 2 - 0.05);
  const points = [
    new Vector3(base.x + side * 0.3, 0.12, base.z + offset),
    new Vector3(base.x + side * 0.6, y, base.z + offset * 2),
    new Vector3((base.x + wall) / 2, y, base.z + offset * 2 + 0.6),
    new Vector3(wall - side * 0.4, y, base.z + offset + 1.1),
    new Vector3(wall, 0.3, base.z + offset + 1.2),
  ];
  return mesh(new TubeGeometry(new CatmullRomCurve3(points), 64, 0.03, 8), m.cable, { cast: true });
};

const lights = () => {
  const { height: h } = ROOM;
  const hemi = new HemisphereLight(0xfffdfa, 0x8f8c84, 0.55);

  const rects = [CELL.z + BAY / 2, CELL.z - BAY / 2].flatMap((z) => [-2.4, 2.4].map((x) => {
    const rect = new RectAreaLight(0xfffcf7, 3.2, 2.6, 1.4);
    rect.position.set(x, h - 0.1, z);
    rect.lookAt(x, 0, z);
    return rect;
  }));

  const key = new SpotLight(0xfffaf2, 70, 12, 0.62, 0.85, 2);
  key.position.set(0.6, h - 0.15, CELL.z + 0.4);
  key.target.position.copy(CELL).setY(0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;

  return [hemi, ...rects, key, key.target];
};

const dust = (count) => {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions.set([
      (Math.random() - 0.5) * (ROOM.width - 1),
      Math.random() * ROOM.height,
      ROOM.near - Math.random() * 24,
    ], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({
    map: dustSprite(), size: 0.025, transparent: true, opacity: 0.55,
    depthWrite: false, blending: AdditiveBlending,
  }));
};

// Arm placements relative to the work cell; poses lean in toward the core.
const ARMS = [
  {
    at: [-2.7, 0, -5.2], flip: false, timing: { move: 2.8, hold: 1.6, offset: 0 },
    poses: [
      [0.1, -0.5, -0.8, -0.6, 0], [-0.25, -0.35, -1.05, -0.4, 1.4],
      [0.3, -0.6, -0.6, -0.9, 0.4], [0, -0.2, -1.2, -0.2, -1],
    ],
  },
  {
    at: [2.8, 0, -6.9], flip: false, timing: { move: 3.2, hold: 1.2, offset: 2.1 },
    poses: [
      [-0.2, -0.45, -0.9, -0.5, 0.6], [0.2, -0.65, -0.5, -0.8, -0.6],
      [0, -0.3, -1.1, -0.3, 1.8], [-0.35, -0.55, -0.7, -0.7, 0],
    ],
  },
  {
    at: [0.4, ROOM.height - 0.6, -9], flip: true, timing: { move: 3.6, hold: 2, offset: 4.4 },
    poses: [
      [0, -0.35, -0.7, -0.5, 0], [0.4, -0.2, -0.9, -0.3, 1.2],
      [-0.3, -0.5, -0.5, -0.6, -0.8],
    ],
  },
];

const arms = (m) => ARMS.map(({ at: [x, y, z], flip, poses, timing }) => {
  const arm = createArm(m, poses, timing);
  const mount = new Group();
  mount.position.set(x, y, z);
  const dx = CELL.x - x;
  const dz = CELL.z - z;
  if (flip) {
    mount.rotation.x = Math.PI;
    arm.object.rotation.y = aimYaw(dx, -dz);
  } else {
    arm.object.rotation.y = aimYaw(dx, dz);
  }
  mount.add(arm.object);

  const side = Math.sign(x) || 1;
  const cables = flip ? [] : [cable(m, mount.position, side, 0), cable(m, mount.position, side, -0.18)];
  return { objects: [mount, ...cables], update: arm.update };
});

export const buildLab = ({ dustCount }) => {
  const m = createMaterials(ROOM);
  const group = new Group();
  const core = createCore(m);
  core.object.position.copy(CELL);

  const pad = mesh(new RingGeometry(2.3, 2.34, 128), m.neon);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(CELL.x, 0.005, CELL.z);

  const rigs = arms(m);
  const motes = dust(dustCount);

  group.add(...shell(m), ...bays(m), ...cabinets(m), ...lights(), pad, core.object, motes, ...rigs.flatMap((r) => r.objects));

  const update = (time) => {
    core.update(time);
    rigs.forEach((r) => r.update(time));
    motes.position.y = Math.sin(time * 0.07) * 0.25;
    motes.rotation.y = Math.sin(time * 0.03) * 0.02;
  };

  return { group, update };
};
