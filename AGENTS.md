# Repository instructions

## Git workflow: push directly to main

- Commit completed, validated changes and push directly to `origin/main` by
  default, without waiting for a separate commit-and-push request.
- Do not create a branch or pull request unless the user explicitly asks for one.
- Use `main` as the base, not `main_dev`. Apply these repository-specific rules
  ahead of conflicting global branch and pull-request conventions.
- If a dedicated worktree is required, use a detached worktree based on
  `origin/main` and push with `git push origin HEAD:main`. Do not create a branch
  solely to satisfy worktree guidance.
- Fetch `origin/main` before starting. Preserve remote commits if it advances;
  integrate them before retrying a rejected push. Never force-push `main`.
- Check the worktree and staged diff before committing. Stage only files for the
  current task, preserve unrelated changes, and use a short imperative commit
  summary without ticket numbers or attribution trailers.
- After pushing from a detached worktree, fast-forward the local `main` checkout
  when its tracked files are clean so it has the current repository guidance.

## Project layout

[COMPUTED] This repository contains a static running-race archive published with
GitHub Pages.

- Edit race results in `README.md`, layout in `src/template.html`, styling in
  `assets/style.css`, and browser interactions in `assets/races.js`.
- Change archive generation, race metadata, GPX matching, route encoding, and
  elevation sampling in `scripts/build-meta.js`.
- Regenerate the tracked `index.html` with `make -B`; do not edit it by hand.
- Read `race-routes/README.md` before importing or changing GPX files.

## Race data and routes

- Preserve the existing categories and entry format: `HH:MM:SS` finish time,
  `MM/DD/YYYY` race date, race name and website, and emoji. Insert new results in
  date order, newest first within their category.
- Use the official finish time supplied by the user or result source. Do not
  substitute the GPX recording duration or moving time.
- Name routes `race-routes/YYYY-MM-DD-race-name.gpx` using the race's local date
  and the name in `README.md`. Follow the route README for slug rules and
  duplicate names; the build must match each imported route to its race.
- Add result or activity links only when supplied or verified; do not invent
  personal result URLs.
- Follow the route README's publication guidance for coordinates, timestamps,
  and sensor data in imported files.

## Build and verification

[COMPUTED] The build workflow uses Node.js 24, npm, Pandoc, and Make; the declared
JavaScript dependencies are jsdom and Prettier.

- Install JavaScript dependencies with `npm ci`, preserving `package-lock.json`.
- Run `make -B` after changes to race data, GPX files, templates, styles, browser
  scripts, or build scripts. Resolve warnings about unmatched GPX files.
- For race updates, check the generated date, official time, category, route,
  and elevation profile when elevation data exists. Confirm existing entries
  and routes retain their data.
- For visual or interactive changes, run `make preview` and inspect
  `http://localhost:8000/`, including the affected filters, race selection,
  themes, map controls, or elevation interactions. Serve previews over HTTP.
- For documentation-only changes, review the content and run `git diff --check`;
  a site rebuild is unnecessary.

## Map configuration and deployment

- Keep `assets/mapbox-config.js` untracked. Use
  `assets/mapbox-config.example.js` for the local configuration format and
  `scripts/write-mapbox-config.js` for deployment configuration.
- Keep the deployment token in the repository Actions secret
  `MAPBOX_PUBLIC_TOKEN`; do not commit credentials or machine-local files.
- Inspect `.github/workflows/update-html.yml` and
  `.github/workflows/deploy-pages.yml` when changing the build or publication
  process. Keep changes focused on the requested behavior.
