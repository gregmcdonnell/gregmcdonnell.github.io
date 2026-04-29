
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.20/+esm';
import { Terrain } from './terrain.js';
import { ProceduralSkybox } from './procedural-skybox.js';
import Stats from 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js';

const infoDiv = document.getElementById('info');

async function loadShader(url) {
    const res = await fetch(url);
    return await res.text();
}
  
(async function init() {
    
    const keysPressed = new Set();

    window.addEventListener('keydown', (event) => {
      keysPressed.add(event.key.toLowerCase()); // or event.code for consistency
    });

    window.addEventListener('keyup', (event) => {
      keysPressed.delete(event.key.toLowerCase());
    });
    const stats = new Stats();
    stats.showPanel(0); // 0 = fps
    // stats.dom.className = 'info'; // optional, for CSS
    document.body.appendChild(stats.dom);

    const vertexShader = await loadShader('./shaders/vertex.glsl');
    const fragmentShader = await loadShader('./shaders/fragment.glsl');

    const clock = new THREE.Clock();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x050505);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    camera.position.set(0, 6, -10);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.update();
    let isUserOrbiting = false;
    controls.addEventListener('start', () => {
        isUserOrbiting = true;
    });
    controls.addEventListener('end', () => {
        isUserOrbiting = false;
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    const gui = new GUI();
    const params = {
        lightTheta: 0,
        lightThetaSmooth: 0,
        lightPhi: Math.PI / 6,
        lightPhiSmooth: Math.PI / 6,
        cameraOnTerrain: true,
        cameraSpeed: 2
    }
    directionalLight.position.setFromSpherical(new THREE.Spherical(1, params.lightPhiSmooth, params.lightThetaSmooth));
    gui.add(params, 'lightTheta', 0, Math.PI * 2).onChange(function(value) {
    });
    gui.add(params, 'lightPhi', 0, Math.PI).onChange(function(value) {
    });

    gui.add(camera, 'far', 1000, 10000).onChange(function(value) {
        camera.updateProjectionMatrix();
    });
    gui.add(params, 'cameraOnTerrain');
    gui.add(params, 'cameraSpeed');

    const skybox = new ProceduralSkybox();
    skybox.addToScene(scene, camera);
    skybox.updateSkyboxTexture(renderer);
    skybox.addControlsToGUI(gui);
    
    const chunkSize = 400;
    const terrain = new Terrain(camera, scene, chunkSize);
    gui.add(terrain.material, 'wireframe');
    gui.add(terrain.material, 'roughness', 0, 1);
    gui.addColor(terrain.material, 'color');
    gui.add(terrain, 'computeNormals');
    for (let i = 0; i < terrain.noiseScales.length; i++) {
        gui.add(terrain.noiseScales, i).name(`Noise Scale ${i}`).onFinishChange(function(value) {
            terrain.resetChunks();
        });
    }
    for (let i = 0; i < terrain.heightScales.length; i++) {
        gui.add(terrain.heightScales, i).name(`Height Scale ${i}`).onFinishChange(function(value) {
            terrain.resetChunks();
        });
    }
    gui.add(terrain, 'dn');
    // gui.add({ regenerate: () => terrain.resetChunks() }, 'regenerate');
    gui.add(terrain, 'resetChunks');
    // gui.add(terrain, 'textureScale', 1, 100);
    gui.add(terrain, 'detailFactor', 1, 100);

    const testSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), terrain.material);
    testSphere.castShadow = true;
    testSphere.receiveShadow = true;
    testSphere.position.set(0, terrain.calculateHeightRaw(0, 0) + 1, 0);
    scene.add(testSphere);
    // addAxesIndicator();
    
    // const shaderMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { uTime: { value: 0 }, uSpeed: { value: 4 } }});
    // const cube = new THREE.Mesh(new THREE.BoxGeometry(), grassMaterial);
    // cube.castShadow = true;
    // cube.receiveShadow = true;
    // scene.add(cube);


    // speed and strength should be linked. If i set the speed to zero, the blades just stay in their deformed position.
    // but they should actually be at their rest position if their speed is zero
    // frequency is also linked to the speed
    const grassGeometry = createGrassGeometry();
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x319b00, roughness: 0.2, metalness: 0});
    const customGrassMaterial = grassMaterial.clone();

    const materialsFolder = gui.addFolder('Materials');
    addMaterialGUI(terrain.material, materialsFolder, 'Terrain');
    addMaterialGUI(customGrassMaterial, materialsFolder, 'Grass');

    customGrassMaterial.side = THREE.DoubleSide;
    customGrassMaterial.onBeforeCompile = (shader) => {
        // Add a uniform for time
        shader.uniforms.time = { value: 0 };
        shader.uniforms.grassPosition = { value: new THREE.Vector3(0, 0, 0) };
        shader.uniforms.grassRadius = { value: params.grassRadius };
        shader.uniforms.thickness = { value: 0.5 };
        shader.uniforms.windStrength = { value: 0.2 };
        shader.uniforms.windFrequency = { value: 0.5 };
        shader.uniforms.windSpeed = { value: 0.5 };
        shader.uniforms.windDirection = { value: new THREE.Vector2(1, 0) };
        shader.uniforms.windOffset = { value: new THREE.Vector2(0, 0) };
        shader.uniforms.heightmap = { value: terrain.heightTexture };
        shader.uniforms.invTextureScale = { value: 1.0 / terrain.textureScale };

        console.log(shader.vertexShader);
        // Inject custom varying
        shader.vertexShader = shader.vertexShader.replace(
            `#include <common>`,
            `
            #include <common>
            uniform float time;
            uniform vec3 grassPosition;
            uniform float grassRadius;
            uniform float thickness;
            uniform float windStrength;
            uniform float windFrequency;
            uniform float windSpeed;
            uniform vec2 windDirection;
            uniform vec2 windOffset;

            uniform sampler2D heightmap;
            uniform float invTextureScale;
            
            attribute vec2 instanceOffset;
            attribute vec2 instanceNormalOffset;
            
            // Classic Perlin 2D Noise
            vec2 fade(vec2 t) {
                return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
            }

            float perlinNoise2D(vec2 P) {
                vec2 Pi = floor(P);        // Integer part
                vec2 Pf = fract(P);        // Fractional part

                // Gradients at the corners
                vec2 g00 = normalize(vec2(
                    fract(sin(dot(Pi + vec2(0.0, 0.0), vec2(127.1, 311.7))) * 43758.5453),
                    fract(sin(dot(Pi + vec2(0.0, 0.0), vec2(269.5, 183.3))) * 43758.5453)
                ) * 2.0 - 1.0);
                vec2 g10 = normalize(vec2(
                    fract(sin(dot(Pi + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453),
                    fract(sin(dot(Pi + vec2(1.0, 0.0), vec2(269.5, 183.3))) * 43758.5453)
                ) * 2.0 - 1.0);
                vec2 g01 = normalize(vec2(
                    fract(sin(dot(Pi + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453),
                    fract(sin(dot(Pi + vec2(0.0, 1.0), vec2(269.5, 183.3))) * 43758.5453)
                ) * 2.0 - 1.0);
                vec2 g11 = normalize(vec2(
                    fract(sin(dot(Pi + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453),
                    fract(sin(dot(Pi + vec2(1.0, 1.0), vec2(269.5, 183.3))) * 43758.5453)
                ) * 2.0 - 1.0);

                // Offset vectors
                vec2 d00 = Pf - vec2(0.0, 0.0);
                vec2 d10 = Pf - vec2(1.0, 0.0);
                vec2 d01 = Pf - vec2(0.0, 1.0);
                vec2 d11 = Pf - vec2(1.0, 1.0);

                // Dot products
                float v00 = dot(g00, d00);
                float v10 = dot(g10, d10);
                float v01 = dot(g01, d01);
                float v11 = dot(g11, d11);

                // Smooth interpolation
                vec2 f = fade(Pf);
                float nx0 = mix(v00, v10, f.x);
                float nx1 = mix(v01, v11, f.x);
                float nxy = mix(nx0, nx1, f.y);

                return nxy;
            }

            vec2 wrap(vec2 x, vec2 t, float width) {
                vec2 nearestFloor = floor(t / width) * width;
                vec2 moded = t - nearestFloor;
                return x + nearestFloor + step(x, moded) * width;
            }

            `
        );
        
        shader.vertexShader = shader.vertexShader.replace(
            `#include <beginnormal_vertex>`,
            `
            vec2 worldInstancePos = wrap(instanceOffset, grassPosition.xz, grassRadius + grassRadius);
            vec3 rotatedHorizontal = normalize(vec3(instanceNormalOffset.y, 0.0, -instanceNormalOffset.x)) * thickness;
            vec3 transformed = position * smoothstep(grassRadius, grassRadius - 10.0, length(worldInstancePos - grassPosition.xz - grassRadius));
            transformed.xz = rotatedHorizontal.xz * position.x;
            float posySquared = transformed.y * transformed.y;
            float wind = perlinNoise2D(worldInstancePos * windFrequency + windOffset) * windStrength;
            vec2 wind2D = windDirection * wind;
            vec3 deformation = vec3(wind2D.x, 0.0, wind2D.y);
            deformation.xz += instanceNormalOffset;
            deformation.y = -dot(deformation, deformation);
            vec4 textureValue = texture2D(heightmap, worldInstancePos * invTextureScale) * 60.0;
            float height = textureValue.a;
            deformation *= posySquared;
            vec3 objPos = transformed + deformation;
            transformed += vec3(worldInstancePos.x, height, worldInstancePos.y) + deformation;
            
            // vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) - vec3(instanceNormalOffset.x, 0.0, instanceNormalOffset.y) * 0.5);
            vec3 objectNormal = normalize(cross(rotatedHorizontal, objPos + vec3(0.0, 0.01, 0.0)));
            // vec3 objectNormal = vec3(0.0, 1.0, 0.0);
            `
        );

        // Displace the vertex position
        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `
            `
        );
        // console.log(shader.fragmentShader);
        // shader.fragmentShader = shader.fragmentShader.replace(
        //     `#include <normal_fragment_begin>`,
        //     `#include <normal_fragment_begin>
        //     normal = gl_FrontFacing ? normal : -normal;
        //     `
        // );
        // shader.fragmentShader = shader.fragmentShader.replace(
        //     '#include <dithering_fragment>',
        //     `
        //     #include <dithering_fragment>
        
        //     // Override fragment color for back faces
        //     if (!gl_FrontFacing) {
        //         gl_FragColor = vec4(1.0); // solid white
        //     }
        //     `
        // );
        
        customGrassMaterial.userData.shader = shader;
        const windAngle = {value: 0};
        gui.add(params, 'grassRadius', 0, 400).name('Grass Radius').onChange(function(value) {
            updateGrass();
            customGrassMaterial.userData.shader.uniforms.grassRadius.value = value;
        });
        gui.add(customGrassMaterial.userData.shader.uniforms.thickness, 'value', 0, 5).name('Thickness');
        gui.add(customGrassMaterial.userData.shader.uniforms.windStrength, 'value', 0, 10).name('Wind Strength');
        gui.add(customGrassMaterial.userData.shader.uniforms.windFrequency, 'value', 0, 1).name('Wind Frequency');
        gui.add(customGrassMaterial.userData.shader.uniforms.windSpeed, 'value', 0, 10).name('Wind Speed');
        gui.add(windAngle, 'value', 0, Math.PI * 2).name('Wind Angle').onChange(function(value) {
            customGrassMaterial.userData.shader.uniforms.windDirection.value.set(Math.cos(value), Math.sin(value));
        });
    };

    const instanceCount = 500000;
    const grassInstancedGeometry = new THREE.InstancedBufferGeometry();
    grassInstancedGeometry.instanceCount = instanceCount;
    grassInstancedGeometry.index = grassGeometry.index;
    grassInstancedGeometry.attributes.position = grassGeometry.attributes.position;
    grassInstancedGeometry.attributes.normal = grassGeometry.attributes.normal;
    // grassInstancedGeometry.attributes.uv = grassGeometry.attributes.uv; // if needed

    // Custom per-instance attribute (e.g. offset)
    const offsets = new Float32Array(instanceCount * 2); // x, y, z per instance
    const normalOffsets = new Float32Array(instanceCount * 2); // x, y, z per instance
    
    grassInstancedGeometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    grassInstancedGeometry.setAttribute('instanceNormalOffset', new THREE.InstancedBufferAttribute(normalOffsets, 3));
    grassInstancedGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), chunkSize / 2 * 1.5);
    params.grassRadius = 50;
    updateGrass();
    // console.log(grassInstancedGeometry);
    const grassInstancedMesh = new THREE.Mesh(grassInstancedGeometry, customGrassMaterial);
    grassInstancedMesh.frustumCulled = false;
    // grassInstancedMesh.castShadow = true;
    grassInstancedMesh.receiveShadow = true;
    scene.add(grassInstancedMesh);


    function updateGrass() {
        const dummyNormal = new THREE.Vector3(0, 1, 0);
        const lean = .4;
        for (let i = 0; i < instanceCount; i++) {
            // const x = wrap((Math.random()) * 50, camera.position.x - 25, 50);
            // const z = wrap((Math.random()) * 50, camera.position.z - 25, 50);
            // const x = Math.random();
            // const z = Math.random();
            const x = Math.random() * params.grassRadius * 2;
            const z = Math.random() * params.grassRadius * 2;
            const ix = i * 2;
            // const iy = ix + 1;
            const iz = ix + 1;
    
            offsets[ix] = x;
            // offsets[iy] = terrain.calculateHeight(x * terrain.terrainScale, z * terrain.terrainScale);
            offsets[iz] = z;
            const randomEquatorial = Math.random() * Math.PI * 2;
            const randomLength = Math.random();
            // const randomPolar = Math.random() * Math.PI / 4;
            // dummyNormal.setFromSpherical(new THREE.Spherical(1, randomEquatorial, Math.PI / 2));
            normalOffsets[ix] = Math.cos(randomEquatorial) * randomLength * lean;
            // normalOffsets[iy] = 0;
            normalOffsets[iz] = Math.sin(randomEquatorial) * randomLength * lean;
        }
        grassInstancedGeometry.attributes.instanceOffset.needsUpdate = true;
        grassInstancedGeometry.attributes.instanceNormalOffset.needsUpdate = true;
    }


    let time = 0;
    function animate() {
        requestAnimationFrame(animate);
        stats.begin();
        // const test = [0,1.3,2.8,3,4,5,6,7,8,9];
        // const test2 = test.map(x => wrap(x, params.cameraSpeed, 10));
        // console.log(test2);
        const delta = clock.getDelta(); // seconds since last frame
        time += delta;
        const fps = 1 / delta;
        infoDiv.innerHTML = `FPS: ${fps.toFixed(0)}`;
        // updateGrass();
        if (customGrassMaterial.userData.shader) {
            customGrassMaterial.userData.shader.uniforms.time.value += delta;
            const deltaWind = customGrassMaterial.userData.shader.uniforms.windDirection.value.clone().multiplyScalar(
                customGrassMaterial.userData.shader.uniforms.windSpeed.value * delta
            );
            customGrassMaterial.userData.shader.uniforms.windOffset.value.add(deltaWind);
            customGrassMaterial.userData.shader.uniforms.grassPosition.value.copy(controls.target.clone()
                .add(new THREE.Vector3(-params.grassRadius, 0, -params.grassRadius)));
        }
        moveOrbiter(params.cameraSpeed);
        if (params.cameraOnTerrain) {
            keepCameraAboveTerrain();
        }
        terrain.targetPoint.copy(controls.target);
        terrain.update();

        params.lightThetaSmooth = THREE.MathUtils.lerp(params.lightThetaSmooth, params.lightTheta, 0.1);
        params.lightPhiSmooth = THREE.MathUtils.lerp(params.lightPhiSmooth, params.lightPhi, 0.1);
        directionalLight.position.setFromSpherical(new THREE.Spherical(1, params.lightPhiSmooth, params.lightThetaSmooth));
        
        const aboveHorizon = Math.max(0, Math.min(directionalLight.position.y * 5, 1));
        directionalLight.intensity = aboveHorizon * 2;
        const sunColor = skybox.skyboxMaterial.uniforms.sunColor.value;
        directionalLight.color.lerpColors(new THREE.Color(sunColor[0], sunColor[1], sunColor[2]), new THREE.Color(1, 1, 1), aboveHorizon);
        
        skybox.update(renderer, delta, time, directionalLight.position, params.lightPhiSmooth, params.lightThetaSmooth);
        renderer.render(scene, camera);
        stats.end();
    }
    animate();

    function createGrassGeometry() {
        const geometry = new THREE.BufferGeometry();
        
        const vertices = new Float32Array([
        0, 1, 0,  // Top
        -.1, .5, 0,  // Left
        .1, .5, 0,  // Right
        0, 0, 0   // Bottom
        ]);

        const indices = [
        0, 1, 2,  // Top triangle: top - left - right
        1, 3, 2   // Bottom triangle: left - bottom - right
        ];

        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();  // Optional but useful for lighting
        return geometry;
    }

    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -10);

    window.addEventListener('click', (event) => {
        if (event.target != renderer.domElement) return;
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Set ray from camera and mouse coordinates
        raycaster.setFromCamera(mouse, camera);

        const intersectionPoint = new THREE.Vector3();
        const intersects = raycaster.ray.intersectPlane(plane, intersectionPoint);

        if (intersects) {
            // cube.position.copy(intersectionPoint);
            // terrain.targetPoint.copy(intersectionPoint);
        }
    });

    function keepCameraAboveTerrain() {
        const terrainHeightAtCamera = .1 + terrain.calculateHeightScaled(camera.position.x, camera.position.z);
        const terrainHeightAtTarget = .5 + terrain.calculateHeightScaled(controls.target.x, controls.target.z);
        const targetHeightDifference = terrainHeightAtTarget - controls.target.y;
        controls.target.y = terrainHeightAtTarget;
        camera.position.y += targetHeightDifference;
        if (camera.position.y < terrainHeightAtCamera) {
            camera.position.y = terrainHeightAtCamera;
        }
    }

    function moveOrbiter(speed) {
        // if (!isUserOrbiting) return;
        const target = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, 0);
        camera.getWorldDirection(forward);
        const up = new THREE.Vector3(0, 1, 0);
        const right = forward.clone().cross(up).normalize();
        up.crossVectors(right, forward).normalize();
        // up.normalize();
        if (keysPressed.has('shift')) {
            speed *= 5;
        }
        if (keysPressed.has('w')) {
            target.add(forward);
        }
        if (keysPressed.has('s')) {
            target.sub(forward);
        }
        if (keysPressed.has('a')) {
            target.sub(right);
        }
        if (keysPressed.has('d')) {
            target.add(right);
        }
        if (keysPressed.has('q')) {
            target.sub(up);
        }
        if (keysPressed.has('e')) {
            target.add(up);
        }
        target.multiplyScalar(speed);
        controls.target.add(target);
        camera.position.add(target);
        controls.update();
    }

    function addAxesIndicator() {
        const axes = new THREE.Group();
        const xAxis = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        xAxis.position.set(1, 0, 0);
        axes.add(xAxis);
        const yAxis = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 0.1), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
        yAxis.position.set(0, 1, 0);
        axes.add(yAxis);
        const zAxis = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x0000ff }));
        zAxis.position.set(0, 0, 1);
        axes.add(zAxis);
        axes.position.set(0, 2, 0);
        scene.add(axes);
    }

    function addMaterialGUI(material, gui, name) {
        const folder = gui.addFolder(name);
        folder.addColor(material, 'color');
        folder.add(material, 'roughness', 0, 1);
        folder.add(material, 'envMapIntensity');
        
        return folder;
    }
})();
