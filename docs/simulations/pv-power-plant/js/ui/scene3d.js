
import { PLANT } from "../core/plant.js";
// import { ProceduralSkybox } from '/simulations/shared/procedural-skybox.js';
import { ProceduralSkybox } from '../../../shared/procedural-skybox.js';


const DEG2RAD = Math.PI / 180;

// ─── Pure utility functions (no scene state) ────────────────────────────────

function lerpAngleWrapped(start, target, t) {
  const delta = ((target - start + 540) % 360) - 180;
  return (((start + delta * t) % 360) + 360) % 360;
}

function setFromForwardUp(object, forward, up) {
  const THREE = window.THREE;
  const z = forward.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4();
  m.makeBasis(y, z, x);
  object.quaternion.setFromRotationMatrix(m);
}

function slerpVec(a, b, t) {
  const v0 = a.clone().normalize();
  const v1 = b.clone().normalize();
  let dot = Math.min(Math.max(v0.dot(v1), -1), 1);
  const theta = Math.acos(dot) * t;
  if (theta < 1e-5) return v0.lerp(v1, t).normalize();
  const relative = v1.clone().sub(v0.clone().multiplyScalar(dot)).normalize();
  return v0.clone()
    .multiplyScalar(Math.cos(theta))
    .add(relative.multiplyScalar(Math.sin(theta)));
}

function buildCellTexture(repeatX) {
  const THREE = window.THREE;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#1a2340";
  ctx.fillRect(0, 0, size, size);

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

  ctx.strokeStyle = "#c8d0d8";
  ctx.lineWidth = 1.5;
  for (let col = 0; col < cols; col++) {
    const x0 = col * cw;
    for (let b = 1; b <= 3; b++) {
      const x = x0 + (b / 4) * cw;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
    }
  }

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0,   "rgba(80,120,180,0.10)");
  grad.addColorStop(0.5, "rgba(40, 80,150,0.04)");
  grad.addColorStop(1,   "rgba(20, 40,100,0.10)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, 1);
  return tex;
  // return THREE.CanvasTexture ? new THREE.CanvasTexture(c) : null;
}

function buildCompass(THREE, scene) {
  const compassGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  const geo = new THREE.PlaneGeometry(1, 1);
  const textureLoader = new THREE.TextureLoader();
  const dirs = [
    { pos: [0, 0, -4.5], label: "N" },
    { pos: [ 4.5, 0, 0], label: "E" },
    { pos: [0, 0,  4.5], label: "S" },
    { pos: [-4.5, 0, 0], label: "W" },
  ];

  const halfPI = -Math.PI / 2;
  dirs.forEach(({ pos, label }, i) => {
    const texture = textureLoader.load(`./textures/Compass-${label}.png`);
    const marker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
    marker.setRotationFromEuler(new THREE.Euler(halfPI, 0, i * halfPI));
    marker.position.set(...pos);
    compassGroup.add(marker);
  });

  const nsMesh = new THREE.Mesh(geo, mat);
  nsMesh.scale.set(0.05, 8, 1);
  nsMesh.rotateX(-Math.PI / 2);
  compassGroup.add(nsMesh);

  const ewMesh = new THREE.Mesh(geo, mat);
  ewMesh.scale.set(8, 0.05, 1);
  ewMesh.rotateX(-Math.PI / 2);
  compassGroup.add(ewMesh);
  compassGroup.position.set(0, .1, 0);
  scene.add(compassGroup);
}


// ─── Scene3D class ───────────────────────────────────────────────────────────

export class Scene3D {
  #renderer    = null;
  #scene       = null;
  #camera      = null;
  #controls    = null;
  #animId      = null;
  #modulesGroup = null;
  #sunLight    = null;
  #sunArrow    = null;
  /** @type {ProceduralSkybox} */
  #skybox      = null;
  #sunSphere   = null;
  #groundMesh  = null;
  #ambientLight = null;
  #interpTargets = null;
  #modules     = [];

  constructor(canvas) {
    this.#init(canvas);
  }

  // ── Private: setup ──────────────────────────────────────────────────────

  #init(canvas) {
    const THREE = window.THREE;
    if (!THREE) { console.error("Three.js not loaded"); return; }

    this.#interpTargets = {
      altDeg: 0, azDeg: 0,
      altDegPrev: 0, azDegPrev: 0,
      panelOrientation:     new THREE.Vector2(0, 0),
      panelOrientationPrev: new THREE.Vector2(0, 0),
      sunPos:     new THREE.Vector3(0, 1, 0),
      sunPosPrev: new THREE.Vector3(0, 1, 0),
    };

    const W = canvas.clientWidth  || canvas.width  || 420;
    const H = canvas.clientHeight || canvas.height || 300;

    // Renderer
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setSize(W, H, false);
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.1;
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(0x0a1628);
    this.#scene.fog = new THREE.FogExp2(0x0a1628, 0.008);

    // Camera + controls
    this.#camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
    this.#controls = new THREE.OrbitControls(this.#camera, this.#renderer.domElement);
    this.#camera.position.set(16, 16, 18);
    this.#controls.target.set(0, 1.4, 0);
    this.#controls.update();

    // Lights
    this.#ambientLight = new THREE.AmbientLight(0x8ab4d4, 0.35);
    this.#scene.add(this.#ambientLight);
    this.#scene.add(new THREE.HemisphereLight(0x94c5e8, 0x2a3a20, 0.5));

    this.#sunLight = new THREE.DirectionalLight(0xfff4cc, 2.5);
    this.#sunLight.position.set(5, 8, 5);
    this.#sunLight.castShadow = true;
    this.#sunLight.shadow.mapSize.width  = 2048;
    this.#sunLight.shadow.mapSize.height = 2048;
    this.#sunLight.shadow.camera.near   = 0.5;
    this.#sunLight.shadow.camera.far    = 60;
    this.#sunLight.shadow.camera.left   = -10;
    this.#sunLight.shadow.camera.right  =  10;
    this.#sunLight.shadow.camera.top    =  10;
    this.#sunLight.shadow.camera.bottom = -10;
    this.#sunLight.shadow.bias   = -0.001;
    this.#sunLight.shadow.radius = 2;
    this.#scene.add(this.#sunLight);
    this.#scene.add(this.#sunLight.target);

    // Procedural Skybox
    this.#skybox = new ProceduralSkybox(THREE);
    this.#skybox.addToScene(this.#scene, this.#camera, this.#sunLight);
    this.#skybox.updateSkyboxTexture(this.#renderer);

    // Ground + grid
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a2e1a, metalness: 0, roughness: 0.9 });
    this.#groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.#groundMesh.rotation.x = -Math.PI / 2;
    this.#groundMesh.receiveShadow = true;
    this.#scene.add(this.#groundMesh);

    const grid = new THREE.GridHelper(20, 20, 0x1e3a1e, 0x1e3a1e);
    grid.material.opacity = 0.4;
    grid.material.transparent = true;
    grid.position.y = 0.05;
    this.#scene.add(grid);

    // Solar panel modules
    this.#modulesGroup = new THREE.Group();
    const module = this.#buildPanel(THREE, 14, 0);
    const panel = module.panel;
    panel.rotation.x = (0 - 90) * DEG2RAD;
    const moduleGroup = new THREE.Group();
    moduleGroup.add(panel);
    for (let i = 0; i < 5; i++) {
      const b = module.base.clone();
      b.position.x = (i - (5 - 1) / 2) * 14/5;
      moduleGroup.add(b);
    }
    this.#modulesGroup.add(moduleGroup);
    this.#modules.push(moduleGroup);

    const spacing = PLANT.rowSpacing;
    for (let i = 0; i < 2; i++) {
      for (const j of [-1, 1]) {
        const moduleClone = moduleGroup.clone();
        moduleClone.position.set(0, 0, spacing * (i + 1) * j);
        this.#modulesGroup.add(moduleClone);
        this.#modules.push(moduleClone);
      }
    }

    this.#scene.add(this.#modulesGroup);

    // Sun sphere
    const sunGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
    this.#sunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.#sunSphere.frustumCulled = false;
    this.#scene.add(this.#sunSphere);

    // Sun arrow
    this.#sunArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), 1.8, 0xffcc00, 0.4, 0.25
    );
    this.#sunArrow.line.material.linewidth = 2;
    this.#scene.add(this.#sunArrow);

    const quadGeo = new THREE.PlaneGeometry(1, 1);
    const quadMat = new THREE.MeshBasicMaterial({ color: 0xffee66, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const quad = new THREE.Mesh(quadGeo, quadMat);
    quad.rotateX(Math.PI / 2);
    this.#sunArrow.add(quad);

    buildCompass(THREE, this.#scene);

    // Render loop
    const render = () => {
      this.#animId = requestAnimationFrame(render);
      this.#controls.update();
      this.#interpolateTowardsTargets();
      this.#renderer.render(this.#scene, this.#camera);
    };
    render();

    // Resize handler
    const resizeObs = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w && h) {
        this.#renderer.setSize(w, h, false);
        this.#camera.aspect = w / h;
        this.#camera.updateProjectionMatrix();
      }
    });
    resizeObs.observe(canvas);
  }

  #buildPanel(THREE, panelWidth, offset) {
    const panelGroup = new THREE.Group();
    const baseGroup  = new THREE.Group();

    const aluminumMat = new THREE.MeshStandardMaterial({ color: 0xf5f6f6, metalness: 0.6, roughness: 0.1 });
    const cellMat = new THREE.MeshStandardMaterial({ map: buildCellTexture(panelWidth/2), color: 0xffffff, metalness: 0, roughness: 0.1 });

    const PW = panelWidth, PH = PLANT.panelHeight, PD = 0.04;

    const cells = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.02, PH - 0.02, PD), cellMat);
    cells.position.z = 0.002;
    cells.castShadow = false;
    cells.receiveShadow = true;
    panelGroup.add(cells);

    const frame = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.06, PH + 0.06, PD), aluminumMat);
    frame.position.z = -0.01;
    frame.castShadow = true;
    frame.receiveShadow = true;
    panelGroup.add(frame);

    // const back = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.02, PH - 0.02, 0.01), aluminumMat);
    // back.position.z = -PD / 2 - 0.002;
    // panelGroup.add(back);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.75, 12), aluminumMat);
    post.position.set(0, 0.9, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    baseGroup.add(post);

    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16), aluminumMat);
    flange.position.set(0, 0.03, 0);
    flange.castShadow = true;
    flange.receiveShadow = true;
    baseGroup.add(flange);

    panelGroup.position.set(0, 1.8, offset);
    baseGroup.position.set(0, 0, offset);

    return { panel: panelGroup, base: baseGroup };
  }


  #interpolateTowardsTargets() {
    if (!this.#sunLight || !this.#sunSphere) return;
    const THREE = window.THREE;
    const t = this.#interpTargets;

    const altDeg = THREE.MathUtils.lerp(t.altDegPrev, t.altDeg, 0.1);
    const azDeg  = lerpAngleWrapped(t.azDegPrev, t.azDeg, 0.1);

    if (Math.abs(t.altDeg - altDeg) < 0.05 && Math.abs(t.azDeg - azDeg) < 0.05) {
      this.#skybox.updateSkyboxTexture(this.#renderer);
      return;
    }

    t.altDegPrev = altDeg;
    t.azDegPrev  = azDeg;

    t.panelOrientationPrev.lerp(t.panelOrientation, 0.1);
    const panelTilt = t.panelOrientationPrev.x;
    const panelAz   = t.panelOrientationPrev.y;

    this.#modules.forEach(m => {
      m.children[0].rotation.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      // m.rotation.y = -(panelAz - 180) * DEG2RAD;
      m.children[0].rotation.x = (panelTilt - 90) * DEG2RAD;
    });

    const sunPos = slerpVec(t.sunPosPrev, t.sunPos, 0.1);
    t.sunPosPrev.copy(sunPos);
    this.#sunSphere.position.copy(sunPos).multiplyScalar(5);
    this.#sunLight.position.copy(sunPos).multiplyScalar(8);

    this.#sunArrow.position.copy(this.#sunSphere.position);
    setFromForwardUp(this.#sunArrow, sunPos.clone().negate(), new THREE.Vector3(0, 1, 0));

    const intensity = Math.max(0, sunPos.y);
    this.#sunLight.intensity  = intensity * 2.8;
    this.#ambientLight.intensity = 0.15 + intensity * 0.25;

    // const nightCol = new THREE.Color(0x060c1a);
    // const dawnCol  = new THREE.Color(0xffa66e);
    // const dayCol   = new THREE.Color(0x7ca1d8);
    // const tSky = sunPos.y;
    // const bgCol = tSky < 0.2
    //   ? nightCol.clone().lerp(dawnCol, Math.max(tSky / 0.2, 0))
    //   : dawnCol.clone().lerp(dayCol, Math.min((tSky - 0.2) / 0.5, 1));
    // if (this.#scene) { this.#scene.background = bgCol; this.#scene.fog.color = bgCol; }
    this.#scene.fog.color = new THREE.Color(0x555555);
    this.#skybox.update(this.#sunLight);
    
    // const tSun = Math.max(0, Math.min(1, altDeg / 30));
    // this.#sunLight.color.copy(new THREE.Color(0xff8844).lerp(new THREE.Color(0xfff8e0), tSun));
    if (this.#sunSphere.material) this.#sunSphere.material.color.copy(this.#sunLight.color);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Rotate all panel modules to the given tilt + azimuth.
   *  tiltDeg    — tilt from horizontal (0=flat, 90=vertical)
   *  azimuthDeg — compass bearing the panel faces (0=N, 90=E, 180=S, 270=W)
   *  setPrev    — if true, snap interp to target immediately (no animation)
   */
  updatePanelOrientation(tiltDeg, azimuthDeg, setPrev = false) {
    this.#interpTargets.panelOrientation.set(tiltDeg, azimuthDeg);
    if (setPrev) this.#interpTargets.panelOrientationPrev.set(tiltDeg, azimuthDeg);
    this.#modules.forEach(m => {
      m.children[0].rotation.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.children[0].rotation.x = (tiltDeg - 90) * DEG2RAD;
    });
    this.#modulesGroup.rotation.y = -(azimuthDeg - 180) * DEG2RAD;
  }

  updateSunPosition(altDeg, azDeg) {
    this.#interpTargets.altDeg = altDeg;
    this.#interpTargets.azDeg  = azDeg;
    const alt = altDeg * DEG2RAD;
    const az  = azDeg  * DEG2RAD;
    this.#interpTargets.sunPos.set(
       Math.cos(alt) * Math.sin(az),   // East  → Three.js x
       Math.sin(alt),                   // Up    → Three.js y
      -Math.cos(alt) * Math.cos(az)    // -North → Three.js z
    );
  }

  dispose() {
    if (this.#animId) cancelAnimationFrame(this.#animId);
    if (this.#renderer) this.#renderer.dispose();
    this.#renderer = this.#scene = this.#camera = null;
  }

  static init(selector = "#canvas-3d") {
    const canvas = document.querySelector(selector);
    if (!canvas || !window.THREE) return null;

    return new Scene3D(canvas);
  }
}
