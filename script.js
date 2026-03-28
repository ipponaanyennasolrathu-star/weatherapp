document.addEventListener('DOMContentLoaded', () => {

    if (typeof window.firebaseImports === 'undefined') {
        console.error("Firebase imports not found!");
        return;
    }

    const { 
        initializeApp, getAuth, signInAnonymously, 
        getFirestore, doc, setDoc, getDoc, 
        getDatabase, ref, onValue
    } = window.firebaseImports;

    const appId = window.__app_id;

    // ✅ Firebase config (already provided in HTML)
    const firebaseConfig = JSON.parse(window.__firebase_config);

    let db, rtdb, auth;
    let userId = 'anonymous';

    let currentWeatherData = {
        temperature: 0,
        humidity: 0,
        rain_percent: 0,
        is_dark: false
    };

    // -------- DOM --------
    const tempElement = document.getElementById('currentTemp');
    const humidityElement = document.getElementById('currentHumidity');
    const rainElement = document.getElementById('currentRain');
    const lightElement = document.getElementById('currentLight');
    const lastUpdatedElement = document.getElementById('lastUpdated');

    const alertBox = document.getElementById('alertBox');
    const suggestionsList = document.getElementById('safetySuggestions');
    const alertStatus = document.getElementById('alertStatus');

    const agriActionElement = document.getElementById('agriAction');
    const cropSuggestionElement = document.getElementById('cropSuggestion');

    const themeColorPicker = document.getElementById('themeColor');

    // -------- INIT FIREBASE --------
    async function initializeFirebase() {
        try {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            rtdb = getDatabase(app);
            auth = getAuth(app);

            await signInAnonymously(auth);
            userId = auth.currentUser.uid;

            listenToESP32();

        } catch (error) {
            console.error("Firebase Init Error:", error);
        }
    }

    // -------- LISTEN TO ESP32 DATA --------
    function listenToESP32() {

        const weatherRef = ref(rtdb, 'weather');

        console.log("Listening to /weather...");

        onValue(weatherRef, (snapshot) => {

            const data = snapshot.val();

            console.log("DATA RECEIVED:", data); // 🔥 DEBUG

            if (!data) {
                console.warn("No data found!");
                return;
            }

            currentWeatherData.temperature = data.temperature || 0;
            currentWeatherData.humidity = data.humidity || 0;
            currentWeatherData.rain_percent = data.rain_percent || 0;
            currentWeatherData.is_dark = data.is_dark || false;

            renderDashboard();
        });
    }

    // -------- AGRI LOGIC --------
    function getAgriInsights(data) {

        let action = "";
        let crop = "";

        if (data.rain_percent > 70) {
            action = "🛑 Heavy rain. Stop field work.";
        } 
        else if (data.temperature > 38) {
            action = "💧 Extreme heat. Irrigate immediately.";
        } 
        else {
            action = "✅ Normal farming conditions.";
        }

        if (data.temperature > 25 && data.humidity > 50) {
            crop = "Suitable for Rice / Sugarcane";
        } else {
            crop = "Suitable for Maize / Pulses";
        }

        return { action, crop };
    }

    // -------- UI UPDATE --------
    function renderDashboard() {

        const d = currentWeatherData;

        tempElement.textContent = d.temperature.toFixed(1) + "°C";
        humidityElement.textContent = d.humidity.toFixed(0) + "%";
        rainElement.textContent = d.rain_percent + "%";
        lightElement.textContent = d.is_dark ? "Dark" : "Bright";

        lastUpdatedElement.textContent = new Date().toLocaleTimeString();

        const agri = getAgriInsights(d);
        agriActionElement.textContent = agri.action;
        cropSuggestionElement.textContent = agri.crop;

        alertBox.innerHTML = "";
        suggestionsList.innerHTML = "";

        if (d.temperature > 35) {
            alertStatus.textContent = "DANGER";
            alertStatus.className = "bg-red-600 text-white p-4 rounded-full";
            alertBox.innerHTML = "High temperature!";
        } else {
            alertStatus.textContent = "SAFE";
            alertStatus.className = "bg-green-500 text-white p-4 rounded-full";
            alertBox.innerHTML = "All good";
        }
    }

    // -------- THEME --------
    function applyTheme(color) {
        document.documentElement.style.setProperty('--primary-color', color);
    }

    themeColorPicker.addEventListener('input', (e) => {
        applyTheme(e.target.value);
    });

    // -------- START --------
    initializeFirebase();
});
