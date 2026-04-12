'use strict';

const utils = require('@iobroker/adapter-core');
const TouchlineLegacyAPI = require('./lib/api-legacy');
const TouchlineSLAPI = require('./lib/api-sl');

class TouchlineAdapter extends utils.Adapter {

    constructor(options = {}) {

        super({
            ...options,
            name: 'touchline'
        });

        this.api = null;
        this.apiType = null;
        this.pollTimer = null;
        this.connected = false;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    // ─────────────────────────────────────────────
    // Adapter start
    // ─────────────────────────────────────────────

    async onReady() {

        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: { name: 'Information' },
            native: {}
        });

        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'Connected',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false
            },
            native: {}
        });

        await this.setStateAsync('info.connection', false, true);

        const host = (this.config.host || '').trim();

        if (!host) {
            this.log.error('Keine IP-Adresse konfiguriert.');
            return;
        }

        this.log.info(`Verbinde mit Touchline Controller ${host}`);

        await this.detectAndConnect(host);
    }

    async onUnload(callback) {

        try {

            if (this.pollTimer) clearInterval(this.pollTimer);

            await this.setStateAsync('info.connection', false, true);

            callback();

        } catch {

            callback();
        }
    }

    // ─────────────────────────────────────────────
    // API Detection
    // ─────────────────────────────────────────────

    async detectAndConnect(host) {

        const timeout = this.config.requestTimeout || 5000;

        try {

            const api = new TouchlineSLAPI(host, timeout);

            await api.getModuleInfo();

            this.api = api;
            this.apiType = 'sl';

            this.log.info('Touchline SL API erkannt');

            await this.initObjectsSL();

            this.startPolling();

            return;

        } catch {}

        try {

            const api = new TouchlineLegacyAPI(host, timeout);

            await api.getZoneCount();

            this.api = api;
            this.apiType = 'legacy';

            this.log.info('Touchline Legacy API erkannt');

            await this.initObjectsLegacy();

            this.startPolling();

            return;

        } catch (e) {

            this.log.error(`Keine API erreichbar: ${e.message}`);
        }
    }

    // ─────────────────────────────────────────────
    // Objekt Initialisierung SL
    // ─────────────────────────────────────────────

    async initObjectsSL() {

        const zones = await this.api.getAllZones();

        for (const zone of zones) {

            await this.createZone(zone.id, zone.name);
        }
    }

    async initObjectsLegacy() {

        const count = await this.api.getZoneCount();

        const zones = await this.api.getAllZones(count);

        for (const zone of zones) {

            await this.createZone(zone.id, zone.name);
        }
    }

    // ─────────────────────────────────────────────
    // Zone Struktur
    // ─────────────────────────────────────────────

    async createZone(id, name) {

        const base = `zones.${id}`;

        await this.setObjectNotExistsAsync(base, {
            type: 'channel',
            common: { name },
            native: {}
        });

        await this.createState(`${base}.currentTemperature`, 'Ist Temperatur', false);
        await this.createState(`${base}.targetTemperature`, 'Soll Temperatur', true);
        await this.createState(`${base}.humidity`, 'Luftfeuchtigkeit', false);
        await this.createState(`${base}.modeRaw`, 'Modus', true);
    }

    async createState(id, name, write) {

        await this.setObjectNotExistsAsync(id, {
            type: 'state',
            common: {
                name,
                type: 'number',
                role: 'value',
                read: true,
                write
            },
            native: {}
        });
    }

    // ─────────────────────────────────────────────
    // Polling
    // ─────────────────────────────────────────────

    startPolling() {

        const interval = (this.config.pollInterval || 30) * 1000;

        this.log.info(`Polling alle ${interval / 1000} Sekunden`);

        this.poll();

        this.pollTimer = setInterval(() => this.poll(), interval);
    }

    async poll() {

        try {

            let zones;

            if (this.apiType === 'sl') {

                zones = await this.api.getAllZones();

            } else {

                const count = await this.api.getZoneCount();

                zones = await this.api.getAllZones(count);
            }

            for (const zone of zones) {

                await this.updateZone(zone);
            }

            await this.setStateAsync('info.connection', true, true);

        } catch (e) {

            this.log.warn(`Polling Fehler: ${e.message}`);

            await this.setStateAsync('info.connection', false, true);
        }
    }

    async updateZone(zone) {

        const base = `zones.${zone.id}`;

        await this.setStateAsync(`${base}.currentTemperature`, zone.currentTemperature, true);
        await this.setStateAsync(`${base}.targetTemperature`, zone.targetTemperature, true);

        if (zone.humidity !== undefined)
            await this.setStateAsync(`${base}.humidity`, zone.humidity, true);

        if (zone.modeRaw !== undefined)
            await this.setStateAsync(`${base}.modeRaw`, zone.modeRaw, true);
    }

    // ─────────────────────────────────────────────
    // Steuerung
    // ─────────────────────────────────────────────

    async onStateChange(id, state) {

        if (!state || state.ack) return;

        const parts = id.split('.');

        if (parts[2] !== 'zones') return;

        const zoneId = parts[3];
        const key = parts[4];

        try {

            if (key === 'targetTemperature') {

                await this.api.setTargetTemperature(zoneId, state.val);
            }

            if (key === 'modeRaw') {

                await this.api.setMode(zoneId, state.val);
            }

        } catch (e) {

            this.log.error(`Fehler beim Schreiben: ${e.message}`);
        }
    }

    // ─────────────────────────────────────────────
    // Admin UI Kommunikation
    // ─────────────────────────────────────────────

    async onMessage(obj) {

        if (!obj || !obj.command) return;

        if (obj.command === 'testConnection') {

            const host = obj.message.host;

            try {

                const sl = new TouchlineSLAPI(host, 3000);

                await sl.getModuleInfo();

                this.sendTo(obj.from, obj.command,
                    { result: 'ok', type: 'sl' },
                    obj.callback);

            } catch {

                try {

                    const legacy = new TouchlineLegacyAPI(host, 3000);

                    const count = await legacy.getZoneCount();

                    this.sendTo(obj.from, obj.command,
                        { result: 'ok', type: 'legacy', zones: count },
                        obj.callback);

                } catch (e) {

                    this.sendTo(obj.from, obj.command,
                        { error: e.message },
                        obj.callback);
                }
            }
        }
    }
}

// Adapter starten

if (require.main !== module) {

    module.exports = options => new TouchlineAdapter(options);

} else {

    new TouchlineAdapter();
}
