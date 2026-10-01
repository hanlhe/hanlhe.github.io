# Race route files

Name each GPX file `YYYY-MM-DD-race-name.gpx`, using the race date and name in
the main `README.md`. The name is lowercase ASCII with words separated by
hyphens. Use the English name after `|` for bilingual race titles, remove
apostrophes, and write `&` as `and`.

| Race | GPX filename |
| --- | --- |
| Osaka Marathon | `2026-02-22-osaka-marathon.gpx` |
| La Jolla Half Marathon | `2026-05-16-la-jolla-half-marathon.gpx` |
| San Francisco Pride Run 2026 | `2026-06-27-san-francisco-pride-run-2026.gpx` |

If two races share a date and name, add `-2` to the second filename. The build
finds matching files and puts compact route lines and elevation samples into
`index.html`. The map shows only the selected race; GPX files without elevation
still show a route but have no elevation chart. The GitHub Actions workflow
rebuilds the page when this directory changes.

Garmin exports named `activity_*.gpx` usually contain the activity name in
`<trk><name>` and a UTC start time in `<metadata><time>`. Use the race's local
date for the filename; Tianjin and Dalian start on the previous date in UTC.

The route map uses Mapbox. Set the repository Actions secret
`MAPBOX_PUBLIC_TOKEN` to a Mapbox public access token (`pk...`). The Pages
deployment writes that token into the published JavaScript. Site visitors can
see a client-side token, so restrict it to this site's URL in Mapbox. For a
local preview, copy `assets/mapbox-config.example.js` to
`assets/mapbox-config.js` and enter your token. The local config file is ignored
by Git. Run `make preview` and open `http://localhost:8000/`. Do not open
`index.html` as a `file://` page: the browser can block Mapbox's worker,
leaving the map blank. If your token is restricted to `hanlhe.github.io`, also
allow `http://localhost:8000` for previews. Mapbox URL restrictions do not
support wildcards. Route lines are built into `index.html`, so no browser GPX
fetch is needed. Run `make -B` after adding or changing GPX files.

The 3D streets control switches to Mapbox Standard and zooms to the route start.
Detailed roads appear only at close zoom in locations covered by Mapbox; the
full-route view remains available from the same control.

GPX files committed here are public and may contain exact coordinates,
timestamps, heart rate, and cadence. Remove details you do not want to publish
before adding a file.
