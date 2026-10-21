import { CylinderGeometry, Group, Mesh, RoundedBoxGeometry } from '../vendor/three.module.js';
import { createSequencer } from './motion.js';

const shadowed = (mesh) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const box = (w, h, d, r, material, y = 0) => {
  const mesh = shadowed(new Mesh(new RoundedBoxGeometry(w, h, d, 4, r), material));
  mesh.position.y = y;
  return mesh;
};

const cylinder = (rTop, rBottom, h, material, y = 0) => {
  const mesh = shadowed(new Mesh(new CylinderGeometry(rTop, rBottom, h, 40), material));
  mesh.position.y = y;
  return mesh;
};

// Horizontal joint cap along the pitch axis (local z).
const axle = (r, length, material, y) => {
  const mesh = cylinder(r, r, length, material, y);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
};

const joint = (parent, y, ...children) => {
  const group = new Group();
  group.position.y = y;
  group.add(...children);
  parent.add(group);
  return group;
};

/**
 * Six-axis style arm, built pointing up local +y, reaching toward local +x.
 * Pose = [yaw, shoulder, elbow, wrist, roll] in radians; negative pitch leans forward.
 */
export const createArm = (m, poses, timing) => {
  const root = new Group();
  root.add(
    cylinder(0.46, 0.54, 0.24, m.joint, 0.12),
    cylinder(0.4, 0.4, 0.06, m.steel, 0.27),
  );

  const yaw = joint(root, 0.3,
    box(0.64, 0.44, 0.64, 0.09, m.plastic, 0.22),
    axle(0.21, 0.72, m.joint, 0.5));
  const shoulder = joint(yaw, 0.5,
    box(0.32, 1.5, 0.36, 0.1, m.plastic, 0.75),
    box(0.33, 0.08, 0.37, 0.02, m.joint, 1.05),
    axle(0.16, 0.5, m.joint, 1.5));
  const elbow = joint(shoulder, 1.5,
    box(0.25, 1.2, 0.27, 0.08, m.plastic, 0.6),
    axle(0.11, 0.34, m.joint, 1.2));
  const wrist = joint(elbow, 1.2,
    box(0.18, 0.26, 0.18, 0.05, m.plastic, 0.13));
  const roll = joint(wrist, 0.26,
    cylinder(0.07, 0.09, 0.16, m.steel, 0.08),
    cylinder(0.035, 0.035, 0.02, m.glow, 0.17));

  const sequence = createSequencer(poses, timing);
  const pose = new Array(5).fill(0);

  const update = (time) => {
    sequence(time, pose);
    yaw.rotation.y = pose[0];
    shoulder.rotation.z = pose[1];
    elbow.rotation.z = pose[2];
    wrist.rotation.z = pose[3];
    roll.rotation.y = pose[4];
  };

  return { object: root, update };
};

// Yaw that turns local +x toward a world-space offset (dx, dz).
export const aimYaw = (dx, dz) => Math.atan2(-dz, dx);
