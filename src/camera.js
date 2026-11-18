import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FEED_SHELF_Y, FEED_TOP_Y, railPosition } from './physics.js';
import { walkingCamera } from './walk.js';

const directions = {
  front: new Vector3(0, 0.075, 1).normalize(),
  side: new Vector3(0.63, 0.26, 0.78).normalize(),
  overhead: new Vector3(0.055, 0.73, 0.68).normalize(),
  close: new Vector3(0.025, 0.09, 1).normalize(),
};
const motionKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','KeyQ','KeyE']);

function framing(machine, view) {
  if (view === 'close') {
    if (machine.inFeed > 0) return { target: {x:0, y:(FEED_SHELF_Y + FEED_TOP_Y) / 2, z:-0.56}, distance: 4.85 };
    if (machine.drawn.length) return { target: railPosition(machine.drawn.length - 1), distance: 2.55 };
    return { target: machine.carriedPosition ?? {x:0, y:-0.96, z:0}, distance: 3.45 };
  }
  return machine.inFeed > 0 ? { target: {x:0, y:1.04, z:-0.12}, distance: 12.05 }
    : { target: {x:0, y:-0.40, z:0}, distance: 8.62 };
}

export function studioCamera(canvas) {
  const camera = new PerspectiveCamera(34.6, 1, 0.04, 65);
  const target = new Vector3();
  const offset = new Vector3();
  const desired = new Vector3();
  const step = new Vector3();
  const forward = new Vector3();
  const right = new Vector3();
  const keys = new Set();
  let preset = 'front';
  let manual = false;
  let exploring = false;
  let mode = 'walk';
  let framed = false;
  let orbit;
  let lastFrame = performance.now();
  const walking = walkingCamera(camera, canvas, takeControl);

  function takeControl() {
    if (manual) return;
    manual = true;
    if (mode === 'walk') walking.sync();
    canvas.dispatchEvent(new Event('studio-navigate', { bubbles: true }));
  }

  function keyDown(event) {
    if (event.target.matches?.('input,select,textarea')) return;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { keys.add(event.code); return; }
    if (!motionKeys.has(event.code) || event.altKey || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    takeControl();
    keys.add(event.code);
  }
  const keyUp = event => keys.delete(event.code);
  const stopMoving = () => keys.clear();

  function configureMode() {
    orbit?.dispose();
    orbit = undefined;
    walking.setEnabled(exploring && mode === 'walk');
    canvas.style.touchAction = exploring ? 'none' : '';
    stopMoving();
    if (exploring && mode === 'orbit') {
      orbit = new OrbitControls(camera, canvas);
      orbit.minDistance = 0.65;
      orbit.maxDistance = 13.6;
      orbit.minPolarAngle = 0.06;
      orbit.maxPolarAngle = Math.PI * 0.91;
      orbit.rotateSpeed = 0.65;
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.13;
      orbit.zoomToCursor = true;
      orbit.target.copy(target);
      orbit.update();
      orbit.addEventListener('start', takeControl);
    }
  }

  function setExplore(enabled) {
    if (exploring === enabled) return;
    exploring = enabled;
    manual = false;
    configureMode();
    if (enabled) {
      window.addEventListener('keydown', keyDown);
      window.addEventListener('keyup', keyUp);
      window.addEventListener('blur', stopMoving);
    } else {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', stopMoving);
      offset.copy(camera.position).sub(target);
    }
  }

  function setNavigationMode(next) {
    if (mode === next) return;
    mode = next;
    if (mode === 'orbit') target.set(0, 0.35, 0);
    configureMode();
    if (exploring) {
      manual = false;
      takeControl();
    }
  }

  function update(machine) {
    const now = performance.now();
    const dt = Math.min(0.15, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!manual) {
      const pose = framing(machine, preset);
      const blend = framed ? 1 - Math.exp(-7.5 * dt) : 1;
      target.lerp(pose.target, blend);
      desired.copy(directions[preset]).multiplyScalar(pose.distance);
      offset.lerp(desired, blend);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      orbit?.target.copy(target);
      framed = true;
    }
    if (exploring && mode === 'walk' && manual) {
      walking.update(dt, keys);
      const focus = MathUtils.clamp(camera.position.length(), 1.3, 13);
      camera.getWorldDirection(forward);
      target.copy(camera.position).addScaledVector(forward, focus);
      offset.copy(camera.position).sub(target);
    }
    if (!orbit) return;
    if (keys.size) {
      forward.copy(orbit.target).sub(camera.position).setY(0).normalize();
      right.crossVectors(forward, camera.up).normalize();
      const f = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const r = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const u = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
      step.copy(forward).multiplyScalar(f).addScaledVector(right, r).addScaledVector(camera.up, u).normalize();
      step.multiplyScalar(dt * 3.2);
      orbit.target.add(step);
      camera.position.add(step);
    }
    orbit.update(dt);
    if (manual) {
      orbit.target.clampScalar(-8, 8);
      orbit.target.y = MathUtils.clamp(orbit.target.y, -2.85, 5.9);
      camera.position.y = MathUtils.clamp(camera.position.y, -2.96, 6.85);
      const radius = Math.hypot(camera.position.x, camera.position.z);
      const limit = camera.position.z < 0 ? 9.1 : 13.6;
      if (radius > limit) {
        camera.position.x *= limit / radius;
        camera.position.z *= limit / radius;
      }
      target.copy(orbit.target);
      camera.lookAt(target);
      offset.copy(camera.position).sub(target);
    }
  }

  return {
    camera, target, offset, update, setExplore, setNavigationMode,
    setStick: walking.setStick,
    setView(view) {
      preset = view;
      manual = false;
      stopMoving();
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.fov = Math.max(34.6, 2 * Math.atan(0.245 / camera.aspect) * MathUtils.RAD2DEG);
      camera.updateProjectionMatrix();
    },
  };
}
