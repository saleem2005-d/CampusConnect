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

function loadDatabase() {
  try {
    if (fs.existsSync(dataFilePath)) {
      return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading DB:', err);
  }
  const defaultDB = { users: {}, attendance: {} };
  saveDatabase(defaultDB);
  return defaultDB;
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing DB:', err);
  }
}

let db = loadDatabase();

// Register New Account
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, name, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (db.users[cleanUsername]) {
      return res.status(409).json({ error: 'Username already taken. Please choose another.' });
    }

    const newUser = {
      username: cleanUsername,
      password: password,
      name: name ? name.trim() : cleanUsername,
      email: email ? email.trim().toLowerCase() : ''
    };

    db.users[cleanUsername] = newUser;
    if (!db.attendance[cleanUsername]) {
      db.attendance[cleanUsername] = {};
    }

    saveDatabase(db);
    return res.status(201).json({
      username: newUser.username,
      name: newUser.name,
      email: newUser.email
    });
  } catch (err) {
    return res.status(500).json({ error: 'Registration failed.', details: err.message });
  }
});

// Login Existing Account
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = db.users[cleanUsername];

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    return res.status(200).json({
      username: user.username,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed.', details: err.message });
  }
});

// Fetch Attendance by Username
app.get('/api/attendance/:username', (req, res) => {
  try {
    const userKey = req.params.username.trim().toLowerCase();
    const records = db.attendance[userKey] || {};
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save or Update Attendance
app.post('/api/attendance', (req, res) => {
  try {
    const { username, dateKey, status } = req.body;
    if (!username || !dateKey || !status) {
      return res.status(400).json({ error: 'Missing parameters.' });
    }

    const userKey = username.trim().toLowerCase();
    if (!db.attendance[userKey]) {
      db.attendance[userKey] = {};
    }

    db.attendance[userKey][dateKey] = status;
    saveDatabase(db);
    res.json({ success: true, dateKey, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Attendance Date
app.delete('/api/attendance/:username/:dateKey', (req, res) => {
  try {
    const userKey = req.params.username.trim().toLowerCase();
    const { dateKey } = req.params;
    if (db.attendance[userKey] && db.attendance[userKey][dateKey]) {
      delete db.attendance[userKey][dateKey];
      saveDatabase(db);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Records
app.delete('/api/attendance/reset/:username', (req, res) => {
  try {
    const userKey = req.params.username.trim().toLowerCase();
    db.attendance[userKey] = {};
    saveDatabase(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
