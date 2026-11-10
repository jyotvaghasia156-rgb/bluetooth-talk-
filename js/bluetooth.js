/**
 * BlueTalk Pro - Bluetooth Connectivity Engine (BLE GATT + Web Serial SPP)
 * Handles Web Bluetooth BLE UART scanning/pairing, Bluetooth Serial COM ports
 * via Web Serial API, newline-framed JSON packet reassembly, and state management.
 */

class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.txCharacteristic = null;
        this.rxCharacteristic = null;

        // Web Serial (Bluetooth SPP Virtual COM Port)
        this.serialPort = null;
        this.serialReader = null;
        this.serialWriter = null;
        this.serialReadActive = false;

        this.transportKind = null; // 'ble' | 'serial' | null
        this.isConnected = false;
        this.isConnecting = false;
        this.hasDataLink = false;
        this.deviceName = 'No BT Device';
        this.deviceId = null;

        // Callbacks
        this.onStateChange = null; // (state, deviceName, meta) => void
        this.onDataReceived = null; // (packet) => void
        this.onError = null; // (error) => void

        // Nordic Semiconductor NUS (Nordic UART Service) UUID standard
        this.UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
        this.UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
        this.UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

        this.GENERIC_SERVICES = [
            this.UART_SERVICE_UUID,
            '00001800-0000-1000-8000-00805f9b34fb',
            '0000180a-0000-1000-8000-00805f9b34fb',
            '0000180f-0000-1000-8000-00805f9b34fb'
        ];

        this.rxBuffer = '';
    }

    isBluetoothAvailable() {
        return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
    }

    isSerialAvailable() {
        return !!(navigator.serial && navigator.serial.requestPort);
    }

    /**
     * Scan and Pair with a nearby BLE Device (Web Bluetooth)
     */
    async scanAndConnect() {
        if (!this.isBluetoothAvailable()) {
            throw new Error('Web Bluetooth requires Chrome or Edge (on HTTPS or localhost).');
        }

        try {
            this.isConnecting = true;
            this.updateState('connecting', 'Scanning BLE...');

            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: this.GENERIC_SERVICES
            });

            this.deviceName = this.device.name || `BT-${this.device.id.slice(0, 5)}`;
            this.deviceId = this.device.id;

            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });

            this.updateState('connecting', `Connecting ${this.deviceName}...`);
            this.server = await this.device.gatt.connect();

            let uartReady = false;
            try {
                this.service = await this.server.getPrimaryService(this.UART_SERVICE_UUID);
                this.rxCharacteristic = await this.service.getCharacteristic(this.UART_RX_UUID);
                this.txCharacteristic = await this.service.getCharacteristic(this.UART_TX_UUID);

                await this.txCharacteristic.startNotifications();
                this.txCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
                    const decoder = new TextDecoder();
                    this.appendAndParseStream(decoder.decode(event.target.value));
                });
                uartReady = true;
            } catch (serviceErr) {
                console.warn('NUS UART Service not found; connected in Generic Bluetooth Audio/Device mode:', serviceErr);
            }

            this.transportKind = 'ble';
            this.hasDataLink = uartReady;
            this.isConnected = true;
            this.isConnecting = false;
            this.updateState('connected', this.deviceName, { kind: 'ble', hasDataLink: uartReady });
            window.sfx.playConnectedTone();

            return {
                name: this.deviceName,
                id: this.deviceId,
                kind: 'ble',
                hasDataLink: uartReady
            };
        } catch (err) {
            this.isConnecting = false;
            this.isConnected = false;
            this.hasDataLink = false;
            this.updateState('disconnected', 'No BT Device');
            if (this.onError) this.onError(err);
            throw err;
        }
    }

    /**
     * Connect to a Bluetooth Classic Serial Port (SPP COM Port) via Web Serial API
     */
    async connectSerialBluetooth(baudRate = 115200) {
        if (!this.isSerialAvailable()) {
            throw new Error('Web Serial API requires Chrome or Edge on Desktop.');
        }

        try {
            this.isConnecting = true;
            this.updateState('connecting', 'Selecting BT COM Port...');

            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate });

            const info = this.serialPort.getInfo ? this.serialPort.getInfo() : {};
            this.deviceName = info.usbProductId ? `BT-Serial-${info.usbProductId}` : 'Bluetooth Serial SPP';
            this.transportKind = 'serial';
            this.hasDataLink = true;
            this.isConnected = true;
            this.isConnecting = false;

            this.serialWriter = this.serialPort.writable.getWriter();
            this.serialReadActive = true;
            this.readSerialLoop();

            this.updateState('connected', this.deviceName, { kind: 'serial', hasDataLink: true });
            window.sfx.playConnectedTone();

            return { name: this.deviceName, kind: 'serial', hasDataLink: true };
        } catch (err) {
            this.isConnecting = false;
            this.isConnected = false;
            this.hasDataLink = false;
            this.updateState('disconnected', 'No BT Device');
            if (this.onError) this.onError(err);
            throw err;
        }
    }

    async readSerialLoop() {
        const decoder = new TextDecoder();
        try {
            while (this.serialPort && this.serialPort.readable && this.serialReadActive) {
                this.serialReader = this.serialPort.readable.getReader();
                try {
                    while (this.serialReadActive) {
                        const { value, done } = await this.serialReader.read();
                        if (done) break;
                        if (value) {
                            this.appendAndParseStream(decoder.decode(value, { stream: true }));
                        }
                    }
                } finally {
                    this.serialReader.releaseLock();
                }
            }
        } catch (e) {
            console.warn('Bluetooth Serial stream closed:', e);
        } finally {
            if (this.transportKind === 'serial' && this.isConnected) {
                this.onDisconnected();
            }
        }
    }

    /**
     * Send newline-framed JSON packet over BLE GATT or Bluetooth Serial SPP
     */
    async sendPacket(packetObject) {
        if (!this.isConnected || !this.hasDataLink) {
            return false;
        }

        const line = JSON.stringify(packetObject) + '\n';
        const encoder = new TextEncoder();
        const rawBytes = encoder.encode(line);

        if (this.transportKind === 'serial' && this.serialWriter) {
            try {
                await this.serialWriter.write(rawBytes);
                return true;
            } catch (e) {
                console.error('Error sending Bluetooth Serial packet:', e);
                return false;
            }
        }

        if (this.transportKind === 'ble' && this.rxCharacteristic) {
            try {
                const CHUNK_SIZE = 240;
                for (let offset = 0; offset < rawBytes.byteLength; offset += CHUNK_SIZE) {
                    const chunk = rawBytes.slice(offset, offset + CHUNK_SIZE);
                    if (this.rxCharacteristic.writeValueWithoutResponse) {
                        await this.rxCharacteristic.writeValueWithoutResponse(chunk);
                    } else {
                        await this.rxCharacteristic.writeValue(chunk);
                    }
                }
                return true;
            } catch (e) {
                console.error('Error sending BLE packet:', e);
                return false;
            }
        }

        return false;
    }

    appendAndParseStream(textChunk) {
        if (!textChunk) return;
        this.rxBuffer += textChunk;

        // Handle newline-delimited packets or standalone JSON
        if (this.rxBuffer.includes('\n')) {
            const lines = this.rxBuffer.split('\n');
            this.rxBuffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                this.dispatchJsonLine(trimmed);
            }
        } else if (this.rxBuffer.trim().startsWith('{') && this.rxBuffer.trim().endsWith('}')) {
            const candidate = this.rxBuffer.trim();
            if (this.dispatchJsonLine(candidate)) {
                this.rxBuffer = '';
            }
        }
    }

    dispatchJsonLine(jsonText) {
        try {
            const packet = JSON.parse(jsonText);
            if (this.onDataReceived) {
                this.onDataReceived(packet);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    async fetchHostPairedDevices() {
        if (!window.location.protocol.startsWith('http')) return null;
        try {
            const res = await fetch('/api/bluetooth/devices', { cache: 'no-store' });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    async disconnect() {
        this.serialReadActive = false;
        if (this.serialReader) {
            try { await this.serialReader.cancel(); } catch (e) {}
            this.serialReader = null;
        }
        if (this.serialWriter) {
            try { this.serialWriter.releaseLock(); } catch (e) {}
            this.serialWriter = null;
        }
        if (this.serialPort) {
            try { await this.serialPort.close(); } catch (e) {}
            this.serialPort = null;
        }
        if (this.device && this.device.gatt && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.onDisconnected();
    }

    onDisconnected() {
        this.isConnected = false;
        this.isConnecting = false;
        this.hasDataLink = false;
        this.transportKind = null;
        this.rxCharacteristic = null;
        this.txCharacteristic = null;
        this.rxBuffer = '';
        this.updateState('disconnected', 'No BT Device');
        if (window.sfx) window.sfx.playDisconnectedTone();
    }

    updateState(state, deviceName, meta = {}) {
        if (this.onStateChange) {
            this.onStateChange(state, deviceName, meta);
        }
    }
}

window.btManager = new BluetoothManager();
