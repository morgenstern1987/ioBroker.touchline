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
        this.host = options.host;
        this.username = options.username;
        this.password = options.password;
        this.token = options.token;
        this.protocol = options.protocol === 'https' ? 'https' : 'http';

        this.http = axios.create({
            timeout: 10000,
            validateStatus: code => code >= 200 && code < 500,
        });
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

    async request(path) {
        const url = `${this.protocol}://${this.host}${path}`;
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

        for (const path of paths) {
            try {
                snapshot.endpoints[path] = {
                    ok: true,
                    data: await this.request(path),
                };
                snapshot.successfulEndpoints++;
            } catch (error) {
                snapshot.endpoints[path] = {
                    ok: false,
                    error: error.message,
                };
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
