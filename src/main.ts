// Import the Three.js core library and the OrbitControls helper
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ============================================================================
   SECTION: TINY ON-SCREEN DEBUG LOG (hidden by default; toggle to show)
============================================================================ */
const debugLogEl = document.getElementById('debuglog') as HTMLPreElement;
const toggleLogBtn = document.getElementById('toggle-log') as HTMLButtonElement;
// Append a timestamped line to the log (but do not force it visible)
function dbg(message: string) {
  try {
    if (!debugLogEl) return;
    const ts = new Date().toISOString().slice(11, 19);
    debugLogEl.textContent =
      `[${ts}] ${message}\n` + (debugLogEl.textContent || '');
  } catch {}
}
// Toggle visibility (no need to persist)
function setLogVisible(visible: boolean) {
  if (!debugLogEl || !toggleLogBtn) return;
  debugLogEl.style.display = visible ? 'block' : 'none';
  toggleLogBtn.textContent = visible ? 'Hide Log' : 'Show Log';
}
// Default: hidden
setLogVisible(false);
toggleLogBtn?.addEventListener('click', () => {
  const isVisible = debugLogEl.style.display !== 'none';
  setLogVisible(!isVisible);
});

/* ============================================================================
   SECTION: RENDERER, SCENE, CAMERA, AND CONTROLS
============================================================================ */

const webglRenderer = new THREE.WebGLRenderer({ antialias: true });
webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
webglRenderer.setSize(window.innerWidth, window.innerHeight);
webglRenderer.setClearColor(0x0b0f14, 1);
document.body.appendChild(webglRenderer.domElement);

const scene = new THREE.Scene();

const rideCamera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.01,
  1000
);
scene.add(rideCamera);

const orbitControls = new OrbitControls(rideCamera, webglRenderer.domElement);
orbitControls.enableDamping = true;

/* ============================================================================
   SECTION: LIGHTING AND REFERENCE GRID
============================================================================ */

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6));

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(10, 15, 5);
scene.add(directionalLight);

const gridHelper = new THREE.GridHelper(100, 100, 0x335a7a, 0x1f3447);
(gridHelper.material as THREE.Material).transparent = true;
(gridHelper.material as THREE.Material & { opacity: number }).opacity = 0.25;
scene.add(gridHelper);

/* ============================================================================
   SECTION: CURVE TRACK, TUBE MESH, AND AHEAD MARKER
============================================================================ */

const sCurveControlPoints: THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(12, 0, 12),
  new THREE.Vector3(-12, 0, 24),
  new THREE.Vector3(12, 0, 36),
  new THREE.Vector3(-12, 0, 48),
  new THREE.Vector3(0, 0, 60),
];

const rideCurve = new THREE.CatmullRomCurve3(
  sCurveControlPoints,
  false,
  'catmullrom',
  0.5
);

const tubeRadius = 0.25;
const trackTubeMesh = new THREE.Mesh(
  new THREE.TubeGeometry(rideCurve, 400, tubeRadius, 16, false),
  new THREE.MeshPhongMaterial({
    color: 0x8fd3ff,
    emissive: 0x001521,
    shininess: 60,
    specular: 0x99d6ff,
  })
);
scene.add(trackTubeMesh);

const leadMarkerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x2ecc71 })
);
leadMarkerMesh.scale.set(0.2, 0.2, 0.2);
scene.add(leadMarkerMesh);

/* ============================================================================
   SECTION: RIDE STATE
============================================================================ */

const cameraHeightOffset = 0.4;
let rideProgressT = 0;
let isRideActive = false;
let isRideLooping = true;
let rideDurationSeconds = 30;
const frameClock = new THREE.Clock();

/* ============================================================================
   SECTION: GYROSCOPE STATE (YAW CONTROL)
============================================================================ */

let isGyroEnabled = false;
let yawBaselineDegrees = 0;
let yawAbsoluteDegreesSmoothed = 0;
let yawRelativeDegreesSmoothed = 0;
let yawLowPassAlpha = 0.15;
let yawSensitivity = 1; // PERHATIAN: Nilai awal dinaikkan, terasa lebih baik untuk roll/pitch
const maxYawDegrees = 60;
const yawQuaternionTemp = new THREE.Quaternion();
const worldYAxis = new THREE.Vector3(0, 1, 0);

/* ============================================================================
   SECTION: GENERIC HELPERS
============================================================================ */

function clampNumber(value: number, lo: number, hi: number) {
  return Math.min(Math.max(value, lo), hi);
}
function isIOS(): boolean {
  return (
    [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod',
    ].includes(navigator.platform) ||
    (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
  );
}

/* ============================================================================
   SECTION: ORIENTATION-AWARE LOGIC
============================================================================ */

// BARU: Fungsi ini dikembalikan untuk mendeteksi orientasi layar
function getScreenOrientationType(): 'portrait' | 'landscape' {
  const type = (screen.orientation && screen.orientation.type) || '';
  if (type.includes('landscape')) return 'landscape';
  if (type.includes('portrait')) return 'portrait';
  // Fallback untuk browser lama
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
}

/* ============================================================================
   SECTION: DEVICE ORIENTATION → RELATIVE YAW (SMOOTHED)
============================================================================ */

// MODIFIKASI: Fungsi ini sekarang cerdas dan memilih sumbu yang benar
// berdasarkan orientasi layar saat ini.
function handleDeviceOrientationEvent(e: DeviceOrientationEvent) {
  const orientation = getScreenOrientationType();
  let controlValue: number | null = null;

  // Pilih sumbu yang benar: gamma untuk potret, beta untuk lanskap
  if (orientation === 'portrait') {
    // Saat potret, gunakan kemiringan kiri-kanan (roll)
    controlValue = e.gamma; // Nilai dari -90 (kiri) hingga 90 (kanan)
  } else {
    // Saat lanskap, gunakan kemiringan depan-belakang (pitch) untuk efek "setir"
    controlValue = e.beta; // Nilai dari -180 hingga 180
    // Kita mungkin perlu membalik nilainya tergantung cara perangkat dipegang,
    // tetapi kita coba tanpa pembalikan dulu.
  }

  if (controlValue == null) return;

  const previousAbs = yawAbsoluteDegreesSmoothed;
  const deltaAbs = controlValue - previousAbs;

  // Terapkan filter low-pass untuk menghaluskan
  yawAbsoluteDegreesSmoothed = previousAbs + deltaAbs * yawLowPassAlpha;

  const relativeValue = yawAbsoluteDegreesSmoothed - yawBaselineDegrees;

  yawRelativeDegreesSmoothed =
    yawRelativeDegreesSmoothed +
    (relativeValue - yawRelativeDegreesSmoothed) * yawLowPassAlpha;
}

async function enableGyroscope(): Promise<boolean> {
  try {
    const DOAny = DeviceOrientationEvent as any;
    if (typeof DOAny?.requestPermission === 'function') {
      const state = await DOAny.requestPermission();
      if (state !== 'granted') {
        dbg('Gyro permission not granted');
        return false;
      }
    }
    window.addEventListener(
      'deviceorientation',
      handleDeviceOrientationEvent as any,
      { passive: true }
    );
    isGyroEnabled = true;
    centerGyroscopeHeading();
    placeCameraAtPathT(rideProgressT);
    dbg('Gyro enabled');
    return true;
  } catch (err) {
    dbg('enableGyroscope error: ' + (err as any)?.message);
    return false;
  }
}
function disableGyroscope() {
  window.removeEventListener(
    'deviceorientation',
    handleDeviceOrientationEvent as any
  );
  isGyroEnabled = false;
  dbg('Gyro disabled');
}

// Fungsi ini sekarang akan mengatur baseline untuk sumbu mana pun yang aktif
function centerGyroscopeHeading() {
  yawBaselineDegrees = yawAbsoluteDegreesSmoothed;
  yawRelativeDegreesSmoothed = 0;
  dbg('Gyro centered');
}

/* ============================================================================
   SECTION: HUD / TARGET MAPPING
============================================================================ */

let targetCenterNormalized = 0;
let targetWidthNormalized = 0.18;
let leadDistanceAlongPathT = 0.0025;

/* ============================================================================
   SECTION: CAMERA + LEAD MARKER PLACEMENT
============================================================================ */

function placeCameraAtPathT(pathT: number) {
  const clampedT = THREE.MathUtils.clamp(pathT, 0, 1);
  const positionOnCurve = rideCurve.getPointAt(clampedT);
  const tangentOnCurve = rideCurve.getTangentAt(clampedT).normalize();
  positionOnCurve.y += cameraHeightOffset;
  rideCamera.position.copy(positionOnCurve);
  const pointWeLookAt = positionOnCurve.clone().add(tangentOnCurve);
  rideCamera.up.set(0, 1, 0);
  rideCamera.lookAt(pointWeLookAt);

  const yawRadians = THREE.MathUtils.degToRad(
    clampNumber(
      // MODIFIKASI: Nilai yawRelativeDegreesSmoothed sekarang berasal dari beta/gamma
      -yawRelativeDegreesSmoothed * yawSensitivity,
      -maxYawDegrees,
      maxYawDegrees
    )
  );
  if (isGyroEnabled) {
    yawQuaternionTemp.setFromAxisAngle(worldYAxis, yawRadians);
    rideCamera.quaternion.premultiply(yawQuaternionTemp);
  }

  const aheadT = (clampedT + clampNumber(leadDistanceAlongPathT, 0, 1)) % 1;
  const aheadPoint = rideCurve.getPointAt(aheadT);
  const aheadTangent = rideCurve.getTangentAt(aheadT).normalize();

  const upWorld = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3()
    .crossVectors(upWorld, aheadTangent)
    .normalize();
  const outwardNormal = new THREE.Vector3()
    .crossVectors(aheadTangent, side)
    .normalize();
  const markerSurfacePosition = aheadPoint
    .clone()
    .addScaledVector(outwardNormal, tubeRadius);

  leadMarkerMesh.position.copy(markerSurfacePosition);
  leadMarkerMesh.lookAt(markerSurfacePosition.clone().add(aheadTangent));

  const yawNow = Math.atan2(tangentOnCurve.x, tangentOnCurve.z);
  const yawAhead = Math.atan2(aheadTangent.x, aheadTangent.z);
  const deltaYawRad =
    THREE.MathUtils.euclideanModulo(yawAhead - yawNow + Math.PI, Math.PI * 2) -
    Math.PI;
  const deltaYawDeg = THREE.MathUtils.radToDeg(deltaYawRad);
  targetCenterNormalized = clampNumber(deltaYawDeg / maxYawDegrees, -1, 1);
}

function resetCameraToPathStart() {
  rideProgressT = 0;
  placeCameraAtPathT(0); // This sets camera position and lookAt

  // Get the same point the camera is looking at for the orbit controls target
  const positionOnCurve = rideCurve.getPointAt(0);
  const tangentOnCurve = rideCurve.getTangentAt(0).normalize();
  const pointWeLookAt = positionOnCurve.clone().add(tangentOnCurve);

  // Update OrbitControls' target to match the camera's look-at point for a smooth start
  orbitControls.target.copy(pointWeLookAt);
  orbitControls.update();
}

/* ============================================================================
   SECTION: DOM GRABS (HUD + MODAL + CONFIG TOGGLE)
============================================================================ */

const hudBarElement = document.getElementById('bar') as HTMLDivElement;
const hudNeedleElement = document.getElementById('needle') as HTMLDivElement;
const hudTargetElement = document.getElementById('target') as HTMLDivElement;
const scoreTextElement = document.getElementById('score') as HTMLSpanElement;
const heartsTextElement = document.getElementById('hearts') as HTMLDivElement;
const tryAgainModalElement = document.getElementById('modal') as HTMLDivElement;
const damageVignetteElement = document.getElementById(
  'vignette'
) as HTMLDivElement;
const debugConfigPanel = document.getElementById(
  'debugConfig'
) as HTMLDivElement;
const toggleConfigButton = document.getElementById(
  'toggle-ui'
) as HTMLButtonElement;

/* ============================================================================
   SECTION: GAME STATE (SCORE / HEARTS) + HUD UPDATE
============================================================================ */

let playerScore = 0;
let playerHearts = 3;
let wasInsideTargetPrevFrame = false;
let scoreAccumulatorSeconds = 0;

function flashDamageVignette() {
  damageVignetteElement.classList.add('show');
  setTimeout(() => damageVignetteElement.classList.remove('show'), 350);
}

function updateHudAndScoring(needleNormalized: number, deltaSeconds: number) {
  const barWidthPx = hudBarElement.clientWidth;
  const normalizedToPixels = (n: number) =>
    (clampNumber(n, -1, 1) + 1) * 0.5 * barWidthPx;
  const targetWidthPx = Math.max(
    6,
    barWidthPx * clampNumber(targetWidthNormalized, 0.02, 1)
  );
  const targetLeftPx =
    normalizedToPixels(targetCenterNormalized) - targetWidthPx / 2;
  const needleLeftPx = normalizedToPixels(needleNormalized) - 2;
  hudNeedleElement.style.left = `${needleLeftPx}px`;
  hudTargetElement.style.left = `${targetLeftPx}px`;
  hudTargetElement.style.width = `${targetWidthPx}px`;
  const isOverlapping = !(
    needleLeftPx + 4 < targetLeftPx ||
    needleLeftPx > targetLeftPx + targetWidthPx
  );
  hudBarElement.style.boxShadow = isOverlapping
    ? '0 0 12px rgba(46,204,113,0.8)'
    : 'none';
  hudBarElement.classList.toggle('ok', isOverlapping);
  if (isRideActive) {
    scoreAccumulatorSeconds += deltaSeconds;
    while (scoreAccumulatorSeconds >= 0.1) {
      scoreAccumulatorSeconds -= 0.1;
      if (isOverlapping) {
        playerScore += 1;
        scoreTextElement.textContent = String(playerScore);
      }
    }
  }
  if (isRideActive && wasInsideTargetPrevFrame && !isOverlapping) {
    playerHearts = Math.max(0, playerHearts - 1);
    heartsTextElement.textContent =
      '❤'.repeat(playerHearts) + '♡'.repeat(3 - playerHearts);
    flashDamageVignette();
    if (playerHearts <= 0) {
      isRideActive = false;
      orbitControls.enabled = true;
      tryAgainModalElement.style.display = 'grid';
    }
  }
  wasInsideTargetPrevFrame = isOverlapping;
}

/* ============================================================================
   SECTION: UI WIRING (BUTTONS + INPUTS)
============================================================================ */

const durationInput = document.getElementById('duration') as HTMLInputElement;
const loopCheckbox = document.getElementById('loop') as HTMLInputElement;

// Config panel should be hidden on load
debugConfigPanel.style.display = 'none';
toggleConfigButton.textContent = 'Show Config';

const startRideAction = async () => {
  // Logika untuk meminta izin Gyro saat memulai
  if (!isGyroEnabled) {
    const ok = await enableGyroscope();
    if (!ok) {
      alert(
        'Gyroscope permission is required to play. Please allow access and try again.'
      );
      return; // Hentikan fungsi jika izin ditolak
    }
  }

  // ===================== PERBAIKAN DI SINI =====================
  // BARU: Reset orientasi gyro setiap kali permainan dimulai.
  // Ini memastikan arah "maju" saat ini diatur sebagai titik tengah.
  centerGyroscopeHeading();
  // ===========================================================

  startRide(parseFloat(durationInput.value) || 30, !!loopCheckbox.checked);
  await enterLandscapeFlow();
};

document.getElementById('start')?.addEventListener('click', startRideAction);
document
  .getElementById('startRideGlobal')
  ?.addEventListener('click', startRideAction);

document.getElementById('stop')?.addEventListener('click', () => stopRide());
document.getElementById('reset')?.addEventListener('click', () => {
  stopRide();
  resetCameraToPathStart();
});

const centerGyroButton = document.getElementById(
  'center-gyro'
) as HTMLButtonElement;
const gyroSensitivityInput = document.getElementById(
  'gyro-sense'
) as HTMLInputElement;

// BARU: Set nilai sensitivitas default di UI
if (gyroSensitivityInput) gyroSensitivityInput.value = String(yawSensitivity);

centerGyroButton?.addEventListener('click', () => {
  centerGyroscopeHeading();
  placeCameraAtPathT(rideProgressT);
});
gyroSensitivityInput?.addEventListener('input', () => {
  const value = parseFloat(gyroSensitivityInput.value);
  yawSensitivity = Number.isFinite(value) ? value : 1.0;
});

const leadPercentInput = document.getElementById('leadT') as HTMLInputElement;
const targetWidthInput = document.getElementById(
  'targetWidth'
) as HTMLInputElement;
leadPercentInput?.addEventListener('input', () => {
  const value = parseFloat(leadPercentInput.value);
  if (Number.isFinite(value)) leadDistanceAlongPathT = clampNumber(value, 0, 1);
});
targetWidthInput?.addEventListener('input', () => {
  const value = parseFloat(targetWidthInput.value);
  if (Number.isFinite(value))
    targetWidthNormalized = clampNumber(value, 0.02, 1);
});

document.getElementById('restart')?.addEventListener('click', () => {
  (document.getElementById('modal') as HTMLDivElement).style.display = 'none';
  playerScore = 0;
  scoreTextElement.textContent = '0';
  playerHearts = 3;
  heartsTextElement.textContent = '❤❤❤';
  wasInsideTargetPrevFrame = false;
  scoreAccumulatorSeconds = 0;
  resetCameraToPathStart();
  // Saat restart, kita panggil startRideAction agar gyro juga di-reset.
  startRideAction();
});

// Show/Hide the Debug Config panel
toggleConfigButton?.addEventListener('click', () => {
  const isHidden = debugConfigPanel.style.display === 'none';
  debugConfigPanel.style.display = isHidden ? '' : 'none';
  toggleConfigButton.textContent = isHidden ? 'Hide Config' : 'Show Config';
});

/* ============================================================================
   SECTION: LANDSCAPE / FULLSCREEN HELPERS + OVERLAY
============================================================================ */

async function requestFullscreenIfNeeded() {
  try {
    if (!document.fullscreenElement) {
      await (document.documentElement as any).requestFullscreen();
      dbg('Requested fullscreen');
    }
  } catch (err) {
    dbg('requestFullscreen error: ' + (err as any)?.message);
  }
}
async function lockOrientationLandscape(): Promise<boolean> {
  try {
    // @ts-ignore
    if (screen.orientation?.lock) {
      await screen.orientation.lock('landscape');
      dbg('Orientation locked to landscape');
      return true;
    }
  } catch (err) {
    dbg('orientation.lock error: ' + (err as any)?.message);
  }
  return false;
}
function updateLandscapeOverlayVisibility() {
  const overlay = document.getElementById('landscapeOverlay') as HTMLDivElement;
  if (!overlay) return;
  const isLandscape = getScreenOrientationType() === 'landscape';
  overlay.style.display = isLandscape ? 'none' : 'grid';
  dbg('Overlay ' + (isLandscape ? 'hidden (landscape)' : 'shown (portrait)'));
}

async function enterLandscapeFlow() {
  await requestFullscreenIfNeeded();
  await lockOrientationLandscape();
}
(
  document.getElementById('enterLandscape') as HTMLButtonElement
)?.addEventListener('click', enterLandscapeFlow);
window.addEventListener('orientationchange', () => {
  updateLandscapeOverlayVisibility();
  if (!isRideActive) {
    centerGyroscopeHeading();
    resetCameraToPathStart();
    placeCameraAtPathT(rideProgressT);
  }
});
window.addEventListener('resize', updateLandscapeOverlayVisibility);
updateLandscapeOverlayVisibility();

/* ============================================================================
   SECTION: INITIALIZATION LOGIC
============================================================================ */

function customizeUIAfterLoad() {
  if (isIOS()) {
    const enterLandscapeButton = document.getElementById(
      'enterLandscape'
    ) as HTMLButtonElement;
    const instructions = document.getElementById(
      'landscape-instructions'
    ) as HTMLParagraphElement;

    if (enterLandscapeButton) {
      enterLandscapeButton.style.display = 'none';
    }
    if (instructions) {
      instructions.innerHTML =
        'Please rotate your device to landscape.<br><small>(Make sure Portrait Orientation Lock is disabled in your Control Center)</small>';
    }
  }
}

/* ============================================================================
   SECTION: PUBLIC API + MAIN LOOP
============================================================================ */

export function startRide(durationSeconds = 30, loop = true) {
  rideDurationSeconds = Math.max(0.01, durationSeconds);
  isRideLooping = loop;
  rideProgressT = 0;
  isRideActive = true;
  frameClock.getDelta();
  placeCameraAtPathT(rideProgressT);
}
export function stopRide() {
  isRideActive = false;
}

// --- Initial Setup Calls ---
customizeUIAfterLoad();
resetCameraToPathStart();

function renderLoop() {
  const deltaSeconds = frameClock.getDelta();
  if (isRideActive) {
    rideProgressT += deltaSeconds / rideDurationSeconds;
    if (rideProgressT >= 1) {
      if (isRideLooping) {
        rideProgressT %= 1;
      } else {
        rideProgressT = 1;
        isRideActive = false;
      }
    }
    placeCameraAtPathT(rideProgressT);
    orbitControls.enabled = false;
  } else {
    orbitControls.enabled = true;
    orbitControls.update();
  }
  const needleNormalized = clampNumber(
    (-yawRelativeDegreesSmoothed * yawSensitivity) / maxYawDegrees,
    -1,
    1
  );
  updateHudAndScoring(needleNormalized, deltaSeconds);
  webglRenderer.render(scene, rideCamera);
  requestAnimationFrame(renderLoop);
}
renderLoop();

addEventListener('resize', () => {
  rideCamera.aspect = window.innerWidth / window.innerHeight;
  rideCamera.updateProjectionMatrix();
  webglRenderer.setSize(window.innerWidth, window.innerHeight);
});
scene.add(new THREE.AxesHelper(2));
