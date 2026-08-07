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
      console.log('Loaded existing database campusconnect.db');
    } catch (err) {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      date_key TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
  `);
  persistToDisk();

  app.get('/api/attendance', (req, res) => {
    try {
      const resStmt = db.exec("SELECT date_key, status FROM attendance");
      const records = {};
      if (resStmt.length > 0) {
        resStmt[0].values.forEach(row => { records[row[0]] = row[1]; });
      }
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/attendance', (req, res) => {
    const { dateKey, status } = req.body;
    if (!dateKey || !['present', 'absent', 'holiday'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payload.' });
    }
    try {
      db.run("INSERT OR REPLACE INTO attendance (date_key, status) VALUES (?, ?);", [dateKey, status]);
      persistToDisk();
      res.json({ success: true, dateKey, status });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/attendance/:dateKey', (req, res) => {
    const { dateKey } = req.params;
    try {
      db.run("DELETE FROM attendance WHERE date_key = ?;", [dateKey]);
      persistToDisk();
      res.json({ success: true, deletedDateKey: dateKey });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`CampusConnect Server running at http://127.0.0.1:${PORT}`);
    console.log(`====================================================`);
  });
}).catch(err => {
  console.error('Failed to initialize sql.js:', err);
});