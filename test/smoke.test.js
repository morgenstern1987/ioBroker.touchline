'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TouchlineClient } = require('../lib/touchline-client');

test('normalizePaths filters and de-duplicates paths', () => {
    const client = new TouchlineClient({ host: '127.0.0.1' });
    const paths = client.normalizePaths(['/status', '/status', 'status', '   ', '/zones']);
    assert.deepEqual(paths, ['/status', '/zones']);
});

test('protocol defaults to http and supports https', () => {
    const c1 = new TouchlineClient({ host: '127.0.0.1' });
    const c2 = new TouchlineClient({ host: '127.0.0.1', protocol: 'https' });
    assert.equal(c1.target.protocol, 'http');
    assert.equal(c2.target.protocol, 'https');
});

test('buildBaseUrl uses configured port when host has no explicit port', () => {
    const client = new TouchlineClient({ host: '192.168.1.10', port: 8899 });
    assert.equal(client.buildBaseUrl(), 'http://192.168.1.10:8899');
});

test('legacy snapshot reports old api type', async () => {
    const client = new TouchlineClient({ host: '127.0.0.1' });
    client.request = async path => {
        if (path === '/status' || path.startsWith('/json/')) {
            return { ok: true };
        }
        throw new Error(`HTTP 404 for ${path}`);
    };

    const snapshot = await client.fetchSnapshot();
    assert.equal(snapshot.apiType, 'old');
    assert.ok(snapshot.successfulEndpoints > 0);
});

test('buildBaseUrl honors full URL input from host', () => {
    const client = new TouchlineClient({ host: 'http://192.168.10.52:8899', port: 80, protocol: 'https' });
    assert.equal(client.buildBaseUrl(), 'http://192.168.10.52:8899');
});
