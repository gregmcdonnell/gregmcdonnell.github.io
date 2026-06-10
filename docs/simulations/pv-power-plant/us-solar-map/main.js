
import { initHeatmap, updateHeatmap } from "./mapUS.js";


const map = L.map('map', {
    // zoomSnap: 0.5,
    // zoomDelta: 0.1,
    // wheelPxPerZoomLevel: 300,
}).setView([40, -96], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 11,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// L.latlngGraticule({
//   showLabel: true,
//   opacity: 0.5,
//   weight: 1,
//   color: '#333'
// }).addTo(map);


await initHeatmap(map);


const radiusEl = document.getElementById("radius");
const maxEl = document.getElementById("max");

const radiusVal = document.getElementById("val-radius");
const maxVal = document.getElementById("val-max");

initMapInteraction();

function initMapInteraction() {
    const wrapper = document.getElementById("map-wrapper");
    // const svg = document.getElementById("svg-us-container");
    const heatmapEl = document.getElementById("heatmap-us");
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 10;
    let zoom0 = 1;
    let panX0 = 0;
    let panY0 = 0;

    // svg.style.transformOrigin = "0 0";
    heatmapEl.style.transformOrigin = "0 0";
    wrapper.style.cursor = "grab";
    wrapper.style.userSelect = "none";

    // Capture natural offset once (before any transforms are applied)
    const r0 = wrapper.getBoundingClientRect();
    const origX = r0.left;
    const origY = r0.top;

    initSlider(radiusEl, radiusVal, 10);
    initSlider(maxEl, maxVal, 80);

    scaledUpdate();
    

    // function applySVGTransform() {
    //     svg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    // }
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
        zoom = map.getZoom() * 0.2;
        updateHeatmap(map, radiusEl.value * Math.sqrt(zoom), maxEl.value / zoom);
    }
    
    function resetHeatmap() {
        // heatmapEl.style.transform = `translate(${0}px, ${0}px) scale(${1})`;
        heatmapEl.style.visibility = "visible"
        scaledUpdate();
    }


    const throttledSlowUpdate = throttle(resetHeatmap, 400);


    map.on('move', () => {
        const center = map.getCenter();

        // applyHeatmapTranslation();
        // throttledSlowUpdate();
        resetHeatmap();
    });

    map.on('moveend', () => {
        resetHeatmap();
    });

    map.on('zoomstart', () => {
        heatmapEl.style.visibility = "hidden"
    });
    
    map.on('zoomend', () => {
        // console.log(map.getZoom());
        // heatmapEl.style.visibility = "visible"
    });


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