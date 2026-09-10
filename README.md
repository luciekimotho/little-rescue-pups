# Rescue pups

A standalone, installable game for little helpers aged 2 to 4. This keeps the original game's drawings, five rescue stories, picture matching, tap-anywhere controls and three-rescue outings. It runs entirely in the browser. It does not need Copilot, an account, an API or a production Node server.

This is an unofficial PAW Patrol fan game with original drawings. It is not affiliated with or endorsed by the rights holders. It contains no official artwork, recordings or character voices.

## Choose who's playing

The chooser opens on every app launch or reload. Choose **EDEN** with Skye or **ETHAN** with Chase to start or resume that child's own adventure. With a keyboard, Tab to a name and press Enter or Space. Tapping the home-screen scenery does not choose a player accidentally.

Eden starts with assisted play and Ethan with picture matching. Each child has independent sound, voice, motion and play-style settings, saved rescue steps, completed-rescue history and finished outings. Grown-ups can change a child's settings and see their rescue history after choosing that child. There are no online accounts.

Use 'Choose player' in the toolbar or grown-up dialog to switch without resetting an unfinished rescue. After three rescues, 'Bye, pups!' returns to the chooser and prepares that child's next outing. Choosing a child in another tab never switches the current tab's selected player.

## Bring bunny a carrot

The first adventure is bunny feeding. Drag the carrot from the tool tray to the outlined bowl. The carrot appears in the bowl and bunny responds after the placement is saved.

Eden can tap the single carrot button to have it placed automatically, or drag toward the generous bowl target. Ethan chooses from three pictures and places the carrot in the bowl. Dragging is optional: tap the carrot then the bowl, or focus each button with Tab and activate it with Enter or Space. A wrong picture or missed drop gives a gentle hint without losing progress. Escape cancels a selection; interrupted gestures return the tool without counting a delivery.

Only completed placements are saved, not a finger's position. The remaining four stories keep their familiar tap-to-help or picture-matching controls. This release adds the reusable placement controller and one interactive rescue before converting more stories.

## Run on this computer

Install Node.js 22 or newer. From PowerShell:

```powershell
Set-Location "$HOME\Code\little-rescue-pups"
npm start
```

Open `http://localhost:4173/`. No dependency installation or build is needed to play locally. Stop the preview with Ctrl+C.

To preview a hosted subpath:

```powershell
npm start -- --base /little-rescue-pups/ --port 4174
```

Open `http://localhost:4174/little-rescue-pups/`. The preview server listens only on this computer.

## Install on a phone or computer

Phone installation first needs this game on an **HTTPS website**. The GitHub Pages setup below publishes an HTTPS version after its first successful deployment. This PC's localhost URL is not a publicly accessible phone URL. A normal LAN address such as `http://192.168.1.10:4173/` is not enough for service workers or offline installation. Browsers make a special exception for localhost on the same device, not other computers on the network.

Open the HTTPS game URL and visit 'Grown-ups'. Wait for 'Ready for offline play on this device' before disconnecting.

- iPhone or iPad: open in Safari, tap Share, then 'Add to Home Screen'. If shown, turn on 'Open as Web App', then add it.
- Android: use Chrome's 'Install app' or 'Add to Home screen' menu. The grown-up dialog also offers an install button when the browser makes one available.
- Desktop: use the install icon in Edge or Chrome's address bar, or the browser's install menu. Browsers without app installation can still play in a normal tab; offline support depends on service worker availability.

Menu wording varies. Installation is optional. The children do not need to navigate installation prompts.

## Saves, offline play and voices

On first use, Eden and Ethan each start with a fresh profile. The game writes both profiles in one validated document after each change, preserving the other child's data. Saves belong to this browser, device, site and hosting path. An installed app may use separate storage from a browser tab on some platforms. There is no cross-device sync.

Invalid saves are left untouched with an adult-facing error. A grown-up can explicitly reset damaged profile saves. If storage is blocked or full, the game reports that the change was not saved and does not advance. Tabs use Web Locks where available and read the newest save before each action. Per-profile revisions reject outdated actions without applying them to a different step, and storage events refresh progress without changing the selected child. In browsers without Web Locks, use one game tab at a time to avoid simultaneous writes.

After a successful first download, the service worker keeps the game, drawings, icons and sounds available offline. No external fonts, artwork, analytics or voice services are loaded. Offline readiness appears only after the active worker confirms every required file is cached. Clearing browser/site data, private browsing, or the device reclaiming storage can remove offline files and saves. Reopen online after clearing cached files.

Spoken prompts use only installed, local English speech-synthesis voices. They are optional and device-dependent, including offline. They are ordinary narrators, not PAW Patrol character voices. A browser may have no suitable voice; the grown-up dialog says so and picture prompts still work. Gentle sounds are generated locally with Web Audio. Voice, sounds and animations have separate controls, and the game respects reduced-motion preferences.

A downloaded update waits while the game is open. 'Update and reopen' appears only in grown-up settings. Selecting it reloads that tab using the new version and keeps its save. Other open tabs do not reload unexpectedly. If all tabs close, the next opening may use a ready update automatically.

## Publish with GitHub Pages

The personal repository is [luciekimotho/little-rescue-pups](https://github.com/luciekimotho/little-rescue-pups). In its 'Settings', open 'Pages' and choose 'GitHub Actions' as the publishing source.

For a private repository, your GitHub plan must support Pages for private repositories. Otherwise, publishing requires a plan upgrade or an explicit decision to make the repository public. Changing the repository's visibility also makes its source code public.

After a push to `main`, `.github/workflows/pages.yml` runs the Node tests, copies only the public game files into a fresh `_site` folder, and deploys that folder. Development tools, tests, package files and personal saves are not part of the website. The workflow uses GitHub's short-lived deployment token; no personal token belongs in the repository or workflow.

If a run stops at 'Configure GitHub Pages', resolve the plan or Pages settings first. Then rerun 'Publish game to GitHub Pages' from the repository's 'Actions' tab.

After a successful deployment, the game URL is:

https://luciekimotho.github.io/little-rescue-pups/

GitHub Pages makes the game publicly accessible. Game progress stays in each visitor's browser and is not uploaded to GitHub. Keep this URL and hosting path stable so installed apps and existing browser saves continue to use the same location.

To prepare the exact deployment files locally:

```powershell
npm run pages:stage
```

This creates `_site` without installing dependencies or bundling the game. It refuses to reuse an existing output folder, so old or unrelated files cannot accidentally be included. Remove only that generated folder before staging again. `_site` and `node_modules` are ignored by Git.

For game updates, change `VERSION` in `sw.js` along with the runtime files, then commit and push. The Pages workflow publishes the update; an open game still waits for a grown-up to choose 'Update and reopen'.

## Use another static host

Copy the staged `_site` contents, or these runtime files and directories together:

```text
index.html
sw.js
manifest.webmanifest
src/
assets/
```

Use any HTTPS static host you control. Serve them at `/` or at a directory such as `/little-rescue-pups/`. Keep a trailing slash on directory URLs; redirect `/little-rescue-pups` to `/little-rescue-pups/`. Do not rewrite missing `.mjs`, `.js`, icon or manifest requests to HTML.

Serve `.mjs` and `.js` as JavaScript, `.webmanifest` as `application/manifest+json`, and PNG/SVG icons with their image MIME types. Allow the service worker at `sw.js` to control its own directory. No broader service-worker scope is needed. Serve `sw.js` and `index.html` with revalidation, such as `Cache-Control: no-cache`, rather than a long immutable lifetime. The manifest and all URLs are relative; no host-specific edits are needed.

For an update, change `VERSION` in `sw.js` and upload the complete set together. Keep the asset list current if adding runtime files. Versioned app caches are separate for each scope, and activation removes only this game's old caches for that scope. The service worker caches only the listed app files.

The preview server, tests, package files, `scripts` and `node_modules` are development tools. Do not upload them as website files. You can upload the contents of `_site` instead.

## Where to make changes

Application code lives under `src`, original icon files under `assets`, and development tools and tests in their own directories. The root contains only the website entry point, manifest, service worker and repository/package configuration.

```text
src\
  app.mjs
  paths.mjs
  components\
  screens\
  game\
  services\
  interactions\
  artwork\
  styles\
assets\
  icons\
scripts\
tests\
  unit\
  browser\
```

| Change | Module |
|---|---|
| Header, sound/navigation buttons or footer | `src\components\app-header.mjs`, `app-footer.mjs` |
| Eden and Ethan's buttons | `src\components\profile-button.mjs` |
| Tool choices, help button and task instructions | `src\components\tool-tray.mjs` |
| Outing trail and completed-step indicators | `src\components\rescue-progress.mjs` |
| Grown-up settings, rescue history or installation-status UI | `src\components\parents-dialog.mjs` |
| Chooser, mission/celebration or rest-screen composition | `src\screens\chooser-screen.mjs`, `mission-screen.mjs`, `rest-screen.mjs` |
| Selecting which screen to render | `src\screens\render-screen.mjs` |
| Narrator voice selection, speech playback or spoken instructions | `src\services\narration.mjs` |
| Generated chimes, audio activation or muting | `src\services\sound.mjs` |
| Profile selection, action dispatch, navigation or app lifecycle | `src\app.mjs` |
| Rescue definitions, tools, prompts, step IDs or drop targets | `src\game\missions.mjs` |
| Progress rules and action validation | `src\game\game.mjs` |
| Profile defaults and save validation | `src\game\profiles.mjs` |
| Device saves and cross-tab write protection | `src\services\storage.mjs` |
| Dragging, tap-to-place, keyboard placement or gesture cancellation | `src\interactions\placement.mjs` |
| Pup illustrations and scene artwork | `src\artwork\art.mjs` |
| Shared tokens, element defaults and focus styles | `src\styles\base.css` |
| Game layout, mobile breakpoints and animations | `src\styles\game.css` |
| Grown-up dialog styles | `src\styles\parents.css` |
| Dragging and drop-target styles | `src\styles\placement.css` |
| Application hosting base and stable save/worker paths | `src\paths.mjs` |
| Installation behavior and offline updates | `src\services\pwa.mjs` and root `sw.js` |
| Files allowed in the preview and deployment | `scripts\site-files.mjs` |

`src\app.mjs` owns the active profile and coordinates the other modules. Screens compose components from saved-state snapshots. Components do not import the application controller or write saves. Narration and sounds read current profile settings through callbacks rather than keeping a second copy of them.

For a future switch to recorded or pre-generated narration, start in `src\services\narration.mjs`, with recordings under `assets\audio`. The current implementation still uses only local browser voices. There is no bundler, framework or cloud speech dependency.

`src\paths.mjs` derives the hosting base from the application root, not the services directory. Storage keys and PWA registration use that base. `sw.js` stays at the website root so it can control the entire app.

Every new runtime file must be listed in `scripts\site-files.mjs` and the precache in `sw.js`. The deployment tests follow nested imports and stylesheet links to check that dependencies are included in the offline cache and staged website. Development files under `scripts` and `tests` are never part of that allow-list.

## Development checks

Unit tests live in `tests\unit`; real-browser tests live in `tests\browser`. Tests focus on failures that would stop play or lose data: incorrect rescue progress, mixed-up profiles, failed saves, misplaced or duplicate drops, and unavailable offline files.

Browser tests exercise actual touch, mouse and keyboard input rather than recreating the DOM in test doubles. They also cover the smallest supported phone layout and real offline loading. We do not test exact markup, art colors, chime frequencies, or every combination of device width and input key.

Add a test for a new behavior or a bug that could recur. Put the rule in a unit test, or test it through the browser when it depends on browser behavior. Avoid covering the same rule at both levels without a distinct integration risk.

Built-in Node tests need no packages:

```powershell
npm test
```

Real-browser offline checks and icon generation use Playwright with locally installed Microsoft Edge:

```powershell
npm ci
npm run test:browser
npm run icons
```

Set `PLAYWRIGHT_CHANNEL` to `chrome` to use an installed Chrome instead. The browser checks start and stop their own local servers and use isolated browser storage. They never touch the children's real profiles.

Edit `assets\icons\icon.svg` to change the original paw badge, then regenerate the PNGs. Its artwork stays inside the central maskable safe circle. Generated 192px, 512px, padded maskable 512px and Apple 180px icons are already included.
