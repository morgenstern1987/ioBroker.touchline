'use strict';

const axios = require('axios');
const xml2js = require('xml2js');

class LegacyAPI {

    constructor(host) {

        this.host = host;
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    async request(registers) {

        const params = new URLSearchParams();

        params.append("n", registers.length);

        registers.forEach(r => params.append("R", r));

        const res = await axios.post(
            `http://${this.host}/cgi-bin/ILRReadValues.cgi`,
            params.toString(),
            {
                timeout: 4000,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const xml = await this.parser.parseStringPromise(res.data);

        const result = {};
        const regs = xml.result.reg;

        if (Array.isArray(regs)) {

            regs.forEach(r => {
                result[r.$.nr] = r._;
            });

        } else {

            result[regs.$.nr] = regs._;
        }

        return result;
    }

    async getZoneCount() {

        const res = await this.request([6]);

        return parseInt(res[6] || 0);
    }

    async getZones(zoneCount) {

        const registers = [];

        for (let i = 0; i < zoneCount; i++) {

            registers.push(10000 + i * 6);
            registers.push(10000 + i * 6 + 1);
        }

        return await this.request(registers);
    }

    async setTargetTemperature(zone, temp) {

        const register = 10000 + zone * 6;

        const value = Math.round(temp * 10);

        const params = new URLSearchParams();

        params.append("n", 1);
        params.append(`R${register}`, value);

        await axios.post(
            `http://${this.host}/cgi-bin/ILRReadValues.cgi`,
            params.toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );
    }
}

module.exports = LegacyAPI;
