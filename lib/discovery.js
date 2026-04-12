'use strict';

const axios = require('axios');
const os = require('os');

function getSubnet() {

    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {

        for (const iface of interfaces[name]) {

            if (iface.family === 'IPv4' && !iface.internal) {

                if (iface.address.startsWith('192.168.')) {

                    const parts = iface.address.split('.');

                    return `${parts[0]}.${parts[1]}.${parts[2]}`;
                }
            }
        }
    }

    return null;
}

async function discoverTouchline(adapter) {

    const subnet = getSubnet();

    if (!subnet) return [];

    const found = [];

    for (let i = 1; i < 255; i++) {

        const ip = `${subnet}.${i}`;

        try {

            const res = await axios.get(`http://${ip}/api/v1/module`, {
                timeout: 500
            });

            if (res.data) {

                found.push({ ip, type: 'sl' });
            }

        } catch {}
    }

    return found;
}

module.exports = discoverTouchline;
