'use strict';

const axios = require('axios');

class LegacyAPI {

    constructor(host) {
        this.host = host;
    }

    async read(variable) {

        const url = `http://${this.host}/cgi-bin/readVal.cgi?${variable}`;

        const res = await axios.get(url, {
            timeout: 5000,
            responseType: "text",
            transformResponse: r => r
        });

        return String(res.data).trim();
    }

    async readMultiple(variables) {

        const query = variables.join("&");

        const url = `http://${this.host}/cgi-bin/readVal.cgi?${query}`;

        const res = await axios.get(url, {
            timeout: 5000,
            responseType: "text",
            transformResponse: r => r
        });

        const text = String(res.data).trim();

        // DEBUG
        console.log("Touchline RAW Antwort:");
        console.log(text);

        const lines = text.split(/[\n\r;]+/).filter(l => l.trim() !== "");

        const result = {};

        // Fall 1: Format "key=value"
        if (lines.some(l => l.includes("="))) {

            lines.forEach(line => {

                const parts = line.split("=");

                if (parts.length === 2) {

                    result[parts[0].trim()] = parts[1].trim();
                }

            });

        }
        // Fall 2: Nur Werte → Reihenfolge der Anfrage
        else {

            variables.forEach((variable, index) => {

                if (lines[index] !== undefined) {
                    result[variable] = lines[index].trim();
                }

            });

        }

        return result;
    }

    async write(variable, value) {

        const url = `http://${this.host}/cgi-bin/writeVal.cgi?${variable}=${value}`;

        await axios.get(url, {
            timeout: 5000
        });
    }

    async getZoneCount() {

        const result = await this.read("R0.numberOfPairedDevices");

        return parseInt(result);
    }

    async getZoneName(index) {

        try {

            const name = await this.read(`G${index}.name`);

            return name || `Zone ${index}`;

        } catch {

            return `Zone ${index}`;
        }
    }

    async setTargetTemperature(index, temp) {

        const value = Math.round(temp * 100);

        await this.write(`G${index}.SollTemp`, value);
    }

}

module.exports = LegacyAPI;
