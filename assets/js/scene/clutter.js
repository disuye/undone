import { BoxGeometry, InstancedMesh, Matrix4, Vector3 } from '../vendor/three.module.js';
import { at, block, droop, hose, plate, prism, rng } from './parts.js';

// Prototyping-lab mess: overhead cable trays, droops, floor runs, a bench, a cart, a light stand.
export const createClutter = (m, { room, cell, mounts }) => {
  const r = rng(21);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const cable = () => (r() < 0.1 ? m.cables[4] : pick(m.cables.slice(0, 4)));
  const jitter = (s) => (r() - 0.5) * s;
  const trayY = room.height - 0.55;
  const trayZ = [room.near - 1, room.near - 26];
  const trays = [-3.6, 3.3];
  const objects = [];

  // Ladder trays: two rails + instanced rungs.
  const span = trayZ[0] - trayZ[1];
  const rungs = Math.floor(span / 0.45);
  const rungMesh = new InstancedMesh(new BoxGeometry(0.42, 0.02, 0.03), m.mech, rungs * trays.length);
  const mtx = new Matrix4();
  trays.forEach((x, t) => {
    [-0.21, 0.21].forEach((dx) => objects.push(at(block(0.025, 0.07, span, m.mech), x + dx, trayY, trayZ[0] - span / 2)));
    for (let i = 0; i < rungs; i += 1) rungMesh.setMatrixAt(t * rungs + i, mtx.makeTranslation(x, trayY - 0.03, trayZ[0] - i * 0.45));
    for (let k = 0; k < 3; k += 1) {
      const pts = [];
      for (let z = trayZ[0]; z > trayZ[1]; z -= 2) pts.push([x + jitter(0.3), trayY + 0.02, z]);
      objects.push(hose(pts, 0.02 + r() * 0.015, cable()));
    }
  });
  objects.push(rungMesh);

  const trayPoint = (x, z) => new Vector3(x + jitter(0.3), trayY - 0.02, z);

  // Loops sagging out of the trays.
  for (let i = 0; i < 12; i += 1) {
    const x = pick(trays);
    const z = trayZ[0] - r() * (span - 4);
    const a = trayPoint(x, z);
    const b = trayPoint(x, z - 1 - r() * 3);
    objects.push(droop(a, b, 0.3 + r() * 1.1, new Vector3(jitter(0.5), 0, 0), 0.015 + r() * 0.02, cable()));
  }

  // Feeds dropping from a tray to the floor and snaking to a target.
  const drop = (target, cast) => {
    const x = pick(trays);
    const top = trayPoint(x, target.z + jitter(3));
    const side = Math.sign(target.x - x) || 1;
    const pts = [
      top.toArray(),
      [top.x + side * 0.2, top.y - 1.4, top.z + jitter(0.4)],
      [top.x + side * 0.35, 0.4, top.z + jitter(0.6)],
      [top.x + side * 0.6, 0.03, top.z + jitter(0.8)],
      [(top.x + target.x) / 2 + jitter(0.8), 0.03, (top.z + target.z) / 2 + jitter(0.8)],
      [target.x, target.y, target.z],
    ];
    objects.push(hose(pts, 0.018 + r() * 0.02, cable(), cast));
  };

  for (let i = 0; i < 2; i += 1) drop(new Vector3(cell.x + jitter(0.5), 0.05, cell.z + jitter(0.5)), true);
  mounts.filter((p) => p.y < 1).forEach((p) => { for (let i = 0; i < 1; i += 1) drop(new Vector3(p.x + jitter(0.6), 0.04, p.z + jitter(0.6)), false); });

  // Floor runs from wall outlets to the cell, loosely bundled.
  [-1, 1].forEach((side) => {
    const wall = side * (room.width / 2 - 0.05);
    const z0 = cell.z + 2.5 + jitter(1);
    for (let i = 0; i < 3; i += 1) {
      objects.push(hose([
        [wall, 0.35, z0 + i * 0.08], [wall - side * 0.2, 0.03, z0 + i * 0.1],
        [wall * 0.55 + jitter(0.4), 0.03, z0 - 0.6 + jitter(0.5)],
        [cell.x + side * 0.9 + jitter(0.3), 0.03, cell.z + 1.1 + jitter(0.4)],
        [cell.x + side * 0.25, 0.05, cell.z + 0.15],
      ], 0.014 + r() * 0.012, cable()));
    }
  });

  // Overhead arm: umbilicals drooping from the trays to its mount.
  mounts.filter((p) => p.y > 1).forEach((p) => {
    for (let i = 0; i < 3; i += 1) {
      objects.push(droop(trayPoint(pick(trays), p.z + jitter(2)), new Vector3(p.x + jitter(0.2), p.y + 0.2, p.z + jitter(0.2)), 0.5 + r() * 0.6, new Vector3(0, 0, jitter(0.6)), 0.02, cable(), true));
    }
  });

  // Bench along the left wall.
  const bench = { x: -4.35, z: -0.8 };
  objects.push(
    at(block(0.95, 0.05, 2.6, m.armourGrey), bench.x, 0.9, bench.z),
    ...[[-0.4, -1.2], [0.4, -1.2], [-0.4, 1.2], [0.4, 1.2]].map(([dx, dz]) => at(block(0.05, 0.88, 0.05, m.mech), bench.x + dx, 0.44, bench.z + dz)),
    at(block(0.04, 0.5, 0.8, m.mech), bench.x - 0.25, 1.22, bench.z - 0.4, 0, 0.25),
    at(block(0.01, 0.42, 0.72, m.screen), bench.x - 0.225, 1.22, bench.z - 0.4, 0, 0.25),
    at(block(0.4, 0.22, 0.5, m.armour), bench.x + 0.05, 1.04, bench.z + 0.6, 0, -0.2),
    at(block(0.02, 0.02, 0.12, m.neon), bench.x - 0.16, 1.1, bench.z + 0.6, 0, -0.2),
    at(block(0.3, 0.12, 0.3, m.mech), bench.x + 0.1, 0.99, bench.z + 0.05, 0, 0.6),
    at(plate([[0, 0], [0.3, 0], [0.24, 0.18], [0.04, 0.22]], 0.25, m.armourGrey), bench.x - 0.05, 0.93, bench.z + 1.05, 0, 1.1),
  );
  for (let i = 0; i < 3; i += 1) {
    objects.push(hose([[bench.x - 0.2, 0.93, bench.z + jitter(1.5)], [bench.x + 0.3, 0.6, bench.z + jitter(1)], [bench.x + 0.7, 0.03, bench.z + jitter(1.2)], [cell.x - 1.2 + jitter(0.8), 0.03, cell.z + 1.6 + jitter(1)], [cell.x + jitter(0.3), 0.05, cell.z + 0.3]], 0.015, cable(), false));
  }

  // Rolling cart, right side.
  const cart = new Vector3(4.0, 0, -2.4);
  [[-0.3, -0.45], [0.3, -0.45], [-0.3, 0.45], [0.3, 0.45]].forEach(([dx, dz]) => objects.push(
    at(block(0.03, 1.0, 0.03, m.mech), cart.x + dx, 0.55, cart.z + dz),
    at(prism(0.05, 0.04, 10, m.cables[0], 'x'), cart.x + dx, 0.05, cart.z + dz),
  ));
  [0.35, 0.95].forEach((y) => objects.push(at(block(0.66, 0.03, 0.96, m.armourGrey), cart.x, y, cart.z)));
  objects.push(
    at(block(0.4, 0.3, 0.5, m.armour), cart.x, 1.12, cart.z - 0.1, 0, 0.15),
    at(block(0.3, 0.18, 0.3, m.mech), cart.x + 0.05, 0.46, cart.z + 0.2),
    at(block(0.02, 0.02, 0.1, m.neon), cart.x - 0.21, 1.2, cart.z - 0.1, 0, 0.15),
  );

  // Light stand aimed at the cell.
  const stand = new Vector3(1.9, 0, -2.6);
  for (let i = 0; i < 3; i += 1) {
    const a = i * Math.PI * 2 / 3 + 0.4;
    objects.push(at(prism(0.012, 0.75, 6, m.mech), stand.x + Math.cos(a) * 0.22, 0.34, stand.z + Math.sin(a) * 0.22, Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55));
  }
  const aim = Math.atan2(cell.x - stand.x, cell.z - stand.z);
  objects.push(
    at(prism(0.018, 1.7, 6, m.mech), stand.x, 1.35, stand.z),
    at(plate([[-0.3, -0.25], [0.32, -0.28], [0.36, 0.3], [-0.26, 0.24]], 0.12, m.armourGrey), stand.x, 2.2, stand.z, -0.25, aim, 0),
    hose([[stand.x, 2.1, stand.z], [stand.x + 0.1, 1.2, stand.z + 0.05], [stand.x + 0.4, 0.03, stand.z + 0.3], [-4.9, 0.03, stand.z + 1.5]], 0.012, m.cables[0]),
  );

  return objects;
};
