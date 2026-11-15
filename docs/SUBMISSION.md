# Project page texts (copy into the NASA Space Apps "Project" tab)

Everything here is in English, as the rules require. Fields follow the 2026 Project Submission Guide. Items in **[brackets]** must be filled in or confirmed by the team before submitting.

---

## Project Name

Analog Atlas

## High-Level Project Summary

Analog Atlas is an interactive, open tool that searches the whole Earth for places that could serve as analogs of candidate Moon-base and Mars sites. We scored about 104,000 land windows (48 km wide, covering all land between 80°N and 80°S) against 23 sites, among them Shackleton, de Gerlache and Faustini craters on the Moon and Jezero, Gale, Arcadia and Deuteronilus on Mars. "Analogous" is split into three scores the user can weight: terrain (slope, relief, roughness, compared at one common 480 m scale from NASA LOLA, MOLA and SRTM-based elevation), environment (NASA POWER temperature, precipitation, wind, UV, pressure) and ice, wind and volcanism. The map shows a similarity heat map; each result comes with a side-by-side comparison and an explicit list of what matches, what partly matches, and where the analogy breaks down (gravity, atmosphere, radiation). A switch hides places near well-known analog sites to surface less-studied leads. It helps mission planners, scientists and educators decide where to test rovers, drills and procedures on Earth before they fly.

## Link to Project Demo

**[Public link to the 7-slide PDF, for example https://github.com/merdanov11/analog-atlas/blob/main/docs/demo/AnalogAtlas_Demo.pdf — test it in a private browser window]**

(7 slides including the title slide; English; no login needed; shows team name, member names and the challenge.)

## Link to Final Project

**[Public link to the live tool, for example https://merdanov11.github.io/analog-atlas/atlas/ , and to the repository https://github.com/merdanov11/analog-atlas — test both in a private browser window]**

## Detailed Project Description

**What exactly does it do?** The user picks one of 23 Moon or Mars sites. The tool scores every Earth window against it with three scores from 0 to 1 and combines them with weights the user sets: *terrain* (median and 90th-percentile slope, relief, roughness, slope distribution), *environment* (mean temperature, annual temperature range (hottest to coldest day), precipitation, air pressure, wind, UV index) and *ice, wind and volcanism* (ground-ice potential, windy-and-dry surface processes, basaltic volcanic or lava-tube setting). Results appear as a global similarity map and a ranked list of distinct places at least 100 km apart. For each place the tool shows hillshades of the Moon or Mars site and the Earth window at identical scale, the slope distributions, and a table that marks every property as a match, a partial match or a difference, together with a sentence on how the place could help exploration (rover mobility, drilling in cold ground, lava-tube robots, dust studies, low-Sun navigation). Places inside the area of about 45 well-known analog sites or regions (120 km radius, larger for big deserts) are labelled; the rest are flagged "less-studied" and can be shown alone. Results can be downloaded as CSV.

**How does it work?** All windows (Moon, Mars, Earth) are 48 km squares resampled to 100 x 100 cells of 480 m, so slope, relief and roughness describe the same spatial scale on all three bodies. Moon and Mars windows come from the LRO LOLA 118 m and MGS MOLA 463 m elevation models around IAU feature centres. Earth windows come from open elevation tiles built from NASA SRTM and other sources; 36 km spacing gives about 104,000 land windows. Climate comes from NASA POWER (MERRA-2) annual climatology; volcanic setting from the Smithsonian Global Volcanism Program. Moon and Mars climate values are rounded literature ranges clipped to what exists on Earth, so the environment score ranks how Moon- or Mars-like a climate *tendency* is and never claims an exact match. Scoring runs in the browser (a few milliseconds per slider move); a Python implementation is used for the dataset and for an automated parity test (difference about 1e-7). A sanity check shows that well-known analog sites score high for the targets they are used for.

**What benefits does it have?** It turns the question "where should we test for this site?" into a transparent, adjustable, explainable search over the entire planet, and it highlights places that are rarely mentioned as analogs. Because every result lists where it fails, it avoids the trap of "looks alike" and supports good scientific judgement.

**What do you hope to achieve?** A shared screening tool and starting dataset for the analog community: shortlist places for field campaigns, support education and outreach, and give mission teams a quick first look at terrestrial options for a given landing or base site. Next steps are mineralogy and surface-material layers, a finer 120 m scale, more NASA Earth data (MODIS, ECOSTRESS, SAR), cave and lava-tube inventories, and field validation with partners.

**Honest limits.** Earth cannot reproduce reduced gravity, vacuum or thin atmosphere, or the radiation environment; these are always marked as differences. The global score does not include geology, mineralogy, biology or caves. Moon and Mars environment values and the ice/aeolian/volcanic tags are hand-entered, literature-based classes that need expert review. NASA POWER is a 0.5° reanalysis and elevation tiles are coarser at high latitudes. The list of well-known analog sites is ours and approximate.

**Tools used.** Python (NumPy, SciPy, Rasterio, Pillow), JavaScript, Leaflet, NASA GIBS imagery, headless Google Chrome (screenshots, PDF), and an AI coding assistant (see below).

## Use of Super Intelligence (SI)

*(This answer is not shown to judges; the team must review it so it is fully accurate.)* **[Review and edit]** Yes. We used Claude Code (Anthropic, Claude Sonnet 5.5) as a coding assistant. The team chose the challenge, set the goal and reviewed the results. The assistant proposed and implemented the method (common-scale windows, three weighted scores, clipping of Moon and Mars climate to Earth's range, "well-known" versus "less-studied" labelling, the break-down table), wrote the data pipeline, the web tool, the tests, the documentation and the demo deck, and researched data sources and the challenge rules. We are aware that the rules say SI should not be used to come up with the idea; the design of the method was largely the assistant's. No images, video or audio were generated by an SI model (all pictures are screenshots of our application), no data were generated by SI, and no NASA branding was used. Source files written with the assistant carry a header comment, and the full statement is in docs/SI_DISCLOSURE.md.

## NASA Data

* LRO LOLA global lunar DEM, 118 m (NASA, via USGS Astrogeology): terrain of the Moon sites.
* MGS MOLA global Mars DEM, 463 m (NASA, via USGS Astrogeology): terrain of the Mars sites.
* NASA Shuttle Radar Topography Mission (SRTM) elevation, in the open global elevation tiles (AWS Terrain Tiles): terrain of about 104,000 Earth windows.
* NASA POWER climatology from MERRA-2 (temperature, precipitation, wind, UV index): environment score.
* NASA GIBS imagery (Blue Marble, MODIS Terra): map base layers.

## Space Agency Partner Data and Other References

Space Agency Partner data: none used directly.

Other data and resources: IAU Gazetteer of Planetary Nomenclature via USGS Astrogeology (target coordinates); Smithsonian Global Volcanism Program, Volcanoes of the World (basaltic Holocene volcanoes); Natural Earth land and country polygons (public domain); open elevation tiles from AWS Terrain Tiles (aggregate of SRTM, GMTED2010, ETOPO1 and other open sources).

Publications: Smith et al. (2001) J. Geophys. Res. 106(E10), 23689-23722 (MOLA); Smith et al. (2010) Space Sci. Rev. 150, 209-241 (LOLA); Farr et al. (2007) Rev. Geophys. 45, RG2004 (SRTM); Gelaro et al. (2017) J. Climate 30, 5419-5454 (MERRA-2); Lin (1991) IEEE Trans. Inf. Theory 37, 145-151 (Jensen-Shannon divergence).

Software (all open source): Leaflet 1.9.4 (BSD-2-Clause), NumPy, SciPy, Rasterio, Pillow, websockets (BSD-style licences).

Our own code and documents: Apache-2.0. Images: screenshots of our application (maps use NASA GIBS imagery). No copyrighted music, images or text were used. No NASA logos or mission identifiers were used.

---

## Checklist before pressing "Submit for Judging" (deadline: Sunday 15 November, 23:59 local time of your Local Event)

- [ ] The team is registered for **Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars** and **all members are confirmed at the same Local Event** (not waitlisted).
- [ ] Demo link opens in a private browser window without login; the deck has **7 slides or fewer**, shows team name, member names and the challenge; text is in English.
- [ ] Final project links (live tool and repository) are **public** and open without login.
- [ ] All required form fields are filled; everything is in English.
- [ ] No images, video or names of people under 18 anywhere in the demo or the project.
- [ ] The SI answer is accurate and matches docs/SI_DISCLOSURE.md.
- [ ] Both boxes are ticked (terms; "original work, all resources listed"), then "Submit for Judging". You may resubmit until the deadline; only the last saved version is judged.
