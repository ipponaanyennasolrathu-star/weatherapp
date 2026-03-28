document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.firebaseImports === 'undefined') {
        console.error("Firebase imports not found.");
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
    let userLocation = "Default Location, India"; 

    let currentWeatherData = { temp: 0, humidity: 0, rainRate: 0, isDark: false };

    // --- DOM Elements ---
    const locationElement = document.getElementById('currentLocation');
    const tempElement = document.getElementById('currentTemp');
    const humidityElement = document.getElementById('currentHumidity');
    const rainElement = document.getElementById('currentRain');
    const lightElement = document.getElementById('currentLight'); // Swapped Pressure for Light
    
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
    
    function listenToESP32() {
        const weatherRef = ref(rtdb, 'weather');
        onValue(weatherRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                currentWeatherData.temp = data.temperature || 0;
                currentWeatherData.humidity = data.humidity || 0;
                currentWeatherData.rainRate = data.rain_percent || 0;
                currentWeatherData.isDark = data.is_dark || false;
                renderDashboard(); 
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
                if (data.location) userLocation = data.location;
                locationElement.textContent = userLocation;
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
        manualLocationInput.value = userLocation.includes('Default') ? '' : userLocation;
    };
    function hideLocationModal() { locationModal.classList.add('hidden'); }

    useGeoLocationButton.addEventListener('click', () => {
        if (navigator.geolocation) {
            locationElement.textContent = "Fetching coordinates...";
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

    // --- Agricultural Logic Engine ---
    function getAgriInsights(data) {
        let action = "";
        let crop = "";

        if (data.rainRate > 60) {
            action = "🛑 **Halt field operations.** Heavy soil moisture detected. Ensure field drainage systems are open to prevent waterlogging. Delay any fertilizer or pesticide spraying.";
        } else if (data.temp > 35 && data.humidity < 40) {
            action = "💧 **High Heat/Dry Alert.** Increase irrigation frequency immediately to prevent crop heat stress. Apply mulch to retain soil moisture if possible.";
        } else if (data.temp < 15) {
            action = "❄️ **Cold Alert.** Delay transplanting sensitive seedlings. Use row covers or light irrigation at night to protect vulnerable crops from frost.";
        } else if (data.rainRate > 10 && data.rainRate <= 60) {
            action = "🌧️ **Moderate Rain.** Good natural irrigation occurring. Halt manual watering. Postpone chemical spraying to prevent runoff.";
        } else {
            action = "✅ **Optimal Conditions.** Favorable weather for routine field maintenance, weeding, soil preparation, and scheduled chemical applications.";
        }

        if (data.temp > 28 && data.humidity > 60) {
            crop = "These warm and humid conditions are highly favorable for tropical crops like **Rice (Paddy), Sugarcane, Cotton, and Bananas**.";
        } else if (data.temp >= 20 && data.temp <= 28) {
            crop = "Moderate temperatures are ideal for planting **Maize, Soybeans, Tomatoes, Peppers, and Pulses**.";
        } else if (data.temp < 20 && data.temp > 0) {
            crop = "Cooler conditions are perfect for winter (Rabi) crops such as **Wheat, Barley, Mustard, Cabbage, and Potatoes**.";
        } else {
            crop = "Extreme temperatures detected. Focus on crop protection rather than new planting.";
        }

        return { action, crop };
    }

    // --- Core Weather Rendering and Alerts ---
    function renderDashboard() {
        const data = currentWeatherData;
        const alerts = [];
        const suggestions = [];

        // 1. Process Agricultural Insights
        const agriData = getAgriInsights(data);
        agriActionElement.innerHTML = agriData.action.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
        cropSuggestionElement.innerHTML = agriData.crop.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 2. Process Weather Safety Alerts
        if (data.temp > 35 && data.humidity < 70) {
            alerts.push({ type: 'danger', message: 'HEATWAVE WARNING: Extreme Temperatures Detected.' });
            suggestions.push('Farmers: Stay hydrated and schedule heavy manual labor for early morning or late evening.');
        } else if (data.rainRate > 60) { 
            alerts.push({ type: 'danger', message: 'HEAVY RAIN ALERT: Risk of Flooding.' });
            suggestions.push('Move livestock to higher ground. Bring in outdoor drying clothes.');
        } else if (data.rainRate > 20) {
            alerts.push({ type: 'warning', message: 'STORM WATCH: Moderate rain detected.' });
            suggestions.push('Drive farm vehicles with caution on muddy tracks.');
        } else if (data.temp < 22 && data.humidity < 40) {
            alerts.push({ type: 'info', message: 'Clear Weather: Stable conditions expected.' });
            suggestions.push('Enjoy the weather! Safe conditions for outdoor work and drying clothes.');
        } else {
            alerts.push({ type: 'info', message: 'No Severe Weather Alerts Currently Active.' });
            suggestions.push('Monitor the dashboard for live updates.');
        }

        if (data.isDark) suggestions.push('Low light conditions. Ensure proper lighting if operating machinery.');

        // Update UI Text
        tempElement.textContent = `${data.temp.toFixed(1)}°C`;
        humidityElement.textContent = `${data.humidity.toFixed(0)}%`;
        rainElement.textContent = `${data.rainRate}%`;
        lightElement.textContent = data.isDark ? 'Dark' : 'Daylight'; // Displays based on LDR sensor
        
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
            alertText = 'ADVISORY';
        }

        alertStatus.className = `w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-2xl transition-all duration-500 ${alertColor}`;
        alertStatus.textContent = alertText;

        alerts.forEach(alert => {
            const icon = alert.type === 'danger' ? '🚨' : alert.type === 'warning' ? '⚠️' : '✅';
            const colorClass = alert.type === 'danger' ? 'border-red-500 bg-red-50' : alert.type === 'warning' ? 'border-yellow-500 bg-yellow-50' : 'border-blue-500 bg-blue-50';
            alertBox.innerHTML += `<div class="p-4 my-2 rounded-xl border-l-4 ${colorClass} shadow-md font-semibold text-gray-800"><span class="mr-2">${icon}</span>${alert.message}</div>`;
        });

        suggestions.forEach(suggestion => {
            suggestionsList.innerHTML += `<li class="flex items-start mb-2"><div class="w-2 h-2 mt-2 mr-3 rounded-full bg-[--primary-color] flex-shrink-0"></div><p class="text-sm text-gray-700">${suggestion}</p></li>`;
        });

        lastUpdatedElement.textContent = new Date().toLocaleTimeString();
    }

    window.manualRefresh = renderDashboard;

    // --- Initialization ---
    applyTheme(themeColorPicker.value); 
    initializeFirebase();
});
