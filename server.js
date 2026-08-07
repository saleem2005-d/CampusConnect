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
    } catch (err) {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create tables for subjects and subject-specific attendance
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      subject_id TEXT,
      date_key TEXT,
      status TEXT NOT NULL,
      PRIMARY KEY (subject_id, date_key)
    );
  `);

  // Insert default subjects if none exist
  const existingSubs = db.exec("SELECT * FROM subjects");
  if (existingSubs.length === 0 || existingSubs[0].values.length === 0) {
    db.run("INSERT INTO subjects (id, name) VALUES ('sub_default', 'General Attendance');");
    persistToDisk();
  }

  // 1. Get all subjects
  app.get('/api/subjects', (req, res) => {
    try {
      const stmt = db.exec("SELECT id, name FROM subjects");
      const list = [];
      if (stmt.length > 0) {
        stmt[0].values.forEach(row => list.push({ id: row[0], name: row[1] }));
      }
      res.json(list);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Add a new subject
  app.post('/api/subjects', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subject name required.' });
    const id = 'sub_' + Date.now();
    try {
      db.run("INSERT INTO subjects (id, name) VALUES (?, ?);", [id, name]);
      persistToDisk();
      res.json({ id, name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Fetch attendance records for a specific subject
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

  // 4. Record/Update attendance
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

  // 5. Delete attendance entry
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
}).catch(err => console.error(err));