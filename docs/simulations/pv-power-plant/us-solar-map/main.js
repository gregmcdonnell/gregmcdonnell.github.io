
import { initHeatmap, updateHeatmap } from "./mapUS.js";

const size = 1500;
await initHeatmap(size);


const scaleEl = document.getElementById("scale");
const xEl = document.getElementById("x-offset");
const yEl = document.getElementById("y-offset");
const radiusEl = document.getElementById("radius");
const maxEl = document.getElementById("max");

const scaleVal = document.getElementById("val-scale");
const xVal = document.getElementById("val-x-offset");
const yVal = document.getElementById("val-y-offset");
const radiusVal = document.getElementById("val-radius");
const maxVal = document.getElementById("val-max");

initMapInteraction();



function initMapInteraction() {
    const wrapper = document.getElementById("map-wrapper");
    const svg = document.getElementById("svg-us-container");
    const heatmapEl = document.getElementById("heatmap-us");
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 10;
    let zoom0 = 1;
    let panX0 = 0;
    let panY0 = 0;

    svg.style.transformOrigin = "0 0";
    heatmapEl.style.transformOrigin = "0 0";
    wrapper.style.cursor = "grab";
    wrapper.style.userSelect = "none";

    // Capture natural offset once (before any transforms are applied)
    const r0 = wrapper.getBoundingClientRect();
    const origX = r0.left;
    const origY = r0.top;

    initSlider(scaleEl, scaleVal, 2.17);
    initSlider(yEl, yVal, 0.276);
    initSlider(xEl, xVal, 0.5);
    initSlider(radiusEl, radiusVal, 8);
    initSlider(maxEl, maxVal, 100);

    scaledUpdate();
    

    function applySVGTransform() {
        svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    }
    function applyHeatmapTranslation() {
        heatmapEl.style.transform = `translate(${panX - panX0}px, ${panY - panY0}px) scale(${1})`;
    }


    function initSlider(sliderEl, textEl, startVal) {
        sliderEl.value = startVal;
        textEl.textContent = startVal;
        const throttledSlowUpdate = throttle(scaledUpdate, 70);
        sliderEl.addEventListener("input", e => {
            const v = +e.target.value;
            textEl.textContent = v;
            throttledSlowUpdate();
        });
        sliderEl.addEventListener("change", e => {
            const v = +e.target.value;
            textEl.textContent = v;
            scaledUpdate()
        });
    }

    function scaledUpdate() {
        updateHeatmap(+scaleEl.value * zoom, +xEl.value, +yEl.value, radiusEl.value * Math.sqrt(zoom), maxEl.value / zoom, panX + (zoom - 1) * +xEl.value * size, panY + (zoom - 1) * +yEl.value * size);
    }
    function resetHeatmap() {
        // zoom0 = zoom;
        panX0 = panX;
        panY0 = panY;
        heatmapEl.style.transform = `translate(${0}px, ${0}px) scale(${1})`;
        scaledUpdate();
    }

    wrapper.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));

        // Local content coord under cursor, held fixed across zoom
        const lx = (e.clientX - origX - panX) / zoom;
        const ly = (e.clientY - origY - panY) / zoom;

        zoom = newZoom;
        panX = e.clientX - origX - lx * zoom;
        panY = e.clientY - origY - ly * zoom;

        applySVGTransform();
        resetHeatmap();
    }, { passive: false });

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let panStartX = 0;
    let panStartY = 0;

    wrapper.addEventListener("mousedown", (e) => {
        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        panStartX = panX;
        panStartY = panY;
        wrapper.style.cursor = "grabbing";
    });

    const throttledSlowUpdate = throttle(resetHeatmap, 100);
    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        panX = panStartX + (e.clientX - dragStartX);
        panY = panStartY + (e.clientY - dragStartY);
        applySVGTransform();
        applyHeatmapTranslation();
        throttledSlowUpdate();
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        wrapper.style.cursor = "grab";
        resetHeatmap();
        // updateHeatmap(+scaleEl.value * zoom, +xEl.value, +yEl.value, radiusEl.value, maxEl.value, panX + (zoom - 1) * 500, panY + (zoom - 1) * 280);
    });
    // window.addEventListener("keyup", (e) => {
    //     if (e.key == " ") {
    //       resetTransform();
    //     }
    // });
}

function throttle(fn, delay) {
  let lastCall = 0;

  return function (...args) {
    const now = performance.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}