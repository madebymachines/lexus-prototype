// Import the Three.js core library and helpers
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import courtTextureUrl from './court.png';

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

const rideCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
scene.add(rideCamera);

const orbitControls = new OrbitControls(rideCamera, webglRenderer.domElement);
orbitControls.enableDamping = true;

const gltfLoader = new GLTFLoader();
let sceneMesh: THREE.Object3D | null = null;

/* ============================================================================
   SECTION: LIGHTING AND REFERENCE GRID
============================================================================ */

scene.add(new THREE.HemisphereLight(0xffffff, 0xffffff, 1.0));

const gridHelper = new THREE.GridHelper(100, 100, 0x335a7a, 0x1f3447);
(gridHelper.material as THREE.Material).transparent = true;
(gridHelper.material as THREE.Material & { opacity: number }).opacity = 0.25;
scene.add(gridHelper);
gridHelper.visible = false; // Default to hidden

// Ground Plane (from path editor)
const groundGeo = new THREE.PlaneGeometry(100, 100);
const DEFAULT_GROUND_COLOR = 0x0b3a24;
const groundMat = new THREE.MeshStandardMaterial({ color: DEFAULT_GROUND_COLOR });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
// scene.add(ground);

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

// Per-segment speeds (length = points.length-1).
let segSpeeds: number[] = [
  10, 10, 10, 10, 10, 10, 10, 10, 10
];

// Arc-length data
let sampledPts: THREE.Vector3[] = [];
let cumLen: number[] = [];
let totalLen = 0;

// s at each control point
let sAtPoint: number[] = [];

// Turn angles at each interior point (degrees)
let turnAngle: number[] = [];

// Hardcoded values from the path editor's UI for speed calculation
let angleSpeedMultipliers = { p0_20: 100, p20_45: 90, p45_90: 75, p90_120: 60, p120_150: 10, p150_165: 5, p165_180: 1 };
let speedWindowParams = { wPrevStart: 0.625, wPrevEnd: 1.0, wNextHold: 0, wNextAccel: 0.5 };
let tension = 0.7;

let rideCurve = new THREE.CatmullRomCurve3(sCurveControlPoints, false, 'catmullrom', 0.7);

// Road mesh
let roadMesh: THREE.Mesh | null = null;
let line: THREE.Line | null = null; // for when road mesh is hidden
const lineMat = new THREE.LineBasicMaterial({ vertexColors: true });
const roadMaterials: { [key: string]: THREE.MeshStandardMaterial } = {};

// Cart marker (from path editor)
const cart = new THREE.Group();
const cartBody = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.2, 1, 24), new THREE.MeshBasicMaterial({color:0xffff00}));
cartBody.position.set(0, 0, 0);
const Y_AXIS = new THREE.Vector3(0,1,0);
cart.visible = false; // Default visibility
cart.add(cartBody);
scene.add(cart);

// Curve Point Markers (original sCurveControlPoints)
const curvePointMarkersGroup = new THREE.Group();
sCurveControlPoints.forEach((point, index) => {
  // Sphere marker
  const sphereGeometry = new THREE.SphereGeometry(0.125, 16, 16);
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
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(index.toString(), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 1, 1);
    sprite.position.copy(point).add(new THREE.Vector3(0, 1, 0)); // Offset above the sphere
    curvePointMarkersGroup.add(sprite);
  }
});
scene.add(curvePointMarkersGroup);

function regenerateCurvePointMarkers() {
  // Clear existing markers
  while (curvePointMarkersGroup.children.length) {
    curvePointMarkersGroup.remove(curvePointMarkersGroup.children[0]);
  }

  const heightScale = parseFloat(heightScaleInput.value) || 0;

  sCurveControlPoints.forEach((point, index) => {
    // Calculate the correct elevated position for the marker, just like the path editor does.
    const pointHeight = (sAtPoint[index] || 0) * heightScale;
    const elevatedPos = new THREE.Vector3(point.x, point.y + pointHeight, point.z);

    const sphereGeometry = new THREE.SphereGeometry(0.125, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(elevatedPos); // Use the elevated position
    curvePointMarkersGroup.add(sphere);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      canvas.width = 128;
      canvas.height = 64;
      context.font = 'Bold 30px Arial';
      context.fillStyle = 'rgba(255,255,255,1)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(index.toString(), canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(2, 1, 1);
      sprite.position.copy(elevatedPos).add(new THREE.Vector3(0, 1, 0)); // Also use the elevated position for the label
      curvePointMarkersGroup.add(sprite);
    }
  });
}
const leadMarkerMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
leadMarkerMesh.scale.set(0.2, 0.2, 0.2);
scene.add(leadMarkerMesh);

leadMarkerMesh.visible = false; // Default visibility
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
let rideProgressS = 0; // New: progress in meters (arc length)
let isRideActive = false; // Let's default to active for easier testing
let isRideLooping = false;
const frameClock = new THREE.Clock();

let cameraOffsetMin = -0.25;
let cameraOffsetMax = 0.25;
let cameraOffsetCurrent = 0;
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
  let rawRoll: number;
  if (isLandscape) {
    let betaRoll = e.beta * rollSign;
    // Fold beta into a stable [-90, 90] range to avoid the
    // sudden ±170/180° jumps when crossing ±90°.
    if (betaRoll > 90) betaRoll = 180 - betaRoll;
    if (betaRoll < -90) betaRoll = -180 - betaRoll;
    rawRoll = betaRoll;
  } else {
    rawRoll = e.gamma;
  }

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
let targetWidthNormalized = 0.2;
let targetCenterNormalizedSmoothed = 0; // New: for smoothed target movement
let targetSmoothingAlpha = 0.03; // New: smoothing factor

/* ============================================================================
   SECTION: CAMERA + LEAD MARKER PLACEMENT
============================================================================ */

function placeCameraAtPathT(pathT: number) {
  const clampedT = THREE.MathUtils.clamp(pathT, 0, 1);

  // --- START: FIX for Sinking Camera and Late Slowdown ---
  // Find the index on the *final, height-adjusted* sampled points array.
  const s = rideProgressS;
  const idx = distanceToIndex(s);
  const positionOnCurve = sampledPts[idx]; // Use the elevated point
  const tangentOnCurve = (idx < sampledPts.length - 1)
    ? new THREE.Vector3().subVectors(sampledPts[idx + 1], sampledPts[idx])
    : new THREE.Vector3().subVectors(sampledPts[idx], sampledPts[idx - 1]);
  tangentOnCurve.normalize();
  // --- END: FIX ---

  // Use the chase-cam positioning from the path editor, plus a lateral offset driven by the HUD needle.
  const backVector = tangentOnCurve.clone().negate();
  const sideVector = new THREE.Vector3().crossVectors(tangentOnCurve, worldYAxis).normalize();
  const lateralOffset = sideVector.multiplyScalar(cameraOffsetCurrent);

  const cameraPosition = positionOnCurve.clone()
    .addScaledVector(backVector, 0.5)
    .add(new THREE.Vector3(0, 0.25, 0))
    .add(lateralOffset);
  rideCamera.position.copy(cameraPosition);
  const pointWeLookAt = positionOnCurve.clone().addScaledVector(tangentOnCurve, 5); // Look 5m ahead of the point on the curve
  rideCamera.lookAt(pointWeLookAt);

  const yawRadians = THREE.MathUtils.degToRad(clampNumber(-rollRelativeDegreesSmoothed * yawSensitivity, -maxRollDegrees, maxRollDegrees));
  if (isGyroEnabled) { yawQuaternionTemp.setFromAxisAngle(worldYAxis, yawRadians); rideCamera.quaternion.premultiply(yawQuaternionTemp); }

  // --- START: FIX for erratic lead marker ---
  // Use a constant look-ahead distance in meters, not a parametric offset.
  const leadDistanceMeters = parseFloat(leadDistanceInput.value) || 2.0;
  const aheadS = (rideProgressS + leadDistanceMeters) % totalLen;
  const aheadIdx = distanceToIndex(aheadS);
  const aheadPoint = sampledPts[aheadIdx]; // Get point from the correct, elevated path
  const aheadTangent = (aheadIdx < sampledPts.length - 1)
    ? new THREE.Vector3().subVectors(sampledPts[aheadIdx + 1], sampledPts[aheadIdx])
    : new THREE.Vector3().subVectors(sampledPts[aheadIdx], sampledPts[aheadIdx - 1]);
  aheadTangent.normalize();
  // --- END: FIX ---

  // Position the lead marker mesh at the calculated ahead point
  leadMarkerMesh.position.copy(aheadPoint);
  leadMarkerMesh.lookAt(aheadPoint.clone().add(aheadTangent));

  const yawNow = Math.atan2(tangentOnCurve.x, tangentOnCurve.z);
  const yawAhead = Math.atan2(aheadTangent.x, aheadTangent.z);
  const deltaYawRad = THREE.MathUtils.euclideanModulo(yawAhead - yawNow + Math.PI, Math.PI * 2) - Math.PI;
  const deltaYawDeg = THREE.MathUtils.radToDeg(deltaYawRad);
  targetCenterNormalized = clampNumber(-deltaYawDeg / maxRollDegrees, -1, 1);
}

function initializePathData() {
  rideCurve = new THREE.CatmullRomCurve3(sCurveControlPoints, false, 'catmullrom', tension);

  // Use the more accurate sampling method from the path editor
  const resScale = parseFloat(resScaleInput.value);
  const divisions = Math.max(2, sCurveControlPoints.length * resScale);
  const points = rideCurve.getPoints(divisions);

  // Build arc-length table
  sampledPts = [points[0].clone()];
  cumLen = [0];
  let acc = 0;
  const targetStep = 0.02; // Target distance between samples
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(d / targetStep));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      acc += p.distanceTo(sampledPts[sampledPts.length - 1]);
      sampledPts.push(p);
      cumLen.push(acc);
    }
  }
  totalLen = acc;

  // Calculate 's' (distance) at each original control point
  sAtPoint = sCurveControlPoints.map(p => {
    let bestI = 0, bestD = Infinity;
    for (let i = 0; i < sampledPts.length; i++) {
      const d = sampledPts[i].distanceTo(p);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return cumLen[bestI];
  });

}

function computeTurnAngles() {
  turnAngle = sCurveControlPoints.map((_, i) => 0)
  for (let i=1; i<sCurveControlPoints.length-1; i++) {
    const a = new THREE.Vector3().subVectors(sCurveControlPoints[i], sCurveControlPoints[i-1]).setY(0).normalize()
    const b = new THREE.Vector3().subVectors(sCurveControlPoints[i+1], sCurveControlPoints[i]).setY(0).normalize()
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
    const ang = THREE.MathUtils.radToDeg(Math.acos(dot)) // 0..180
    turnAngle[i] = ang
  }
}

function sToT(s: number): number {
  if (totalLen === 0 || !isFinite(s)) return 0; // Prevent NaN/Infinity issues and handle empty curve
  const targetS = THREE.MathUtils.clamp(s, 0, totalLen);

  const index = distanceToIndex(targetS);

  // Handle the very beginning of the curve explicitly
  if (index === 0) {
    return 0;
  }
  // If the index is at the very end, return 1
  if (index >= cumLen.length - 1) {
    return 1;
  }

  const s0 = cumLen[index - 1];
  const s1 = cumLen[index];
  const t1 = (index) / (sampledPts.length - 1);
  const t0 = (index - 1) / (sampledPts.length - 1);

  const segmentLength = s1 - s0;
  // Avoid division by zero if segmentLength is 0 (shouldn't happen with proper sampling, but good for robustness)
  const segmentProgress = segmentLength === 0 ? 0 : (targetS - s0) / segmentLength;

  return t0 + (t1 - t0) * segmentProgress;
}

function resetCameraToPathStart() { rideProgressS = 0; rideProgressT = 0; placeCameraAtPathT(0); if (orbitControls) { orbitControls.target.copy(rideCurve.getPointAt(0)); orbitControls.update(); } }

/* ============================================================================
   SECTION: DOM GRABS (HUD + MODAL + CONFIG TOGGLE)
============================================================================ */

const hudBarElement = document.getElementById("bar") as HTMLDivElement;
const hudNeedleElement = document.getElementById("needle") as HTMLDivElement;
const hudTargetElement = document.getElementById("target") as HTMLDivElement;
const hudCenterlineElement = document.getElementById("centerline") as HTMLDivElement;
const scoreTextElement = document.getElementById("score") as HTMLSpanElement;
const extraHudElement = document.getElementById("extraHud") as HTMLDivElement;
const targetSmoothingInput = document.getElementById("targetSmoothing") as HTMLInputElement;
const heartsTextElement = document.getElementById("hearts") as HTMLDivElement;
const leadDistanceInput = document.getElementById("leadDistance") as HTMLInputElement;
const cameraOffsetMinInput = document.getElementById("cameraOffsetMin") as HTMLInputElement;
const cameraOffsetMaxInput = document.getElementById("cameraOffsetMax") as HTMLInputElement;
const tryAgainModalElement = document.getElementById("modal") as HTMLDivElement;
const damageVignetteElement = document.getElementById("vignette") as HTMLDivElement;
const successModalElement = document.getElementById("successModal") as HTMLDivElement;
const successScoreElement = document.getElementById("successScore") as HTMLSpanElement;
const debugConfigPanel = document.getElementById("debugConfig") as HTMLDivElement;
const toggleConfigButton = document.getElementById("toggle-ui") as HTMLButtonElement;

const pathNameSpan = document.getElementById("pathName") as HTMLSpanElement;
const pathDateSpan = document.getElementById("pathDate") as HTMLSpanElement;
const toggleExtraHudButton = document.getElementById("toggle-extra-hud") as HTMLButtonElement;
const calibrationModalElement = document.getElementById("calibrationModal") as HTMLDivElement;
const calibrationStartButton = document.getElementById("calibrationStartRide") as HTMLButtonElement;
const calibrateGyroButton = document.getElementById("calibrateGyro") as HTMLButtonElement;
const successRestartButton = document.getElementById("successRestart") as HTMLButtonElement;

const tensionInput = document.getElementById('tension') as HTMLInputElement;
const tensionVal = document.getElementById('tensionVal') as HTMLSpanElement;
// Path & Appearance UI
const resScaleInput = document.getElementById('resScale') as HTMLInputElement;
const roadToggle = document.getElementById('roadToggle') as HTMLInputElement;
const roadMeshSettings = document.getElementById('roadMeshSettings') as HTMLDivElement;
const roadWidthInput = document.getElementById('roadWidth') as HTMLInputElement;
const heightScaleInput = document.getElementById('heightScale') as HTMLInputElement;
const roadMaterialPresetInput = document.getElementById('roadMaterialPreset') as HTMLSelectElement;
// const groundTexInput = document.getElementById('groundTex') as HTMLInputElement;
// const btnClearTex = document.getElementById('btnClearTex') as HTMLButtonElement;

const fadeEffectInput = document.getElementById('fadeEffect') as HTMLSelectElement;
const fadeEffectSettings = document.getElementById('fadeEffectSettings') as HTMLDivElement;
const fadeInStartInput = document.getElementById('fadeInStart') as HTMLInputElement;
const fadeInEndInput = document.getElementById('fadeInEnd') as HTMLInputElement;
const fadeOutStartInput = document.getElementById('fadeOutStart') as HTMLInputElement;
const fadeOutEndInput = document.getElementById('fadeOutEnd') as HTMLInputElement;



const importJsonInput = document.getElementById("importJson") as HTMLInputElement;

// Advanced Speed Profile UI
const wPrevStartInput = document.getElementById('wPrevStart') as HTMLInputElement;
const wPrevEndInput = document.getElementById('wPrevEnd') as HTMLInputElement;
const wNextHoldInput = document.getElementById('wNextHold') as HTMLInputElement;
const wNextAccelInput = document.getElementById('wNextAccel') as HTMLInputElement;
const p0_20_Input = document.getElementById('p0_20') as HTMLInputElement;
const p20_45_Input = document.getElementById('p20_45') as HTMLInputElement;
const p45_90_Input = document.getElementById('p45_90') as HTMLInputElement;
const p90_120_Input = document.getElementById('p90_120') as HTMLInputElement;
const p120_150_Input = document.getElementById('p120_150') as HTMLInputElement;
const p150_165_Input = document.getElementById('p150_165') as HTMLInputElement;
const p165_180_Input = document.getElementById('p165_180') as HTMLInputElement;

// Speedometer UI
const speedoProgress = document.getElementById('speedoProgress') as unknown as SVGUseElement;
const speedoValue = document.getElementById('speedoValue') as unknown as SVGTextElement;
const speedoTicks = document.getElementById('speedoTicks') as unknown as SVGGElement;
let speedoArcLength = 0;



/* ============================================================================
   SECTION: GAME STATE (SCORE / HEARTS) + HUD UPDATE
============================================================================ */

let playerScore = 0;
let playerHearts = 3;
let wasInsideTargetPrevFrame = false;
let scoreAccumulatorSeconds = 0;
let noDamageMode = false; // New: for debugging, prevent losing hearts/score
let currentSpeedForHud = 0; // For debugging
let isExtraHudVisible = false;

if (extraHudElement) {
  extraHudElement.style.display = "none";
}

function flashDamageVignette() { damageVignetteElement.classList.add("show"); setTimeout(() => damageVignetteElement.classList.remove("show"), 350); }

function updateHudAndScoring(needleNormalized: number, deltaSeconds: number) {
  // Apply smoothing to the target's center position
  targetCenterNormalizedSmoothed += (targetCenterNormalized - targetCenterNormalizedSmoothed) * targetSmoothingAlpha;

  const barWidthPx = hudBarElement.clientWidth;
  const normalizedToPixels = (n: number) => ((clampNumber(n, -1, 1) + 1) * 0.5 * barWidthPx);
  const targetWidthPx = Math.max(6, barWidthPx * clampNumber(targetWidthNormalized, 0.02, 1));
  const targetLeftPx = normalizedToPixels(targetCenterNormalizedSmoothed) - targetWidthPx / 2;
  const needleLeftPx = normalizedToPixels(needleNormalized) - 2;
  hudNeedleElement.style.left = `${needleLeftPx}px`;
  hudTargetElement.style.left = `${targetLeftPx}px`;
  hudTargetElement.style.width = `${targetWidthPx}px`;
  if (hudCenterlineElement) {
    const centerlineLeftPx = normalizedToPixels(0) - 2;
    hudCenterlineElement.style.left = `${centerlineLeftPx}px`;
  }
  const isOverlapping = !(needleLeftPx + 4 < targetLeftPx || needleLeftPx > targetLeftPx + targetWidthPx);
  hudBarElement.style.boxShadow = isOverlapping ? "0 0 12px rgba(46,204,113,0.8)" : "none"; hudBarElement.classList.toggle("ok", isOverlapping);

  // v7-style scoring: accumulate points over time while on target
  if (isRideActive) {
    scoreAccumulatorSeconds += deltaSeconds;
    while (scoreAccumulatorSeconds >= 0.1) {
      scoreAccumulatorSeconds -= 0.1;
      if (isOverlapping) {
        playerScore += 1;
      }
    }
  }

  if (isRideActive && wasInsideTargetPrevFrame && !isOverlapping) {
    if (!noDamageMode) { // Only lose heart if not in no-damage mode
      playerHearts = Math.max(0, playerHearts - 1);
    }
    heartsTextElement.textContent = "❤".repeat(playerHearts) + "♡".repeat(3 - playerHearts); flashDamageVignette(); if (playerHearts <= 0) { isRideActive = false; orbitControls.enabled = true; tryAgainModalElement.style.display = "grid"; } }
  wasInsideTargetPrevFrame = isOverlapping;
  scoreTextElement.textContent = String(playerScore);

  // Update extra HUD
  const camRot = rideCamera.rotation;
  const r2d = THREE.MathUtils.radToDeg;
  const rotStr = `x:${r2d(camRot.x).toFixed(1)} y:${r2d(camRot.y).toFixed(1)} z:${r2d(camRot.z).toFixed(1)}`;
  const gyroStr = `α:${rawGyroAlpha.toFixed(1)} β:${rawGyroBeta.toFixed(1)} γ:${rawGyroGamma.toFixed(1)}`;
  extraHudElement.innerHTML = `<strong>Speed:</strong> ${currentSpeedForHud.toFixed(2)} m/s<br>` +
    `<strong>Camera Rotation (xyz):</strong> ${rotStr}<br>` +
    `<strong>Gyro Raw Rotation (xyz):</strong> ${gyroStr}<br>` +
    `<strong>Camera Offset (m):</strong> ${cameraOffsetCurrent.toFixed(2)}<br>` +
    `<strong>Needle (norm):</strong> ${needleNormalized.toFixed(3)}`;
}

/* ============================================================================
   SECTION: UI WIRING (BUTTONS + INPUTS)
============================================================================ */

const durationInput = document.getElementById("duration") as HTMLInputElement;
const loopCheckbox = document.getElementById("loop") as HTMLInputElement;

let isConfigPanelVisible = false;
function setConfigPanelVisible(visible: boolean) {
  isConfigPanelVisible = visible;
  debugConfigPanel.style.display = visible ? "" : "none";
  toggleConfigButton.textContent = visible ? "Hide Config" : "Show Config";
}

document.getElementById("stop")?.addEventListener("click", () => {
  dbg("Button: Stop");
  stopRide();
  playerScore = 0;
  scoreTextElement.textContent = String(playerScore);
  playerHearts = 3; heartsTextElement.textContent = "❤❤❤";
});
document.getElementById("reset")?.addEventListener("click", () => { dbg("Button: Reset Camera"); stopRide(); resetCameraToPathStart(); });

const enableGyroButton = document.getElementById("enable-gyro") as HTMLButtonElement;
const centerGyroButton = document.getElementById("center-gyro") as HTMLButtonElement;
const gyroSensitivityInput = document.getElementById("gyro-sense") as HTMLInputElement;

enableGyroButton?.addEventListener("click", async () => {
  if (!isGyroEnabled) {
    dbg("Button: Enable Gyro");
    const ok = await enableGyroscope();
    if (!ok) { alert("Gyro permission denied or not available. Use HTTPS/localhost and tap (iOS)."); return; }
    enableGyroButton.textContent = "Disable Gyro";
    await enterLandscapeFlow();
  } else {
    dbg("Button: Disable Gyro");
    disableGyroscope();
    enableGyroButton.textContent = "Enable Gyro";
  }
});
centerGyroButton?.addEventListener("click", () => {
  dbg("Button: Recalibrate Gyro");
  stopRide();
  if (calibrationModalElement) {
    calibrationModalElement.style.display = "grid";
  }
});
gyroSensitivityInput?.addEventListener("input", () => { const value = parseFloat(gyroSensitivityInput.value); yawSensitivity = Number.isFinite(value) ? value : 1.0; dbg(`Input: Gyro Sensitivity = ${yawSensitivity}`); });

const targetWidthInput = document.getElementById("targetWidth") as HTMLInputElement;
targetWidthInput?.addEventListener("input", () => { const value = parseFloat(targetWidthInput.value); if (Number.isFinite(value)) { targetWidthNormalized = clampNumber(value, 0.02, 1); dbg(`Input: Target Width = ${targetWidthNormalized}`); } });
targetSmoothingInput?.addEventListener("input", () => {
  const value = parseFloat(targetSmoothingInput.value);
  if (Number.isFinite(value)) { targetSmoothingAlpha = clampNumber(value, 0, 1); dbg(`Input: Target Smoothing = ${targetSmoothingAlpha}`); }
});

calibrateGyroButton?.addEventListener("click", () => {
  dbg("Button: Calibrate Gyro");
  centerGyroscopeHeading();
  placeCameraAtPathT(rideProgressT);
});

calibrationStartButton?.addEventListener("click", () => {
  dbg("Button: Calibration Start Ride");
  if (calibrationModalElement) {
    calibrationModalElement.style.display = "none";
  }
  const overlay = document.getElementById("countdownOverlay") as HTMLDivElement;
  if (!overlay) {
    startRide(!!loopCheckbox.checked);
    return;
  }
  let count = 3;
  overlay.textContent = String(count);
  overlay.style.display = "grid";
  const interval = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(interval);
      overlay.style.display = "none";
      startRide(!!loopCheckbox.checked);
    } else {
      overlay.textContent = String(count);
    }
  }, 1000);
});

successRestartButton?.addEventListener("click", () => {
  dbg("Button: Restart (from success modal)");
  if (successModalElement) {
    successModalElement.style.display = "none";
  }
  stopRide();
  enterLandscapeFlow();
});

toggleExtraHudButton?.addEventListener("click", () => {
  isExtraHudVisible = !isExtraHudVisible;
  if (extraHudElement) {
    extraHudElement.style.display = isExtraHudVisible ? "" : "none";
  }
  if (toggleExtraHudButton) {
    toggleExtraHudButton.textContent = isExtraHudVisible ? "Hide Extra HUD" : "Show Extra HUD";
  }
});

cameraOffsetMinInput?.addEventListener("input", () => {
  const value = parseFloat(cameraOffsetMinInput.value);
  if (Number.isFinite(value)) {
    cameraOffsetMin = value;
    dbg(`Input: Camera Offset Min = ${cameraOffsetMin}`);
  }
});

cameraOffsetMaxInput?.addEventListener("input", () => {
  const value = parseFloat(cameraOffsetMaxInput.value);
  if (Number.isFinite(value)) {
    cameraOffsetMax = value;
    dbg(`Input: Camera Offset Max = ${cameraOffsetMax}`);
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

const toggleCartButton = document.getElementById("toggleCart") as HTMLButtonElement;
const toggleLeadMarkerButton = document.getElementById("toggleLeadMarker") as HTMLButtonElement;

const toggleGridButton = document.getElementById("toggleGrid") as HTMLButtonElement;
toggleGridButton.textContent = gridHelper.visible ? "Hide Grid" : "Show Grid";



let cartVisible = false;
toggleCartButton.textContent = cartVisible ? "Hide Cart" : "Show Cart";
toggleCartButton?.addEventListener("click", () => {
  cartVisible = !cartVisible;
  cart.visible = cartVisible;
  dbg(`Toggle: Cart = ${cartVisible}`);
  toggleCartButton.textContent = cartVisible ? "Hide Cart" : "Show Cart";
});

let leadMarkerVisible = false;
toggleLeadMarkerButton.textContent = leadMarkerVisible ? "Hide Lead Marker" : "Show Lead Marker";
toggleLeadMarkerButton?.addEventListener("click", () => {
  leadMarkerVisible = !leadMarkerVisible;
  leadMarkerMesh.visible = leadMarkerVisible;
  dbg(`Toggle: Lead Marker = ${leadMarkerVisible}`);
  toggleLeadMarkerButton.textContent = leadMarkerVisible ? "Hide Lead Marker" : "Show Lead Marker";
});

toggleGridButton?.addEventListener("click", () => {
  gridHelper.visible = !gridHelper.visible;
  toggleGridButton.textContent = gridHelper.visible ? "Hide Grid" : "Show Grid";
});

function setupSpeedometer() {
  const arc = document.getElementById('speedoArc') as unknown as SVGPathElement;
  if (!arc) return;
  speedoArcLength = arc.getTotalLength();
  if (speedoProgress) {
    speedoProgress.style.strokeDasharray = String(speedoArcLength);
    speedoProgress.style.strokeDashoffset = String(speedoArcLength);
  }

  // Generate ticks
  const numTicks = 10; // e.g., 0, 20, 40... 180
  const tickLength = 10;
  const tickInnerRadius = 80 - 12; // arc radius - stroke width

  for (let i = 0; i < numTicks; i++) {
    const progress = i / (numTicks - 1);
    // Angle from -180 (left) to 0 (right) in degrees for a semicircle starting from the left
    const angleDeg = -180 + (progress * 180);
    const angleRad = angleDeg * (Math.PI / 180);

    const x1 = 100 + Math.cos(angleRad) * tickInnerRadius;
    const y1 = 100 + Math.sin(angleRad) * tickInnerRadius;
    const x2 = 100 + Math.cos(angleRad) * (tickInnerRadius - tickLength);
    const y2 = 100 + Math.sin(angleRad) * (tickInnerRadius - tickLength);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    if (speedoTicks) {
      speedoTicks.appendChild(line);
    }
  }
}

tensionInput.oninput = () => {
  tension = parseFloat(tensionInput.value);
  tensionVal.textContent = tension.toFixed(2);
  rebuildCurveAndRoad();
};

resScaleInput.onchange = () => { rebuildCurveAndRoad(); };
roadToggle.onchange = () => { toggleRoadMeshVisibility(); };
roadWidthInput.onchange = () => { rebuildCurveAndRoad(); };
heightScaleInput.onchange = () => { rebuildCurveAndRoad(); };
roadMaterialPresetInput.onchange = () => { if (roadMesh) { roadMesh.material = roadMaterials[roadMaterialPresetInput.value] || roadMaterials['default']; } rebuildCurveAndRoad(); };

// const textureLoader = new THREE.TextureLoader();
// function applyTexture(url: string) {
//   textureLoader.load(url, (tex: THREE.Texture) => {
//     tex.colorSpace = THREE.SRGBColorSpace;
//     tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
//     tex.anisotropy = webglRenderer.capabilities.getMaxAnisotropy();
//     groundMat.map = tex; groundMat.color.set(0xffffff); groundMat.needsUpdate = true;
//   });
// }
// groundTexInput.onchange = () => {
//   const file = groundTexInput.files?.[0]; if (!file) return;
//   const url = URL.createObjectURL(file);
//   applyTexture(url);
// };
// btnClearTex.onclick = () => {
//   groundMat.map = null;
//   groundMat.color.set(DEFAULT_GROUND_COLOR);
//   groundMat.needsUpdate = true;
// };

function updateFadeSettingsVisibility() {
  const show = fadeEffectInput.value === 'dynamic';
  fadeEffectSettings.style.display = show ? 'flex' : 'none';
}

function updateFadeUniforms() {
  for (const key in roadMaterials) {
    const mat = roadMaterials[key];
    if (mat.userData.shader) {
      mat.userData.shader.uniforms.u_fadeInStart.value = parseFloat(fadeInStartInput.value);
      mat.userData.shader.uniforms.u_fadeInEnd.value = parseFloat(fadeInEndInput.value);
      mat.userData.shader.uniforms.u_fadeOutStart.value = parseFloat(fadeOutStartInput.value);
      mat.userData.shader.uniforms.u_fadeOutEnd.value = parseFloat(fadeOutEndInput.value);
    }
  }
}
fadeEffectInput.onchange = () => { updateFadeSettingsVisibility(); rebuildCurveAndRoad(); };
fadeInStartInput.oninput = updateFadeUniforms;
fadeInEndInput.oninput = updateFadeUniforms;
fadeOutStartInput.oninput = updateFadeUniforms;
fadeOutEndInput.oninput = updateFadeUniforms;


wPrevStartInput.oninput = () => { speedWindowParams.wPrevStart = parseFloat(wPrevStartInput.value); };
wPrevEndInput.oninput = () => { speedWindowParams.wPrevEnd = parseFloat(wPrevEndInput.value); };
wNextHoldInput.oninput = () => { speedWindowParams.wNextHold = parseFloat(wNextHoldInput.value); };
wNextAccelInput.oninput = () => { speedWindowParams.wNextAccel = parseFloat(wNextAccelInput.value); };

p0_20_Input.oninput = () => { angleSpeedMultipliers.p0_20 = parseFloat(p0_20_Input.value); };
p20_45_Input.oninput = () => { angleSpeedMultipliers.p20_45 = parseFloat(p20_45_Input.value); };
p45_90_Input.oninput = () => { angleSpeedMultipliers.p45_90 = parseFloat(p45_90_Input.value); };
p90_120_Input.oninput = () => { angleSpeedMultipliers.p90_120 = parseFloat(p90_120_Input.value); };
p120_150_Input.oninput = () => { angleSpeedMultipliers.p120_150 = parseFloat(p120_150_Input.value); };
p150_165_Input.oninput = () => { angleSpeedMultipliers.p150_165 = parseFloat(p150_165_Input.value); };
p165_180_Input.oninput = () => { angleSpeedMultipliers.p165_180 = parseFloat(p165_180_Input.value); };

function createDefaultDashedTexture(): THREE.CanvasTexture {
  const dashLengthMeters = 3;
  const gapLengthMeters = 3;
  const centerDashWidthPx = 2;
  const patternLengthMeters = dashLengthMeters + gapLengthMeters;
  const canvas = document.createElement('canvas');
  const canvasWidth = 64;
  const canvasHeight = 128;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = 'white';
  const lineWidth = 2;
  ctx.fillRect(0, 0, lineWidth, canvasHeight);
  ctx.fillRect(canvasWidth - lineWidth, 0, lineWidth, canvasHeight);
  const dashHeightPx = (dashLengthMeters / patternLengthMeters) * canvasHeight;
  const dashX = canvasWidth / 2 - centerDashWidthPx / 2;
  ctx.fillRect(dashX, 0, centerDashWidthPx, dashHeightPx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = webglRenderer.capabilities.getMaxAnisotropy();
  texture.repeat.y = 1 / patternLengthMeters;
  return texture;
}

function createRacingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const canvasWidth = 64;
  const canvasHeight = 64;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  const curbWidth = 4;
  const curbSegmentLength = canvasHeight / 2;
  ctx.fillStyle = '#ff0000'; // Red
  ctx.fillRect(0, 0, curbWidth, curbSegmentLength);
  ctx.fillRect(canvasWidth - curbWidth, curbSegmentLength, curbWidth, curbSegmentLength);
  ctx.fillStyle = '#ffffff'; // White
  ctx.fillRect(0, curbSegmentLength, curbWidth, curbSegmentLength);
  ctx.fillRect(canvasWidth - curbWidth, 0, curbWidth, curbSegmentLength);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = webglRenderer.capabilities.getMaxAnisotropy();
  texture.repeat.y = 1 / 1.0;
  return texture;
}

function applyAlphaMaskShader(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.u_cartDistance = { value: 0.0 };
    shader.uniforms.u_useFade = { value: fadeEffectInput.value === 'dynamic' };
    shader.uniforms.u_fadeInStart = { value: parseFloat(fadeInStartInput.value) };
    shader.uniforms.u_fadeInEnd = { value: parseFloat(fadeInEndInput.value) };
    shader.uniforms.u_fadeOutStart = { value: parseFloat(fadeOutStartInput.value) };
    shader.uniforms.u_fadeOutEnd = { value: parseFloat(fadeOutEndInput.value) };

    material.userData.shader = shader;

    shader.vertexShader = `
          varying float vPathDistance;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
           vPathDistance = uv.y;`
    );

    shader.fragmentShader = `
          uniform float u_cartDistance;
          uniform bool u_useFade;
          uniform float u_fadeInStart;
          uniform float u_fadeInEnd;
          uniform float u_fadeOutStart;
          uniform float u_fadeOutEnd;
          varying float vPathDistance;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>

          if (u_useFade) {
            float distToCart = vPathDistance - u_cartDistance;
            float alphaBehind = smoothstep(u_fadeInStart, u_fadeInEnd, distToCart);
            float alphaAhead = 1.0 - smoothstep(u_fadeOutStart, u_fadeOutEnd, distToCart);
            gl_FragColor.a *= min(alphaBehind, alphaAhead);
          }`
    );
  };
}

function createAllRoadMaterials() {
  roadMaterials['default'] = new THREE.MeshStandardMaterial({ map: createDefaultDashedTexture() });
  roadMaterials['solid'] = new THREE.MeshStandardMaterial({ color: 0x282828 });
  roadMaterials['racing'] = new THREE.MeshStandardMaterial({ map: createRacingTexture() });

  for (const key in roadMaterials) {
    const mat = roadMaterials[key];
    mat.setValues({
      side: THREE.DoubleSide,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    });
    applyAlphaMaskShader(mat);
  }
}

function toggleRoadMeshVisibility() {
  const showRoad = roadToggle.checked;
  if (roadMesh) roadMesh.visible = showRoad;
  roadMeshSettings.style.display = showRoad ? 'flex' : 'none';
  if (line) line.visible = !showRoad;
}

function rebuildCurveAndRoad() {
  if (line) { scene.remove(line); line.geometry.dispose(); }
  if (roadMesh) { scene.remove(roadMesh); roadMesh.geometry.dispose(); }
  if (sCurveControlPoints.length < 2) return;

  // This now also re-runs the full analysis
  initializePathData();
  computeTurnAngles();

  // Create the colored line for toggling
  const positions = new Float32Array(sampledPts.length * 3);
  const colors = new Float32Array(sampledPts.length * 3);
  const cA = new THREE.Color(0x800000), cB = new THREE.Color(0x008000); // Default red to green
  for (let i = 0; i < sampledPts.length; i++) {
    const t = totalLen > 0 ? cumLen[i] / totalLen : 0;
    const c = cA.clone().lerp(cB, t);
    const p = sampledPts[i];
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    colors[i * 3 + 0] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  lineGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  line = new THREE.Line(lineGeom, lineMat);
  scene.add(line);

  // Apply progressive vertical offset to sampledPts to alleviate z-fighting
  const heightScale = parseFloat(heightScaleInput.value) || 0;
  for (let i = 0; i < sampledPts.length; i++) {
    sampledPts[i].y += cumLen[i] * heightScale;
  }

  // Build road mesh
  const roadVertices: number[] = [];
  const roadNormals: number[] = [];
  const roadUvs: number[] = [];
  const roadIndices: number[] = [];

  const roadWidth = parseFloat(roadWidthInput.value) || 1;
  for (let i = 0; i < sampledPts.length; i++) {
    const p = sampledPts[i];
    const tangent = (i < sampledPts.length - 1)
      ? new THREE.Vector3().subVectors(sampledPts[i + 1], p)
      : new THREE.Vector3().subVectors(p, sampledPts[i - 1]);
    tangent.setY(0).normalize();

    const normal = new THREE.Vector3(0, 1, 0);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    const v_left = p.clone().addScaledVector(binormal, -roadWidth / 2);
    const v_right = p.clone().addScaledVector(binormal, roadWidth / 2);

    roadVertices.push(v_left.x, v_left.y, v_left.z);
    roadVertices.push(v_right.x, v_right.y, v_right.z);
    roadNormals.push(0, 1, 0, 0, 1, 0);
    roadUvs.push(0, cumLen[i], 1, cumLen[i]);

    if (i < sampledPts.length - 1) {
      const i0 = i * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
      roadIndices.push(i0, i2, i1, i1, i2, i3);
    }
  }

  const roadGeom = new THREE.BufferGeometry();
  roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
  roadGeom.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
  roadGeom.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
  roadGeom.setIndex(roadIndices);

  const selectedMatKey = roadMaterialPresetInput.value;
  const selectedMat = roadMaterials[selectedMatKey] || roadMaterials['default'];
  roadMesh = new THREE.Mesh(roadGeom, selectedMat);
  scene.add(roadMesh);

  toggleRoadMeshVisibility();

  // Regenerate curve point markers to align with the new curve geometry
  regenerateCurvePointMarkers();
}

async function loadPathFromJSON(fileOrUrl: File | string) {
  try {
    let text: string;
    if (typeof fileOrUrl === 'string') {
      const response = await fetch(fileOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch path: ${response.statusText}`);
      }
      text = await response.text();
    } else {
      text = await fileOrUrl.text();
    }

    const data = JSON.parse(text);
    if (!Array.isArray(data.points) || data.points.length < 2) {
      throw new Error('JSON must include at least two points');
    }

    // Update UI with name and date
    if (pathNameSpan) pathNameSpan.textContent = data.name || '-';
    if (pathDateSpan) pathDateSpan.textContent = data.date || '-';

    // Update path data
    sCurveControlPoints.length = 0;
    const newPts = data.points.map((p: any) => new THREE.Vector3(+p.x, 0, +p.z));
    sCurveControlPoints.push(...newPts);

    const defaultSpeed = 10;
    const need = Math.max(0, sCurveControlPoints.length - 1);
    let speeds = Array.isArray(data.segmentSpeeds) ? data.segmentSpeeds.slice() : [];
    if (speeds.length < need) {
      while (speeds.length < need) speeds.push(defaultSpeed);
    } else if (speeds.length > need) {
      speeds = speeds.slice(0, need);
    }
    segSpeeds = speeds.map((v: any) => Math.max(0, parseFloat(v) || defaultSpeed));

    // Rebuild the entire curve and road mesh from the new data
    rebuildCurveAndRoad();

    // Reset the camera to the start of the NEWLY loaded path
    resetCameraToPathStart();

    dbg(`Loaded path with ${sCurveControlPoints.length} points.`);
  } catch (err: any) {
    alert('Path import failed: ' + (err?.message || 'Invalid JSON'));
    dbg('Path import failed: ' + (err?.message || 'Invalid JSON'));
  }
}

document.getElementById("restart")?.addEventListener("click", () => {
  dbg("Button: Restart (from modal)");
  (document.getElementById("modal") as HTMLDivElement).style.display = "none"; // Hide modal
  stopRide();
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
  resetCameraToPathStart();
  placeCameraAtPathT(rideProgressT);
  if (calibrationModalElement) {
    calibrationModalElement.style.display = "grid";
  }
  dbg("Entered landscape flow; showing calibration modal");
}
(document.getElementById("enterLandscape") as HTMLButtonElement)?.addEventListener("click", enterLandscapeFlow);
window.addEventListener("orientationchange", () => { updateLandscapeOverlayVisibility(); if (!isRideActive) { centerGyroscopeHeading(); resetCameraToPathStart(); placeCameraAtPathT(rideProgressT); } });
window.addEventListener("resize", updateLandscapeOverlayVisibility);
updateLandscapeOverlayVisibility();

/* ============================================================================
   SECTION: PUBLIC API + MAIN LOOP
============================================================================ */

export function startRide(loop = true) {
  // Reset all ride-related state
  resetCameraToPathStart();
  playerScore = 0;
  playerHearts = 3;
  heartsTextElement.textContent = "❤❤❤";
  wasInsideTargetPrevFrame = false;
  isRideLooping = loop;
  isRideActive = true;
  frameClock.getDelta();
}
export function stopRide() { isRideActive = false; }

/* ============================================================================
   SECTION: SPEED PROFILE FUNCTIONS (COPIED FROM PATH EDITOR)
============================================================================ */

/* Distance → index (binary search) */
function distanceToIndex(distance: number): number {
  distance = Math.max(0, Math.min(distance, totalLen))
  let lo = 0, hi = cumLen.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumLen[mid] < distance) lo = mid + 1
    else hi = mid
  }
  return lo
}

/* Speed profile knobs */
function anglePercent(deg: number): number {
  const d = deg
  if (d <= 20) return parseFloat(p0_20_Input.value) / 100
  if (d <= 45) return parseFloat(p20_45_Input.value) / 100
  if (d <= 90) return parseFloat(p45_90_Input.value) / 100
  if (d <= 120) return parseFloat(p90_120_Input.value) / 100
  if (d <= 150) return parseFloat(p120_150_Input.value) / 100
  if (d <= 165) return parseFloat(p150_165_Input.value) / 100
  return parseFloat(p165_180_Input.value) / 100
}

function baseSegmentSpeedAtS(s: number): number {
  if (sCurveControlPoints.length < 2) return 10; // Default speed
  // find which segment s belongs to
  for (let i=1;i<sCurveControlPoints.length;i++) {
    const sA = sAtPoint[i-1], sB = sAtPoint[i]
    if (s <= sB) return segSpeeds[i-1] ?? 10;
  }
  // Fallback for when s is beyond the last sAtPoint, use the last segment's speed
  return segSpeeds[segSpeeds.length-1] ?? 10;
}

function speedAtS(s: number): number {
  let v = baseSegmentSpeedAtS(s)
  // apply normalized windows around each interior point
  const prevStart = parseFloat(wPrevStartInput.value)
  const prevEnd   = parseFloat(wPrevEndInput.value)
  const nextHold  = parseFloat(wNextHoldInput.value)
  const nextAccel = parseFloat(wNextAccelInput.value)

  for (let i=1; i<sCurveControlPoints.length-1; i++) {
    const sPrevA = sAtPoint[i-1], sPrevB = sAtPoint[i]
    const sNextA = sAtPoint[i],   sNextB = sAtPoint[i+1]

    const prevLen = Math.max(1e-6, sPrevB - sPrevA)
    const nextLen = Math.max(1e-6, sNextB - sNextA)

    const tPrev = THREE.MathUtils.clamp((s - sPrevA) / prevLen, 0, 1)
    const tNext = THREE.MathUtils.clamp((s - sNextA) / nextLen, 0, 1)

    const prevV = segSpeeds[i-1] ?? v
    const nextV = segSpeeds[i] ?? v
    const minPct = anglePercent(turnAngle[i])
    const minV = Math.min(prevV, nextV) * minPct

    // Prev-seg window
    if (s >= sPrevA && s <= sPrevB) {
      if (tPrev >= prevStart && tPrev <= prevEnd) {
        const t = (tPrev - prevStart) / Math.max(1e-6, (prevEnd - prevStart))
        v = THREE.MathUtils.lerp(prevV, minV, THREE.MathUtils.clamp(t,0,1))
      } else if (tPrev > prevEnd && tPrev <= 1.0) {
        v = minV // hold until turn
      }
    }

    // Next-seg window
    if (s >= sNextA && s <= sNextB) {
      if (tNext <= nextHold) {
        v = minV // hold after turn
      } else if (tNext > nextHold && tNext <= nextAccel) {
        const t = (tNext - nextHold) / Math.max(1e-6, (nextAccel - nextHold))
        v = THREE.MathUtils.lerp(minV, nextV, THREE.MathUtils.clamp(t,0,1))
      }
    }
  }
  return Math.max(0, v)
}

window.addEventListener("resize", () => { rideCamera.aspect = window.innerWidth / window.innerHeight; rideCamera.updateProjectionMatrix(); webglRenderer.setSize(window.innerWidth, window.innerHeight); });
scene.add(new THREE.AxesHelper(0));
loopCheckbox.addEventListener("change", () => dbg(`Toggle: Loop = ${loopCheckbox.checked}`));

function renderLoop() {
  const deltaSeconds = frameClock.getDelta();

  const needleNormalized = clampNumber((rollRelativeDegreesSmoothed * yawSensitivity) / maxRollDegrees, -1, 1);
  const offsetRange = cameraOffsetMax - cameraOffsetMin;
  cameraOffsetCurrent = cameraOffsetMin + (needleNormalized + 1) * 0.5 * offsetRange;

  // Update shader uniforms for the fade effect
  if (roadMesh && roadMesh.visible) {
    // Cast the material to access userData, which is where the shader is stored.
    const mat = roadMesh.material as THREE.MeshStandardMaterial;
    if (mat.userData.shader) {
      mat.userData.shader.uniforms.u_cartDistance.value = rideProgressS;
    }
  }

  if (isRideActive) {
    // 1. Get the current speed in meters/sec from our speed profile function
    const currentSpeed = currentSpeedForHud = speedAtS(rideProgressS);
    // 2. Advance our distance along the curve by speed * time
    rideProgressS += currentSpeed * deltaSeconds;

    // 3. Handle looping
    if (rideProgressS >= totalLen) {
      if (isRideLooping) {
        rideProgressS %= totalLen;
        // Reset scoring for the new loop
        playerScore = 0;
        playerHearts = 3; heartsTextElement.textContent = "❤❤❤";
      } else {
        rideProgressS = totalLen;
        isRideActive = false;
        if (successModalElement && successScoreElement) {
          successScoreElement.textContent = String(playerScore);
          successModalElement.style.display = "grid";
        }
      }
    }

    // 4. Convert the new distance `s` back to a curve parameter `t`
    rideProgressT = sToT(rideProgressS);

    // 5. Place the camera at the new `t`
    placeCameraAtPathT(rideProgressT);
    orbitControls.enabled = false;

    // Update cart mesh position and orientation
    // --- START: FIX for sinking cart ---
    // Get position from the correct, elevated sampled points
    const cartIdx = distanceToIndex(rideProgressS);
    const cartPos = sampledPts[cartIdx];
    const cartTangent = (cartIdx < sampledPts.length - 1) ? new THREE.Vector3().subVectors(sampledPts[cartIdx + 1], cartPos) : new THREE.Vector3().subVectors(cartPos, sampledPts[cartIdx - 1]);
    cartTangent.normalize();
    cart.position.copy(cartPos);
    cartBody.setRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, cartTangent));
    // --- END: FIX ---
  } else {
    orbitControls.enabled = true;
    orbitControls.update();
  }

  updateHudAndScoring(needleNormalized, deltaSeconds);

  // Rotate steering wheel based on needle position
  steeringWheelMesh.rotation.z = -needleNormalized * (Math.PI / 2);

  // Update Speedometer
  if (speedoProgress && speedoValue) {
    const maxSpeedKmh = 180; // Define a max speed for the gauge
    const speedKmh = currentSpeedForHud * 3.6;
    speedoValue.textContent = String(Math.floor(speedKmh));

    const progress = Math.min(speedKmh / maxSpeedKmh, 1);
    if (speedoArcLength > 0) {
      speedoProgress.style.strokeDashoffset = String(speedoArcLength * (1.0 - progress));
    }
  }
  webglRenderer.render(scene, rideCamera);
  requestAnimationFrame(renderLoop);
}

// --- App Initialization ---

// All app initialization and the render loop are wrapped in an async function
// to ensure all setup, including async parts, completes before rendering starts.
async function main() {
  // 1. Calculate path geometry first, as many other parts depend on it.
  createAllRoadMaterials();
  updateFadeSettingsVisibility();
  setupSpeedometer();
  // applyTexture(courtTextureUrl); // Load default texture
  setConfigPanelVisible(false);

  gltfLoader.load(
    'src/scene.glb',
    (gltf) => {
      sceneMesh = gltf.scene;
      sceneMesh.position.set(0, 0.01, 0); // tiny lift to avoid z-fighting with ground
      scene.add(sceneMesh);
      dbg("Loaded scene.glb");
    },
    undefined,
    (err) => {
      dbg("Failed to load scene.glb: " + (err as any)?.message);
    }
  );

  const enableGyroButtonMaybe = document.getElementById("enable-gyro") as HTMLButtonElement;

  // Load the initial test path at startup and wait for it to finish
  await loadPathFromJSON('src/test.json');

  dbg(`Loaded segSpeeds in main: ${JSON.stringify(segSpeeds)}`);
  // 2. Set the initial camera position (path load already positioned camera)

  // 3. Asynchronously attempt to enable the gyroscope.
  try {
    const ok = await enableGyroscope();
    if (ok && enableGyroButtonMaybe) {
      enableGyroButtonMaybe.textContent = "Disable Gyro";
    }
  } catch (e) {
    dbg(`Could not enable gyroscope: ${(e as Error).message}`);
  }

  // 4. Now that all setup is complete, start the render loop.
  renderLoop();
}

importJsonInput?.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement)?.files?.[0];
  if (file) {
    stopRide(); // Stop the current ride before loading a new path
    loadPathFromJSON(file);
  }
});

// Start the application
main();
