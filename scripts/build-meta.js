// Post-process index.html to:
// 1) Mark PR lines (fastest time per category) with class="pr-line"
// 2) Inject the summary statistics block after the first paragraph
//
// This runs at build time via the Makefile so no JS is needed at runtime.

const fs = require("fs");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  console.error(
    "[build-meta] Missing dependency 'jsdom'. Please run:\n  npm install jsdom\n"
  );
  process.exit(1);
}

const INPUT_FILE = "index.html";

function timeToSeconds(timeStr) {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Infinity;
}

function main() {
  const html = fs.readFileSync(INPUT_FILE, "utf8");
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const categories = [
    { id: "marathon", key: "marathons" },
    { id: "half-marathon", key: "halfMarathons" },
    { id: "trail-half-marathon", key: "trailHalfMarathons" },
  ];

  const stats = {
    marathons: 0,
    halfMarathons: 0,
    trailHalfMarathons: 0,
    totalRaces: 0,
  };

  // Mark PR lines and count races per category
  for (const cat of categories) {
    const h2 = document.getElementById(cat.id);
    if (!h2) continue;

    // Find the next <ul> after this h2
    let ul = h2.nextElementSibling;
    while (ul && ul.tagName !== "UL") {
      ul = ul.nextElementSibling;
    }
    if (!ul) continue;

    const lis = Array.from(ul.querySelectorAll("li"));
    stats[cat.key] = lis.length;

    let fastestItem = null;
    let fastestTime = Infinity;

    for (const li of lis) {
      const timeCode = li.querySelector("code:first-child, a > code:first-child");
      if (!timeCode) continue;

      const timeStr = timeCode.textContent.trim();
      const timeInSeconds = timeToSeconds(timeStr);
      if (timeInSeconds < fastestTime) {
        fastestTime = timeInSeconds;
        fastestItem = li;
      }
    }

    if (fastestItem) {
      fastestItem.classList.add("pr-line");
    }
  }

  stats.totalRaces =
    stats.marathons + stats.halfMarathons + stats.trailHalfMarathons;

  // Inject summary after the first paragraph following the h1
  const firstP = document.querySelector("h1 + p");
  if (firstP) {
    const wrapper = document.createElement("div");
    wrapper.className = "stats-summary";
    wrapper.innerHTML = `
      <h3>Race Statistics</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-label">Marathon & Half Marathon Races</span>
          <span class="stat-value">${stats.totalRaces}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Marathons</span>
          <span class="stat-value">${stats.marathons}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Half Marathons</span>
          <span class="stat-value">${stats.halfMarathons}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Trail Half</span>
          <span class="stat-value">${stats.trailHalfMarathons}</span>
        </div>
      </div>
    `;
    firstP.insertAdjacentElement("afterend", wrapper);
  }

  fs.writeFileSync(INPUT_FILE, dom.serialize(), "utf8");
}

main();


