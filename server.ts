import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("afclean.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    last_service_date TEXT,
    next_reminder_date TEXT
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed
    photos_before TEXT DEFAULT '[]',
    photos_after TEXT DEFAULT '[]',
    value REAL DEFAULT 0,
    payment_method TEXT,
    installments INTEGER DEFAULT 1,
    signature TEXT,
    notes TEXT,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS financials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- income, expense
    description TEXT,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    category TEXT
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  
  // Settings
  app.get("/api/settings", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = rows.reduce((acc: any, row: any) => {
      let val = row.value;
      if (val === 'true') val = true;
      if (val === 'false') val = false;
      acc[row.key] = val;
      return acc;
    }, {});
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    res.json({ success: true });
  });

  // Clients
  app.get("/api/clients", (req, res) => {
    const rows = db.prepare("SELECT * FROM clients").all();
    res.json(rows);
  });

  app.post("/api/clients", (req, res) => {
    const { name, address, phone } = req.body;
    const result = db.prepare("INSERT INTO clients (name, address, phone) VALUES (?, ?, ?)").run(name, address, phone);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/clients/:id", (req, res) => {
    const { name, address, phone } = req.body;
    db.prepare("UPDATE clients SET name = ?, address = ?, phone = ? WHERE id = ?").run(name, address, phone, req.params.id);
    res.json({ success: true });
  });

  // Services
  app.get("/api/services", (req, res) => {
    const rows = db.prepare(`
      SELECT s.*, c.name as client_name, c.phone as client_phone, c.address as client_address 
      FROM services s 
      JOIN clients c ON s.client_id = c.id
      ORDER BY s.date DESC
    `).all();
    res.json(rows);
  });

  app.post("/api/services", (req, res) => {
    const { client_id, date, value } = req.body;
    const result = db.prepare("INSERT INTO services (client_id, date, value) VALUES (?, ?, ?)").run(client_id, date, value);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/services/:id", (req, res) => {
    const { status, photos_before, photos_after, value, payment_method, installments, signature, notes, date } = req.body;
    
    const fields = [];
    const params = [];
    
    if (status !== undefined) { fields.push("status = ?"); params.push(status); }
    if (photos_before !== undefined) { fields.push("photos_before = ?"); params.push(JSON.stringify(photos_before)); }
    if (photos_after !== undefined) { fields.push("photos_after = ?"); params.push(JSON.stringify(photos_after)); }
    if (value !== undefined) { fields.push("value = ?"); params.push(value); }
    if (payment_method !== undefined) { fields.push("payment_method = ?"); params.push(payment_method); }
    if (installments !== undefined) { fields.push("installments = ?"); params.push(installments); }
    if (signature !== undefined) { fields.push("signature = ?"); params.push(signature); }
    if (notes !== undefined) { fields.push("notes = ?"); params.push(notes); }
    if (date !== undefined) { fields.push("date = ?"); params.push(date); }
    
    params.push(req.params.id);
    
    if (fields.length > 0) {
      db.prepare(`UPDATE services SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    }

    // If completed, update client last service date
    if (status === 'completed') {
      const service = db.prepare("SELECT client_id, date FROM services WHERE id = ?").get(req.params.id) as any;
      if (service) {
        const nextReminder = new Date(service.date);
        nextReminder.setMonth(nextReminder.getMonth() + 6);
        db.prepare("UPDATE clients SET last_service_date = ?, next_reminder_date = ? WHERE id = ?")
          .run(service.date, nextReminder.toISOString(), service.client_id);
          
        // Add to financials as income
        db.prepare("INSERT INTO financials (type, description, amount, date, category) VALUES (?, ?, ?, ?, ?)")
          .run('income', `Serviço #${req.params.id}`, value || 0, service.date, 'Limpeza');
      }
    }

    res.json({ success: true });
  });

  app.delete("/api/services/:id", (req, res) => {
    db.prepare("DELETE FROM services WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Financials
  app.get("/api/financials", (req, res) => {
    const rows = db.prepare("SELECT * FROM financials ORDER BY date DESC").all();
    res.json(rows);
  });

  app.post("/api/financials", (req, res) => {
    const { type, description, amount, date, category } = req.body;
    const result = db.prepare("INSERT INTO financials (type, description, amount, date, category) VALUES (?, ?, ?, ?, ?)")
      .run(type, description, amount, date, category);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/financials/:id", (req, res) => {
    const { type, description, amount, date, category } = req.body;
    db.prepare("UPDATE financials SET type = ?, description = ?, amount = ?, date = ?, category = ? WHERE id = ?")
      .run(type, description, amount, date, category, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/financials/:id", (req, res) => {
    db.prepare("DELETE FROM financials WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
