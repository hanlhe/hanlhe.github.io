// The archive is already readable as HTML. This adds filtering and route maps.
(() => {
  const cards = [...document.querySelectorAll(".race-card")];
  const filters = [...document.querySelectorAll(".filter-button")];
  const detail = document.querySelector(".race-detail");
  const mapElement = document.getElementById("race-map");
  const mapMessage = document.getElementById("map-message");
  const mapViewControls = document.getElementById("map-view-controls");
  const mapViewToggle = document.getElementById("map-view-toggle");
  const rotateControls = document.getElementById("map-rotate-controls");
  const rotateLeft = document.getElementById("map-rotate-left");
  const rotateRight = document.getElementById("map-rotate-right");
  if (
    !cards.length ||
    !detail ||
    !mapElement ||
    !mapMessage ||
    !mapViewControls ||
    !mapViewToggle ||
    !rotateControls ||
    !rotateLeft ||
    !rotateRight
  )
    return;
  const routeData = JSON.parse(
    document.getElementById("race-route-data")?.textContent || "{}"
  );

  document.documentElement.classList.add("js");
  const detailName = document.getElementById("detail-name");
  const detailIcon = document.getElementById("detail-icon");
  const detailDate = document.getElementById("detail-date");
  const detailTime = document.getElementById("detail-time");
  const elevationPanel = document.getElementById("elevation-panel");
  const elevationPlot = document.getElementById("elevation-plot");
  const elevationRange = document.getElementById("elevation-range");
  const elevationDistance = document.getElementById("elevation-distance");
  const elevationArea = document.getElementById("elevation-area");
  const elevationLine = document.getElementById("elevation-line");
  const elevationCursor = document.getElementById("elevation-cursor");
  const elevationDot = document.getElementById("elevation-dot");
  const elevationTooltip = document.getElementById("elevation-tooltip");
  let selectedCard;
  let map;
  let mapboxPromise;
  let mapStyleReady = false;
  let selectedRoute;
  let currentProfile;
  let profileMarker;
  let routeAnimation;
  let currentStyle;
  let streetDetail = false;
  let pendingCamera = "overview";
  let selectionVersion = 0;
  const mapboxVersion = "v3.32.0";

  function setLink(id, href) {
    const link = document.getElementById(id);
    link.hidden = !href;
    if (href) link.href = href;
    else link.removeAttribute("href");
  }

  function showMessage(message) {
    mapElement.hidden = true;
    mapMessage.hidden = false;
    mapMessage.textContent = message;
    mapViewControls.hidden = true;
  }

  function mapStyle() {
    return streetDetail
      ? "mapbox://styles/mapbox/standard"
      : document.getElementById("theme-light").checked
        ? "mapbox://styles/mapbox/light-v11"
        : "mapbox://styles/mapbox/dark-v11";
  }

  function lightPreset() {
    return document.getElementById("theme-light").checked ? "day" : "night";
  }

  function updateMapViewToggle() {
    mapViewToggle.textContent = streetDetail ? "Full route" : "3D streets";
    mapViewToggle.title = streetDetail
      ? "Return to the full race route"
      : "Zoom in to explore available 3D street details";
    rotateControls.hidden = !streetDetail;
  }

  function setMapStyle(style) {
    if (!map || style === currentStyle) return;
    currentStyle = style;
    mapStyleReady = false;
    mapViewToggle.disabled = true;
    rotateLeft.disabled = true;
    rotateRight.disabled = true;
    map.setStyle(style);
  }

  function loadMapbox() {
    if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
    if (mapboxPromise) return mapboxPromise;

    if (!document.getElementById("mapbox-css")) {
      const css = document.createElement("link");
      css.id = "mapbox-css";
      css.rel = "stylesheet";
      css.href = `https://api.mapbox.com/mapbox-gl-js/${mapboxVersion}/mapbox-gl.css`;
      document.head.append(css);
    }

    mapboxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://api.mapbox.com/mapbox-gl-js/${mapboxVersion}/mapbox-gl.js`;
      script.onload = () =>
        window.mapboxgl
          ? resolve(window.mapboxgl)
          : reject(new Error("Mapbox library unavailable"));
      script.onerror = () => reject(new Error("Mapbox library unavailable"));
      document.head.append(script);
    }).catch((error) => {
      mapboxPromise = undefined;
      throw error;
    });
    return mapboxPromise;
  }

  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lon = 0;
    function nextNumber() {
      let value = 0;
      let shift = 0;
      let byte;
      do {
        if (index >= encoded.length) throw new Error("Invalid route data");
        byte = encoded.charCodeAt(index++) - 63;
        value |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return value & 1 ? ~(value >> 1) : value >> 1;
    }
    while (index < encoded.length) {
      lat += nextNumber();
      lon += nextNumber();
      points.push([lat / 1e5, lon / 1e5]);
    }
    return points;
  }

  function metersBetween(first, second) {
    const latitude = ((first[1] + second[1]) * Math.PI) / 360;
    const east = (second[0] - first[0]) * 111320 * Math.cos(latitude);
    const north = (second[1] - first[1]) * 111320;
    return Math.hypot(east, north);
  }

  function routeLength(segments) {
    let length = 0;
    for (const segment of segments) {
      for (let index = 1; index < segment.length; index += 1) {
        length += metersBetween(segment[index - 1], segment[index]);
      }
    }
    return length;
  }

  function routeAtProgress(route, progress) {
    let remaining = route.length * progress;
    const visible = [];
    for (const segment of route.coordinates) {
      const shown = [segment[0]];
      for (let index = 1; index < segment.length; index += 1) {
        const first = segment[index - 1];
        const second = segment[index];
        const distance = metersBetween(first, second);
        if (remaining >= distance) {
          shown.push(second);
          remaining -= distance;
        } else {
          const fraction = distance ? remaining / distance : 0;
          shown.push([
            first[0] + (second[0] - first[0]) * fraction,
            first[1] + (second[1] - first[1]) * fraction,
          ]);
          remaining = 0;
          break;
        }
      }
      visible.push(shown);
      if (remaining <= 0) break;
    }
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: visible },
    };
  }

  function cancelRouteAnimation() {
    if (routeAnimation !== undefined) {
      cancelAnimationFrame(routeAnimation);
      routeAnimation = undefined;
    }
  }

  function startRouteAnimation(route) {
    const source = map.getSource("selected-route");
    let started;
    let previousFrame = 0;
    function frame(timestamp) {
      if (route !== selectedRoute || !mapStyleReady) return;
      if (started === undefined) started = timestamp;
      const progress = Math.min(1, (timestamp - started) / 3200);
      if (progress === 1 || timestamp - previousFrame >= 30) {
        source.setData(
          progress === 1 ? route.data : routeAtProgress(route, progress)
        );
        previousFrame = timestamp;
      }
      if (progress < 1) routeAnimation = requestAnimationFrame(frame);
      else routeAnimation = undefined;
    }
    routeAnimation = requestAnimationFrame(frame);
  }

  function clearElevationHover() {
    elevationCursor.setAttribute("hidden", "");
    elevationDot.setAttribute("hidden", "");
    elevationTooltip.hidden = true;
    profileMarker?.remove();
  }

  function renderElevation(samples) {
    clearElevationHover();
    if (!samples || samples.length < 2) {
      currentProfile = undefined;
      elevationPanel.hidden = true;
      return;
    }

    const total = Math.max(samples[samples.length - 1][0], 1);
    const heights = samples.map((point) => point[1]);
    const lowest = Math.min(...heights);
    const highest = Math.max(...heights);
    const padding = Math.max(4, (highest - lowest) * 0.12);
    const floor = lowest - padding;
    const range = highest - lowest + 2 * padding;
    const xFor = (point) => 8 + (point[0] / total) * 584;
    const yFor = (point) => 140 - ((point[1] - floor) / range) * 132;
    const line = samples
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${xFor(point).toFixed(1)},${yFor(point).toFixed(1)}`
      )
      .join(" ");

    elevationLine.setAttribute("d", line);
    elevationArea.setAttribute(
      "d",
      `${line} L${xFor(samples[samples.length - 1]).toFixed(1)},140 L8,140 Z`
    );
    elevationRange.textContent = `${Math.round(lowest)}–${Math.round(highest)} m`;
    elevationDistance.textContent = `${(total / 1000).toFixed(1)} km`;
    elevationPlot.setAttribute("aria-valuemax", String(Math.round(total)));
    elevationPlot.setAttribute("aria-valuenow", "0");
    elevationPlot.setAttribute("aria-valuetext", "Start of route");
    elevationPanel.hidden = false;
    currentProfile = { samples, total, xFor, yFor };
  }

  function nearestElevationPoint(distance) {
    const samples = currentProfile.samples;
    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle][0] < distance) low = middle + 1;
      else high = middle;
    }
    return low > 0 &&
      Math.abs(samples[low - 1][0] - distance) <
        Math.abs(samples[low][0] - distance)
      ? low - 1
      : low;
  }

  function showElevationPoint(index) {
    if (!currentProfile) return;
    const point = currentProfile.samples[index];
    const x = currentProfile.xFor(point);
    const y = currentProfile.yFor(point);
    const text = `${(point[0] / 1000).toFixed(1)} km · ${point[1]} m`;
    elevationCursor.setAttribute("x1", x);
    elevationCursor.setAttribute("x2", x);
    elevationCursor.removeAttribute("hidden");
    elevationDot.setAttribute("cx", x);
    elevationDot.setAttribute("cy", y);
    elevationDot.removeAttribute("hidden");
    elevationTooltip.textContent = text;
    elevationTooltip.style.left = `${Math.max(12, Math.min(88, (x / 600) * 100))}%`;
    elevationTooltip.hidden = false;
    elevationPlot.dataset.index = String(index);
    elevationPlot.setAttribute("aria-valuenow", String(point[0]));
    elevationPlot.setAttribute("aria-valuetext", text);

    if (map && mapStyleReady) {
      if (!profileMarker) {
        const element = document.createElement("span");
        element.className = "elevation-map-point";
        element.setAttribute("aria-hidden", "true");
        profileMarker = new window.mapboxgl.Marker({
          element,
          anchor: "center",
        });
      }
      profileMarker.setLngLat([point[3] / 1e5, point[2] / 1e5]).addTo(map);
    }
  }

  function renderRoute(mapboxgl) {
    if (!map || !mapStyleReady || !selectedRoute) return;
    const animate =
      selectedRoute.animate &&
      selectedRoute.length > 0 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches;
    selectedRoute.animate = false;
    const route = animate
      ? routeAtProgress(selectedRoute, 0)
      : selectedRoute.data;
    const source = map.getSource("selected-route");
    if (source) {
      source.setData(route);
    } else {
      map.addSource("selected-route", {
        type: "geojson",
        data: route,
      });
    }
    if (!map.getLayer("route-outline")) {
      map.addLayer({
        id: "route-outline",
        type: "line",
        source: "selected-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#1b1429",
          "line-width": 7,
          "line-opacity": 0.8,
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "selected-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#f97316",
          "line-width": 3.5,
          "line-opacity": 0.95,
          ...(streetDetail ? { "line-emissive-strength": 1 } : {}),
        },
      });
    }

    map.resize();
    const camera = pendingCamera;
    pendingCamera = null;
    if (camera === "street") {
      map.easeTo({
        center: selectedRoute.start,
        zoom: 16.5,
        pitch: 60,
        bearing: 0,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 950,
      });
    } else if (camera === "overview") {
      const bounds = new mapboxgl.LngLatBounds();
      for (const segment of selectedRoute.coordinates) {
        for (const point of segment) bounds.extend(point);
      }
      map.fitBounds(bounds, {
        padding: 46,
        maxZoom: 14,
        pitch: 0,
        bearing: 0,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 450,
      });
    }
    if (animate) startRouteAnimation(selectedRoute);
  }

  async function showRoute(url, version) {
    try {
      const route = routeData[url];
      if (!route?.lines?.length) throw new Error("Missing route data");
      const token = String(window.RACE_MAPBOX_TOKEN || "").trim();
      if (!token.startsWith("pk.")) throw new Error("Missing Mapbox token");

      const coordinates = route.lines.map((segment) =>
        decodePolyline(segment).map(([lat, lon]) => [lon, lat])
      );
      selectedRoute = {
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "MultiLineString", coordinates },
        },
        coordinates,
        start: coordinates[0][0],
        length: routeLength(coordinates),
        animate: true,
      };
      renderElevation(route.profile);

      if (!map) showMessage("Loading Mapbox map…");
      const mapboxgl = await loadMapbox();
      if (version !== selectionVersion) return;
      if (!mapboxgl.supported()) throw new Error("WebGL unavailable");
      mapboxgl.accessToken = token;
      mapElement.hidden = false;
      mapMessage.hidden = true;
      mapViewControls.hidden = false;

      if (!map) {
        currentStyle = mapStyle();
        map = new mapboxgl.Map({
          container: mapElement,
          style: currentStyle,
          center: selectedRoute.start,
          zoom: 11,
        });
        map.addControl(
          {
            onAdd: () => mapViewControls,
            onRemove: () => mapViewControls.remove(),
          },
          "top-left"
        );
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.addControl(new mapboxgl.FullscreenControl(), "top-right");
        map.on("style.load", () => {
          if (streetDetail) {
            try {
              map.setConfigProperty("basemap", "lightPreset", lightPreset());
              map.setConfigProperty("basemap", "showHdRoads", true);
              map.setConfigProperty("basemap", "show3dObjects", true);
            } catch (error) {
              console.error("Mapbox street detail error:", error);
              streetDetail = false;
              pendingCamera = "overview";
              updateMapViewToggle();
              setMapStyle(mapStyle());
              return;
            }
          }
          mapStyleReady = true;
          mapViewToggle.disabled = false;
          rotateLeft.disabled = false;
          rotateRight.disabled = false;
          if (!selectedRoute) return;
          mapElement.hidden = false;
          mapMessage.hidden = true;
          mapViewControls.hidden = false;
          renderRoute(mapboxgl);
        });
        map.on("error", (event) => {
          console.error("Mapbox map error:", event.error);
          if (streetDetail && !mapStyleReady) {
            streetDetail = false;
            pendingCamera = "overview";
            updateMapViewToggle();
            setMapStyle(mapStyle());
            return;
          }
          if ([401, 403].includes(Number(event.error?.status))) {
            showMessage(
              "Mapbox denied this map request. Check the token and its allowed URLs."
            );
          } else if (!mapStyleReady) {
            showMessage(
              "Mapbox could not load its map style. Check the public access token."
            );
          }
        });
      } else {
        renderRoute(mapboxgl);
      }
    } catch (error) {
      if (version === selectionVersion) {
        const message =
          error.message === "Missing Mapbox token"
            ? "Mapbox map is not configured yet."
            : error.message === "Missing route data"
              ? "Route data is missing. Rebuild the page after adding GPX files."
              : error.message === "WebGL unavailable"
                ? "This browser cannot display the Mapbox map."
                : error.message === "Mapbox library unavailable"
                  ? "Mapbox map library could not load. Check your internet connection."
                  : "This route map could not be displayed.";
        showMessage(message);
        console.error("Race route error:", error);
      }
    }
  }

  function selectRace(card, scrollToDetail = false, updateHash = false) {
    if (!card) return;
    cancelRouteAnimation();
    clearElevationHover();
    const leaveStreetView = streetDetail && card !== selectedCard;
    if (leaveStreetView) {
      streetDetail = false;
      updateMapViewToggle();
    }
    pendingCamera = streetDetail ? "street" : "overview";
    selectedRoute = undefined;
    if (leaveStreetView) setMapStyle(mapStyle());
    const button = card.querySelector(".race-select");
    const race = button.dataset;
    selectionVersion += 1;

    selectedCard
      ?.querySelector(".race-select")
      .setAttribute("aria-pressed", "false");
    selectedCard = card;
    button.setAttribute("aria-pressed", "true");
    detailName.textContent = race.name;
    detailIcon.textContent = race.emoji;
    detailIcon.hidden = !race.emoji;
    detailDate.textContent = new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${race.date}T12:00:00Z`));
    detailTime.textContent = race.time;
    setLink("detail-result", race.result);
    setLink("detail-race", race.raceUrl);

    if (race.route) showRoute(race.route, selectionVersion);
    else {
      renderElevation([]);
      showMessage("Route map not available for this race yet.");
    }

    if (updateHash) history.replaceState(null, "", `#${card.id}`);
    if (scrollToDetail && matchMedia("(max-width: 900px)").matches) {
      detail.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }

  document.querySelector(".race-list").addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest("a")) return;
    const card = target.closest(".race-card");
    if (card) selectRace(card, true, true);
  });

  document.querySelector(".race-filters").addEventListener("click", (event) => {
    const button = event.target.closest(".filter-button");
    if (!button) return;
    for (const filter of filters) {
      filter.setAttribute("aria-pressed", String(filter === button));
    }
    for (const card of cards) {
      card.hidden =
        button.dataset.filter !== "all" &&
        card.dataset.category !== button.dataset.filter;
    }
    if (selectedCard?.hidden) {
      selectRace(
        cards.find((card) => !card.hidden),
        false,
        true
      );
    }
  });

  function inspectElevationAtPointer(event) {
    if (!currentProfile) return;
    const bounds = elevationPlot.getBoundingClientRect();
    if (!bounds.width) return;
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width)
    );
    showElevationPoint(nearestElevationPoint(fraction * currentProfile.total));
  }

  elevationPlot.addEventListener("pointermove", inspectElevationAtPointer);
  elevationPlot.addEventListener("pointerdown", inspectElevationAtPointer);
  elevationPlot.addEventListener("pointerleave", clearElevationHover);
  elevationPlot.addEventListener("blur", clearElevationHover);
  elevationPlot.addEventListener("keydown", (event) => {
    if (!currentProfile) return;
    const last = currentProfile.samples.length - 1;
    const current = Number(elevationPlot.dataset.index || 0);
    let next;
    if (event.key === "ArrowRight") next = Math.min(last, current + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") {
      clearElevationHover();
      return;
    } else return;
    event.preventDefault();
    showElevationPoint(next);
  });

  mapViewToggle.addEventListener("click", () => {
    if (!map || !mapStyleReady || !selectedRoute) return;
    cancelRouteAnimation();
    clearElevationHover();
    streetDetail = !streetDetail;
    pendingCamera = streetDetail ? "street" : "overview";
    updateMapViewToggle();
    setMapStyle(mapStyle());
  });

  for (const [button, degrees] of [
    [rotateLeft, -30],
    [rotateRight, 30],
  ]) {
    button.addEventListener("click", () => {
      if (!map || !mapStyleReady || !streetDetail) return;
      map.easeTo({
        bearing: map.getBearing() + degrees,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
      });
    });
  }

  for (const input of document.querySelectorAll(
    '.theme-toggle input[name="theme"]'
  )) {
    input.addEventListener("change", () => {
      if (!map) return;
      if (streetDetail) {
        if (mapStyleReady)
          map.setConfigProperty("basemap", "lightPreset", lightPreset());
        return;
      }
      const style = mapStyle();
      if (style === currentStyle) return;
      cancelRouteAnimation();
      setMapStyle(style);
    });
  }

  const linkedCard = document.getElementById(location.hash.slice(1));
  const firstMappedCard = cards.find(
    (card) => card.querySelector(".race-select").dataset.route
  );
  selectRace(
    linkedCard?.matches(".race-card") ? linkedCard : firstMappedCard || cards[0]
  );
})();
