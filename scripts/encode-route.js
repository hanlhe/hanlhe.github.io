module.exports = function encodePolyline(points) {
  let encoded = "";
  let lastLat = 0;
  let lastLon = 0;
  for (const [latitude, longitude] of points) {
    const lat = Math.round(latitude * 1e7);
    const lon = Math.round(longitude * 1e7);
    for (const change of [lat - lastLat, lon - lastLon]) {
      // Arithmetic avoids overflowing 32-bit shifts at seven decimal places.
      let value = change < 0 ? -2 * change - 1 : 2 * change;
      while (value >= 0x20) {
        encoded += String.fromCharCode((value % 0x20) + 0x20 + 63);
        value = Math.floor(value / 0x20);
      }
      encoded += String.fromCharCode(value + 63);
    }
    lastLat = lat;
    lastLon = lon;
  }
  return encoded;
};
