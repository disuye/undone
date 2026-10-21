import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Group, HemisphereLight,
  PlaneGeometry, Points, PointsMaterial, RectAreaLight, SpotLight, Vector3,
} from '../vendor/three.module.js';
import { aimYaw, createArm } from './arm.js';
import { createClutter } from './clutter.js';
import { createCore } from './core.js';
import { createMarkings } from './markings.js';
import { createMaterials, dustSprite } from './materials.js';
import { at, block, hose, mesh, plate } from './parts.js';

export const ROOM = { width: 11, height: 5.2, length: 46, near: 9 };
export const CELL = new Vector3(0, 1.65, -6);

const BAY = 6;
const far = ROOM.near - ROOM.length;
const midZ = (ROOM.near + far) / 2;
const still = { cast: false };

const shell = (m) => {
  const { width: w, height: h, length: l } = ROOM;
  return [
    at(mesh(new PlaneGeometry(w, l), m.floor, still), 0, 0, midZ, -Math.PI / 2),
    at(mesh(new PlaneGeometry(w, l), m.ceiling, still), 0, h, midZ, Math.PI / 2),
    ...[-1, 1].map((side) => at(mesh(new PlaneGeometry(l, h), m.wall, still), side * w / 2, h / 2, midZ, 0, -side * Math.PI / 2)),
    at(mesh(new PlaneGeometry(w, h), m.wall, still), 0, h / 2, far),
  ];
};

// Portal frames, ceiling light panels and floor kick-lights, one set per bay.
const bays = (m) => {
  const { width: w, height: h } = ROOM;
  const column = [[-0.25, 0], [0.25, 0], [0.25, h - 0.4], [0.1, h], [-0.25, h]];
  const housing = new BoxGeometry(2.8, 0.06, 1.6);
  const panel = new BoxGeometry(2.6, 0.02, 1.4);
  const objects = [];

  for (let z = ROOM.near - 3; z > far + 2; z -= BAY) {
    objects.push(
      at(plate(column, 0.7, m.frame, 0.01), -w / 2 + 0.25, 0, z, 0, Math.PI),
      at(plate(column, 0.7, m.frame, 0.01), w / 2 - 0.25, 0, z),
      at(block(w, 0.6, 0.7, m.frame), 0, h - 0.3, z),
    );
    [-2.4, 2.4].forEach((x) => objects.push(
      at(mesh(housing, m.housing, still), x, h - 0.03, z - BAY / 2),
      at(mesh(panel, m.light, still), x, h - 0.07, z - BAY / 2),
    ));
  }

  const kick = new BoxGeometry(0.04, 0.03, ROOM.length);
  [-1, 1].forEach((side) => objects.push(at(mesh(kick, m.light, still), side * (w / 2 - 0.02), 0.22, midZ)));
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
      const x = side * (ROOM.width / 2 - 0.55);
      objects.push(
        at(block(0.9, tall, 1.3, m.armour), x, tall / 2, z),
        at(block(0.02, 0.03, 0.5, Math.abs(z * 13) % 2 > 1.4 ? m.neon : m.light), x - side * 0.46, tall - 0.25, z),
        hose([[x, tall, z + 0.3], [x - side * 0.2, tall + 0.6, z + 0.5], [x - side * 0.1, ROOM.height - 0.6, z + 0.2]], 0.02, m.cables[(Math.abs(Math.round(z)) % 3)]),
      );
    }
  });
  return objects;
};

const lights = () => {
  const { height: h } = ROOM;
  const hemi = new HemisphereLight(0xfffdfa, 0x8f8c84, 0.38);

  const rects = [CELL.z + BAY / 2, CELL.z - BAY / 2].flatMap((z) => [-2.4, 2.4].map((x) => {
    const rect = new RectAreaLight(0xfffcf7, 3, 2.6, 1.4);
    rect.position.set(x, h - 0.1, z);
    rect.lookAt(x, 0, z);
    return rect;
  }));

  const key = new SpotLight(0xfffaf2, 34, 12, 0.62, 0.85, 2);
  key.position.set(0.6, h - 0.15, CELL.z + 0.4);
  key.target.position.copy(CELL).setY(0);
  key.castShadow = true;
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
  const yaw = aimYaw(dx, flip ? -dz : dz);
  arm.object.rotation.y = yaw;
  if (flip) {
    mount.rotation.x = Math.PI;
    mount.add(at(block(0.9, 0.12, 0.9, m.armourGrey), 0, -0.06, 0));
  }
  mount.add(arm.object);
  return {
    object: mount, update: arm.update,
    zone: flip
      ? { x, z, yaw: -yaw, size: 2.6, overhead: true }
      : { x, z, yaw, size: 2.9, overhead: false },
  };
});

export const buildLab = ({ dustCount, coreShadows }) => {
  const m = createMaterials(ROOM);
  const group = new Group();
  const core = createCore(m, { shadows: coreShadows });
  core.object.position.copy(CELL);

  const rigs = arms(m);
  const motes = dust(dustCount);

  group.add(
    ...shell(m), ...bays(m), ...cabinets(m), ...lights(),
    ...createMarkings(rigs.map((r) => r.zone)),
    ...createClutter(m, { room: ROOM, cell: CELL, mounts: rigs.map((r) => r.object.position) }),
    core.object, motes, ...rigs.map((r) => r.object),
  );

  const update = (time) => {
    core.update(time);
    rigs.forEach((r) => r.update(time));
    motes.position.y = Math.sin(time * 0.07) * 0.25;
    motes.rotation.y = Math.sin(time * 0.03) * 0.02;
  };

  return { group, update };
};
