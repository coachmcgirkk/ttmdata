let map;
let userMarker;
let roadMarkers = [];      // array for multiple green pins
let connectingLines = [];  // array for multiple blue dashed lines
let chainageLabels = [];   // array for chainage text labels
let kmIntervalPoints = []; // Track yellow dots for 1km intervals
let animationId;
let darkTileLayer;
let lightTileLayer;
let aerialTileLayer;
let currentTheme = 'light';
let currentMapType = 'standard'; // 'street' or 'aerial'
let chainageVisible = true; // Track chainage visibility state
let kmMarkersVisible = true;
let closestPointVisible = true;
let intervalLabelsVisible = true;
let linesVisible = true; // Control connecting lines visibility

// Dark mode toggle functionality
function toggleTheme() {
    const body = document.body;
    const toggleBtn = document.querySelector('.theme-toggle');
    
    if (currentTheme === 'light') {
        body.setAttribute('data-theme', 'dark');
        toggleBtn.innerHTML = '☀️ Light Mode';
        currentTheme = 'dark';
        
        // Switch to appropriate map tiles based on current map type
        if (map && currentMapType === 'street') {
            if (lightTileLayer) map.removeLayer(lightTileLayer);
            if (darkTileLayer) map.addLayer(darkTileLayer);
        }
    } else {
        body.removeAttribute('data-theme');
        toggleBtn.innerHTML = '🌙 Dark Mode';
        currentTheme = 'light';
        
        // Switch to appropriate map tiles based on current map type
        if (map && currentMapType === 'street') {
            if (darkTileLayer) map.removeLayer(darkTileLayer);
            if (lightTileLayer) map.addLayer(lightTileLayer);
        }
    }
    
    // Save preference
    localStorage.setItem('theme', currentTheme);
}

// Aerial view toggle functionality
function toggleAerial() {
    const toggleBtn = document.querySelector('.aerial-toggle');
    
    if (currentMapType === 'street') {
        // Switch to aerial view
        currentMapType = 'aerial';
        toggleBtn.innerHTML = '🗺️ Street View';
        
        if (map) {
            // Remove current tile layer
            if (currentTheme === 'dark' && darkTileLayer) {
                map.removeLayer(darkTileLayer);
            } else if (currentTheme === 'light' && lightTileLayer) {
                map.removeLayer(lightTileLayer);
            }
            
            // Add aerial layer
            if (aerialTileLayer) {
                map.addLayer(aerialTileLayer);
            }
        }
    } else {
        // Switch to street view
        currentMapType = 'street';
        toggleBtn.innerHTML = '🛰️ Aerial View';
        
        if (map) {
            // Remove aerial layer
            if (aerialTileLayer) {
                map.removeLayer(aerialTileLayer);
            }
            
            // Add appropriate street layer based on theme
            if (currentTheme === 'dark' && darkTileLayer) {
                map.addLayer(darkTileLayer);
            } else if (currentTheme === 'light' && lightTileLayer) {
                map.addLayer(lightTileLayer);
            }
        }
    }
    
    // Save preference
    localStorage.setItem('mapType', currentMapType);
}

// Load saved theme preference
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        toggleTheme();
    }
}

// Load saved map type preference
function loadMapType() {
    const savedMapType = localStorage.getItem('mapType');
    if (savedMapType === 'aerial') {
        toggleAerial();
    }
}

// Load label visibility preferences from localStorage
function loadLabelVisibility() {
    chainageVisible = localStorage.getItem('chainageVisible') !== 'false';
    kmMarkersVisible = localStorage.getItem('kmMarkersVisible') !== 'false';
    closestPointVisible = localStorage.getItem('closestPointVisible') !== 'false';
    intervalLabelsVisible = localStorage.getItem('intervalLabelsVisible') !== 'false';
    linesVisible = localStorage.getItem('linesVisible') !== 'false';
    
    // Update UI
    document.getElementById('chainageToggle').checked = chainageVisible;
    document.getElementById('kmMarkersToggle').checked = kmMarkersVisible;
    document.getElementById('closestPointToggle').checked = closestPointVisible;
    document.getElementById('intervalToggle').checked = intervalLabelsVisible;
    document.getElementById('linesToggle').checked = linesVisible;
}

// Save label visibility preferences to localStorage
function saveLabelVisibility() {
    localStorage.setItem('chainageVisible', chainageVisible);
    localStorage.setItem('kmMarkersVisible', kmMarkersVisible);
    localStorage.setItem('closestPointVisible', closestPointVisible);
    localStorage.setItem('intervalLabelsVisible', intervalLabelsVisible);
    localStorage.setItem('linesVisible', linesVisible);
}

// Toggle chainage labels
function toggleChainage() {
    chainageVisible = !chainageVisible;
    document.getElementById('chainageToggle').checked = chainageVisible;
    saveLabelVisibility();
    
    // Update existing labels on the map
    updateLabelVisibility();
}

// Toggle specific label types
function toggleLabelType(type) {
    switch(type) {
        case 'kmMarkers':
            kmMarkersVisible = !kmMarkersVisible;
            document.getElementById('kmMarkersToggle').checked = kmMarkersVisible;
            break;
        case 'closestPoint':
            closestPointVisible = !closestPointVisible;
            document.getElementById('closestPointToggle').checked = closestPointVisible;
            break;
        case 'interval':
            intervalLabelsVisible = !intervalLabelsVisible;
            document.getElementById('intervalToggle').checked = intervalLabelsVisible;
            break;
        case 'lines':
            linesVisible = !linesVisible;
            document.getElementById('linesToggle').checked = linesVisible;
            break;
    }
    saveLabelVisibility();
    updateLabelVisibility();
}

// Update visibility of existing labels on the map
function updateLabelVisibility() {
    // Update chainage labels
    chainageLabels.forEach(label => {
        if (chainageVisible) {
            if (!map.hasLayer(label)) {
                label.addTo(map);
            }
        } else {
            if (map.hasLayer(label)) {
                map.removeLayer(label);
            }
        }
    });
    
    // Update connecting lines (excluding the closest point line which is always visible)
    connectingLines.forEach((line, index) => {
        // Skip the last line (closest point line) - it's always visible
        if (index === connectingLines.length - 1) {
            return;
        }
        
        if (linesVisible) {
            if (!map.hasLayer(line)) {
                line.addTo(map);
            }
        } else {
            if (map.hasLayer(line)) {
                map.removeLayer(line);
            }
        }
    });
    
    // Update yellow dots and their labels (1km markers)
    // Process in pairs: dot, then label
    for (let i = 0; i < kmIntervalPoints.length; i += 2) {
        const dot = kmIntervalPoints[i];
        const label = kmIntervalPoints[i + 1];
        
        // Update dot visibility
        if (kmMarkersVisible) {
            if (!map.hasLayer(dot)) {
                dot.addTo(map);
            }
        } else {
            if (map.hasLayer(dot)) {
                map.removeLayer(dot);
            }
        }
        
        // Update label visibility (only if both toggles are enabled)
        if (kmMarkersVisible && chainageVisible) {
            if (!map.hasLayer(label)) {
                label.addTo(map);
            }
        } else {
            if (map.hasLayer(label)) {
                map.removeLayer(label);
            }
        }
    }
}

const xIcon = L.divIcon({
    className: 'custom-x-icon',
    html: '<div style="color: red; font-weight: bold; font-size: 24px; line-height: 24px;">&#10006;</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

function animateLines() {
    const time = Date.now() * -0.002 * 1; // Always 1x speed
    
    connectingLines.forEach((line, index) => {
        if (line._path) {
            // Create ripple effect by modifying dash offset
            const rippleOffset = Math.sin(time + index * 0.3) * 10;
            const dashOffset = (time * 20 + index * 5) % 40;
            
            // Apply animation to dash array and offset
            line._path.style.strokeDashoffset = dashOffset + rippleOffset;
            
            // Add subtle opacity pulsing for extra effect
            const baseOpacity = line.options.opacity;
            const pulseOpacity = baseOpacity + Math.sin(time * 2 + index * 0.2) * 0.1;
            line._path.style.strokeOpacity = Math.max(0.05, Math.min(1, pulseOpacity));
        }
    });
    
    animationId = requestAnimationFrame(animateLines);
}

function startAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    animateLines();
}

function stopAnimation() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function initMap(lat, lon) {
    map = L.map('map').setView([lat, lon], 15);
    
    // Create light, dark, and aerial tile layers
    lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors'
    });

    darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: 'Map data © OpenStreetMap contributors, © CARTO'
    });

    aerialTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Add appropriate tile layer based on current settings
    if (currentMapType === 'aerial') {
        aerialTileLayer.addTo(map);
    } else if (currentTheme === 'dark') {
        darkTileLayer.addTo(map);
    } else {
        lightTileLayer.addTo(map);
    }

    userMarker = L.marker([lat, lon], { icon: xIcon })
        .addTo(map)
        .bindPopup("Selected location");

    map.on('click', onMapClick);
}

function onMapClick(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    userMarker.setLatLng([lat, lon]).bindPopup("Selected location");

    // Stop existing animation
    stopAnimation();

    // Clear old markers and lines
    roadMarkers.forEach(marker => map.removeLayer(marker));
    roadMarkers = [];

    connectingLines.forEach(line => map.removeLayer(line));
    connectingLines = [];

    // Clear old chainage labels
    chainageLabels.forEach(label => map.removeLayer(label));
    chainageLabels = [];

    // Clear yellow dots
    kmIntervalPoints.forEach(marker => map.removeLayer(marker));
    kmIntervalPoints = [];

    getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
}

function displayClosestPointData(point, distance) {
    const distanceInMeters = distance * 1000;
    const tdistStart = point.Tdist_Start || point.TDIST_START || point.tdist_start;
    const aadt = point.AADT || point.aadt;
    const category = point.AADT_Intervention_Category || point.AADT_INTERVENTION_CATEGORY;
    const dataSource = point.data_source || point.dataSource;

    const closestPointInfo = document.getElementById('closest-point-info');
    if (closestPointInfo) {
        let content = `
            <h3>Closest Road Point</h3>
            <div class="road-info">
                <p><strong>Road:</strong> ${point.Description || 'Unknown Road'}</p>
                <p><strong>Distance from point:</strong> ${distanceInMeters.toFixed(0)}m</p>
                ${tdistStart !== undefined ? `<p><strong>Chainage:</strong> ${tdistStart}km</p>` : ''}
                ${aadt !== undefined ? `<p><strong>AADT:</strong> ${aadt.toLocaleString()}</p>` : ''}
                ${category !== undefined ? `<p><strong>Category:</strong> ${category}</p>` : ''}
                <p><strong>Road Section:</strong> ${point.Road_Section_Id || 'N/A'}</p>
                <p><strong>Carriageway:</strong> ${point.Carriageway_Code || 'N/A'}</p>
                ${dataSource !== undefined ? `<p><strong>Data Source:</strong> ${dataSource}</p>` : ''}
            </div>
        `;
        closestPointInfo.innerHTML = content;
    }
}

function getNearbyRoads(lat, lon, neighborCount = 1) {
    fetch(`/get_nearby_roads?lat=${lat}&lon=${lon}&count=${neighborCount}`)
        .then(response => response.json())
        .then(data => {
            if (data.length === 0) {
                document.getElementById('info').innerText = 'No nearby roads found.';
                return;
            }

            // Debug: Log the first point to see the actual structure
            console.log('First point data structure:', data[0]);
            console.log('All properties:', Object.keys(data[0]));

            // Use all points returned by the backend (controlled by slider)
            const points = data;

            // Extract distances
            const distances = points.map(p => p.distance);
            const minDist = Math.min(...distances);
            const maxDist = Math.max(...distances);

            // Helper: interpolate between green (0) and red (1)
            function interpolateColor(t) {
                const r = Math.floor(255 * t);
                const g = Math.floor(255 * (1 - t));
                const b = 0;
                return `rgb(${r},${g},${b})`;
            }

            // Helper: calculate opacity based on distance (green = 0.5, red = 0.05)
            function calculateOpacity(t) {
                // t ranges from 0 (closest/green) to 1 (farthest/red)
                // We want opacity from 0.5 (green) to 0.05 (red)
                return 0.5 - (t * 0.45); // 0.5 - 0.45 = 0.05 at maximum
            }

            // Display closest point data
            displayClosestPointData(points[0], points[0].distance);

            // First, add all the non-closest points (index 1 and onwards)
            points.slice(1).forEach((point, index) => {
                const roadLatLng = [point.geometry.latitude, point.geometry.longitude];
                const dist = point.distance;
                const actualIndex = index + 1; // Adjust index since we're using slice(1)

                // Normalize distance between 0 and 1
                const t = (dist - minDist) / (maxDist - minDist || 1);

                // Other points: gradient color
                const gradientColor = interpolateColor(t);
                const color = '#000';        // black border
                const fillColor = gradientColor;

                // Calculate line opacity based on distance
                const lineOpacity = calculateOpacity(t);

                // Add colored circle marker
                const circleMarker = L.circleMarker(roadLatLng, {
                    radius: 7,
                    fillColor: fillColor,
                    color: color,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                // Create popup content dynamically based on available properties
                let popupContent = `<strong>${point.Description || 'Road Point'}</strong><br>`;
                
                // Add distance (convert from km to m)
                const distanceInMeters = dist * 1000;
                popupContent += `Distance from point: ${distanceInMeters.toFixed(0)}m<br>`;
                
                // Check for common property variations using actual property names from the data
                const tdistStart = point.Tdist_Start || point.TDIST_START || point.tdist_start || point.TdistStart || point.tdistStart;
                const aadt = point.AADT || point.aadt;
                const category = point.AADT_Intervention_Category || point.AADT_INTERVENTION_CATEGORY || point.aadt_intervention_category;
                const dataSource = point.data_source || point.dataSource || point.Data_Source;
                const lat = point.geometry.latitude;
                const lon = point.geometry.longitude;
                
                if (tdistStart !== undefined) {
                    popupContent += `Chainage: ${tdistStart}km<br>`;
                }
                if (aadt !== undefined) {
                    popupContent += `AADT: ${aadt}<br>`;
                }
                if (category !== undefined) {
                    popupContent += `Category: ${category}<br>`;
                }
                if (dataSource !== undefined) {
                    popupContent += `Data Source: ${dataSource}<br>`;
                }
                // Add Google Maps and Street View links
                popupContent += `<a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank">View on Google Maps</a><br>`;
                popupContent += `<a href="https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}" target="_blank">Street View</a>`;

                circleMarker.bindPopup(popupContent);
                roadMarkers.push(circleMarker);

                // Add connecting line with gradient opacity
                const gradientLine = L.polyline(
                    [userMarker.getLatLng(), roadLatLng],
                    { 
                        color: gradientColor, 
                        weight: 2, 
                        dashArray: '8, 4',
                        opacity: lineOpacity
                    }
                );
                connectingLines.push(gradientLine);
                
                // Add to map if lines are visible
                if (linesVisible) {
                    gradientLine.addTo(map);
                }
            });

            // Now add the closest point (index 0) last so it renders on top
            const closestPoint = points[0];
            const closestLatLng = [closestPoint.geometry.latitude, closestPoint.geometry.longitude];
            
            // Add the closest point marker (blue, larger)
            const closestMarker = L.circleMarker(closestLatLng, {
                radius: 14, // Twice the size
                fillColor: 'blue',
                color: '#000',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(map);

            // Create popup content for closest point
            let closestPopupContent = `<strong>${closestPoint.Description || 'Road Point'}</strong><br>`;
            
            const distanceInMeters = closestPoint.distance * 1000;
            closestPopupContent += `Distance from point: ${distanceInMeters.toFixed(0)}m<br>`;
            
            const tdistStart = closestPoint.Tdist_Start || closestPoint.TDIST_START || closestPoint.tdist_start || closestPoint.TdistStart || closestPoint.tdistStart;
            const aadt = closestPoint.AADT || closestPoint.aadt;
            const category = closestPoint.AADT_Intervention_Category || closestPoint.AADT_INTERVENTION_CATEGORY || closestPoint.aadt_intervention_category;
            const dataSource = closestPoint.data_source || closestPoint.dataSource || closestPoint.Data_Source;
            const clat = closestPoint.geometry.latitude;
            const clon = closestPoint.geometry.longitude;
            
            if (tdistStart !== undefined) {
                closestPopupContent += `Chainage: ${tdistStart}km<br>`;
            }
            if (aadt !== undefined) {
                closestPopupContent += `AADT: ${aadt}<br>`;
            }
            if (category !== undefined) {
                closestPopupContent += `Category: ${category}<br>`;
            }
            if (dataSource !== undefined) {
                closestPopupContent += `Data Source: ${dataSource}<br>`;
            }
            // Add Google Maps and Street View links
            closestPopupContent += `<a href="https://www.google.com/maps?q=${clat},${clon}" target="_blank">View on Google Maps</a><br>`;
            closestPopupContent += `<a href="https://www.google.com/maps?q=&layer=c&cbll=${clat},${clon}" target="_blank">Street View</a>`;

            closestMarker.bindPopup(closestPopupContent);
            roadMarkers.push(closestMarker);

            // Draw line to the closest point with dash pattern for animation (always visible)
            const closestLine = L.polyline(
                [userMarker.getLatLng(), closestLatLng],
                { color: 'blue', weight: 3, opacity: 1.0, dashArray: '12, 6' }
            );
            connectingLines.push(closestLine);
            
            // Always add the closest point line to the map
            closestLine.addTo(map);

            // Add chainage labels for points across the entire map view
            const mapBounds = map.getBounds();
            const mapWidth = mapBounds.getEast() - mapBounds.getWest();
            const mapHeight = mapBounds.getNorth() - mapBounds.getSouth();
            
            // Create grid intervals (every 1/5th of map size - half the previous number)
            const latInterval = mapHeight / 5;
            const lonInterval = mapWidth / 5;
            
            // Find the closest point to each grid intersection that has chainage data
            const chainageGroups = {};
            points.forEach((point, index) => {
                const tdistStart = point.Tdist_Start || point.TDIST_START || point.tdist_start || point.TdistStart || point.tdistStart;
                
                if (tdistStart !== undefined && tdistStart !== null) {
                    const pointLat = point.geometry.latitude;
                    const pointLon = point.geometry.longitude;
                    
                    // Find which grid cell this point belongs to
                    const latGridIndex = Math.floor((pointLat - mapBounds.getSouth()) / latInterval);
                    const lonGridIndex = Math.floor((pointLon - mapBounds.getWest()) / lonInterval);
                    const gridKey = `${latGridIndex}_${lonGridIndex}`;
                    
                    // Calculate distance from point to grid center
                    const gridCenterLat = mapBounds.getSouth() + (latGridIndex + 0.5) * latInterval;
                    const gridCenterLon = mapBounds.getWest() + (lonGridIndex + 0.5) * lonInterval;
                    const distanceToGridCenter = Math.sqrt(
                        Math.pow(pointLat - gridCenterLat, 2) + 
                        Math.pow(pointLon - gridCenterLon, 2)
                    );
                    
                    // Calculate how close this chainage is to round 100m or 250m intervals
                    const chainageInMeters = tdistStart * 1000; // Convert km to meters
                    const distanceTo100m = Math.abs(chainageInMeters % 100);
                    const distanceTo250m = Math.abs(chainageInMeters % 250);
                    
                    // Prefer points closer to 100m or 250m intervals (whichever is closer)
                    const distanceToRoundInterval = Math.min(distanceTo100m, distanceTo250m);
                    
                    // Combined score: 70% weight to grid center proximity, 30% weight to round interval proximity
                    const gridScore = distanceToGridCenter * 0.7;
                    const intervalScore = distanceToRoundInterval * 0.3;
                    const combinedScore = gridScore + intervalScore;
                    
                    // If this is the first point for this grid cell or has a better combined score
                    if (!chainageGroups[gridKey] || 
                        combinedScore < chainageGroups[gridKey].combinedScore) {
                        chainageGroups[gridKey] = {
                            point: point,
                            chainage: tdistStart,
                            distanceToCenter: distanceToGridCenter,
                            distanceToRoundInterval: distanceToRoundInterval,
                            combinedScore: combinedScore,
                            gridCenter: [gridCenterLat, gridCenterLon]
                        };
                    }
                }
            });
            
            // Create labels for the closest point to each grid cell center
            Object.values(chainageGroups).forEach(group => {
                const roadLatLng = [group.point.geometry.latitude, group.point.geometry.longitude];
                const label = createChainageLabel(roadLatLng[0], roadLatLng[1], group.chainage);
                chainageLabels.push(label);
                
                // Add a different colored marker for points with labels
                const labeledPointMarker = L.circleMarker(roadLatLng, {
                    radius: 6,
                    fillColor: '#e0e0e0', // Light gray
                    color: '#666666',     // Darker gray border
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                chainageLabels.push(labeledPointMarker);
                
                // Add to map if both chainage and interval labels are visible
                if (chainageVisible && intervalLabelsVisible) {
                    label.addTo(map);
                    labeledPointMarker.addTo(map);
                }
            });

            // Add special label for the closest point with blue text and 2 decimal places (LAST so it's on top)
            const closestTdistStart = closestPoint.Tdist_Start || closestPoint.TDIST_START || closestPoint.tdist_start || closestPoint.TdistStart || closestPoint.tdistStart;
            if (closestTdistStart !== undefined && closestTdistStart !== null) {
                const closestLabel = createClosestPointLabel(closestLatLng[0], closestLatLng[1], closestTdistStart);
                chainageLabels.push(closestLabel);
                // Add to map if both chainage and closest point labels are visible (LAST so it's on top)
                if (chainageVisible && closestPointVisible) {
                    closestLabel.addTo(map);
                }
            }

            // Add yellow dots for points closest to 1km intervals (always visible)
            const kmGroups = {};
            points.forEach(point => {
                const tdistStart = point.Tdist_Start || point.TDIST_START || point.tdist_start || point.TdistStart || point.tdistStart;
                if (tdistStart !== undefined && tdistStart !== null) {
                    // Check if this point is within 20m of a 1km mark
                    const distanceToNearestKm = Math.abs(tdistStart - Math.round(tdistStart));
                    if (distanceToNearestKm <= 0.02) { // 20m = 0.02km
                        const nearestKm = Math.round(tdistStart);
                        
                        // If this is the first point for this km mark or closer than existing
                        if (!kmGroups[nearestKm] || distanceToNearestKm < kmGroups[nearestKm].distance) {
                            kmGroups[nearestKm] = {
                                point: point,
                                distance: distanceToNearestKm,
                                chainage: tdistStart
                            };
                        }
                    }
                }
            });
            
            // Add yellow dots and chainage labels for the closest point to each 1km mark
            Object.values(kmGroups).forEach(group => {
                const kmLatLng = [group.point.geometry.latitude, group.point.geometry.longitude];
                
                // Add yellow dot
                const kmMarker = L.circleMarker(kmLatLng, {
                    radius: 5,
                    fillColor: '#ffeb3b', // Yellow
                    color: '#f57f17',     // Darker yellow border
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                });
                kmIntervalPoints.push(kmMarker);
                
                // Add chainage label for 1km markers
                const kmLabel = createChainageLabel(kmLatLng[0], kmLatLng[1], group.chainage);
                kmIntervalPoints.push(kmLabel);
                
                // Add to map if km markers are visible
                if (kmMarkersVisible) {
                    kmMarker.addTo(map);
                    if (chainageVisible) {
                        kmLabel.addTo(map);
                    }
                }
            });

            // Start the ripple animation
            startAnimation();

            document.getElementById('info').innerText =
                `Showing ${points.length} roads. Lines connect to all road points with animated ripples.`;
        })
        .catch(error => {
            console.error('Error fetching nearby roads:', error);
            document.getElementById('info').innerText = 'Error loading nearby road data.';
        });
}

function getLocationAndInit() {
    // If you're not on localhost, skip geolocation
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        console.log("Using hardcoded fallback location (Brisbane)");
        const lat = -27.4698;
        const lon = 153.0251;
        initMap(lat, lon);
        getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
        return;
    }

    // If you are on localhost, try using geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            initMap(lat, lon);
            getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
        }, () => {
            console.log("Geolocation failed, using fallback");
            const lat = -27.4698;
            const lon = 153.0251;
            initMap(lat, lon);
            getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
        });
    } else {
        console.log("Geolocation not supported, using fallback");
        const lat = -27.4698;
        const lon = 153.0251;
        initMap(lat, lon);
        getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
    }
}

// Function to create chainage label
function createChainageLabel(lat, lon, chainageValue) {
    // Calculate the closest 100m or 250m interval
    const chainageInMeters = chainageValue * 1000; // Convert km to meters
    const distanceTo100m = Math.abs(chainageInMeters % 100);
    const distanceTo250m = Math.abs(chainageInMeters % 250);
    
    let displayValue;
    let isExact = false;
    
    if (distanceTo100m <= distanceTo250m) {
        // Closer to 100m interval
        const closest100m = Math.round(chainageInMeters / 100) * 100;
        displayValue = (closest100m / 1000).toFixed(2); // Convert back to km
        isExact = distanceTo100m === 0;
    } else {
        // Closer to 250m interval
        const closest250m = Math.round(chainageInMeters / 250) * 250;
        displayValue = (closest250m / 1000).toFixed(2); // Convert back to km
        isExact = distanceTo250m === 0;
    }
    
    // Add "~" prefix if not exact
    const finalDisplayValue = isExact ? displayValue : `~${displayValue}`;
    
    // Create a custom icon for the label
    const labelIcon = L.divIcon({
        className: 'chainage-label',
        html: `<div style="
            background: rgba(255, 255, 255, 0.9);
            border: 2px solid #333;
            border-radius: 4px;
            padding: 2px 6px;
            font-size: 12px;
            font-weight: bold;
            color: #333;
            white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            display: inline-block;
            text-align: center;
        ">${finalDisplayValue}</div>`,
        iconSize: null,
        iconAnchor: null
    });
    
    return L.marker([lat, lon], { icon: labelIcon });
}

// Function to create closest point label with blue text and 2 decimal places
function createClosestPointLabel(lat, lon, chainageValue) {
    // Format to 2 decimal places
    const formattedChainage = parseFloat(chainageValue).toFixed(2);
    
    // Create a custom icon for the closest point label
    const labelIcon = L.divIcon({
        className: 'closest-chainage-label',
        html: `<div style="
            background: rgba(255, 255, 255, 0.95);
            border: 2px solid #0066cc;
            border-radius: 4px;
            padding: 3px 8px;
            font-size: 13px;
            font-weight: bold;
            color: #0066cc;
            white-space: nowrap;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            display: inline-block;
            text-align: center;
        ">${formattedChainage}</div>`,
        iconSize: null,
        iconAnchor: null
    });
    
    return L.marker([lat, lon], { icon: labelIcon });
}

// Search functionality
function searchLocation() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    
    if (!query) {
        alert('Please enter a city or address to search for.');
        return;
    }
    
    // Show loading state
    const searchButton = document.getElementById('searchButton');
    const originalText = searchButton.innerHTML;
    searchButton.innerHTML = '⏳';
    searchButton.disabled = true;
    
    // Use OpenStreetMap Nominatim API for geocoding
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    
    fetch(searchUrl)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const location = data[0];
                const lat = parseFloat(location.lat);
                const lon = parseFloat(location.lon);
                
                // Move map to the found location
                map.setView([lat, lon], 12);
                
                // Update user marker
                userMarker.setLatLng([lat, lon]).bindPopup("Searched location: " + location.display_name);
                
                // Get nearby roads for the new location
                getNearbyRoads(lat, lon, parseInt(document.getElementById('neighborSlider').value));
                
                // Show success message
                document.getElementById('info').innerText = `Found: ${location.display_name}`;
                
                // Clear search input
                searchInput.value = '';
            } else {
                alert('Location not found. Please try a different search term.');
            }
        })
        .catch(error => {
            console.error('Search error:', error);
            alert('Search failed. Please check your internet connection and try again.');
        })
        .finally(() => {
            // Restore button state
            searchButton.innerHTML = originalText;
            searchButton.disabled = false;
        });
}

// Allow search on Enter key press
function setupSearchEnterKey() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            searchLocation();
        }
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Set up event listeners for controls
    document.getElementById('neighborSlider').addEventListener('input', function() {
        document.getElementById('neighborValue').textContent = this.value;
    });

    // Set up event listeners for label toggles
    document.getElementById('chainageToggle').addEventListener('change', toggleChainage);
    document.getElementById('kmMarkersToggle').addEventListener('change', () => toggleLabelType('kmMarkers'));
    document.getElementById('closestPointToggle').addEventListener('change', () => toggleLabelType('closestPoint'));
    document.getElementById('intervalToggle').addEventListener('change', () => toggleLabelType('interval'));
    document.getElementById('linesToggle').addEventListener('change', () => toggleLabelType('lines'));

    // Load saved preferences
    loadTheme();
    loadMapType();
    loadLabelVisibility();
    getLocationAndInit();

    // Set up search functionality
    setupSearchEnterKey();
});
