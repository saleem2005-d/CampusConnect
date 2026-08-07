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

const dbPath = path.resolve(__dirname, 'campusconnect.db');
let db;

function persistToDisk() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

initSqlJs().then((SQL) => {
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('Database loaded successfully.');
    } catch (err) {
      db = new SQL.Database();
    }
  } else {
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
      PRIMARY KEY (user_id, date_key),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  persistToDisk();

  // Save / Update User Profile
  app.post('/api/user/save', (req, res) => {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required.' });

    try {
      const stmt = db.prepare("SELECT id, name, email, role FROM users WHERE email = ?");
      stmt.bind([email]);
      let userId;

      if (stmt.step()) {
        const row = stmt.get();
        userId = row[0];
        stmt.free();
        db.run("UPDATE users SET name = ?, role = ? WHERE id = ?;", [name, role || '', userId]);
      } else {
        stmt.free();
        userId = 'usr_' + Date.now();
        db.run("INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?);", [userId, name, email, role || '']);
      }
      persistToDisk();
      res.json({ id: userId, name, email, role: role || '' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch User Attendance
  app.get('/api/attendance/:userId', (req, res) => {
    const { userId } = req.params;
    try {
      const stmt = db.prepare("SELECT date_key, status FROM attendance WHERE user_id = ?");
      stmt.bind([userId]);
      const records = {};
      while (stmt.step()) {
        const row = stmt.get();
        records[row[0]] = row[1];
      }
      stmt.free();
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Record Attendance
  app.post('/api/attendance', (req, res) => {
    const { userId, dateKey, status } = req.body;
    if (!userId || !dateKey || !['present', 'absent', 'holiday'].includes(status)) {
      return res.status(400).json({ error: 'Invalid parameters.' });
    }
    try {
      db.run("INSERT OR REPLACE INTO attendance (user_id, date_key, status) VALUES (?, ?, ?);", [userId, dateKey, status]);
      persistToDisk();
      res.json({ success: true, userId, dateKey, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Attendance Entry
  app.delete('/api/attendance/:userId/:dateKey', (req, res) => {
    const { userId, dateKey } = req.params;
    try {
      db.run("DELETE FROM attendance WHERE user_id = ? AND date_key = ?;", [userId, dateKey]);
      persistToDisk();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset All User Data
  app.delete('/api/attendance/reset/:userId', (req, res) => {
    const { userId } = req.params;
    try {
      db.run("DELETE FROM attendance WHERE user_id = ?;", [userId]);
      persistToDisk();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusConnect Server running on port ${PORT}`);
  });
}).catch(err => console.error('Database initialization error:', err));