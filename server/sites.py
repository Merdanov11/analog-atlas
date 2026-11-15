# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Landing sites of spacecraft (successful soft landings and one early hard landing).

Coordinates come from open mission reports (NASA NSSDCA catalogue and agency publications),
latitude and east longitude in degrees. Five lunar sites were checked against the IAU gazetteer
(features of type Statio), the discrepancy is at most 0.02°.
kind: crew = crewed, rover = rover, lander = lander.
"""

SITES = {
    "moon": [
        ("Luna 2", 1959, "USSR", "lander", 29.1, 0.0),
        ("Luna 9", 1966, "USSR", "lander", 7.08, -64.37),
        ("Surveyor 1", 1966, "NASA", "lander", -2.474, -43.339),
        ("Surveyor 3", 1967, "NASA", "lander", -3.015, -23.418),
        ("Surveyor 5", 1967, "NASA", "lander", 1.461, 23.195),
        ("Surveyor 6", 1967, "NASA", "lander", 0.473, -1.427),
        ("Surveyor 7", 1968, "NASA", "lander", -40.981, -11.513),
        ("Apollo 11", 1969, "NASA", "crew", 0.674, 23.473),
        ("Apollo 12", 1969, "NASA", "crew", -3.012, -23.422),
        ("Luna 16", 1970, "USSR", "lander", -0.513, 56.364),
        ("Luna 17 / Lunokhod 1", 1970, "USSR", "rover", 38.238, -35.002),
        ("Apollo 14", 1971, "NASA", "crew", -3.645, -17.471),
        ("Apollo 15", 1971, "NASA", "crew", 26.132, 3.634),
        ("Luna 20", 1972, "USSR", "lander", 3.787, 56.624),
        ("Apollo 16", 1972, "NASA", "crew", -8.973, 15.500),
        ("Apollo 17", 1972, "NASA", "crew", 20.191, 30.772),
        ("Luna 21 / Lunokhod 2", 1973, "USSR", "rover", 25.999, 30.408),
        ("Luna 24", 1976, "USSR", "lander", 12.714, 62.213),
        ("Chang'e 3 / Yutu", 2013, "CNSA", "rover", 44.121, -19.512),
        ("Chang'e 4 / Yutu-2", 2019, "CNSA", "rover", -45.444, 177.599),
        ("Chang'e 5", 2020, "CNSA", "lander", 43.058, -51.916),
        ("Chandrayaan-3 / Pragyan", 2023, "ISRO", "rover", -69.373, 32.319),
        ("SLIM", "SLIM", 2024, "JAXA", "lander", -13.316, 25.251),
        ("IM-1 Odysseus", 2024, "Intuitive Machines / NASA CLPS", "lander", -80.13, 1.44),
        ("Chang'e 6", 2024, "CNSA", "lander", -41.638, -153.985),
        ("Blue Ghost Mission 1", 2025, "Firefly / NASA CLPS", "lander", 18.56, 61.81),
    ],
    "mars": [
        ("Viking 1", 1976, "NASA", "lander", 22.27, -47.95),
        ("Viking 2", 1976, "NASA", "lander", 47.64, 134.29),
        ("Mars Pathfinder / Sojourner", 1997, "NASA", "rover", 19.13, -33.22),
        ("Spirit", 2004, "NASA", "rover", -14.57, 175.47),
        ("Opportunity", 2004, "NASA", "rover", -1.95, -5.53),
        ("Phoenix", 2008, "NASA", "lander", 68.22, -125.75),
        ("Curiosity", 2012, "NASA", "rover", -4.59, 137.44),
        ("InSight", 2018, "NASA", "lander", 4.50, 135.62),
        ("Perseverance / Ingenuity", 2021, "NASA", "rover", 18.44, 77.45),
        ("Tianwen-1 / Zhurong", 2021, "CNSA", "rover", 25.07, 109.93),
    ],
}


def sites(body: str) -> list[dict]:
    return [dict(en=en, year=year, agency=agency, kind=kind, lat=lat, lon=lon)
            for en, year, agency, kind, lat, lon in SITES.get(body, [])]
