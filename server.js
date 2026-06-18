require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const XLSX = require("xlsx");
const PDFParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require('pdf-lib');

const app = express();
app.use(cors());
app.use(express.json());

// ===== SERVER + SOCKET =====
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ===== CONFIG =====
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://levi:levi123@cluster0.1ot8toh.mongodb.net/leviDB?retryWrites=true&w=majority';

console.log('📡 Starting server on port:', PORT);
console.log('📡 MongoDB URI:', MONGO_URI.replace(/:[^:]*@/, ':****@'));

// ===== DB CONNECT =====
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('⚠️ Server will continue without database - uploads will fail');
  });

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
  totalGroupQty: Number,
  price: { type: Number, default: 0 },
  stickerPage: { type: Number },
  stickerFileName: { type: String }
});

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  panels: [PanelSchema],
  createdAt: { type: Date, default: Date.now },
  totalPrice: { type: Number, default: 0 },
  stickerCount: { type: Number, default: 0 }
});

ProjectSchema.index({ name: 1 });

const Project = mongoose.model("Project", ProjectSchema);

// ===== SOCKET =====
io.on("connection", () => {
  console.log("⚡ Client Connected");
});

// ===== HELPER FUNCTIONS =====
function normalize(id) {
  return String(id).replace("#", "").trim();
}

function cleanNumber(val) {
  return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

function expandIds(idString) {
  if (!idString) return [];
  return idString.split(',').flatMap(p => {
    p = String(p).replace('#', '').trim();
    if (p.includes('-')) {
      let [s, e] = p.split('-').map(Number);
      if (isNaN(s) || isNaN(e)) return ['#' + p];
      return Array.from({ length: e - s + 1 }, (_, i) => '#' + (s + i));
    }
    return ['#' + p];
  });
}

function getPanelPrice(length, width) {
  const key = `${length}x${width}`;
  const prices = {
    "383x2": 1200,
    "308x308": 1800,
    "422x2": 1600,
    "531x2": 1900,
    "821x2": 2200,
    "106x106": 800,
    "442x442": 2000,
    "478x2": 1750,
    "443x443": 2050,
    "425x425": 1950,
    "2396x2": 2500,
    "1901x2": 2300,
    "1099x2": 2100,
    "833x833": 2800,
    "837x425": 2600,
    "2046x2": 2400,
    "2366x2": 2450
  };
  return prices[key] || 1000;
}

async function splitPDFIntoStickers(pdfPath, panelCount) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    
    const stickerFiles = [];
    const stickersDir = path.join('./uploads', 'stickers');
    
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }

    for (let i = 0; i < Math.min(totalPages, panelCount); i++) {
      const newPdf = await PDFDocument.create();
      const [page] = await newPdf.copyPages(pdfDoc, [i]);
      newPdf.addPage(page);
      
      const bytes = await newPdf.save();
      const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      fs.writeFileSync(filePath, bytes);
      stickerFiles.push(fileName);
    }

    if (panelCount > totalPages) {
      for (let i = totalPages; i < panelCount; i++) {
        const lastPage = totalPages - 1;
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [lastPage]);
        newPdf.addPage(page);
        
        const bytes = await newPdf.save();
        const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
        const filePath = path.join(stickersDir, fileName);
        fs.writeFileSync(filePath, bytes);
        stickerFiles.push(fileName);
      }
    }

    return stickerFiles;
  } catch (error) {
    console.error("PDF Split Error:", error);
    const stickersDir = path.join('./uploads', 'stickers');
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }
    
    const stickerFiles = [];
    for (let i = 0; i < panelCount; i++) {
      const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      const newPdf = await PDFDocument.create();
      newPdf.addPage([200, 200]);
      const bytes = await newPdf.save();
      fs.writeFileSync(filePath, bytes);
      stickerFiles.push(fileName);
    }
    return stickerFiles;
  }
}

// ===== FILE UPLOAD CONFIG =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.csv', '.xlsx', '.xls', '.pdf'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, XLSX, and PDF files are allowed'));
    }
  }
});

// ==========================================
// ROUTES
// ==========================================

// Upload
app.post("/api/upload", upload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  try {
    const { projectName } = req.body;
    
    if (!projectName) {
      return res.status(400).json({ success: false, message: 'Project name required' });
    }

    const excelFile = req.files['excel'] ? req.files['excel'][0] : null;
    const pdfFile = req.files['pdf'] ? req.files['pdf'][0] : null;

    if (!excelFile) {
      return res.status(400).json({ success: false, message: 'Excel/CSV file required' });
    }

    // Process Excel
    const workbook = XLSX.readFile(excelFile.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let headerIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row.length > 0) {
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('panel') || rowStr.includes('part')) {
          headerIndex = i;
          break;
        }
      }
    }

    if (headerIndex === -1) {
      return res.status(400).json({ success: false, message: 'Invalid Excel format - "Panel" column not found' });
    }

    const headers = rows[headerIndex].map(h => String(h).toLowerCase());
    const panelIdx = headers.findIndex(h => h.includes('panel') || h.includes('part'));
    const lengthIdx = headers.findIndex(h => h.includes('length') || h.includes('len'));
    const widthIdx = headers.findIndex(h => h.includes('width') || h.includes('wid'));
    const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity'));

    let panels = [];

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[panelIdx]) continue;

      const panelId = String(row[panelIdx]).trim();
      if (!panelId) continue;

      const ids = expandIds(panelId);
      const length = cleanNumber(row[lengthIdx]);
      const width = cleanNumber(row[widthIdx]);
      const qty = parseInt(cleanNumber(row[qtyIdx])) || 1;

      ids.forEach((id, index) => {
        const price = getPanelPrice(length, width);
        panels.push({
          id: id,
          status: 'pending',
          items: [{
            length: length,
            width: width,
            seq: index + 1
          }],
          totalGroupQty: qty,
          price: price
        });
      });
    }

    if (panels.length === 0) {
      return res.status(400).json({ success: false, message: 'No panels found in Excel file' });
    }

    // Process PDF
    let stickerFiles = [];
    let stickerCount = 0;

    if (pdfFile) {
      try {
        stickerFiles = await splitPDFIntoStickers(pdfFile.path, panels.length);
        stickerCount = stickerFiles.length;
        
        panels.forEach((panel, index) => {
          if (index < stickerFiles.length) {
            panel.stickerFileName = stickerFiles[index];
            panel.stickerPage = index + 1;
          } else {
            const lastIndex = stickerFiles.length - 1;
            panel.stickerFileName = stickerFiles[lastIndex] || null;
            panel.stickerPage = lastIndex + 1;
          }
        });
      } catch (pdfErr) {
        console.error("PDF Processing Error:", pdfErr);
      }
    }

    const totalPrice = panels.reduce((sum, p) => sum + (p.price || 0), 0);

    const project = new Project({
      name: projectName,
      panels: panels,
      totalPrice: totalPrice,
      stickerCount: stickerCount
    });

    await project.save();

    // Cleanup
    try {
      if (excelFile && fs.existsSync(excelFile.path)) fs.unlinkSync(excelFile.path);
      if (pdfFile && fs.existsSync(pdfFile.path)) fs.unlinkSync(pdfFile.path);
    } catch (cleanErr) {
      console.log("Cleanup error:", cleanErr);
    }

    io.emit('refresh');

    res.json({
      success: true,
      project: project,
      message: `Uploaded ${panels.length} panels with ${stickerCount} stickers`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

// Get all projects
app.get("/api/projects", async (req, res) => {
  try {
    const data = await Project.find().sort({ _id: -1 });
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single project
app.get("/api/projects/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    res.json({ success: true, data: project });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update panel status
app.put("/api/projects/:id/status", async (req, res) => {
  try {
    const { panelId, status } = req.body;

    const allowed = ["pending", "cutting", "dispatched"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
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
      return res.json({ success: false, message: "Panel not found" });
    }

    await project.save();
    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Update Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete project
app.delete("/api/projects/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false });
    }

    const stickersDir = path.join('./uploads', 'stickers');
    project.panels.forEach(panel => {
      if (panel.stickerFileName) {
        const stickerPath = path.join(stickersDir, panel.stickerFileName);
        if (fs.existsSync(stickerPath)) fs.unlinkSync(stickerPath);
      }
    });

    await Project.findByIdAndDelete(req.params.id);
    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Delete Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Print all stickers (HTML view)
app.get("/api/projects/:id/print-stickers", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    let html = `
    <!DOCTYPE html>
    <html>
    <head><title>All Stickers - ${project.name}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial;padding:20px;background:#f0f0f0;}
      .header{text-align:center;padding:15px;background:white;border-radius:8px;margin-bottom:20px;}
      .sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;max-width:1200px;margin:0 auto;}
      .sticker{background:white;padding:12px;border:2px solid #333;border-radius:6px;min-height:160px;}
      .sticker-header{font-weight:bold;font-size:14px;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;}
      .sticker-content{font-size:12px;line-height:1.8;}
      .sticker-barcode{text-align:center;font-family:monospace;font-size:18px;letter-spacing:3px;padding:4px;background:#f8f8f8;border-radius:4px;margin-top:8px;}
      .sticker-footer{font-size:9px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:6px;margin-top:8px;}
      @media print{body{background:white;} .sticker{border:1px solid #999;}}
      @media (max-width:768px){.sticker
