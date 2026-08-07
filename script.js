document.addEventListener('DOMContentLoaded', () => {
  const API_URL = '/api/attendance';
  let currentDate = new Date();
  let selectedDateKey = null;
  let attendanceData = {};

  const monthLabel = document.getElementById('current-month-label');
  const daysGrid = document.getElementById('calendar-days-grid');
  const selectedDateDisplay = document.getElementById('selected-date-display');
  const bunkCalcText = document.getElementById('bunk-calculator-text');

  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function fetchAttendanceRecords() {
    try {
      const res = await fetch(API_URL);
      if (res.ok) attendanceData = await res.json();
    } catch (err) {
      console.error('Server connection error:', err);
    }
    renderCalendar();
  }

  async function setDayStatus(status) {
    if (!selectedDateKey) return alert('Please select a date on the calendar first.');
    try {
      if (status === 'clear') {
        await fetch(`${API_URL}/${selectedDateKey}`, { method: 'DELETE' });
        delete attendanceData[selectedDateKey];
      } else {
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateKey: selectedDateKey, status })
        });
        attendanceData[selectedDateKey] = status;
      }
      renderCalendar();
    } catch (err) {
      alert('Failed to save update.');
    }
  }

  function calculateStreak() {
    const sortedDates = Object.keys(attendanceData).sort().reverse();
    let streak = 0;
    for (let dateKey of sortedDates) {
      const status = attendanceData[dateKey];
      if (status === 'present') streak++;
      else if (status === 'absent') break;
    }
    return streak;
  }

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
    const streak = calculateStreak();

    const elPct = document.getElementById('stat-percentage');
    const elAtt = document.getElementById('stat-attended');
    const elAbs = document.getElementById('stat-absent');
    const elStreak = document.getElementById('stat-streak');
    const badge = document.getElementById('stat-status-badge');

    if (elPct) elPct.textContent = `${pct}%`;
    if (elAtt) elAtt.textContent = p;
    if (elAbs) elAbs.textContent = a;
    if (elStreak) elStreak.textContent = `${streak} ${streak === 1 ? 'Day' : 'Days'}`;

    if (badge) {
      if (total === 0) { badge.textContent = 'No Data'; badge.className = 'stat-badge safe'; }
      else if (pct >= 75) { badge.textContent = 'Safe (≥75%)'; badge.className = 'stat-badge safe'; }
      else { badge.textContent = 'Critical (<75%)'; badge.className = 'stat-badge warning'; }
    }

    if (bunkCalcText) {
      if (total === 0) bunkCalcText.textContent = 'Select dates on the calendar to analyze safety margins.';
      else if (pct >= 75) {
        const bunks = Math.floor((p - 0.75 * total) / 0.75);
        bunkCalcText.textContent = bunks > 0 ? `You can safely miss the next ${bunks} class(es) while staying above 75%.` : `You are exactly on the margin. Do not skip your next class!`;
      } else {
        const need = Math.ceil((0.75 * total - p) / 0.25);
        bunkCalcText.textContent = `You must attend the next ${need} consecutive class(es) to regain 75%.`;
      }
    }
  }

  document.getElementById('export-btn').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(attendanceData, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `CampusConnect_Backup_${formatDateKey(new Date())}.json`);
    dlAnchorElem.click();
  });

  const importFileInput = document.getElementById('import-file-input');
  document.getElementById('import-btn').addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', (e) => {
    const fileReader = new FileReader();
    fileReader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        for (const [dateKey, status] of Object.entries(importedData)) {
          await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dateKey, status })
          });
        }
        await fetchAttendanceRecords();
        alert('Attendance data imported successfully!');
      } catch (err) {
        alert('Invalid backup JSON file.');
      }
    };
    if (e.target.files[0]) fileReader.readAsText(e.target.files[0]);
  });

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

  selectedDateKey = formatDateKey(new Date());
  if (selectedDateDisplay) {
    const p = selectedDateKey.split('-');
    selectedDateDisplay.textContent = `${p[2]}/${p[1]}/${p[0]}`;
  }
  fetchAttendanceRecords();
});