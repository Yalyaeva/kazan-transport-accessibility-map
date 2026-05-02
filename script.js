const map = L.map('map', {
  center: [55.79, 49.12],
  zoom: 11,
  zoomControl: true,
  fullscreenControl: true,
  fullscreenControlOptions: { position: 'topleft' }
});


const mapContainer = map.getContainer();
['about-widget', 'echpochmak-widget', 'map-footer'].forEach((id) => {
  const el = document.getElementById(id);
  if (el && mapContainer && el.parentElement !== mapContainer) {
    mapContainer.appendChild(el);
  }
});

const baseMap = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20
  }
).addTo(map);

const miniMapLayer = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  { minZoom: 0, maxZoom: 13 }
);

new L.Control.MiniMap(miniMapLayer, {
  toggleDisplay: true,
  minimized: true,
  position: 'bottomright',
  width: 140,
  height: 110,
  zoomLevelOffset: -4
}).addTo(map);

L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

const MousePositionControl = L.Control.extend({
  options: { position: 'bottomleft' },
  onAdd() {
    this._container = L.DomUtil.create('div', 'leaflet-control mouse-position-control');
    this._container.textContent = 'Координаты';
    return this._container;
  },
  update(latlng) {
    if (!this._container) return;
    if (!latlng) {
      this._container.textContent = 'Координаты';
      return;
    }
    this._container.textContent = `Координаты | ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
  }
});

const mousePositionControl = new MousePositionControl();
mousePositionControl.addTo(map);
map.on('mousemove', (e) => mousePositionControl.update(e.latlng));
map.on('mouseout', () => mousePositionControl.update(null));

const panes = {
  residential: 410,
  deficit: 420,
  access: 430,
  grids: 440,
  integrated: 450,
  roads: 460,
  boundary: 470,
  points: 480,
  centroids: 490
};

Object.entries(panes).forEach(([name, zIndex]) => {
  map.createPane(name);
  map.getPane(name).style.zIndex = String(zIndex);
});

const layerRegistry = {};
const overlayMeta = [];

const legendDefinitions = {
  integrated_transport: {
  title: 'Интегральная транспортная обеспеченность',
  rows: [
    ['#D7191C', 'низкая обеспеченность<br><span style="font-size:11px;color:#666;">(обеспечены только велопарковками)</span>'],
    ['#FEC980', 'средняя обеспеченность<br><span style="font-size:11px;color:#666;">(обеспечены только остановками общественного транспорта)</span>'],
    ['#C7E8AD', 'высокая обеспеченность<br><span style="font-size:11px;color:#666;">(обеспечены и велопарковками, и остановками общественного транспорта)</span>']
  ]
},
  public_transport_grid: {
    title: 'Сетка обеспеченности общественным транспортом',
    rows: [
      ['#F7FCF5', '1–2 объекта общественного транспорта'],
['#C9EAC2', '3–4 объекта общественного транспорта'],
['#7BC77C', '5–6 объектов общественного транспорта'],
['#2A924B', '7 и более объектов общественного транспорта']
    ]
  },
  bicycle_parking_grid: {
    title: 'Сетка обеспеченности велопарковками',
    rows: [
      ['#FFF5F0', '1 велопарковка'],
['#FCBEA5', '2–3 велопарковки'],
['#FB7050', '4–5 велопарковок'],
['#D32020', '6 и более велопарковок']
    ]
  },
  public_transport_centroids: {
    title: 'Картодиаграмма обеспеченности общественным транспортом',
    customHtml: `
      <div class="legend-row"><span class="legend-swatch circle" style="width:10px;height:10px;background:rgba(69,126,78,0.45)"></span><span>меньше объектов</span></div>
      <div class="legend-row"><span class="legend-swatch circle" style="width:16px;height:16px;background:rgba(69,126,78,0.45)"></span><span>среднее значение</span></div>
      <div class="legend-row"><span class="legend-swatch circle" style="width:22px;height:22px;background:rgba(69,126,78,0.45)"></span><span>больше объектов</span></div>
      <div class="legend-note-small">Размер круга зависит от числа объектов в ячейке</div>
    `
  },
  bicycle_parking_centroids: {
    title: 'Картодиаграмма обеспеченности велопарковками',
    customHtml: `
      <div class="legend-row"><span class="legend-swatch circle" style="width:10px;height:10px;background:rgba(209,76,29,0.45)"></span><span>меньше объектов</span></div>
      <div class="legend-row"><span class="legend-swatch circle" style="width:16px;height:16px;background:rgba(209,76,29,0.45)"></span><span>среднее значение</span></div>
      <div class="legend-row"><span class="legend-swatch circle" style="width:22px;height:22px;background:rgba(209,76,29,0.45)"></span><span>больше объектов</span></div>
      <div class="legend-note-small">Размер круга зависит от числа объектов в ячейке</div>
    `
  },
  metro_access: {
    title: 'Зона доступности метро',
    rows: [['#E6C16A', 'радиус 700 м']]
  },
  bicycle_access: {
    title: 'Зона доступности велопарковок',
    rows: [['#3D8B45', 'радиус 300 м']]
  },
  surface_transport_access: {
    title: 'Зона доступности наземного транспорта',
    rows: [['#E47C5A', 'радиус 400 м']]
  },
  deficit_residential: {
    title: 'Жилые территории вне зоны доступности общественного транспорта',
    rows: [['#D34449', 'территории с признаками дефицита']]
  }
};

let legendControl;
let legendContainer;

function renderLegendSection(key) {
  const def = legendDefinitions[key];
  if (!def) return '';
  const rowsHtml = def.customHtml || def.rows.map(([color, label]) =>
    `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span>${label}</span></div>`
  ).join('');
  return `<div class="legend-section"><div class="legend-title">${def.title}</div>${rowsHtml}</div>`;
}

function updateLegend() {
  if (!legendContainer) return;
  const order = [
    'integrated_transport',
    'public_transport_grid',
    'bicycle_parking_grid',
    'public_transport_centroids',
    'bicycle_parking_centroids',
    'metro_access',
    'bicycle_access',
    'surface_transport_access',
    'deficit_residential'
  ];

  const active = order.filter((key) => {
    const layer = layerRegistry[key];
    return layer && map.hasLayer(layer) && legendDefinitions[key];
  });

  if (!active.length) {
    legendContainer.classList.add('hidden');
    legendContainer.innerHTML = '';
    return;
  }

  legendContainer.classList.remove('hidden');
  legendContainer.innerHTML = active.map(renderLegendSection).join('');
}

function buildLegendControl() {
  legendControl = L.control({ position: 'bottomright' });
  legendControl.onAdd = function () {
    legendContainer = L.DomUtil.create('div', 'leaflet-control map-legend hidden');
    L.DomEvent.disableClickPropagation(legendContainer);
    L.DomEvent.disableScrollPropagation(legendContainer);
    return legendContainer;
  };
  return legendControl;
}


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function popupFromFeature(feature, extraFields = []) {
  const props = feature?.properties || {};
  if (props.popup_ru) {
    return `<div class="popup-content">${props.popup_ru}</div>`;
  }

  const rows = extraFields
    .filter((field) => props[field] !== undefined && props[field] !== null && props[field] !== '')
    .map((field) => `<p><strong>${escapeHtml(field)}:</strong> ${escapeHtml(props[field])}</p>`)
    .join('');

  return rows ? `<div class="popup-content">${rows}</div>` : null;
}

function radiusFromValue(value, minRadius = 3, factor = 1.8, maxRadius = 34) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return minRadius;
  }
  return Math.min(maxRadius, minRadius + numeric * factor);
}

function iconDataUrl(svg) {
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function buildTransportIcon(type) {
  const defs = {
    tram: {
      color: '#2B5BB7',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <rect x="3" y="5" width="16" height="10" rx="2" fill="#2B5BB7" />
        <rect x="6" y="7" width="4" height="3" fill="#ffffff" opacity="0.95" />
        <rect x="12" y="7" width="4" height="3" fill="#ffffff" opacity="0.95" />
        <path d="M7 16l-1.5 2M15 16l1.5 2M9 16h4" stroke="#2B5BB7" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M8 4l2 1M14 4l-2 1" stroke="#2B5BB7" stroke-width="1.2" stroke-linecap="round"/>
      </svg>`
    },
    bus: {
      color: '#8C5C36',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <rect x="3" y="5" width="16" height="10" rx="2" fill="#8C5C36" />
        <rect x="6" y="7" width="10" height="3" fill="#ffffff" opacity="0.95" />
        <circle cx="7" cy="16" r="1.7" fill="#8C5C36" />
        <circle cx="15" cy="16" r="1.7" fill="#8C5C36" />
      </svg>`
    },
    trolley: {
      color: '#4E9C5B',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <rect x="3" y="6" width="16" height="9" rx="2" fill="#4E9C5B" />
        <rect x="6" y="8" width="10" height="3" fill="#ffffff" opacity="0.95" />
        <path d="M8 5l-1.2-2M14 5l1.2-2" stroke="#4E9C5B" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="7" cy="16" r="1.6" fill="#4E9C5B" />
        <circle cx="15" cy="16" r="1.6" fill="#4E9C5B" />
      </svg>`
    },
    metro: {
      color: '#7A5A3A',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="11" cy="11" r="9" fill="#7A5A3A" />
        <text x="11" y="14" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#ffffff">M</text>
      </svg>`
    },
    bicycle: {
      color: '#BE5A56',
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
        <circle cx="7" cy="15" r="3" fill="none" stroke="#BE5A56" stroke-width="1.5"/>
        <circle cx="15" cy="15" r="3" fill="none" stroke="#BE5A56" stroke-width="1.5"/>
        <path d="M7 15l3-5 2 0 3 5M10 10l2 5M9.5 10H7.7" stroke="#BE5A56" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
    }
  };

  const def = defs[type];
  return L.icon({
    iconUrl: iconDataUrl(def.svg),
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -8]
  });
}

function toggleLayer(key, visible) {
  const layer = layerRegistry[key];
  if (!layer) return;
  if (visible) {
    if (!map.hasLayer(layer)) layer.addTo(map);
  } else if (map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
  updateLegend();
}

function makeGeoJsonLayer(url, options) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Не удалось загрузить ${url}`);
      }
      return response.json();
    })
    .then((data) => {
      const layer = L.geoJSON(data, options);
      layerRegistry[options.layerKey] = layer;
      if (options.defaultVisible) {
        layer.addTo(map);
      }
      return layer;
    });
}

function bindPopupFromFields(feature, layer, fields = []) {
  const html = popupFromFeature(feature, fields);
  if (html) layer.bindPopup(html);
}

function makeClusterLayer(url, options) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Не удалось загрузить ${url}`);
      }
      return response.json();
    })
    .then((data) => {
      const cluster = L.markerClusterGroup({
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 42
      });

      const geo = L.geoJSON(data, {
        pointToLayer: options.pointToLayer,
        onEachFeature: options.onEachFeature
      });

      cluster.addLayer(geo);
      layerRegistry[options.layerKey] = cluster;
      if (options.defaultVisible) {
        cluster.addTo(map);
      }
      return cluster;
    });
}

const layersToLoad = [
  {
    key: 'kazan_boundary',
    label: 'Граница Казани',
    group: 'Основа карты',
    expanded: false,
    defaultVisible: true,
    load: () => makeGeoJsonLayer('data/kazan_boundary.geojson', {
      layerKey: 'kazan_boundary',
      defaultVisible: true,
      pane: 'boundary',
      style: () => ({
        color: '#1f1f1f',
        weight: 1.2,
        fill: false,
        opacity: 0.9
      })
    })
  },
  {
    key: 'main_roads',
    label: 'Магистральные и основные улицы',
    group: 'Основа карты',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/main_roads.geojson', {
      layerKey: 'main_roads',
      defaultVisible: false,
      pane: 'roads',
      style: () => ({
        color: '#8c8c8c',
        weight: 1.0,
        opacity: 0.45
      })
    })
  },
  {
    key: 'residential_area',
    label: 'Жилая территория',
    group: 'Жилые территории',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/residential_area.geojson', {
      layerKey: 'residential_area',
      defaultVisible: false,
      pane: 'residential',
      style: () => ({
        color: '#2d2d2d',
        weight: 0.5,
        fillColor: '#669b74',
        fillOpacity: 0.55,
        opacity: 0.8
      })
    })
  },
  {
    key: 'deficit_residential',
    label: 'Жилые территории вне зоны доступности общественного транспорта',
    group: 'Жилые территории',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/deficit_residential.geojson', {
      layerKey: 'deficit_residential',
      defaultVisible: false,
      pane: 'deficit',
      style: () => ({
        color: '#202020',
        weight: 0.7,
        fillColor: '#D34449',
        fillOpacity: 0.82,
        opacity: 0.9
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['residential', 'area_ha'])
    })
  },
  {
    key: 'metro_access',
    label: 'Зона доступности метро (700 м)',
    group: 'Зоны нормативной доступности',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/metro_access.geojson', {
      layerKey: 'metro_access',
      defaultVisible: false,
      pane: 'access',
      style: () => ({
        stroke: false,
        fillColor: '#E6C16A',
        fillOpacity: 0.42
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'bicycle_access',
    label: 'Зона доступности велопарковок (300 м)',
    group: 'Зоны нормативной доступности',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/bicycle_access.geojson', {
      layerKey: 'bicycle_access',
      defaultVisible: false,
      pane: 'access',
      style: () => ({
        stroke: false,
        fillColor: '#3D8B45',
        fillOpacity: 0.38
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'surface_transport_access',
    label: 'Зона доступности наземного транспорта (400 м)',
    group: 'Зоны нормативной доступности',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/surface_transport_access.geojson', {
      layerKey: 'surface_transport_access',
      defaultVisible: false,
      pane: 'access',
      style: () => ({
        stroke: false,
        fillColor: '#E47C5A',
        fillOpacity: 0.36
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'integrated_transport',
    label: 'Интегральная транспортная обеспеченность',
    group: 'Аналитические слои',
    expanded: true,
    defaultVisible: true,
    load: () => makeGeoJsonLayer('data/integrated_transport.geojson', {
      layerKey: 'integrated_transport',
      defaultVisible: true,
      pane: 'integrated',
      style: (feature) => {
        const score = Number(feature.properties.transport_score);
        const fillColors = {
          1: '#D7191C',
          2: '#FEC980',
          3: '#C7E8AD'
        };
        return {
          color: '#1a1a1a',
          weight: 0.8,
          fillColor: fillColors[score] || '#dddddd',
          fillOpacity: 0.92,
          opacity: 0.95
        };
      },
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['transport_score', 'pt_count', 'bike_count'])
    })
  },
  {
    key: 'public_transport_grid',
    label: 'Сетка обеспеченности общественным транспортом',
    group: 'Аналитические слои',
    expanded: true,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/public_transport_grid.geojson', {
      layerKey: 'public_transport_grid',
      defaultVisible: false,
      pane: 'grids',
      style: (feature) => {
        const cls = Number(feature.properties.pt_class);
        const fillColors = {
          1: '#F7FCF5',
          2: '#C9EAC2',
          3: '#7BC77C',
          4: '#2A924B'
        };
        return {
          color: '#1a1a1a',
          weight: 0.8,
          fillColor: fillColors[cls] || '#f1f1f1',
          fillOpacity: 0.86,
          opacity: 0.95
        };
      },
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['pt_class', 'pt_count'])
    })
  },
  {
    key: 'bicycle_parking_grid',
    label: 'Сетка обеспеченности велопарковками',
    group: 'Аналитические слои',
    expanded: true,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/bicycle_parking_grid.geojson', {
      layerKey: 'bicycle_parking_grid',
      defaultVisible: false,
      pane: 'grids',
      style: (feature) => {
        const cls = Number(feature.properties.bike_class);
        const fillColors = {
          1: '#FFF5F0',
          2: '#FCBEA5',
          3: '#FB7050',
          4: '#D32020'
        };
        return {
          color: '#1a1a1a',
          weight: 0.8,
          fillColor: fillColors[cls] || '#f1f1f1',
          fillOpacity: 0.86,
          opacity: 0.95
        };
      },
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['bike_class', 'bike_count'])
    })
  },
  {
    key: 'public_transport_centroids',
    label: 'Картодиаграмма обеспеченности общественным транспортом',
    group: 'Аналитические слои',
    expanded: true,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/public_transport_centroids.geojson', {
      layerKey: 'public_transport_centroids',
      defaultVisible: false,
      pane: 'centroids',
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: radiusFromValue(feature.properties.pt_count, 3, 1.5, 38),
        color: '#1a1a1a',
        weight: 0.8,
        fillColor: '#457E4E',
        fillOpacity: 0.38,
        opacity: 0.8
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['pt_count', 'pt_class'])
    })
  },
  {
    key: 'bicycle_parking_centroids',
    label: 'Картодиаграмма обеспеченности велопарковками',
    group: 'Аналитические слои',
    expanded: true,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/bicycle_parking_centroids.geojson', {
      layerKey: 'bicycle_parking_centroids',
      defaultVisible: false,
      pane: 'centroids',
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: radiusFromValue(feature.properties.bike_count, 3, 2.1, 42),
        color: '#1a1a1a',
        weight: 0.8,
        fillColor: '#D14C1D',
        fillOpacity: 0.42,
        opacity: 0.85
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['bike_count', 'bike_class'])
    })
  },
  {
    key: 'tram_stops',
    label: 'Трамвайные остановки',
    group: 'Точечные объекты инфраструктуры',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/tram_stops.geojson', {
      layerKey: 'tram_stops',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.marker(latlng, { icon: buildTransportIcon('tram') }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'bicycle_parking',
    label: 'Велопарковки',
    group: 'Точечные объекты инфраструктуры',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/bicycle_parking.geojson', {
      layerKey: 'bicycle_parking',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.marker(latlng, { icon: buildTransportIcon('bicycle') }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'metro_entrances',
    label: 'Входы в метро',
    group: 'Точечные объекты инфраструктуры',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/metro_entrances.geojson', {
      layerKey: 'metro_entrances',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.marker(latlng, { icon: buildTransportIcon('metro') }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer, ['name'])
    })
  },
  {
    key: 'trolleybus_stops',
    label: 'Троллейбусные остановки',
    group: 'Точечные объекты инфраструктуры',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/trolleybus_stops.geojson', {
      layerKey: 'trolleybus_stops',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.marker(latlng, { icon: buildTransportIcon('trolley') }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'bus_stops',
    label: 'Автобусные остановки',
    group: 'Точечные объекты инфраструктуры',
    expanded: false,
    defaultVisible: false,
    load: () => makeGeoJsonLayer('data/bus_stops.geojson', {
      layerKey: 'bus_stops',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.marker(latlng, { icon: buildTransportIcon('bus') }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'bicycle_parking_clusters',
    label: 'Кластеры велопарковок',
    group: 'Кластеры',
    expanded: false,
    defaultVisible: false,
    load: () => makeClusterLayer('data/bicycle_parking_clusters.geojson', {
      layerKey: 'bicycle_parking_clusters',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.circleMarker(latlng, {
        radius: 4,
        color: '#202020',
        weight: 0.8,
        fillColor: '#D35B64',
        fillOpacity: 0.75
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  },
  {
    key: 'public_transport_clusters',
    label: 'Кластеры объектов общественного транспорта',
    group: 'Кластеры',
    expanded: false,
    defaultVisible: false,
    load: () => makeClusterLayer('data/public_transport_clusters.geojson', {
      layerKey: 'public_transport_clusters',
      defaultVisible: false,
      pane: 'points',
      pointToLayer: (_, latlng) => L.circleMarker(latlng, {
        radius: 4,
        color: '#202020',
        weight: 0.8,
        fillColor: '#2E7F48',
        fillOpacity: 0.8
      }),
      onEachFeature: (feature, layer) => bindPopupFromFields(feature, layer)
    })
  }
];

function buildGroupedControl(items) {
  const control = L.control({ position: 'topright' });

  control.onAdd = function () {
    const container = L.DomUtil.create('div', 'leaflet-control custom-layer-tree');
    container.innerHTML = '<h3>Слои карты</h3>';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const groups = {};
    for (const item of items) {
      if (!groups[item.group]) {
        groups[item.group] = { expanded: item.expanded, items: [] };
      }
      groups[item.group].items.push(item);
      if (item.expanded) groups[item.group].expanded = true;
    }

    Object.entries(groups).forEach(([groupName, groupData]) => {
      const groupWrap = L.DomUtil.create('div', 'layer-group', container);
      const title = L.DomUtil.create('div', 'layer-group-title', groupWrap);
      const titleText = L.DomUtil.create('span', '', title);
      titleText.textContent = groupName;
      const caret = L.DomUtil.create('span', 'caret', title);
      caret.textContent = groupData.expanded ? '▾' : '▸';

      const content = L.DomUtil.create('div', 'layer-group-content', groupWrap);
      content.style.display = groupData.expanded ? 'block' : 'none';

      title.addEventListener('click', () => {
        const open = content.style.display !== 'none';
        content.style.display = open ? 'none' : 'block';
        caret.textContent = open ? '▸' : '▾';
      });

      groupData.items.forEach((item) => {
        const row = L.DomUtil.create('label', 'layer-item', content);
        const checkbox = L.DomUtil.create('input', '', row);
        checkbox.type = 'checkbox';
        checkbox.checked = !!item.defaultVisible;
        checkbox.dataset.layerKey = item.key;

        const text = L.DomUtil.create('span', '', row);
        text.textContent = item.label;

        checkbox.addEventListener('change', (event) => {
          toggleLayer(item.key, event.target.checked);
        });
      });
    });

    const note = L.DomUtil.create('div', 'legend-note', container);
    note.textContent = 'По умолчанию включены только подложка, граница Казани и интегральная транспортная обеспеченность.';

    return container;
  };

  return control;
}

Promise.allSettled(layersToLoad.map((item) => item.load().then(() => overlayMeta.push(item))))
  .then((results) => {
    const failed = results.filter((result) => result.status === 'rejected');

    buildGroupedControl(overlayMeta).addTo(map);
    buildLegendControl().addTo(map);
    updateLegend();

    const boundsLayers = ['kazan_boundary', 'integrated_transport']
      .map((key) => layerRegistry[key])
      .filter(Boolean);

    if (boundsLayers.length) {
      const group = L.featureGroup(boundsLayers);
      map.fitBounds(group.getBounds().pad(0.03));
    }

    if (failed.length) {
      console.error('Не все слои загрузились:', failed);
      alert('Часть GeoJSON не загрузилась. Но карта открыта. Проверь имена файлов в папке data и обнови страницу.');
    }
  })
  .catch((error) => {
    console.error(error);
    alert('Ошибка загрузки карты. Проверь, что папка data лежит рядом с index.html.');
  });



const echpochmakFacts = [
  "В Казани работают 4 вида городского транспорта: автобусы, трамваи, троллейбусы и метро",
  "В городе действует 54 автобусных маршрута, на которых работает более 600 автобусов",
  "Казанское метро открылось 27 августа 2005 года к 1000-летию города",
  "В казанском метро сейчас одна линия и 11 станций",
  "Метро Казани работает с 6:00 до 24:00",
  "Самый длинный трамвайный маршрут Казани №5/5а имеет длину 34 км",
  "В Казани действует 9 трамвайных и 11 троллейбусных маршрутов",
  "Протяженность автобусных маршрутов Казани составляет более 1,2 тыс. км"
];

const aboutToggle = document.getElementById('about-toggle');
const aboutPanel = document.getElementById('about-panel');
const aboutClose = document.getElementById('about-close');

if (aboutToggle && aboutPanel && aboutClose) {
  aboutToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    aboutPanel.classList.toggle('hidden');
  });

  aboutClose.addEventListener('click', () => {
    aboutPanel.classList.add('hidden');
  });
}

const echpochmakBtn = document.getElementById('echpochmak-btn');
const echpochmakPopup = document.getElementById('echpochmak-popup');
const echpochmakText = document.getElementById('echpochmak-text');
const echpochmakClose = document.getElementById('echpochmak-close');

if (echpochmakBtn && echpochmakPopup && echpochmakText && echpochmakClose) {
  echpochmakBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const randomFact = echpochmakFacts[Math.floor(Math.random() * echpochmakFacts.length)];
    echpochmakText.textContent = randomFact;
    echpochmakPopup.classList.remove('hidden');
  });

  echpochmakClose.addEventListener('click', () => {
    echpochmakPopup.classList.add('hidden');
  });
}

