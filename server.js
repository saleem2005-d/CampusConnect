const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/favicon.ico', (req, res) => res.status(204).end());

const dataFilePath = path.join(__dirname, 'database.json');

// Initialize local database file if it doesn't exist
function loadDatabase() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading DB, re-initializing:', err);
  }
  const defaultDB = { users: {}, attendance: {} };
  saveDatabase(defaultDB);
  return defaultDB;
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

let db = loadDatabase();

// 1. Save or Login User
app.post('/api/user/save', (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanRole = role ? role.trim() : 'Student';

    // Check if user exists by email
    let foundUserId = Object.keys(db.users).find(
      (id) => db.users[id].email === cleanEmail
    );

    let user;
    if (foundUserId) {
      db.users[foundUserId].name = cleanName;
      db.users[foundUserId].role = cleanRole;
      user = db.users[foundUserId];
    } else {
      const newId = 'usr_' + Date.now();
      user = {
        id: newId,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole
      };
      db.users[newId] = user;
      db.attendance[newId] = {};
    }

    saveDatabase(db);
    return res.status(200).json(user);
  } catch (err) {
    console.error('Error in /api/user/save:', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// 2. Fetch Attendance
app.get('/api/attendance/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const records = db.attendance[userId] || {};
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Mark or Update Attendance
app.post('/api/attendance', (req, res) => {
  try {
    const { userId, dateKey, status } = req.body;
    if (!userId || !dateKey || !status) {
      return res.status(400).json({ error: 'Missing parameters.' });
    }

    if (!db.attendance[userId]) {
      db.attendance[userId] = {};
    }

    db.attendance[userId][dateKey] = status;
    saveDatabase(db);

    res.json({ success: true, dateKey, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Delete Single Date Status
app.delete('/api/attendance/:userId/:dateKey', (req, res) => {
  try {
    const { userId, dateKey } = req.params;
    if (db.attendance[userId] && db.attendance[userId][dateKey]) {
      delete db.attendance[userId][dateKey];
      saveDatabase(db);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Reset Attendance Data for User
app.delete('/api/attendance/reset/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    if (db.attendance[userId]) {
      db.attendance[userId] = {};
      saveDatabase(db);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server successfully started on port ${PORT}`);
});
