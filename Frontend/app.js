// ---- Data referenced by the UI ----
const EMERGENCY_TYPE_LABELS = {
  accident: "Vehicle Accident", breakdown: "Vehicle Breakdown", medical: "Medical Emergency",
  security: "Security Threat", fire: "Fire Emergency", other: "Other"
};

const EMERGENCY_SERVICES = {
  default: { police: { name: "Local Police", phone: "100", relation: "emergency" }, fire: { name: "Fire Department", phone: "101", relation: "emergency" }, hospital: { name: "Ambulance Service", phone: "102", relation: "emergency" }, roadside: { name: "Roadside Assistance", phone: "", relation: "emergency" } },
  us: { police: { name: "Local Police", phone: "911", relation: "emergency" }, fire: { name: "Fire Department", phone: "911", relation: "emergency" }, hospital: { name: "Ambulance Service", phone: "911", relation: "emergency" }, roadside: { name: "AAA Roadside Assistance", phone: "1-800-222-4357", relation: "emergency" } },
  uk: { police: { name: "Police", phone: "999", relation: "emergency" }, fire: { name: "Fire Brigade", phone: "999", relation: "emergency" }, hospital: { name: "Ambulance", phone: "999", relation: "emergency" }, roadside: { name: "RAC Breakdown", phone: "0333-2000-999", relation: "emergency" } },
  eu: { police: { name: "Police", phone: "112", relation: "emergency" }, fire: { name: "Fire Department", phone: "112", relation: "emergency" }, hospital: { name: "Ambulance", phone: "112", relation: "emergency" }, roadside: { name: "Roadside Assistance", phone: "", relation: "emergency" } }
};
const REGION_LABELS = { default: "default region", us: "United States", uk: "United Kingdom", eu: "European Union" };

let users = [];       // "members" — people you can assign as a vehicle owner (no login)
let vehicles = [];
let contacts = [];
let trackingInterval = null;
let locationRequestId = 0;
let locationPending = false;
let trackingRequested = false;
let addressRequestId = 0;
let lastAddressLookup = 0;
let emergencyActive = false;
let activeEmergencyIds = [];
let emergencySending = false;
let sessionGeneration = 0;
let currentRegion = "default";
let currentLocation = null; // no fake default — null until we actually know it
let map, marker;

// ---- App bootstrap (called by auth.js once logged in) ----
async function initializeApp() {
  const generation = sessionGeneration;
  try {
    showNotification("Loading your data...", "success");
    const [uRes, vRes, eRes, cRes] = await Promise.all([
      authFetch(`${BASE_URL}/members`),
      authFetch(`${BASE_URL}/vehicles`),
      authFetch(`${BASE_URL}/emergency`),
      authFetch(`${BASE_URL}/contacts`)
    ]);
    if (!uRes.ok || !vRes.ok || !eRes.ok || !cRes.ok) throw new Error('Could not load account data');
    const [members, ownedVehicles, emergencies, savedContacts] = await Promise.all([uRes.json(), vRes.json(), eRes.json(), cRes.json()]);
    if (generation !== sessionGeneration) return;
    users = members;
    vehicles = ownedVehicles;
    contacts = savedContacts;
    activeEmergencyIds = emergencies.map(item => item._id);
    emergencyActive = activeEmergencyIds.length > 0;
    document.getElementById("emergencyBanner").classList.toggle('show', emergencyActive);
    document.getElementById("emergencyBannerDetail").textContent = emergencyActive
      ? `${activeEmergencyIds.length} saved active alert(s). Emergency services are not contacted by this app.` : '';
    updateDashboard();
    updateUserTable();
    updateVehicleTable();
    updateContactTable();
    updateVehicleOwnerOptions();
    checkVehicleOwnerDependency();
    updatePredefinedContacts();
    document.getElementById("currentLocation").textContent = "Select Update Location to request access.";
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
  document.querySelectorAll('.nav-tab').forEach(tab => {
    const selected = tab.dataset.section === sectionId;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
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
  if (emergencySending) return;
  emergencySending = true;
  const generation = sessionGeneration;
  closeEmergencyModal();
  const type = document.getElementById("emergencyType").value;
  const severity = document.getElementById("severityLevel").value;
  const description = document.getElementById("emergencyDescription").value;
  const extraEmail = document.getElementById("recipientEmail").value.trim();
  const recipientEmail = [...new Set([...users.map(u => u.email).filter(Boolean), ...(extraEmail ? [extraEmail] : [])])].join(',');
  showNotification("Saving alert and requesting email notification...", "success");
  try {
    const response = await authFetch(`${BASE_URL}/emergency`, {
      method: 'POST', body: JSON.stringify({ type, severity, description, location: currentLocation, recipientEmail })
    });
    if (!response.ok) throw new Error('Alert could not be saved');
    const alert = await response.json();
    if (generation !== sessionGeneration) return;
    activeEmergencyIds.push(alert._id);
    emergencyActive = true;
    updateDashboard();
    const emailStatus = alert.notificationStatus === 'accepted'
      ? 'Email accepted for sending; delivery is not confirmed.'
      : alert.notificationStatus === 'failed' ? 'Email failed. Contact your recipients directly.' : 'No email requested.';
    document.getElementById("emergencyBannerDetail").textContent =
      `Alert saved. ${emailStatus} Emergency services are not contacted by this app. Call them directly if needed.`;
    document.getElementById("emergencyBanner").classList.add('show');
    addActivity(`Saved emergency alert: ${EMERGENCY_TYPE_LABELS[type] || type}`);
    showNotification(`Alert saved. ${emailStatus}`, alert.notificationStatus === 'accepted' ? 'success' : 'error');
  } catch (err) {
    if (generation === sessionGeneration) showNotification('Could not confirm that the alert was saved. Contact recipients directly and reload to check before retrying.', 'error');
  } finally {
    if (generation === sessionGeneration) emergencySending = false;
  }
}

async function resolveEmergency() {
  const generation = sessionGeneration;
  try {
    for (const id of [...activeEmergencyIds]) {
      const response = await authFetch(`${BASE_URL}/emergency/${encodeURIComponent(id)}/resolve`, { method: 'PUT' });
      if (generation !== sessionGeneration) return;
      if (!response.ok) throw new Error('Could not resolve alert');
      activeEmergencyIds = activeEmergencyIds.filter(value => value !== id);
    }
    emergencyActive = false;
    updateDashboard();
    document.getElementById("emergencyBanner").classList.remove('show');
    addActivity('Emergency alerts resolved on server');
    showNotification('Emergency alerts resolved.');
  } catch (err) {
    if (generation === sessionGeneration) showNotification('Some alerts could not be resolved. Please retry.', 'error');
  }
}

function resetAppSession() {
  sessionGeneration++;
  locationRequestId++; addressRequestId++;
  locationPending = false; trackingRequested = false; lastAddressLookup = 0;
  document.getElementById("trackingErrorBanner").classList.remove("show");
  document.getElementById("trackingStatus").textContent = "Location not requested";
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = null;
  currentLocation = null;
  users = []; vehicles = []; contacts = [];
  activeEmergencyIds = []; emergencyActive = false; emergencySending = false;
  currentRegion = 'default';
  if (map) map.remove();
  map = null; marker = null;
  document.getElementById('activityList').textContent = '';
  document.getElementById('emergencyBanner').classList.remove('show');
  document.getElementById('emergencyBannerDetail').textContent = '';
  document.getElementById('currentCoords').textContent = '-';
  document.getElementById('currentLocation').textContent = 'Location unavailable';
  document.getElementById('lastUpdated').textContent = 'Never';
  updateDashboard(); updateUserTable(); updateVehicleTable(); updateContactTable(); updateVehicleOwnerOptions();
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
  const visibleMap = map;
  setTimeout(() => { if (map === visibleMap) visibleMap.invalidateSize(); }, 200);
}

// Free reverse-geocoding via OpenStreetMap's Nominatim service (no key required).
// Please keep usage light — Nominatim's public endpoint is rate-limited.
async function getAddress(lat, lng) {
  const generation = sessionGeneration;
  const request = ++addressRequestId;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    if (generation !== sessionGeneration || request !== addressRequestId) return;
    document.getElementById("currentLocation").textContent = data.display_name || "Address not available";
  } catch (err) {
    if (generation !== sessionGeneration || request !== addressRequestId) return;
    document.getElementById("currentLocation").textContent = "Address not available";
  }
}

function classifyRegion(lat, lng) {
  if (lat > 24.396308 && lat < 49.384358 && lng > -125 && lng < -66.93457) return "us";
  if (lat > 49 && lat < 61 && lng > -11 && lng < 2) return "uk";
  if (lat > 35 && lat < 71 && lng > -9 && lng < 40) return "eu";
  return "default";
}

// Request location only after a user action. Accuracy is reported, not inferred
// as proof that a particular positioning source (GPS/Wi-Fi) was used.
function locationMessage(text, warning = false) {
  document.getElementById('trackingStatus').textContent = text;
  document.getElementById('trackingErrorText').textContent = text;
  document.getElementById('trackingErrorBanner').classList.toggle('show', warning);
}
function clearLocation() {
  currentLocation = null; addressRequestId++;
  document.getElementById('currentCoords').textContent = '-';
  document.getElementById('currentLocation').textContent = 'Location unavailable';
  document.getElementById('lastUpdated').textContent = 'Never';
  if (map) map.remove(); map = null; marker = null;
}
function acceptLocation(lat, lng, accuracy, manual = false) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  currentLocation = { lat, lng };
  document.getElementById('currentCoords').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}${manual ? ' (entered manually)' : Number.isFinite(accuracy) ? ` (±${Math.round(accuracy)}m)` : ''}`;
  document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
  currentRegion = classifyRegion(lat, lng); updatePredefinedContacts(); initMap(lat, lng);
  if (manual) {
    addressRequestId++;
    document.getElementById('currentLocation').textContent = 'Manually entered location — not live tracking';
  } else if (!lastAddressLookup || Date.now() - lastAddressLookup >= 30000) {
    lastAddressLookup = Date.now();
    document.getElementById('currentLocation').textContent = 'Looking up address…';
    getAddress(lat, lng);
  }
  return true;
}
function getCurrentLocation() {
  if (locationPending) return;
  const generation = sessionGeneration;
  const request = ++locationRequestId;
  const fail = error => {
    if (generation !== sessionGeneration || request !== locationRequestId) return;
    locationPending = false; trackingRequested = false;
    if (trackingInterval !== null) clearInterval(trackingInterval);
    trackingInterval = null; clearLocation();
    const reason = error.code === 1
      ? 'Location permission is blocked. Allow location for this site in your browser settings, then retry.'
      : error.code === 3
      ? 'The browser did not return a location in 30 seconds. Retry, open the app in your usual browser, or enter coordinates below.'
      : 'This browser could not determine your location. Try your usual browser with location enabled, or enter coordinates below.';
    locationMessage(reason, true);
  };
  if (!navigator.geolocation) { fail({ code: 2 }); return; }
  locationPending = true;
  locationMessage(trackingRequested ? 'Starting tracking — waiting for location…' : 'Waiting for browser location…');
  navigator.geolocation.getCurrentPosition(position => {
    if (generation !== sessionGeneration || request !== locationRequestId) return;
    locationPending = false;
    const { latitude, longitude, accuracy } = position.coords;
    if (!acceptLocation(latitude, longitude, accuracy)) { fail({ code: 2 }); return; }
    const approximate = accuracy > 1000;
    locationMessage(approximate ? `Approximate location (±${Math.round(accuracy)}m). Check it before using it for an emergency.` : trackingRequested ? 'Local tracking active' : 'Location updated', approximate);
    if (trackingRequested && trackingInterval === null) trackingInterval = setInterval(getCurrentLocation, 10000);
  }, fail, { enableHighAccuracy: false, timeout: 30000, maximumAge: 10000 });
}
function startTracking() {
  if (trackingRequested) return;
  trackingRequested = true;
  getCurrentLocation();
}
function stopTracking() {
  trackingRequested = false;
  if (trackingInterval !== null) clearInterval(trackingInterval);
  trackingInterval = null; locationRequestId++; locationPending = false;
  locationMessage('Tracking stopped. Displayed coordinates are the last recorded location.');
}
function useManualLocation() {
  const latText = document.getElementById('manualLatitude').value.trim();
  const lngText = document.getElementById('manualLongitude').value.trim();
  const lat = Number(latText), lng = Number(lngText);
  if (!latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    locationMessage('Enter a latitude from -90 to 90 and longitude from -180 to 180.', true); return;
  }
  stopTracking();
  acceptLocation(lat, lng, null, true);
  locationMessage('Manual location selected. This is not live tracking.');
}

// ---- Predefined emergency contacts ----
function updatePredefinedContacts() {
  const services = EMERGENCY_SERVICES[currentRegion];
  document.getElementById("policeContact").textContent = `${services.police.name}: ${services.police.phone}`;
  document.getElementById("fireContact").textContent = `${services.fire.name}: ${services.fire.phone}`;
  document.getElementById("hospitalContact").textContent = `${services.hospital.name}: ${services.hospital.phone}`;
  document.getElementById("roadsideContact").textContent = `${services.roadside.name}: ${services.roadside.phone || 'Add your provider’s number'}`;
  const label = document.getElementById("regionLabel");
  if (label) label.textContent = REGION_LABELS[currentRegion] || currentRegion;
}

async function addPredefinedContact(type) {
  const service = EMERGENCY_SERVICES[currentRegion][type];
  if (!service.phone) { showNotification('Add your provider’s verified number manually.', 'error'); return; }
  await saveContact({ name: service.name, phone: service.phone, relation: service.relation });
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

function appendDataRow(tbody, values, onDelete) {
  const row = tbody.insertRow();
  values.forEach(value => { row.insertCell().textContent = String(value ?? ''); });
  const button = document.createElement('button');
  button.className = 'btn btn-danger';
  button.textContent = 'Delete';
  button.addEventListener('click', onDelete);
  row.insertCell().appendChild(button);
}

function updateUserTable() {
  const tbody = document.querySelector('#userTable tbody');
  tbody.textContent = '';
  users.forEach(user => appendDataRow(tbody, [user.name, user.email, user.phone || 'N/A'],
    () => deleteUser(user._id || user.id)));
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
  const tbody = document.querySelector('#vehicleTable tbody');
  tbody.textContent = '';
  vehicles.forEach(vehicle => {
    const owner = vehicle.owner && typeof vehicle.owner === 'object' ? vehicle.owner
      : users.find(u => String(u._id || u.id) === String(vehicle.owner));
    appendDataRow(tbody, [vehicle.make, vehicle.model, vehicle.year, vehicle.license, owner ? owner.name : 'Unknown'],
      () => deleteVehicle(vehicle._id || vehicle.id));
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

// ---- Personal emergency contacts (stored against the logged-in account) ----
async function saveContact(contact) {
  const generation = sessionGeneration;
  try {
    const response = await authFetch(`${BASE_URL}/contacts`, { method: 'POST', body: JSON.stringify(contact) });
    const data = await response.json();
    if (generation !== sessionGeneration) return false;
    if (!response.ok) { showNotification(data.msg || 'Could not save contact', 'error'); return false; }
    contacts.push(data);
    updateContactTable(); updateDashboard();
    addActivity(`Contact saved: ${data.name}`);
    showNotification('Contact saved to your account.');
    return true;
  } catch (err) {
    if (generation === sessionGeneration) showNotification('Could not save contact. Please retry.', 'error');
    return false;
  }
}

async function addContact() {
  const name = document.getElementById('contactName').value;
  const phone = document.getElementById('contactPhone').value;
  const relation = document.getElementById('contactRelation').value;
  if (!(name.trim() && phone.trim() && relation)) { showNotification('Please fill all fields', 'error'); return; }
  if (await saveContact({ name, phone, relation })) {
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactRelation').value = 'family';
  }
}

function updateContactTable() {
  const tbody = document.querySelector('#contactTable tbody');
  tbody.textContent = '';
  contacts.forEach(contact => appendDataRow(tbody, [contact.name, contact.phone, contact.relation],
    () => deleteContact(contact._id)));
}

async function deleteContact(id) {
  const generation = sessionGeneration;
  try {
    const response = await authFetch(`${BASE_URL}/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (generation !== sessionGeneration) return;
    if (!response.ok) { showNotification('Could not remove contact. Please retry.', 'error'); return; }
    contacts = contacts.filter(contact => contact._id !== id);
    updateContactTable(); updateDashboard();
    addActivity('Contact removed');
    showNotification('Contact removed from your account.');
  } catch (err) {
    if (generation === sessionGeneration) showNotification('Could not remove contact. Please retry.', 'error');
  }
}

// ---- Notifications ----
function showNotification(message, type = "success") {
  const notification = document.getElementById("notification");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.classList.add("show");
  setTimeout(() => notification.classList.remove("show"), 3000);
}
