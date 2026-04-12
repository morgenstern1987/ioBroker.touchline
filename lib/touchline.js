const axios = require("axios");
const xml2js = require("xml2js");

class Touchline {

    constructor(ip, adapter) {
        this.ip = ip;
        this.adapter = adapter;
        this.endpoint = null;
    }

    async detectAPI() {

        const endpoints = [
            "/status.json",
            "/status.xml",
            "/state.xml",
            "/data.xml"
        ];

        for (const ep of endpoints) {

            try {

                const url = "http://" + this.ip + ep;

                const res = await axios.get(url, {timeout:2000});

                this.endpoint = ep;

                this.adapter.log.info("Touchline API erkannt: " + ep);

                return;

            } catch (e) {}

        }

        throw new Error("Keine Touchline API gefunden");
    }

    async getZones() {

        if (!this.endpoint) {
            await this.detectAPI();
        }

        const url = "http://" + this.ip + this.endpoint;

        const res = await axios.get(url);

        if (this.endpoint.includes(".json")) {

            return this.parseJSON(res.data);

        } else {

            return await this.parseXML(res.data);

        }

    }

    parseJSON(data){

        if(!data.zones) return [];

        return data.zones.map(z=>({

            id:z.id,
            name:z.name || "Zone "+z.id,
            temperature:z.temperature,
            setpoint:z.setpoint,
            valve:z.valve || 0

        }));

    }

    async parseXML(xml){

        const parser = new xml2js.Parser();

        const data = await parser.parseStringPromise(xml);

        if(!data || !data.zones) return [];

        return data.zones.zone.map(z=>({

            id: z.id[0],
            name: z.name[0],
            temperature: parseFloat(z.temperature[0]),
            setpoint: parseFloat(z.setpoint[0]),
            valve: parseInt(z.valve[0])

        }));

    }

    async setTemp(zone,temp){

        const url =
            "http://" + this.ip +
            "/set?zone=" + zone +
            "&temp=" + temp;

        await axios.get(url);

    }

}

module.exports = Touchline;
