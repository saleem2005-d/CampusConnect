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

app.get('/favicon.ico', (req, res) => res.status(204).end());

const dbPath = path.join(__dirname, 'campusconnect.db');
let db = null;

function saveDb() {
  if (db) {
    try {
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (e) {
      console.error('Disk persist error:', e);
    }
  }
}

// Locate wasm binary safely
initSqlJs({
  locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
}).then((SQL) => {
  try {
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath);
      db = new SQL.Database(buf);
      console.log('Existing DB loaded successfully.');
    } else {
      db = new SQL.Database();
      console.log('New in-memory DB created.');
    }
  } catch (err) {
    console.warn('Fallback: Initializing fresh DB in memory.', err);
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

  saveDb();
  console.log('Schema verified and saved.');

  // Safe User Registration / Profile Save Route
  app.post('/api/user/save', (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'Database loading...' });

      const { name, email, role } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: 'Name and email required.' });
      }

      const safeEmail = String(email).trim().toLowerCase();
      const safeName = String(name).trim();
      const safeRole = role ? String(role).trim() : 'Student';

      // Safe parameter binding query
      const checkStmt = db.prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
      checkStmt.bind({ ':email': safeEmail });
      
      let userObj;
      if (checkStmt.step()) {
        const row = checkStmt.getAsObject();
        checkStmt.free();

        const updateStmt = db.prepare('UPDATE users SET name = :name, role = :role WHERE id = :id');
        updateStmt.bind({ ':name': safeName, ':role': safeRole, ':id': row.id });
        updateStmt.step();
        updateStmt.free();

        userObj = { id: row.id, name: safeName, email: safeEmail, role: safeRole };
      } else {
        checkStmt.free();
        const newId = 'usr_' + Date.now();

        const insertStmt = db.prepare('INSERT INTO users (id, name, email, role) VALUES (:id, :name, :email, :role)');
        insertStmt.bind({ ':id': newId, ':name': safeName, ':email': safeEmail, ':role': safeRole });
        insertStmt.step();
        insertStmt.free();

        userObj = { id: newId, name: safeName, email: safeEmail, role: safeRole };
      }

      saveDb();
      return res.json(userObj);
    } catch (err) {
      console.error('Server save error:', err);
      return res.status(500).json({ error: 'Internal Database Error', details: err.message });
    }
  });

  // Fetch Attendance by User
  app.get('/api/attendance/:userId', (req, res) => {
    try {
      if (!db) return res.json({});
      const stmt = db.prepare('SELECT date_key, status FROM attendance WHERE user_id = :uid');
      stmt.bind({ ':uid': req.params.userId });
      
      const records = {};
      while (stmt.step()) {
        const row = stmt.getAsObject();
        records[row.date_key] = row.status;
      }
      stmt.free();
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Record Attendance
  app.post('/api/attendance', (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'Database loading...' });
      const { userId, dateKey, status } = req.body;
      if (!userId || !dateKey || !status) return res.status(400).json({ error: 'Bad Request' });

      const stmt = db.prepare('INSERT OR REPLACE INTO attendance (user_id, date_key, status) VALUES (:uid, :dkey, :status)');
      stmt.bind({ ':uid': userId, ':dkey': dateKey, ':status': status });
      stmt.step();
      stmt.free();

      saveDb();
      res.json({ success: true, dateKey, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Record
  app.delete('/api/attendance/:userId/:dateKey', (req, res) => {
    try {
      if (!db) return res.json({ success: true });
      const stmt = db.prepare('DELETE FROM attendance WHERE user_id = :uid AND date_key = :dkey');
      stmt.bind({ ':uid': req.params.userId, ':dkey': req.params.dateKey });
      stmt.step();
      stmt.free();

      saveDb();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset Records
  app.delete('/api/attendance/reset/:userId', (req, res) => {
    try {
      if (!db) return res.json({ success: true });
      const stmt = db.prepare('DELETE FROM attendance WHERE user_id = :uid');
      stmt.bind({ ':uid': req.params.userId });
      stmt.step();
      stmt.free();

      saveDb();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusConnect ready on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Fatal initialization error:', err);
});
