/* ============================================================
   Choli Rental Manager – Application Logic
   Uses localStorage for persistence (no backend required)
   ============================================================ */

// ==================== DATA LAYER ====================

const DB = {
    get(key) {
        try { return JSON.parse(localStorage.getItem(key)) || []; }
        catch { return []; }
    },
    set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        if (window.cloudSync && window.cloudSync.isConnected) {
            window.cloudSync.saveCollection(key, data);
        }
    },
    nextId(key) {
        const counter = parseInt(localStorage.getItem(key + '_counter') || '0') + 1;
        localStorage.setItem(key + '_counter', counter);
        if (window.cloudSync && window.cloudSync.isConnected) {
            window.cloudSync.saveCounter(key + '_counter', counter);
        }
        return counter;
    }
};

// ==================== UTILITY HELPERS ====================

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function toDateStr(date) {
    // Returns YYYY-MM-DD string from a Date object
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
}

function todayStr() {
    return toDateStr(new Date());
}

function generateBookingId() {
    const num = DB.nextId('bookings');
    return 'BK' + String(num).padStart(4, '0');
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        warning: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle'
    };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type]}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(80px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== MODAL MANAGEMENT ====================

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
    if (id === 'syncModal') {
        updateSyncPageUI();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ==================== NAVIGATION ====================

let currentFilter = 'all';
let currentBookingFilter = 'all';
let activePage = 'dashboard';

document.querySelectorAll('.nav-links li').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        navigateTo(page);
    });
});

function refreshCurrentPage() {
    switch(activePage) {
        case 'dashboard': refreshDashboard(); break;
        case 'inventory': renderInventory(); break;
        case 'availability': checkAvailability(); break;
        case 'bookings': renderBookings(); break;
        case 'customers': renderCustomers(); break;
        case 'returns': renderReturns(); break;
        case 'reports': renderReports(); break;
        case 'sync': updateSyncPageUI(); break;
    }
}

function navigateTo(page) {
    activePage = page;
    // Update sidebar
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-links li[data-page="${page}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) targetPage.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Dashboard',
        inventory: 'Inventory',
        availability: 'Check Availability',
        bookings: 'Bookings',
        customers: 'Customers',
        returns: 'Returns',
        reports: 'Reports',
        sync: 'Multi-Device Sync & Backup'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    // Refresh page data
    refreshCurrentPage();

    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
}

// Mobile menu toggle
document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

// ==================== CHOLI / INVENTORY MANAGEMENT ====================

function saveCholi(e) {
    e.preventDefault();
    const cholis = DB.get('cholis');
    const editId = document.getElementById('choliEditId').value;

    const choliData = {
        name: document.getElementById('choliName').value.trim(),
        category: document.getElementById('choliCategory').value,
        color: document.getElementById('choliColor').value.trim(),
        size: document.getElementById('choliSize').value,
        price: parseFloat(document.getElementById('choliPrice').value) || 0,
        deposit: parseFloat(document.getElementById('choliDeposit').value) || 0,
        description: document.getElementById('choliDesc').value.trim(),
        image: document.getElementById('choliImage').value.trim()
    };

    if (editId) {
        // Edit existing
        const idx = cholis.findIndex(c => c.id == editId);
        if (idx !== -1) {
            cholis[idx] = { ...cholis[idx], ...choliData };
            showToast('Choli updated successfully!');
        }
    } else {
        // Add new
        choliData.id = DB.nextId('cholis');
        choliData.createdAt = todayStr();
        cholis.push(choliData);
        showToast('New choli added to inventory!');
    }

    DB.set('cholis', cholis);
    closeModal('addCholiModal');
    document.getElementById('choliForm').reset();
    document.getElementById('choliEditId').value = '';
    renderInventory();
}

function handleCholiImageFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 800;
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
            document.getElementById('choliImage').value = compressedDataUrl;
            updateCholiImagePreview(compressedDataUrl);
            showToast('Photo uploaded!', 'success');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function selectPresetImage(url) {
    document.getElementById('choliImage').value = url;
    updateCholiImagePreview(url);
}

function updateCholiImagePreview(url) {
    const preview = document.getElementById('choliPreviewBox');
    if (!preview) return;
    if (url && url.trim() !== '') {
        preview.innerHTML = `<img src="${url}" alt="Preview" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">`;
    } else {
        preview.innerHTML = `<div style="text-align:center;"><i class="fas fa-camera" style="font-size:1.8rem;color:var(--text-light);opacity:0.6;"></i><div style="font-size:0.75rem;color:var(--text-light);margin-top:4px;">No photo selected</div></div>`;
    }
}

function editCholi(id) {
    const cholis = DB.get('cholis');
    const choli = cholis.find(c => c.id == id);
    if (!choli) return;

    document.getElementById('choliModalTitle').textContent = 'Edit Choli';
    document.getElementById('choliEditId').value = choli.id;
    document.getElementById('choliName').value = choli.name;
    document.getElementById('choliCategory').value = choli.category;
    document.getElementById('choliColor').value = choli.color;
    document.getElementById('choliSize').value = choli.size;
    document.getElementById('choliPrice').value = choli.price;
    document.getElementById('choliDeposit').value = choli.deposit || 0;
    document.getElementById('choliDesc').value = choli.description || '';
    document.getElementById('choliImage').value = choli.image || '';
    updateCholiImagePreview(choli.image || '');
    openModal('addCholiModal');
}

function deleteCholi(id) {
    showConfirm('Delete this choli from inventory?', () => {
        let cholis = DB.get('cholis');
        cholis = cholis.filter(c => c.id != id);
        DB.set('cholis', cholis);
        showToast('Choli deleted', 'warning');
        renderInventory();
    });
}

function getCholiStatus(choliId) {
    const bookings = DB.get('bookings');
    const today = todayStr();
    const activeBooking = bookings.find(b =>
        b.choliId == choliId &&
        b.status !== 'cancelled' &&
        b.status !== 'completed' &&
        b.pickupDate <= today &&
        b.returnDate >= today
    );
    return activeBooking ? 'rented' : 'available';
}

function filterInventory(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderInventory();
}

function renderInventory() {
    const cholis = DB.get('cholis');
    const search = (document.getElementById('inventorySearch')?.value || '').toLowerCase();
    const grid = document.getElementById('inventoryGrid');

    let filtered = cholis.filter(c => {
        const matchSearch = !search ||
            c.name.toLowerCase().includes(search) ||
            c.color.toLowerCase().includes(search) ||
            c.size.toLowerCase().includes(search) ||
            c.category.toLowerCase().includes(search);
        const status = getCholiStatus(c.id);
        const matchFilter = currentFilter === 'all' || currentFilter === status;
        return matchSearch && matchFilter;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">
            <i class="fas fa-box-open"></i>
            <p>No cholis found. Add your first choli to get started!</p>
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(c => {
        const status = getCholiStatus(c.id);
        const imageHtml = c.image
            ? `<img src="${c.image}" alt="${c.name}" loading="lazy" onerror="this.onerror=null;this.src='https://upload.wikimedia.org/wikipedia/commons/d/d1/Ethnic_wear_for_women_Blue_Lehenga.png'">`
            : `<i class="fas fa-vest placeholder-icon"></i>`;

        return `
        <div class="choli-card">
            <div class="choli-image">
                ${imageHtml}
                <span class="choli-price-badge">₹${c.price.toLocaleString('en-IN')}<small>/event</small></span>
                <span class="choli-status-badge badge-${status}">
                    <i class="fas fa-${status === 'available' ? 'circle-check' : 'clock'}"></i> ${status}
                </span>
            </div>
            <div class="choli-details">
                <div class="choli-category-pill">${c.category || 'Ethnic Wear'}</div>
                <div class="choli-name">${c.name}</div>
                ${c.description ? `<p class="choli-desc-snippet">${c.description}</p>` : ''}
                <div class="choli-meta">
                    <span class="meta-tag"><i class="fas fa-palette"></i> ${c.color}</span>
                    <span class="meta-tag"><i class="fas fa-ruler-horizontal"></i> ${c.size}</span>
                    <span class="meta-tag"><i class="fas fa-shield-halved"></i> Dep: ₹${c.deposit || 0}</span>
                </div>
                <div class="choli-card-footer">
                    <div class="choli-price">₹${c.price.toLocaleString('en-IN')} <small>rent</small></div>
                    <div class="choli-actions">
                        <button class="btn btn-primary btn-sm" onclick="quickBook(${c.id})" ${status === 'rented' ? 'disabled style="opacity:0.5"' : ''}>
                            <i class="fas fa-calendar-plus"></i> Book
                        </button>
                        <button class="btn btn-secondary btn-icon" onclick="editCholi(${c.id})" title="Edit Choli">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-secondary btn-icon" onclick="deleteCholi(${c.id})" title="Delete Choli">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ==================== AVAILABILITY CHECK ====================

function isCholiAvailable(choliId, eventDate) {
    const bookings = DB.get('bookings');
    const pickupDate = addDays(eventDate, -1);
    const returnDate = addDays(eventDate, 1);

    return !bookings.some(b =>
        b.choliId == choliId &&
        b.status !== 'cancelled' &&
        b.status !== 'completed' &&
        b.pickupDate <= returnDate &&
        b.returnDate >= pickupDate
    );
}

function getConflictingBooking(choliId, eventDate) {
    const bookings = DB.get('bookings');
    const pickupDate = addDays(eventDate, -1);
    const returnDate = addDays(eventDate, 1);

    return bookings.find(b =>
        b.choliId == choliId &&
        b.status !== 'cancelled' &&
        b.status !== 'completed' &&
        b.pickupDate <= returnDate &&
        b.returnDate >= pickupDate
    );
}

function checkAvailability() {
    const eventDate = document.getElementById('availEventDate').value;
    if (!eventDate) {
        showToast('Please select an event date', 'error');
        return;
    }

    const search = (document.getElementById('availSearchCholi')?.value || '').toLowerCase();
    const cholis = DB.get('cholis');
    const customers = DB.get('customers');
    const pickupDate = addDays(eventDate, -1);
    const returnDate = addDays(eventDate, 1);

    let filtered = cholis.filter(c =>
        !search ||
        c.name.toLowerCase().includes(search) ||
        c.color.toLowerCase().includes(search) ||
        c.size.toLowerCase().includes(search)
    );

    const results = document.getElementById('availabilityResults');

    if (filtered.length === 0) {
        results.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No cholis match your search.</p></div>`;
        return;
    }

    const availCount = filtered.filter(c => isCholiAvailable(c.id, eventDate)).length;

    results.innerHTML = `
        <div class="card" style="margin-bottom:15px;">
            <div class="card-body" style="padding:14px 18px;">
                <strong>${availCount}</strong> of ${filtered.length} cholis available for event on <strong>${formatDate(eventDate)}</strong>
                &nbsp;|&nbsp; Pickup: ${formatDate(pickupDate)} &nbsp;→&nbsp; Return: ${formatDate(returnDate)}
            </div>
        </div>
        <div class="avail-grid">
            ${filtered.map(c => {
                const available = isCholiAvailable(c.id, eventDate);
                const conflict = !available ? getConflictingBooking(c.id, eventDate) : null;
                const conflictCustomer = conflict ? customers.find(cu => cu.id == conflict.customerId) : null;

                const imgThumb = c.image
                    ? `<img src="${c.image}" alt="${c.name}" class="avail-card-thumb" onerror="this.style.display='none'">`
                    : '';

                return `
                <div class="avail-card ${available ? '' : 'unavailable'}">
                    <div class="avail-card-header">
                        ${imgThumb}
                        <div class="avail-card-info">
                            <div class="avail-name">${c.name}</div>
                            <div class="avail-meta">
                                <span><i class="fas fa-palette"></i> ${c.color}</span> • 
                                <span><i class="fas fa-ruler-horizontal"></i> ${c.size}</span>
                            </div>
                            <div class="avail-price">₹${c.price.toLocaleString('en-IN')}<small>/event</small></div>
                        </div>
                    </div>
                    <div class="avail-status ${available ? 'available' : 'unavailable'}">
                        ${available ? '<i class="fas fa-circle-check"></i> Available for this date' : `<i class="fas fa-circle-xmark"></i> Booked${conflictCustomer ? ' by ' + conflictCustomer.name : ''} (${conflict ? conflict.bookingId : ''})`}
                    </div>
                    ${available ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px;justify-content:center;" onclick="quickBookWithDate(${c.id}, '${eventDate}')">
                        <i class="fas fa-bookmark"></i> Book This Choli
                    </button>` : ''}
                </div>`;
            }).join('')}
        </div>`;
}

// ==================== BOOKING MANAGEMENT ====================

function openNewBooking() {
    document.getElementById('bookingForm').reset();
    document.getElementById('bookingEditId').value = '';
    populateBookingDropdowns();
    openModal('newBookingModal');
}

function quickBook(choliId) {
    openNewBooking();
    document.getElementById('bookingCholi').value = choliId;
    updateBookingAmount();
}

function quickBookWithDate(choliId, eventDate) {
    openNewBooking();
    document.getElementById('bookingCholi').value = choliId;
    document.getElementById('bookingEventDate').value = eventDate;
    updateBookingDates();
    updateBookingAmount();
}

function populateBookingDropdowns() {
    const customers = DB.get('customers');
    const cholis = DB.get('cholis');

    const custSelect = document.getElementById('bookingCustomer');
    custSelect.innerHTML = '<option value="">Select Customer</option>' +
        customers.map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('');

    const choliSelect = document.getElementById('bookingCholi');
    choliSelect.innerHTML = '<option value="">Select a Choli</option>' +
        cholis.map(c => `<option value="${c.id}">${c.name} — ${c.color}, ${c.size} (₹${c.price})</option>`).join('');
}

function updateBookingDates() {
    const eventDate = document.getElementById('bookingEventDate').value;
    if (eventDate) {
        document.getElementById('bookingPickupDate').value = addDays(eventDate, -1);
        document.getElementById('bookingReturnDate').value = addDays(eventDate, 1);
        // Check availability for the selected choli
        updateCholiAvailabilityHint();
    }
}

function updateBookingAmount() {
    const choliId = document.getElementById('bookingCholi').value;
    if (!choliId) return;
    const cholis = DB.get('cholis');
    const choli = cholis.find(c => c.id == choliId);
    if (choli) {
        document.getElementById('bookingAmount').value = choli.price;
        document.getElementById('bookingDeposit').value = choli.deposit || 0;
    }
    updateCholiAvailabilityHint();
}

function updateCholiAvailabilityHint() {
    const choliId = document.getElementById('bookingCholi').value;
    const eventDate = document.getElementById('bookingEventDate').value;
    const hint = document.getElementById('choliAvailHint');
    if (!choliId || !eventDate) {
        hint.textContent = '';
        return;
    }
    if (isCholiAvailable(choliId, eventDate)) {
        hint.textContent = '✅ Available for this date';
        hint.style.color = '#10B981';
    } else {
        hint.textContent = '❌ Not available — already booked for overlapping dates';
        hint.style.color = '#EF4444';
    }
}

function saveBooking(e) {
    e.preventDefault();

    const customerId = document.getElementById('bookingCustomer').value;
    const choliId = document.getElementById('bookingCholi').value;
    const eventDate = document.getElementById('bookingEventDate').value;

    if (!customerId || !choliId || !eventDate) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    // Check availability
    const editId = document.getElementById('bookingEditId').value;
    if (!editId && !isCholiAvailable(choliId, eventDate)) {
        showToast('This choli is not available for the selected dates!', 'error');
        return;
    }

    const bookings = DB.get('bookings');
    const pickupDate = addDays(eventDate, -1);
    const returnDate = addDays(eventDate, 1);

    const bookingData = {
        customerId: parseInt(customerId),
        choliId: parseInt(choliId),
        eventDate,
        pickupDate,
        returnDate,
        amount: parseFloat(document.getElementById('bookingAmount').value) || 0,
        deposit: parseFloat(document.getElementById('bookingDeposit').value) || 0,
        advance: parseFloat(document.getElementById('bookingAdvance').value) || 0,
        paymentMode: document.getElementById('bookingPayMode').value,
        notes: document.getElementById('bookingNotes').value.trim(),
    };

    if (editId) {
        const idx = bookings.findIndex(b => b.bookingId === editId);
        if (idx !== -1) {
            bookings[idx] = { ...bookings[idx], ...bookingData };
            showToast('Booking updated!');
        }
    } else {
        bookingData.bookingId = generateBookingId();
        bookingData.status = 'upcoming';
        bookingData.createdAt = todayStr();
        bookingData.pickedUp = false;
        bookingData.returned = false;
        bookings.push(bookingData);
        showToast(`Booking ${bookingData.bookingId} confirmed!`);
    }

    DB.set('bookings', bookings);
    closeModal('newBookingModal');
    document.getElementById('bookingForm').reset();
    renderBookings();
    refreshDashboard();
}

function filterBookings(filter, btn) {
    currentBookingFilter = filter;
    document.querySelectorAll('[data-bfilter]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderBookings();
}

function renderBookings() {
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');
    const cholis = DB.get('cholis');
    const search = (document.getElementById('bookingSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('bookingsBody');
    const today = todayStr();

    // Auto-update statuses
    bookings.forEach(b => {
        if (b.status === 'cancelled' || b.status === 'completed') return;
        if (b.returned) {
            b.status = 'completed';
        } else if (b.returnDate < today && !b.returned) {
            b.status = 'overdue';
        } else if (b.pickedUp) {
            b.status = 'active';
        } else if (b.pickupDate <= today) {
            b.status = 'active';
        } else {
            b.status = 'upcoming';
        }
    });
    DB.set('bookings', bookings);

    let filtered = bookings.filter(b => {
        const cust = customers.find(c => c.id == b.customerId);
        const choli = cholis.find(c => c.id == b.choliId);
        const matchSearch = !search ||
            b.bookingId.toLowerCase().includes(search) ||
            (cust && cust.name.toLowerCase().includes(search)) ||
            (choli && choli.name.toLowerCase().includes(search));
        const matchFilter = currentBookingFilter === 'all' || b.status === currentBookingFilter;
        return matchSearch && matchFilter;
    });

    // Sort: newest first
    filtered.sort((a, b) => b.bookingId.localeCompare(a.bookingId));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">
            <i class="fas fa-calendar-xmark"></i><p>No bookings found.</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        const cust = customers.find(c => c.id == b.customerId);
        const choli = cholis.find(c => c.id == b.choliId);
        return `<tr>
            <td><strong>${b.bookingId}</strong></td>
            <td>${cust ? cust.name : 'Unknown'}</td>
            <td>${choli ? choli.name : 'Unknown'}</td>
            <td>${formatDate(b.eventDate)}</td>
            <td>${formatDate(b.pickupDate)}</td>
            <td>${formatDate(b.returnDate)}</td>
            <td>₹${b.amount.toLocaleString('en-IN')}</td>
            <td><span class="status-badge status-${b.status}">${b.status}</span></td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-secondary btn-icon" onclick="viewBooking('${b.bookingId}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${b.status !== 'completed' && b.status !== 'cancelled' ? `
                    <button class="btn btn-secondary btn-icon" onclick="cancelBooking('${b.bookingId}')" title="Cancel">
                        <i class="fas fa-ban"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function viewBooking(bookingId) {
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');
    const cholis = DB.get('cholis');
    const b = bookings.find(bk => bk.bookingId === bookingId);
    if (!b) return;
    const cust = customers.find(c => c.id == b.customerId);
    const choli = cholis.find(c => c.id == b.choliId);
    const balance = b.amount + (b.deposit || 0) - (b.advance || 0);

    document.getElementById('bookingDetailsContent').innerHTML = `
        <div class="booking-detail-grid">
            <div class="detail-row"><span class="detail-label">Booking ID</span><span class="detail-value">${b.bookingId}</span></div>
            <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value"><span class="status-badge status-${b.status}">${b.status}</span></span></div>
            <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${cust ? cust.name : 'Unknown'}</span></div>
            <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${cust ? cust.phone : '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Choli</span><span class="detail-value">${choli ? choli.name : 'Unknown'}</span></div>
            <div class="detail-row"><span class="detail-label">Event Date</span><span class="detail-value">${formatDate(b.eventDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Pickup Date</span><span class="detail-value">${formatDate(b.pickupDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Return Date</span><span class="detail-value">${formatDate(b.returnDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Rent Amount</span><span class="detail-value">₹${b.amount.toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Security Deposit</span><span class="detail-value">₹${(b.deposit || 0).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Advance Paid</span><span class="detail-value">₹${(b.advance || 0).toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Balance Due</span><span class="detail-value" style="color:#EF4444;font-weight:700;">₹${balance.toLocaleString('en-IN')}</span></div>
            <div class="detail-row"><span class="detail-label">Payment Mode</span><span class="detail-value">${b.paymentMode || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${b.notes || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Created</span><span class="detail-value">${formatDate(b.createdAt)}</span></div>
        </div>
        <div class="modal-footer" style="margin-top:20px;">
            ${b.status === 'active' || b.status === 'overdue' ? `
                <button class="btn btn-success" onclick="markReturned('${b.bookingId}')">
                    <i class="fas fa-check"></i> Mark Returned
                </button>
            ` : ''}
            ${b.status === 'upcoming' ? `
                <button class="btn btn-warning" onclick="markPickedUp('${b.bookingId}')">
                    <i class="fas fa-box"></i> Mark Picked Up
                </button>
            ` : ''}
        </div>
    `;
    openModal('bookingDetailsModal');
}

function cancelBooking(bookingId) {
    showConfirm('Cancel this booking?', () => {
        const bookings = DB.get('bookings');
        const b = bookings.find(bk => bk.bookingId === bookingId);
        if (b) {
            b.status = 'cancelled';
            DB.set('bookings', bookings);
            showToast('Booking cancelled', 'warning');
            renderBookings();
            refreshDashboard();
        }
    });
}

function markPickedUp(bookingId) {
    const bookings = DB.get('bookings');
    const b = bookings.find(bk => bk.bookingId === bookingId);
    if (b) {
        b.pickedUp = true;
        b.status = 'active';
        b.actualPickupDate = todayStr();
        DB.set('bookings', bookings);
        showToast('Marked as picked up!');
        closeModal('bookingDetailsModal');
        renderBookings();
        refreshDashboard();
    }
}

function markReturned(bookingId) {
    const bookings = DB.get('bookings');
    const b = bookings.find(bk => bk.bookingId === bookingId);
    if (b) {
        b.returned = true;
        b.status = 'completed';
        b.actualReturnDate = todayStr();
        DB.set('bookings', bookings);
        showToast('Choli returned successfully! ✅');
        closeModal('bookingDetailsModal');
        renderBookings();
        renderReturns();
        refreshDashboard();
    }
}

// ==================== CUSTOMER MANAGEMENT ====================

function saveCustomer(e) {
    e.preventDefault();
    const customers = DB.get('customers');
    const editId = document.getElementById('custEditId').value;

    const custData = {
        name: document.getElementById('custName').value.trim(),
        phone: document.getElementById('custPhone').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        idProof: document.getElementById('custIdProof').value.trim(),
    };

    if (editId) {
        const idx = customers.findIndex(c => c.id == editId);
        if (idx !== -1) {
            customers[idx] = { ...customers[idx], ...custData };
            showToast('Customer updated!');
        }
    } else {
        // Check duplicate phone
        if (customers.some(c => c.phone === custData.phone)) {
            showToast('Customer with this phone already exists!', 'error');
            return;
        }
        custData.id = DB.nextId('customers');
        custData.createdAt = todayStr();
        customers.push(custData);
        showToast('Customer added!');
    }

    DB.set('customers', customers);
    closeModal('addCustomerModal');
    document.getElementById('customerForm').reset();
    document.getElementById('custEditId').value = '';
    renderCustomers();
}

function editCustomer(id) {
    const customers = DB.get('customers');
    const c = customers.find(cu => cu.id == id);
    if (!c) return;

    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('custEditId').value = c.id;
    document.getElementById('custName').value = c.name;
    document.getElementById('custPhone').value = c.phone;
    document.getElementById('custEmail').value = c.email || '';
    document.getElementById('custAddress').value = c.address || '';
    document.getElementById('custIdProof').value = c.idProof || '';
    openModal('addCustomerModal');
}

function deleteCustomer(id) {
    showConfirm('Delete this customer? Their booking history will remain.', () => {
        let customers = DB.get('customers');
        customers = customers.filter(c => c.id != id);
        DB.set('customers', customers);
        showToast('Customer deleted', 'warning');
        renderCustomers();
    });
}

function renderCustomers() {
    const customers = DB.get('customers');
    const bookings = DB.get('bookings');
    const search = (document.getElementById('customerSearch')?.value || '').toLowerCase();
    const tbody = document.getElementById('customersBody');

    let filtered = customers.filter(c =>
        !search ||
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search) ||
        (c.email && c.email.toLowerCase().includes(search))
    );

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
            <i class="fas fa-user-slash"></i><p>No customers found.</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const bookingCount = bookings.filter(b => b.customerId == c.id).length;
        return `<tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.phone}</td>
            <td>${c.email || '—'}</td>
            <td>${c.address || '—'}</td>
            <td>${bookingCount}</td>
            <td>
                <div style="display:flex;gap:4px;">
                    <button class="btn btn-secondary btn-icon" onclick="editCustomer(${c.id})" title="Edit">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn btn-secondary btn-icon" onclick="deleteCustomer(${c.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ==================== RETURNS PAGE ====================

function renderReturns() {
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');
    const cholis = DB.get('cholis');
    const today = todayStr();
    const tbody = document.getElementById('returnsBody');

    const pending = bookings.filter(b =>
        !b.returned &&
        b.status !== 'cancelled' &&
        b.status !== 'completed' &&
        (b.status === 'active' || b.status === 'overdue' || b.pickupDate <= today)
    ).sort((a, b) => a.returnDate.localeCompare(b.returnDate));

    if (pending.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
            <i class="fas fa-check-double"></i><p>No pending returns! 🎉</p>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = pending.map(b => {
        const cust = customers.find(c => c.id == b.customerId);
        const choli = cholis.find(c => c.id == b.choliId);
        const isOverdue = b.returnDate < today;

        return `<tr>
            <td><strong>${b.bookingId}</strong></td>
            <td>${cust ? cust.name : 'Unknown'}</td>
            <td>${choli ? choli.name : 'Unknown'}</td>
            <td>${formatDate(b.eventDate)}</td>
            <td style="${isOverdue ? 'color:#EF4444;font-weight:600;' : ''}">${formatDate(b.returnDate)} ${isOverdue ? '⚠️' : ''}</td>
            <td><span class="status-badge status-${isOverdue ? 'overdue' : 'active'}">${isOverdue ? 'Overdue' : 'Active'}</span></td>
            <td>
                <button class="btn btn-success btn-sm" onclick="markReturned('${b.bookingId}')">
                    <i class="fas fa-check"></i> Return
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ==================== REPORTS ====================

function renderReports() {
    renderMonthlyChart();
    renderPopularCholis();
    renderTopCustomers();
}

function renderMonthlyChart() {
    const bookings = DB.get('bookings');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = new Date().getFullYear();

    // Aggregate revenue by month for current year
    const monthlyData = new Array(12).fill(0);
    bookings.forEach(b => {
        if (b.status !== 'cancelled') {
            const d = new Date(b.eventDate + 'T00:00:00');
            if (d.getFullYear() === currentYear) {
                monthlyData[d.getMonth()] += b.amount;
            }
        }
    });

    const maxVal = Math.max(...monthlyData, 1);
    const container = document.getElementById('monthlyRevenueChart');

    container.innerHTML = monthlyData.map((val, i) => {
        const height = Math.max((val / maxVal) * 160, 4);
        return `<div class="chart-bar-wrapper">
            <span class="chart-bar-value">${val > 0 ? '₹' + (val / 1000).toFixed(1) + 'k' : ''}</span>
            <div class="chart-bar" style="height:${height}px" title="₹${val.toLocaleString('en-IN')}"></div>
            <span class="chart-bar-label">${monthNames[i]}</span>
        </div>`;
    }).join('');
}

function renderPopularCholis() {
    const bookings = DB.get('bookings');
    const cholis = DB.get('cholis');

    const counts = {};
    bookings.forEach(b => {
        if (b.status !== 'cancelled') {
            counts[b.choliId] = (counts[b.choliId] || 0) + 1;
        }
    });

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const container = document.getElementById('popularCholis');
    if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No booking data yet</p></div>';
        return;
    }

    container.innerHTML = sorted.map(([choliId, count], i) => {
        const choli = cholis.find(c => c.id == choliId);
        return `<div class="popular-item">
            <span class="rank">${i + 1}</span>
            <span class="item-name">${choli ? choli.name : 'Deleted Choli'}</span>
            <span class="item-count">${count} bookings</span>
        </div>`;
    }).join('');
}

function renderTopCustomers() {
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');

    const counts = {};
    bookings.forEach(b => {
        if (b.status !== 'cancelled') {
            counts[b.customerId] = (counts[b.customerId] || 0) + 1;
        }
    });

    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const container = document.getElementById('topCustomers');
    if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No customer data yet</p></div>';
        return;
    }

    container.innerHTML = sorted.map(([custId, count], i) => {
        const cust = customers.find(c => c.id == custId);
        return `<div class="popular-item">
            <span class="rank">${i + 1}</span>
            <span class="item-name">${cust ? cust.name : 'Deleted Customer'}</span>
            <span class="item-count">${count} rentals</span>
        </div>`;
    }).join('');
}

function generateReport() {
    const from = document.getElementById('reportFrom').value;
    const to = document.getElementById('reportTo').value;
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');
    const cholis = DB.get('cholis');

    let filtered = bookings.filter(b => b.status !== 'cancelled');
    if (from) filtered = filtered.filter(b => b.eventDate >= from);
    if (to) filtered = filtered.filter(b => b.eventDate <= to);

    filtered.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    const totalRev = filtered.reduce((s, b) => s + b.amount, 0);
    const totalDep = filtered.reduce((s, b) => s + (b.deposit || 0), 0);

    const container = document.getElementById('reportResults');
    container.innerHTML = `
        <div style="margin-bottom:12px;font-size:0.9rem;">
            <strong>${filtered.length}</strong> bookings | Total Revenue: <strong>₹${totalRev.toLocaleString('en-IN')}</strong> | Total Deposits: <strong>₹${totalDep.toLocaleString('en-IN')}</strong>
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr><th>Booking ID</th><th>Customer</th><th>Choli</th><th>Event Date</th><th>Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${filtered.map(b => {
                        const cust = customers.find(c => c.id == b.customerId);
                        const choli = cholis.find(c => c.id == b.choliId);
                        return `<tr>
                            <td>${b.bookingId}</td>
                            <td>${cust ? cust.name : '—'}</td>
                            <td>${choli ? choli.name : '—'}</td>
                            <td>${formatDate(b.eventDate)}</td>
                            <td>₹${b.amount.toLocaleString('en-IN')}</td>
                            <td><span class="status-badge status-${b.status}">${b.status}</span></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// ==================== DASHBOARD ====================

function refreshDashboard() {
    const cholis = DB.get('cholis');
    const bookings = DB.get('bookings');
    const customers = DB.get('customers');
    const today = todayStr();

    // Stats
    document.getElementById('statTotalCholis').textContent = cholis.length;

    const availableCount = cholis.filter(c => getCholiStatus(c.id) === 'available').length;
    document.getElementById('statAvailable').textContent = availableCount;

    const rentedCount = cholis.length - availableCount;
    document.getElementById('statRentedOut').textContent = rentedCount;

    const overdueCount = bookings.filter(b =>
        b.returnDate < today &&
        !b.returned &&
        b.status !== 'cancelled' &&
        b.status !== 'completed'
    ).length;
    document.getElementById('statOverdue').textContent = overdueCount;

    // Today's pickups
    const todayPickups = bookings.filter(b => b.pickupDate === today && b.status !== 'cancelled' && b.status !== 'completed');
    const pickupsList = document.getElementById('pickupsList');
    if (todayPickups.length === 0) {
        pickupsList.innerHTML = '<div class="empty-state" style="padding:10px;"><p>No pickups today</p></div>';
    } else {
        pickupsList.innerHTML = todayPickups.map(b => {
            const cust = customers.find(c => c.id == b.customerId);
            const choli = cholis.find(c => c.id == b.choliId);
            return `<div class="activity-item">
                <div class="item-info">
                    <span class="item-name">${choli ? choli.name : 'Unknown'}</span>
                    <span class="item-detail">${cust ? cust.name + ' • ' + cust.phone : ''}</span>
                </div>
                <span class="status-badge status-${b.pickedUp ? 'completed' : 'upcoming'}">${b.pickedUp ? 'Done' : 'Pending'}</span>
            </div>`;
        }).join('');
    }

    // Today's returns
    const todayReturns = bookings.filter(b => b.returnDate === today && !b.returned && b.status !== 'cancelled');
    const returnsList = document.getElementById('returnsList');
    if (todayReturns.length === 0) {
        returnsList.innerHTML = '<div class="empty-state" style="padding:10px;"><p>No returns due today</p></div>';
    } else {
        returnsList.innerHTML = todayReturns.map(b => {
            const cust = customers.find(c => c.id == b.customerId);
            const choli = cholis.find(c => c.id == b.choliId);
            return `<div class="activity-item">
                <div class="item-info">
                    <span class="item-name">${choli ? choli.name : 'Unknown'}</span>
                    <span class="item-detail">${cust ? cust.name + ' • ' + cust.phone : ''}</span>
                </div>
                <button class="btn btn-success btn-sm" onclick="markReturned('${b.bookingId}')">Return</button>
            </div>`;
        }).join('');
    }

    // Recent bookings
    const recent = [...bookings].sort((a, b) => b.bookingId.localeCompare(a.bookingId)).slice(0, 5);
    const recentList = document.getElementById('recentBookings');
    if (recent.length === 0) {
        recentList.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-plus"></i><p>No bookings yet</p></div>';
    } else {
        recentList.innerHTML = recent.map(b => {
            const cust = customers.find(c => c.id == b.customerId);
            const choli = cholis.find(c => c.id == b.choliId);
            return `<div class="activity-item" style="cursor:pointer" onclick="navigateTo('bookings')">
                <div class="item-info">
                    <span class="item-name">${b.bookingId} — ${choli ? choli.name : 'Unknown'}</span>
                    <span class="item-detail">${cust ? cust.name : ''} • Event: ${formatDate(b.eventDate)}</span>
                </div>
                <span class="status-badge status-${b.status}">${b.status}</span>
            </div>`;
        }).join('');
    }

    // Revenue
    const currentMonth = today.substring(0, 7); // YYYY-MM
    const monthRevenue = bookings
        .filter(b => b.status !== 'cancelled' && b.eventDate.startsWith(currentMonth))
        .reduce((s, b) => s + b.amount, 0);
    document.getElementById('revenueMonth').textContent = '₹' + monthRevenue.toLocaleString('en-IN');

    const totalRevenue = bookings
        .filter(b => b.status !== 'cancelled')
        .reduce((s, b) => s + b.amount, 0);
    document.getElementById('revenueTotal').textContent = '₹' + totalRevenue.toLocaleString('en-IN');

    document.getElementById('totalBookingsCount').textContent = bookings.filter(b => b.status !== 'cancelled').length;

    const pendingAmt = bookings
        .filter(b => b.status !== 'cancelled' && b.status !== 'completed')
        .reduce((s, b) => s + (b.amount + (b.deposit || 0) - (b.advance || 0)), 0);
    document.getElementById('pendingAmount').textContent = '₹' + pendingAmt.toLocaleString('en-IN');
}

// ==================== CONFIRM DIALOG ====================

function showConfirm(message, onYes) {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmYesBtn').onclick = () => {
        closeModal('confirmDialog');
        onYes();
    };
    openModal('confirmDialog');
}

// ==================== SEED DEMO DATA & RESET ====================

const SAMPLE_CHOLI_IMAGES = [
    'https://upload.wikimedia.org/wikipedia/commons/d/d1/Ethnic_wear_for_women_Blue_Lehenga.png',
    'https://upload.wikimedia.org/wikipedia/commons/0/0f/Close-up_of_a_red_velvet_lehenga_with_intricate_gold_embroidery%2C_featuring_a_choli_and_a_flowing_skirt.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/3/31/Lehenga-Choli_%286375587865%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/0/05/Gota_Embroidery.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/2/2f/Hasseen2.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/9/9a/Indian_girl_in_Ghagra_Choli.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/4/44/A-store-person-showcases-a-lehenga.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/1/1c/Lehnga.jpg'
];

function ensureCholiImages() {
    let cholis = DB.get('cholis');
    let updated = false;
    cholis.forEach((c, idx) => {
        if (!c.image || c.image.trim() === '') {
            c.image = SAMPLE_CHOLI_IMAGES[idx % SAMPLE_CHOLI_IMAGES.length];
            updated = true;
        }
    });
    if (updated) {
        DB.set('cholis', cholis);
    }
}

function seedDemoData(force = false) {
    if (!force && localStorage.getItem('_initialized')) return;
    localStorage.setItem('_initialized', 'true');

    const cholis = [
        { id: 1, name: 'Royal Blue Zari Bridal #101', category: 'Bridal', color: 'Royal Blue', size: 'M', price: 1500, deposit: 500, description: 'Heavy zari embroidery, silk fabric with rich dupatta', image: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Ethnic_wear_for_women_Blue_Lehenga.png', createdAt: '2026-01-01' },
        { id: 2, name: 'Crimson Red Velvet Bridal #102', category: 'Bridal', color: 'Crimson Red', size: 'S', price: 1800, deposit: 600, description: 'Pure velvet with intricate golden zardozi work', image: 'https://upload.wikimedia.org/wikipedia/commons/0/0f/Close-up_of_a_red_velvet_lehenga_with_intricate_gold_embroidery%2C_featuring_a_choli_and_a_flowing_skirt.jpg', createdAt: '2026-01-01' },
        { id: 3, name: 'Rose Pink & Maroon Designer #103', category: 'Party Wear', color: 'Rose Pink', size: 'L', price: 1200, deposit: 400, description: 'Modern fusion lehenga choli with sequin accents', image: 'https://upload.wikimedia.org/wikipedia/commons/3/31/Lehenga-Choli_%286375587865%29.jpg', createdAt: '2026-02-01' },
        { id: 4, name: 'Golden Festive Gota Patti #104', category: 'Festive', color: 'Golden Yellow', size: 'M', price: 1100, deposit: 350, description: 'Traditional Rajasthani gota patti hand embroidery', image: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Gota_Embroidery.jpg', createdAt: '2026-02-15' },
        { id: 5, name: 'Heritage Maroon Silk #105', category: 'Designer', color: 'Maroon', size: 'XL', price: 2200, deposit: 800, description: 'Royal heritage silk piece with heavy artisan borders', image: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Hasseen2.jpg', createdAt: '2026-03-01' },
        { id: 6, name: 'Navratri Gujarati Mirror Work #106', category: 'Traditional', color: 'Multicolor Green', size: 'Free', price: 850, deposit: 250, description: 'Authentic Kutch mirror work and festive flared gagra', image: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Indian_girl_in_Ghagra_Choli.jpg', createdAt: '2026-03-15' },
    ];
    localStorage.setItem('cholis_counter', '6');

    const customers = [
        { id: 1, name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com', address: 'Sector 7, Gandhinagar', idProof: 'XXXX-1234', createdAt: '2026-01-05' },
        { id: 2, name: 'Meera Patel', phone: '9876543211', email: 'meera@example.com', address: 'SG Highway, Ahmedabad', idProof: 'XXXX-5678', createdAt: '2026-01-10' },
        { id: 3, name: 'Kavita Joshi', phone: '9876543212', email: '', address: 'Vastrapur, Ahmedabad', idProof: '', createdAt: '2026-02-01' },
    ];
    localStorage.setItem('customers_counter', '3');

    const bookings = [
        { bookingId: 'BK0001', customerId: 1, choliId: 1, eventDate: '2026-10-30', pickupDate: '2026-10-29', returnDate: '2026-10-31', amount: 1500, deposit: 500, advance: 500, paymentMode: 'UPI', notes: 'Wedding function', status: 'completed', pickedUp: true, returned: true, createdAt: '2026-10-25', actualPickupDate: '2026-10-29', actualReturnDate: '2026-10-31' },
        { bookingId: 'BK0002', customerId: 2, choliId: 3, eventDate: '2026-11-01', pickupDate: '2026-10-31', returnDate: '2026-11-02', amount: 1200, deposit: 400, advance: 500, paymentMode: 'Cash', notes: 'Reception party', status: 'active', pickedUp: true, returned: false, createdAt: '2026-10-28' },
        { bookingId: 'BK0003', customerId: 3, choliId: 5, eventDate: '2026-11-05', pickupDate: '2026-11-04', returnDate: '2026-11-06', amount: 2200, deposit: 800, advance: 1000, paymentMode: 'UPI', notes: 'Engagement ceremony', status: 'upcoming', pickedUp: false, returned: false, createdAt: '2026-10-30' },
    ];
    localStorage.setItem('bookings_counter', '3');

    DB.set('cholis', cholis);
    DB.set('customers', customers);
    DB.set('bookings', bookings);
}

function clearAllData() {
    showConfirm('Clear all sample demo data so you can start entering your real cholis?', () => {
        DB.set('cholis', []);
        DB.set('customers', []);
        DB.set('bookings', []);
        localStorage.setItem('cholis_counter', '0');
        localStorage.setItem('customers_counter', '0');
        localStorage.setItem('bookings_counter', '0');
        localStorage.setItem('_initialized', 'true');
        showToast('All demo data cleared! You are ready to add your real cholis.', 'info');
        refreshCurrentPage();
    });
}

function restoreDemoData() {
    showConfirm('Restore sample demo cholis, customers, and bookings?', () => {
        seedDemoData(true);
        showToast('Sample demo data restored!', 'success');
        refreshCurrentPage();
    });
}

// ==================== MULTI-DEVICE SYNC & BACKUP ====================

async function initCloudSyncFromStorage() {
    const savedConfig = localStorage.getItem('_firebaseConfig');
    const savedStoreId = localStorage.getItem('_storeId');

    if (savedConfig && savedStoreId && window.cloudSync) {
        try {
            await window.cloudSync.init(savedConfig, savedStoreId, true);
        } catch (e) {
            console.warn('Auto cloud sync failed:', e);
        }
    } else if (window.cloudSync) {
        window.cloudSync._updateSyncUI('disconnected');
    }
}

async function handleConnectCloudSync(e) {
    if (e) e.preventDefault();
    const storeId = document.getElementById('syncStoreId').value.trim();
    const configRaw = document.getElementById('syncFirebaseConfig').value.trim();

    if (!storeId) {
        showToast('Please enter a Store / Sync ID', 'error');
        return;
    }
    if (!configRaw) {
        showToast('Please paste your Firebase configuration JSON', 'error');
        return;
    }

    let config;
    try {
        config = JSON.parse(configRaw);
    } catch (err) {
        // Try loose format (key: "val")
        try {
            const sanitized = configRaw
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ')
                .replace(/'/g, '"');
            config = JSON.parse(sanitized);
        } catch (e) {
            showToast('Invalid Firebase configuration format. Please provide valid JSON.', 'error');
            return;
        }
    }

    showToast('Connecting to Firebase Cloud...', 'info');
    const success = await window.cloudSync.init(config, storeId, true);

    if (success) {
        showToast('🎉 Connected! Real-time multi-device sync is now ACTIVE.', 'success');
        closeModal('syncModal');
        updateSyncPageUI();
        refreshCurrentPage();
    } else {
        showToast('Failed to connect to Firebase. Please check your credentials.', 'error');
    }
}

function handleDisconnectCloudSync() {
    showConfirm('Disconnect from Cloud Sync? Your local data will remain safe on this device.', () => {
        if (window.cloudSync) {
            window.cloudSync.disconnect();
        }
        updateSyncPageUI();
        refreshCurrentPage();
    });
}

async function handleForceUpload() {
    if (!window.cloudSync || !window.cloudSync.isConnected) {
        showToast('Please connect to Cloud Sync first!', 'warning');
        return;
    }
    showToast('Uploading this device data to cloud...', 'info');
    await window.cloudSync.uploadAll();
}

async function handleForceDownload() {
    if (!window.cloudSync || !window.cloudSync.isConnected) {
        showToast('Please connect to Cloud Sync first!', 'warning');
        return;
    }
    showConfirm('Download and replace data from cloud with the latest cloud copy?', async () => {
        showToast('Downloading cloud data...', 'info');
        await window.cloudSync.downloadAll();
    });
}

// ---- Offline JSON Backup & Restore ----

function exportDataJSON() {
    const backup = {
        app: 'CholiRentalManager',
        exportedAt: new Date().toISOString(),
        cholis: DB.get('cholis'),
        customers: DB.get('customers'),
        bookings: DB.get('bookings'),
        counters: {
            cholis_counter: localStorage.getItem('cholis_counter') || '0',
            customers_counter: localStorage.getItem('customers_counter') || '0',
            bookings_counter: localStorage.getItem('bookings_counter') || '0',
        }
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    const dateStr = todayStr();
    dlAnchorElem.setAttribute('download', `choli_rental_backup_${dateStr}.json`);
    dlAnchorElem.click();
    showToast('Backup file downloaded! 📥 Keep it safe or send to your other device.', 'success');
}

function importDataJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.cholis && !data.customers && !data.bookings) {
                showToast('Invalid backup file format.', 'error');
                return;
            }

            showConfirm(`Restore backup? This contains ${data.cholis ? data.cholis.length : 0} cholis, ${data.customers ? data.customers.length : 0} customers, and ${data.bookings ? data.bookings.length : 0} bookings.`, () => {
                if (data.cholis) DB.set('cholis', data.cholis);
                if (data.customers) DB.set('customers', data.customers);
                if (data.bookings) DB.set('bookings', data.bookings);

                if (data.counters) {
                    if (data.counters.cholis_counter) localStorage.setItem('cholis_counter', data.counters.cholis_counter);
                    if (data.counters.customers_counter) localStorage.setItem('customers_counter', data.counters.customers_counter);
                    if (data.counters.bookings_counter) localStorage.setItem('bookings_counter', data.counters.bookings_counter);
                }

                showToast('✅ Data successfully imported and restored!', 'success');
                refreshCurrentPage();
                closeModal('syncModal');
            });
        } catch (err) {
            console.error('Error importing JSON:', err);
            showToast('Failed to parse backup file.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function updateSyncPageUI() {
    const savedConfig = localStorage.getItem('_firebaseConfig');
    const savedStoreId = localStorage.getItem('_storeId');
    const isConnected = window.cloudSync && window.cloudSync.isConnected;

    const storeIdInput = document.getElementById('syncStoreId');
    const configInput = document.getElementById('syncFirebaseConfig');
    const storeIdModalInput = document.getElementById('syncStoreIdModal');
    const configModalInput = document.getElementById('syncFirebaseConfigModal');

    const connectBtn = document.getElementById('syncConnectBtn');
    const disconnectBtn = document.getElementById('syncDisconnectBtn');
    const activeStoreBadge = document.getElementById('activeStoreBadge');
    const syncActionsBox = document.getElementById('syncActionsBox');

    if (storeIdInput && savedStoreId) storeIdInput.value = savedStoreId;
    if (configInput && savedConfig) configInput.value = savedConfig;
    if (storeIdModalInput && savedStoreId) storeIdModalInput.value = savedStoreId;
    if (configModalInput && savedConfig) configModalInput.value = savedConfig;

    if (activeStoreBadge) {
        if (isConnected) {
            activeStoreBadge.innerHTML = `<span class="status-badge status-completed"><i class="fas fa-check-circle"></i> Connected to Store: <strong>${savedStoreId}</strong></span>`;
        } else {
            activeStoreBadge.innerHTML = `<span class="status-badge status-cancelled"><i class="fas fa-info-circle"></i> Offline (Local Browser Storage Only)</span>`;
        }
    }

    if (connectBtn) connectBtn.style.display = isConnected ? 'none' : 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = isConnected ? 'inline-flex' : 'none';
    if (syncActionsBox) syncActionsBox.style.display = isConnected ? 'block' : 'none';
    if (window.cloudSync) window.cloudSync._updateSyncUI(isConnected ? 'connected' : 'disconnected');
}

// ==================== INIT ====================

function init() {
    // Set today's date in topbar
    document.getElementById('todayDate').textContent = formatDate(todayStr());

    // Set default dates for availability check
    const availDateInput = document.getElementById('availEventDate');
    if (availDateInput) availDateInput.value = todayStr();

    // Seed demo data on first run
    seedDemoData();

    // Ensure images exist for all demo/existing cholis
    ensureCholiImages();

    // Try auto-reconnect to Firebase Cloud Sync
    initCloudSyncFromStorage();

    // Render dashboard
    refreshDashboard();
}

// Reset modal titles when opening add modals
document.getElementById('addCholiModal').addEventListener('click', function(e) {
    if (e.target === this) {
        document.getElementById('choliModalTitle').textContent = 'Add New Choli';
        document.getElementById('choliEditId').value = '';
        document.getElementById('choliForm').reset();
    }
});

document.getElementById('addCustomerModal').addEventListener('click', function(e) {
    if (e.target === this) {
        document.getElementById('customerModalTitle').textContent = 'Add New Customer';
        document.getElementById('custEditId').value = '';
        document.getElementById('customerForm').reset();
    }
});

// Keyboard shortcut: Escape to close modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// Start the app
init();
