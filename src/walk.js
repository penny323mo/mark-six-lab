import { Euler, MathUtils, Vector3 } from 'three';

// Walk on the studio floor while looking independently in any direction.
export function walkingCamera(camera, canvas, takeControl) {
  const orientation = new Euler(0, 0, 0, 'YXZ');
  const velocity = new Vector3();
  const step = new Vector3();
  const pointers = new Map();
  let yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0;
  let stickX = 0, stickY = 0, dolly = 0;

  function sync() {
    orientation.setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = aimYaw = orientation.y;
    pitch = aimPitch = orientation.x;
    velocity.set(0, 0, 0);
    dolly = 0;
  }

  function separation() {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function down(event) {
    if (event.button !== 0 || pointers.size >= 2) return;
    pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const old = pointers.get(event.pointerId);
    if (!old) return;
    takeControl();
    const pinch = pointers.size === 2;
    const before = pinch ? separation() : 0;
    const dx = event.clientX - old.x, dy = event.clientY - old.y;
    old.x = event.clientX; old.y = event.clientY;
    if (pinch) {
      dolly += (separation() - before) * 0.018;
    } else {
      const scale = Math.PI / Math.max(380, Math.min(880, canvas.clientWidth));
      aimYaw -= dx * scale;
      aimPitch = MathUtils.clamp(aimPitch - dy * scale, -1.34, 1.34);
    }
  }
  const up = event => pointers.delete(event.pointerId);
  function wheel(event) {
    event.preventDefault();
    takeControl();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    dolly -= MathUtils.clamp(pixels * 0.009, -1.25, 1.25);
  }
  const events = [['pointerdown',down], ['pointermove',move], ['pointerup',up],
    ['pointercancel',up], ['lostpointercapture',up], ['wheel',wheel]];

  function avoidFootprint(x, z, clearance) {
    const dx = camera.position.x - x, dz = camera.position.z - z;
    const radius = Math.hypot(dx, dz);
    if (radius < clearance) {
      camera.position.x = x + (radius ? dx / radius : 0) * clearance;
      camera.position.z = z + (radius ? dz / radius : 1) * clearance;
    }
  }
  function update(dt, keys) {
    const lookBlend = 1 - Math.exp(-19 * dt);
    yaw += (aimYaw - yaw) * lookBlend;
    pitch += (aimPitch - pitch) * lookBlend;
    camera.quaternion.setFromEuler(orientation.set(pitch, yaw, 0, 'YXZ'));
    const forward = stickY + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const right = stickX + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const up = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5.0 : 3.1;
    step.set(Math.cos(yaw) * right - Math.sin(yaw) * forward, up,
      -Math.sin(yaw) * right - Math.cos(yaw) * forward).clampLength(0, 1).multiplyScalar(speed);
    velocity.lerp(step, 1 - Math.exp(-13 * dt));
    camera.position.addScaledVector(velocity, dt);
    const distance = dolly * lookBlend;
    camera.position.x -= Math.sin(yaw) * distance;
    camera.position.z -= Math.cos(yaw) * distance;
    dolly -= distance;
    camera.position.y = MathUtils.clamp(camera.position.y, -2.30, 6.6);
    const radius = Math.hypot(camera.position.x, camera.position.z);
    const openSide = MathUtils.smoothstep(camera.position.z / (radius || 1), 0.23, 0.60);
    const wall = MathUtils.lerp(9.15, 13.65, openSide);
    if (radius > wall) {
      camera.position.x *= wall / radius;
      camera.position.z *= wall / radius;
    }
    avoidFootprint(0, 0, camera.position.y < 2.05 ? 2.10 : 1.04);
    if (camera.position.y < 0.3) {
      avoidFootprint(-8.8, 5.1, 1.1);
      avoidFootprint(8.8, 5.1, 1.1);
    }
  }
  return {
    sync, update,
    setEnabled(enabled) {
      for (const [type, listener] of events) {
        if (enabled) canvas.addEventListener(type, listener, {passive:false});
        else canvas.removeEventListener(type, listener);
      }
      pointers.clear(); stickX = stickY = 0;
      sync();
    },
    setStick(x, y) {
      if (x || y) takeControl();
      stickX = x; stickY = y;
    },
  };
}
