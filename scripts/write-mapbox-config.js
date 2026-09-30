const fs = require("fs");
const crypto = require("crypto");

const token = process.env.MAPBOX_PUBLIC_TOKEN?.trim();
if (!token?.startsWith("pk.")) {
  console.error("MAPBOX_PUBLIC_TOKEN must be a Mapbox public token (pk.).");
  process.exit(1);
}

const filename = "assets/mapbox-config.js";
fs.writeFileSync(filename, `window.RACE_MAPBOX_TOKEN = ${JSON.stringify(token)};\n`);

// The Pages deployment checks out the committed HTML. Match its asset URL to
// the token file generated for that deployment so browsers fetch the new value.
if (fs.existsSync("index.html")) {
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(filename))
    .digest("hex")
    .slice(0, 12);
  const html = fs.readFileSync("index.html", "utf8");
  if (!/assets\/mapbox-config\.js(?:\?v=[0-9a-f]{12})?/.test(html)) {
    throw new Error("Mapbox config script missing from index.html");
  }
  const updated = html.replace(
    /assets\/mapbox-config\.js(?:\?v=[0-9a-f]{12})?/g,
    `${filename}?v=${hash}`
  );
  if (updated !== html) fs.writeFileSync("index.html", updated);
}
