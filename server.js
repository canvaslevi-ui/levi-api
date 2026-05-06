const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ===== CONFIG =====
const PORT = 3000;

// ===== DB =====
mongoose.connect("YOUR_MONGO_URI")
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log("❌ Mongo Error:", err));

// ===== MODEL =====
const Project = mongoose.model("Project", new mongoose.Schema({
  name: { type: String, required: true },
  panels: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
}));

// ===== SOCKET =====
io.on("connection", socket=>{
  console.log("⚡ Client connected");
});

// ===== ROUTES =====

// CREATE PROJECT (NO AUTH)
app.post("/api/projects", async (req, res) => {
  try {
    if (!req.body || !req.body.name) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    const data = await Project.create(req.body);
    io.emit("refresh");
    res.json({ success: true, data });
  } catch (err) {
    console.log("❌ Create error:", err);
    res.status(500).json({ success: false });
  }
});

// GET PROJECTS
app.get("/api/projects", async (req, res) => {
  try {
    const data = await Project.find().sort({ _id: -1 });
    res.json({ success: true, data });
  } catch (err) {
    console.log("❌ Fetch error:", err);
    res.status(500).json({ success: false });
  }
});

// UPDATE STATUS
app.put("/api/projects/:id/status", async (req, res) => {
  try {
    const { panelId, status } = req.body;

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false });

    project.panels.forEach(p => {
      if (p.id === panelId) p.status = status;
    });

    await project.save();
    io.emit("refresh");

    res.json({ success: true });
  } catch (err) {
    console.log("❌ Update error:", err);
    res.status(500).json({ success: false });
  }
});

// DELETE PROJECT (NO AUTH)
app.delete("/api/projects/:id", async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    io.emit("refresh");
    res.json({ success: true });
  } catch (err) {
    console.log("❌ Delete error:", err);
    res.status(500).json({ success: false });
  }
});

// ===== START =====
server.listen(PORT, () => {
  console.log("🚀 Server running on", PORT);
});
