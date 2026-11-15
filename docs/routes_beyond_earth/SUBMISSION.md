# Project page texts (copy into the NASA Space Apps "Project" tab)

Everything here is in English, as the rules require. Fields follow the 2026 Project Submission Guide. Items in **[brackets]** must be filled in by the team before submitting.

---

## Project Name

Routes Beyond Earth

## High-Level Project Summary

Routes Beyond Earth is a Google-Maps-style navigator for Mars (and the Moon) built on NASA open data. Click two points on a layered map (Viking imagery, MOLA topography, THEMIS thermal infrared, TES thermal inertia, dust, roughness and mineralogy) and it computes the fastest, safest and most efficient route for an astronaut on foot, a crewed rover, a robotic rover or a drone, with slope limits, daylight shifts, temperature, radiation and dust-storm estimates. One more click opens a physics-based simulator on the same terrain, so a crew can rehearse the Marswalk from the ground, leave the rover on foot, call a drone, and share the world with teammates and with the real Perseverance and Curiosity rovers, whose positions come live from NASA/JPL. It answers "Interplanetary Survival Guide: Martian Map" by turning scattered NASA layers into one hyperlocal, route-aware tool that helps explorers plan, prepare and move safely.

## Link to Project Demo

**[Public link to the 7-slide PDF, for example https://github.com/ACCOUNT/REPO/blob/main/docs/demo/RoutesBeyondEarth_Demo.pdf — test it in a private browser window]**

(7 slides including the title slide; English; no login needed.)

## Link to Final Project

**[Public link to the GitHub repository, for example https://github.com/ACCOUNT/REPO — test it in a private browser window]**

The repository contains the full source code, the README with screenshots and run instructions, tests, the demo deck and the licence.

## Detailed Project Description

**What it does.** Routes Beyond Earth has three parts that share one data model.

1. *A layered map and route planner.* The map shows Mars (or the Moon) with NASA base maps and seven science overlays that can be blended with an opacity slider: THEMIS day and night infrared (thermal), TES thermal inertia (geophysical), TES dust cover (atmospheric), MOLA roughness (topographic), TES albedo (optical) and TES pyroxene abundance (spectral). The user picks a start and an end point, and the server computes three routes (fastest, safest, most efficient) for four travellers: an astronaut on foot (25° maximum slope, 3 km/h, 7-hour daylight shifts), a crewed rover, a robotic rover and a drone. Identical alternatives are merged into one card. Each route comes with a trip plan: time, energy, ascent and descent, steepest slope, elevation profile, temperature range, radiation dose estimate, dust-storm risk, rests and daylight windows. Landing sites, IAU place names and the live positions of Perseverance and Curiosity are on the map.
2. *A driving and walking simulator.* "Drive this route" opens a Three.js simulator. The route is cut into 1.5 km stages; for each stage the server builds a 4 m terrain patch from the MOLA (or LOLA) elevation model, refined with a statistical model of craters and rocks that is clearly labelled as a model. Vehicles use raycast wheels with soil sinkage and thrust (Bekker and Janosi–Hanamoto models), suspension, battery, heat, solar power and dust. The astronaut can get out of the rover, walk with a stride-matched walk cycle in third person, call a drone, and switch control between them. On the Moon a drone is a rocket "hopper" (a concept); on Mars it is a rotorcraft whose lift depends on the thin atmosphere. A local planner (A* with boulder avoidance) drives the autopilot.
3. *A shared world.* A small WebSocket server relays player state at 10 Hz in separate Mars and Moon rooms: players see each other, chat, drop map pings, share energy and collide. The live NASA/JPL MMGIS positions of Perseverance and Curiosity appear in the world, so a team can drive up to the real vehicles. The simulator has a touch interface for phones.

**How it works.** Python (FastAPI) serves the app. Elevation GeoTIFFs from NASA/USGS are converted into slope and elevation grids at several resolutions. Routing is Dijkstra's algorithm on a terrain-cost grid with a profile-specific cost for slope, energy and (in a second pass) darkness, cold and heat at the expected arrival time. The trip planner simulates shifts, rests, charging and temperature. The map is CesiumJS with a custom ellipsoid for each body; imagery and science layers are streamed from NASA Solar System Treks. The simulator is plain JavaScript with Three.js; the physics core also runs in Node.js, which is how it is tested (61 automated checks cover wheel–soil physics, crater drops, steep slopes, drone flight and landing; a separate test drives the multiplayer server with two bots).

**Benefits.** A crew, a mission planner, a teacher or a student can see in minutes how far a traverse is, how long it takes, what the terrain, temperature, dust and radiation look like along the way, and what it feels like to drive or walk it, all from one open tool that runs in a browser and on a phone.

**What we hope to achieve.** A free, open reference for hyperlocal Mars route planning that other teams can extend: more layers sampled along the route, HiRISE and CTX close-ups at the destination, co-operative missions with roles, and replay of real rover traverses to compare with a planned one. The same engine already covers the Moon for Artemis-era traverses.

**Honest limits.** Routes use a 926 m (Mars) or 474 m (Moon) grid. Below the native elevation resolution (463 m and 118 m) the simulator terrain is a statistical model. Temperature, radiation and storm figures are simplified models built on published NASA measurements, not mission-grade predictions. Live rover positions update after each drive because NASA publishes waypoints, not a continuous feed; no open feed exists for lunar vehicles or Ingenuity. The Moon hopper is a concept.

**Tools.** Python 3, FastAPI, Uvicorn, NumPy, SciPy, Rasterio, websockets; JavaScript, CesiumJS, three.js; headless Chrome for screenshots and PDF export; an AI coding assistant (see below).

## Use of Super Intelligence (SI)

*(This answer is not shown to judges; the team must edit it so it is fully accurate.)* **[Review and edit]** Yes. We used Claude Code (Anthropic, Claude Sonnet 5.5) as a coding assistant. The team defined the concept, the features and the priorities and tested the results; the assistant wrote most of the code of the simulator, the multiplayer server, the live-data module, the terrain generator, the map layer changes, the tests, the README, the demo deck and the presentation. It also researched NASA data sources and the challenge rules. No images or video were generated by an SI model (all pictures are screenshots of our running application), no audio was recorded or generated by a model (the presentation's ambient sound is synthesised by our own code), and no NASA branding was used. Source files written with the assistant carry a header comment, and the full statement is in SI_DISCLOSURE.md in the repository.

## NASA Data

* Mars elevation: Mars Global Surveyor MOLA global DEM, 463 m (NASA; distributed by USGS Astrogeology). Used for route planning, slopes and simulator terrain.
* Moon elevation: Lunar Reconnaissance Orbiter LOLA global DEM, 118 m (NASA; USGS Astrogeology). Same use for the Moon.
* NASA/JPL Solar System Treks (Mars Trek and Moon Trek) tile services: Viking MDIM 2.1 color mosaic, MOLA color hillshade, LRO WAC mosaic, LOLA shaded relief (base maps); Mars Odyssey THEMIS day and night infrared mosaics (100 m), MGS TES thermal inertia, dust cover, albedo and pyroxene abundance, MOLA surface roughness (science overlays).
* NASA/JPL-Caltech MMGIS waypoint layers for Mars 2020 Perseverance and Mars Science Laboratory Curiosity (position, sol, distance driven): live rover positions on the map and in the simulator.
* NASA NSSDCA mission records: landing-site coordinates.
* Published NASA measurements used as parameters of our simplified models: MSL/RAD radiation (Hassler et al., 2014), LRO Diviner lunar temperatures (Williams et al., 2017).

## Space Agency Partner Data and Other References

Space Agency Partner data: none used directly (the Mars Trek catalogue includes Mars Express HRSC products; we do not use them).

Other data and resources:
* IAU Gazetteer of Planetary Nomenclature, via USGS Astrogeology (place names).
* Allison, M., & McEwen, M. (2000), *Planet. Space Sci.*, 48, 215–235 (Mars solar coordinates). Meeus, J. (1998), *Astronomical Algorithms* (Sun position).
* Zhang, S., et al. (2020), *Science Advances*, 6(39), eaaz1334 (lunar surface dose).
* Dijkstra, E. W. (1959), *Numerische Mathematik*, 1, 269–271 (path search).
* Bekker, M. G. (1969), *Introduction to Terrain–Vehicle Systems*; Janosi, Z., & Hanamoto, B. (1961); Wong, J. Y. (2008), *Theory of Ground Vehicles* (wheel–soil models).
* Heiken, G., Vaniman, D., & French, B. (1991), *Lunar Sourcebook*; Neukum, G., Ivanov, B. A., & Hartmann, W. K. (2001), *Space Sci. Rev.*, 96, 55–86 (lunar soil and crater statistics).
* Smith, D. E., et al. (2001), *J. Geophys. Res.*, 106(E10), 23689–23722 (MOLA); Smith, D. E., et al. (2010), *Space Sci. Rev.*, 150, 209–241 (LOLA).

Software (all open source): CesiumJS 1.135 (Apache-2.0), three.js r128 (MIT), NumPy, SciPy, Rasterio, Uvicorn, websockets (BSD-3-Clause), FastAPI (MIT).

Our own code and documents: Apache-2.0. Images: screenshots of our application; planet textures in the long presentation are NASA Solar System Treks tiles. No copyrighted music, images or text were used. No NASA logos or mission identifiers were used.

---

## Checklist before pressing "Submit for Judging" (deadline: Sunday 15 November, 23:59 local time of your Local Event)

- [ ] The team is registered for **Interplanetary Survival Guide: Martian Map** (a team may work on only one challenge) and **all members are confirmed at the same Local Event** (not waitlisted).
- [ ] Demo link opens in a private browser window without login; deck has **7 slides or fewer**, shows team name, member names and the challenge; text is in English.
- [ ] Final project link (GitHub repository) is **public** and opens without login.
- [ ] All required form fields are filled; everything is in English.
- [ ] No images, video or names of people under 18 anywhere in the demo or the project.
- [ ] Both boxes are ticked (terms; "original work, all resources listed"), then "Submit for Judging". You may resubmit until the deadline; only the last saved version is judged.
