# Architecture overview

```
Moon / Mars targets                          Earth
 LOLA 118 m, MOLA 463 m DEMs                  elevation tiles (SRTM and other open sources), zoom 8
        |                                      NASA POWER climate (MERRA-2), Smithsonian GVP volcanoes,
        |                                      Natural Earth land and country polygons
        v                                              v
 analogs/targets.py                          analogs/earth.py  (mask, power, tiles, scan, volc)
  48 km window, 480 m cells                   104,000 land windows, same 48 km / 480 m scale
  terrain signature + hillshade               terrain signature per window
        \________________________  analogs/export.py  ________________________/
                                   docs/atlas/data/  windows.bin  meta.json  targets.json  known.json  thumbs.json
                                              |
                                   docs/atlas/index.html  (static page; scoring runs in the browser)
```

## Pipeline (`analogs/`, Python)

| File | Purpose |
|---|---|
| `config.py` | The 23 Moon and Mars target sites (IAU gazetteer coordinates, rounded literature-based environment classes, ice/aeolian/volcanic tags) and the list of well-known Earth analog sites used only to label results. |
| `common.py` | Window definition (48 km, 100 x 100 cells of 480 m), terrain signature (median and 90th-percentile slope, relief, roughness, slope histogram), hillshade, thumbnail encoder, tangent-plane sampling of the Moon and Mars DEMs (valid at the poles). |
| `targets.py` | Terrain signatures of the targets from the LOLA and MOLA GeoTIFFs. |
| `earth.py` | Stages `mask` (land windows every 36 km), `power` (NASA POWER climatology), `tiles` (download elevation tiles), `scan` (terrain signature of every window), `volc` (distance to the nearest basaltic Holocene volcano). All results are cached and resumable. |
| `score.py` | The similarity scores: terrain, environment, ice/wind/volcanism, and their weighted mean. |
| `export.py` | Quantises and writes the browser dataset, chooses candidates that get a hillshade thumbnail, writes summaries. |
| `validate.py` | Sanity check: do well-known analog sites score high for each target? |

## Web tool (`docs/atlas/index.html`)

A single static page (Leaflet, NASA GIBS imagery). It loads about 4 MB of typed arrays, recomputes the three scores for all windows whenever the target or the weights change (tens of milliseconds), draws the similarity map on a canvas, ranks distinct places at least 100 km apart, and explains the selected place with a side-by-side hillshade, slope distribution and a match / break-down table. The scoring code is a line-by-line twin of `analogs/score.py`; `tests/atlas_parity.py` checks that both agree.

## Scoring

* **Terrain:** vector of ln(1+median slope), ln(1+90th-percentile slope), ln(1+relief), ln(1+roughness), standardised over all Earth windows; distance = mean squared difference + 4 x Jensen-Shannon divergence of the slope histograms; score = exp(-d / (2 x 0.6^2)).
* **Environment:** mean annual temperature, annual temperature range (hottest to coldest day), ln(1+precipitation), ln(pressure), wind. Moon and Mars values are clipped to the 1st-99th percentile range found on Earth; weighted squared distance in units of the Earth standard deviation; score = exp(-d / (2 x 1.4^2)).
* **Ice, wind, volcanism:** 1 minus the mean absolute difference between the target's tags and Earth proxies: ground-ice potential (cold ground), aeolian potential (windy and dry), basaltic volcanic setting (distance to the nearest basaltic Holocene volcano).
* **Total:** weighted mean (default 0.5 / 0.3 / 0.2, adjustable in the page).

## Tests (`tests/`)

`atlas_parity.py` runs the page in headless Chrome and compares its scores with the Python scores for 40 random windows and several targets (maximum difference below 2e-3; actual about 1e-7).
