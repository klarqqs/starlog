# GeoIP data

The city database Umami downloads is MaxMind GeoLite2. Its end user license does not allow shipping the database as part of a handover or a public image. The build skips the download when `SKIP_BUILD_GEO=1`. Do not commit `geo/GeoLite2-City.mmdb`.

Recommendation: do not redistribute GeoLite2. On the Stellog collect path the server truncates the IP before lookup and does not store city or region. Country can stay, from the truncated address or from the host's CDN country header. That is enough for the privacy claim.

Switching to a country-only database such as DB-IP Lite (CC BY 4.0, attribution required) changes the lookup from city and region to country. The Stellog path already leaves city and region empty, so the stored rows do not change. The Umami path that still writes city and region would lose those two fields unless that path keeps a licensed city database.
