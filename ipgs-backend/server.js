require("dotenv").config(); // 🔥 LOAD ENV

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
  origin: [
    "http://localhost:5173"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ================== SESSION ================== */
app.use(session({
  secret: process.env.SESSION_SECRET, // 🔥 FROM ENV
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
  .then(() => console.log("MongoDB Connected ✅"))
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
  status: { type: String, default: "A" },
  createdBy: String,
  updatedBy: String
});

const Admin = mongoose.model("Admin", {
  username: String,
  password: String
});

/* ================== AUTH ================== */
function isAuth(req, res, next) {
  if (req.session.admin) {
    next();
  } else {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
}

/* ================== ROUTES ================== */

// Test
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

/* ===== LOGIN ===== */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username, password });

    if (admin) {
      req.session.admin = admin._id;
      return res.json({ success: true, message: "Login success" });
    } else {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ===== LOGOUT ===== */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logout success" });
  });
});

/* ===== CHECK AUTH ===== */
app.get("/check-auth", (req, res) => {
  if (req.session.admin) {
    res.json({ success: true, message: "Authorized" });
  } else {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
});

/* ===== BLOG CRUD ===== */

// Add Blog
app.post("/add-blog", isAuth, upload.single("image"), async (req, res) => {
  try {
    const blog = new Blog({
      title: req.body.title,
      content: req.body.content,
      date: req.body.date,
      image: req.file ? req.file.filename : "",
      status: "A"
    });

    await blog.save();
    res.json({ success: true, message: "Blog added" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error adding blog" });
  }
});

/* ===== PAGINATION ===== */
app.get("/blogs", async (req, res) => {
  try {
    let page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 5;

    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { status: "A" },
        { status: { $exists: false } }
      ]
    };

    const total = await Blog.countDocuments(query);

    const blogs = await Blog.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      blogs,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error fetching blogs" });
  }
});

/* ===== DELETE BLOG ===== */
app.delete("/delete-blog/:id", isAuth, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    await Blog.findByIdAndUpdate(req.params.id, { status: "D" });

    res.json({ success: true, message: "Blog deleted" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error deleting blog" });
  }
});

/* ===== UPDATE BLOG ===== */
app.put("/update-blog/:id", isAuth, upload.single("image"), async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

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

    res.json({ success: true, message: "Blog updated" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Error updating blog" });
  }
});

/* ================== SERVER ================== */
app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT} 🚀`)
);