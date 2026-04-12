# iobroker.touchline

Release-fähiger ioBroker-Adapter für **Roth Touchline Legacy API** (alte API).

## Fokus dieser Version

Diese Version nutzt **ausschließlich die alte Touchline-API**. Alle Logiken für die neue API wurden entfernt, damit die Verbindung bei älteren Anlagen stabil bleibt.

## Features

- Reine Legacy-API-Unterstützung (`old`)
- Konfigurierbare lokale Touchline-Adresse (IP/Hostname oder vollständige URL)
- Konfigurierbarer API-Port (`80` oder `8899` üblich) und Request-Timeout
- Port-Fallback bei Verbindungsproblemen (`80`, `8899`)
- Optionaler lokaler Bridge-Webserver
- Rekursives Mapping vieler API-Werte in ioBroker-States
- Endpoint-Status unter `touchline.X.endpoints.*`

## Konfiguration

- `Local IP / Hostname of Touchline controller`
- `Protocol` (`HTTP` / `HTTPS`)
- `Touchline API port`
- `HTTP timeout (ms)`
- `Polling interval (seconds)`
- optional `Username` / `Password` oder `Bearer token`
- `Additional legacy API paths` (Komma, Semikolon oder Zeilenumbruch)
- `Enable local bridge webserver`
- `Webserver port`

> Wichtig: `Webserver port` (Bridge, Standard `8099`) ist **nicht** der Touchline-API-Port.

## Datenpunkte

- API-Daten unter `touchline.X.api.old...`
- Endpoint-Status unter `touchline.X.endpoints.<endpoint>.ok` und `...error`
- Adapter-Info unter `touchline.X.info.*` (`connection`, `lastError`, `apiType`, `baseUrl`)

## Bridge-Endpunkte

- `GET /health`
- `GET /api/states`
- `POST /api/refresh`

## Entwicklung

```bash
npm install
npm run lint
npm run check
npm test
```

## CI

GitHub Actions führt aus:

- `npm install`
- `npm run lint`
- `npm run check`
