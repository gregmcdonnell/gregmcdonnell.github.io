
// <div id="echart" style="width: 600px; height: 400px;"></div>
function buildBigEChart() {
  const azRange = 20;
  const tiltRangeHalf = 10;
  const tiltRange = tiltRangeHalf * 2;

  // console.log(hourlyProfile);
  // const hourlySunPositions = hourlyProfile.map((d) =>)

  const formattedData = new Array(azRange * tiltRange);
  let index = 0;
  for (let y = -tiltRangeHalf; y < tiltRangeHalf; y++) {
    for (let x = 0; x < azRange; x++) {
      const value = Math.random() * 100;
      formattedData[index++] = [x, y, value];
    }
  }

  const chart = echarts.init(document.getElementById('echart'), null, {
    renderer: 'canvas'
  });

  const option = {
    animation: false,

    tooltip: {
      show: true // turn off for max performance (or simplify if needed)
    },

    grid: {
      height: '100%',
      width: '100%'
    },

    xAxis: {
      type: 'value',
      // min: 0,
      // max: 300,
      splitLine: { show: false }
    },

    yAxis: {
      type: 'value',
      // min: 0,
      // max: 300,
      splitLine: { show: false }
    },

    visualMap: {
      min: 0,
      max: 100,
      calculable: false, // faster
      realtime: false,
      inRange: {
        color: ['#0000ff', '#00ff00', '#ffff00', '#ff0000']
      }
    },

    series: [{
      type: 'heatmap',
      data: formattedData,

      progressive: 5000,       // 🚀 chunk rendering
      progressiveThreshold: 10000,

      emphasis: {
        disabled: true // 🚀 no hover highlight cost
      },

      silent: false // 🚀 disables mouse events entirely (huge win)
    }]
  };

  chart.setOption(option);
}

function buildEChart() {
  const chart = echarts.init(document.getElementById('echart'));

  const data2D = [
    [10, 20, 30, 40],
    [20, 30, 40, 50],
    [30, 40, 50, 60]
  ];

  // Convert to [x, y, value]
  const formattedData = [];
  for (let y = 0; y < data2D.length; y++) {
    for (let x = 0; x < data2D[y].length; x++) {
      formattedData.push([x, y, data2D[y][x]]);
    }
  }

  const option = {
    tooltip: {
      position: 'top'
    },
    grid: {
      height: '70%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: ['0', '1', '2', '3']
    },
    yAxis: {
      type: 'category',
      data: ['0', '1', '2']
    },
    visualMap: {
      min: 0,
      max: 60,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '5%'
    },
    series: [{
      name: 'Heatmap',
      type: 'heatmap',
      data: formattedData,
      label: {
        show: true
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0,0,0,0.5)'
        }
      }
    }]
  };

  chart.setOption(option);
}
