// ---- Data referenced by the UI ----
const EMERGENCY_TYPE_LABELS = {
  accident: "Vehicle Accident", breakdown: "Vehicle Breakdown", medical: "Medical Emergency",
  security: "Security Threat", fire: "Fire Emergency", other: "Other"
};

const EMERGENCY_SERVICES = {
  default: { police: { name: "Local Police", phone: "100", relation: "emergency" }, fire: { name: "Fire Department", phone: "101", relation: "emergency" }, hospital: { name: "Ambulance Service", phone: "102", relation: "emergency" }, roadside: { name: "Roadside Assistance", phone: "1800-123-4567", relation: "emergency" } },
  us: { police: { name: "Local Police", phone: "911", relation: "emergency" }, fire: { name: "Fire Department", phone: "911", relation: "emergency" }, hospital: { name: "Ambulance Service", phone: "911", relation: "emergency" }, roadside: { name: "AAA Roadside Assistance", phone: "1-800-222-4357", relation: "emergency" } },
  uk: { police: { name: "Police", phone: "999", relation: "emergency" }, fire: { name: "Fire Brigade", phone: "999", relation: "emergency" }, hospital: { name: "Ambulance", phone: "999", relation: "emergency" }, roadside: { name: "RAC Breakdown", phone: "0333-2000-999", relation: "emergency" } },
  eu: { police: { name: "Police", phone: "112", relation: "emergency" }, fire: { name: "Fire Department", phone: "112", relation: "emergency" }, hospital: { name: "Ambulance", phone: "112", relation: "emergency" }, roadside: { name: "Roadside Assistance", phone: "+44-123-456-7890", relation: "emergency" } }
};
const REGION_LABELS = { default: "default region", us: "United States", uk: "United Kingdom", eu: "European Union" };

let users = [];       // "members" — people you can assign as a vehicle owner (no login)
let vehicles = [];
let contacts = [];
let trackingInterval = null;
let emergencyActive = false;
let currentRegion = "default";
let currentLocation = null; // no fake default — null until we actually know it
let map, marker;

// ---- App bootstrap (called by auth.js once logged in) ----
async function initializeApp() {
  try {
    showNotification("Loading your data...", "success");
    const [uRes, vRes] = await Promise.all([
      authFetch(`${BASE_URL}/members`),
      authFetch(`${BASE_URL}/vehicles`)
    ]);
    users = uRes.ok ? await uRes.json() : [];
    vehicles = vRes.ok ? await vRes.json() : [];
    contacts = [
      { id: 1, name: 'Emergency Services', phone: '911', relation: 'emergency' },
      { id: 2, name: 'Family Contact', phone: '+1234567890', relation: 'family' }
    ];
    updateDashboard();
    updateUserTable();
    updateVehicleTable();
    updateContactTable();
    updateVehicleOwnerOptions();
    checkVehicleOwnerDependency();
    updatePredefinedContacts();
    getCurrentLocation();
    showNotification("Application loaded!", "success");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    showNotification("Could not load your data — check your connection.", "error");
  }
}

function showSection(sectionId) {
  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
  document.getElementById(sectionId).classList.add("active");
  if (typeof event !== 'undefined' && event.target) event.target.classList.add("active");
  if (sectionId === 'tracking' && currentLocation) initMap(currentLocation.lat, currentLocation.lng);
  if (sectionId === 'vehicles') checkVehicleOwnerDependency();
}

// ---- Emergency flow ----
function openEmergencyModal() {
  const emergencyType = document.getElementById("emergencyType").value;
  const severityLevel = document.getElementById("severityLevel").value;
  const description = document.getElementById("emergencyDescription").value;
  const recipientEmail = document.getElementById("recipientEmail").value;
  const storedUserEmails = users.map(u => u.email).filter(Boolean);
  let allEmails = [...storedUserEmails];
  if (recipientEmail) allEmails.push(recipientEmail);
  const finalEmails = [...new Set(allEmails)].join(',');
  if (!finalEmails) { showNotification("No recipient email found. Add a member or enter an email!", "error"); return; }

  document.getElementById("modalType").textContent = EMERGENCY_TYPE_LABELS[emergencyType] || emergencyType;
  document.getElementById("modalSeverity").textContent = severityLevel.charAt(0).toUpperCase() + severityLevel.slice(1);
  document.getElementById("modalDescription").textContent = description || "(no description provided)";
  document.getElementById("modalRecipients").textContent = finalEmails;
  const box = document.getElementById("emergencyModalBox");
  box.classList.toggle("critical", severityLevel === "critical");
  document.getElementById("emergencyModalOverlay").classList.add("show");
}

function closeEmergencyModal() {
  document.getElementById("emergencyModalOverlay").classList.remove("show");
}

async function confirmEmergency() {
  closeEmergencyModal();
  const emergencyType = document.getElementById("emergencyType").value;
  const severityLevel = document.getElementById("severityLevel").value;
  const description = document.getElementById("emergencyDescription").value;
  const recipientEmail = document.getElementById("recipientEmail").value;
  const storedUserEmails = users.map(u => u.email).filter(Boolean);
  let allEmails = [...storedUserEmails];
  if (recipientEmail) allEmails.push(recipientEmail);
  const finalEmails = [...new Set(allEmails)].join(',');

  showNotification("🚨 EMERGENCY ALERT TRIGGERED!", "error");
  emergencyActive = true;
  updateDashboard();
  const triggeredAt = new Date();
  addActivity(`Emergency Alert: ${emergencyType} (${severityLevel} severity)`);

  try {
    // NOTE: this now correctly hits /emergency (singular) to match the backend route.
    await authFetch(`${BASE_URL}/emergency`, {
      method: 'POST',
      body: JSON.stringify({ type: emergencyType, severity: severityLevel, description, location: currentLocation, recipientEmail: finalEmails })
    });
  } catch (err) {
    console.error('Failed to send emergency to backend', err);
    showNotification("Alert shown locally, but saving to the server failed.", "error");
  }

  let emergencyService = "";
  switch (emergencyType) {
    case "accident": case "security": emergencyService = "police"; break;
    case "fire": emergencyService = "fire"; break;
    case "medical": emergencyService = "hospital"; break;
    case "breakdown": emergencyService = "roadside"; break;
  }
  let contactedLabel = "";
  if (emergencyService) {
    const service = EMERGENCY_SERVICES[currentRegion][emergencyService];
    contactedLabel = `${service.name} at ${service.phone}`;
    addActivity(`Automatically contacted ${contactedLabel}`);
    showNotification(`Contacted ${service.name} at ${service.phone}`, "success");
  }
  document.getElementById("emergencyBannerDetail").textContent =
    `${EMERGENCY_TYPE_LABELS[emergencyType] || emergencyType} · ${severityLevel} severity · reported ${triggeredAt.toLocaleTimeString()}${contactedLabel ? " · Notified " + contactedLabel : ""}`;
  document.getElementById("emergencyBanner").classList.add("show");
  setTimeout(() => showNotification("Emergency services have been notified. Help is on the way!", "success"), 2000);
}

function resolveEmergency() {
  emergencyActive = false;
  updateDashboard();
  document.getElementById("emergencyBanner").classList.remove("show");
  addActivity("Emergency marked as resolved");
  showNotification("Emergency marked as resolved.", "success");
}

// ---- Map / GPS (Leaflet + OpenStreetMap — free, no API key needed) ----
function initMap(lat, lng) {
  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return;

  if (!map) {
    map = L.map(el).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
  } else {
    map.setView([lat, lng], 15);
  }

  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lng]).addTo(map).bindPopup("Your Location").openPopup();

  // Leaflet needs a resize nudge if the map div was hidden (display:none) when created
  setTimeout(() => map.invalidateSize(), 200);
}

// Free reverse-geocoding via OpenStreetMap's Nominatim service (no key required).
// Please keep usage light — Nominatim's public endpoint is rate-limited.
async function getAddress(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    document.getElementById("currentLocation").textContent = data.display_name || "Address not available";
  } catch (err) {
    document.getElementById("currentLocation").textContent = "Address not available";
  }
}

function classifyRegion(lat, lng) {
  if (lat > 24.396308 && lat < 49.384358 && lng > -125 && lng < -66.93457) return "us";
  if (lat > 49 && lat < 61 && lng > -11 && lng < 2) return "uk";
  if (lat > 35 && lat < 71 && lng > -9 && lng < 40) return "eu";
  return "default";
}

// Fixed: previously used the browser's default accuracy settings, which on a
// laptop/desktop can fall back to Wi-Fi/IP-based positioning that's wrong by
// entire states. We now always request GPS explicitly, surface the accuracy
// radius to the user, and refuse to silently trust a low-accuracy reading.
function getCurrentLocation() {
  if (!navigator.geolocation) {
    document.getElementById("trackingErrorText").textContent = "⚠️ Geolocation is not supported in this browser.";
    document.getElementById("trackingErrorBanner").classList.add("show");
    showNotification("Geolocation is not supported", "error");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      currentLocation = { lat, lng };
      document.getElementById("currentCoords").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} (±${Math.round(accuracy)}m)`;
      document.getElementById("lastUpdated").textContent = new Date().toLocaleTimeString();

      if (accuracy > 1000) {
        document.getElementById("trackingErrorText").textContent =
          `⚠️ Low-accuracy reading (±${Math.round(accuracy)}m) — this device has no GPS, so it's using Wi-Fi/network positioning, which can be off by an entire city or state. For accurate tracking, open this page on a phone with GPS/location enabled, outdoors if possible.`;
        document.getElementById("trackingErrorBanner").classList.add("show");
      } else {
        document.getElementById("trackingErrorBanner").classList.remove("show");
      }

      currentRegion = classifyRegion(lat, lng);
      getAddress(lat, lng);
      showNotification("Location updated successfully!", "success");
      updatePredefinedContacts();
      initMap(lat, lng);
    },
    error => {
      let reason = "Location unavailable — check browser permissions.";
      if (error.code === 1) reason = "Location access denied — enable permissions for this site, then Retry.";
      else if (error.code === 2) reason = "Location unavailable right now — check your device's GPS/network, then Retry.";
      else if (error.code === 3) reason = "Location request timed out — try again.";
      document.getElementById("trackingErrorText").textContent = `⚠️ ${reason}`;
      document.getElementById("trackingErrorBanner").classList.add("show");
      document.getElementById("currentLocation").textContent = "Location unavailable";
      document.getElementById("currentCoords").textContent = "-";
      showNotification(reason, "error");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function startTracking() {
  if (trackingInterval) { showNotification("Tracking is already active", "error"); return; }
  getCurrentLocation();
  trackingInterval = setInterval(getCurrentLocation, 5000);
  showNotification("Tracking started - updating every 5 seconds", "success");
}

function stopTracking() {
  if (!trackingInterval) { showNotification("No active tracking to stop", "error"); return; }
  clearInterval(trackingInterval);
  trackingInterval = null;
  showNotification("Tracking stopped", "success");
}

// ---- Predefined emergency contacts ----
function updatePredefinedContacts() {
  const services = EMERGENCY_SERVICES[currentRegion];
  document.getElementById("policeContact").textContent = `${services.police.name}: ${services.police.phone}`;
  document.getElementById("fireContact").textContent = `${services.fire.name}: ${services.fire.phone}`;
  document.getElementById("hospitalContact").textContent = `${services.hospital.name}: ${services.hospital.phone}`;
  document.getElementById("roadsideContact").textContent = `${services.roadside.name}: ${services.roadside.phone}`;
  const label = document.getElementById("regionLabel");
  if (label) label.textContent = REGION_LABELS[currentRegion] || currentRegion;
}

function addPredefinedContact(type) {
  const service = EMERGENCY_SERVICES[currentRegion][type];
  const newContact = { id: Date.now(), name: service.name, phone: service.phone, relation: service.relation };
  if (contacts.some(c => c.phone === service.phone)) {
    showNotification(`${service.name} is already in your contacts`, "error");
    return;
  }
  contacts.push(newContact);
  updateContactTable();
  updateDashboard();
  addActivity(`Added ${service.name} to emergency contacts`);
  showNotification(`${service.name} added to contacts!`, "success");
}

// ---- Dashboard / activity ----
function updateDashboard() {
  document.getElementById("totalUsers").textContent = users.length;
  document.getElementById("totalVehicles").textContent = vehicles.length;
  document.getElementById("emergencyContacts").textContent = contacts.length;
  document.getElementById("emergencyStatus").textContent = emergencyActive ? "ACTIVE" : "Inactive";
}

function addActivity(message) {
  const activityList = document.getElementById("activityList");
  const item = document.createElement("div");
  item.className = "activity-item";
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  activityList.insertBefore(item, activityList.firstChild);
}

// ---- Members (people you can assign vehicles to) ----
function checkVehicleOwnerDependency() {
  const warning = document.getElementById("vehicleOwnerWarning");
  const fields = document.getElementById("vehicleFormFields");
  if (users.length === 0) { warning.classList.add("show"); fields.classList.add("field-disabled"); }
  else { warning.classList.remove("show"); fields.classList.remove("field-disabled"); }
}

async function addUser() {
  const name = document.getElementById("userName").value;
  const email = document.getElementById("userEmail").value;
  const phone = document.getElementById("userPhone").value;
  if (!name || !email || !phone) { showNotification("Please fill all fields", "error"); return; }
  try {
    const response = await authFetch(`${BASE_URL}/members`, { method: 'POST', body: JSON.stringify({ name, email, phone }) });
    if (!response.ok) { showNotification("Failed to add member. Email might exist.", "error"); return; }
    const data = await response.json();
    const existingIndex = users.findIndex(u => u.email === data.email);
    if (existingIndex >= 0) users[existingIndex] = data; else users.push(data);
    updateUserTable(); updateVehicleOwnerOptions(); checkVehicleOwnerDependency(); updateDashboard();
    addActivity(`Member added: ${name}`);
    document.getElementById("userName").value = "";
    document.getElementById("userEmail").value = "";
    document.getElementById("userPhone").value = "";
    showNotification("Member added/updated successfully!", "success");
  } catch (err) { showNotification("Server error", "error"); }
}

function updateUserTable() {
  const tbody = document.querySelector("#userTable tbody");
  tbody.innerHTML = "";
  users.forEach(user => {
    const row = tbody.insertRow();
    row.innerHTML = `<td>${user.name}</td><td>${user.email}</td><td>${user.phone || 'N/A'}</td><td><button class="btn btn-danger" onclick="deleteUser('${user._id || user.id}')">Delete</button></td>`;
  });
}

async function deleteUser(id) {
  try {
    const response = await authFetch(`${BASE_URL}/members/${id}`, { method: 'DELETE' });
    if (!response.ok) { showNotification("Failed to delete member", "error"); return; }
    users = users.filter(u => (u._id || u.id) !== id);
    updateUserTable(); updateVehicleOwnerOptions(); checkVehicleOwnerDependency(); updateDashboard();
    addActivity(`Member deleted`);
    showNotification("Member deleted successfully!", "success");
  } catch (err) { showNotification("Server error", "error"); }
}

// ---- Vehicles ----
async function addVehicle() {
  const make = document.getElementById("vehicleMake").value;
  const model = document.getElementById("vehicleModel").value;
  const year = document.getElementById("vehicleYear").value;
  const license = document.getElementById("vehicleLicense").value;
  const ownerId = document.getElementById("vehicleOwner").value;
  if (!(make && model && year && license && ownerId)) { showNotification("Please fill all fields", "error"); return; }
  try {
    const response = await authFetch(`${BASE_URL}/vehicles`, { method: 'POST', body: JSON.stringify({ make, model, year: parseInt(year), license, owner: ownerId }) });
    if (!response.ok) { const e = await response.json(); showNotification(e.msg || "Failed to add vehicle", "error"); return; }
    const vehicle = await response.json();
    vehicles.push(vehicle);
    updateVehicleTable(); updateDashboard();
    addActivity(`New vehicle added: ${make} ${model}`);
    ["vehicleMake", "vehicleModel", "vehicleYear", "vehicleLicense", "vehicleOwner"].forEach(id => document.getElementById(id).value = "");
    showNotification("Vehicle added successfully!", "success");
  } catch (err) { showNotification("Server error", "error"); }
}

function updateVehicleTable() {
  const tbody = document.querySelector("#vehicleTable tbody");
  tbody.innerHTML = "";
  vehicles.forEach(vehicle => {
    const ownerObj = vehicle.owner && typeof vehicle.owner === 'object' ? vehicle.owner : users.find(u => String(u._id || u.id) === String(vehicle.owner));
    const row = tbody.insertRow();
    row.innerHTML = `<td>${vehicle.make}</td><td>${vehicle.model}</td><td>${vehicle.year}</td><td>${vehicle.license}</td><td>${ownerObj ? ownerObj.name : 'Unknown'}</td><td><button class="btn btn-danger" onclick="deleteVehicle('${vehicle._id || vehicle.id}')">Delete</button></td>`;
  });
}

async function deleteVehicle(id) {
  try {
    const response = await authFetch(`${BASE_URL}/vehicles/${id}`, { method: 'DELETE' });
    if (!response.ok) { showNotification("Failed to delete vehicle", "error"); return; }
    vehicles = vehicles.filter(v => (v._id || v.id) !== id);
    updateVehicleTable(); updateDashboard();
    addActivity(`Vehicle deleted`);
    showNotification("Vehicle deleted successfully!", "success");
  } catch (err) { showNotification("Server error", "error"); }
}

function updateVehicleOwnerOptions() {
  const select = document.getElementById("vehicleOwner");
  select.innerHTML = '<option value="">Select Owner</option>';
  users.forEach(user => {
    const option = document.createElement("option");
    option.value = user._id || user.id;
    option.textContent = user.name;
    select.appendChild(option);
  });
}

// ---- Personal emergency contacts (client-side only) ----
function addContact() {
  const name = document.getElementById("contactName").value;
  const phone = document.getElementById("contactPhone").value;
  const relation = document.getElementById("contactRelation").value;
  if (!(name && phone && relation)) { showNotification("Please fill all fields", "error"); return; }
  contacts.push({ id: Date.now(), name, phone, relation });
  updateContactTable(); updateDashboard();
  addActivity(`New emergency contact added: ${name}`);
  document.getElementById("contactName").value = "";
  document.getElementById("contactPhone").value = "";
  document.getElementById("contactRelation").value = "family";
  showNotification("Contact added successfully!", "success");
}

function updateContactTable() {
  const tbody = document.querySelector("#contactTable tbody");
  tbody.innerHTML = "";
  contacts.forEach(contact => {
    const row = tbody.insertRow();
    row.innerHTML = `<td>${contact.name}</td><td>${contact.phone}</td><td>${contact.relation}</td><td><button class="btn btn-danger" onclick="deleteContact(${contact.id})">Delete</button></td>`;
  });
}

function deleteContact(id) {
  contacts = contacts.filter(c => c.id !== id);
  updateContactTable(); updateDashboard();
  addActivity(`Emergency contact deleted`);
  showNotification("Contact deleted successfully!", "success");
}

// ---- Notifications ----
function showNotification(message, type = "success") {
  const notification = document.getElementById("notification");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.classList.add("show");
  setTimeout(() => notification.classList.remove("show"), 3000);
}
