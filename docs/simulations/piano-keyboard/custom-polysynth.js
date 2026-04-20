function mod(n, m) {
    return ((n % m) + m) % m;
}

export class CustomPolySynth {
    static notesHeld;
    constructor(synthType, synthOptions) {
        this.synthOptions = structuredClone(synthOptions);
        this.allVoices = [];
        this.activeVoices = new Map();
        this.whichVoice = 0;
        this.nVoices = 8;
        for (let i = 0; i < this.nVoices; i++) {
            const synth = new synthType(synthOptions);
            this.allVoices.push(synth.toDestination());
        }
    }

    triggerRelease(note) {
        const synth = this.activeVoices.get(note);
        if (synth) {
            this.activeVoices.delete(note);
            synth.triggerRelease();
            synth.isActive = false;
        }
    }

    triggerAttack(note) {
        // this.triggerRelease(note);
        let nextSynth;
        for (let i = 0; i < this.nVoices; i++) {
            nextSynth = this.allVoices[this.whichVoice];
            this.whichVoice = (this.whichVoice + 1) % this.nVoices;
            if (!nextSynth.isActive) break;
        }
        const oldSynth = this.allVoices[this.whichVoice];
        if (!CustomPolySynth.notesHeld.has(oldSynth.note)) {
            oldSynth.triggerRelease();
            oldSynth.isActive = false;
        }
        nextSynth.triggerAttack(note);
        nextSynth.note = note;
        nextSynth.isActive = true;
        this.activeVoices.set(note, nextSynth);
    }

    switchNoteToSustain(note) {
        const synth = this.activeVoices.get(note);
        if (synth) {
            synth.envelope.sustain = 0;
        }
    }


    set(props) {
        Object.assign(this.synthOptions, props);
        for (const synth of this.allVoices) {
            synth.set(props);
        }
    }

    disconnect() {
        for (const synth of this.allVoices) {
            synth.disconnect();
            synth.dispose();
        }
    }
}

// class MyPolySynth {
//     constructor(synthOptions) {
//       this.synthOptions = synthOptions;
//       this.allVoices = [];
//       this.availableVoices = [];
//       this.unavailableVoices = [];
//       this.activeVoices = new Map();
//       this.whichVoice = 0;
//       this.nVoices = 8;
//       for (let i = 0; i < this.nVoices; i++) {
//         const synth = new Tone.MonoSynth(synthOptions);
//         synth.onsilence = () => {
//           this.unavailableVoices.splice(synth.unavailableIndex, 1);
//           this.availableVoices.push(synth);
//           console.log("pushed on silence ");
//         }
//         this.availableVoices.push(synth.toDestination());
//         this.allVoices.push(synth);
//       }
//     }

//     triggerRelease(note) {
//       const synth = this.activeVoices.get(note);
//       if (synth) {
//         this.activeVoices.delete(note);
//         synth.triggerRelease();
//         const releaseMS = this.synthOptions.envelope.release * 1000;
//         // setTimeout( () => {
//         //   this.unavailableVoices.splice(synth.unavailableIndex, 1);
//         //   this.availableVoices.push(synth);
//         //   // console.log("pushed on silence " + note);
//         //   }, releaseMS); 
//         // Tone.Transport.scheduleOnce((time) => {
//         //   this.activeVoices.delete(synth.note);
//         //   this.availableVoices.push(synth);
//         //   // console.log("pushed on silence " + synth.note);
//         // }, scheduledTime);
//       }
//     }

//     triggerAttack(note) {
//       this.triggerRelease(note);
//       let nextSynth;
//       console.log(this.availableVoices.length);
//       if (this.availableVoices.length > 0) {
//         console.log("got voice from available list")
//         nextSynth = this.availableVoices.pop();
//         nextSynth.triggerAttack(note);
//       }
//       else {
//         console.log("got oldest voice from unavailable voices")
//         nextSynth = this.unavailableVoices.shift();
//         // const now = Tone.now();
//         // const release = nextSynth.envelope.release;
//         // nextSynth.envelope.release = 0.0;
//         // nextSynth.triggerRelease();
//         nextSynth.triggerAttack(note);
//         // const oldestSynthNote = this.activeVoices.keys().next().value;
//         // nextSynth = this.activeVoices.get(oldestSynthNote);
//         // this.activeVoices.delete(oldestSynthNote);

//         // console.log("getting oldest active synth");
//         // const release = nextSynth.envelope.release;
//         // nextSynth.triggerRelease();
//         // nextSynth.envelope.release = release;
//         // nextSynth.envelope._sig.setValueAtTime(1, Tone.now());
//         // nextSynth.filterEnvelope.cancel();
//         // nextSynth.envelope.cancel();
//       }
//       nextSynth.unavailableIndex = this.unavailableVoices.length;
//       this.unavailableVoices.push(nextSynth);
//       nextSynth.note = note;
//       this.activeVoices.set(note, nextSynth);
//     }


//     set(props) {
//       Object.assign(this.synthOptions, props);
//       for (const synth of this.allVoices) {
//         synth.set(props);
//       }
//     }
//   }