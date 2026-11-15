# Developed with assistance from Claude Code (Anthropic), an AI coding assistant. See SI_DISCLOSURE.md.
"""Тексты, которые сервер отдаёт пользователю, на английском (по умолчанию) и русском."""
from __future__ import annotations

TEXT = {
    "profile.walker": dict(en="On foot (astronaut)", ru="Пешком (астронавт)"),
    "profile.rover_crew": dict(en="Crewed rover", ru="Ровер с экипажем"),
    "profile.rover_robot": dict(en="Robotic rover", ru="Робот-планетоход"),
    "profile.drone": dict(en="Drone (helicopter / hopper)", ru="Дрон (вертолёт / прыгун)"),
    "mode.fast": dict(en="Fastest", ru="Быстрый"),
    "mode.safe": dict(en="Safest", ru="Безопасный"),
    "mode.eco": dict(en="Most efficient", ru="Экономный"),

    "kind.rest": dict(en="Rest", ru="Отдых"),
    "kind.night": dict(en="Waiting for sunrise", ru="Ожидание рассвета"),
    "kind.temp": dict(en="Waiting for a safe temperature", ru="Ожидание подходящей температуры"),
    "kind.charge": dict(en="Charging the battery", ru="Зарядка батареи"),

    "err.no_dem": dict(en="The elevation map for this body is not prepared yet.",
                       ru="Карта высот для этого тела ещё не подготовлена."),
    "err.time_format": dict(en="Invalid start time format.", ru="Неверный формат времени старта."),
    "err.time_range": dict(en="Start time is out of the supported range.",
                           ru="Время старта вне допустимого диапазона."),
    "err.body": dict(en="Unknown body.", ru="Неизвестное тело."),
    "err.profile": dict(en="Unknown travel mode or route type.", ru="Неизвестный профиль или режим."),
    "err.no_route": dict(en="No passable route: the slopes on the way are too steep for this way of travelling.",
                         ru="Проходимого маршрута нет: на пути слишком крутые склоны "
                            "для выбранного способа передвижения."),

    "plan.stuck": dict(en="There is a place on the route where conditions for moving do not occur "
                          "for more than {hours:.0f} hours ({kind}).",
                       ru="На маршруте есть место, где условия для движения не наступают "
                          "дольше {hours:.0f} часов ({kind})."),

    "cond.none": dict(en="Environmental conditions did not change the path.",
                      ru="Условия среды на выбор пути не повлияли."),
    "cond.longer": dict(en="{km:.1f} km longer", ru="длиннее на {km:.1f} км"),
    "cond.shorter": dict(en="{km:.1f} km shorter", ru="короче на {km:.1f} км"),
    "cond.slower": dict(en="{h:.1f} h slower", ru="дольше на {h:.1f} ч"),
    "cond.faster": dict(en="{h:.1f} h faster", ru="быстрее на {h:.1f} ч"),
    "cond.infeasible": dict(en="The terrain-only path is impassable under these conditions. "
                               "Another, passable path was found ({dist}).",
                            ru="Путь только по рельефу по условиям непроходим. Найден другой, "
                               "проходимый путь ({dist})."),
    "cond.time": dict(en="Path adjusted for light and temperature: {dist}, {time} than the terrain-only path.",
                      ru="Путь подстроен под свет и температуру: {dist}, {time} по сравнению "
                         "с путём только по рельефу."),
    "cond.risk": dict(en="Path adjusted for radiation and storm risk: {dist}, {time}; dose {d2:.1f} instead of "
                         "{d1:.1f} mSv, storm chance {s2} % instead of {s1} %.",
                      ru="Путь подстроен под радиацию и риск бурь: {dist}, {time}; доза {d2:.1f} вместо "
                         "{d1:.1f} мЗв, шанс бури {s2} % вместо {s1} %."),

    "risk.dust": dict(en="Dust storms", ru="Пыльные бури"),
    "risk.meteor.mars": dict(en="Meteoroids", ru="Метеориты"),
    "risk.meteor.moon": dict(en="Meteor showers", ru="Метеорные потоки"),
    "risk.radiation": dict(en="Radiation", ru="Радиация"),
    "risk.season.out": dict(en="the trip is outside the storm season", ru="поездка вне сезона бурь"),
    "risk.season.all": dict(en="the whole trip is in the storm season", ru="вся поездка в сезон бурь"),
    "risk.season.part": dict(en="{pct} % of the trip is in the storm season",
                             ru="{pct} % поездки в сезон бурь"),
    "risk.dust.mars": dict(en="Chance of meeting a storm: {p} %; {season}. Dust in the air (optical depth): "
                              "{tau:.2f} on average, up to {tmax:.2f} (the higher, the weaker the solar "
                              "panels and the worse the visibility).",
                           ru="Шанс попасть в бурю: {p} %; {season}. Запылённость воздуха: в среднем "
                              "{tau:.2f}, до {tmax:.2f} (чем выше, тем слабее солнечные батареи "
                              "и хуже видимость)."),
    "risk.meteor.mars.text": dict(en="The Martian atmosphere stops small meteoroids; the risk is low.",
                                  ru="Атмосфера Марса задерживает мелкие метеориты, риск мал."),
    "risk.dust.moon": dict(en="The Moon has no atmosphere, so there are no storms.",
                           ru="На Луне нет атмосферы, бурь не бывает."),
    "risk.meteor.some": dict(en="During the trip: {names}. Around the peak days the flux of meteoroids is "
                                "noticeably higher than usual; a shower cannot be driven around, you can "
                                "only shift the date or take shelter.",
                             ru="На время поездки попадают: {names}. В дни максимума поток метеорных "
                                "частиц заметно выше обычного; объехать поток нельзя, можно только "
                                "сдвинуть дату или укрыться."),
    "risk.meteor.none": dict(en="No major meteor showers on the trip dates. The usual background of "
                                "micrometeoroids is always present.",
                             ru="Крупных метеорных потоков в даты поездки нет. Обычный фон "
                                "микрометеоритов есть всегда."),
    "risk.rad.crew": dict(en="Dose over {days:.1f} days: {dose:.1f} mSv. That is {x:.1f} times the yearly "
                             "natural background on Earth (2.4 mSv); NASA's career limit is 600 mSv. "
                             "Solar flares can raise the dose sharply; they are not modelled here.",
                          ru="Доза за {days:.1f} сут: {dose:.1f} мЗв. Это {x:.1f} годовых норм "
                             "естественного фона на Земле (2,4 мЗв); предел NASA за всю карьеру: 600 мЗв. "
                             "Солнечные вспышки могут резко увеличить дозу, они здесь не учтены."),
    "risk.rad.robot": dict(en="Dose over {days:.1f} days: {dose:.1f} mSv. For a robot this is insignificant.",
                           ru="Доза за {days:.1f} сут: {dose:.1f} мЗв. Для робота это несущественно."),
}


def lang_of(value: str | None) -> str:
    return "ru" if value == "ru" else "en"


def tr(lang: str, key: str, **kw) -> str:
    text = TEXT[key][lang_of(lang)]
    return text.format(**kw) if kw else text
