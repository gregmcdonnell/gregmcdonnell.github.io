const csvData = {}
let heatmap = null;

export async function initHeatmap(map) {
    // const svg = await loadSVG("svg-us-container","/simulations/pv-power-plant/us-solar-map/Blank_US_Map_(states_only).svg");

    // const vb = svg.viewBox.baseVal;

    const w = 2000;
    const h = 800;
    // const h = w * vb.height / vb.width;
    
    const wrapper = document.getElementById("map-wrapper");
    wrapper.style.width = `${w}px`;
    wrapper.style.height = `${h}px`;

    const el = document.getElementById("heatmap-us");
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    heatmap = window.h337.create({
        container: el,
        radius: 3
    });

    csvData.raw = await getCSVData("/simulations/pv-power-plant/data/uspvdb_v4_0_20260414_lite.csv", map);

    const scale = 1 / (10000);
    csvData.scale = scale;
    csvData.width = w;
    csvData.max = 10;

    csvData.heatmapData = csvData.raw.map((r) => ({ x: r.x * scale + w, y: (-r.y * scale + w), value: r.mW, radius: 3 })); 

    heatmap.setData({
        max: 10,
        // data: [{ x: 10, y: 15, value: 5}, { x: w/2, y: h/2, value: 2}, { x: w, y: h, value: 6}]
        data: csvData.heatmapData
    });
}

async function loadSVG(container, svgPath) {
    const svgContainer = document.getElementById(container);
    const res = await fetch(svgPath);
    svgContainer.innerHTML = await res.text();
    return svgContainer.querySelector("svg");
}

async function getCSVData(csvPath, map) {
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error(`Failed to load USPVDB data: ${response.status} ${response.statusText}`);
    const text = await response.text();
    const lines = text.split('\n'); // Split into rows

    const headers = lines[0].split(",").map(h => h.trim());
    const data = new Array(lines.length - 1);

    // const albersUSA = "+proj=aea +lat_1=20 +lat_2=60 +lat_0=40 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +datum=WGS84 +units=m +no_defs"
    const lambertUSA = "+proj=lcc +lat_1=20 +lat_2=60 +lat_0=40 +lon_0=-96 +x_0=0 +y_0=0 +ellps=GRS80 +datum=NAD83 +units=m +no_defs"

    // const initScale = 3000;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const lat = +cols[0];
        const lon = +cols[1];
        const area = cols[2];
        const mW = cols[3];
        const [x, y] = window.proj4("EPSG:4326", "EPSG:3857", [lon + 96, lat - 40]);
        const p = map.latLngToLayerPoint([lat, lon]);
        // const [x, y] = [(lon + 96) * initScale, (lat - 40) * initScale]
        data[i - 1] = { lat, lon, x: p.x, y: p.y, mW: mW, area: area }; 
    }
    return data;
}

function resizeData(map, radius) {
    const raw = csvData.raw;
    const rawLength = csvData.raw.length;
    const heatmapData = csvData.heatmapData;
    const boundsX = [0, csvData.width];
    const boundsY = [0, csvData.width];
    let dataLen = 0;
    for (let i = 0; i < rawLength; i++) {
        const r = raw[i];
        const p = map.latLngToContainerPoint([r.lat, r.lon]);
        const scaledX = p.x;
        const scaledY = p.y;
        if (scaledX >= boundsX[0] && scaledX <= boundsX[1] && scaledY >= boundsY[0] && scaledY <= boundsY[1]) {
            heatmapData[dataLen].x = scaledX;
            heatmapData[dataLen].y = scaledY;
            heatmapData[dataLen].value = r.mW;
            heatmapData[dataLen].radius = Math.min(radius, 40);
            dataLen++;
        }
    }
    return dataLen;
}


export function updateHeatmap(map, radius, max = 0) {
    const dataLen = resizeData(map, radius);

    if (max > 0) csvData.max = max;
    heatmap.updateData({
        max: csvData.max,
        data: csvData.heatmapData,
        length: dataLen
    });
}
