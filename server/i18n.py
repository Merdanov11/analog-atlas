# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Texts the server returns to the user (English)."""
from __future__ import annotations

TEXT = {
    "profile.walker": dict(en="On foot (astronaut)"),
    "profile.rover_crew": dict(en="Crewed rover"),
    "profile.rover_robot": dict(en="Robotic rover"),
    "profile.drone": dict(en="Drone (helicopter / hopper)"),
    "mode.fast": dict(en="Fastest"),
    "mode.safe": dict(en="Safest"),
    "mode.eco": dict(en="Most efficient"),

    "kind.rest": dict(en="Rest"),
    "kind.night": dict(en="Waiting for sunrise"),
    "kind.temp": dict(en="Waiting for a safe temperature"),
    "kind.charge": dict(en="Charging the battery"),

    "err.no_dem": dict(en="The elevation map for this body is not prepared yet."),
    "err.time_format": dict(en="Invalid start time format."),
    "err.time_range": dict(en="Start time is out of the supported range."),
    "err.body": dict(en="Unknown body."),
    "err.profile": dict(en="Unknown travel mode or route type."),
    "err.no_route": dict(en="No passable route: the slopes on the way are too steep for this way of travelling."),

    "plan.stuck": dict(en="There is a place on the route where conditions for moving do not occur "
                          "for more than {hours:.0f} hours ({kind})."),

    "cond.none": dict(en="Environmental conditions did not change the path."),
    "cond.longer": dict(en="{km:.1f} km longer"),
    "cond.shorter": dict(en="{km:.1f} km shorter"),
    "cond.slower": dict(en="{h:.1f} h slower"),
    "cond.faster": dict(en="{h:.1f} h faster"),
    "cond.infeasible": dict(en="The terrain-only path is impassable under these conditions. "
                               "Another, passable path was found ({dist})."),
    "cond.time": dict(en="Path adjusted for light and temperature: {dist}, {time} than the terrain-only path."),
    "cond.risk": dict(en="Path adjusted for radiation and storm risk: {dist}, {time}; dose {d2:.1f} instead of "
                         "{d1:.1f} mSv, storm chance {s2} % instead of {s1} %."),

    "risk.dust": dict(en="Dust storms"),
    "risk.meteor.mars": dict(en="Meteoroids"),
    "risk.meteor.moon": dict(en="Meteor showers"),
    "risk.radiation": dict(en="Radiation"),
    "risk.season.out": dict(en="the trip is outside the storm season"),
    "risk.season.all": dict(en="the whole trip is in the storm season"),
    "risk.season.part": dict(en="{pct} % of the trip is in the storm season"),
    "risk.dust.mars": dict(en="Chance of meeting a storm: {p} %; {season}. Dust in the air (optical depth): "
                              "{tau:.2f} on average, up to {tmax:.2f} (the higher, the weaker the solar "
                              "panels and the worse the visibility)."),
    "risk.meteor.mars.text": dict(en="The Martian atmosphere stops small meteoroids; the risk is low."),
    "risk.dust.moon": dict(en="The Moon has no atmosphere, so there are no storms."),
    "risk.meteor.some": dict(en="During the trip: {names}. Around the peak days the flux of meteoroids is "
                                "noticeably higher than usual; a shower cannot be driven around, you can "
                                "only shift the date or take shelter."),
    "risk.meteor.none": dict(en="No major meteor showers on the trip dates. The usual background of "
                                "micrometeoroids is always present."),
    "risk.rad.crew": dict(en="Dose over {days:.1f} days: {dose:.1f} mSv. That is {x:.1f} times the yearly "
                             "natural background on Earth (2.4 mSv); NASA's career limit is 600 mSv. "
                             "Solar flares can raise the dose sharply; they are not modelled here."),
    "risk.rad.robot": dict(en="Dose over {days:.1f} days: {dose:.1f} mSv. For a robot this is insignificant."),
}


def lang_of(value: str | None) -> str:
    return "en"


def tr(lang: str, key: str, **kw) -> str:
    text = TEXT[key][lang_of(lang)]
    return text.format(**kw) if kw else text
