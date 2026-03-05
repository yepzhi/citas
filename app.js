/* ============================================
   Carmen Burruel Salón ✨ — Booking Logic
   Firebase Firestore for persistence
   ============================================ */

// ── Firebase Config (same project as yepzhi-calendar) ──
const firebaseConfig = {
    apiKey: "AIzaSyA83jSnPAzv0WfSzJ3yE49lwfX3U7QpCys",
    authDomain: "yepzhi-calendar.firebaseapp.com",
    projectId: "yepzhi-calendar",
    storageBucket: "yepzhi-calendar.firebasestorage.app",
    messagingSenderId: "316912093335",
    appId: "1:316912093335:web:b4f24c6e857c6bad7101d2"
};

let db;

// ── EmailJS Config ──
const EMAILJS_PUBLIC_KEY = 'Mb-9-l6z89ByJ6B7-';
const EMAILJS_SERVICE_ID = 'service_lh2vamp';
const EMAILJS_TEMPLATE_ID = 'template_jin29zl';

// ── Services ──
const SERVICES = [
    { name: 'Uñas Acrílicas', duration: 90, emoji: '💅', price: '$400 – $700 MXN' },
    { name: 'Pedicure', duration: 90, emoji: '🦶', price: '$500 MXN' },
    { name: 'Corte de Cabello (Mujer)', duration: 60, emoji: '✂️', price: '$250 – $500 MXN' },
    { name: 'Tintes', duration: 120, emoji: '🎨', price: 'Desde $600 MXN' },
    { name: 'Efectos de Color', duration: 300, emoji: '🌈', price: 'Desde $1,800 MXN' },
    { name: 'Peinados', duration: 60, emoji: '💇‍♀️', price: 'Desde $400 MXN' },
    { name: 'Maquillaje', duration: 90, emoji: '💄', price: 'Desde $900 MXN' }
];

// ── Default Business Hours ──
// 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
const DEFAULT_HOURS = {
    1: { open: '16:00', close: '21:00' }, // Lunes
    2: { open: '16:00', close: '21:00' }, // Martes
    3: { open: '16:00', close: '21:00' }, // Miércoles
    4: { open: '16:00', close: '21:00' }, // Jueves
    5: { open: '16:00', close: '21:00' }, // Viernes
    6: { open: '09:00', close: '21:00' }, // Sábado
    0: null                                // Domingo - cerrado
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ── State ──
let currentStep = 1;
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let blockedDays = {};       // { "2026-03-10": true }
let customHours = {};       // { "2026-03-15": { open: "10:00", close: "18:00" } }
let appointments = [];      // from Firestore

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    bindEvents();
    renderCalendar();
});

function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();

    // Listen to settings (blocked days + custom hours) in real-time
    db.collection('salon_settings').doc('availability').onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            blockedDays = data.blockedDays || {};
            customHours = data.customHours || {};
            renderCalendar();
        }
    });

    // Listen to appointments in real-time
    db.collection('salon_appointments').onSnapshot(snapshot => {
        appointments = [];
        snapshot.forEach(doc => {
            appointments.push({ id: doc.id, ...doc.data() });
        });
        // Re-render time slots if on step 3
        if (currentStep === 3 && selectedDate) {
            renderTimeSlots();
        }
    });
}

function bindEvents() {
    // Service select
    document.getElementById('serviceSelect').addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        if (!isNaN(idx)) {
            selectedService = SERVICES[idx];
            showServiceInfo(selectedService);
            document.getElementById('btnNext1').disabled = false;
        }
    });

    // Step navigation
    document.getElementById('btnNext1').addEventListener('click', () => goToStep(2));
    document.getElementById('btnBack2').addEventListener('click', () => goToStep(1));
    document.getElementById('btnNext2').addEventListener('click', () => goToStep(3));
    document.getElementById('btnBack3').addEventListener('click', () => goToStep(2));
    document.getElementById('btnNext3').addEventListener('click', () => goToStep(4));
    document.getElementById('btnBack4').addEventListener('click', () => goToStep(3));
    document.getElementById('btnNext4').addEventListener('click', () => goToStep(5));
    document.getElementById('btnBack5').addEventListener('click', () => goToStep(4));

    // Calendar nav
    document.getElementById('prevMonth').addEventListener('click', () => {
        calendarMonth--;
        if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
        renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        calendarMonth++;
        if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
        renderCalendar();
    });

    // Client info validation
    document.getElementById('clientName').addEventListener('input', validateClientInfo);
    document.getElementById('clientPhone').addEventListener('input', validateClientInfo);
    document.getElementById('clientEmail').addEventListener('input', validateClientInfo);

    // Confirm booking
    document.getElementById('btnConfirm').addEventListener('click', confirmBooking);

    // New booking
    document.getElementById('btnNewBooking').addEventListener('click', resetBooking);
}

// ── Service Info Display ──
function showServiceInfo(service) {
    const card = document.getElementById('serviceInfo');
    document.getElementById('serviceEmoji').textContent = service.emoji;
    document.getElementById('serviceName').textContent = service.name;
    document.getElementById('serviceDuration').textContent = `Duración: ${formatDuration(service.duration)} · ${service.price}`;
    card.style.display = 'block';
}

function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
}

// ── Step Navigation ──
function goToStep(step) {
    // Hide all panels
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('stepSuccess').style.display = 'none';

    // Show target panel
    const panel = document.getElementById(`step${step}`);
    if (panel) panel.classList.add('active');

    // Update progress bar
    document.querySelectorAll('.progress-step').forEach(ps => {
        const s = parseInt(ps.dataset.step);
        ps.classList.remove('active', 'completed');
        if (s === step) ps.classList.add('active');
        else if (s < step) ps.classList.add('completed');
    });

    // Update progress lines
    const lines = document.querySelectorAll('.progress-line');
    lines.forEach((line, i) => {
        if (i < step - 1) line.classList.add('filled');
        else line.classList.remove('filled');
    });

    currentStep = step;

    // Step-specific actions
    if (step === 2) renderCalendar();
    if (step === 3) renderTimeSlots();
    if (step === 5) renderConfirmation();
}

// ── Calendar ──
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calMonthLabel');

    label.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;

    // Remove old day cells (keep headers)
    grid.querySelectorAll('.cal-day').forEach(el => el.remove());

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    // JS getDay: 0=Sun. We need Mon=0 for grid
    let startCol = firstDay.getDay() - 1;
    if (startCol < 0) startCol = 6; // Sunday wraps

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Empty cells before first day
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

        const isPast = date < today;
        const isSunday = dayOfWeek === 0;
        const isBlocked = blockedDays[dateStr] === true;
        const hasHours = getHoursForDate(date) !== null;
        const isFull = hasHours && !isPast && !isSunday && !isBlocked && isDayFull(date);

        if (isPast || isSunday || isBlocked || !hasHours || isFull) {
            cell.classList.add('disabled');
            if (isFull) {
                cell.classList.add('full');
                cell.title = 'Día completo';
            }
        } else {
            cell.addEventListener('click', () => selectDate(date, cell));
        }

        // Highlight today
        if (date.getTime() === today.getTime()) {
            cell.classList.add('today');
        }

        // Selected state
        if (selectedDate && dateStr === formatDateStr(selectedDate)) {
            cell.classList.add('selected');
        }

        grid.appendChild(cell);
    }
}

// Check if a day has no available slots for the shortest service (60min)
function isDayFull(date) {
    const hours = getHoursForDate(date);
    if (!hours) return true;

    const openMin = timeToMinutes(hours.open);
    const closeMin = timeToMinutes(hours.close);
    const minDuration = 60; // Shortest service is 1 hour
    const dateStr = formatDateStr(date);
    const dateAppts = appointments.filter(a => a.date === dateStr);

    for (let t = openMin; t + minDuration <= closeMin; t += 30) {
        const slotStart = t;
        const slotEnd = t + minDuration;
        const conflict = dateAppts.some(a => {
            const aStart = timeToMinutes(a.time);
            const aEnd = aStart + (a.duration || 60);
            return slotStart < aEnd && slotEnd > aStart;
        });
        if (!conflict) return false; // Found at least one free slot
    }
    return true; // No free slots
}

function selectDate(date, cell) {
    selectedDate = date;
    selectedTime = null;
    document.getElementById('btnNext2').disabled = false;

    // Update visual selection
    document.querySelectorAll('.cal-day.selected').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
}

// ── Time Slots ──
function renderTimeSlots() {
    const grid = document.getElementById('timeSlotsGrid');
    const label = document.getElementById('selectedDateLabel');
    grid.innerHTML = '';

    if (!selectedDate || !selectedService) return;

    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][selectedDate.getDay()];
    label.textContent = `${dayName} ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]}`;

    const hours = getHoursForDate(selectedDate);
    if (!hours) {
        grid.innerHTML = '<div class="no-slots-message">No hay horarios disponibles para este día</div>';
        return;
    }

    const openMin = timeToMinutes(hours.open);
    const closeMin = timeToMinutes(hours.close);
    const duration = selectedService.duration;
    const dateStr = formatDateStr(selectedDate);

    // Get existing appointments for this date
    const dateAppts = appointments.filter(a => a.date === dateStr);

    let slotCount = 0;

    for (let t = openMin; t + duration <= closeMin; t += 30) {
        const slotStart = t;
        const slotEnd = t + duration;

        // Check for conflicts with existing appointments
        const conflict = dateAppts.some(a => {
            const aStart = timeToMinutes(a.time);
            const aEnd = aStart + a.duration;
            return slotStart < aEnd && slotEnd > aStart;
        });

        const btn = document.createElement('div');
        btn.className = 'time-slot';
        btn.textContent = minutesToTime(t);

        if (conflict) {
            btn.classList.add('disabled');
            btn.title = 'Horario ocupado';
        } else {
            btn.addEventListener('click', () => selectTime(t, btn));
        }

        if (selectedTime === t) {
            btn.classList.add('selected');
        }

        grid.appendChild(btn);
        slotCount++;
    }

    if (slotCount === 0) {
        grid.innerHTML = '<div class="no-slots-message">No hay horarios disponibles para este servicio en este día</div>';
    }

    document.getElementById('btnNext3').disabled = selectedTime === null;
}

function selectTime(minutes, btn) {
    selectedTime = minutes;
    document.getElementById('btnNext3').disabled = false;

    document.querySelectorAll('.time-slot.selected').forEach(s => s.classList.remove('selected'));
    btn.classList.add('selected');
}

// ── Client Info Validation ──
function validateClientInfo() {
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    const email = document.getElementById('clientEmail').value.trim();
    const emailOk = email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    document.getElementById('btnNext4').disabled = !(name.length >= 2 && phone.length >= 7 && emailOk);
}

// ── Confirmation ──
function renderConfirmation() {
    const card = document.getElementById('confirmationCard');
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][selectedDate.getDay()];

    card.innerHTML = `
        <div class="confirm-row">
            <span class="confirm-label">Servicio</span>
            <span class="confirm-value">${selectedService.emoji} ${selectedService.name}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Duración</span>
            <span class="confirm-value">${formatDuration(selectedService.duration)}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Precio</span>
            <span class="confirm-value">${selectedService.price}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Fecha</span>
            <span class="confirm-value">${dayName} ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]}, ${selectedDate.getFullYear()}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Hora</span>
            <span class="confirm-value">${minutesToTime(selectedTime)} — ${minutesToTime(selectedTime + selectedService.duration)}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Cliente</span>
            <span class="confirm-value">${document.getElementById('clientName').value.trim()}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Teléfono</span>
            <span class="confirm-value">${document.getElementById('clientPhone').value.trim()}</span>
        </div>
        ${document.getElementById('clientEmail').value.trim() ? `
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Email</span>
            <span class="confirm-value">${document.getElementById('clientEmail').value.trim()}</span>
        </div>` : ''}
    `;
}

// ── Book Appointment ──
async function confirmBooking() {
    const btn = document.getElementById('btnConfirm');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const appointment = {
            service: selectedService.name,
            serviceEmoji: selectedService.emoji,
            duration: selectedService.duration,
            price: selectedService.price,
            date: formatDateStr(selectedDate),
            time: minutesToTime(selectedTime),
            clientName: document.getElementById('clientName').value.trim(),
            clientPhone: document.getElementById('clientPhone').value.trim(),
            clientEmail: document.getElementById('clientEmail').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('salon_appointments').add(appointment);

        // Send email notification
        sendEmailNotification(appointment);

        // Show success screen
        showSuccess(appointment);
    } catch (error) {
        console.error('Error al guardar cita:', error);
        alert('Error al guardar la cita. Por favor intenta de nuevo.');
        btn.disabled = false;
        btn.textContent = 'Confirmar Cita ✨';
    }
}

function showSuccess(appt) {
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('stepSuccess').style.display = 'flex';

    // Fill success card
    const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const d = new Date(appt.date + 'T00:00:00');

    document.getElementById('successCard').innerHTML = `
        <div class="confirm-row">
            <span class="confirm-label">Servicio</span>
            <span class="confirm-value">${appt.serviceEmoji} ${appt.service}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Fecha</span>
            <span class="confirm-value">${dayName[d.getDay()]} ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Hora</span>
            <span class="confirm-value">${appt.time}</span>
        </div>
        <div class="confirm-divider"></div>
        <div class="confirm-row">
            <span class="confirm-label">Cliente</span>
            <span class="confirm-value">${appt.clientName}</span>
        </div>
    `;

    // Update progress bar to all completed
    document.querySelectorAll('.progress-step').forEach(ps => ps.classList.add('completed'));
    document.querySelectorAll('.progress-line').forEach(l => l.classList.add('filled'));
}

function resetBooking() {
    selectedService = null;
    selectedDate = null;
    selectedTime = null;

    document.getElementById('serviceSelect').value = '';
    document.getElementById('serviceInfo').style.display = 'none';
    document.getElementById('clientName').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientEmail').value = '';
    document.getElementById('btnNext1').disabled = true;
    document.getElementById('btnConfirm').disabled = false;
    document.getElementById('btnConfirm').textContent = 'Confirmar Cita ✨';

    calendarMonth = new Date().getMonth();
    calendarYear = new Date().getFullYear();

    goToStep(1);
}

// ── Helpers ──
function getHoursForDate(date) {
    const dateStr = formatDateStr(date);
    // Check custom hours first
    if (customHours[dateStr]) return customHours[dateStr];
    // Default hours
    const dow = date.getDay();
    return DEFAULT_HOURS[dow] || null;
}

function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function timeToMinutes(timeStr) {
    // Handle "4:30 PM" format
    const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
        let h = parseInt(ampmMatch[1]);
        const m = parseInt(ampmMatch[2]);
        const period = ampmMatch[3].toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + m;
    }
    // Handle "16:00" format
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ── Email Notification ──
function sendEmailNotification(appt) {
    try {
        const d = new Date(appt.date + 'T00:00:00');
        const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()];
        const monthName = MONTH_NAMES[d.getMonth()];

        const templateParams = {
            service: `${appt.serviceEmoji} ${appt.service}`,
            price: appt.price || 'N/A',
            date: `${dayName} ${d.getDate()} de ${monthName}, ${d.getFullYear()}`,
            time: appt.time,
            client_name: appt.clientName,
            client_phone: appt.clientPhone,
            duration: formatDuration(appt.duration),
            to_email: 'carjmen_69@hotmail.com'
        };

        // Send to salon owner
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, EMAILJS_PUBLIC_KEY).then(
            () => console.log('✅ Email sent to salon'),
            (err) => console.error('❌ Email error (salon):', err)
        );

        // Send copy to client if they provided email
        if (appt.clientEmail) {
            const clientParams = { ...templateParams, to_email: appt.clientEmail };
            emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, clientParams, EMAILJS_PUBLIC_KEY).then(
                () => console.log('✅ Email sent to client'),
                (err) => console.error('❌ Email error (client):', err)
            );
        }
    } catch (e) {
        console.error('Email notification error:', e);
    }
}
