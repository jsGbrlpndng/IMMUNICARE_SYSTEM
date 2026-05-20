const http = require('http');

async function checkApi() {
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/infants/e02ff00f-fa1f-4559-b647-86d9ba15167a/vaccination-record',
        method: 'GET',
        headers: {
            'x-user-id': 'ADMIN-001',
            'x-user-role': 'Admin'
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log(JSON.stringify(JSON.parse(data), null, 2));
        });
    });

    req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
    });

    req.end();
}

checkApi();
