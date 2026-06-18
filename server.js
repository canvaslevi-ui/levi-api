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
  totalGroupQty: Number,
  price: { type: Number, default: 0 },
  stickerPage: { type: Number },
  stickerFileName: { type: String } // Individual sticker file name
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

// ===== PANEL PRICE MAPPING =====
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

// ===== SPLIT PDF INTO INDIVIDUAL STICKERS =====
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

    // If PDF has multiple pages, each page is a sticker
    // If PDF has 1 page, we need to split it into individual stickers
    if (totalPages >= panelCount) {
      // Each page is a sticker
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
    } else {
      // 1 page PDF with multiple stickers - need to detect and split
      // For now, if less pages than panels, duplicate the pages
      for (let i = 0; i < panelCount; i++) {
        const pageIndex = i % totalPages;
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
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
    // If splitting fails, create dummy stickers
    const stickersDir = path.join('./uploads', 'stickers');
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }
    
    const stickerFiles = [];
    for (let i = 0; i < panelCount; i++) {
      const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      // Create empty PDF
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

// ===== ROUTES =====

// 🔹 UPLOAD PROJECT WITH STICKER SPLITTING
app.post("/api/upload", upload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async (req, res) => {
  try {
    const { projectName } = req.body;
    
    if (!projectName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Project name required' 
      });
    }

    const excelFile = req.files['excel'] ? req.files['excel'][0] : null;
    const pdfFile = req.files['pdf'] ? req.files['pdf'][0] : null;

    if (!excelFile) {
      return res.status(400).json({ 
        success: false, 
        message: 'Excel/CSV file required' 
      });
    }

    // ===== PROCESS EXCEL =====
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
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Excel format - "Panel" column not found' 
      });
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
      return res.status(400).json({
        success: false,
        message: 'No panels found in Excel file'
      });
    }

    // ===== PROCESS PDF AND SPLIT INTO INDIVIDUAL STICKERS =====
    let stickerFiles = [];
    let stickerCount = 0;

    if (pdfFile) {
      try {
        // Split PDF into individual stickers - one per panel
        stickerFiles = await splitPDFIntoStickers(pdfFile.path, panels.length);
        stickerCount = stickerFiles.length;
        
        // Assign each sticker to a panel
        panels.forEach((panel, index) => {
          if (index < stickerFiles.length) {
            panel.stickerFileName = stickerFiles[index];
            panel.stickerPage = index + 1;
          } else {
            // If more panels than stickers, use the last sticker
            const lastIndex = stickerFiles.length - 1;
            panel.stickerFileName = stickerFiles[lastIndex] || null;
            panel.stickerPage = lastIndex + 1;
          }
        });
      } catch (pdfErr) {
        console.error("PDF Processing Error:", pdfErr);
        // If PDF processing fails, create dummy stickers
        const stickersDir = path.join('./uploads', 'stickers');
        if (!fs.existsSync(stickersDir)) {
          fs.mkdirSync(stickersDir, { recursive: true });
        }
        
        for (let i = 0; i < panels.length; i++) {
          const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
          const filePath = path.join(stickersDir, fileName);
          // Create empty PDF
          const { PDFDocument } = require('pdf-lib');
          const newPdf = await PDFDocument.create();
          newPdf.addPage([200, 200]);
          const bytes = await newPdf.save();
          fs.writeFileSync(filePath, bytes);
          stickerFiles.push(fileName);
          panels[i].stickerFileName = fileName;
          panels[i].stickerPage = i + 1;
        }
        stickerCount = stickerFiles.length;
      }
    }

    // Calculate total price
    const totalPrice = panels.reduce((sum, p) => sum + (p.price || 0), 0);

    // ===== CREATE PROJECT =====
    const project = new Project({
      name: projectName,
      panels: panels,
      totalPrice: totalPrice,
      stickerCount: stickerCount
    });

    await project.save();

    // Clean up uploaded files
    try {
      if (excelFile && fs.existsSync(excelFile.path)) {
        fs.unlinkSync(excelFile.path);
      }
      if (pdfFile && fs.existsSync(pdfFile.path)) {
        fs.unlinkSync(pdfFile.path);
      }
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
    // Clean up files on error
    try {
      if (req.files) {
        Object.keys(req.files).forEach(key => {
          req.files[key].forEach(file => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        });
      }
    } catch (e) {}
    
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Upload failed' 
    });
  }
});

// 🔹 GET ALL PROJECTS
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

// 🔹 GET SINGLE PROJECT
app.get("/api/projects/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }
    res.json({
      success: true,
      data: project
    });
  } catch (err) {
    console.log("❌ Fetch Error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔹 UPDATE PANEL STATUS
app.put("/api/projects/:id/status", async (req, res) => {
  try {
    const { panelId, status } = req.body;

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
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false });
    }

    // Delete sticker files
    const stickersDir = path.join('./uploads', 'stickers');
    project.panels.forEach(panel => {
      if (panel.stickerFileName) {
        const stickerPath = path.join(stickersDir, panel.stickerFileName);
        if (fs.existsSync(stickerPath)) {
          fs.unlinkSync(stickerPath);
        }
      }
    });

    await Project.findByIdAndDelete(req.params.id);
    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.log("❌ Delete Error:", err);
    res.status(500).json({ success: false });
  }
});

// 🔹 GET INDIVIDUAL STICKER
app.get("/api/sticker/:projectId/:panelId", async (req, res) => {
  try {
    const { projectId, panelId } = req.params;
    const project = await Project.findById(projectId);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const panel = project.panels.find(p => normalize(p.id) === normalize(panelId));
    if (!panel || !panel.stickerFileName) {
      return res.status(404).json({ success: false, message: 'Sticker not found' });
    }

    const stickerPath = path.join('./uploads', 'stickers', panel.stickerFileName);
    if (!fs.existsSync(stickerPath)) {
      return res.status(404).json({ success: false, message: 'Sticker file not found' });
    }

    res.sendFile(path.resolve(stickerPath));
  } catch (error) {
    console.error('Sticker fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🔹 PRINT INDIVIDUAL STICKER
app.get("/api/projects/:id/print-sticker/:panelId", async (req, res) => {
  try {
    const { id, panelId } = req.params;
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const panel = project.panels.find(p => normalize(p.id) === normalize(panelId));
    if (!panel) {
      return res.status(404).json({ success: false, message: 'Panel not found' });
    }

    const item = panel.items[0];
    
    // Generate single sticker HTML
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sticker - ${panel.id}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: #f0f0f0;
          font-family: Arial, sans-serif;
        }
        .sticker {
          background: white;
          padding: 30px;
          border: 3px solid #333;
          border-radius: 8px;
          width: 350px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .sticker-header {
          font-weight: bold;
          font-size: 18px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sticker-header .id { font-size: 20px; color: #1a1a2e; }
        .sticker-content { font-size: 14px; line-height: 2; }
        .sticker-content .label { color: #666; }
        .sticker-content .value { font-weight: bold; color: #1a1a2e; }
        .sticker-barcode {
          margin: 12px 0;
          text-align: center;
          font-family: 'Courier New', monospace;
          font-size: 22px;
          letter-spacing: 4px;
          padding: 8px;
          background: #f8f8f8;
          border-radius: 4px;
        }
        .sticker-footer {
          margin-top: 12px;
          font-size: 11px;
          color: #999;
          text-align: center;
          border-top: 1px solid #eee;
          padding-top: 8px;
        }
        .sticker .price { color: #22c55e; font-weight: bold; font-size: 16px; }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: bold;
          text-transform: uppercase;
        }
        @media print {
          body { background: white; }
          .sticker { border: 2px solid #999; box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="sticker">
        <div class="sticker-header">
          <span class="id">${panel.id}</span>
          <span class="status-badge" style="background:${
            panel.status === 'pending' ? '#f59e0b' :
            panel.status === 'cutting' ? '#3b82f6' : '#10b981'
          };color:white;">${panel.status}</span>
        </div>
        <div class="sticker-content">
          <div><span class="label">Dimensions:</span> <span class="value">${item.length} × ${item.width} mm</span></div>
          <div><span class="label">Quantity:</span> <span class="value">${panel.totalGroupQty || 1}</span></div>
          <div><span class="label">Price:</span> <span class="value price">₹${panel.price || 0}</span></div>
          <div><span class="label">Project:</span> <span class="value">${project.name}</span></div>
        </div>
        <div class="sticker-barcode">${panel.id.replace('#', '')}</div>
        <div class="sticker-footer">${project.name} | ${new Date().toLocaleDateString('en-IN')}</div>
      </div>
      <script>
        setTimeout(() => window.print(), 500);
      </script>
    </body>
    </html>
    `;

    res.send(html);

  } catch (error) {
    console.error('Print sticker error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== START SERVER =====
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
