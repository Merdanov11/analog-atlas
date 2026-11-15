# Routes Beyond Earth: architecture overview (companion project)

*This is the team's earlier route-planning and simulator project. It is not part of the Analog Atlas submission.*

Code comments are mostly in Russian; this page lists the modules in English.

* `server/app.py`: FastAPI endpoints (`/api/route`, `/api/places`, `/api/sites`, `/api/elevation`, `/api/sun`, `/api/sim/patch`, `/api/assets`, `/api/players`, `/ws/sim`), serves `web/`.
* `server/prep.py`, `prep_names.py`: routing grids from MOLA and LOLA GeoTIFFs; IAU place names.
* `server/routing.py`, `planner.py`, `environment.py`, `envcost.py`: Dijkstra on a terrain-cost grid for four traveller profiles; trip plan; Sun, temperature, radiation and storm models.
* `server/terrain.py`, `assets.py`, `multiplayer.py`, `sites.py`, `i18n.py`: 4 m terrain patches for the simulator, live NASA/JPL MMGIS rover positions, WebSocket multiplayer hub, landing sites, strings.
* `web/index.html` (CesiumJS map), `web/sim.html` and `web/sim/*.js` (Three.js simulator), `web/presentation.html` (talk deck), `web/img/` (screenshots).
* `tests/`: Node.js physics tests and a multiplayer test; `tools/shots.py`: screenshot harness.
