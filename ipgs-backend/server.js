require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();

/* ================== MIDDLEWARE ================== */
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================== SESSION ================== */
app.use(session({
  secret: process.env.SESSION_SECRET || "fallbackSecret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true
  }
}));

/* ================== STATIC ================== */
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

/* ================== CREATE UPLOAD FOLDER ================== */
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

/* ================== MONGODB ================== */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas Connected ✅"))
  .catch(err => console.log("MongoDB Error ❌", err));

/* ================== MULTER ================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ================== MODELS ================== */
const Blog = mongoose.model("Blog", {
  title: String,
  content: String,
  date: String,
  image: String,
  status: { type: String, default: "A" }
});

const Admin = mongoose.model("Admin", {
  username: String,
  password: String
});

/* ================== AUTH ================== */
function isAuth(req, res, next) {
  if (req.session.admin) return next();
  return res.status(401).json({ success: false });
}

/* ================== ROOT ================== */
app.get("/", (req, res) => {
  res.redirect("/login.html");
});

/* ================== CREATE ADMIN (RUN ONCE) ================== */
app.get("/create-admin", async (req, res) => {
  const exists = await Admin.findOne({ username: "admin" });

  if (exists) return res.send("Admin already exists");

  await Admin.create({
    username: "admin",
    password: "admin123"
  });

  res.send("Admin created");
});

/* ================== LOGIN ================== */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username, password });

    if (!admin) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    req.session.admin = admin._id;
    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
});

/* ================== LOGOUT ================== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/* ================== CHECK AUTH ================== */
app.get("/check-auth", (req, res) => {
  if (req.session.admin) return res.json({ success: true });
  return res.status(401).json({ success: false });
});

/* ================== BLOG APIs ================== */
app.get("/blogs", isAuth, async (req, res) => {
  try {
    const blogs = await Blog.find({ status: "A" }).sort({ _id: -1 });
    res.json({ success: true, blogs });
  } catch {
    res.status(500).json({ success: false });
  }
});

app.post("/add-blog", isAuth, upload.single("image"), async (req, res) => {
  try {
    await Blog.create({
      title: req.body.title,
      content: req.body.content,
      date: req.body.date,
      image: req.file ? req.file.filename : ""
    });

    res.json({ success: true });

  } catch {
    res.status(500).json({ success: false });
  }
});

app.delete("/delete-blog/:id", isAuth, async (req, res) => {
  await Blog.findByIdAndUpdate(req.params.id, { status: "D" });
  res.json({ success: true });
});

app.put("/update-blog/:id", isAuth, upload.single("image"), async (req, res) => {
  const blog = await Blog.findById(req.params.id);

  const updateData = {
    title: req.body.title,
    content: req.body.content,
    date: req.body.date
  };

  if (req.file) {
    if (blog.image && fs.existsSync(`uploads/${blog.image}`)) {
      fs.unlinkSync(`uploads/${blog.image}`);
    }
    updateData.image = req.file.filename;
  }

  await Blog.findByIdAndUpdate(req.params.id, updateData);

  res.json({ success: true });
});

/* ================== SERVER ================== */
app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT} 🚀`);
});