let trackingInterval = null;
let map = null;
let currentMarker = null;

// Initialize map
function initMap() {
    map = L.map('map').setView([20.9517, 85.8444], 13); // Default to Bhubaneswar, Odisha
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// Update location display
function updateLocationDisplay(position) {
    const coords = position.coords;
    const lat = coords.latitude;
    const lng = coords.longitude;
    
    // Update coordinates
    document.getElementById('currentCoords').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    
    // Update address using Geocoding API
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('currentLocation').textContent = data.display_name;
        })
        .catch(error => {
            document.getElementById('currentLocation').textContent = 'Address lookup failed';
        });
    
    // Update timestamp
    document.getElementById('lastUpdated').textContent = new Date().toLocaleString();
    
    // Update map marker
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }
    currentMarker = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 15);
}

// Handle location error
function handleLocationError(error) {
    console.error('Error getting location:', error);
    document.getElementById('currentLocation').textContent = 'Location unavailable';
    document.getElementById('currentCoords').textContent = '-';
    document.getElementById('lastUpdated').textContent = 'Never';
}

// Start tracking
function startTracking() {
    if (trackingInterval) {
        return; // Already tracking
    }
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(updateLocationDisplay, handleLocationError);
        trackingInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(updateLocationDisplay, handleLocationError);
        }, 1000); // Update every second
        
        // Show notification
        showNotification('Tracking started', 'success');
    } else {
        showNotification('Geolocation is not supported in this browser', 'error');
    }
}

// Stop tracking
function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
        showNotification('Tracking stopped', 'success');
    }
}

// Get current location once
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(updateLocationDisplay, handleLocationError);
    } else {
        showNotification('Geolocation is not supported in this browser', 'error');
    }
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', initMap);
