# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Targets (Moon and Mars sites) and a catalogue of well-known Earth analog sites.

Target coordinates are the IAU Gazetteer of Planetary Nomenclature feature centres (USGS Astrogeology), except
Marius Hills (the Marius Hills Hole skylight). Environment values are rounded, literature-based ranges and are
only used after being clipped to the range that exists on Earth (see the methodology in the README).
"""

# Environment classes: tmean/tmax/tmin in degrees C (annual mean, hottest and coldest day of the year of the surface or
# near-surface air), pressure in kPa, wind in m/s at 10 m (Mars) or 0 (Moon), uv = annual-mean UV index equivalent (no ozone layer).
ENV = {
    "moon_polar": dict(tmean=-115.0, tmax=-45.0, tmin=-175.0, p_kpa=0.0, precip_mm=0.0, wind=0.0, uv=25.0),
    "moon_equatorial": dict(tmean=-20.0, tmax=100.0, tmin=-170.0, p_kpa=0.0, precip_mm=0.0, wind=0.0, uv=25.0),
    "mars_equatorial": dict(tmean=-55.0, tmax=-20.0, tmin=-85.0, p_kpa=0.7, precip_mm=0.0, wind=6.0, uv=20.0),
    "mars_midlat": dict(tmean=-65.0, tmax=-40.0, tmin=-90.0, p_kpa=0.9, precip_mm=0.0, wind=6.0, uv=18.0),
    "mars_hellas": dict(tmean=-55.0, tmax=-25.0, tmin=-80.0, p_kpa=1.2, precip_mm=0.0, wind=6.0, uv=18.0),
}

# ice: ground ice / volatile resources (0..1); aeolian: wind-driven surface processes (0..1);
# volcanic: basaltic volcanic setting such as lava flows, tubes and cones (0..1).
TARGETS = [
    # ---- Moon: candidate south-polar base regions and the north pole
    dict(id="shackleton", name="Shackleton crater rim region", body="moon", lat=-89.67, lon=129.78, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="Permanently shadowed floor with ice-bearing deposits; nearly continuously lit rim."),
    dict(id="de_gerlache", name="de Gerlache crater", body="moon", lat=-88.4849, lon=-88.3447, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="South-polar crater next to Shackleton; connecting ridge is a base candidate."),
    dict(id="faustini", name="Faustini crater", body="moon", lat=-87.1832, lon=84.3099, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="Deep south-polar crater with extensive cold traps; rim region is a landing candidate."),
    dict(id="haworth", name="Haworth crater", body="moon", lat=-87.45, lon=-5.17, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="South-polar crater with permanently shadowed floor."),
    dict(id="nobile", name="Nobile crater", body="moon", lat=-85.2752, lon=53.2725, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="South-polar crater; rim regions were listed as landing candidates."),
    dict(id="mons_malapert", name="Mons Malapert", body="moon", lat=-85.98, lon=-1.67, env="moon_polar", ice=0.5, aeolian=0.0, volcanic=0.0,
         note="Massif with long periods of sunlight and direct line of sight to Earth."),
    dict(id="amundsen", name="Amundsen crater", body="moon", lat=-84.4398, lon=83.0691, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="Large south-polar crater; rim region is a landing candidate."),
    dict(id="cabeus", name="Cabeus crater", body="moon", lat=-85.3303, lon=-42.1327, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="Site of the LCROSS impact, where water ice was detected."),
    dict(id="shoemaker", name="Shoemaker crater", body="moon", lat=-88.137, lon=45.911, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="Cold-trap crater near the south pole."),
    dict(id="peary", name="Peary crater (north pole)", body="moon", lat=88.6251, lon=24.4024, env="moon_polar", ice=1.0, aeolian=0.0, volcanic=0.0,
         note="North-polar crater with cold traps."),
    dict(id="marius_hills", name="Marius Hills (lava-tube skylights)", body="moon", lat=14.1, lon=-56.7, env="moon_equatorial", ice=0.0, aeolian=0.0, volcanic=1.0,
         note="Volcanic dome field with skylights that may open into lava tubes."),
    # ---- Mars: landing and exploration sites
    dict(id="jezero", name="Jezero crater", body="mars", lat=18.4082, lon=77.6873, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Ancient delta and clay-bearing rocks; Perseverance landing site."),
    dict(id="gale", name="Gale crater", body="mars", lat=-5.3672, lon=137.811, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Layered sedimentary mound (Mount Sharp); Curiosity landing site."),
    dict(id="gusev", name="Gusev crater", body="mars", lat=-14.5308, lon=175.5244, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.5,
         note="Basaltic plains and Columbia Hills; Spirit landing site."),
    dict(id="oxia_planum", name="Oxia Planum", body="mars", lat=17.28, lon=-25.71, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Clay-rich plain chosen for the ExoMars rover."),
    dict(id="meridiani", name="Meridiani Planum", body="mars", lat=-0.04, lon=-3.14, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Flat hematite-bearing plain; Opportunity landing site."),
    dict(id="mawrth", name="Mawrth Vallis", body="mars", lat=22.4304, lon=-16.9726, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Outflow channel with thick clay deposits."),
    dict(id="arcadia", name="Arcadia Planitia", body="mars", lat=49.02, lon=-171.85, env="mars_midlat", ice=1.0, aeolian=1.0, volcanic=0.0,
         note="Smooth northern plain with shallow ground ice; discussed for human landing."),
    dict(id="deuteronilus", name="Deuteronilus Mensae", body="mars", lat=45.1095, lon=23.9184, env="mars_midlat", ice=1.0, aeolian=1.0, volcanic=0.0,
         note="Mid-latitude mesas with debris-covered glaciers."),
    dict(id="utopia", name="Utopia Planitia", body="mars", lat=46.7363, lon=117.5168, env="mars_midlat", ice=1.0, aeolian=1.0, volcanic=0.0,
         note="Vast northern plain with buried ice (Viking 2 region)."),
    dict(id="protonilus", name="Protonilus Mensae", body="mars", lat=43.8694, lon=48.8636, env="mars_midlat", ice=1.0, aeolian=1.0, volcanic=0.0,
         note="Mesas and valleys with glacier-like forms and ground ice."),
    dict(id="hellas", name="Hellas Planitia floor", body="mars", lat=-42.4301, lon=70.5025, env="mars_hellas", ice=0.0, aeolian=1.0, volcanic=0.0,
         note="Deepest basin on Mars: highest surface pressure and warmest nights."),
    dict(id="noctis", name="Noctis Labyrinthus", body="mars", lat=-6.3625, lon=-101.1889, env="mars_equatorial", ice=0.0, aeolian=1.0, volcanic=1.0,
         note="Fractured canyons in the volcanic Tharsis region; possible cave environments."),
]

# Well-known analog sites (approximate centres, optional radius in km, default 120). They are used only to label results as
# "well-known" (inside the site's area) or "less-studied", and are shown on the map for orientation.
KNOWN = [
    ("Atacama Desert, Yungay", -24.1, -69.9, 250), ("Antarctic Dry Valleys", -77.5, 162.0, 150), ("Haughton crater, Devon Island", 75.4, -89.7),
    ("Death Valley", 36.5, -117.1, 150), ("Askja, Iceland", 65.0, -16.8, 150), ("Mauna Kea, Hawaii", 19.8, -155.5), ("Mauna Loa, Hawaii", 19.5, -155.6),
    ("Kilauea, Hawaii", 19.4, -155.3), ("Craters of the Moon, Idaho", 43.5, -113.5), ("SP Crater and Cinder Lake, Arizona", 35.4, -111.6),
    ("Meteor Crater, Arizona", 35.0, -111.0), ("Mars Desert Research Station, Utah", 38.4, -110.8), ("Svalbard", 78.2, 15.6, 150),
    ("Rio Tinto, Spain", 37.7, -6.5), ("Lanzarote lava tubes", 29.0, -13.6), ("Teide, Tenerife", 28.3, -16.6), ("Tabernas Desert, Spain", 37.0, -2.4, 100),
    ("Axel Heiberg Island", 79.4, -90.7), ("Salar de Uyuni, Bolivia", -20.1, -67.5), ("Danakil Depression, Ethiopia", 14.2, 40.3, 200),
    ("Wadi Rum, Jordan", 29.6, 35.4), ("Samail Ophiolite, Oman", 23.2, 58.1, 150), ("Lut Desert, Iran", 30.5, 59.0, 300), ("Namib Desert", -24.5, 15.5, 300),
    ("Pavilion Lake, Canada", 50.9, -121.7), ("Mojave Desert, California", 35.0, -116.0, 250), ("Kamchatka volcanoes", 56.0, 160.5, 250),
    ("Mount Etna, Sicily", 37.75, 15.0), ("Reykjanes, Iceland", 63.9, -22.4), ("Eifel volcanic field, Germany", 50.2, 6.8),
    ("Ries crater, Germany", 48.9, 10.55), ("Barringer-type craters, Australia (Wolfe Creek)", -19.2, 127.8),
    ("Gosses Bluff, Australia", -23.8, 132.3), ("Pingualuit crater, Canada", 61.3, -73.7), ("Lonar crater, India", 19.98, 76.5),
    ("Aorounga crater, Chad", 19.1, 19.25), ("Tenoumer crater, Mauritania", 22.9, -10.4), ("Mount Erebus, Antarctica", -77.5, 167.2),
    ("Qaidam Basin, China (Mars analog studies)", 37.5, 93.5, 350), ("Gobi Desert", 43.0, 105.0, 450), ("Great Sandy Desert, Australia", -21.0, 125.0, 350),
    ("Atacama, Salar de Atacama", -23.5, -68.2, 150), ("Ojos del Salado, Chile", -27.1, -68.5), ("Sahara, Tibesti", 21.0, 17.5, 300), ("Iceland, Krafla", 65.7, -16.8, 150),
]
