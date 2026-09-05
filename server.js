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
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
}

initSqlJs().then((SQL) => {
  if (fs.existsSync(dbPath)) {
    try {
      db = new SQL.Database(fs.readFileSync(dbPath));
    } catch (e) {
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
      PRIMARY KEY (user_id, date_key)
    );
  `);

  persistToDisk();

  // Save / Login User Profile
  app.post('/api/user/save', (req, res) => {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    try {
      const stmt = db.prepare("SELECT id, name, email, role FROM users WHERE email = ?");
      stmt.bind([email.trim().toLowerCase()]);
      let user;

      if (stmt.step()) {
        const row = stmt.get();
        user = { id: row[0], name: name.trim(), email: row[2], role: role || row[3] || '' };
        stmt.free();
        db.run("UPDATE users SET name = ?, role = ? WHERE id = ?;", [user.name, user.role, user.id]);
      } else {
        stmt.free();
        user = {
          id: 'usr_' + Date.now(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: role ? role.trim() : 'Student'
        };
        db.run("INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?);", [user.id, user.name, user.email, user.role]);
      }

      persistToDisk();
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get User Profile
  app.get('/api/user/:id', (req, res) => {
    try {
      const stmt = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?");
      stmt.bind([req.params.id]);
      if (stmt.step()) {
        const row = stmt.get();
        stmt.free();
        return res.json({ id: row[0], name: row[1], email: row[2], role: row[3] });
      }
      stmt.free();
      res.status(404).json({ error: 'User not found' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch Attendance by User
  app.get('/api/attendance/:userId', (req, res) => {
    try {
      const stmt = db.prepare("SELECT date_key, status FROM attendance WHERE user_id = ?");
      stmt.bind([req.params.userId]);
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

  // Save / Update Attendance
  app.post('/api/attendance', (req, res) => {
    const { userId, dateKey, status } = req.body;
    if (!userId || !dateKey || !['present', 'absent', 'holiday'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    try {
      db.run("INSERT OR REPLACE INTO attendance (user_id, date_key, status) VALUES (?, ?, ?);", [userId, dateKey, status]);
      persistToDisk();
      res.json({ success: true, dateKey, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Date Status
  app.delete('/api/attendance/:userId/:dateKey', (req, res) => {
    try {
      db.run("DELETE FROM attendance WHERE user_id = ? AND date_key = ?;", [req.params.userId, req.params.dateKey]);
      persistToDisk();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Clear All Records for User
  app.delete('/api/attendance/reset/:userId', (req, res) => {
    try {
      db.run("DELETE FROM attendance WHERE user_id = ?;", [req.params.userId]);
      persistToDisk();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
  });
}).catch(err => console.error(err));
