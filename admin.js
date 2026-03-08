/* ============================================
   Carmen Burruel Salón ✨ — Admin Logic
   Firebase Firestore for persistence
   ============================================ */

const firebaseConfig = {
    apiKey: "AIzaSyA83jSnPAzv0WfSzJ3yE49lwfX3U7QpCys",
    authDomain: "yepzhi-calendar.firebaseapp.com",
    projectId: "yepzhi-calendar",
    storageBucket: "yepzhi-calendar.firebasestorage.app",
    messagingSenderId: "316912093335",
    appId: "1:316912093335:web:b4f24c6e857c6bad7101d2"
};

let db;

let SERVICES = [];
const DEFAULT_SERVICES = [
    { name: 'Uñas Acrílicas', duration: 90, emoji: '💅', price: '$400 – $700 MXN' },
    { name: 'Pedicure', duration: 90, emoji: '🦶', price: '$500 MXN' },
    { name: 'Corte de Cabello (Mujer)', duration: 60, emoji: '✂️', price: '$250 – $500 MXN' },
    { name: 'Tintes', duration: 120, emoji: '🎨', price: 'Desde $600 MXN' },
    { name: 'Efectos de Color', duration: 300, emoji: '🌈', price: 'Desde $1,800 MXN' },
    { name: 'Peinados', duration: 60, emoji: '💇‍♀️', price: 'Desde $400 MXN' },
    { name: 'Maquillaje', duration: 90, emoji: '💄', price: 'Desde $900 MXN' }
];

const DEFAULT_HOURS = {
    1: { open: '16:00', close: '21:00' },
    2: { open: '16:00', close: '21:00' },
    3: { open: '16:00', close: '21:00' },
    4: { open: '16:00', close: '21:00' },
    5: { open: '16:00', close: '21:00' },
    6: { open: '09:00', close: '21:00' },
    0: null
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Default admin password hash (SHA-256 of "salon2026")
const DEFAULT_PASSWORD_HASH = '7b5978b5b219b5a5e3d4b2c1a0f8e3d2c1b0a9f8e7d6c5b4a3928170605040302';

// ── State ──
let blockedDays = {};
let customHours = {};
let appointments = [];
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let currentFilter = 'upcoming';
let selectedDayStr = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    bindLoginEvents();
});

function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
}

// ── Simple password hashing ──
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Login ──
function bindLoginEvents() {
    document.getElementById('btnLogin').addEventListener('click', attemptLogin);
    document.getElementById('adminPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
}

async function attemptLogin() {
    const password = document.getElementById('adminPassword').value;
    if (!password) return;

    const hash = await hashPassword(password);

    // Check password from Firestore
    const doc = await db.collection('salon_settings').doc('admin').get();
    let storedHash;

    if (doc.exists && doc.data().passwordHash) {
        storedHash = doc.data().passwordHash;
    } else {
        // First time — set default password "salon2026"
        const defaultHash = await hashPassword('1234');
        await db.collection('salon_settings').doc('admin').set({
            passwordHash: defaultHash
        }, { merge: true });
        storedHash = defaultHash;
        document.getElementById('loginHint').textContent = 'Primera vez: usa "1234" como contraseña';
    }

    if (hash === storedHash) {
        showAdminPanel();
    } else {
        const errorEl = document.getElementById('loginError');
        errorEl.style.display = 'block';
        errorEl.style.animation = 'none';
        // Force reflow
        errorEl.offsetHeight;
        errorEl.style.animation = 'shake 0.4s ease';
    }
}

function showAdminPanel() {
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    startDataListeners();
    bindAdminEvents();
    renderServicesTable();
}

// ── Real-time Data ──
function startDataListeners() {
    // Settings (blocked days + custom hours)
    db.collection('salon_settings').doc('availability').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            blockedDays = data.blockedDays || {};
            customHours = data.customHours || {};
        }
        renderAdminCalendar();
    });

    // Appointments
    db.collection('salon_appointments').onSnapshot(snapshot => {
        appointments = [];
        snapshot.forEach(doc => {
            appointments.push({ id: doc.id, ...doc.data() });
        });
        renderAppointments();
        renderAdminCalendar();
    });

    // Services
    db.collection('salon_settings').doc('services').onSnapshot(doc => {
        if (doc.exists && doc.data().list) {
            SERVICES = doc.data().list;
        } else {
            SERVICES = [...DEFAULT_SERVICES];
        }
        renderServicesTable();
    });
}

// ── Admin Events ──
function bindAdminEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel${capitalize(tab)}`).classList.add('active');
        });
    });

    // Calendar nav
    document.getElementById('adminPrevMonth').addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderAdminCalendar();
    });
    document.getElementById('adminNextMonth').addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderAdminCalendar();
    });

    // Close day detail
    document.getElementById('closeDayDetail').addEventListener('click', () => {
        document.getElementById('dayDetail').style.display = 'none';
        selectedDayStr = null;
    });

    // Appointment filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAppointments();
        });
    });

    // Change password
    document.getElementById('btnChangePassword').addEventListener('click', changePassword);

    // Services
    document.getElementById('btnSaveServices').addEventListener('click', saveServices);
    document.getElementById('btnAddService').addEventListener('click', () => {
        SERVICES.push({ name: '', duration: 60, emoji: '✨', price: '' });
        renderServicesTable();
    });
}

// ── Admin Calendar ──
function renderAdminCalendar() {
    const grid = document.getElementById('adminCalGrid');
    const label = document.getElementById('adminCalLabel');

    label.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;

    // Remove old day cells (keep headers)
    grid.querySelectorAll('.cal-day').forEach(el => el.remove());

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    let startCol = firstDay.getDay() - 1;
    if (startCol < 0) startCol = 6;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < startCol; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(calendarYear, calendarMonth, d);
        const dateStr = formatDateStr(date);
        const dayOfWeek = date.getDay();

        const cell = document.createElement('div');
        cell.className = 'cal-day';
        cell.textContent = d;

        const isSunday = dayOfWeek === 0;
        const isBlocked = blockedDays[dateStr] === true;

        if (isSunday) {
            cell.classList.add('disabled');
        } else if (isBlocked) {
            cell.classList.add('blocked');
        }

        if (date.getTime() === today.getTime()) {
            cell.classList.add('today');
        }

        // Count appointments for this day
        const dayAppts = appointments.filter(a => a.date === dateStr);
        if (dayAppts.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'appt-count';
            badge.textContent = dayAppts.length;
            cell.appendChild(badge);
        }

        if (!isSunday) {
            cell.addEventListener('click', () => showDayDetail(date, dateStr));
        }

        grid.appendChild(cell);
    }
}

// ── Day Detail ──
function showDayDetail(date, dateStr) {
    selectedDayStr = dateStr;
    const panel = document.getElementById('dayDetail');
    const title = document.getElementById('dayDetailTitle');
    const body = document.getElementById('dayDetailBody');

    title.textContent = `${DAY_NAMES[date.getDay()]} ${date.getDate()} de ${MONTH_NAMES[date.getMonth()]}`;

    const isBlocked = blockedDays[dateStr] === true;
    const hours = getHoursForDate(date);
    const dayAppts = appointments.filter(a => a.date === dateStr);

    let html = '';

    // Status
    html += `
        <div class="detail-row">
            <span class="detail-label">Estado</span>
            <span class="detail-value" style="color: ${isBlocked ? '#f87171' : '#4ade80'}">${isBlocked ? '🚫 Bloqueado' : '✅ Disponible'}</span>
        </div>
    `;

    // Hours
    if (hours) {
        html += `
            <div class="detail-row">
                <span class="detail-label">Horario</span>
                <span class="detail-value">${formatTime12(hours.open)} — ${formatTime12(hours.close)}</span>
            </div>
        `;
    }

    // Custom hours input
    const currentCustom = customHours[dateStr];
    const defaultH = DEFAULT_HOURS[date.getDay()];
    const openVal = currentCustom ? currentCustom.open : (defaultH ? defaultH.open : '16:00');
    const closeVal = currentCustom ? currentCustom.close : (defaultH ? defaultH.close : '21:00');

    html += `
        <div class="detail-row" style="flex-direction: column; gap:10px; align-items: stretch;">
            <span class="detail-label">Horario personalizado para este día</span>
            <div class="custom-hours-row">
                <input type="time" id="customOpen" value="${openVal}">
                <span style="color:rgba(255,255,255,0.3)">—</span>
                <input type="time" id="customClose" value="${closeVal}">
                <button class="btn-save-hours" onclick="saveCustomHours('${dateStr}')">Guardar</button>
                ${currentCustom ? `<button class="btn-reset-hours" onclick="resetCustomHours('${dateStr}')">Reset</button>` : ''}
            </div>
        </div>
    `;

    // Appointments for this day
    if (dayAppts.length > 0) {
        html += `<div class="detail-row" style="flex-direction: column; gap:10px; align-items: stretch;">
            <span class="detail-label">Citas (${dayAppts.length})</span>`;
        dayAppts.sort((a, b) => a.time.localeCompare(b.time)).forEach(a => {
            html += `
                <div class="appt-card" style="margin:0;">
                    <span class="appt-emoji">${a.serviceEmoji || '📋'}</span>
                    <div class="appt-info">
                        <span class="appt-service">${a.service}</span>
                        <span class="appt-datetime">${a.time} · ${formatDuration(a.duration)}</span>
                        <span class="appt-client">${a.clientName} · ${a.clientPhone}</span>
                    </div>
                    <button class="btn-cancel-appt" onclick="cancelAppointment('${a.id}')">Cancelar</button>
                </div>
            `;
        });
        html += `</div>`;
    }

    // Block/unblock button
    html += `
        <button class="btn-block ${isBlocked ? 'unblock' : 'block'}" onclick="toggleBlockDay('${dateStr}', ${isBlocked})">
            ${isBlocked ? '✅ Desbloquear este día' : '🚫 Bloquear este día'}
        </button>
    `;

    body.innerHTML = html;
    panel.style.display = 'block';
}

// ── Block/Unblock Day ──
async function toggleBlockDay(dateStr, currentlyBlocked) {
    try {
        const newBlocked = { ...blockedDays };
        if (currentlyBlocked) {
            delete newBlocked[dateStr];
        } else {
            newBlocked[dateStr] = true;
        }

        await db.collection('salon_settings').doc('availability').set({
            blockedDays: newBlocked,
            customHours: customHours
        }, { merge: true });

        showToast(currentlyBlocked ? '✅ Día desbloqueado' : '🚫 Día bloqueado', 'success');
    } catch (error) {
        console.error('Error updating blocked days:', error);
        showToast('Error al actualizar. Intenta de nuevo.', 'error');
    }
}

// ── Custom Hours ──
async function saveCustomHours(dateStr) {
    const open = document.getElementById('customOpen').value;
    const close = document.getElementById('customClose').value;

    if (!open || !close) return;

    try {
        const newCustom = { ...customHours };
        newCustom[dateStr] = { open, close };

        await db.collection('salon_settings').doc('availability').set({
            blockedDays: blockedDays,
            customHours: newCustom
        }, { merge: true });

        showToast('⏰ Horario personalizado guardado', 'success');
    } catch (error) {
        console.error('Error saving custom hours:', error);
        showToast('Error al guardar horario personalizado.', 'error');
    }
}

async function resetCustomHours(dateStr) {
    try {
        const newCustom = { ...customHours };
        delete newCustom[dateStr];

        await db.collection('salon_settings').doc('availability').set({
            blockedDays: blockedDays,
            customHours: newCustom
        }, { merge: true });

        showToast('🔄 Horario restablecido', 'info');
    } catch (error) {
        console.error('Error resetting custom hours:', error);
        showToast('Error al restablecer horario.', 'error');
    }
}

// ── Appointments List ──
function renderAppointments() {
    const list = document.getElementById('appointmentsList');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = [...appointments];

    if (currentFilter === 'upcoming') {
        filtered = filtered.filter(a => new Date(a.date + 'T23:59:59') >= today);
    } else if (currentFilter === 'past') {
        filtered = filtered.filter(a => new Date(a.date + 'T23:59:59') < today);
    }

    // Sort by date then time
    filtered.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '').localeCompare(b.time || '');
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="no-appts">No hay citas ${currentFilter === 'upcoming' ? 'próximas' : currentFilter === 'past' ? 'pasadas' : ''}</div>`;
        return;
    }

    list.innerHTML = filtered.map(a => {
        const d = new Date(a.date + 'T00:00:00');
        return `
            <div class="appt-card">
                <span class="appt-emoji">${a.serviceEmoji || '📋'}</span>
                <div class="appt-info">
                    <span class="appt-service">${a.service}</span>
                    <span class="appt-datetime">${DAY_NAMES[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} · ${a.time}</span>
                    <span class="appt-client">👤 ${a.clientName}</span>
                    <span class="appt-phone">📱 ${a.clientPhone}</span>
                </div>
                <button class="btn-cancel-appt" onclick="cancelAppointment('${a.id}')">Cancelar</button>
            </div>
        `;
    }).join('');
}

// ── Cancel Appointment ──
async function cancelAppointment(id) {
    if (!confirm('¿Estás segura de que quieres cancelar esta cita?')) return;

    try {
        await db.collection('salon_appointments').doc(id).delete();
        showToast('🗑️ Cita cancelada', 'success');
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        showToast('Error al cancelar la cita.', 'error');
    }
}

// ── Change Password ──
async function changePassword() {
    const newPass = document.getElementById('newPassword').value;
    const confirmPass = document.getElementById('confirmPassword').value;
    const msg = document.getElementById('passwordMsg');

    if (!newPass || newPass.length < 4) {
        msg.textContent = 'La contraseña debe tener al menos 4 caracteres';
        msg.className = 'settings-note error';
        return;
    }

    if (newPass !== confirmPass) {
        msg.textContent = 'Las contraseñas no coinciden';
        msg.className = 'settings-note error';
        return;
    }

    try {
        const hash = await hashPassword(newPass);
        await db.collection('salon_settings').doc('admin').set({
            passwordHash: hash
        }, { merge: true });

        msg.textContent = '✅ Contraseña actualizada con éxito';
        msg.className = 'settings-note success';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    } catch (error) {
        msg.textContent = 'Error al cambiar la contraseña';
        msg.className = 'settings-note error';
    }
}

// ── Services Table ──
function renderServicesTable() {
    const table = document.getElementById('servicesTable');
    if (!SERVICES) return;

    table.innerHTML = SERVICES.map((s, idx) => `
        <div class="service-row" style="display:flex; gap:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px; align-items:center;">
            <input type="text" class="input-text service-emoji" value="${s.emoji}" data-idx="${idx}" placeholder="Emoji" style="width:50px; text-align:center;">
            <input type="text" class="input-text service-name" value="${s.name}" data-idx="${idx}" placeholder="Nombre del servicio" style="flex:2;">
            <input type="number" class="input-text service-duration" value="${s.duration}" data-idx="${idx}" placeholder="Minutos" style="width:80px;">
            <input type="text" class="input-text service-price" value="${s.price}" data-idx="${idx}" placeholder="Precio (ej. $500)" style="flex:1;">
            <button class="btn-cancel-appt btn-delete-service" onclick="deleteService(${idx})" style="margin:0; width:40px; height:40px; font-size:16px;" title="Eliminar servicio">🗑️</button>
        </div>
    `).join('');
}

function deleteService(idx) {
    if (confirm('¿Eliminar este servicio? (Debes hacer clic en Guardar Cambios para que sea definitivo)')) {
        SERVICES.splice(idx, 1);
        renderServicesTable();
    }
}

async function saveServices() {
    const btn = document.getElementById('btnSaveServices');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const emojis = document.querySelectorAll('.service-emoji');
        const names = document.querySelectorAll('.service-name');
        const durations = document.querySelectorAll('.service-duration');
        const prices = document.querySelectorAll('.service-price');

        const newList = [];
        for (let i = 0; i < emojis.length; i++) {
            if (names[i].value.trim()) {
                newList.push({
                    emoji: emojis[i].value.trim() || '✨',
                    name: names[i].value.trim(),
                    duration: parseInt(durations[i].value) || 60,
                    price: prices[i].value.trim()
                });
            }
        }

        await db.collection('salon_settings').doc('services').set({
            list: newList
        }, { merge: true });

        showToast('✅ Servicios guardados con éxito', 'success');
    } catch (error) {
        console.error('Error saving services:', error);
        showToast('Error al guardar servicios', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Cambios';
    }
}

// ── Helpers ──
function getHoursForDate(date) {
    const dateStr = formatDateStr(date);
    if (customHours[dateStr]) return customHours[dateStr];
    const dow = date.getDay();
    return DEFAULT_HOURS[dow] || null;
}

function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
}

function formatTime12(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Toast Notification ──
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', info: '💡' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '💡'}</span>${message}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
