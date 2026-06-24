import React from 'react';
import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';

const RoutingMachine = ({ startPoint, endPoint, onError }) => {
    const map = useMap();
    const [routingControl, setRoutingControl] = useState(null);

    useEffect(() => {
        if (!startPoint || !endPoint || !map) return;

        // Ensure L.Routing exists (safeguard)
        if (!L.Routing) {
            console.error('[Routing] leaflet-routing-machine is not loaded.');
            if (onError) onError('Routing service is currently unavailable.');
            return;
        }

        // Clean up previous instance
        if (routingControl) {
            map.removeControl(routingControl);
        }

        /* 
         * DEVELOPER NOTE: OSRM Public Demo
         * This uses the public OSRM demo backend (router.project-osrm.org).
         * It has NO uptime guarantee, may rate-limit requests, and is ONLY suitable for prototyping.
         * Do NOT use this in a production environment without deploying your own OSRM server.
         */
        const control = L.Routing.control({
            waypoints: [
                L.latLng(startPoint.lat, startPoint.lng),
                L.latLng(endPoint.lat, endPoint.lng)
            ],
            routeWhileDragging: false,
            addWaypoints: false,
            fitSelectedRoutes: true,
            showAlternatives: false,
            lineOptions: {
                styles: [{ color: '#3b82f6', opacity: 0.8, weight: 6, dashArray: '5, 10' }]
            },
            createMarker: () => null, // Hide default start/end markers since we have our own
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1'
            })
        });

        // Event listener for routing errors (e.g. rate limit, down server)
        control.on('routingerror', function(err) {
            console.error('[Routing] OSRM routing error:', err);
            if (onError) {
                onError('Unable to fetch route. The public routing service might be unavailable or rate-limited.');
            }
            // Remove the broken control to clear UI
            map.removeControl(control);
            setRoutingControl(null);
        });

        control.addTo(map);
        setRoutingControl(control);

        return () => {
            if (map && control) {
                try {
                    map.removeControl(control);
                } catch(e) {}
            }
        };
    }, [map, startPoint, endPoint]);

    return null;
};

export default RoutingMachine;
