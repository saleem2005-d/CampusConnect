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
      email TEXT UNIQUE NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      subject_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (subject_id, date_key),
      FOREIGN KEY(subject_id) REFERENCES subjects(id)
    );
  `);

  persistToDisk();

  // Save / Retrieve User Profile
  app.post('/api/user/save', (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

    try {
      const stmt = db.prepare("SELECT id, name, email FROM users WHERE email = ?");
      stmt.bind([email]);
      let userId;

      if (stmt.step()) {
        const row = stmt.get();
        userId = row[0];
        stmt.free();
        db.run("UPDATE users SET name = ? WHERE id = ?;", [name, userId]);
      } else {
        stmt.free();
        userId = 'usr_' + Date.now();
        db.run("INSERT INTO users (id, name, email) VALUES (?, ?, ?);", [userId, name, email]);
        db.run("INSERT INTO subjects (id, user_id, name) VALUES (?, ?, ?);", ['sub_' + Date.now(), userId, 'General Attendance']);
      }
      persistToDisk();
      res.json({ id: userId, name, email });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch User Subjects
  app.get('/api/subjects/:userId', (req, res) => {
    const { userId } = req.params;
    try {
      const stmt = db.prepare("SELECT id, name FROM subjects WHERE user_id = ?");
      stmt.bind([userId]);
      const list = [];
      while (stmt.step()) {
        const row = stmt.get();
        list.push({ id: row[0], name: row[1] });
      }
      stmt.free();
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create Subject
  app.post('/api/subjects', (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name) return res.status(400).json({ error: 'User ID and Subject name required.' });
    const id = 'sub_' + Date.now();
    try {
      db.run("INSERT INTO subjects (id, user_id, name) VALUES (?, ?, ?);", [id, userId, name]);
      persistToDisk();
      res.json({ id, name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Fetch Attendance by Subject
  app.get('/api/attendance/:subjectId', (req, res) => {
    const { subjectId } = req.params;
    try {
      const stmt = db.prepare("SELECT date_key, status FROM attendance WHERE subject_id = ?");
      stmt.bind([subjectId]);
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
    const { subjectId, dateKey, status } = req.body;
    if (!subjectId || !dateKey || !['present', 'absent', 'holiday'].includes(status)) {
      return res.status(400).json({ error: 'Invalid parameters.' });
    }
    try {
      db.run("INSERT OR REPLACE INTO attendance (subject_id, date_key, status) VALUES (?, ?, ?);", [subjectId, dateKey, status]);
      persistToDisk();
      res.json({ success: true, subjectId, dateKey, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Entry
  app.delete('/api/attendance/:subjectId/:dateKey', (req, res) => {
    const { subjectId, dateKey } = req.params;
    try {
      db.run("DELETE FROM attendance WHERE subject_id = ? AND date_key = ?;", [subjectId, dateKey]);
      persistToDisk();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}`);
  });
}).catch(err => console.error('Failed to initialize Database:', err));