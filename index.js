const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize SQLite DB
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    contactnumber TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    employer TEXT,
    location TEXT
  )`);

  // Insert admin user if not exists
  db.get(`SELECT * FROM users WHERE username = ?`, ['admin'], (err, row) => {
    if (err) {
      console.error('Error checking admin user', err);
    } else if (!row) {
      db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', 'adminpass', 'admin']);
      console.log('Admin user created: username=admin, password=adminpass');
    }
  });
});

app.get('/api/ping', (req, res) => {
    res.json({ message: 'pong' });
});

// Register user
app.post('/api/register', (req, res) => {
  const { username, password, role, contactnumber } = req.body;
  if (!username || !password || !role || !contactnumber) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  console.log(contactnumber, role,'contactnumber, role');
  const stmt = db.prepare(`INSERT INTO users (username, password, role, contactnumber ) VALUES (?, ?, ?, ?)`);
  console.log(stmt, 'stmt');
  stmt.run(username, password, role, contactnumber, function (err) {
    if (err) {
      return res.status(400).json({ error: 'Username taken' });
    }
    res.json({ message: 'User registered' });
  });
  stmt.finalize();
});

// Login user
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ message: 'Login successful', role: row.role, username: row.username, contactnumber: row.contactnumber });
  });
});

// Post a job (employer only)
app.post('/api/jobs', (req, res) => {
  const { username, title, description,location } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user || user.role !== 'employer') {
      return res.status(403).json({ error: 'Only employers can post jobs' });
    }
    const stmt = db.prepare(`INSERT INTO jobs (title, description, employer,location) VALUES (?, ?, ?, ?)`);
    stmt.run(title, description, username,location, function (err) {
      if (err) return res.status(500).json({ error: 'Failed to post job' });
      res.json({ message: 'Job posted', job: { id: this.lastID, title, description, employer: username, location } });
    });
    stmt.finalize();
  });
});

// Get all jobs
app.get('/api/get_jobs', (req, res) => {
  db.all(`SELECT * FROM jobs`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Middleware to check admin role
function isAdmin(req, res, next) {
  const { username } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Get all users (admin only)
app.post('/api/admin/users', isAdmin, (req, res) => {
  db.all(`SELECT username, role FROM users`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Get all jobs (admin only)
app.post('/api/admin/jobs', isAdmin, (req, res) => {
  db.all(`SELECT * FROM jobs`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

// Delete user (admin only)
app.post('/api/admin/delete-user', isAdmin, (req, res) => {
  const { targetUsername } = req.body;
  db.run(`DELETE FROM users WHERE username = ?`, [targetUsername], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete user' });
    db.run(`DELETE FROM jobs WHERE employer = ?`, [targetUsername], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to delete user jobs' });
      res.json({ message: `User ${targetUsername} and their jobs deleted` });
    });
  });
});

// Delete job (admin only)
app.post('/api/admin/delete-job', isAdmin, (req, res) => {
  const { jobId } = req.body;
  db.run(`DELETE FROM jobs WHERE id = ?`, [jobId], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete job' });
    res.json({ message: `Job ${jobId} deleted` });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
