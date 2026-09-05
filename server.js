const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Ignore favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

const dbPath = path.resolve(__dirname, 'campusconnect.db');
let db = null;

function persistToDisk() {
  if (db) {
    try {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (err) {
      console.error('Disk write error:', err);
    }
  }
}

// Locate wasm binary safely for Render environments
const wasmBinaryPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

const sqlConfig = fs.existsSync(wasmBinaryPath)
  ? { locateFile: () => wasmBinaryPath }
  : {};

initSqlJs(sqlConfig)
  .then((SQL) => {
    try {
      if (fs.existsSync(dbPath)) {
        db = new SQL.Database(fs.readFileSync(dbPath));
      } else {
        db = new SQL.Database();
      }
    } catch (err) {
      db = new SQL.Database();
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT
      );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS attendance (
        user_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (user_id, date_key)
      );
    `);

    persistToDisk();
    console.log("Database initialized successfully.");
  })
  .catch((err) => {
    console.error("FATAL: Failed to boot sql.js WASM:", err);
  });

// Guard middleware
app.use('/api', (req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: 'Database initializing. Please retry in 5 seconds.' });
  }
  next();
});

// Profile Login / Registration
app.post('/api/user/save', (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();
  const cleanRole = role ? role.trim() : 'Student';

  try {
    const query = "SELECT id, name, email, role FROM users WHERE email = '" + cleanEmail.replace(/'/g, "''") + "';";
    const result = db.exec(query);
    let user;

    if (result.length > 0 && result[0].values.length > 0) {
      const userId = result[0].values[0][0];
      db.run(
        "UPDATE users SET name = '" + cleanName.replace(/'/g, "''") + "', role = '" + cleanRole.replace(/'/g, "''") + "' WHERE id = '" + userId + "';"
      );
      user = { id: userId, name: cleanName, email: cleanEmail, role: cleanRole };
    } else {
      const newId = 'usr_' + Date.now();
      db.run(
        "INSERT INTO users (id, name, email, role) VALUES ('" + newId + "', '" + cleanName.replace(/'/g, "''") + "', '" + cleanEmail.replace(/'/g, "''") + "', '" + cleanRole.replace(/'/g, "''") + "');"
      );
      user = { id: newId, name: cleanName, email: cleanEmail, role: cleanRole };
    }

    persistToDisk();
    return res.json(user);
  } catch (err) {
    console.error('Save error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Fetch Attendance
app.get('/api/attendance/:userId', (req, res) => {
  const cleanUserId = req.params.userId.replace(/'/g, "''");
  try {
    const result = db.exec("SELECT date_key, status FROM attendance WHERE user_id = '" + cleanUserId + "';");
    const records = {};
    if (result.length > 0 && result[0].values.length > 0) {
      result[0].values.forEach(row => {
        records[row[0]] = row[1];
      });
    }
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record Attendance
app.post('/api/attendance', (req, res) => {
  const { userId, dateKey, status } = req.body;
  if (!userId || !dateKey || !['present', 'absent', 'holiday'].includes(status)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const cleanUserId = userId.replace(/'/g, "''");
  const cleanDateKey = dateKey.replace(/'/g, "''");
  const cleanStatus = status.replace(/'/g, "''");

  try {
    db.run(
      "INSERT OR REPLACE INTO attendance (user_id, date_key, status) VALUES ('" + cleanUserId + "', '" + cleanDateKey + "', '" + cleanStatus + "');"
    );
    persistToDisk();
    res.json({ success: true, dateKey, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Day Attendance
app.delete('/api/attendance/:userId/:dateKey', (req, res) => {
  const cleanUserId = req.params.userId.replace(/'/g, "''");
  const cleanDateKey = req.params.dateKey.replace(/'/g, "''");
  try {
    db.run("DELETE FROM attendance WHERE user_id = '" + cleanUserId + "' AND date_key = '" + cleanDateKey + "';");
    persistToDisk();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Records
app.delete('/api/attendance/reset/:userId', (req, res) => {
  const cleanUserId = req.params.userId.replace(/'/g, "''");
  try {
    db.run("DELETE FROM attendance WHERE user_id = '" + cleanUserId + "';");
    persistToDisk();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CampusConnect Server listening on port ${PORT}`);
});
