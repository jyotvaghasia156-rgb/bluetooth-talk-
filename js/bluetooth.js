/**
 * BlueTalk - Bluetooth Connectivity & GATT Protocol Engine
 * Handles Web Bluetooth scanning, pairing, GATT characteristic reads/writes,
 * packet framing, and state management.
 */

class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.txCharacteristic = null;
        this.rxCharacteristic = null;

        this.isConnected = false;
        this.isConnecting = false;
        this.deviceName = 'No Device';
        this.deviceId = null;

        // Callbacks
        this.onStateChange = null; // (state, deviceName) => void
        this.onDataReceived = null; // (packet) => void
        this.onError = null; // (error) => void

        // Custom Bluetooth GATT UUIDs for BlueTalk Walkie-Talkie & Chat
        // Uses Nordic Semiconductor NUS (Nordic UART Service) UUID standard widely supported across BLE devices/apps
        this.UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
        this.UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write to device
        this.UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify/Read from device

        // Standard Serial / Generic Comm service UUIDs as fallback
        this.GENERIC_SERVICES = [
            this.UART_SERVICE_UUID,
            '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
            '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
            '0000180f-0000-1000-8000-00805f9b34fb'  // Battery Service
        ];

        this.incomingChunks = new Map(); // Packet reassembly buffer
    }

    isBluetoothAvailable() {
        return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    }

    /**
     * Scan and Pair with a nearby Bluetooth Device
     */
    async scanAndConnect() {
        if (!this.isBluetoothAvailable()) {
            throw new Error('Web Bluetooth is not supported in this browser. Please use Microsoft Edge or Google Chrome on Windows/Android/Mac.');
        }

        try {
            this.updateState('connecting', 'Scanning...');

            // Request Bluetooth device pairing dialog
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: this.GENERIC_SERVICES
            });

            this.deviceName = this.device.name || `BT-${this.device.id.slice(0, 5)}`;
            this.deviceId = this.device.id;

            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });

            // Connect to GATT Server
            this.updateState('connecting', `Connecting to ${this.deviceName}...`);
            this.server = await this.device.gatt.connect();

            // Attempt to discover UART Service for bidirectional talking
            try {
                this.service = await this.server.getPrimaryService(this.UART_SERVICE_UUID);
                this.rxCharacteristic = await this.service.getCharacteristic(this.UART_RX_UUID);
                this.txCharacteristic = await this.service.getCharacteristic(this.UART_TX_UUID);

                // Subscribe to notifications
                await this.txCharacteristic.startNotifications();
                this.txCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                    this.handleIncomingRawData(event.target.value);
                });
            } catch (serviceErr) {
                console.warn('NUS UART Service not detected on device; connected in Generic Bluetooth Mode:', serviceErr);
            }

            this.isConnected = true;
            this.isConnecting = false;
            this.updateState('connected', this.deviceName);
            window.sfx.playConnectedTone();

            return {
                name: this.deviceName,
                id: this.deviceId
            };
        } catch (err) {
            this.isConnecting = false;
            this.isConnected = false;
            this.updateState('disconnected', 'Disconnected');
            console.error('Bluetooth Connection Error:', err);
            if (this.onError) this.onError(err);
            throw err;
        }
    }

    /**
     * Send packet over Bluetooth GATT
     */
    async sendPacket(packetObject) {
        const jsonStr = JSON.stringify(packetObject);
        const encoder = new TextEncoder();
        const rawBytes = encoder.encode(jsonStr);

        if (!this.isConnected || !this.rxCharacteristic) {
            // Not connected via physical BLE UART; pass through to peer dispatcher
            return false;
        }

        try {
            // Chunk transmission into 512-byte MTU blocks if needed
            const CHUNK_SIZE = 500;
            for (let offset = 0; offset < rawBytes.byteLength; offset += CHUNK_SIZE) {
                const chunk = rawBytes.slice(offset, offset + CHUNK_SIZE);
                await this.rxCharacteristic.writeValueWithoutResponse(chunk);
            }
            return true;
        } catch (e) {
            console.error('Error sending BLE packet:', e);
            return false;
        }
    }

    handleIncomingRawData(dataView) {
        try {
            const decoder = new TextDecoder();
            const text = decoder.decode(dataView);
            const packet = JSON.parse(text);
            if (this.onDataReceived) {
                this.onDataReceived(packet);
            }
        } catch (e) {
            console.error('Error parsing received BLE data packet:', e);
        }
    }

    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.onDisconnected();
    }

    onDisconnected() {
        this.isConnected = false;
        this.isConnecting = false;
        this.updateState('disconnected', 'Disconnected');
        window.sfx.playDisconnectedTone();
    }

    updateState(state, deviceName) {
        if (this.onStateChange) {
            this.onStateChange(state, deviceName);
        }
    }
}

window.btManager = new BluetoothManager();
