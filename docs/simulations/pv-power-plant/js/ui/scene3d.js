
import { PLANT } from "../core/plant.js";
// import { ProceduralSkybox } from '/simulations/shared/procedural-skybox.js';
import { ProceduralSkybox } from '../../../shared/procedural-skybox.js';


const DEG2RAD = Math.PI / 180;

const PANELROWS = 30;
const PANELCOLS = 10;


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

function buildCellTexture(repeatX, repeatY) {
  const THREE = window.THREE;
  const width = 256;
  const height = 512;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#12172b";
  ctx.fillRect(0, 0, width, height);

  const cols = 6, rows = 12;
  const cw = width / cols, ch = height / rows;
  ctx.strokeStyle = "#bcbfc548";
  ctx.lineWidth = 2;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(width, r * ch); ctx.stroke();
  }
  for (let col = 0; col <= cols; col++) {
    ctx.beginPath(); ctx.moveTo(col * cw, 0); ctx.lineTo(col * cw, height); ctx.stroke();
  }

  // ctx.strokeStyle = "#c8d0d8";
  // ctx.lineWidth = 1.5;
  // for (let col = 0; col < cols; col++) {
  //   const x0 = col * cw;
  //   for (let b = 1; b <= 3; b++) {
  //     const x = x0 + (b / 4) * cw;
  //     ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  //   }
  // }

  // glass layer
  ctx.fillStyle = "rgba(75, 111, 164, 0.05)";
  ctx.fillRect(0, 0, width, height);


  ctx.strokeStyle = "#bfc1c3";
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(width, 0); ctx.lineTo(width, height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(width, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width, height); ctx.stroke();



  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
  // return THREE.CanvasTexture ? new THREE.CanvasTexture(c) : null;
}

function buildCompass(scene, scale) {
  const compassGroup = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const geo = new THREE.PlaneGeometry(1, 1);
  const textureLoader = new THREE.TextureLoader();
  const dirs = [
    { pos: [0, 0, -3.5], label: "N" },
    { pos: [ 3.5, 0, 0], label: "E" },
    { pos: [0, 0,  3.5], label: "S" },
    { pos: [-3.5, 0, 0], label: "W" },
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
  nsMesh.scale.set(0.2, 6, 1);
  nsMesh.rotateX(-Math.PI / 2);
  compassGroup.add(nsMesh);

  const ewMesh = new THREE.Mesh(geo, mat);
  ewMesh.scale.set(6, 0.2, 1);
  ewMesh.rotateX(-Math.PI / 2);
  compassGroup.add(ewMesh);
  compassGroup.position.set(0, .1, 0);
  compassGroup.scale.set(scale, scale, scale);
  scene.add(compassGroup);
  return compassGroup;
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
  #csm = null;
  #modules     = [];
  #instancedPanel = null;
  #instancedPost = null;
  rotationAxis = null;

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
      timeOfDay: 0, timeOfDayPrev: 0,
    };

    const W = canvas.clientWidth  || canvas.width  || 420;
    const H = canvas.clientHeight || canvas.height || 300;

    // Renderer
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.setSize(W, H, false);
    this.#renderer.shadowMap.enabled = true;
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // this.#renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // this.#renderer.toneMappingExposure = 1.1;
    // this.#renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.#scene = new THREE.Scene();
    this.#scene.background = new THREE.Color(0x0a1628);
    this.#scene.fog = new THREE.FogExp2(0x505050, 0.008);
    // this.#scene.fog.color = new THREE.Color(0x505050);

    // Camera + controls
    this.#camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 300);
    this.#controls = new THREE.OrbitControls(this.#camera, this.#renderer.domElement);
    this.#camera.position.set(12, 7, 12);
    this.#controls.target.set(0, 1.4, 0);
    this.#controls.update();

    // Lights
    this.#ambientLight = new THREE.AmbientLight(0x8ab4d4, 0.35);
    this.#scene.add(this.#ambientLight);
    this.#scene.add(new THREE.HemisphereLight(0x94c5e8, 0x2a3a20, 0.5));

    this.#sunLight = new THREE.DirectionalLight(0xfff4cc, 2.5);
    // this.#sunLight.position.set(50, 80, 50);
    this.#sunLight.castShadow = true;
    this.#sunLight.shadow.mapSize.width  = 2048;
    this.#sunLight.shadow.mapSize.height = 2048;
    this.#sunLight.shadow.camera.near   = 0.5;
    this.#sunLight.shadow.camera.far    = 200;
    const shadowCameraSize = 20;
    this.#setShadowCameraSize(shadowCameraSize);
    // this.#sunLight.shadow.bias   = -0.001;
    // this.#sunLight.shadow.radius = 2;
    this.#scene.add(this.#sunLight);
    // this.#scene.add(this.#sunLight.target);

    // Procedural Skybox
    this.#skybox = new ProceduralSkybox(THREE);
    this.#skybox.addToScene(this.#scene, this.#camera, this.#sunLight);
    this.#skybox.updateSkyboxTexture(this.#renderer);

    // Ground + grid
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x0f270f, metalness: 0, roughness: 0.9 }); // #0f270f
    this.#groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.#groundMesh.rotation.x = -Math.PI / 2;
    this.#groundMesh.receiveShadow = true;
    this.#scene.add(this.#groundMesh);

    // const grid = new THREE.GridHelper(20, 20, 0x1e3a1e, 0x1e3a1e);
    // grid.material.opacity = 0.4;
    // grid.material.transparent = true;
    // grid.position.y = 0.05;
    // this.#scene.add(grid);

    // Solar panel modules
    this.#modulesGroup = new THREE.Group();
    const {panel, base, mergedGeo, axisGeo, postGeo, aluminumMat, cellMat} = this.#buildPanel(THREE, 14);
    this.#initInstancedMeshes(mergedGeo, axisGeo, postGeo, aluminumMat, cellMat);

    panel.rotation.x = (0 - 90) * DEG2RAD;
    const moduleGroup = new THREE.Group();
    moduleGroup.add(panel);
    for (let i = 0; i < 5; i++) {
      const b = base.clone();
      b.position.x = (i - (5 - 1) / 2) * 14/5;
      moduleGroup.add(b);
    }

    const spacing = PLANT.rowSpacing;
    for (let i = 0; i < 6; i++) {
      const moduleClone = moduleGroup.clone();
      moduleClone.position.set(0, 0, spacing * (i - 5 / 2));
      this.#modulesGroup.add(moduleClone);
      this.#modules.push(moduleClone);
    }

    // this.#scene.add(this.#modulesGroup);


    // Sun arrow
    this.#sunArrow = new THREE.Group();
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), 1, 0xffcc00, 0.25, 0.15
    );
    arrow.line.material.linewidth = 2;
    this.#sunArrow.add(arrow);


    // Sun sphere
    const sunGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee66 });
    this.#sunSphere = new THREE.Mesh(sunGeo, sunMat);
    this.#sunSphere.position.y = -1;
    this.#sunArrow.add(this.#sunSphere);

    const quadGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const quadMat = new THREE.MeshBasicMaterial({ color: 0xffee66, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const quad = new THREE.Mesh(quadGeo, quadMat);
    quad.position.y = -1;
    quad.rotateX(Math.PI / 2);
    this.#sunArrow.add(quad);
    this.#sunArrow.scale.set(0.03, 0.03, 0.03);
    this.#scene.add(this.#sunArrow);


    const compass = buildCompass(this.#scene, 0.01);


    const anchorNDC = new THREE.Vector3(-0.7, -0.75, 0.5);
    const temp = new THREE.Vector3();

    // Render loop
    const render = () => {
      this.#animId = requestAnimationFrame(render);
      this.#controls.update();
      this.#interpolateTowardsTargets();
      this.#updateNDCObject(anchorNDC, compass);
      this.#updateNDCObject(anchorNDC, this.#sunArrow);
      this.#renderer.render(this.#scene, this.#camera);
      // console.log(this.#camera.position);
    };
    render();

    this.#controls.addEventListener('change', () => {
      const dist = this.#camera.position.length();
      this.#setShadowCameraSize(Math.max(25, dist * 2));
      // compass.position = this.#camera.position + 

    });

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


  #buildPanel(THREE, panelWidth) {
    const panelGroup = new THREE.Group();
    const baseGroup  = new THREE.Group();

    const aluminumMat = new THREE.MeshStandardMaterial({ color: 0xf5f6f6, metalness: 0.6, roughness: 0.1 });
    const cellMat = new THREE.MeshStandardMaterial({ map: buildCellTexture(panelWidth * 2, 2), color: 0xffffff, metalness: 0, roughness: 0.05 });

    const PW = panelWidth, PH = PLANT.panelHeight, PD = 0.04;

    const cellGeo = new THREE.BoxGeometry(PW - 0.02, PH - 0.02, PD);
    cellGeo.translate(0, 0, 0.1);
    this.#setFaceUVs(cellGeo);
    const cells = new THREE.Mesh(cellGeo, cellMat);
    // cells.position.z = 0.1;
    cells.castShadow = true;
    cells.receiveShadow = true;
    panelGroup.add(cells);

    const axisGeo = new THREE.BoxGeometry(panelWidth - 0.2, .16, .16);
    axisGeo.attributes.uv.array.fill(0);
    axisGeo.attributes.uv.needsUpdate = true;
    const panelAxis = new THREE.Mesh(axisGeo, aluminumMat);
    panelAxis.receiveShadow = true;
    panelAxis.castShadow = true;
    panelGroup.add(panelAxis);

    const mergedGeo = THREE.BufferGeometryUtils.mergeBufferGeometries([cellGeo, axisGeo]);

    const postGeo = new THREE.BoxGeometry(0.08, 1.9, 0.16);
    const post = new THREE.Mesh(postGeo, aluminumMat);
    post.position.set(0, 0.85, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    baseGroup.add(post);

    panelGroup.position.set(0, 1.8, 0);
    baseGroup.position.set(0, 0, 0);

    return { panel: panelGroup, base: baseGroup, mergedGeo, axisGeo, postGeo, aluminumMat, cellMat};
  }


  #initInstancedMeshes(cellGeo, axisGeo, postGeo, aluminumMat, cellMat) {
    const spacingX = 16;
    const spacingZ = PLANT.rowSpacing;
    const count = PANELROWS * PANELCOLS;

    this.#instancedPanel = new THREE.InstancedMesh(cellGeo, cellMat, count);
    this.#instancedPost = new THREE.InstancedMesh(postGeo, aluminumMat, count * 5);
    this.#scene.add(this.#instancedPanel);
    this.#scene.add(this.#instancedPost);
    this.#instancedPanel.castShadow = true;
    this.#instancedPanel.receiveShadow = true;
    this.#instancedPost.castShadow = true;
    this.#instancedPost.receiveShadow = true;
    // instancedPanel.rotateY(Math.PI / 2)

    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let y = 0; y < PANELROWS; y++) {
        for (let x = 0; x < PANELCOLS; x++) {

            const px = (x - PANELCOLS / 2) * spacingX;
            const py = 1.8;
            const pz = (y - PANELROWS / 2) * spacingZ;

            matrix.setPosition(px, py, pz);

            this.#instancedPanel.setMatrixAt(index, matrix);

            for (let i = 0; i < 5; i++) {
              const xOffset = (i - (5 - 1) / 2) * 14/5;
              matrix.setPosition(px + xOffset, 0.85, pz);
              this.#instancedPost.setMatrixAt(index * 5 + i, matrix);
            }

            index++;
        }
    }

    this.#rotateInstancedPanel(this.#instancedPanel, 40);
    this.#instancedPost.instanceMatrix.needsUpdate = true;
  }


  #rotateInstancedPanel(instancedMesh, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const matrixArray = instancedMesh.instanceMatrix.array;

    for (let i = 0; i < instancedMesh.count; i++) {

      const offset = i * 16;

      // X rotation components
      matrixArray[offset + 5]  = c;
      matrixArray[offset + 6]  = s;
      matrixArray[offset + 9]  = -s;
      matrixArray[offset + 10] = c;
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
  }


  #setFaceUVs(geometry, bifacial = false) {
    const uv = geometry.attributes.uv;
    const index = geometry.index;
    geometry.groups.forEach((group, groupIndex) => {
      // skip front(4) / back(5)
      if (groupIndex === 4 || (bifacial && groupIndex === 5)) return;
      for (let i = group.start; i < group.start + group.count; i++) {
        uv.setXY(index.getX(i), 0, 0);
      }
    });
    uv.needsUpdate = true;
  }


  #interpolateTowardsTargets() {
    if (!this.#sunLight) return;
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

    t.timeOfDayPrev = THREE.MathUtils.lerp(t.timeOfDayPrev, t.timeOfDay, 0.1);

    this.#modules.forEach(m => {
      m.children[0].rotation.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      // m.rotation.y = -(panelAz - 180) * DEG2RAD;
      m.children[0].rotation.x = (panelTilt - 90) * DEG2RAD;
    });
    this.#rotateInstancedPanel(this.#instancedPanel, (panelTilt - 90) * DEG2RAD);


    const sunPos = slerpVec(t.sunPosPrev, t.sunPos, 0.1);
    t.sunPosPrev.copy(sunPos);
    // this.#sunSphere.position.copy(sunPos).multiplyScalar(5);
    this.#sunLight.position.copy(sunPos).multiplyScalar(80);

    // this.#sunArrow.position.copy(this.#sunSphere.position);
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
    // this.#scene.fog.color = new THREE.Color(0x555555);
    this.#skybox.update(this.#sunLight);
    this.#skybox.setRotationFromAxis(this.rotationAxis, t.timeOfDayPrev * Math.PI * 2);
    
    // const tSun = Math.max(0, Math.min(1, altDeg / 30));
    // this.#sunLight.color.copy(new THREE.Color(0xff8844).lerp(new THREE.Color(0xfff8e0), tSun));
    if (this.#sunSphere.material) this.#sunSphere.material.color.copy(this.#sunLight.color);
  }

  #setShadowCameraSize(shadowCameraSize) {
    this.#sunLight.shadow.camera.left   = -shadowCameraSize;
    this.#sunLight.shadow.camera.right  =  shadowCameraSize;
    this.#sunLight.shadow.camera.top    =  shadowCameraSize;
    this.#sunLight.shadow.camera.bottom = -shadowCameraSize;
    this.#sunLight.shadow.camera.updateProjectionMatrix();
  }

  #updateNDCObject(anchorNDC, obj) {
    const pos = obj.position;
    pos.copy(anchorNDC);
    // Convert NDC -> world
    pos.unproject(this.#camera);
    // compass.position.copy(temp);

  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Rotate all panel modules to the given tilt + azimuth.
   *  tiltDeg    — tilt from horizontal (0=flat, 90=vertical)
   *  azimuthDeg — compass bearing the panel faces (0=N, 90=E, 180=S, 270=W)
   *  setPrev    — if true, snap interp to target immediately (no animation)
   */
  updatePanelOrientation(tiltDeg, azimuthDeg, setPrev = false) {
    // const GCR = 1 / 1.5;
    // const tilt = tiltDeg * DEG2RAD

    // tiltDeg = (90 - tiltDeg) * DEG2RAD;
    // tiltDeg = Math.atan2(Math.sin(tiltDeg), Math.cos(tiltDeg) - 1/1.5) / DEG2RAD;
    // tiltDeg = -Math.atan((Math.cos(tiltDeg) * GCR - Math.cos(tiltDeg)) / Math.sin(tiltDeg)) / DEG2RAD;
    this.#interpTargets.panelOrientation.set(tiltDeg, azimuthDeg);
    if (setPrev) this.#interpTargets.panelOrientationPrev.set(tiltDeg, azimuthDeg);
    this.#modules.forEach(m => {
      m.children[0].rotation.set(0, 0, 0);
      m.rotation.set(0, 0, 0);
      m.children[0].rotation.x = (tiltDeg - 90) * DEG2RAD;
    });
    this.#modulesGroup.rotation.y = -(azimuthDeg - 180) * DEG2RAD;
    
    this.#rotateInstancedPanel(this.#instancedPanel, (tiltDeg - 90) * DEG2RAD);

    const az = -(azimuthDeg - 180) * DEG2RAD;
    this.#instancedPanel.rotation.y = az;
    this.#instancedPost.rotation.y = az;

  }


  updatePanelSpacing(spacing) {
    this.#modules.forEach((m, i) => {
      m.position.set(0, 0, spacing * (i - 5 / 2));
    });

    const matrixArray = this.#instancedPanel.instanceMatrix.array;
    const postMatrixArray = this.#instancedPost.instanceMatrix.array;
    let panelMatrixOffset = 14;
    let postMatrixOffset = 14;

    for (let y = 0; y < PANELROWS; y++) {
      const pz = (y - PANELROWS / 2) * PLANT.rowSpacing;

      for (let x = 0; x < PANELCOLS; x++) {
        // Z position component
        matrixArray[panelMatrixOffset] = pz;
        panelMatrixOffset += 16;

        for (let i = 0; i < 5; i++) {
          // postMatrixArray[(index * 5 + i) * 16 + 14] = pz;
          postMatrixArray[postMatrixOffset] = pz;
          postMatrixOffset += 16;
        }
        
      }
    }
    this.#instancedPanel.instanceMatrix.needsUpdate = true;
    this.#instancedPost.instanceMatrix.needsUpdate = true;
  }


  updateSunPosition(altDeg, azDeg, tod) {
    this.#interpTargets.altDeg = altDeg;
    this.#interpTargets.azDeg  = azDeg;
    const alt = altDeg * DEG2RAD;
    const az  = azDeg  * DEG2RAD;
    this.#interpTargets.sunPos.set(
       Math.cos(alt) * Math.sin(az),   // East  → Three.js x
       Math.sin(alt),                   // Up    → Three.js y
      -Math.cos(alt) * Math.cos(az)    // -North → Three.js z
    );
    this.#interpTargets.timeOfDay = tod;
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
