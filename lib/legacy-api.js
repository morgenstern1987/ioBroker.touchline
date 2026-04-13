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

    async readVariables(variables) {

        const requests = variables.map(async variable => {

            try {

                const value = await this.read(variable);

                return { variable, value };

            } catch {

                return { variable, value: null };
            }

        });

        const responses = await Promise.all(requests);

        const result = {};

        responses.forEach(r => {

            if (r.value !== null) {

                result[r.variable] = r.value;
            }

        });

        return result;
    }

    async write(variable, value) {

        const url = `http://${this.host}/cgi-bin/writeVal.cgi?${variable}=${value}`;

        await axios.get(url, { timeout: 5000 });
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
