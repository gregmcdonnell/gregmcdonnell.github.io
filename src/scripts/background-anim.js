document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const parent = canvas.parentElement;


    let shadowPath = null;

    let mouseX = 0, mouseY = 0;


    // make canvas as sharp as native svg rendering
    const dpr = window.devicePixelRatio;
    const rectP = parent.getBoundingClientRect();

    const canvasWidth = window.innerWidth;
    // const canvasWidth = rectP.width;
    const canvasHeight = rectP.height;
    // console.log(canvasWidth, canvasHeight, rect.width, rect.height);
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);


    const spheres = [];
    const nSpheres = 100;

    for (let i = 0; i < nSpheres; i++) {

        const litVal = (Math.random() * 0.2 + 0.7) * 255;
        const shadowVal = litVal * 0.85;
        // const shadowVal = 100;
        const xPos = Math.random() * canvasWidth;
        spheres.push({
            x: xPos,
            y: Math.random() * canvasHeight,
            x1: xPos,
            y1: 0,
            vx: 0.3 * (Math.random() - 0.5),
            vy: 1.9 * Math.random(),
            r: 8 + Math.random() * 35,

            lit: `rgb(${litVal},${litVal},${litVal})`,
            shadow: `rgb(${shadowVal},${shadowVal},${shadowVal})`
            // lit: `hsl(${Math.random()*360} 70% 75%)`,
            // shadow: `hsl(${Math.random()*360} 40% 35%)`
        });
    }


    function normalize(x, y, z) {

        const len = Math.hypot(x, y, z);

        if (len < 1e-8) {
            return [1, 0, 0];
        }

        return [
            x / len,
            y / len,
            z / len
        ];
    }

    function rebuildShadowPath(lx, ly, lz) {
        const R = 1;
        [lx, ly, lz] = normalize(lx, ly, lz);

        const rho = Math.hypot(lx, ly);


        /* Light directly toward camera. Terminator degenerates. */
        if (rho < 1e-6) {

            if (lz < 0) {
                // full shadowß
                return new Path2D(
                    `
                  M ${R} 0
                  A ${R} ${R} 0 1 1 ${-R} 0
                  A ${R} ${R} 0 1 1 ${R} 0
                  Z
                  `
                );
            }
            // no shadow
            return new Path2D();

        }

        /* Circle/ellipse intersection points. */

        const px = -ly / rho * R;
        const py = lx / rho * R;

        const qx = -px;
        const qy = -py;

        /* Ellipse axes. */

        const a = R * Math.abs(lz);
        const b = R;

        /* Ellipse rotation. */

        const theta = Math.atan2(ly, lx);

        const ellipseSweep = lz >= 0 ? 1 : 0;

        const path = `
          M ${px} ${py}
          A ${a} ${b}
            ${theta * 180 / Math.PI}
            0
            ${ellipseSweep}
            ${qx} ${qy}
          A ${R} ${R}
            0
            0
            0
            ${px} ${py}
          Z
      `;

        return new Path2D(path);
    }

    function draw() {

        ctx.clearRect(
            0,
            0,
            canvasWidth,
            canvasHeight
        );
        const dt = 0.1;

        for (const s of spheres) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.x > canvasWidth + s.r) {
                s.x -= canvasWidth + s.r * 2;
                s.x1 = s.x;
            }
            if (s.y > canvasHeight + s.r) {
                s.y -= canvasHeight + s.r * 2;
                s.y1 = s.y;
            }

            ctx.save();

            const rX = s.x - mouseX;
            const rY = s.y - mouseY;
            const distSquared = (rX * rX + rY * rY);
            const dist = Math.max(distSquared * 0.00015, 2);


            const posX = s.x + rX / dist;
            const posY = s.y + rY / dist;
            s.x1 = lerp(s.x1, posX, 0.1);
            s.y1 = lerp(s.y1, posY, 0.1);
            ctx.translate(
                s.x1,
                s.y1
            );

            ctx.scale(
                s.r,
                s.r
            );

            /*
                Lit hemisphere
            */

            ctx.fillStyle = s.lit;

            ctx.beginPath();
            ctx.arc(
                0,
                0,
                1,
                0,
                Math.PI * 2
            );
            ctx.fill();

            ctx.scale(
                1.005,
                1.005
            );
            /*
                Shadow
            */

            ctx.fillStyle = s.shadow;
            ctx.fill(shadowPath);

            /*
                Outline
            */

            // ctx.lineWidth = 1 / s.r;
            // ctx.strokeStyle = "#000";

            // ctx.beginPath();
            // ctx.arc(
            //     0,
            //     0,
            //     1,
            //     0,
            //     Math.PI*2
            // );

            // ctx.stroke();

            ctx.restore();
        }
    }

    function lerp(start, end, t) {
        return (1 - t) * start + t * end
    }

    let lightX = .1, lightY = -0.1;
    let lightXtarget = lightX, lightYtarget = lightY;
    let time = 0;
    const lerpVal = 0.05;
    function update() {
        requestAnimationFrame(update);
        
        // shadowPath = rebuildShadowPath(
        //     Math.cos(time),
        //     -1,
        //     Math.sin(time)
        // );
        time += 0.004;

        lightX = lerp(lightX, lightXtarget, lerpVal);
        lightY = lerp(lightY, lightYtarget, lerpVal);
        const lightZ = .4 - 2 * Math.hypot(lightX, lightY);
        shadowPath = rebuildShadowPath(
            lightX,
            lightY,
            lightZ
        );


        draw();
    }


    window.addEventListener('pointermove', (event) => {
        // 1. Get the current canvas bounding box position and size
        const rect = canvas.getBoundingClientRect();

        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const relativeX = event.clientX - centerX;
        const relativeY = event.clientY - centerY;
        mouseX = event.clientX;
        mouseY = event.clientY - rect.top;

        lightXtarget = relativeX / 1000;
        lightYtarget = relativeY / 1000;
    });

    update();
});