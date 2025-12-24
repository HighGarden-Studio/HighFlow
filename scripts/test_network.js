const fetch = require('node-fetch');

async function testConnection(url) {
    console.log(`Testing connection to: ${url}`);
    try {
        const res = await fetch(url);
        console.log(`Response status: ${res.status}`);
    } catch (err) {
        console.error(`Status: Error - ${err.code || err.message}`);
    }
}

async function main() {
    await testConnection('http://localhost:8081');
    await testConnection('http://127.0.0.1:8081');
}

main();
