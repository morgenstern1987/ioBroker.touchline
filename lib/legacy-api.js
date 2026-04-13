'use strict';

const axios = require('axios');

class LegacyAPI {

    constructor(host) {

        this.host = host;
    }

    async read(variable) {

        const url = `http://${this.host}/cgi-bin/readVal.cgi?${variable}`;

        const res = await axios.get(url, { timeout: 5000 });

        return res.data;
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

    async getZoneTemperature(index) {

        const current = await this.read(`G${index}.RaumTemp`);
        const target = await this.read(`G${index}.SollTemp`);

        return {
            current: parseInt(current) / 100,
            target: parseInt(target) / 100
        };
    }

    async setTargetTemperature(index, temp) {

        const value = Math.round(temp * 100);

        await this.write(`G${index}.SollTemp`, value);
    }
}

module.exports = LegacyAPI;
