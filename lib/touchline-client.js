'use strict';

const axios = require('axios');

const NEW_API_PATHS = [
    '/api/v1/status',
    '/api/v1/system',
    '/api/v1/info',
    '/api/v1/zones',
    '/api/v1/rooms',
    '/api/v1/devices',
    '/api/v1/controllers',
    '/api/v1/sensors',
    '/api/v1/thermostats',
    '/api/v1/heatingcircuits',
];

const OLD_API_PATHS = [
    '/status',
    '/system',
    '/info',
    '/zones',
    '/rooms',
    '/devices',
    '/controllers',
    '/sensors',
    '/thermostats',
    '/json/status',
    '/json/system',
    '/json/info',
];

class TouchlineClient {
    constructor(options) {
        this.rawHost = String(options.host || '').trim();
        this.defaultPort = Number(options.port) || 80;
        this.username = options.username;
        this.password = options.password;
        this.token = options.token;
        this.defaultProtocol = options.protocol === 'https' ? 'https' : 'http';

        this.target = this.parseTarget(this.rawHost, this.defaultProtocol, this.defaultPort);

        this.http = axios.create({
            timeout: Math.max(1000, Number(options.requestTimeout) || 5000),
            validateStatus: code => code >= 200 && code < 500,
        });
    }

    parseTarget(hostInput, fallbackProtocol, fallbackPort) {
        const input = String(hostInput || '').trim();
        if (!input) {
            return {
                protocol: fallbackProtocol,
                host: '',
                port: fallbackPort,
            };
        }

        try {
            if (/^https?:\/\//i.test(input)) {
                const url = new URL(input);
                return {
                    protocol: url.protocol.replace(':', ''),
                    host: url.hostname,
                    port: Number(url.port) || fallbackPort,
                };
            }
        } catch {
            // Falls URL-Parsing fehlschlägt, unten als host:port behandeln
        }

        const trimmedHost = input.split('/')[0];
        if (trimmedHost.includes(':')) {
            const [host, maybePort] = trimmedHost.split(':');
            const port = Number(maybePort);
            return {
                protocol: fallbackProtocol,
                host,
                port: Number.isFinite(port) && port > 0 ? port : fallbackPort,
            };
        }

        return {
            protocol: fallbackProtocol,
            host: trimmedHost,
            port: fallbackPort,
        };
    }

    buildHeaders() {
        const headers = {
            Accept: 'application/json',
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }

        return headers;
    }

    buildAuth() {
        if (this.username && this.password) {
            return {
                username: this.username,
                password: this.password,
            };
        }

        return undefined;
    }

    buildBaseUrl() {
        return `${this.target.protocol}://${this.target.host}:${this.target.port}`;
    }

    async request(path) {
        const url = `${this.buildBaseUrl()}${path}`;
        const response = await this.http.get(url, {
            headers: this.buildHeaders(),
            auth: this.buildAuth(),
        });

        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status} for ${path}`);
        }

        return response.data;
    }

    normalizePaths(paths) {
        return [...new Set(paths
            .filter(Boolean)
            .map(path => String(path).trim())
            .filter(path => path.startsWith('/')))];
    }

    async fetchByPaths(apiType, paths) {
        const snapshot = {
            apiType,
            fetchedAt: new Date().toISOString(),
            endpoints: {},
            successfulEndpoints: 0,
        };

        const results = await Promise.all(paths.map(async path => {
            try {
                return [path, { ok: true, data: await this.request(path) }];
            } catch (error) {
                return [path, { ok: false, error: error.message }];
            }
        }));

        for (const [path, payload] of results) {
            snapshot.endpoints[path] = payload;
            if (payload.ok) {
                snapshot.successfulEndpoints++;
            }
        }

        return snapshot;
    }

    async fetchSnapshot(apiType, customPaths = []) {
        const normalizedCustom = this.normalizePaths(customPaths);

        if (apiType === 'new' || apiType === 'old') {
            const basePaths = apiType === 'new' ? NEW_API_PATHS : OLD_API_PATHS;
            return this.fetchByPaths(apiType, this.normalizePaths([...basePaths, ...normalizedCustom]));
        }

        const newSnapshot = await this.fetchByPaths('new', this.normalizePaths([...NEW_API_PATHS, ...normalizedCustom]));
        const oldSnapshot = await this.fetchByPaths('old', this.normalizePaths([...OLD_API_PATHS, ...normalizedCustom]));

        if (newSnapshot.successfulEndpoints >= oldSnapshot.successfulEndpoints) {
            return newSnapshot;
        }

        return oldSnapshot;
    }
}

module.exports = {
    TouchlineClient,
};
