require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

// ===== SERVER + SOCKET =====
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ===== DB CONNECT =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ Mongo Error:", err));

// ===== SCHEMA =====
const PanelSchema = new mongoose.Schema({
  id: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "cutting", "dispatched"],
    default: "pending"
  },
  items: [{
    length: Number,
    width: Number,
    seq: Number
  }],
  totalGroupQty: Number
});

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  panels: [PanelSchema],
  createdAt: { type: Date, default: Date.now }
});

// 🔥 Index (faster queries)
ProjectSchema.index({ name: 1 });

const Project = mongoose.model("Project", ProjectSchema);

// ===== SOCKET =====
io.on("connection", () => {
  console.log("⚡ Client Connected");
});

// ===== HELPER =====
function normalize(id) {
  return String(id).replace("#", "").trim();
}

// ===== ROUTES =====

// 🔹 CREATE PROJECT
app.post("/api/projects", async (req, res) => {
  try {
    if (!req.body || !req.body.name) {
      return res.status(400).json({
        success: false,
        message: "Invalid Data"
      });
    }

    const project = await Project.create(req.body);

    io.emit("refresh");

    res.json({
      success: true,
      data: project
    });

  } catch (err) {
    console.log("❌ Create Error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔹 GET PROJECTS
app.get("/api/projects", async (req, res) => {
  try {
    const data = await Project.find().sort({ _id: -1 });

    res.json({
      success: true,
      data
    });

  } catch (err) {
    console.log("❌ Fetch Error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔥 UPDATE PANEL STATUS (FAST + SAFE)
app.put("/api/projects/:id/status", async (req, res) => {
  try {
    const { panelId, status } = req.body;

    // 🔒 Validate status
    const allowed = ["pending", "cutting", "dispatched"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false });
    }

    let found = false;

    project.panels.forEach(p => {
      if (normalize(p.id) === normalize(panelId)) {
        p.status = status;
        found = true;
      }
    });

    if (!found) {
      console.log("❌ Panel NOT FOUND:", panelId);
      return res.json({
        success: false,
        message: "Panel not found"
      });
    }

    await project.save();

    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.log("❌ Update Error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔹 DELETE PROJECT
app.delete("/api/projects/:id", async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);

    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.log("❌ Delete Error:", err);
    res.status(500).json({ success: false });
  }
});

// ===== START SERVER =====
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
