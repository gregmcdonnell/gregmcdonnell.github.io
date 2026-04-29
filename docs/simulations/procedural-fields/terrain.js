import * as THREE from 'three';

export class Terrain {
  
    constructor(camera, scene, chunkSize) {
        this.camera = camera;
        this.scene = scene;
        this.chunkSize = chunkSize;
        this.targetPoint = new THREE.Vector3(0, 0, 0);
        this.lastChangedTargetPoint = new THREE.Vector3(0, 0, 0);
        this.nChunkWidth = 7;
        this.simplexNoise = new SimplexNoise();
        this.geometryPool = [];
        this.baseGeometries = [];
        this.chunkOffsets = [];
        this.chunkIndexOffsets = [];
        this.currentChunkIndex = [0, 0];
        this.currentChunkPosition = new THREE.Vector3(0, 0, 0);
        // this.meshMap = [];
        this.meshMap = new Map();
        this.meshesNeedingGeoSwap = [];
        this.meshPool = [];
        this.generateBaseGeometries();
        this.generateChunkOffsets();
        this.material = new THREE.MeshStandardMaterial({ color: 'hsl(88, 78.90%, 18.60%)', roughness: 0.3, metalness: 0, wireframe: false});
        this.otherMaterial = new THREE.MeshStandardMaterial({ color: 'hsl(246, 100.00%, 50.00%)', roughness: 0.3, metalness: 0, wireframe: true});
        this.computeNormals = false;
        this.terrainScale = .01;
        this.noiseScales = [.5, .1];
        this.heightScales = [22, 60];
        this.dn = .01;
        this.time = 0;
        this.detailFactor = 5;
        this.chunksToAdd = new Set();
        this.chunksToUpdate = new Set();
        this.textureSize = 128;
        this.textureScale = 1000;
        this.heightTextureData = new Float32Array(this.textureSize * this.textureSize * 4);
        this.heightTexture = new THREE.DataTexture(this.heightTextureData, this.textureSize, this.textureSize, THREE.RGBAFormat, THREE.FloatType);
        this.heightTexture.needsUpdate = true;
        //think of this in one dimension, we just sample the texture as though it were at the origin, and use the wrapping to take care of that
        // as we move right, a new chunk of texture is needed, so we add it to its wrapped offset,
        // like if the texture is 100 world units wide, then if we need new height data up to x = 120,
        // we add the new height data from x = 0 to x = 20, but we sample those values from 100 to 120, (or 1 to 1.2 in uv coords)
        this.heightTexture.wrapS = THREE.RepeatWrapping;
        this.heightTexture.wrapT = THREE.RepeatWrapping;
        this.heightTexture.minFilter = THREE.LinearFilter;
        this.heightTexture.magFilter = THREE.LinearFilter;
        this.updateHeightTexture();
        // const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), new THREE.MeshBasicMaterial({map: this.heightTexture}));
        // textMesh.position.set(-4, 0, -3);
        // camera.add(textMesh);

        // this.placeInitialChunks();
        // this.resetChunks();
        this.updateActiveChunks(this.currentChunkIndex);


    }

    // x and z must be scaled to terrain scale first
    calculateHeightRaw(x, z) {
      // const largeHeight = this.simplexNoise.sample(x * this.noiseScale, z * this.noiseScale) * this.heightScale;
      let height = 0;
      for (let i = 0; i < this.noiseScales.length; i++) {
        height += this.simplexNoise.sample(x * this.noiseScales[i], z * this.noiseScales[i]) * this.heightScales[i];
      }
      return height;
    }
    
    calculateHeightScaled(x, z) {
      return this.calculateHeightRaw(x * this.terrainScale, z * this.terrainScale);
    }

    getGeometryAtLOD(lod) {
        const poolAtLOD = this.geometryPool[lod];
        if (poolAtLOD.length > 0) {
            return poolAtLOD.pop();
        }
        const geometry = this.baseGeometries[lod].clone();
        geometry.lodLevel = lod;
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.sqrt(this.heightScale ** 2 + (this.chunkSize * Math.SQRT2 / 2) ** 2));
        return geometry;
    }
  
    generateBaseGeometries() {
        for (let l = 3; l < 8; l++) {
            const subdivisions = 1 << l;
            const geometry = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, subdivisions, subdivisions);
            // swap y and z in vertex buffer
            const vertices = geometry.attributes.position.array;
            const normals = geometry.attributes.normal.array;
            for (let i = 0; i < vertices.length; i += 3) {
                const y = vertices[i + 1];
                vertices[i + 1] = vertices[i + 2];
                vertices[i + 2] = -y;
                normals[i] = 0;
                normals[i + 1] = 1;
                normals[i + 2] = 0;
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.normal.needsUpdate = true;
            
            this.baseGeometries.push(geometry);
            this.geometryPool.push([]);
        }
    }

    generateChunkOffsets() {
      for (let i = -this.nChunkWidth; i <= this.nChunkWidth; i++) {
        for (let j = -this.nChunkWidth; j <= this.nChunkWidth; j++) {
          const position = new THREE.Vector3(i * this.chunkSize, 0, j * this.chunkSize);
          const distToTarget = position.distanceTo(this.targetPoint);
          if (distToTarget <= (this.nChunkWidth + .5) * this.chunkSize ) {
            this.chunkOffsets.push(position);
            this.chunkIndexOffsets.push([i, j]);
          }
        }
      }
    }

    placeInitialChunks() {
        console.time('placeChunks');
        for (let indexOffset of this.chunkIndexOffsets) {
          this.addChunk(indexOffset);
        }
        
        console.timeEnd('placeChunks');
    }

    getMeshFromPool() {
      // console.log(this.meshPool.length);
      if (this.meshPool.length > 0) {
        const mesh = this.meshPool.pop();
        mesh.visible = true;
        return mesh;
      }
      // console.log('no mesh in pool. creating new mesh. ' + this.meshMap.size + ' in scene');
    
      // Create only if pool is empty
      const mesh = new THREE.Mesh(undefined, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // mesh.scale.set(.98, 1, .98);
      this.scene.add(mesh);
      return mesh;
    }

    addChunk(index) {
      const position = this.getChunkPositionFromIndex(index);
      const distToCurrentChunk = position.distanceTo(this.currentChunkPosition);
      const newLOD = this.distanceToGeometryIndex(distToCurrentChunk);
      const geometry = this.getGeometryAtLOD(newLOD);
      this.recalculateChunkGeometry(geometry, position);
      // const mesh = new THREE.Mesh(geometry, this.material);
      // mesh.castShadow = true;
      // mesh.receiveShadow = true;
      const mesh = this.getMeshFromPool();
      mesh.geometry = geometry;
      mesh.position.copy(position);
      // this.scene.add(mesh);
      // this.meshMap[i][j] = mesh;
      this.meshMap.set(this.getChunkKeyFromIndex(index), mesh);
    }

    removeChunk(key) {
      const mesh = this.meshMap.get(key);
      const oldLOD = mesh.geometry.lodLevel;
      this.geometryPool[oldLOD].push(mesh.geometry);
      this.meshMap.delete(key);
      // this.scene.remove(mesh);
      mesh.visible = false;
      mesh.geometry = undefined;
      this.meshPool.push(mesh);
    }

    updateChunk() {

    }

    checkToUpdateChunk(key) {
      const mesh = this.meshMap.get(key);
      const distToCurrentChunk = mesh.position.distanceTo(this.currentChunkPosition);
      const newLOD = this.distanceToGeometryIndex(distToCurrentChunk);
      const lodChanged = mesh.geometry.lodLevel !== newLOD;
      // if lod doesnt change we dont need to do ANYTHING!!!!!
      if (lodChanged) {
        // console.log('LOD changed');
        const geometry = this.getGeometryAtLOD(newLOD);
        mesh.nextGeometry = geometry;
        this.meshesNeedingGeoSwap.push(mesh);
        this.recalculateChunkGeometry(geometry, mesh.position);
        // mesh.material = this.otherMaterial;
      }
      else {
        // mesh.material = this.material;
      }
    }


    // reset chunks and update chunks can be combined
    //loop through index offsets and get key for each index
    // if map contains key, check to update the chunk, otherwise add the chunk
    // then loop through map and remove chunks that are not in the set

    resetChunks() {
      // TODO: only allow one chunk calculation per frame
        console.time('resetChunks');
        for (let key of this.meshMap.keys()) {
          this.removeChunk(key);
        }
        this.updateActiveChunks(this.currentChunkIndex);
        this.updateHeightTexture();
        console.timeEnd('resetChunks');
    }

    /**
    * @param {THREE.BufferGeometry} geometry
    */
    recalculateChunkGeometry(geometry, chunkPosition) {
      const dnNoise = this.dn * this.terrainScale;
      const vertices = geometry.attributes.position.array;
      const normals = geometry.attributes.normal.array;
      // we have two options for estimating normals, we can sample two extra points, or we can loop through again to use existing points
      for (let i = 0; i < vertices.length; i += 3) {
          const x = vertices[i] + chunkPosition.x;
          const z = vertices[i + 2] + chunkPosition.z;
          const xNoise = x * this.terrainScale;
          const zNoise = z * this.terrainScale;
          const height = this.calculateHeightRaw(xNoise, zNoise);
          vertices[i + 1] = height;
          const heightDX = this.calculateHeightRaw(xNoise + dnNoise, zNoise);
          const heightDZ = this.calculateHeightRaw(xNoise, zNoise + dnNoise);
          const dhx = height - heightDX;
          const dhz = height - heightDZ;
          const normal = new THREE.Vector3(dhx, this.dn, dhz);
          normal.normalize();
          normals[i] = normal.x;
          normals[i + 1] = normal.y;
          normals[i + 2] = normal.z;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
      if (this.computeNormals) {
          geometry.computeVertexNormals();
      }

    }

    updateActiveChunks(centerChunkIndex) {
      const keysThatShouldBeActive = new Map();
      // const centerChunkIndex = this.getChunkIndex(centerPosition);
      for (let [i,j] of this.chunkIndexOffsets) {
        const index = [centerChunkIndex[0] + i, centerChunkIndex[1] + j];
        const key = this.getChunkKeyFromIndex(index);
        keysThatShouldBeActive.set(key, index);
      }
      for (let key of this.meshMap.keys()) {
        if (!keysThatShouldBeActive.has(key)) {
          this.removeChunk(key);
        }
      }
      for (let [key, index] of keysThatShouldBeActive) {
        if (this.meshMap.has(key)) {
          // this.chunksToUpdate.add(key);
          this.checkToUpdateChunk(key);
        } else {
          // this.chunksToAdd.add(index);
          this.addChunk(index);
        }
      }
      
    }


    updateHeightTexture() {
      let texIndex = 0;
      for (let i = 0; i < this.textureSize; i++) {
        for (let j = 0; j < this.textureSize; j++) {
          const u = (j + .5) / this.textureSize;
          const v = (i + .5) / this.textureSize;
          // const xWorld = u  * this.textureScale + (u > .5 ? -this.textureScale : 0) - this.textureScale;
          // const zWorld = v * this.textureScale + (v > .5 ? -this.textureScale : 0) - this.textureScale;
          const xWorld = wrap(u  * this.textureScale, this.targetPoint.x - this.textureScale / 2, this.textureScale);
          const zWorld = wrap(v * this.textureScale, this.targetPoint.z - this.textureScale / 2, this.textureScale);
          const height = this.calculateHeightScaled(xWorld, zWorld) / 60;
          this.heightTextureData[texIndex] = height;
          this.heightTextureData[texIndex + 1] = height;
          this.heightTextureData[texIndex + 2] = height;
          this.heightTextureData[texIndex + 3] = height;
          texIndex += 4;
        }
      }
      this.heightTexture.needsUpdate = true;
    }

    getChunkPositionFromIndex(index) {
      return new THREE.Vector3(index[0] * this.chunkSize, 0, index[1] * this.chunkSize);
    }

    getChunkIndex(position) {
      return [Math.round(position.x / this.chunkSize), Math.round(position.z / this.chunkSize)];
    }
    getChunkKeyFromIndex(index) {
      const [x, z] = index;
      return `${x},${z}`;
    }
    getChunkKeyFromPosition(position) {
      const index = this.getChunkIndex(position);
      return this.getChunkKeyFromIndex(index);
    }


    distanceToGeometryIndex(distance) {
        distance = distance / this.chunkSize;
        const distSquared = distance;
        // const index = 6.5 - distance * .06;
        // const index = this.detailFactor / distSquared;
        let index = 0;
        // if (distSquared < .5) {
        //   index = 4;
        // }
        if (distSquared < 2) {
          index = 3;
        }
        else if (distSquared < 4) {
          index = 2;
        }
        else if (distSquared < 8) {
          index = 1;
        }
        return Math.max(0, Math.min(Math.floor(index), this.baseGeometries.length - 1));

    }

    

    update() {
      // calling this before resetChunks allows the frame delay we need for geometry swapping
      if (this.meshesNeedingGeoSwap.length > 0) {
        for (let i = 0; i < this.meshesNeedingGeoSwap.length; i++) {
          const mesh = this.meshesNeedingGeoSwap[i];
          const oldLOD = mesh.geometry.lodLevel;
          this.geometryPool[oldLOD].push(mesh.geometry);
          mesh.geometry = mesh.nextGeometry;
          mesh.nextGeometry = null;
        }
        this.meshesNeedingGeoSwap = [];
        // console.log(this.geometryPool);
      }
      
      const newChunkIndex = this.getChunkIndex(this.targetPoint);

      // if (this.targetPoint.distanceTo(this.lastChangedTargetPoint) > this.chunkSize) {
      if (newChunkIndex[0] !== this.currentChunkIndex[0] || newChunkIndex[1] !== this.currentChunkIndex[1]) {
        this.currentChunkIndex = newChunkIndex;
        this.currentChunkPosition = this.getChunkPositionFromIndex(newChunkIndex);
        // this.lastChangedTargetPoint.copy(this.targetPoint);
        this.updateActiveChunks(newChunkIndex);
        this.updateHeightTexture();
      }
      // this.updateHeightTexture();

      // if (this.chunksToUpdate.size > 0) {
      //   this.updateChunk(popFromSet(this.chunksToUpdate));
      // }
      // else if (this.chunksToAdd.size > 0) {
      //   this.addChunk(popFromSet(this.chunksToAdd));
      // }
      
      if (this.time % 300 === 0) {
        console.log('terrain tick');
        // for (let mesh of this.meshMap.values()) {
        //   mesh.material = this.material;
        // }
      }
      this.time += 1;
    }

    
    getLevelPositions(L) {
        const positions = [];

        if (L === 0) return [[0, 0]];

        // Top edge
        for (let x = -L + 1; x <= L; x++) positions.push([x, L]);
        // Right edge
        for (let y = L - 1; y >= -L; y--) positions.push([L, y]);
        // Bottom edge
        for (let x = L - 1; x >= -L; x--) positions.push([x, -L]);
        // Left edge
        for (let y = -L + 1; y <= L - 1; y++) positions.push([-L, y]);

        return positions;
    }



}

function popFromSet(set) {
  const value = set.values().next().value;
  if (value !== undefined) {
    set.delete(value);
    return value;
  }
}

  class SimplexNoise {
    constructor() {
      this.grad3 = [
        [1,1], [-1,1], [1,-1], [-1,-1],
        [1,0], [-1,0], [0,1], [0,-1]
      ];
  
      this.p = [];
      for (let i = 0; i < 256; i++) {
        this.p[i] = Math.floor(Math.random() * 256);
      }
  
      this.perm = [];
      for (let i = 0; i < 512; i++) {
        this.perm[i] = this.p[i & 255];
      }
  
      this.F2 = 0.5 * (Math.sqrt(3) - 1);
      this.G2 = (3 - Math.sqrt(3)) / 6;
    }
  
    dot(g, x, y) {
      return g[0] * x + g[1] * y;
    }
  
    sample(xin, yin) {
      const { grad3, perm, F2, G2 } = this;
  
      // Skewing
      let s = (xin + yin) * F2;
      let i = Math.floor(xin + s);
      let j = Math.floor(yin + s);
      let t = (i + j) * G2;
      let X0 = i - t;
      let Y0 = j - t;
      let x0 = xin - X0;
      let y0 = yin - Y0;
  
      // Determine simplex corner
      let i1, j1;
      if (x0 > y0) {
        i1 = 1; j1 = 0;
      } else {
        i1 = 0; j1 = 1;
      }
  
      let x1 = x0 - i1 + G2;
      let y1 = y0 - j1 + G2;
      let x2 = x0 - 1 + 2 * G2;
      let y2 = y0 - 1 + 2 * G2;
  
      let ii = i & 255;
      let jj = j & 255;
      let gi0 = perm[ii + perm[jj]] % 8;
      let gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
      let gi2 = perm[ii + 1 + perm[jj + 1]] % 8;
  
      // Calculate noise contributions from three corners
      let n0 = 0, n1 = 0, n2 = 0;
  
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) {
        t0 *= t0;
        n0 = t0 * t0 * this.dot(grad3[gi0], x0, y0);
      }
  
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) {
        t1 *= t1;
        n1 = t1 * t1 * this.dot(grad3[gi1], x1, y1);
      }
  
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) {
        t2 *= t2;
        n2 = t2 * t2 * this.dot(grad3[gi2], x2, y2);
      }
  
      // Scale result to [-1, 1]
      return 70.0 * (n0 + n1 + n2);
    }
  }

function wrap(x, t, width) {
  const nearestFloor = Math.floor(t / width) * width;
  const mod = t - nearestFloor;
  return x + nearestFloor + (x < mod ? width : 0);
}