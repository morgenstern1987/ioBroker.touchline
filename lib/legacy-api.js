'use strict';

const axios  = require('axios');
const xml2js = require('xml2js');

/**
 * LegacyAPI
 *
 * Kommuniziert mit dem Roth Touchline Legacy Controller über die lokale CGI-API.
 *
 * Statt N einzelner GET-Requests an readVal.cgi wird ein einziger POST-Request
 * an ILRReadValues.cgi gesendet, der alle benötigten Variablen auf einmal liefert.
 * Das reduziert die Last auf dem schwachen eingebetteten Webserver drastisch.
 *
 * Request-Format (XML POST):
 *   POST /cgi-bin/ILRReadValues.cgi
 *   Content-Type: text/xml
 *
 *   <body>
 *     <item_list>
 *       <i><n>G0.RaumTemp</n></i>
 *       <i><n>G0.SollTemp</n></i>
 *       ...
 *     </item_list>
 *   </body>
 *
 * Response-Format (XML):
 *   <body>
 *     <item_list>
 *       <i><n>G0.RaumTemp</n><v>2050</v></i>
 *       <i><n>G0.SollTemp</n><v>2200</v></i>
 *       ...
 *     </item_list>
 *   </body>
 *
 * Schreiben weiterhin per GET:
 *   GET /cgi-bin/writeVal.cgi?G0.SollTemp=2200
 */
class LegacyAPI {

    /**
     * @param {string} host  - IP-Adresse des Controllers (ohne http://)
     * @param {object} [log] - ioBroker Logger (optional)
     */
    constructor(host, log = null) {
        this.host    = host.trim().replace(/^https?:\/\//, '');
        this.baseUrl = `http://${this.host}/cgi-bin`;
        this.log     = log || { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

        this._client = axios.create({
            timeout: 8000,
            headers: {
                'Content-Type': 'text/xml',
                'User-Agent':   'SpiderControl/1.0 (iniNet-Solutions GmbH)'
            }
        });

        this._xmlParser = new xml2js.Parser({ explicitArray: true, trim: true });
    }

    /* ────────────────────────────────────────────────────────────
       Mehrere Variablen in EINEM POST-Request lesen
       Gibt { variableName: rawValue } zurück.
    ──────────────────────────────────────────────────────────── */
    async readVariables(variables) {
        if (!variables || variables.length === 0) return {};

        /* XML-Body aufbauen */
        const items = variables
            .map(v => `<i><n>${v}</n></i>`)
            .join('');

        const xmlBody = `<body><item_list>${items}</item_list></body>`;

        this.log.debug(`ILRReadValues POST: ${variables.length} Variable(n)`);

        let responseText;
        try {
            const res = await this._client.post(
                `${this.baseUrl}/ILRReadValues.cgi`,
                xmlBody,
                { responseType: 'text', transformResponse: r => r }
            );
            responseText = String(res.data);
        } catch (err) {
            throw new Error(`ILRReadValues Fehler: ${err.message}`);
        }

        this.log.debug(`ILRReadValues Antwort: ${responseText}`);

        /* XML parsen */
        let parsed;
        try {
            parsed = await this._xmlParser.parseStringPromise(responseText);
        } catch (err) {
            throw new Error(`XML-Parse-Fehler: ${err.message} | Rohwert: ${responseText}`);
        }

        /* Werte extrahieren: { variableName: value } */
        const result = {};
        try {
            const itemList = parsed?.body?.item_list?.[0]?.i || [];
            for (const item of itemList) {
                const name  = item?.n?.[0];
                const value = item?.v?.[0];
                if (name !== undefined) {
                    result[name] = value !== undefined ? String(value).trim() : null;
                }
            }
        } catch (err) {
            throw new Error(`Fehler beim Auswerten der XML-Antwort: ${err.message}`);
        }

        this.log.debug(`Geparste Werte: ${JSON.stringify(result)}`);
        return result;
    }

    /* ────────────────────────────────────────────────────────────
       Anzahl gekoppelter Räume / Zonen
    ──────────────────────────────────────────────────────────── */
    async getZoneCount() {
        const data = await this.readVariables(['totalNumberOfDevices']);
        const raw  = data['totalNumberOfDevices'];

        if (raw === undefined || raw === null) {
            throw new Error('totalNumberOfDevices nicht in der Antwort gefunden');
        }

        const count = parseInt(raw, 10);
        if (isNaN(count)) {
            throw new Error(`Ungültiger Wert für totalNumberOfDevices: "${raw}"`);
        }
        return count;
    }

    /* ────────────────────────────────────────────────────────────
       Raumname für eine Zone
    ──────────────────────────────────────────────────────────── */
    async getZoneName(index) {
        try {
            const data = await this.readVariables([`G${index}.name`]);
            const name = data[`G${index}.name`];
            return (name && name.trim()) ? name.trim() : `Zone ${index}`;
        } catch {
            return `Zone ${index}`;
        }
    }

    /* ────────────────────────────────────────────────────────────
       Soll-Temperatur schreiben
       temp: Dezimalwert in °C (z.B. 21.5)
       Controller erwartet Integer ×100 (z.B. 2150)
    ──────────────────────────────────────────────────────────── */
    async setTargetTemperature(index, temp) {
        const value = Math.round(parseFloat(temp) * 100);

        if (isNaN(value)) {
            throw new Error(`Ungültiger Temperaturwert: ${temp}`);
        }

        const url = `${this.baseUrl}/writeVal.cgi?G${index}.SollTemp=${value}`;
        this.log.debug(`writeVal: G${index}.SollTemp = ${value} (${temp}°C)`);

        try {
            await this._client.get(url, {
                responseType:      'text',
                transformResponse: r => r
            });
        } catch (err) {
            throw new Error(`writeVal Fehler: ${err.message}`);
        }
    }
}

module.exports = LegacyAPI;
