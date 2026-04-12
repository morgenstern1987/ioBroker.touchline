# ioBroker.touchline

[![NPM version](https://img.shields.io/npm/v/iobroker.touchline.svg)](https://www.npmjs.com/package/iobroker.touchline)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Adapter für **Roth Touchline** und **Roth Touchline SL** Fußbodenheizungsregler.
Unterstützt beide Firmware-Generationen über das lokale Netzwerk – kein Cloud-Zugriff nötig.

## Unterstützte Geräte

| Gerät            | API         | Status |
|------------------|-------------|--------|
| Touchline (alt)  | Legacy CGI  | ✅     |
| Touchline SL     | REST JSON   | ✅     |

## Datenpunkte

### `system.*`
| Datenpunkt       | Beschreibung        |
|------------------|---------------------|
| firmware         | Firmware-Version    |
| serialNumber     | Seriennummer        |
| apiVersion       | Erkannte API        |

### `zones.<id>.*`
| Datenpunkt           | Beschreibung              | Schreibbar |
|----------------------|---------------------------|------------|
| name                 | Zonenname                 | –          |
| currentTemperature   | Isttemperatur (°C)        | –          |
| targetTemperature    | Solltemperatur (°C)       | ✅         |
| floorTemperature     | Fußbodentemperatur (°C)   | –          |
| humidity             | Luftfeuchtigkeit (%)      | –          |
| co2                  | CO₂ (ppm, SL only)        | –          |
| mode                 | Modus als Text            | –          |
| modeRaw              | Modus (0–3)               | ✅         |
| windowContact        | Fensterkontakt offen?     | –          |
| valvePosition        | Ventilstellung (%)        | –          |
| weekSchedule         | Wochenprogramm-ID         | ✅ (SL)    |
| online               | Zone erreichbar           | –          |

### Modi
| Wert | Legacy   | SL       |
|------|----------|----------|
| 0    | auto     | standby  |
| 1    | day      | auto     |
| 2    | night    | manual   |
| 3    | holiday  | holiday  |

## Installation

```bash
cd /opt/iobroker
npm install iobroker.touchline
iobroker add touchline
