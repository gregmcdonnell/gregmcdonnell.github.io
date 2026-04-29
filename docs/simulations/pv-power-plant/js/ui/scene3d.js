/**
 * scene3d.js
 * Three.js scene: realistic solar panel with sun direction arrow and hard shadows.
 *
 * Shows a single solar panel mounted on a post, oriented by tilt + azimuth.
 * A directional light represents the sun — position driven by altitude + azimuth.
 * Shadows are enabled with a ground plane receiving them.
 *
 * Exposes:
 *   initScene(canvasId)              — create renderer, scene, camera, panel mesh
 *   updateSunPosition(altDeg, azDeg) — move sun light + arrow
 *   updatePanelOrientation(tiltDeg, azimuthDeg) — rotate panel group
 *   setTimeOfDay(hour, profile)      — interpolate from hourly profile
 *   disposeScene()                   — cleanup
 */

const DEG2RAD = Math.PI / 180;

let renderer, scene, camera, controls, animId;
let panelGroup, moduleGroup, sunLight, sunArrow, sunSphere, groundMesh;
let ambientLight;
let skyMesh;
const interpTargets = {altDeg: 0, azDeg: 0, altDegPrev: 0, azDegPrev: 0, sunPos: new THREE.Vector3(0,1,0), sunPosPrev: new THREE.Vector3(0,1,0)};

/** Initialize the Three.js scene into the given canvas element. */
export function initScene(canvas) {
  const THREE = window.THREE;
  if (!THREE) { console.error("Three.js not loaded"); return; }

  const W = canvas.clientWidth  || canvas.width  || 420;
  const H = canvas.clientHeight || canvas.height || 300;

  // --- Renderer ---
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --- Scene ---
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1628);
  scene.fog = new THREE.FogExp2(0x0a1628, 0.008);

  // --- Camera ---
  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  camera.position.set(6, 6, 8);
  controls.target.set(0, 1.4, 0);
  // controls.autoRotate = true;
  // controls.autoRotateSpeed = 0.5;
  controls.update();

  // --- Ambient light (sky fill) ---
  ambientLight = new THREE.AmbientLight(0x8ab4d4, 0.35);
  scene.add(ambientLight);

  // --- Hemisphere light ---
  const hemi = new THREE.HemisphereLight(0x94c5e8, 0x2a3a20, 0.5);
  scene.add(hemi);

  // --- Sun directional light ---
  sunLight = new THREE.DirectionalLight(0xfff4cc, 2.5);
  sunLight.position.set(5, 8, 5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width  = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far  = 60;
  sunLight.shadow.camera.left  = -10;
  sunLight.shadow.camera.right =  10;
  sunLight.shadow.camera.top   =  10;
  sunLight.shadow.camera.bottom= -10;
  sunLight.shadow.bias = -0.001;
  sunLight.shadow.radius = 2;
  scene.add(sunLight);
  scene.add(sunLight.target); // target stays at origin

  // --- Ground plane ---
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2e1a, metalness: 0, roughness: .9 });
  groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // --- Grid helper (subtle) ---
  const grid = new THREE.GridHelper(20, 20, 0x1e3a1e, 0x1e3a1e);
  grid.material.opacity = 0.4;
  grid.material.transparent = true;
  grid.position.y = 0.005;
  scene.add(grid);

  // --- Build solar panel group ---
  const { panel, base } = buildPanel(THREE);
  panelGroup = panel;
  moduleGroup = new THREE.Group();
  moduleGroup.add(panelGroup);
  moduleGroup.add(base);
  scene.add(moduleGroup);

  // --- Sun representation ---
  const sunGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
  sunSphere = new THREE.Mesh(sunGeo, sunMat);
  sunSphere.frustumCulled = false;
  scene.add(sunSphere);


  // Sun ray arrow
  const arrowDir = new THREE.Vector3(0, -1, 0);
  const arrowOrigin = new THREE.Vector3(0, 0, 0);
  sunArrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, 1.8, 0xffcc00, 0.4, 0.25);
  sunArrow.line.material.linewidth = 2;
  scene.add(sunArrow);

  const quadGeo = new THREE.PlaneGeometry( 1, 1 );
  const quadMat = new THREE.MeshBasicMaterial( { color: 0xffee66, side: THREE.DoubleSide, transparent: true, opacity: 0.5 } );
  const quad = new THREE.Mesh( quadGeo, quadMat );
  quad.rotateX(Math.PI / 2);
  sunArrow.add(quad);

  // --- Compass rose on ground (N/S/E/W markers via tiny boxes) ---
  buildCompass(THREE, scene);

  // --- Start render loop ---
  function render() {
    animId = requestAnimationFrame(render);
    controls.update();
    interpolateTowardsTargets();
    renderer.render(scene, camera);
  }
  render();

  // Handle resize
  const resizeObs = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  });
  resizeObs.observe(canvas);
}

/** Build the solar panel mesh group with frame, cells, and mounting post. */
function buildPanel(THREE) {
  const panelGroup = new THREE.Group();
  const baseGroup = new THREE.Group();

  const aluminumMat = new THREE.MeshStandardMaterial({
    color: 0xf5f6f6, //'#f5f6f6'
    metalness: 0.6,
    roughness: 0.1,
  });

  // Dark blue PV cells with subtle grid lines via a canvas texture
  const cellTex = buildCellTexture();
  const cellMat = new THREE.MeshStandardMaterial({
    map: cellTex,
    color: 0xffffff,
    metalness: 0,
    roughness: 0.1,
  });

  // Panel dimensions (in metres, roughly 2m × 1m module)
  const PW = 1.65, PH = 1.0, PD = 0.04;

  const cellGeo = new THREE.BoxGeometry(PW - 0.02, PH - 0.02, PD + 0.002);
  const cells = new THREE.Mesh(cellGeo, cellMat);
  cells.position.z = 0.001;
  cells.castShadow = false;
  panelGroup.add(cells);

  const frameGeo = new THREE.BoxGeometry(PW + 0.06, PH + 0.06, PD);
  const frame = new THREE.Mesh(frameGeo, aluminumMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  panelGroup.add(frame);

  const backGeo = new THREE.BoxGeometry(PW - 0.02, PH - 0.02, 0.01);
  const back = new THREE.Mesh(backGeo, aluminumMat);
  back.position.z = -PD / 2 - 0.002;
  panelGroup.add(back);

  const postGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.75, 12);
  const post = new THREE.Mesh(postGeo, aluminumMat);
  post.position.set(0, 0.9, 0);
  post.castShadow = true;
  post.receiveShadow = true;
  baseGroup.add(post);

  const flangeGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16);
  const flange = new THREE.Mesh(flangeGeo, aluminumMat);
  flange.position.set(0,  0.03, 0);
  flange.castShadow = true;
  flange.receiveShadow = true;
  baseGroup.add(flange);

  // Position the panel centre above ground
  panelGroup.position.set(0, 1.8, 0);
  // baseGroup.position.set(0, 1.8, 0);

  // Tilt pivot: we rotate around the group's local X axis for tilt,
  // and around world Y axis for azimuth (handled in updatePanelOrientation)
  return { panel: panelGroup, base: baseGroup };
}

/** Generate a canvas texture simulating solar cell grid lines */
function buildCellTexture() {
  const THREE = window.THREE;
  const size  = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  // Background — deep navy blue cell colour
  ctx.fillStyle = "#1a2340";
  ctx.fillRect(0, 0, size, size);

  // Cell grid — 6 columns × 10 rows (typical 60-cell layout)
  const cols = 6, rows = 10;
  const cw = size / cols, ch = size / rows;
  ctx.strokeStyle = "#2a3a55";
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(size, r * ch); ctx.stroke();
  }
  for (let col = 0; col <= cols; col++) {
    ctx.beginPath(); ctx.moveTo(col * cw, 0); ctx.lineTo(col * cw, size); ctx.stroke();
  }

  // Busbars (3 per column)
  ctx.strokeStyle = "#c8d0d8";
  ctx.lineWidth = 1.5;
  for (let col = 0; col < cols; col++) {
    const x0 = col * cw;
    for (let b = 1; b <= 3; b++) {
      const x = x0 + (b / 4) * cw;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
  }

  // Subtle cell sheen
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0,   "rgba(80,120,180,0.10)");
  grad.addColorStop(0.5, "rgba(40, 80,150,0.04)");
  grad.addColorStop(1,   "rgba(20, 40,100,0.10)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const THREE_tex = THREE.CanvasTexture ? new THREE.CanvasTexture(c) : null;
  return THREE_tex;
}

/** Draw N/S/E/W compass markers on the ground */
function buildCompass(THREE, scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  const geo = new THREE.PlaneGeometry(1, 1);
  const textureLoader = new THREE.TextureLoader();
  const dirs = [
    { pos: [0, 0.001, -4.5], label: "N" },
    { pos: [ 4.5, 0.001, 0], label: "E" },
    { pos: [0, 0.001,  4.5], label: "S" },
    { pos: [-4.5, 0.001, 0], label: "W" },
  ];
  
  const halfPI = -Math.PI / 2;
  dirs.forEach(({ pos, label }, i) => {
    const texture = textureLoader.load(`./js/ui/Compass-${label}.png`);
    const marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    marker.setRotationFromEuler(new THREE.Euler(halfPI, 0, i * halfPI));
    marker.position.set(...pos);
    scene.add(marker);
  });

  // Compass lines
  const nsMesh = new THREE.Mesh(geo, mat);
  nsMesh.scale.set(0.05, 8, 1);
  nsMesh.rotateX(-Math.PI / 2);
  nsMesh.position.set(0, 0.005, 0);
  scene.add(nsMesh);
  const ewMesh = new THREE.Mesh(geo, mat);
  ewMesh.scale.set(8, 0.05, 1);
  ewMesh.rotateX(-Math.PI / 2);
  ewMesh.position.set(0, 0.005, 0);
  scene.add(ewMesh);
}

/**
 * Update sun light and sphere position from altitude + azimuth.
 *  altDeg — solar altitude above horizon [degrees]
 *  azDeg  — solar azimuth from north, clockwise [degrees]
 */
function interpolateTowardsTargets() {
  if (!sunLight || !sunSphere) return;
  const THREE = window.THREE;

  const altDeg = THREE.MathUtils.lerp(interpTargets.altDegPrev,interpTargets.altDeg, .1);
  const azDeg = lerpAngleWrapped(interpTargets.azDegPrev,interpTargets.azDeg, .1);
  // const sunPos = interpTargets.sunPos.lerp()
  if (Math.abs(interpTargets.altDeg - altDeg) < 0.05 && Math.abs(interpTargets.azDeg - azDeg) < 0.05) return;
  
  interpTargets.altDegPrev = altDeg;
  interpTargets.azDegPrev = azDeg;

  const alt = altDeg * DEG2RAD;
  const az  = azDeg  * DEG2RAD;
  const lightDist = 8;
  const sunDist = 5;
  
  // sunLight.position.set(sx * lightDist, sy * lightDist, sz * lightDist);
  // sunSphere.position.set(sx * sunDist, sy * sunDist, sz * sunDist);

  const sunPos = slerpVec(interpTargets.sunPosPrev, interpTargets.sunPos, .1);
  interpTargets.sunPosPrev.copy(sunPos);
  sunSphere.position.copy(sunPos).multiplyScalar(sunDist);
  sunLight.position.copy(sunPos).multiplyScalar(lightDist);

  // Arrow points FROM sun sphere TOWARD panel (origin)
  sunArrow.position.copy(sunSphere.position);
  setFromForwardUp(sunArrow,sunPos.clone().negate(), new THREE.Vector3(0,1,0))

  // Sun below horizon → dim light
  const intensity = Math.max(0, sunPos.y);
  // const intensity = Math.max(0, Math.sin(alt));
  sunLight.intensity = intensity * 2.8;
  ambientLight.intensity = 0.15 + intensity * 0.25;

  // Sky background colour shifts with sun height
  const nightCol  = new THREE.Color(0x060c1a);  // '#060c1a'
  const dawnCol   = new THREE.Color(0xffa66e);  // '#ffa66e'
  const dayCol    = new THREE.Color(0x7ca1d8);  // '#7ca1d8'

  // const t = Math.max(0, Math.min(1, (altDeg + 5) / 30));
  // const bgCol = nightCol.clone().lerp(altDeg > 15 ? dayCol : dawnCol, t);
  const t = sunPos.y;
  const bgCol = (t < .2) ? nightCol.clone().lerp(dawnCol, Math.max(t / 0.2,0))
   : dawnCol.clone().lerp(dayCol, Math.min((t - 0.2)/0.5, 1));
  // const bgCol = dawnCol;
  if (scene) { scene.background = bgCol; scene.fog.color= bgCol; }

  // Sun colour shifts: red at dawn/dusk, white at noon
  const sunColorDay  = new THREE.Color(0xfff8e0);
  const sunColorDusk = new THREE.Color(0xff8844);
  const tSun = Math.max(0, Math.min(1, altDeg / 30));
  sunLight.color.copy(sunColorDusk.clone().lerp(sunColorDay, tSun));
  if (sunSphere.material) sunSphere.material.color.copy(sunLight.color);
}

function updateSunPosition(altDeg, azDeg) {
  interpTargets.altDeg = altDeg;
  interpTargets.azDeg = azDeg;
  const alt = altDeg * DEG2RAD;
  const az  = azDeg  * DEG2RAD;
  // ENU → Three.js: x=East, y=Up, z=-North
  const sx =  Math.cos(alt) * Math.sin(az);   // East
  const sy =  Math.sin(alt);                   // U
  const sz = -Math.cos(alt) * Math.cos(az);   // -North (Three.js z points towards viewer)
  interpTargets.sunPos.set(sx, sy, sz);
}

function lerpAngleWrapped(start, target, t) {
  const delta = ((target - start + 540) % 360) - 180;
  const result = start + delta * t;
  return ((result % 360) + 360) % 360;
}


function setFromForwardUp(object, forward, up) {
  const z = forward.clone().normalize();         // forward
  const x = new THREE.Vector3().crossVectors(up, z).normalize(); // right
  const y = new THREE.Vector3().crossVectors(z, x).normalize();  // corrected up

  const m = new THREE.Matrix4();
  m.makeBasis(y, z, x);

  object.quaternion.setFromRotationMatrix(m);
}

function slerpVec(a, b, t) {
  const v0 = a.clone().normalize();
  const v1 = b.clone().normalize();

  let dot = v0.dot(v1);

  // Clamp to avoid NaNs from floating point errors
  dot = Math.min(Math.max(dot, -1), 1);

  const theta = Math.acos(dot) * t;

  // If vectors are very close, fall back to lerp
  if (theta < 1e-5) {
    return v0.lerp(v1, t).normalize();
  }

  const relative = v1.clone()
    .sub(v0.clone().multiplyScalar(dot))
    .normalize();

  return v0.clone()
    .multiplyScalar(Math.cos(theta))
    .add(relative.multiplyScalar(Math.sin(theta)));
}

/**
 * Update panel orientation.
 *  tiltDeg    — tilt from horizontal (0=flat, 90=vertical)
 *  azimuthDeg — compass bearing the panel faces (0=N, 90=E, 180=S, 270=W)
 */
export function updatePanelOrientation(tiltDeg, azimuthDeg) {
  if (!panelGroup) return;

  // Reset rotation
  panelGroup.rotation.set(0, 0, 0);

  // Azimuth: rotate around Y axis (world up). Three.js Y-up.
  // Panel facing south (180°) in compass = facing -Z in Three.js (towards viewer)
  moduleGroup.rotation.set(0, 0, 0);
  moduleGroup.rotation.y = -(azimuthDeg - 180) * DEG2RAD;

  // Tilt: rotate around local X axis (panel's width axis)
  // 0° tilt = panel face pointing straight up (flat)
  // 90° tilt = panel face pointing south (vertical)
  panelGroup.rotation.x = (tiltDeg-90) * DEG2RAD;
}

/**
 * Update the scene for a specific hour, driven by the processed hourly profile.
 *  hour    — 0-23
 *  profile — output of processMonthProfile (array of 24 enriched hourly objects)
 */
export function setTimeOfDay(hour, profile) {
  if (!profile || !profile[hour]) return;
  const h = profile[hour];
  updateSunPosition(h.altDeg, h.azDeg);
}

/** Clean up Three.js resources */
export function disposeScene() {
  if (animId) cancelAnimationFrame(animId);
  if (renderer) renderer.dispose();
  renderer = scene = camera = null;
  panelGroup = sunLight = sunArrow = sunSphere = null;
}
