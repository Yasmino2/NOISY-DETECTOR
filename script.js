// MQTT Configuration
const MQTT_CONFIG = {
    broker: 'wss://broker.hivemq.com:8000', // WebSocket port (usually 9001)
    // For HiveMQ public broker: 'wss://broker.hivemq.com:8884/mqtt'
    // For local broker: 'ws://192.168.1.100:9001'
    options: {
        clientId: 'web_client_' + Math.random().toString(36).substr(2, 9),
        // username: 'YOUR_MQTT_USERNAME', // Leave empty if no auth
        // password: 'YOUR_MQTT_PASSWORD', // Leave empty if no auth
        keepalive: 60,
        clean: true,
        useSSL: true // Use SSL for secure connection
    },
    topics: {
        sensors: 'ESP/office/sensors/data',
        status: 'ESP/office/sensors/status'
    }
};

class ESP32SensorData {
    constructor() {
        // Default/fallback values
        this.temperature = 22; 
        this.humidity = 45; 
        this.light = 300; 
        this.noise = 40; 
        
        // Connection status
        this.isConnected = false;
        this.lastUpdate = new Date();
        this.deviceInfo = {
            ip: '192.168.1.100',
            rssi: -45,
            uptime: '2h 34m',
            firmware: 'v2.1.3'
        };
        
        this.thresholds = {
            temperature: { min: 18, max: 26 },
            humidity: { min: 30, max: 70 },
            light: { min: 200, max: 800 },
            noise: { min: 0, max: 60 }
        };

        this.warnings = {
            temperature: {
                low: "Temperature too low! Consider turning on heating or wearing warmer clothes.",
                high: "Temperature too high! Turn on AC or open windows for ventilation."
            },
            humidity: {
                low: "Humidity too low! Use a humidifier or place water containers nearby.",
                high: "Humidity too high! Use a dehumidifier or improve ventilation."
            },
            light: {
                low: "Light level too low! Turn on more lights to reduce eye strain.",
                high: "Light level too high! Use blinds or reduce artificial lighting."
            },
            noise: {
                high: "Noise level too high! Consider noise-canceling measures or move to quieter area."
            }
        };

        // Initialize MQTT connection
        this.initMQTT();
        
        // Fallback simulation if MQTT fails
        this.simulationMode = true;
        this.startSimulation();
    }

    initMQTT() {
        console.log(MQTT_CONFIG.broker.split(':')[2]);
        try {
            // Use Paho MQTT client (need to include the library)
            this.mqttClient = new Paho.MQTT.Client(
                MQTT_CONFIG.broker.replace('ws://', '').replace('wss://', '').split(':')[0],
                parseInt(MQTT_CONFIG.broker.split(':')[2]) || 9001,
                MQTT_CONFIG.options.clientId
            );

            // Set callback handlers
            this.mqttClient.onConnectionLost = this.onConnectionLost.bind(this);
            this.mqttClient.onMessageArrived = this.onMessageArrived.bind(this);

            // Connect to MQTT broker
            this.mqttClient.connect({
                onSuccess: this.onConnect.bind(this),
                onFailure: this.onConnectFailure.bind(this),
                // userName: MQTT_CONFIG.options.username,
                // password: MQTT_CONFIG.options.password,
                keepAliveInterval: MQTT_CONFIG.options.keepalive,
                cleanSession: MQTT_CONFIG.options.clean
            });

        } catch (error) {
            console.error('MQTT initialization failed:', error);
            console.log('Falling back to simulation mode');
            this.simulationMode = true;
        }
    }

    onConnect() {
        console.log('Connected to MQTT broker');
        this.isConnected = true;
        this.simulationMode = false;
        
        // Subscribe to sensor data topic
        this.mqttClient.subscribe(MQTT_CONFIG.topics.sensors);
        this.mqttClient.subscribe(MQTT_CONFIG.topics.status);
        
        this.updateConnectionStatus(true);
    }

    onConnectFailure(error) {
        console.error('MQTT connection failed:', error);
        this.isConnected = false;
        this.simulationMode = true;
        this.updateConnectionStatus(false);
    }

    onConnectionLost(responseObject) {
        if (responseObject.errorCode !== 0) {
            console.error('MQTT connection lost:', responseObject.errorMessage);
            this.isConnected = false;
            this.simulationMode = true;
            this.updateConnectionStatus(false);
            
            // Attempt to reconnect
            setTimeout(() => {
                console.log('Attempting to reconnect to MQTT...');
                this.initMQTT();
            }, 5000);
        }
    }

    onMessageArrived(message) {
        try {
            const data = JSON.parse(message.payloadString);
            console.log(data);
            
            if (message.destinationName === MQTT_CONFIG.topics.sensors) {
                // Update sensor readings from ESP32
                this.temperature = parseFloat(data.temperature) || this.temperature;
                this.humidity = parseFloat(data.humidity) || this.humidity;
                this.light = parseInt(data.light) || this.light;
                this.noise = parseFloat(data.noise) || this.noise;
                
                this.lastUpdate = new Date();
                console.log('Received sensor data:', data);
                
            } else if (message.destinationName === MQTT_CONFIG.topics.status) {
                // Update device status information
                if (data.ip) this.deviceInfo.ip = data.ip;
                if (data.rssi) this.deviceInfo.rssi = data.rssi;
                if (data.firmware) this.deviceInfo.firmware = data.firmware;
                if (data.uptime) {
                    const uptimeMs = parseInt(data.uptime);
                    this.deviceInfo.uptime = this.formatUptime(uptimeMs);
                }
                
                console.log('Received status update:', data);
            }
            
        } catch (error) {
            console.error('Error parsing MQTT message:', error);
        }
    }

    formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else {
            return `${minutes}m ${seconds % 60}s`;
        }
    }

    updateConnectionStatus(connected) {
        const connectionDot = document.getElementById('connectionDot');
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (connected) {
            connectionDot.className = 'connection-dot';
            connectionStatus.textContent = 'Connected to ESP32 via MQTT';
        } else {
            connectionDot.className = 'connection-dot disconnected';
            connectionStatus.textContent = 'Disconnected - Simulation Mode';
        }
    }

    // Fallback simulation for when MQTT is not available
    startSimulation() {
        setInterval(() => {
            if (this.simulationMode) {
                this.updateSensors();
            }
        }, 2000);
    }

    updateSensors() {
        // Only simulate if not connected to real sensors
        if (!this.simulationMode) return;
        
        this.temperature += (Math.random() - 0.5) * 2;
        this.humidity += (Math.random() - 0.5) * 5;
        this.light += (Math.random() - 0.5) * 50;
        this.noise += (Math.random() - 0.5) * 10;

        // Keep values within realistic bounds
        this.temperature = Math.max(10, Math.min(35, this.temperature));
        this.humidity = Math.max(10, Math.min(90, this.humidity));
        this.light = Math.max(0, Math.min(1000, this.light));
        this.noise = Math.max(20, Math.min(100, this.noise));
    }

    checkWarnings() {
        const warnings = [];
        
        if (this.temperature < this.thresholds.temperature.min) {
            warnings.push({ 
                type: 'Temperature Too Low', 
                message: this.warnings.temperature.low,
                sensor: 'temperature'
            });
        } else if (this.temperature > this.thresholds.temperature.max) {
            warnings.push({ 
                type: 'Temperature Too High', 
                message: this.warnings.temperature.high,
                sensor: 'temperature'
            });
        }

        if (this.humidity < this.thresholds.humidity.min) {
            warnings.push({ 
                type: 'Humidity Too Low', 
                message: this.warnings.humidity.low,
                sensor: 'humidity'
            });
        } else if (this.humidity > this.thresholds.humidity.max) {
            warnings.push({ 
                type: 'Humidity Too High', 
                message: this.warnings.humidity.high,
                sensor: 'humidity'
            });
        }

        if (this.light < this.thresholds.light.min) {
            warnings.push({ 
                type: 'Light Level Too Low', 
                message: this.warnings.light.low,
                sensor: 'light'
            });
        } else if (this.light > this.thresholds.light.max) {
            warnings.push({ 
                type: 'Light Level Too High', 
                message: this.warnings.light.high,
                sensor: 'light'
            });
        }

        if (this.noise > this.thresholds.noise.max) {
            warnings.push({ 
                type: 'Noise Level Too High', 
                message: this.warnings.noise.high,
                sensor: 'noise'
            });
        }

        return warnings;
    }

    getSensorData() {
        return {
            temperature: this.temperature.toFixed(1),
            humidity: this.humidity.toFixed(1),
            light: Math.round(this.light),
            noise: this.noise.toFixed(1)
        };
    }
}

// Initialize ESP32 sensor data handler
const esp32 = new ESP32SensorData();

function updateDateTime() {
  const now = new Date();
  const datetimeElem = document.getElementById('datetime');
  if (datetimeElem) datetimeElem.innerText = `Time: ${now.toLocaleTimeString()} | Date: ${now.toLocaleDateString()}`;

  const taskbarTime = document.getElementById('taskbarTimeDisplay');
  if (taskbarTime) taskbarTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const taskbarDate = document.getElementById('taskbarDateDisplay');
  if (taskbarDate) taskbarDate.textContent = now.toLocaleDateString();
}

   

function updateDeviceInfo() {
    // Update device information in the UI
    document.getElementById('deviceIP').textContent = esp32.deviceInfo.ip;
    document.getElementById('signalStrength').textContent = esp32.deviceInfo.rssi + ' dBm';
    document.getElementById('uptime').textContent = esp32.deviceInfo.uptime;
    
    // Update last update time
    const timeDiff = (new Date() - esp32.lastUpdate) / 1000;
    if (timeDiff < 5) {
        document.getElementById('lastUpdate').textContent = 'Just now';
    } else if (timeDiff < 60) {
        document.getElementById('lastUpdate').textContent = `${Math.floor(timeDiff)}s ago`;
    } else {
        document.getElementById('lastUpdate').textContent = `${Math.floor(timeDiff / 60)}m ago`;
    }
}

function updateSensorDisplay() {
    const data = esp32.getSensorData();
    const warnings = esp32.checkWarnings();

    // Temperature
    const tempCard = document.getElementById('temperatureCard');
    const tempValue = document.getElementById('temperatureValue');
    const tempProgress = document.getElementById('temperatureProgress');
    
    tempValue.innerHTML = `${data.temperature}<span class="sensor-unit">°C</span>`;
    const tempWarning = warnings.find(w => w.sensor === 'temperature');
    if (tempWarning) {
        tempCard.className = 'sensor-card warning';
        tempValue.className = 'sensor-value warning';
        tempProgress.className = 'progress-fill warning';
    } else {
        tempCard.className = 'sensor-card normal';
        tempValue.className = 'sensor-value normal';
        tempProgress.className = 'progress-fill normal';
    }
    
    const tempPercent = Math.max(0, Math.min(100, ((parseFloat(data.temperature) - 18) / 8) * 100));
    tempProgress.style.width = tempPercent + '%';

    // Humidity
    const humidityCard = document.getElementById('humidityCard');
    const humidityValue = document.getElementById('humidityValue');
    const humidityProgress = document.getElementById('humidityProgress');
    
    humidityValue.innerHTML = `${data.humidity}<span class="sensor-unit">%</span>`;
    const humidityWarning = warnings.find(w => w.sensor === 'humidity');
    if (humidityWarning) {
        humidityCard.className = 'sensor-card warning';
        humidityValue.className = 'sensor-value warning';
        humidityProgress.className = 'progress-fill warning';
    } else {
        humidityCard.className = 'sensor-card normal';
        humidityValue.className = 'sensor-value normal';
        humidityProgress.className = 'progress-fill normal';
    }
    
    const humidityPercent = Math.max(0, Math.min(100, ((parseFloat(data.humidity) - 30) / 40) * 100));
    humidityProgress.style.width = humidityPercent + '%';

    // Light
    const lightCard = document.getElementById('lightCard');
    const lightValue = document.getElementById('lightValue');
    const lightProgress = document.getElementById('lightProgress');
    
    lightValue.innerHTML = `${data.light}<span class="sensor-unit">lux</span>`;
    const lightWarning = warnings.find(w => w.sensor === 'light');
    if (lightWarning) {
        lightCard.className = 'sensor-card warning';
        lightValue.className = 'sensor-value warning';
        lightProgress.className = 'progress-fill warning';
    } else {
        lightCard.className = 'sensor-card normal';
        lightValue.className = 'sensor-value normal';
        lightProgress.className = 'progress-fill normal';
    }
    
    const lightPercent = Math.max(0, Math.min(100, ((parseInt(data.light) - 200) / 600) * 100));
    lightProgress.style.width = lightPercent + '%';

    // Noise
    const noiseCard = document.getElementById('noiseCard');
    const noiseValue = document.getElementById('noiseValue');
    const noiseProgress = document.getElementById('noiseProgress');
    
    noiseValue.innerHTML = `${data.noise}<span class="sensor-unit">dB</span>`;
    const noiseWarning = warnings.find(w => w.sensor === 'noise');
    if (noiseWarning) {
        noiseCard.className = 'sensor-card warning';
        noiseValue.className = 'sensor-value warning';
        noiseProgress.className = 'progress-fill warning';
    } else {
        noiseCard.className = 'sensor-card normal';
        noiseValue.className = 'sensor-value normal';
        noiseProgress.className = 'progress-fill normal';
    }
    
    const noisePercent = Math.max(0, Math.min(100, (parseFloat(data.noise) / 60) * 100));
    noiseProgress.style.width = noisePercent + '%';

    // System status and warnings
    const systemStatus = document.getElementById('systemStatus');
    const warningsSection = document.getElementById('warningsSection');
    const warningsList = document.getElementById('warningsList');

    if (warnings.length > 0) {
        systemStatus.className = 'status warning';
        systemStatus.innerHTML = '⚠️ System alerts detected';
        
        warningsSection.className = 'warnings-section active';
        warningsList.innerHTML = warnings.map(warning => `
            <div class="warning-item">
                <div class="warning-type">${warning.type}</div>
                <div class="warning-message">${warning.message}</div>
            </div>
        `).join('');
    } else {
        systemStatus.className = 'status normal';
        systemStatus.innerHTML = '✓ All systems normal';
        warningsSection.className = 'warnings-section';
    }
}

function init() {
    console.log('Initializing ESP32 Monitoring System...');
    console.log('MQTT Broker:', MQTT_CONFIG.broker);
    
    updateDateTime();
    updateSensorDisplay();
    updateDeviceInfo();
     // Then update every second
    setInterval(updateDateTime, 1000);
    // Update display every second
    setInterval(() => {
        updateSensorDisplay();
        updateDateTime();
        updateDeviceInfo();
    }, 1000);
}

// Start the application
init();