/* ============================================================
   Firebase Cloud Sync Module
   Provides real-time multi-device sync via Firestore
   ============================================================ */

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDtjEyVKeqysM-KnoKK-34lGzegCrDqscE",
    authDomain: "choli-rental-b9ee6.firebaseapp.com",
    projectId: "choli-rental-b9ee6",
    storageBucket: "choli-rental-b9ee6.firebasestorage.app",
    messagingSenderId: "277070288555",
    appId: "1:277070288555:web:027ff63614775211a249ee",
    measurementId: "G-HJ52PVKK24"
};

const DEFAULT_STORE_ID = "choli_boutique_main";

class CloudSync {
    constructor() {
        this.db = null;
        this.storeId = null;
        this.isConnected = false;
        this.listeners = [];
        this.collections = ['cholis', 'customers', 'bookings'];
        this._debounceTimers = {};
    }

    // ---- Initialize Firebase with user config ----
    async init(firebaseConfig, storeId, autoSync = true) {
        try {
            if (!firebaseConfig || !storeId) {
                this._updateSyncUI('disconnected');
                return false;
            }

            // Parse if string
            if (typeof firebaseConfig === 'string') {
                firebaseConfig = JSON.parse(firebaseConfig);
            }

            // Initialize or retrieve existing app
            let app;
            if (!firebase.apps || firebase.apps.length === 0) {
                app = firebase.initializeApp(firebaseConfig);
            } else {
                app = firebase.app();
            }

            this.db = firebase.firestore();
            this.storeId = storeId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');

            // Offline persistence
            try {
                await this.db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                // Ignore multiple-tab or unsupported browser warnings
                console.info('Firestore offline persistence status:', err.code);
            }

            this.isConnected = true;
            this._startListeners();
            this._updateSyncUI('connected');

            // Save config and storeId to localStorage
            localStorage.setItem('_firebaseConfig', JSON.stringify(firebaseConfig));
            localStorage.setItem('_storeId', this.storeId);

            console.log('☁️ Multi-Device Cloud Sync connected for Store ID:', this.storeId);

            if (autoSync) {
                if (localStorage.getItem('_fresh_start_needed') === 'true') {
                    localStorage.removeItem('_fresh_start_needed');
                    await this.uploadAll();
                } else {
                    const hasCloud = await this.hasCloudData();
                    const hasLocal = (JSON.parse(localStorage.getItem('cholis') || '[]').length > 0);

                    if (!hasCloud && hasLocal) {
                        await this.uploadAll();
                    } else if (hasCloud) {
                        await this.downloadAll();
                    }
                }
            }

            return true;
        } catch (err) {
            console.error('Cloud Sync init error:', err);
            this._updateSyncUI('error');
            return false;
        }
    }

    // ---- Save a collection to Firestore (debounced) ----
    saveCollection(collectionName, data) {
        if (!this.isConnected || !this.db || !this.collections.includes(collectionName)) return;

        if (this._debounceTimers[collectionName]) {
            clearTimeout(this._debounceTimers[collectionName]);
        }

        this._debounceTimers[collectionName] = setTimeout(() => {
            this._writeToFirestore(collectionName, data);
        }, 300);
    }

    async _writeToFirestore(collectionName, data) {
        try {
            this._updateSyncUI('syncing');
            const docRef = this.db
                .collection('choli_stores')
                .doc(this.storeId)
                .collection('data')
                .doc(collectionName);

            await docRef.set({
                items: JSON.stringify(data),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deviceId: this._getDeviceId()
            });

            this._updateSyncUI('connected');
        } catch (err) {
            console.error(`Error saving ${collectionName} to cloud:`, err);
            this._updateSyncUI('error');
        }
    }

    // ---- Save counter value ----
    saveCounter(key, value) {
        if (!this.isConnected || !this.db) return;

        if (this._debounceTimers['counter_' + key]) {
            clearTimeout(this._debounceTimers['counter_' + key]);
        }

        this._debounceTimers['counter_' + key] = setTimeout(async () => {
            try {
                const docRef = this.db
                    .collection('choli_stores')
                    .doc(this.storeId)
                    .collection('data')
                    .doc('counters');

                await docRef.set(
                    { [key]: value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                    { merge: true }
                );
            } catch (err) {
                console.error(`Error saving counter ${key}:`, err);
            }
        }, 300);
    }

    // ---- Real-time listeners for instant multi-device updates ----
    _startListeners() {
        this._stopListeners();

        this.collections.forEach(collName => {
            const docRef = this.db
                .collection('choli_stores')
                .doc(this.storeId)
                .collection('data')
                .doc(collName);

            const unsubscribe = docRef.onSnapshot(snapshot => {
                if (!snapshot.exists) return;
                const data = snapshot.data();

                // Ignore if originated from this device
                if (data.deviceId === this._getDeviceId()) return;

                try {
                    const items = JSON.parse(data.items || '[]');
                    localStorage.setItem(collName, JSON.stringify(items));
                    this._onRemoteUpdate(collName);
                } catch (e) {
                    console.error('Error parsing remote update for ' + collName, e);
                }
            }, err => {
                console.warn(`Listener warning for ${collName}:`, err.message);
            });

            this.listeners.push(unsubscribe);
        });

        // Listen for counters
        const counterRef = this.db
            .collection('choli_stores')
            .doc(this.storeId)
            .collection('data')
            .doc('counters');

        const unsubCounters = counterRef.onSnapshot(snapshot => {
            if (!snapshot.exists) return;
            const data = snapshot.data();
            ['cholis_counter', 'customers_counter', 'bookings_counter'].forEach(k => {
                if (data[k] !== undefined) {
                    const current = parseInt(localStorage.getItem(k) || '0');
                    if (data[k] > current) {
                        localStorage.setItem(k, data[k]);
                    }
                }
            });
        }, err => console.warn('Counter listener warning:', err.message));

        this.listeners.push(unsubCounters);
    }

    _stopListeners() {
        this.listeners.forEach(unsub => {
            try { unsub(); } catch (e) {}
        });
        this.listeners = [];
    }

    _onRemoteUpdate(collectionName) {
        console.log('📡 Real-time update received from another device:', collectionName);
        if (typeof refreshCurrentPage === 'function') {
            refreshCurrentPage();
        }
        if (typeof showToast === 'function') {
            showToast(`🔄 Synced ${collectionName} from another device!`, 'info');
        }
    }

    // ---- Upload all local data to cloud ----
    async uploadAll() {
        if (!this.isConnected) return false;
        this._updateSyncUI('syncing');

        try {
            for (const coll of this.collections) {
                const data = JSON.parse(localStorage.getItem(coll) || '[]');
                await this._writeToFirestore(coll, data);
            }

            // Sync counters
            const counters = {};
            ['cholis_counter', 'customers_counter', 'bookings_counter'].forEach(k => {
                const val = localStorage.getItem(k);
                if (val) counters[k] = parseInt(val);
            });

            const counterRef = this.db
                .collection('choli_stores')
                .doc(this.storeId)
                .collection('data')
                .doc('counters');

            await counterRef.set(
                { ...counters, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
            );

            this._updateSyncUI('connected');
            if (typeof showToast === 'function') {
                showToast('Cloud database updated with local data!', 'success');
            }
            return true;
        } catch (err) {
            console.error('Upload all failed:', err);
            this._updateSyncUI('error');
            if (typeof showToast === 'function') {
                showToast('Failed to upload data to cloud.', 'error');
            }
            return false;
        }
    }

    // ---- Download all cloud data to local ----
    async downloadAll() {
        if (!this.isConnected) return false;
        this._updateSyncUI('syncing');

        try {
            for (const coll of this.collections) {
                const docRef = this.db
                    .collection('choli_stores')
                    .doc(this.storeId)
                    .collection('data')
                    .doc(coll);

                const snapshot = await docRef.get();
                if (snapshot.exists) {
                    const data = snapshot.data();
                    const items = JSON.parse(data.items || '[]');
                    localStorage.setItem(coll, JSON.stringify(items));
                }
            }

            // Sync counters
            const counterRef = this.db
                .collection('choli_stores')
                .doc(this.storeId)
                .collection('data')
                .doc('counters');

            const counterSnap = await counterRef.get();
            if (counterSnap.exists) {
                const counters = counterSnap.data();
                ['cholis_counter', 'customers_counter', 'bookings_counter'].forEach(k => {
                    if (counters[k] !== undefined) {
                        localStorage.setItem(k, counters[k]);
                    }
                });
            }

            this._updateSyncUI('connected');
            if (typeof refreshCurrentPage === 'function') {
                refreshCurrentPage();
            }
            if (typeof showToast === 'function') {
                showToast('Cloud data downloaded and synced!', 'success');
            }
            return true;
        } catch (err) {
            console.error('Download all failed:', err);
            this._updateSyncUI('error');
            return false;
        }
    }

    // ---- Check if cloud already has store data ----
    async hasCloudData() {
        if (!this.isConnected) return false;
        try {
            const docRef = this.db
                .collection('choli_stores')
                .doc(this.storeId)
                .collection('data')
                .doc('cholis');
            const snap = await docRef.get();
            return snap.exists;
        } catch (e) {
            return false;
        }
    }

    // ---- Disconnect ----
    disconnect() {
        this._stopListeners();
        this.isConnected = false;
        this.db = null;
        this.storeId = null;
        localStorage.removeItem('_firebaseConfig');
        localStorage.removeItem('_storeId');
        this._updateSyncUI('disconnected');
        if (typeof showToast === 'function') {
            showToast('Disconnected from Cloud Sync. Now running offline.', 'warning');
        }
    }

    _getDeviceId() {
        let deviceId = localStorage.getItem('_deviceId');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem('_deviceId', deviceId);
        }
        return deviceId;
    }

    _updateSyncUI(status) {
        const indicator = document.getElementById('syncStatus');
        const modalIndicator = document.getElementById('modalSyncStatus');
        
        const states = {
            connected: { icon: 'fas fa-cloud', color: '#10B981', text: 'Live Cloud Sync' },
            syncing: { icon: 'fas fa-sync fa-spin', color: '#F59E0B', text: 'Syncing...' },
            error: { icon: 'fas fa-exclamation-circle', color: '#EF4444', text: 'Sync Error' },
            disconnected: { icon: 'fas fa-cloud-slash', color: '#64748B', text: 'Local Only' },
        };

        const state = states[status] || states.disconnected;
        const html = `<i class="${state.icon}" style="color:${state.color};margin-right:6px;"></i><span>${state.text}</span>`;

        if (indicator) {
            indicator.innerHTML = html;
            indicator.className = `sync-status-pill status-${status}`;
        }
        if (modalIndicator) {
            modalIndicator.innerHTML = html;
        }
    }
}

window.cloudSync = new CloudSync();
