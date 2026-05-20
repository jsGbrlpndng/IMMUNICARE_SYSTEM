const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/geo/search - Proxy to Nominatim for San Pedro, Laguna
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }

        console.log(`[GEO PROXY] Searching for: "${q}" in San Pedro, Laguna`);

        // Nominatim API Call with strict viewbox filtering for San Pedro
        // Viewbox: [left, top, right, bottom] -> [121.00, 14.36, 121.05, 14.31]
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: q,
                format: 'json',
                addressdetails: 1,
                limit: 5,
                viewbox: '120.9900,14.3800,121.0700,14.3000',
                bounded: 1,
                countrycodes: 'ph' // Ensure we stay in Philippines
            },
            headers: {
                'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)' 
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('[GEO ERROR]', error.response?.status, error.message);
        res.status(error.response?.status || 500).json({ 
            success: false,
            error: 'Geocoding service error',
            details: error.message 
        });
    }
});

// GET /api/geo/reverse - Proxy to Nominatim for reverse geocoding
router.get('/reverse', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        if (!lat || !lon) {
            return res.status(400).json({ error: 'Parameters lat and lon are required' });
        }

        const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                lat: lat,
                lon: lon,
                format: 'json',
                addressdetails: 1
            },
            headers: {
                'User-Agent': 'ImmuniCare-Thesis-App/1.0 (contact: support@immunicare.com)' 
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('[GEO REVERSE ERROR]', error.response?.status, error.message);
        res.status(error.response?.status || 500).json({ 
            success: false,
            error: 'Reverse geocoding service error',
            details: error.message 
        });
    }
});

module.exports = router;
