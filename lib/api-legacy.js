'use strict';

const axios = require('axios');
const xml2js = require('xml2js');

class LegacyAPI {

    constructor(host) {

        this.host = host;
        this.parser = new xml2js.Parser({ explicitArray: false });
    }

    async getRegisters(registers) {

        const body = registers.map(r => `R=${r}`).join('&');

        const res = await axios.post(
            `http://${this.host}/cgi-bin/ILRReadValues.cgi`,
            `n=${registers.length}&${body}`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const xml = await this.parser.parseStringPromise(res.data);

        const result = {};

        const regs = xml.result.reg;

        for (const r of regs) {

            result[r.$.nr] = r._;
        }

        return result;
    }

    async getZoneCount() {

        const res = await this.getRegisters([6]);

        return parseInt(res[6]);
    }
}

module.exports = LegacyAPI;
