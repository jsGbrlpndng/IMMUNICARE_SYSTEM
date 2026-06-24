const fs = require('fs');
let c = fs.readFileSync('routes/analytics.js', 'utf8');
c = c.replace(/\\`/g, '`');
c = c.replace(/\\\$/g, '$');
fs.writeFileSync('routes/analytics.js', c);
