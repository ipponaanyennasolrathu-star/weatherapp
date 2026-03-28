document.addEventListener('DOMContentLoaded', () => {
    const { initializeApp, getAuth, signInAnonymously, getDatabase, ref, onValue } = window.firebaseImports;

    const firebaseConfig = JSON.parse(window.__firebase_config);
    const app = initializeApp(firebaseConfig);
    const rtdb = getDatabase(app);
    const auth = getAuth(app);

    // Initial state
    let weatherData = { temperature: 0, humidity: 0, rain_percent: 0, is_dark: false };

    // DOM Links
    const tempEl = document.getElementById('currentTemp');
    const humEl = document.getElementById('currentHumidity');
    const rainEl = document.getElementById('currentRain');
    const lightEl = document.getElementById('currentLight');
    const alertCircle = document.getElementById('alertCircle');
    const alertText = document.getElementById('alertText');
    const agriAction = document.getElementById('agriAction');
    const safetyList = document.getElementById('safetySuggestions');
    const lastUpdated = document.getElementById('lastUpdated');

    // Authenticate and Listen
    signInAnonymously(auth).then(() => {
        const weatherRef = ref(rtdb, 'weather');
        onValue(weatherRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                weatherData = data;
                updateUI();
            }
        });
    });

    function updateUI() {
        // 1. Text values
        tempEl.textContent = `${weatherData.temperature.toFixed(1)}°C`;
        humEl.textContent = `${Math.round(weatherData.humidity)}%`;
        rainEl.textContent = `${weatherData.rain_percent}%`;
        lightEl.textContent = weatherData.is_dark ? "Dark" : "Bright";

        // 2. Logic for Alert Status
        let status = "SAFE";
        let color = "bg-green-500";
        let advice = "Conditions are ideal for general farming and maintenance.";
        let safety = ["✅ Check water levels", "✅ Normal operation"];

        if (weatherData.rain_percent > 70) {
            status = "STORM";
            color = "bg-red-600 animate-pulse";
            advice = "Heavy rainfall detected! Stop irrigation and check field drainage.";
            safety = ["❌ Switch off electrical pumps", "❌ Avoid open fields"];
        } else if (weatherData.temperature > 35) {
            status = "HEAT";
            color = "bg-orange-500";
            advice = "High heat alert. Increase irrigation frequency for sensitive crops.";
            safety = ["⚠️ Ensure livestock shade", "⚠️ Monitor for soil wilting"];
        }

        // 3. Update Visuals
        alertCircle.className = `w-48 h-48 rounded-full flex flex-col items-center justify-center text-white shadow-2xl transition-all duration-700 ${color}`;
        alertText.textContent = status;
        agriAction.textContent = advice;
        
        safetyList.innerHTML = safety.map(item => `<li>${item}</li>`).join('');
        lastUpdated.textContent = new Date().toLocaleTimeString();
    }
});
