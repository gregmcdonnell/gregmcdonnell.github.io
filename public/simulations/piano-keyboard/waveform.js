
import * as THREE from 'three';

export class Waveform {
    
    constructor(sceneObj) {
        // this.fftAnalyser = new Tone.Analyser("fft", 1024);
        // Tone.getDestination().connect(this.fftAnalyser);
        const audioCtx = Tone.getContext().rawContext;   // underlying AudioContext
        this.analyser = audioCtx.createAnalyser();
        this.analyser.fftSize = 4096;                         // choose your size
        this.analyser.smoothingTimeConstant = 0.5;
        Tone.getDestination().connect(this.analyser);

        this.waveform = new Float32Array(this.analyser.fftSize);              // time-domain
        this.spectrum = new Float32Array(this.analyser.frequencyBinCount); 
        this.useTrigger = true;
        this.display = true;

        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        
        this.waveformLength = 4096;
        this.positions = new Float32Array(this.waveformLength * 3);
        for (let i = 0; i < this.waveformLength; i++) {
            this.positions[i * 3] = -(i / (this.waveformLength - 1));
            this.positions[i * 3 + 1] = 0;
            this.positions[i * 3 + 2] = 0;
        }
        this.waveformGeometry = new THREE.BufferGeometry();
        this.waveformGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        const line = new THREE.Line(this.waveformGeometry, material);
        line.position.set(0, 4, -2);
        line.scale.set(30, 5, 1);
        sceneObj.add(line);

        this.N_FFT = 256;
        this.fftPositions = new Float32Array(this.N_FFT * 4 * 3);
        this.fftIndices = new Uint16Array(this.N_FFT * 6);

        this.fftGeometry = new THREE.BufferGeometry();
        this.fftGeometry.setAttribute('position', new THREE.BufferAttribute(this.fftPositions, 3));
        this.fftGeometry.setIndex(new THREE.BufferAttribute(this.fftIndices, 1));

        const fftMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
        const fftMesh = new THREE.Mesh(this.fftGeometry, fftMaterial);
        fftMesh.position.set(0, 4, -2);
        sceneObj.add(fftMesh);
        const fftMeshClone = fftMesh.clone();
        fftMeshClone.scale.set(-1,1,1);
        // sceneObj.add(fftMeshClone);

        let posIdx = 0;
        let indIdx = 0;
        const barWidth = .15;
        const gap =.05;
        for (let i = 0; i < this.N_FFT; i++) {
            const x0 = i * (barWidth + gap);
            const x1 = x0 + barWidth;
            const y0 = -0.1;
            const y1 = 0;
        
            // 4 vertices per rectangle
            this.fftPositions[posIdx++] = x0; this.fftPositions[posIdx++] = y0; this.fftPositions[posIdx++] = 0; // bottom-left
            this.fftPositions[posIdx++] = x1; this.fftPositions[posIdx++] = y0; this.fftPositions[posIdx++] = 0; // bottom-right
            this.fftPositions[posIdx++] = x1; this.fftPositions[posIdx++] = y1; this.fftPositions[posIdx++] = 0; // top-right
            this.fftPositions[posIdx++] = x0; this.fftPositions[posIdx++] = y1; this.fftPositions[posIdx++] = 0; // top-left

            const vertOffset = i * 4;
            this.fftIndices[indIdx++] = vertOffset;     // bottom-left
            this.fftIndices[indIdx++] = vertOffset + 1; // bottom-right
            this.fftIndices[indIdx++] = vertOffset + 2; // top-right
        
            this.fftIndices[indIdx++] = vertOffset;     // bottom-left
            this.fftIndices[indIdx++] = vertOffset + 2; // top-right
            this.fftIndices[indIdx++] = vertOffset + 3; // top-left
        }
        this.fftGeometry.index.needsUpdate = true;
        this.fftGeometry.attributes.position.needsUpdate = true;

        // this.intervalUpdate = false;
        // setInterval(() => {
        //     this.intervalUpdate = true;
        // }, 1000);
    }

    updateFFTGraph() {
        for (let i = 0; i < this.N_FFT; i++) {
            const dB = this.spectrum[i];
            const posIdx = i * 12;
            const mag = Math.pow(10, dB / 20) * 80;
            this.fftPositions[posIdx + 7] = mag;
            this.fftPositions[posIdx + 10] = mag;
        }
        this.fftGeometry.attributes.position.needsUpdate = true;
    }
    updateWaveformGraph() {
        if (this.useTrigger) {
            const triggerIndex = this.findTriggerIndex();
            for (let i = 0; i < this.waveformLength; i++) {
                this.positions[i * 3 + 1] = this.waveform[(i + triggerIndex) % this.waveformLength];
            }
        } else {
            for (let i = 0; i < this.waveformLength; i++) {
                this.positions[i * 3 + 1] = this.waveform[i];
            }
        }
        this.waveformGeometry.attributes.position.needsUpdate = true;

    }

    updateWaveFromFFT() {
        
        for (let i = 0; i < this.waveformLength; i++) {
            let amplitude = 0;
            for (let j = 0; j < 24; j++) {
                const spectrumIndex = j; // every 4th bin
                const dB = this.spectrum[spectrumIndex];
                const frequencyMag = Math.pow(10, dB / 20) * 5;
                // const sineMag = Math.sin(frequencyMag * i * .04);
                const sineMag = frequencyMag * Math.sin(spectrumIndex * .0008 * i);
                amplitude += sineMag;
            }
            this.positions[i * 3 + 1] = amplitude;
        }
        this.waveformGeometry.attributes.position.needsUpdate = true;

    }

    updateWaveParticles() {
        
    }
    
    update() {
        this.analyser.getFloatFrequencyData(this.spectrum);
        this.updateFFTGraph();
        this.analyser.getFloatTimeDomainData(this.waveform);
        this.updateWaveformGraph();
        // this.updateWaveFromFFT();
        // this.analyser.getFloatFrequencyData(this.spectrum);

        // if (this.intervalUpdate) {
        //     this.updateWaveformGraph();
        //     this.intervalUpdate = false;
        // }
    }

    findTriggerIndex() {
        // Find the first rising zero crossing
        let lastSample = this.waveform[0];
        for (let i = 1; i < this.waveformLength; i++) {
            const sample = this.waveform[i];
            if (lastSample < 0 && sample >= 0) {
                return i;
            }
            lastSample = sample;
        }
        return 0; // fallback if none found
    }
}