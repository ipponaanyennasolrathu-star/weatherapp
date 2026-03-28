document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.firebaseImports === 'undefined') {
        console.error("Firebase imports not found. Check index.html order.");
        return;
    }

    const { 
        initializeApp, getAuth, signInAnonymously, 
        getFirestore, doc, setDoc, getDoc, 
        getDatabase, ref, onValue
    } = window.firebaseImports;

    const appId = window.__app_id;
    const firebaseConfig = window.__firebase_config ? JSON.parse(window.__firebase_config) : null;
    
    let db; 
    let rtdb; 
    let auth;
    let userId = 'anonymous';
    let userLocation = "VIT Chennai, India"; 

    // This object stores the live data from your ESP32
    let currentWeatherData = { temperature: 0, humidity: 0, rain_percent: 0, is_dark: false };

    // --- DOM Elements ---
    const locationElement = document.getElementById('currentLocation');
    const tempElement = document.getElementById('currentTemp');
    const humidityElement = document.getElementById('currentHumidity');
    const rainElement = document.getElementById('currentRain');
    const lightElement = document.getElementById('currentLight'); 
    
    const alertBox = document.getElementById('alertBox');
    const suggestionsList = document.getElementById('safetySuggestions');
    const lastUpdatedElement = document.getElementById('lastUpdated');
    const alertStatus = document.getElementById('alertStatus');
    const themeColorPicker = document.getElementById('themeColor');
    
    const agriActionElement = document.getElementById('agriAction');
    const cropSuggestionElement = document.getElementById('cropSuggestion');

    const locationModal = document.getElementById('locationModal');
    const closeModalButton = document.getElementById('closeModal');
    const manualLocationInput = document.getElementById('manualLocationInput');
    const saveLocationButton = document.getElementById('saveLocation');
    const useGeoLocationButton = document.getElementById('useGeoLocation');

    async function initializeFirebase() {
        if (!firebaseConfig) return;
        try {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            rtdb = getDatabase(app);
            auth = getAuth(app);
            
            await signInAnonymously(auth);
            userId = auth.currentUser.uid;

            await loadPreferences();
            listenToESP32(); 
        } catch (error) {
            console.error(`Firebase init failed: ${error.message}`);
        }
    }
    
    // --- THE CORE FIX FOR YOUR NEW ESP32 CODE ---
    function listenToESP32() {
        // Your ESP32 sends data to 'https://.../weather.json'
        // So we listen to the 'weather' node directly.
        const weatherRef = ref(rtdb, 'weather'); 
        
        onValue(weatherRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Mapping the JSON keys exactly as they appear in your C++ code
                currentWeatherData.temperature = data.temperature || 0;
                currentWeatherData.humidity = data.humidity || 0;
                currentWeatherData.rain_percent = data.rain_percent || 0;
                currentWeatherData.is_dark = data.is_dark || false;
                
                renderDashboard(); 
                console.log("ESP32 Data Synced:", data);
            } else {
                console.warn("No data found at /weather node.");
            }
        });
    }

    // --- Theme & Location Management ---
    const SETTINGS_DOC_PATH = (uid) => `/artifacts/${appId}/users/${uid}/settings/user_prefs`;
    const root = document.documentElement;
    
    function applyTheme(color) {
        root.style.setProperty('--primary-color', color);
        themeColorPicker.value = color; 
    }

    async function savePreferences() {
        if (!db || userId === 'anonymous') return;
        try {
            await setDoc(doc(db, SETTINGS_DOC_PATH(userId)), { color: themeColorPicker.value, location: userLocation }, { merge: true }); 
        } catch (e) {}
    }

    async function loadPreferences() {
        if (!db || userId === 'anonymous') return;
        try {
            const docSnap = await getDoc(doc(db, SETTINGS_DOC_PATH(userId)));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.color) applyTheme(data.color);
                if (data.location) {
                    userLocation = data.location;
                    locationElement.textContent = userLocation;
                }
            }
        } catch (e) {}
    }

    themeColorPicker.addEventListener('input', (e) => {
        applyTheme(e.target.value);
        savePreferences();
    });

    // --- Location UI Logic ---
    window.promptForLocation = () => {
        locationModal.classList.remove('hidden');
        manualLocationInput.value = userLocation;
    };
    function hideLocationModal() { locationModal.classList.add('hidden'); }

    useGeoLocationButton.addEventListener('click', () => {
        if (navigator.geolocation) {
            locationElement.textContent = "Fetching GPS...";
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = `Lat ${position.coords.latitude.toFixed(2)}, Lon ${position.coords.longitude.toFixed(2)}`;
                    savePreferences();
                    locationElement.textContent = userLocation;
                    hideLocationModal();
                }
            );
        }
    });

    saveLocationButton.addEventListener('click', () => {
        if (manualLocationInput.value.trim()) {
            userLocation = manualLocationInput.value.trim();
            savePreferences();
            locationElement.textContent = userLocation;
            hideLocationModal();
        }
    });
    closeModalButton.addEventListener('click', hideLocationModal);

    // --- Agricultural Analysis Engine ---
    function getAgriInsights(data) {
        let action = "";
        let crop = "";

        if (data.rain_percent > 70) {
            action = "🛑 **Danger: Heavy Rain.** Stop all field activities. Ensure proper drainage to avoid root rot.";
        } else if (data.temperature > 38) {
            action = "💧 **Extreme Heat.** High risk of crop wilting. Apply emergency irrigation immediately.";
        } else if (data.humidity < 30) {
            action = "⚠️ **Dry Air Alert.** Soil moisture will evaporate quickly. Consider mulching.";
        } else {
            action = "✅ **Healthy Conditions.** Ideal for fertilization and general crop maintenance.";
        }

        if (data.temperature > 25 && data.humidity > 50) {
            crop = "Weather is perfect for **Tropical crops** like Rice or Sugarcane.";
        } else if (data.temperature < 20) {
            crop = "Cooler weather favors **Wheat, Mustard, or Leafy Greens**.";
        } else {
            crop = "Stable climate for **Maize or Pulses**.";
        }

        return { action, crop };
    }

    // --- UI Rendering ---
    function renderDashboard() {
        const data = currentWeatherData;
        const alerts = [];
        const suggestions = [];

        // 1. Process Agri Insights
        const agriData = getAgriInsights(data);
        agriActionElement.innerHTML = agriData.action.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
        cropSuggestionElement.innerHTML = agriData.crop.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 2. Weather Logic
        if (data.temperature > 35) {
            alerts.push({ type: 'danger', message: 'HEATWAVE WARNING: High temperature detected.' });
            suggestions.push('Keep livestock in shade and check water levels.');
        } else if (data.rain_percent > 60) {
            alerts.push({ type: 'warning', message: 'HEAVY RAIN: Localized flooding possible.' });
            suggestions.push('Ensure electrical pump sets are protected from water.');
        } else {
            alerts.push({ type: 'info', message: 'System Online: Normal farming conditions.' });
            suggestions.push('No immediate weather threats detected.');
        }

        if (data.is_dark) suggestions.push('Night-time detected: Automated farm lighting recommended.');

        // Update Card Values
        tempElement.textContent = `${data.temperature.toFixed(1)}°C`;
        humidityElement.textContent = `${data.humidity.toFixed(0)}%`;
        rainElement.textContent = `${data.rain_percent}%`;
        lightElement.textContent = data.is_dark ? 'Dark' : 'Bright'; 
        
        alertBox.innerHTML = '';
        suggestionsList.innerHTML = '';
        
        const primaryAlert = alerts[0] || {type: 'info'};
        let alertColor = 'bg-green-500';
        let alertText = 'SAFE';
        
        if (primaryAlert.type === 'danger') {
            alertColor = 'bg-red-600 animate-pulse';
            alertText = 'DANGER';
        } else if (primaryAlert.type === 'warning') {
            alertColor = 'bg-yellow-500';
            alertText = 'WATCH';
        }

        alertStatus.className = `w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-2xl transition-all duration-500 ${alertColor}`;
        alertStatus.textContent = alertText;

        alerts.forEach(alert => {
            const colorClass = alert.type === 'danger' ? 'border-red-500 bg-red-50' : alert.type === 'warning' ? 'border-yellow-500 bg-yellow-50' : 'border-blue-500 bg-blue-50';
            alertBox.innerHTML += `<div class="p-3 my-2 rounded-lg border-l-4 ${colorClass} text-sm font-semibold">${alert.message}</div>`;
        });

        suggestions.forEach(suggestion => {
            suggestionsList.innerHTML += `<li class="flex items-start mb-2 text-sm text-gray-700">📌 ${suggestion}</li>`;
        });

        lastUpdatedElement.textContent = new Date().toLocaleTimeString();
    }

    window.manualRefresh = renderDashboard;

    // --- Start ---
    applyTheme(themeColorPicker.value); 
    initializeFirebase();
});
