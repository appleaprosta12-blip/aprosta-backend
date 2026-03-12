require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "aprosta-secret-change-in-production";

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase() || ".jpg";
    const name = (file.originalname || "image").replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, Date.now() + "-" + name);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use("/uploads", express.static(uploadsDir));

// MongoDB Connection (use ATLAS_URI from .env)
const atlasUri = process.env.ATLAS_URI;
let dbConnected = false;
if (!atlasUri) {
  console.warn("⚠ ATLAS_URI not set in .env — using in-memory fallback.");
}
mongoose
  .connect(atlasUri || "mongodb://localhost:27017/aprosta")
  .then(() => {
    dbConnected = true;
    console.log("✔ MongoDB Connected");
  })
  .catch((err) => {
    console.warn("⚠ MongoDB not connected — using in-memory products. To use Atlas, whitelist your IP: https://www.mongodb.com/docs/atlas/security-whitelist/");
    console.warn(err.message);
  });
mongoose.connection.on("error", () => { dbConnected = false; });
mongoose.connection.on("disconnected", () => { dbConnected = false; });

// User Schema & Model
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ["customer", "admin"], default: "customer" },
});
const User = mongoose.model("User", UserSchema);

// Product Schema & Model
const ProductSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  image: String,
  category: String,
});
const Product = mongoose.model("Product", ProductSchema);

// Order Schema (customer orders from checkout)
const OrderSchema = new mongoose.Schema({
  customerName: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  notes: String,
  items: [{ id: String, name: String, price: Number, qty: Number }],
  total: Number,
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model("Order", OrderSchema);
let inMemoryOrders = [];

// 20 modern tech products — prices in Philippine Peso (₱)
const seedProducts = [
  { name: "Wireless Pro Earbuds", description: "Premium ANC, 30hr battery, crystal-clear calls.", price: 8495, image: "https://images.unsplash.com/photo-1598331668826-20cecc596b86?w=400&h=300&fit=crop", category: "Audio" },
  { name: "Smart Watch Series X", description: "Always-on display, health tracking, 7-day battery.", price: 16995, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=300&fit=crop", category: "Wearables" },
  { name: "Mechanical Keyboard RGB", description: "Cherry MX switches, per-key RGB, aluminum frame.", price: 7295, image: "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?w=400&h=300&fit=crop", category: "Peripherals" },
  { name: "4K Webcam Pro", description: "60fps, auto-focus, built-in mic and privacy shutter.", price: 9995, image: "https://images.unsplash.com/photo-1587826080692-f439cd0b70da?w=400&h=300&fit=crop", category: "Video" },
  { name: "Portable SSD 1TB", description: "USB 3.2 Gen 2, up to 1050MB/s read, shock-resistant.", price: 6695, image: "https://images.unsplash.com/photo-1597872200969-2b65d5659341?w=400&h=300&fit=crop", category: "Storage" },
  { name: "USB-C Hub 7-in-1", description: "HDMI 4K, USB 3.0, SD reader, 100W PD.", price: 4995, image: "https://images.unsplash.com/photo-1625723044792-44de16ccb4e9?w=400&h=300&fit=crop", category: "Accessories" },
  { name: "Ergonomic Laptop Stand", description: "Aluminum, adjustable height, better posture.", price: 3895, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=300&fit=crop", category: "Desk" },
  { name: "Noise-Cancelling Headphones", description: "Over-ear, 40hr battery, multipoint Bluetooth.", price: 13995, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop", category: "Audio" },
  { name: "Wireless Charging Pad", description: "15W fast charge, Qi compatible, LED indicator.", price: 2745, image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=300&fit=crop", category: "Accessories" },
  { name: "Bluetooth Speaker", description: "360° sound, IP67 waterproof, 12hr playback.", price: 4425, image: "https://images.unsplash.com/photo-1545454675384-8dd4d6bbe738?w=400&h=300&fit=crop", category: "Audio" },
  { name: "Monitor Arm Mount", description: "Single arm, VESA 75/100, cable management.", price: 3295, image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400&h=300&fit=crop", category: "Desk" },
  { name: "RGB Mouse Pad XL", description: "Extended 900x400mm, non-slip base, USB powered.", price: 1950, image: "https://images.unsplash.com/photo-1615663245857-acb986faa229?w=400&h=300&fit=crop", category: "Peripherals" },
  { name: "Laptop Sleeve 13\"", description: "Neoprene, fits 13–14\", extra pocket for charger.", price: 2525, image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400&h=300&fit=crop", category: "Accessories" },
  { name: "Cable Management Kit", description: "Clips, sleeves, ties — clean desk setup.", price: 1395, image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop", category: "Desk" },
  { name: "Desk LED Strip", description: "RGB, app control, adhesive, 2m length.", price: 3075, image: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400&h=300&fit=crop", category: "Desk" },
  { name: "Tablet Stand Adjustable", description: "Aluminum, 5 angles, holds tablets up to 12.9\".", price: 2185, image: "https://images.unsplash.com/photo-1544244015-0df4b3ddc756?w=400&h=300&fit=crop", category: "Desk" },
  { name: "Power Bank 20000mAh", description: "USB-C PD 45W, dual output, fast recharge.", price: 3295, image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400&h=300&fit=crop", category: "Accessories" },
  { name: "Smart Desk Lamp", description: "Touch dimming, USB port, minimal design.", price: 3850, image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=400&h=300&fit=crop", category: "Desk" },
  { name: "Webcam Ring Light", description: "Dimmable, USB powered, clip-on for laptops.", price: 2525, image: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&h=300&fit=crop", category: "Video" },
  { name: "Ergonomic Mouse", description: "Vertical grip, 6 buttons, silent clicks.", price: 4995, image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&h=300&fit=crop", category: "Peripherals" },
];

// In-memory fallback when MongoDB is not connected
function getInMemoryProducts() {
  return seedProducts.map((p, i) => ({ ...p, _id: `mem-${i + 1}` }));
}
let inMemoryProducts = getInMemoryProducts();

// Pre-made admin only (customers register via Sign up)
const defaultAdminHash = bcrypt.hashSync("Admin123!", 10);
const inMemoryUsers = [
  { id: "admin-1", email: "admin@aprosta.sphere", password: defaultAdminHash, name: "Admin", role: "admin" },
];

// Auth middleware: optional (sets req.user if valid token)
function authOptional(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    next();
  }
}
// Auth required
function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Login required" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
// Admin only (use after authRequired)
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}

async function seedIfEmpty() {
  const count = await Product.countDocuments();
  if (count === 0) await Product.insertMany(seedProducts);
  const adminExists = await User.findOne({ email: "admin@aprosta.sphere" });
  if (!adminExists) {
    await User.create({ email: "admin@aprosta.sphere", password: defaultAdminHash, name: "Admin", role: "admin" });
    console.log("✔ Seeded admin account (admin@aprosta.sphere / Admin123!)");
  }
  if (count === 0) console.log("✔ Seeded 20 products");
}

// ----- Auth Routes -----
// Register = always customer (admin account is pre-made only)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: "Email, password, and name required" });
    if (dbConnected) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ error: "Email already registered" });
      const hash = bcrypt.hashSync(password, 10);
      const user = await User.create({ email, password: hash, name, role: "customer" });
      const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET);
      return res.json({ token, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
    }
    const mem = inMemoryUsers.find((u) => u.email === email);
    if (mem) return res.status(400).json({ error: "Email already registered" });
    const hash = bcrypt.hashSync(password, 10);
    const newUser = { id: "mem-" + Date.now(), email, password: hash, name, role: "customer" };
    inMemoryUsers.push(newUser);
    const token = jwt.sign({ id: newUser.id, email: newUser.email, role: newUser.role }, JWT_SECRET);
    res.json({ token, user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const isAdminCreds = email === "admin@aprosta.sphere" && password === "Admin123!";

    if (dbConnected) {
      let user = await User.findOne({ email });
      if (isAdminCreds && !user) {
        await User.create({ email: "admin@aprosta.sphere", password: defaultAdminHash, name: "Admin", role: "admin" });
        user = await User.findOne({ email: "admin@aprosta.sphere" });
      }
      if (isAdminCreds && user && !bcrypt.compareSync(password, user.password)) {
        await User.updateOne({ email: "admin@aprosta.sphere" }, { password: defaultAdminHash });
        user = await User.findOne({ email: "admin@aprosta.sphere" });
      }
      if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: "Invalid email or password" });
      const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET);
      return res.json({ token, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
    }

    let user = inMemoryUsers.find((u) => u.email === email);
    if (isAdminCreds && !user) {
      inMemoryUsers.push({ id: "admin-1", email: "admin@aprosta.sphere", password: defaultAdminHash, name: "Admin", role: "admin" });
      user = inMemoryUsers.find((u) => u.email === "admin@aprosta.sphere");
    }
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: "Invalid email or password" });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

// ----- Upload (admin only) -----
app.post("/api/upload", authRequired, adminOnly, upload.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file uploaded" });
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const url = `${baseUrl}/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----- Product CRUD Routes -----

// READ all
app.get("/api/products", async (req, res) => {
  try {
    if (dbConnected) {
      const products = await Product.find();
      return res.json(products);
    }
    res.json(inMemoryProducts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// READ one
app.get("/api/products/:id", async (req, res) => {
  try {
    if (dbConnected) {
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      return res.json(product);
    }
    const p = inMemoryProducts.find((x) => String(x._id) === req.params.id);
    if (!p) return res.status(404).json({ error: "Product not found" });
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE (admin only)
app.post("/api/products", authRequired, adminOnly, async (req, res) => {
  try {
    if (dbConnected) {
      const newProduct = new Product(req.body);
      await newProduct.save();
      return res.json(newProduct);
    }
    const newP = { ...req.body, _id: `mem-${Date.now()}` };
    inMemoryProducts.push(newP);
    res.json(newP);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE (admin only)
app.put("/api/products/:id", authRequired, adminOnly, async (req, res) => {
  try {
    if (dbConnected) {
      const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: "Product not found" });
      return res.json(updated);
    }
    const i = inMemoryProducts.findIndex((x) => String(x._id) === req.params.id);
    if (i === -1) return res.status(404).json({ error: "Product not found" });
    inMemoryProducts[i] = { ...inMemoryProducts[i], ...req.body, _id: inMemoryProducts[i]._id };
    res.json(inMemoryProducts[i]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE (admin only)
app.delete("/api/products/:id", authRequired, adminOnly, async (req, res) => {
  try {
    if (dbConnected) {
      const deleted = await Product.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Product not found" });
      return res.json({ message: "Product deleted successfully" });
    }
    const i = inMemoryProducts.findIndex((x) => String(x._id) === req.params.id);
    if (i === -1) return res.status(404).json({ error: "Product not found" });
    inMemoryProducts.splice(i, 1);
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEED — replace all products with 20 tech products (POST or GET to populate)
async function runSeed(req, res) {
  try {
    if (dbConnected) {
      await Product.deleteMany({});
      await Product.insertMany(seedProducts);
      const count = await Product.countDocuments();
      return res.json({ message: `Seeded ${count} products`, count });
    }
    inMemoryProducts = getInMemoryProducts();
    res.json({ message: `Seeded ${inMemoryProducts.length} products (in-memory)`, count: inMemoryProducts.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
app.post("/api/seed", runSeed);
app.get("/api/seed", runSeed);

// ----- Orders (checkout) -----
app.post("/api/orders", async (req, res) => {
  try {
    const { customerName, email, phone, address, city, notes, items, total } = req.body;
    if (!customerName || !email || !phone || !address || !city || !items?.length || total == null) {
      return res.status(400).json({ error: "Missing required fields: name, email, phone, address, city, items, total" });
    }
    const order = { customerName, email, phone, address, city, notes: notes || "", items, total, createdAt: new Date() };
    if (dbConnected) {
      const saved = await Order.create(order);
      return res.status(201).json({ orderId: saved._id, message: "Order placed successfully" });
    }
    const memId = `mem-${Date.now()}`;
    inMemoryOrders.push({ ...order, _id: memId });
    res.status(201).json({ orderId: memId, message: "Order placed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server after DB connection & seed
mongoose.connection.once("open", () => {
  seedIfEmpty().catch((e) => console.warn("Seed skipped:", e.message));
});
app.listen(PORT, () =>
  console.log(`✔ Server running on http://localhost:${PORT}`)
);
