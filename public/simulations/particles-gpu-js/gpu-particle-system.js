import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";

export class GPUParticleSystem {
    constructor(sizeX, sizeY, renderer) {
        const gpuCompute = new GPUComputationRenderer(sizeX, sizeY, renderer);

        // function testF1() {
        //     console.log(this.sizeX);
        // }
        this.testF2 = function () {
            console.log(this.sizeX);
        }
    }


}
