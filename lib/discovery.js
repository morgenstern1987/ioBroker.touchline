'use strict';

const axios = require('axios');
const os = require('os');

function getLocalSubnet() {

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

    const subnet = getLocalSubnet();

    if (!subnet) {

        adapter.log.error('Kein 192.168.x.x Netzwerk gefunden');

        return [];
    }

    adapter.log.info(`Starte Touchline Discovery im Netz ${subnet}.0/24`);

    const found = [];

    const tasks = [];

    for (let i = 1; i < 255; i++) {

        const ip = `${subnet}.${i}`;

        tasks.push(checkIP(ip, adapter, found));
    }

    await Promise.all(tasks);

    return found;
}

async function checkIP(ip, adapter, found) {

    try {

        const res = await axios.get(`http://${ip}/api/v1/module`, { timeout: 800 });

        if (res.data) {

            adapter.log.info(`Touchline SL gefunden: ${ip}`);

            found.push({
                ip,
                type: 'sl'
            });

            return;
        }

    } catch {}

    try {

        const res = await axios.get(`http://${ip}/cgi-bin/ILRReadValues.cgi?n=1&R=6`, { timeout: 800 });

        if (res.data) {

            adapter.log.info(`Touchline Legacy gefunden: ${ip}`);

            found.push({
                ip,
                type: 'legacy'
            });

        }

    } catch {}
}

module.exports = discoverTouchline;
