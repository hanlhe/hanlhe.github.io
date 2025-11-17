// Convert time string (HH:MM:SS) to total seconds for comparison
function timeToSeconds(timeStr) {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Infinity; // Invalid time format
}

// Automatically detect and mark PRs (fastest time in each category)
function autoDetectPRs() {
  const raceCategories = {
    marathon: "marathon",
    "half-marathon": "half-marathon",
    "trail-half-marathon": "trail-half-marathon",
    // 'misc' excluded - no PR detection for misc races
  };

  // Process each category (misc excluded)
  document.querySelectorAll("h2").forEach((h2) => {
    const categoryId = h2.id;
    if (!raceCategories[categoryId]) return;

    const nextSibling = h2.nextElementSibling;
    if (!nextSibling || nextSibling.tagName !== "UL") return;

    const listItems = Array.from(nextSibling.querySelectorAll("li"));
    let fastestTime = Infinity;
    let fastestItem = null;

    // Find the fastest time in this category
    listItems.forEach((li) => {
      // Extract time from the first code element (race time)
      const timeCode = li.querySelector(
        "code:first-child, a > code:first-child"
      );
      if (!timeCode) return;

      const timeStr = timeCode.textContent.trim();
      const timeInSeconds = timeToSeconds(timeStr);

      if (timeInSeconds < fastestTime) {
        fastestTime = timeInSeconds;
        fastestItem = li;
      }
    });

    // Mark PR line with a class (visual effects handle highlighting)
    if (fastestItem) {
      fastestItem.classList.add("pr-line");
    }
  });
}

// Calculate and display summary statistics
function addSummaryStatistics() {
  const stats = {
    marathons: 0,
    halfMarathons: 0,
    trailHalfMarathons: 0,
    totalRaces: 0,
  };

  const raceCategories = {
    marathon: "marathons",
    "half-marathon": "halfMarathons",
    "trail-half-marathon": "trailHalfMarathons",
  };

  // Count races by category
  document.querySelectorAll("h2").forEach((h2) => {
    const id = h2.id;
    if (raceCategories[id]) {
      const nextSibling = h2.nextElementSibling;
      if (nextSibling && nextSibling.tagName === "UL") {
        const count = nextSibling.querySelectorAll("li").length;
        stats[raceCategories[id]] = count;
      }
    }
  });

  // Total races = marathon + half + trail half (exclude misc)
  stats.totalRaces =
    stats.marathons + stats.halfMarathons + stats.trailHalfMarathons;

  // Create summary HTML
  const summaryHTML = `
    <div class="stats-summary">
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
    </div>
  `;

  // Insert summary after the first paragraph
  const firstP = document.querySelector("h1 + p");
  if (firstP) {
    firstP.insertAdjacentHTML("afterend", summaryHTML);
  }
}

// Run enhancements when DOM is ready
function init() {
  autoDetectPRs(); // Auto-detect and mark PRs first
  addSummaryStatistics(); // Then calculate stats
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
