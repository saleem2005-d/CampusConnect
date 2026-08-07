document.addEventListener('DOMContentLoaded', () => {
  let currentDate = new Date();
  let selectedDateKey = null;
  let attendanceData = {};
  let currentSubjectId = null;
  let currentUser = JSON.parse(localStorage.getItem('campusconnect_user')) || null;

  // DOM Elements
  const monthLabel = document.getElementById('current-month-label');
  const daysGrid = document.getElementById('calendar-days-grid');
  const selectedDateDisplay = document.getElementById('selected-date-display');
  const bunkCalcText = document.getElementById('bunk-calculator-text');
  const subjectDropdown = document.getElementById('subject-dropdown');
  const userGreeting = document.getElementById('user-greeting');

  // Modals
  const userModal = document.getElementById('user-modal');
  const userForm = document.getElementById('user-form');
  const inputUserName = document.getElementById('input-user-name');
  const inputUserEmail = document.getElementById('input-user-email');

  const subjectModal = document.getElementById('subject-modal');
  const subjectForm = document.getElementById('subject-form');
  const inputSubjectName = document.getElementById('input-subject-name');
  const openSubjectModalBtn = document.getElementById('open-subject-modal-btn');
  const closeSubjectModalBtn = document.getElementById('close-subject-modal-btn');

  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function initUserSession() {
    if (!currentUser) {
      userModal.classList.remove('hidden');
    } else {
      userGreeting.textContent = `Welcome, ${currentUser.name}`;
      loadSubjects();
    }
  }

  userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = inputUserName.value.trim();
    const email = inputUserEmail.value.trim();
    if (!name || !email) return;

    try {
      const res = await fetch('/api/user/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email })
      });
      if (res.ok) {
        currentUser = await res.json();
        localStorage.setItem('campusconnect_user', JSON.stringify(currentUser));
        userGreeting.textContent = `Welcome, ${currentUser.name}`;
        userModal.classList.add('hidden');
        loadSubjects();
      }
    } catch (err) {
      alert('Error saving profile.');
    }
  });

  async function loadSubjects() {
    if (!currentUser) return;
    try {
      const res = await fetch(`/api/subjects/${currentUser.id}`);
      const list = await res.json();
      subjectDropdown.innerHTML = '';
      
      list.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.id;
        opt.textContent = sub.name;
        subjectDropdown.appendChild(opt);
      });

      if (list.length > 0) {
        currentSubjectId = list[0].id;
        fetchAttendanceRecords();
      } else {
        subjectDropdown.innerHTML = '<option value="">No Subjects</option>';
        attendanceData = {};
        renderCalendar();
      }
    } catch (err) {
      console.error('Failed to load subjects:', err);
    }
  }

  async function fetchAttendanceRecords() {
    if (!currentSubjectId) return;
    try {
      const res = await fetch(`/api/attendance/${currentSubjectId}`);
      if (res.ok) attendanceData = await res.json();
    } catch (err) {
      console.error('Error fetching records:', err);
    }
    renderCalendar();
  }

  async function setDayStatus(status) {
    if (!selectedDateKey) return alert('Select a date on the calendar first.');
    if (!currentSubjectId) return alert('Create or select a subject first.');

    try {
      if (status === 'clear') {
        await fetch(`/api/attendance/${currentSubjectId}/${selectedDateKey}`, { method: 'DELETE' });
        delete attendanceData[selectedDateKey];
      } else {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId: currentSubjectId, dateKey: selectedDateKey, status })
        });
        attendanceData[selectedDateKey] = status;
      }
      renderCalendar();
    } catch (err) {
      alert('Failed to update attendance.');
    }
  }

  // Subject Modal Actions
  openSubjectModalBtn.addEventListener('click', () => {
    if (!currentUser) return alert('Please set up your profile first.');
    inputSubjectName.value = '';
    subjectModal.classList.remove('hidden');
  });

  closeSubjectModalBtn.addEventListener('click', () => {
    subjectModal.classList.add('hidden');
  });

  subjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = inputSubjectName.value.trim();
    if (!name || !currentUser) return;

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, name })
      });
      if (res.ok) {
        const newSubject = await res.json();
        await loadSubjects();
        subjectDropdown.value = newSubject.id;
        currentSubjectId = newSubject.id;
        fetchAttendanceRecords();
        subjectModal.classList.add('hidden');
      }
    } catch (err) {
      alert('Failed to create subject.');
    }
  });

  subjectDropdown.addEventListener('change', (e) => {
    currentSubjectId = e.target.value;
    fetchAttendanceRecords();
  });

  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    if (monthLabel) monthLabel.textContent = `${monthNames[month]} ${year}`;
    if (!daysGrid) return;

    daysGrid.innerHTML = '';
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      daysGrid.appendChild(empty);
    }

    const todayKey = formatDateKey(new Date());

    for (let day = 1; day <= totalDays; day++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      cell.textContent = day;

      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (dateKey === todayKey) cell.classList.add('today');
      if (attendanceData[dateKey]) cell.classList.add(attendanceData[dateKey]);
      if (selectedDateKey === dateKey) cell.classList.add('selected');

      cell.addEventListener('click', () => {
        selectedDateKey = dateKey;
        if (selectedDateDisplay) {
          const p = dateKey.split('-');
          selectedDateDisplay.textContent = `${p[2]}/${p[1]}/${p[0]}`;
        }
        renderCalendar();
      });

      daysGrid.appendChild(cell);
    }

    calculateMetrics();
  }

  function calculateMetrics() {
    let p = 0, a = 0, h = 0;
    Object.values(attendanceData).forEach(st => {
      if (st === 'present') p++;
      if (st === 'absent') a++;
      if (st === 'holiday') h++;
    });

    const total = p + a;
    const pct = total > 0 ? ((p / total) * 100).toFixed(1) : 0;

    const elPct = document.getElementById('stat-percentage');
    const elAtt = document.getElementById('stat-attended');
    const elAbs = document.getElementById('stat-absent');
    const elHol = document.getElementById('stat-holidays');
    const badge = document.getElementById('stat-status-badge');

    if (elPct) elPct.textContent = `${pct}%`;
    if (elAtt) elAtt.textContent = p;
    if (elAbs) elAbs.textContent = a;
    if (elHol) elHol.textContent = h;

    if (badge) {
      if (total === 0) { badge.textContent = 'No Records'; badge.className = 'stat-badge safe'; }
      else if (pct >= 75) { badge.textContent = 'Safe (≥75%)'; badge.className = 'stat-badge safe'; }
      else { badge.textContent = 'Critical (<75%)'; badge.className = 'stat-badge warning'; }
    }

    if (bunkCalcText) {
      if (total === 0) bunkCalcText.textContent = 'Select calendar dates to compute target thresholds.';
      else if (pct >= 75) {
        const bunks = Math.floor((p - 0.75 * total) / 0.75);
        bunkCalcText.textContent = bunks > 0 ? `Safe! You can miss the next ${bunks} class(es).` : `On the margin. Do not skip your next class!`;
      } else {
        const need = Math.ceil((0.75 * total - p) / 0.25);
        bunkCalcText.textContent = `Must attend the next ${need} consecutive class(es) to reach 75%.`;
      }
    }
  }

  // Event Listeners
  document.getElementById('btn-mark-present').addEventListener('click', () => setDayStatus('present'));
  document.getElementById('btn-mark-absent').addEventListener('click', () => setDayStatus('absent'));
  document.getElementById('btn-mark-holiday').addEventListener('click', () => setDayStatus('holiday'));
  document.getElementById('btn-mark-clear').addEventListener('click', () => setDayStatus('clear'));

  document.getElementById('prev-month-btn').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
  document.getElementById('next-month-btn').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  });

  document.getElementById('notify-btn').addEventListener('click', () => {
    if (!("Notification" in window)) return alert("Browser does not support notifications.");
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("CampusConnect Active", { body: "Daily attendance reminder activated!" });
      }
    });
  });

  document.getElementById('profile-btn').addEventListener('click', () => {
    if (currentUser) {
      inputUserName.value = currentUser.name;
      inputUserEmail.value = currentUser.email;
    }
    userModal.classList.remove('hidden');
  });

  selectedDateKey = formatDateKey(new Date());
  if (selectedDateDisplay) {
    const p = selectedDateKey.split('-');
    selectedDateDisplay.textContent = `${p[2]}/${p[1]}/${p[0]}`;
  }
  initUserSession();
});