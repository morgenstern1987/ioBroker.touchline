'use strict';

const utils     = require('@iobroker/adapter-core');
const LegacyAPI = require('./lib/legacy-api');

class TouchlineAdapter extends utils.Adapter {

    constructor(options = {}) {
        super({ ...options, name: 'touchline' });

        this.api       = null;
        this.pollTimer = null;
        this.zoneCount = 0;

        this.on('ready',       this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload',      this.onUnload.bind(this));
    }

    /* ────────────────────────────────────────────────────────────
       onReady
    ──────────────────────────────────────────────────────────── */
    async onReady() {

        await this.extendObjectAsync('info.connection', {
            type: 'state',
            common: {
                name:  'Connection',
                type:  'boolean',
                role:  'indicator.connected',
                read:  true,
                write: false,
                def:   false
            },
            native: {}
        });
        await this.setStateAsync('info.connection', false, true);

        const host = (this.config.host || '').trim();
        if (!host) {
            this.log.error('Keine IP-Adresse konfiguriert – bitte in den Adaptereinstellungen eintragen.');
            return;
        }

        this.api = new LegacyAPI(host, this.log);

        /* Raumanzahl + alle Namen in EINEM Request */
        let initData;
        try {
            initData = await this.api.readVariables(['totalNumberOfDevices']);
        } catch (err) {
            this.log.error(`Touchline-Controller nicht erreichbar (${host}): ${err.message}`);
            return;
        }

        const countRaw = initData['totalNumberOfDevices'];
        this.zoneCount = parseInt(countRaw, 10);
        if (isNaN(this.zoneCount) || this.zoneCount <= 0) {
            this.log.warn(`Ungültige Raumanzahl: "${countRaw}" – kein Polling gestartet.`);
            return;
        }
        this.log.info(`Touchline verbunden – ${this.zoneCount} Zone(n) gefunden.`);

        /* Alle Zonennamen auf einmal holen */
        const nameVars = Array.from({ length: this.zoneCount }, (_, i) => `G${i}.name`);
        let nameData   = {};
        try {
            nameData = await this.api.readVariables(nameVars);
        } catch (err) {
            this.log.warn(`Zonennamen konnten nicht gelesen werden: ${err.message}`);
        }

        await this._createZoneObjects(nameData);

        this.subscribeStates('zones.*.targetTemperature');
        await this._poll();

        const interval = Math.max(30, parseInt(this.config.pollInterval) || 60);
        this.log.info(`Polling-Intervall: ${interval} Sekunden.`);
        this.pollTimer = this.setInterval(() => this._poll(), interval * 1000);
    }

    /* ────────────────────────────────────────────────────────────
       Zonen-Objekte anlegen / aktualisieren
    ──────────────────────────────────────────────────────────── */
    async _createZoneObjects(nameData = {}) {
        for (let i = 0; i < this.zoneCount; i++) {

            const rawName = nameData[`G${i}.name`];
            const name    = (rawName && rawName.trim()) ? rawName.trim() : `Zone ${i}`;
            const base    = `zones.zone${i}`;

            await this.extendObjectAsync(base, {
                type:   'channel',
                common: { name },
                native: {}
            });

            await this._defState(`${base}.currentTemperature`, {
                name:  'Ist-Temperatur',
                type:  'number',
                role:  'value.temperature',
                unit:  '°C',
                read:  true,
                write: false
            });

            /* Kein hardcoded min/max – kommt dynamisch vom Controller
               nach dem ersten Poll via extendObjectAsync. */
            await this._defState(`${base}.targetTemperature`, {
                name:  'Soll-Temperatur',
                type:  'number',
                role:  'level.temperature',
                unit:  '°C',
                read:  true,
                write: true
            });

            await this._defState(`${base}.mode`, {
                name:   'Betriebsmodus',
                type:   'number',
                role:   'value',
                read:   true,
                write:  false,
                states: { 0: 'Auto', 1: 'Komfort', 2: 'Absenken', 3: 'Frostschutz' }
            });

            await this._defState(`${base}.weekProgram`, {
                name:  'Wochenprogramm',
                type:  'number',
                role:  'value',
                read:  true,
                write: false
            });

            await this._defState(`${base}.minTemp`, {
                name: 'Min-Temperatur', type: 'number', role: 'value.temperature', unit: '°C', read: true, write: false
            });
            await this._defState(`${base}.maxTemp`, {
                name: 'Max-Temperatur', type: 'number', role: 'value.temperature', unit: '°C', read: true, write: false
            });
            await this._defState(`${base}.step`, {
                name: 'Temperatur-Schrittweite', type: 'number', role: 'value', unit: '°C', read: true, write: false
            });

            await this._defState(`${base}.available`, {
                name:  'Online',
                type:  'boolean',
                role:  'indicator.reachable',
                read:  true,
                write: false
            });
        }
    }

    /* ────────────────────────────────────────────────────────────
       Poll – ALLE Zonen in EINEM einzigen POST-Request
    ──────────────────────────────────────────────────────────── */
    async _poll() {
        if (this.zoneCount === 0) return;

        /* Alle Variablen für alle Zonen sammeln */
        const vars = [];
        for (let i = 0; i < this.zoneCount; i++) {
            vars.push(
                `G${i}.RaumTemp`,
                `G${i}.SollTemp`,
                `G${i}.OPMode`,
                `G${i}.WeekProg`,
                `G${i}.SollTempMinVal`,
                `G${i}.SollTempMaxVal`,
                `G${i}.SollTempStepVal`,
                `G${i}.available`
            );
        }

        /* Ein einziger Request für alle Zonen */
        let data;
        try {
            data = await this.api.readVariables(vars);
        } catch (err) {
            this.log.error(`Polling-Fehler: ${err.message}`);
            await this.setStateAsync('info.connection', false, true);
            return;
        }

        for (let i = 0; i < this.zoneCount; i++) {
            const base = `zones.zone${i}`;

            const raumTemp = this._temp(data[`G${i}.RaumTemp`]);
            const sollTemp = this._temp(data[`G${i}.SollTemp`]);
            const minTemp  = this._temp(data[`G${i}.SollTempMinVal`]);
            const maxTemp  = this._temp(data[`G${i}.SollTempMaxVal`]);
            const stepTemp = this._temp(data[`G${i}.SollTempStepVal`]);

            this.log.debug(
                `Zone ${i}: Ist=${raumTemp}°C | Soll=${sollTemp}°C | ` +
                `Min=${minTemp}°C | Max=${maxTemp}°C | Step=${stepTemp}°C`
            );

            /* min/max/step dynamisch in das State-Objekt schreiben */
            if (minTemp > 0 || maxTemp > 0) {
                await this.extendObjectAsync(`${base}.targetTemperature`, {
                    type:   'state',
                    common: {
                        min:  minTemp  > 0 ? minTemp  : undefined,
                        max:  maxTemp  > 0 ? maxTemp  : undefined,
                        step: stepTemp > 0 ? stepTemp : undefined
                    },
                    native: {}
                });
            }

            await this.setStateAsync(`${base}.currentTemperature`, raumTemp,                              true);
            await this.setStateAsync(`${base}.targetTemperature`,  sollTemp,                              true);
            await this.setStateAsync(`${base}.mode`,               this._int(data[`G${i}.OPMode`]),       true);
            await this.setStateAsync(`${base}.weekProgram`,        this._int(data[`G${i}.WeekProg`]),     true);
            await this.setStateAsync(`${base}.minTemp`,            minTemp,                               true);
            await this.setStateAsync(`${base}.maxTemp`,            maxTemp,                               true);
            await this.setStateAsync(`${base}.step`,               stepTemp,                              true);
            await this.setStateAsync(`${base}.available`,          data[`G${i}.available`] === 'online',  true);
        }

        await this.setStateAsync('info.connection', true, true);
        this.log.debug(`Poll OK – ${this.zoneCount} Zone(n), 1 Request.`);
    }

    /* ────────────────────────────────────────────────────────────
       onStateChange – Soll-Temperatur schreiben
    ──────────────────────────────────────────────────────────── */
    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const parts   = id.split('.');
        const zoneStr = parts[parts.length - 2];
        const field   = parts[parts.length - 1];

        if (field !== 'targetTemperature') return;

        const zoneIdx = parseInt(zoneStr.replace('zone', ''), 10);
        if (isNaN(zoneIdx)) return;

        const val = parseFloat(state.val);
        if (isNaN(val)) return;

        try {
            await this.api.setTargetTemperature(zoneIdx, val);
            this.log.info(`Zone ${zoneIdx}: Soll-Temperatur auf ${val} °C gesetzt.`);
            await this.setStateAsync(`zones.zone${zoneIdx}.targetTemperature`, val, true);
        } catch (err) {
            this.log.error(`Zone ${zoneIdx}: Setzen fehlgeschlagen – ${err.message}`);
        }
    }

    /* ────────────────────────────────────────────────────────────
       onUnload
    ──────────────────────────────────────────────────────────── */
    onUnload(callback) {
        try {
            if (this.pollTimer) {
                this.clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        } catch (_) { /* ignore */ }
        callback();
    }

    /* ────────────────────────────────────────────────────────────
       Helpers
    ──────────────────────────────────────────────────────────── */

    /** Rohwert ×100 → °C  ("2150" → 21.5) */
    _temp(raw) {
        if (raw === undefined || raw === null) return 0;
        const s = String(raw).trim();
        if (s === '') return 0;
        const v = parseInt(s, 10);
        return isNaN(v) ? 0 : v / 100;
    }

    /** Rohwert → Integer */
    _int(raw) {
        if (raw === undefined || raw === null) return 0;
        const v = parseInt(String(raw).trim(), 10);
        return isNaN(v) ? 0 : v;
    }

    /** State-Objekt anlegen/aktualisieren */
    async _defState(id, common) {
        await this.extendObjectAsync(id, {
            type:   'state',
            common: { ...common },
            native: {}
        });
    }
}

/* ── Adapter-Start ───────────────────────────────────────────── */
if (require.main !== module) {
    module.exports = options => new TouchlineAdapter(options);
} else {
    new TouchlineAdapter();
}
