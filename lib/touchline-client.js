'use strict';

const axios = require('axios');

const LEGACY_API_PATHS = [
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
    '/json/thermostats',
    '/json/zones',
    '/json/rooms',
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
            return { protocol: fallbackProtocol, host: '', port: fallbackPort };
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
            // fallback below
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
        const headers = { Accept: 'application/json' };
        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        return headers;
    }

    buildAuth() {
        if (this.username && this.password) {
            return { username: this.username, password: this.password };
        }
        return undefined;
    }

    buildBaseUrl(target = this.target) {
        return `${target.protocol}://${target.host}:${target.port}`;
    }

    async request(path, target = this.target) {
        const response = await this.http.get(`${this.buildBaseUrl(target)}${path}`, {
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

    async fetchByPaths(paths, target = this.target) {
        const snapshot = {
            apiType: 'old',
            fetchedAt: new Date().toISOString(),
            baseUrl: this.buildBaseUrl(target),
            endpoints: {},
            successfulEndpoints: 0,
        };

        const results = await Promise.all(paths.map(async path => {
            try {
                return [path, { ok: true, data: await this.request(path, target) }];
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

    async fetchSnapshot(customPaths = []) {
        const normalizedCustom = this.normalizePaths(customPaths);
        const paths = this.normalizePaths([...LEGACY_API_PATHS, ...normalizedCustom]);

        const primary = await this.fetchByPaths(paths, this.target);
        if (primary.successfulEndpoints > 0) {
            return primary;
        }

        const fallbackPorts = [80, 8899].filter(port => port !== this.target.port);
        let best = primary;

        for (const port of fallbackPorts) {
            const candidate = await this.fetchByPaths(paths, { ...this.target, port });
            if (candidate.successfulEndpoints > best.successfulEndpoints) {
                best = candidate;
            }
        }

        return best;
    }
}

module.exports = { TouchlineClient };
