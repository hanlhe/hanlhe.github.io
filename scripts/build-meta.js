// Turn the Pandoc-rendered race lists into a compact archive. README.md remains
// the source for race results; GPX files are matched by date and race name.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const categories = [
  { id: "marathon", label: "Marathon", filter: "marathon" },
  { id: "half-marathon", label: "Half marathon", filter: "half-marathon" },
  { id: "miscellaneous", label: "Pride run", filter: "miscellaneous" },
];

function timeToSeconds(time) {
  return time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function raceSlug(name) {
  const englishName = name.includes("|") ? name.split("|").at(-1) : name;
  const slug = englishName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘ʻ'`]/gu, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error(`Cannot make a route filename for ${name}`);
  return slug;
}

function isoDate(date) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) throw new Error(`Invalid race date: ${date}`);
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function element(document, tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function externalLink(document, label, href) {
  const link = element(document, "a", "race-link", label);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function extractRaces(document) {
  const races = [];

  for (const category of categories) {
    const heading = document.getElementById(category.id);
    const list = heading?.nextElementSibling;
    if (!heading || list?.tagName !== "UL") {
      throw new Error(`Missing race list for ${category.label}`);
    }

    for (const item of list.children) {
      const codes = [...item.querySelectorAll("code")];
      const anchors = [...item.querySelectorAll("a")];
      const raceLink = anchors.find(
        (anchor) =>
          !anchor.querySelector("code") &&
          cleanText(anchor.textContent).toLowerCase() !== "strava"
      );
      if (!codes[0] || !codes[1] || !raceLink) {
        throw new Error(
          `Incomplete ${category.label} entry: ${item.textContent}`
        );
      }

      const date = isoDate(codes[1].textContent.trim());
      const lastText =
        item.lastChild?.nodeType === 3 ? item.lastChild.textContent : "";
      const emoji = lastText
        .trim()
        .replace(/^\)\s*/, "")
        .trim();
      races.push({
        category: category.filter,
        date,
        time: cleanText(codes[0].textContent),
        name: cleanText(raceLink.textContent),
        emoji,
        resultUrl:
          codes[0].parentElement?.tagName === "A"
            ? codes[0].parentElement.href
            : "",
        raceUrl: raceLink.href,
      });
    }
  }

  races.sort((a, b) => b.date.localeCompare(a.date));
  const ids = new Map();
  const routeIds = new Map();
  for (const race of races) {
    const base = `${race.date}-${race.category}`;
    const ordinal = (ids.get(base) || 0) + 1;
    ids.set(base, ordinal);
    race.id = `race-${base}${ordinal > 1 ? `-${ordinal}` : ""}`;
    const routeBase = `${race.date}-${raceSlug(race.name)}`;
    const routeOrdinal = (routeIds.get(routeBase) || 0) + 1;
    routeIds.set(routeBase, routeOrdinal);
    const filename = `${routeBase}${routeOrdinal > 1 ? `-${routeOrdinal}` : ""}.gpx`;
    const routePath = path.posix.join("race-routes", filename);
    race.route = fs.existsSync(routePath) ? routePath : "";
  }

  const usedRoutes = new Set(races.map((race) => race.route).filter(Boolean));
  const unusedRoutes = fs
    .readdirSync("race-routes")
    .filter((filename) => /\.gpx$/i.test(filename))
    .map((filename) => path.posix.join("race-routes", filename))
    .filter((filename) => !usedRoutes.has(filename));
  if (unusedRoutes.length) {
    console.warn(
      `[build-meta] GPX files without a matching race: ${unusedRoutes.join(", ")}`
    );
  }

  for (const category of categories.slice(0, 2)) {
    const categoryRaces = races.filter(
      (race) => race.category === category.filter
    );
    const fastest = categoryRaces.reduce(
      (best, race) =>
        !best || timeToSeconds(race.time) < timeToSeconds(best.time)
          ? race
          : best,
      null
    );
    if (fastest) fastest.isPr = true;
  }

  return races;
}

function gpxPoints(xml, tag) {
  const points = [];
  const pointTag = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
  for (const match of xml.matchAll(pointTag)) {
    const latitude = match[1].match(/\blat\s*=\s*["']([^"']+)["']/i)?.[1];
    const longitude = match[1].match(/\blon\s*=\s*["']([^"']+)["']/i)?.[1];
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (
      latitude &&
      longitude &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      const bodyStart = match.index + match[0].length;
      const close = xml.indexOf(`</${tag}>`, bodyStart);
      const next = xml.indexOf(`<${tag}`, bodyStart);
      const body =
        close !== -1 && (next === -1 || close < next)
          ? xml.slice(bodyStart, close)
          : "";
      const rawElevation = body.match(/<ele>([^<]+)<\/ele>/i)?.[1];
      const elevation =
        rawElevation === undefined ? null : Number(rawElevation);
      points.push([lat, lon, Number.isFinite(elevation) ? elevation : null]);
    }
  }
  return points;
}

function metersBetween(first, second) {
  const latitude = ((first[0] + second[0]) * Math.PI) / 360;
  const north = (second[0] - first[0]) * 111320;
  const east = (second[1] - first[1]) * 111320 * Math.cos(latitude);
  return Math.hypot(north, east);
}

function elevationProfile(segments) {
  const points = [];
  let distance = 0;
  for (const segment of segments) {
    for (let index = 0; index < segment.length; index += 1) {
      if (index) distance += metersBetween(segment[index - 1], segment[index]);
      const [lat, lon, elevation] = segment[index];
      if (elevation !== null) {
        points.push([
          Math.round(distance),
          Math.round(elevation),
          Math.round(lat * 1e5),
          Math.round(lon * 1e5),
        ]);
      }
    }
  }
  if (points.length < 2) return [];

  const interval = Math.max(20, distance / 240);
  const samples = [points[0]];
  let nextDistance = interval;
  for (const point of points.slice(1, -1)) {
    if (point[0] >= nextDistance) {
      samples.push(point);
      while (nextDistance <= point[0]) nextDistance += interval;
    }
  }
  const last = points[points.length - 1];
  if (last !== samples[samples.length - 1]) samples.push(last);
  return samples;
}

function simplifyPoints(points, tolerance = 7) {
  if (points.length < 3) return points;
  const metersPerDegree = 111320;
  const longitudeScale =
    metersPerDegree * Math.cos((points[0][0] * Math.PI) / 180);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const ranges = [[0, points.length - 1]];

  while (ranges.length) {
    const [start, end] = ranges.pop();
    const a = points[start];
    const b = points[end];
    const dx = (b[1] - a[1]) * longitudeScale;
    const dy = (b[0] - a[0]) * metersPerDegree;
    const lengthSquared = dx * dx + dy * dy;
    let farthest = -1;
    let farthestDistance = tolerance * tolerance;

    for (let index = start + 1; index < end; index += 1) {
      const point = points[index];
      const px = (point[1] - a[1]) * longitudeScale;
      const py = (point[0] - a[0]) * metersPerDegree;
      const fraction = lengthSquared
        ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared))
        : 0;
      const distance = (px - fraction * dx) ** 2 + (py - fraction * dy) ** 2;
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = index;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      ranges.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

function encodePolyline(points) {
  let encoded = "";
  let lastLat = 0;
  let lastLon = 0;
  for (const [latitude, longitude] of points) {
    const lat = Math.round(latitude * 1e5);
    const lon = Math.round(longitude * 1e5);
    for (const change of [lat - lastLat, lon - lastLon]) {
      let value = change < 0 ? ~(change << 1) : change << 1;
      while (value >= 0x20) {
        encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      encoded += String.fromCharCode(value + 63);
    }
    lastLat = lat;
    lastLon = lon;
  }
  return encoded;
}

function buildRouteData(races) {
  const routes = {};
  for (const race of races) {
    if (!race.route) continue;
    const xml = fs.readFileSync(race.route, "utf8");
    const segments = [...xml.matchAll(/<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi)]
      .map((match) => gpxPoints(match[1], "trkpt"))
      .filter((points) => points.length > 1);
    if (!segments.length) {
      const routePoints = gpxPoints(xml, "rtept");
      if (routePoints.length > 1) segments.push(routePoints);
    }
    if (!segments.length) throw new Error(`No route points in ${race.route}`);
    routes[race.route] = {
      lines: segments.map((points) => encodePolyline(simplifyPoints(points))),
      profile: elevationProfile(segments),
    };
  }
  return routes;
}

function buildCard(document, race) {
  const card = element(document, "li", `race-card${race.isPr ? " is-pr" : ""}`);
  card.id = race.id;
  card.dataset.category = race.category;

  const button = element(document, "button", "race-select");
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.setAttribute(
    "aria-label",
    `${race.name}, ${race.date}, finish time ${race.time}${race.isPr ? ", personal best" : ""}. Show details`
  );
  Object.assign(button.dataset, {
    name: race.name,
    date: race.date,
    time: race.time,
    emoji: race.emoji,
    result: race.resultUrl,
    raceUrl: race.raceUrl,
    route: race.route,
  });

  const date = element(
    document,
    "time",
    "race-card-date",
    new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${race.date}T12:00:00Z`))
  );
  date.dateTime = race.date;

  const title = element(document, "span", "race-card-title");
  title.append(element(document, "span", "race-name", race.name));

  const center = element(document, "span", "race-card-main");
  center.append(title);
  button.append(
    date,
    center,
    element(document, "span", "race-card-time", race.time)
  );
  card.append(button);

  const footer = element(
    document,
    "div",
    `race-card-footer${race.isPr ? " has-pr" : ""}`
  );
  if (race.isPr)
    footer.append(element(document, "span", "pr-badge", "Personal best"));
  const links = element(document, "div", "race-card-links");
  if (race.resultUrl)
    links.append(externalLink(document, "Result ↗", race.resultUrl));
  links.append(externalLink(document, "Race ↗", race.raceUrl));
  footer.append(links);
  card.append(footer);
  return card;
}

function buildPage(document, races, routeData) {
  const main = document.getElementById("main-content");
  const oldTitle = main.querySelector("h1");
  if (!oldTitle) throw new Error("Missing page title");

  const count = (category) =>
    races.filter((race) => race.category === category).length;
  const header = element(document, "header", "page-intro");
  header.append(oldTitle);

  const layout = element(document, "div", "archive-layout");
  const archive = element(document, "section", "race-archive");
  archive.setAttribute("aria-label", "Race results");

  const filters = element(document, "div", "race-filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Filter races by distance");
  for (const [filter, label, total] of [
    ["all", "All", races.length],
    ["marathon", "Marathon", count("marathon")],
    ["half-marathon", "Half", count("half-marathon")],
    ["miscellaneous", "Pride", count("miscellaneous")],
  ]) {
    const button = element(
      document,
      "button",
      "filter-button",
      `${label} ${total}`
    );
    button.type = "button";
    button.dataset.filter = filter;
    button.setAttribute("aria-pressed", filter === "all" ? "true" : "false");
    filters.append(button);
  }
  const list = element(document, "ol", "race-list");
  for (const race of races) list.append(buildCard(document, race));
  archive.append(list);

  const detail = element(document, "aside", "race-detail");
  detail.setAttribute("aria-label", "Selected race details");
  detail.innerHTML = `
    <div class="detail-inner">
      <div class="detail-topline">
        <span class="detail-icon" id="detail-icon" aria-hidden="true" hidden></span>
      </div>
      <h2 id="detail-name"></h2>
      <p class="detail-date" id="detail-date"></p>
      <div class="detail-time"><span>Finish time</span><strong id="detail-time"></strong></div>
      <div class="map-shell" id="map-shell">
        <div id="race-map" role="region" aria-label="Selected race route map" hidden></div>
        <div class="map-message" id="map-message" role="status">Route map not available for this race yet.</div>
      </div>
      <section class="elevation-panel" id="elevation-panel" aria-label="Elevation profile" hidden>
        <div class="elevation-heading"><span>Elevation</span><span id="elevation-range"></span></div>
        <div class="elevation-plot" id="elevation-plot" role="slider" tabindex="0" aria-label="Elevation along the race route" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
          <svg id="elevation-chart" viewBox="0 0 600 150" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f97316" stop-opacity="0.32"/><stop offset="100%" stop-color="#f97316" stop-opacity="0.02"/></linearGradient></defs>
            <line class="elevation-grid" x1="8" y1="75" x2="592" y2="75" />
            <path id="elevation-area" fill="url(#elevation-fill)" />
            <path id="elevation-line" />
            <line id="elevation-cursor" y1="8" y2="140" hidden />
            <circle id="elevation-dot" r="5" hidden />
          </svg>
          <div class="elevation-tooltip" id="elevation-tooltip" hidden></div>
        </div>
        <div class="elevation-axis"><span>0 km</span><span id="elevation-distance"></span></div>
      </section>
      <nav class="detail-links" aria-label="Selected race links">
        <a id="detail-result" class="race-link" target="_blank" rel="noopener noreferrer">Result ↗</a>
        <a id="detail-race" class="race-link" target="_blank" rel="noopener noreferrer">Race ↗</a>
      </nav>
    </div>
  `;

  layout.append(archive, detail);
  const routesScript = document.createElement("script");
  routesScript.id = "race-route-data";
  routesScript.type = "application/json";
  routesScript.textContent = JSON.stringify(routeData);
  main.replaceChildren(header, filters, layout, routesScript);
}

function versionAsset(document, selector, attribute, filename) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Missing asset reference: ${filename}`);
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex")
    .slice(0, 12);
  node.setAttribute(attribute, `${filename}?v=${hash}`);
}

const dom = new JSDOM(fs.readFileSync("index.html", "utf8"));
const races = extractRaces(dom.window.document);
buildPage(dom.window.document, races, buildRouteData(races));
versionAsset(
  dom.window.document,
  'link[href="assets/style.css"]',
  "href",
  "assets/style.css"
);
versionAsset(
  dom.window.document,
  'script[src="assets/mapbox-config.js"]',
  "src",
  "assets/mapbox-config.js"
);
versionAsset(
  dom.window.document,
  'script[src="assets/races.js"]',
  "src",
  "assets/races.js"
);
fs.writeFileSync("index.html", dom.serialize());
