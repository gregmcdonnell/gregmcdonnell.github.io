import * as THREE from 'three';

export class ProceduralSkybox {
  constructor() {

    this.skyboxMaterial = new THREE.ShaderMaterial({
        side: THREE.BackSide, // <--- Invert the cube
        depthWrite: false,    // <--- Do not affect depth buffer
        depthTest: false,     // <--- Always render behind everything
        uniforms: {
          uTime: { value: 0 },
          uSunDirection: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
          skyRotationMatrix: {value: new THREE.Matrix3() },
          horizonFade: { value: 100 },
          sunColor: { value: [1.0, 0.9, 0.6] },
          sunsetColor: { value: [0.3, 0.3, 0.0] },
          sunPower: { value: 100.0 },
          sunsetPower: { value: 2.0 },
          starDensity: { value: 170.0 },
          starBrightness: { value: 0.644 },
          starThreshold: { value: 0.987 },
          starFalloffStart: { value: 0.6 },
          starFalloffEnd: { value: 0.0 }
        },
        vertexShader: vertex,
        fragmentShader: fragment
    });

    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(0.1, 1000, this.cubeRenderTarget);
    this.skyScene = new THREE.Scene();
    this.skyScene.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), this.skyboxMaterial));
    this.timeSinceLastTextureUpdate = 0;
  }

  update(renderer, dt, time, uSunDirection, polar, azimuthal) {
    this.skyboxMaterial.uniforms.uTime.value = time;
    this.skyboxMaterial.uniforms.uSunDirection.value = uSunDirection;
    this.setRotationMatrix(polar, azimuthal);

    if (this.timeSinceLastTextureUpdate > 2) {
      this.updateSkyboxTexture(renderer);
      this.timeSinceLastTextureUpdate = 0;
    }
    this.timeSinceLastTextureUpdate += dt;
  }

  addToScene(scene, camera) {
    const skyboxMesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), this.skyboxMaterial);
    camera.add(skyboxMesh);
    scene.add(camera);
    scene.environment = this.cubeRenderTarget.texture;
  }

  updateSkyboxTexture(renderer) {
    this.cubeCamera.update(renderer, this.skyScene);
  }

  addControlsToGUI(gui) {
    const uniforms = this.skyboxMaterial.uniforms;
    const folder = gui.addFolder('Skybox');
    folder.add(uniforms.horizonFade, 'value', 0, 1000).name('Horizon Fade');
    folder.addColor(uniforms.sunColor, 'value').name('Sun Color');
    folder.add(uniforms.sunPower, 'value', 0, 100).name('Sun Power');
    folder.addColor(uniforms.sunsetColor, 'value').name('Sunset Color');
    folder.add(uniforms.sunsetPower, 'value', 0, 10).name('Sunset Power');
    folder.add(uniforms.starDensity, 'value', 0, 1000).name('Star Density');
    folder.add(uniforms.starBrightness, 'value', 0, 10).name('Star Brightness');
    folder.add(uniforms.starThreshold, 'value', 0, 1).name('Star Threshold');
    folder.add(uniforms.starFalloffStart, 'value', 0, 1).name('Star Falloff Start');
    folder.add(uniforms.starFalloffEnd, 'value', 0, 1).name('Star Falloff End');
  }

  setRotationMatrix(polar, azimuthal) {
    const c1 = Math.cos(azimuthal);
    const s1 = Math.sin(azimuthal);
    const c2 = Math.cos(polar);
    const s2 = Math.sin(polar);
    this.skyboxMaterial.uniforms.skyRotationMatrix.value.set(
      c1,       0,     -s1,
      s2*s1,   c2,   s2*c1,
      c2*s1,  -s2,   c2*c1
    );
  }
}

const vertex = `
    varying vec3 vWorldViewDirection;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldViewDirection = worldPosition.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`

const fragment = `
    varying vec3 vWorldViewDirection;
    uniform vec3 uSunDirection;
    uniform mat3 skyRotationMatrix;
    uniform float uTime;
    uniform float horizonFade;
    uniform vec3 sunColor;
    uniform vec3 sunsetColor;
    uniform float sunPower;
    uniform float sunsetPower;
    uniform float starDensity;
    uniform float starBrightness;
    uniform float starThreshold;
    uniform float starFalloffStart;
    uniform float starFalloffEnd;

    float clamp01(float x) {
        return clamp(x, 0.0, 1.0);
    }
    float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }

    float starField(vec3 dir) {
        vec3 rotatedDir = skyRotationMatrix * dir;
        vec3 grid = rotatedDir * starDensity;
        vec3 cell = floor(grid);
        vec3 local = fract(grid);

        float h = hash(cell);
        float dist = length(local - 0.5); // distance to center of star in cell
        float star = smoothstep(starFalloffStart, starFalloffEnd, dist); // soft falloff
        float brightness = step(starThreshold, h) * star;
        return brightness;
    }
    
    void main() {
        vec3 direction = normalize(vWorldViewDirection);
        float t = direction.y;
        float night = clamp01((uSunDirection.y) * -2.0);
        // float dayNight = max(min(uSunDirection.y * 4.0, 1.0), -1.0);
        vec3 groundColor = vec3(0.25, 0.25, 0.25);
        vec3 horizonColor = vec3(0.5, 0.7, 0.9);
        vec3 skyColor = vec3(0.65, 0.85, 1.0);
        vec3 mixedColor = mix(horizonColor, groundColor, clamp01(-t * 8.0));
        mixedColor = mix(mixedColor, skyColor, clamp01(t));
        mixedColor *= clamp01(uSunDirection.y * 3.0) + 0.0;
        float horizonLimit = clamp01(t * horizonFade);
        float sunAmount = max(dot(direction, uSunDirection), 0.0);
        vec3 sunAndStars = (sunColor * pow(sunAmount, sunPower)
          + starField(direction) * starBrightness * night);
          // + sunsetColor * pow(dot(direction, direction + uSunDirection) * 0.5, sunsetPower);
        mixedColor += sunAndStars * horizonLimit;
        gl_FragColor = vec4(mixedColor, 1.0);
    }
`

const testFragment = `
    varying vec3 vWorldViewDirection;
    void main() {
        vec3 direction = normalize(vWorldViewDirection);
        vec3 skyColor = vec3(0.0, 0.0, 0.0);
        vec3 absDir = abs(direction);

        if (absDir.x >= absDir.y && absDir.x >= absDir.z) {
            skyColor = (sign(direction.x) > 0.0) ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 1.0);
        } else if (absDir.y >= absDir.z) {
            skyColor = (sign(direction.y) > 0.0) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 1.0);
        } else {
            skyColor = (sign(direction.z) > 0.0) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 1.0, 0.0);
        }
        gl_FragColor = vec4(skyColor, 1.0);
    }
`