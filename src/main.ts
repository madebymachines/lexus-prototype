import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ---------- Renderer / Scene / Camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0b0f14, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// This camera will ride the path
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 1000);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(10, 15, 5);
scene.add(dir);

// ---------- Reference ground ----------
const grid = new THREE.GridHelper(100, 100, 0x335a7a, 0x1f3447);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material & { opacity: number }).opacity = 0.25;
scene.add(grid);

// ---------- Build S-shaped path toward +Z from world origin ----------
const sCurvePoints: THREE.Vector3[] = [
  new THREE.Vector3(  0, 0,   0), // start at origin
  new THREE.Vector3( 12, 0,  12),
  new THREE.Vector3(-12, 0,  24),
  new THREE.Vector3( 12, 0,  36),
  new THREE.Vector3(-12, 0,  48),
  new THREE.Vector3(  0, 0,  60)  // ends further along +Z
];

// Catmull-Rom curve (not closed)
const curve = new THREE.CatmullRomCurve3(sCurvePoints, false, "catmullrom", 0.5);

// ---------- Visualize the curve with a light-blue tube ----------
const tubeRadius = 0.25;
const tube = new THREE.Mesh(
  new THREE.TubeGeometry(curve, 400, tubeRadius, 16, false),
  new THREE.MeshPhongMaterial({
    color: 0x8fd3ff,      // light blue
    emissive: 0x001521,
    shininess: 60,
    specular: 0x99d6ff
  })
);
scene.add(tube);

// Optional: markers for raw control points
const cpMat = new THREE.MeshBasicMaterial({ color: 0x9ad7ff });
const cpGeo = new THREE.SphereGeometry(0.15, 16, 16);
for (const p of sCurvePoints) {
  const m = new THREE.Mesh(cpGeo, cpMat);
  m.position.copy(p);
  scene.add(m);
}

// ---------- Ride parameters & helpers ----------
const cameraYOffset = 0.8; // slightly above the path
let rideT = 0;             // normalized [0..1]
let rideActive = false;
let rideLoop = true;
let rideDuration = 8;      // seconds start -> end

const clock = new THREE.Clock();

// === GYRO STATE ===============================================================
let gyroEnabled = false;
let yawZeroDeg = 0;          // baseline heading when you press "Center"
let yawCurrentDeg = 0;       // smoothed absolute heading
let yawDisplayDeg = 0;       // smoothed relative (heading - yawZero)
let yawLP = 0.15;            // low-pass smoothing factor (0..1), higher = snappier
let yawGain = 1.0;           // multiplier set by the UI
const maxYawDeg = 60;        // clamp to avoid extreme spins
const _yawQuat = new THREE.Quaternion();
const _YAXIS = new THREE.Vector3(0, 1, 0);

function clamp(v: number, lo: number, hi: number) { return Math.min(Math.max(v, lo), hi); }
function angDiffDeg(a: number, b: number) {
  // smallest signed difference a-b in [-180,180]
  let d = (a - b + 540) % 360 - 180;
  return d;
}

// Cross-platform heading from DeviceOrientation
function computeHeadingDeg(e: DeviceOrientationEvent & Partial<{webkitCompassHeading: number}>): number | null {
  // iOS Safari exposes e.webkitCompassHeading (0..360, 0=north, clockwise)
  const wch = (e as any).webkitCompassHeading;
  if (typeof wch === "number" && !Number.isNaN(wch)) return wch;

  // Otherwise use alpha; when absolute, alpha=0 = device facing north (implementation-dependent)
  if (e.absolute && typeof e.alpha === "number") {
    // Most browsers: heading ≈ 360 - alpha
    return (360 - e.alpha + 360) % 360;
  }
  // Fall back (still try) if alpha present but not absolute
  if (typeof e.alpha === "number") return (360 - e.alpha + 360) % 360;

  return null;
}

function onDeviceOrientation(e: DeviceOrientationEvent & Partial<{webkitCompassHeading: number}>) {
  const h = computeHeadingDeg(e);
  if (h == null) return;

  // Low-pass smoothing on the absolute heading
  const prev = yawCurrentDeg;
  const diff = angDiffDeg(h, prev);
  yawCurrentDeg = (prev + diff * yawLP + 360) % 360;

  // Relative to zero (center)
  let rel = angDiffDeg(yawCurrentDeg, yawZeroDeg);
  // Another tiny smoothing pass for displayed yaw
  yawDisplayDeg = yawDisplayDeg + (rel - yawDisplayDeg) * yawLP;
}

// Request permission (iOS) and wire listener
async function enableGyro(): Promise<boolean> {
  try {
    // iOS 13+ requires permission via a user gesture
    const anyDO = DeviceOrientationEvent as any;
    if (typeof anyDO?.requestPermission === "function") {
      const state = await anyDO.requestPermission();
      if (state !== "granted") return false;
    }
    window.addEventListener("deviceorientation", onDeviceOrientation as any, { passive: true });
    gyroEnabled = true;
    centerGyro();
    return true;
  } catch {
    return false;
  }
}
function disableGyro() {
  window.removeEventListener("deviceorientation", onDeviceOrientation as any);
  gyroEnabled = false;
}
function centerGyro() {
  // Use current smoothed heading as zero
  yawZeroDeg = yawCurrentDeg;
  yawDisplayDeg = 0;
}
// ============================================================================

function placeCameraAt(t: number) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  const p = curve.getPointAt(clamped);
  const tangent = curve.getTangentAt(clamped).normalize();

  p.y += cameraYOffset;
  camera.position.copy(p);

  // Base look along the path (keeps horizon stable)
  const lookTarget = p.clone().add(tangent);
  camera.up.set(0, 1, 0);
  camera.lookAt(lookTarget);

  // === Apply gyro yaw around WORLD Y (after lookAt) ===
  if (gyroEnabled) {
    const yawRad = THREE.MathUtils.degToRad(
      clamp(-yawDisplayDeg * yawGain, -maxYawDeg, maxYawDeg)
    );
    _yawQuat.setFromAxisAngle(_YAXIS, yawRad);
    camera.quaternion.premultiply(_yawQuat); // world-Y twist on top of path look
  }
}

function resetCameraToStart() {
  rideT = 0;
  placeCameraAt(0);
  controls.target.copy(curve.getPointAt(0));
  controls.update();
}

// Public API to control the ride
export function startRide(durationSeconds = 8, loop = true) {
  rideDuration = Math.max(0.01, durationSeconds);
  rideLoop = loop;
  rideT = 0;
  rideActive = true;
  clock.getDelta(); // reset delta so first frame is clean
}
export function stopRide() { rideActive = false; }
export function resetCamera() { resetCameraToStart(); }

// ---------- UI wiring ----------
const durationEl = document.getElementById("duration") as HTMLInputElement;
const loopEl = document.getElementById("loop") as HTMLInputElement;
document.getElementById("start")?.addEventListener("click", () => {
  startRide(parseFloat(durationEl.value) || 8, !!loopEl.checked);
});
document.getElementById("stop")?.addEventListener("click", () => stopRide());
document.getElementById("reset")?.addEventListener("click", () => { stopRide(); resetCameraToStart(); });

// === Gyro UI ===
const enableBtn = document.getElementById("enable-gyro");
const centerBtn  = document.getElementById("center-gyro");
const senseEl = document.getElementById("gyro-sense") as HTMLInputElement;

enableBtn?.addEventListener("click", async () => {
  if (!gyroEnabled) {
    const ok = await enableGyro();
    if (!ok) {
      alert("Gyro permission denied or not available. Use HTTPS and tap after a user gesture (iOS).");
      return;
    }
    (enableBtn as HTMLButtonElement).textContent = "Disable Gyro";
  } else {
    disableGyro();
    (enableBtn as HTMLButtonElement).textContent = "Enable Gyro";
  }
});
centerBtn?.addEventListener("click", () => centerGyro());
senseEl?.addEventListener("input", () => {
  const v = parseFloat(senseEl.value);
  yawGain = Number.isFinite(v) ? v : 1.0;
});

// Initial placement
resetCameraToStart();

// ---------- Render loop ----------
function tick() {
  const dt = clock.getDelta();

  if (rideActive) {
    rideT += dt / rideDuration;
    if (rideT >= 1) {
      if (rideLoop) rideT %= 1;
      else { rideT = 1; rideActive = false; }
    }
    placeCameraAt(rideT);
    controls.enabled = false;
  } else {
    controls.enabled = true;
    controls.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

// ---------- Resize handling ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Little axis marker at origin
scene.add(new THREE.AxesHelper(2));