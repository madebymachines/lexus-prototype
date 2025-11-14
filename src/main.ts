// Import the Three.js core library and the OrbitControls helper
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/* ============================================================================
   SECTION: TINY ON-SCREEN DEBUG LOG (hidden by default; toggle to show)
============================================================================ */
const debugLogEl = document.getElementById("debuglog") as HTMLPreElement;
const toggleLogBtn = document.getElementById("toggle-log") as HTMLButtonElement;
// Append a timestamped line to the log (but do not force it visible)
function dbg(message: string) {
  try {
    if (!debugLogEl) return;
    const ts = new Date().toISOString().slice(11, 19);
    debugLogEl.textContent = `[${ts}] ${message}\n` + (debugLogEl.textContent || "");
  } catch {}
}
// Toggle visibility (no need to persist)
function setLogVisible(visible: boolean){
  if (!debugLogEl || !toggleLogBtn) return;
  debugLogEl.style.display = visible ? "block" : "none";
  toggleLogBtn.textContent = visible ? "Hide Log" : "Show Log";
}
// Default: hidden
setLogVisible(false);
toggleLogBtn?.addEventListener("click", ()=>{
  const isVisible = debugLogEl.style.display !== "none";
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

const rideCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 1000);
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
  new THREE.Vector3(12, 0, 60),
  new THREE.Vector3(-12, 0, 72),
  new THREE.Vector3(12, 0, 84),
  new THREE.Vector3(-12, 0, 96),
  new THREE.Vector3(0, 0, 108),
];

const rideCurve = new THREE.CatmullRomCurve3(sCurveControlPoints, false, "catmullrom", 0.5);

const tubeRadius = 0.25;
const trackTubeMesh = new THREE.Mesh(
  new THREE.TubeGeometry(rideCurve, 400, tubeRadius, 16, false),
  new THREE.MeshPhongMaterial({ color: 0x8fd3ff, emissive: 0x001521, shininess: 60, specular: 0x99d6ff })
);
scene.add(trackTubeMesh);

// Curve Point Markers (original sCurveControlPoints)
const curvePointMarkersGroup = new THREE.Group();
sCurveControlPoints.forEach((point, index) => {
  // Sphere marker
  const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.position.copy(point);
  curvePointMarkersGroup.add(sphere);

  // Text label
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (context) {
    canvas.width = 128;
    canvas.height = 64; // Increased height for better text visibility
    context.font = 'Bold 30px Arial';
    context.fillStyle = 'rgba(255,255,255,1)';
    context.fillText(index.toString(), 10, 40);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 1, 1);
    sprite.position.copy(point).add(new THREE.Vector3(0, 1, 0)); // Offset above the sphere
    curvePointMarkersGroup.add(sprite);
  }
});
scene.add(curvePointMarkersGroup);

// Evenly-distributed Score Markers
const scoreMarkersGroup = new THREE.Group();
scene.add(scoreMarkersGroup);

function generateScoreMarkers(count: number) {
  // Clear existing markers
  while (scoreMarkersGroup.children.length) {
    scoreMarkersGroup.remove(scoreMarkersGroup.children[0]);
  }

  for (let i = 0; i < count; i++) {
    const t = (i + 1) / count; // Distribute from 1/count to 1.0
    const point = rideCurve.getPointAt(t);
    const sphereGeometry = new THREE.SphereGeometry(0.3, 12, 12);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x2ecc71, wireframe: true });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(point);
    scoreMarkersGroup.add(sphere);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      canvas.width = 64; canvas.height = 64; context.font = 'Bold 30px Arial'; context.fillStyle = 'rgba(46,204,113,1)';
      context.fillText((i + 1).toString(), 10, 40);
      const texture = new THREE.CanvasTexture(canvas); const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial); sprite.scale.set(1, 1, 1); sprite.position.copy(point).add(new THREE.Vector3(0, 1.2, 0));
      scoreMarkersGroup.add(sprite);
    }
  }
}
const leadMarkerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
leadMarkerMesh.scale.set(0.2, 0.2, 0.2);
scene.add(leadMarkerMesh);

/* ============================================================================
   SECTION: STEERING WHEEL HUD
============================================================================ */

const steeringWheelTexture = new THREE.TextureLoader().load('src/steering-wheel.png');
const steeringWheelMaterial = new THREE.MeshBasicMaterial({
    map: steeringWheelTexture,
    transparent: true,
    depthTest: false,  // Disable depth testing
    depthWrite: false, // Disable writing to the depth buffer
});
const steeringWheelGeometry = new THREE.PlaneGeometry(1, 1);
const steeringWheelMesh = new THREE.Mesh(steeringWheelGeometry, steeringWheelMaterial);
steeringWheelMesh.renderOrder = 999; // Render on top of other objects
rideCamera.add(steeringWheelMesh);
steeringWheelMesh.position.set(0, -0.3, -0.8);
steeringWheelMesh.scale.set(0.25, 0.25, 0.25);

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
   SECTION: GYROSCOPE STATE (ROLL CONTROL - GAMMA)
============================================================================ */

let isGyroEnabled = false;
// Roll (gamma) control state
let rollBaselineDegrees = 0;           // baseline set by "Center"
let rollDegreesSmoothed = 0;           // smoothed gamma
let rollRelativeDegreesSmoothed = 0;   // relative to baseline, smoothed
let yawLowPassAlpha = 0.15;            // reuse smoothing alpha var
let rawGyroAlpha = 0, rawGyroBeta = 0, rawGyroGamma = 0; // For HUD
let yawSensitivity = 1.0;              // keep existing naming for UI wiring
const maxRollDegrees = 45;             // steering lock
let rollSign = 1;                      // invert when in landscape-secondary

// (kept for compatibility if referenced; not used with roll)
const yawQuaternionTemp = new THREE.Quaternion();
const worldYAxis = new THREE.Vector3(0, 1, 0);

/* ============================================================================
   SECTION: GENERIC HELPERS
============================================================================ */

function clampNumber(value: number, lo: number, hi: number) { return Math.min(Math.max(value, lo), hi); }
function shortestAngleDifferenceDegrees(a: number, b: number) { return ((a - b + 540) % 360) - 180; }

/* ============================================================================
   SECTION: ORIENTATION-AWARE HEADING → SCREEN-ALIGNED YAW
============================================================================ */
/* Orientation-aware roll control */
let isLandscape = false;

function updateOrientationState() {
  // window.orientation is a simple and widely supported way to check
  // 0 = portrait, 90 = landscape-primary, -90 = landscape-secondary
  const orientation = window.orientation || 0;
  isLandscape = Math.abs(orientation) === 90;

  // In landscape-secondary, the beta axis is inverted relative to the user
  rollSign = (orientation === -90) ? -1 : 1;
  dbg(`Orientation updated: isLandscape=${isLandscape}, rollSign=${rollSign}`);
}
function updateRollSign() {
  updateOrientationState();
}
updateRollSign();
// Listen to both orientationchange and resize events for robustness.
// Resize is a good fallback for when orientationchange doesn't fire reliably on load.
window.addEventListener("orientationchange", updateRollSign, { passive: true });
window.addEventListener("resize", updateRollSign, { passive: true });

/* ============================================================================
   SECTION: DEVICE ORIENTATION → RELATIVE ROLL (SMOOTHED)
============================================================================ */

function computeAbsoluteHeadingDegrees(): number | null { return null; }

function handleDeviceOrientationEvent(e: DeviceOrientationEvent & Partial<{ webkitCompassHeading: number }>) {
  rawGyroAlpha = e.alpha ?? 0;
  rawGyroBeta = e.beta ?? 0;
  rawGyroGamma = e.gamma ?? 0;
  if (typeof e.gamma !== "number") return;
  if (typeof e.beta !== "number") return;

  // In portrait, roll is controlled by gamma.
  // In landscape, the user's "roll" motion corresponds to the beta value.
  // We also apply the rollSign correction for landscape-secondary here.
  const rawRoll = isLandscape ? e.beta * rollSign : e.gamma;

  // Smooth the raw roll value
  const smoothed = rollDegreesSmoothed + (rawRoll - rollDegreesSmoothed) * yawLowPassAlpha;
  rollDegreesSmoothed = smoothed;

  // Relative to baseline. The rollSign is now part of the rawRoll calculation.
  const relative = rollDegreesSmoothed - rollBaselineDegrees;

  // Extra smoothing for relative value
  rollRelativeDegreesSmoothed = rollRelativeDegreesSmoothed + (relative - rollRelativeDegreesSmoothed) * 0.12;
}

async function enableGyroscope(): Promise<boolean> {
  try {
    const DOAny = DeviceOrientationEvent as any;
    if (typeof DOAny?.requestPermission === "function") {
      const state = await DOAny.requestPermission();
      if (state !== "granted") { dbg("Gyro permission not granted"); return false; }
    }
    window.addEventListener("deviceorientation", handleDeviceOrientationEvent as any, { passive: true });
    isGyroEnabled = true;
    centerGyroscopeHeading();
    placeCameraAtPathT(rideProgressT);
    dbg("Gyro enabled");
    return true;
  } catch (err) {
    dbg("enableGyroscope error: " + (err as any)?.message);
    return false;
  }
}
function disableGyroscope() { window.removeEventListener("deviceorientation", handleDeviceOrientationEvent as any); isGyroEnabled = false; dbg("Gyro disabled"); }
function centerGyroscopeHeading() {
  rollBaselineDegrees = rollDegreesSmoothed;
  rollRelativeDegreesSmoothed = 0;
  dbg("Gyro centered");}

/* ============================================================================
   SECTION: HUD / TARGET MAPPING
============================================================================ */

let targetCenterNormalized = 0;
let targetWidthNormalized = 0.18;
let targetCenterNormalizedSmoothed = 0; // New: for smoothed target movement
let targetSmoothingAlpha = 0.1; // New: smoothing factor
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

  const yawRadians = THREE.MathUtils.degToRad(clampNumber(-rollRelativeDegreesSmoothed * yawSensitivity, -maxRollDegrees, maxRollDegrees));
  if (isGyroEnabled) { yawQuaternionTemp.setFromAxisAngle(worldYAxis, yawRadians); rideCamera.quaternion.premultiply(yawQuaternionTemp); }

  const aheadT = (clampedT + clampNumber(leadDistanceAlongPathT, 0, 1)) % 1;
  const aheadPoint = rideCurve.getPointAt(aheadT);
  const aheadTangent = rideCurve.getTangentAt(aheadT).normalize();

  const upWorld = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(upWorld, aheadTangent).normalize();
  const outwardNormal = new THREE.Vector3().crossVectors(aheadTangent, side).normalize();
  const markerSurfacePosition = aheadPoint.clone().addScaledVector(outwardNormal, tubeRadius);

  leadMarkerMesh.position.copy(markerSurfacePosition);
  leadMarkerMesh.lookAt(markerSurfacePosition.clone().add(aheadTangent));

  const yawNow = Math.atan2(tangentOnCurve.x, tangentOnCurve.z);
  const yawAhead = Math.atan2(aheadTangent.x, aheadTangent.z);
  const deltaYawRad = THREE.MathUtils.euclideanModulo(yawAhead - yawNow + Math.PI, Math.PI * 2) - Math.PI;
  const deltaYawDeg = THREE.MathUtils.radToDeg(deltaYawRad);
  targetCenterNormalized = clampNumber(-deltaYawDeg / maxRollDegrees, -1, 1);
}

function resetCameraToPathStart() { rideProgressT = 0; placeCameraAtPathT(0); orbitControls.target.copy(rideCurve.getPointAt(0)); orbitControls.update(); }

/* ============================================================================
   SECTION: DOM GRABS (HUD + MODAL + CONFIG TOGGLE)
============================================================================ */

const hudBarElement = document.getElementById("bar") as HTMLDivElement;
const hudNeedleElement = document.getElementById("needle") as HTMLDivElement;
const hudTargetElement = document.getElementById("target") as HTMLDivElement;
const scoreTextElement = document.getElementById("score") as HTMLSpanElement;
const rotationsHudElement = document.getElementById("rotationsHud") as HTMLDivElement;
const targetSmoothingInput = document.getElementById("targetSmoothing") as HTMLInputElement;
const heartsTextElement = document.getElementById("hearts") as HTMLDivElement;
const tryAgainModalElement = document.getElementById("modal") as HTMLDivElement;
const damageVignetteElement = document.getElementById("vignette") as HTMLDivElement;
const debugConfigPanel = document.getElementById("debugConfig") as HTMLDivElement;
const toggleConfigButton = document.getElementById("toggle-ui") as HTMLButtonElement;

/* ============================================================================
   SECTION: GAME STATE (SCORE / HEARTS) + HUD UPDATE
============================================================================ */

let playerScore = 0;
let playerHearts = 3;
let maxScore = 15;
let wasInsideTargetPrevFrame = false;
let lastScorePointIndex = 0;
let noDamageMode = false; // New: for debugging, prevent losing hearts/score

function flashDamageVignette() { damageVignetteElement.classList.add("show"); setTimeout(() => damageVignetteElement.classList.remove("show"), 350); }

function updateHudAndScoring(needleNormalized: number, deltaSeconds: number) {
  // Apply smoothing to the target's center position
  targetCenterNormalizedSmoothed += (targetCenterNormalized - targetCenterNormalizedSmoothed) * targetSmoothingAlpha;

  const barWidthPx = hudBarElement.clientWidth;
  const normalizedToPixels = (n: number) => ((clampNumber(n, -1, 1) + 1) * 0.5 * barWidthPx);
  const targetWidthPx = Math.max(6, barWidthPx * clampNumber(targetWidthNormalized, 0.02, 1));
  const targetLeftPx = normalizedToPixels(targetCenterNormalizedSmoothed) - targetWidthPx / 2;
  const needleLeftPx = normalizedToPixels(needleNormalized) - 2;
  hudNeedleElement.style.left = `${needleLeftPx}px`; hudTargetElement.style.left = `${targetLeftPx}px`; hudTargetElement.style.width = `${targetWidthPx}px`;
  const isOverlapping = !(needleLeftPx + 4 < targetLeftPx || needleLeftPx > targetLeftPx + targetWidthPx);
  hudBarElement.style.boxShadow = isOverlapping ? "0 0 12px rgba(46,204,113,0.8)" : "none"; hudBarElement.classList.toggle("ok", isOverlapping);

  if (isRideActive) {
    // Determine which score point we are at. `maxScore` markers are distributed from t=1/maxScore to t=1.
    const currentScorePointIndex = Math.floor(rideProgressT * maxScore);
    if (currentScorePointIndex > lastScorePointIndex) {
      // We just passed the threshold for a new scoring point.
      // The point we just passed is `lastScorePointIndex`. The markers are 1-based.
      // So we check if we were on target when we passed the point `lastScorePointIndex + 1`.
      if (currentScorePointIndex > 0 && lastScorePointIndex < maxScore) {
        if (isOverlapping) {
          playerScore = Math.min(maxScore, playerScore + 1);
          dbg(`Scored! Point ${lastScorePointIndex + 1}/${maxScore}. New score: ${playerScore}/${maxScore}`);
        } else {
          dbg(`Missed Point ${lastScorePointIndex + 1}/${maxScore} (off-target). Score: ${playerScore}/${maxScore}`);
        }
      }
      lastScorePointIndex = currentScorePointIndex;
    }
  }

  if (isRideActive && wasInsideTargetPrevFrame && !isOverlapping) {
    if (!noDamageMode) { // Only lose heart/score if not in no-damage mode
      playerHearts = Math.max(0, playerHearts - 1); playerScore = Math.max(0, playerScore - 1);
    }
    heartsTextElement.textContent = "❤".repeat(playerHearts) + "♡".repeat(3 - playerHearts); flashDamageVignette(); if (playerHearts <= 0) { isRideActive = false; orbitControls.enabled = true; tryAgainModalElement.style.display = "grid"; } }
  wasInsideTargetPrevFrame = isOverlapping;
  scoreTextElement.textContent = `${playerScore}/${maxScore}`;

  // Update rotations HUD
  const camRot = rideCamera.rotation;
  const r2d = THREE.MathUtils.radToDeg;
  const rotStr = `x:${r2d(camRot.x).toFixed(1)} y:${r2d(camRot.y).toFixed(1)} z:${r2d(camRot.z).toFixed(1)}`;
  const gyroStr = `α:${rawGyroAlpha.toFixed(1)} β:${rawGyroBeta.toFixed(1)} γ:${rawGyroGamma.toFixed(1)}`;
  rotationsHudElement.innerHTML = `<strong>Camera Rotation (xyz):</strong> ${rotStr}<br>` +
    `<strong>Gyro Raw Rotation (xyz):</strong> ${gyroStr}<br>` +
    `<strong>Needle (norm):</strong> ${needleNormalized.toFixed(3)}`;
}

/* ============================================================================
   SECTION: UI WIRING (BUTTONS + INPUTS)
============================================================================ */

const durationInput = document.getElementById("duration") as HTMLInputElement;
const loopCheckbox = document.getElementById("loop") as HTMLInputElement;
const maxScoreInput = document.getElementById("maxScore") as HTMLInputElement;

let isConfigPanelVisible = true;
function setConfigPanelVisible(visible: boolean) {
  isConfigPanelVisible = visible;
  debugConfigPanel.style.display = visible ? "" : "none";
  toggleConfigButton.textContent = visible ? "Hide Config" : "Show Config";
}

document.getElementById("start")?.addEventListener("click", () => {
  dbg("Button: Start Ride");
  startRide(parseFloat(durationInput.value) || 30, !!loopCheckbox.checked); enterLandscapeFlow();
});
document.getElementById("stop")?.addEventListener("click", () => {
  dbg("Button: Stop");
  stopRide();
  playerScore = 0;
  scoreTextElement.textContent = `${playerScore}/${maxScore}`;
  playerHearts = 3; heartsTextElement.textContent = "❤❤❤";
  lastScorePointIndex = -1;
});
document.getElementById("reset")?.addEventListener("click", () => { dbg("Button: Reset Camera"); stopRide(); resetCameraToPathStart(); });

const enableGyroButton = document.getElementById("enable-gyro") as HTMLButtonElement;
const centerGyroButton = document.getElementById("center-gyro") as HTMLButtonElement;
const gyroSensitivityInput = document.getElementById("gyro-sense") as HTMLInputElement;

enableGyroButton?.addEventListener("click", async () => {
  if (!isGyroEnabled) {
    dbg("Button: Enable Gyro"); const ok = await enableGyroscope();
    if (!ok) { alert("Gyro permission denied or not available. Use HTTPS/localhost and tap (iOS)."); return; }
    enableGyroButton.textContent = "Disable Gyro";
    await enterLandscapeFlow();
  } else { dbg("Button: Disable Gyro"); disableGyroscope(); enableGyroButton.textContent = "Enable Gyro"; }
});
centerGyroButton?.addEventListener("click", () => { dbg("Button: Center Gyro"); centerGyroscopeHeading(); placeCameraAtPathT(rideProgressT); });
gyroSensitivityInput?.addEventListener("input", () => { const value = parseFloat(gyroSensitivityInput.value); yawSensitivity = Number.isFinite(value) ? value : 1.0; dbg(`Input: Gyro Sensitivity = ${yawSensitivity}`); });

const leadPercentInput = document.getElementById("leadT") as HTMLInputElement;
const targetWidthInput = document.getElementById("targetWidth") as HTMLInputElement;
leadPercentInput?.addEventListener("input", () => { const value = parseFloat(leadPercentInput.value); if (Number.isFinite(value)) { leadDistanceAlongPathT = clampNumber(value, 0, 1); dbg(`Input: Lead % = ${leadDistanceAlongPathT}`); } });
targetWidthInput?.addEventListener("input", () => { const value = parseFloat(targetWidthInput.value); if (Number.isFinite(value)) { targetWidthNormalized = clampNumber(value, 0.02, 1); dbg(`Input: Target Width = ${targetWidthNormalized}`); } });
targetSmoothingInput?.addEventListener("input", () => {
  const value = parseFloat(targetSmoothingInput.value);
  if (Number.isFinite(value)) { targetSmoothingAlpha = clampNumber(value, 0, 1); dbg(`Input: Target Smoothing = ${targetSmoothingAlpha}`); }
});


maxScoreInput?.addEventListener("input", () => {
  const value = parseInt(maxScoreInput.value, 10);
  if (Number.isFinite(value) && value > 0) {
    maxScore = value;
    generateScoreMarkers(maxScore);
    playerScore = 0; // Reset score when max changes
    lastScorePointIndex = -1;
    scoreTextElement.textContent = `${playerScore}/${maxScore}`;
    dbg(`Input: Max Score = ${maxScore}`);
  }
});

const noDamageToggle = document.getElementById("noDamageToggle") as HTMLInputElement;
noDamageToggle?.addEventListener("change", () => {
  noDamageMode = noDamageToggle.checked;
  dbg(`Toggle: No Damage = ${noDamageMode}`);
});

const toggleCurvePointMarkersButton = document.getElementById("toggleCurvePointMarkers") as HTMLButtonElement;
let curvePointMarkersVisible = true; // Visible by default
curvePointMarkersGroup.visible = curvePointMarkersVisible;
toggleCurvePointMarkersButton?.addEventListener("click", () => {
  curvePointMarkersVisible = !curvePointMarkersVisible;
  curvePointMarkersGroup.visible = curvePointMarkersVisible;
  dbg(`Toggle: Curve Point Markers = ${curvePointMarkersVisible}`);
  toggleCurvePointMarkersButton.textContent = curvePointMarkersVisible ? "Hide Curve Point Markers" : "Show Curve Point Markers";
});

const toggleScoreMarkersButton = document.getElementById("toggleScoreMarkers") as HTMLButtonElement;
let scoreMarkersVisible = true; // Visible by default
scoreMarkersGroup.visible = scoreMarkersVisible;
toggleScoreMarkersButton?.addEventListener("click", () => {
  scoreMarkersVisible = !scoreMarkersVisible;
  scoreMarkersGroup.visible = scoreMarkersVisible;
  dbg(`Toggle: Score Markers = ${scoreMarkersVisible}`);
  toggleScoreMarkersButton.textContent = scoreMarkersVisible ? "Hide Score Markers" : "Show Score Markers";
});

document.getElementById("restart")?.addEventListener("click", () => {
  dbg("Button: Restart (from modal)");
  (document.getElementById("modal") as HTMLDivElement).style.display = "none";
  playerScore = 0;
  playerHearts = 3; heartsTextElement.textContent = "❤❤❤"; scoreTextElement.textContent = `0/${maxScore}`; lastScorePointIndex = -1;
  wasInsideTargetPrevFrame = false;
  resetCameraToPathStart();
  startRide(parseFloat(durationInput.value) || 30, !!loopCheckbox.checked);
  enterLandscapeFlow();
});

// Show/Hide the Debug Config panel (no persistence; always shown on load)
toggleConfigButton?.addEventListener("click", () => {
  dbg(`Button: ${isConfigPanelVisible ? "Hide" : "Show"} Config`);
  setConfigPanelVisible(!isConfigPanelVisible);
});

/* ============================================================================
   SECTION: LANDSCAPE / FULLSCREEN HELPERS + OVERLAY
============================================================================ */

async function requestFullscreenIfNeeded() {
  try { if (!document.fullscreenElement) { await (document.documentElement as any).requestFullscreen(); dbg("Requested fullscreen"); } }
  catch (err) { dbg("requestFullscreen error: " + (err as any)?.message); }
}
async function lockOrientationLandscape(): Promise<boolean> {
  try { // @ts-ignore
    if (screen.orientation?.lock) { await screen.orientation.lock("landscape"); dbg("Orientation locked to landscape"); return true; }
  } catch (err) { dbg("orientation.lock error: " + (err as any)?.message); }
  return false;
}
function updateLandscapeOverlayVisibility() {
  const overlay = document.getElementById("landscapeOverlay") as HTMLDivElement;
  if (!overlay) return;
  const isLandscape = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
  overlay.style.display = isLandscape ? "none" : "grid";
  dbg("Overlay " + (isLandscape ? "hidden (landscape)" : "shown (portrait)"));
}
async function enterLandscapeFlow() {
  await requestFullscreenIfNeeded();
  await lockOrientationLandscape();
  updateLandscapeOverlayVisibility();
  centerGyroscopeHeading();
  resetCameraToPathStart();
  placeCameraAtPathT(rideProgressT);
  dbg("Entered landscape flow; camera centered and placed on path");
}
(document.getElementById("enterLandscape") as HTMLButtonElement)?.addEventListener("click", enterLandscapeFlow);
window.addEventListener("orientationchange", () => { updateLandscapeOverlayVisibility(); if (!isRideActive) { centerGyroscopeHeading(); resetCameraToPathStart(); placeCameraAtPathT(rideProgressT); } });
window.addEventListener("resize", updateLandscapeOverlayVisibility);
updateLandscapeOverlayVisibility();

/* ============================================================================
   SECTION: PUBLIC API + MAIN LOOP
============================================================================ */

export function startRide(durationSeconds = 30, loop = true) {
  rideDurationSeconds = Math.max(0.01, durationSeconds);
  isRideLooping = loop;
  rideProgressT = 0;
  isRideActive = true;
  lastScorePointIndex = -1;
  frameClock.getDelta();
  placeCameraAtPathT(rideProgressT);
}
export function stopRide() { isRideActive = false; }

resetCameraToPathStart();
placeCameraAtPathT(rideProgressT);
setConfigPanelVisible(true); // Config panel should always be visible on load

const enableGyroButtonMaybe = document.getElementById("enable-gyro") as HTMLButtonElement;
generateScoreMarkers(maxScore); // Initial generation of score markers
enableGyroscope().then((ok) => { if (ok && enableGyroButtonMaybe) enableGyroButtonMaybe.textContent = "Disable Gyro"; placeCameraAtPathT(rideProgressT); });

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
    if (isRideLooping && rideProgressT < (deltaSeconds / rideDurationSeconds)) { // Just completed a loop, reset for next lap
      lastScorePointIndex = -1;
      playerScore = 0;
      playerHearts = 3; heartsTextElement.textContent = "❤❤❤";
    }
    placeCameraAtPathT(rideProgressT);
    orbitControls.enabled = false;
  } else { orbitControls.enabled = true; orbitControls.update(); }  const needleNormalized = clampNumber((rollRelativeDegreesSmoothed * yawSensitivity) / maxRollDegrees, -1, 1);
  updateHudAndScoring(needleNormalized, deltaSeconds);

  // Rotate steering wheel based on needle position
  steeringWheelMesh.rotation.z = -needleNormalized * (Math.PI / 2);

  // When the ride has just finished, run scoring one last time to catch the final point.
  const justFinished = !isRideActive && rideProgressT >= 1.0;
  if (justFinished && lastScorePointIndex < maxScore) {
    updateHudAndScoring(needleNormalized, deltaSeconds);
    // This is the final frame, so we need to manually update the score index to prevent re-scoring.
    const currentScorePointIndex = Math.floor(rideProgressT * maxScore);
    lastScorePointIndex = currentScorePointIndex;
  }
  webglRenderer.render(scene, rideCamera);
  requestAnimationFrame(renderLoop);
}
renderLoop();

window.addEventListener("resize", () => { rideCamera.aspect = window.innerWidth / window.innerHeight; rideCamera.updateProjectionMatrix(); webglRenderer.setSize(window.innerWidth, window.innerHeight); });
scene.add(new THREE.AxesHelper(2));
durationInput.addEventListener("change", () => dbg(`Input: Duration = ${durationInput.value}`));
loopCheckbox.addEventListener("change", () => dbg(`Toggle: Loop = ${loopCheckbox.checked}`));
