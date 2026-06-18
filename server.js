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
    "2366x2": 2450,
    "2400x110": 1500,
    "2400x2": 2400,
    "2009x2": 2000
  };
  return prices[key] || 1000;
}

// ===== IMPROVED PDF SPLITTING =====
function printSingleSticker(panelId){
 const id=document.getElementById("projectSelect").value;

 window.open(
   API+"/api/projects/"
   +id+
   "/print-sticker/"
   +panelId,
   "_blank"
 );
}

    // If PDF has multiple pages, each page is a sticker
    if (totalPages >= panelCount) {
      console.log(`📄 Using first ${panelCount} pages as stickers`);
      for (let i = 0; i < Math.min(totalPages, panelCount); i++) {
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [i]);
        newPdf.addPage(page);
        
        const bytes = await newPdf.save();
        const fileName = `sticker_${Date.now()}_${String(i + 1).padStart(3, '0')}.pdf`;
        const filePath = path.join(stickersDir, fileName);
        fs.writeFileSync(filePath, bytes);
        stickerFiles.push(fileName);
        console.log(`✅ Created sticker ${i + 1}: ${fileName}`);
      }
    } else {
      // If less pages than panels, duplicate pages sequentially
      console.log(`📄 Less pages (${totalPages}) than panels (${panelCount}), duplicating pages`);
      for (let i = 0; i < panelCount; i++) {
        const pageIndex = i % totalPages;
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
        newPdf.addPage(page);
        
        const bytes = await newPdf.save();
        const fileName = `sticker_${Date.now()}_${String(i + 1).padStart(3, '0')}.pdf`;
        const filePath = path.join(stickersDir, fileName);
        fs.writeFileSync(filePath, bytes);
        stickerFiles.push(fileName);
        console.log(`✅ Created sticker ${i + 1} (from page ${pageIndex + 1}): ${fileName}`);
      }
    }

    console.log(`✅ Successfully created ${stickerFiles.length} stickers`);
    return stickerFiles;

  } catch (error) {
    console.error("❌ PDF Split Error:", error);
    // Create dummy stickers if splitting fails
    console.log("⚠️ Creating dummy stickers as fallback");
    const stickersDir = path.join('./uploads', 'stickers');
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }
    
    const stickerFiles = [];
    for (let i = 0; i < panelCount; i++) {
      const fileName = `sticker_${Date.now()}_${String(i + 1).padStart(3, '0')}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      const newPdf = await PDFDocument.create();
      const page = newPdf.addPage([400, 300]);
      const { width, height } = page.getSize();
      page.drawText(`Panel ${i + 1}`, {
        x: 50,
        y: height / 2,
        size: 30,
      });
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

// ============================================
// ===== ROUTES =====
// ============================================

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

    console.log(`📊 Processing Excel: ${excelFile.originalname}`);
    if (pdfFile) {
      console.log(`📄 Processing PDF: ${pdfFile.originalname}`);
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

    console.log(`📊 Found ${panels.length} panels`);

    // ===== PROCESS PDF AND SPLIT INTO INDIVIDUAL STICKERS =====
    let stickerFiles = [];
    let stickerCount = 0;

    if (pdfFile) {
      try {
        console.log(`📄 Splitting PDF into ${panels.length} stickers...`);
        stickerFiles = await splitPDFIntoStickers(pdfFile.path, panels.length);
        stickerCount = stickerFiles.length;
        
        // Assign each sticker to a panel
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
        
        console.log(`✅ Assigned ${stickerCount} stickers to ${panels.length} panels`);
      } catch (pdfErr) {
        console.error("❌ PDF Processing Error:", pdfErr);
        // Create dummy stickers
        const stickersDir = path.join('./uploads', 'stickers');
        if (!fs.existsSync(stickersDir)) {
          fs.mkdirSync(stickersDir, { recursive: true });
        }
        
        for (let i = 0; i < panels.length; i++) {
          const fileName = `sticker_${Date.now()}_${String(i + 1).padStart(3, '0')}.pdf`;
          const filePath = path.join(stickersDir, fileName);
          const newPdf = await PDFDocument.create();
          const page = newPdf.addPage([400, 300]);
          const { width, height } = page.getSize();
          page.drawText(`Panel ${panels[i].id}`, {
            x: 50,
            y: height / 2,
            size: 30,
          });
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
    console.log(`✅ Project saved: ${projectName} with ${panels.length} panels`);

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
    console.error('❌ Upload error:', error);
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

// ============================================
// ===== STICKER ROUTES =====
// ============================================

// 🔹 GET INDIVIDUAL STICKER PDF
app.get("/api/projects/:id/sticker/:panelId", async (req, res) => {
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

    if (!panel.stickerFileName) {
      return res.status(404).json({ success: false, message: 'No sticker assigned to this panel' });
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

// 🔹 PRINT INDIVIDUAL STICKER HTML
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

    const item = panel.items && panel.items[0] ? panel.items[0] : { length: 0, width: 0 };
    
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
          padding: 20px;
        }
        .sticker {
          background: white;
          padding: 30px;
          border: 3px solid #333;
          border-radius: 8px;
          width: 380px;
          max-width: 100%;
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
          font-size: 28px;
          letter-spacing: 5px;
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
        .sticker .project-name { font-size: 12px; color: #666; text-align: center; margin-bottom: 8px; }
        .sticker .dimension { font-size: 16px; }
        @media print {
          body { background: white; padding: 0; }
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
          };color:white;">${panel.status || 'PENDING'}</span>
        </div>
        <div class="project-name">${project.name}</div>
        <div class="sticker-content">
          <div><span class="label">Dimensions:</span> <span class="value dimension">${item.length || 0} × ${item.width || 0} mm</span></div>
          <div><span class="label">Quantity:</span> <span class="value">${panel.totalGroupQty || 1}</span></div>
          <div><span class="label">Price:</span> <span class="value price">₹${panel.price || 0}</span></div>
          <div><span class="label">Date:</span> <span class="value">${new Date().toLocaleDateString('en-IN')}</span></div>
        </div>
        <div class="sticker-barcode">${panel.id.replace('#', '')}</div>
        <div class="sticker-footer">${project.name} | Panel ${panel.id}</div>
      </div>
      <script>
        setTimeout(() => { window.print(); }, 500);
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

// 🔹 PRINT ALL STICKERS HTML
app.get("/api/projects/:id/print-stickers", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const highlight = req.query.highlight || '';

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Stickers - ${project.name}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: Arial, Helvetica, sans-serif; 
          padding: 20px; 
          background: #f0f0f0;
        }
        .header {
          text-align: center;
          padding: 15px;
          background: white;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 { font-size: 20px; color: #1a1a2e; }
        .header p { color: #666; font-size: 14px; margin-top: 4px; }
        .sticker-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .sticker {
          background: white;
          padding: 12px;
          border: 2px solid #333;
          border-radius: 6px;
          page-break-inside: avoid;
          min-height: 160px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .sticker.highlight {
          border-color: #8b5cf6;
          background: #faf5ff;
        }
        .sticker-header {
          font-weight: bold;
          font-size: 14px;
          border-bottom: 2px solid #333;
          padding-bottom: 6px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .sticker-header .id { font-size: 16px; }
        .sticker-header .status {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 10px;
          color: white;
          text-transform: uppercase;
        }
        .sticker-content { font-size: 12px; line-height: 1.6; }
        .sticker-content div { margin: 2px 0; }
        .sticker-content .label { color: #666; }
        .sticker-content .value { font-weight: bold; color: #1a1a2e; }
        .sticker-barcode {
          margin-top: 8px;
          text-align: center;
          font-family: 'Courier New', monospace;
          font-size: 18px;
          letter-spacing: 3px;
          padding: 4px;
          background: #f8f8f8;
          border-radius: 4px;
        }
        .sticker-footer {
          margin-top: 8px;
          font-size: 9px;
          color: #999;
          text-align: center;
          border-top: 1px solid #eee;
          padding-top: 6px;
        }
        .sticker .price { color: #22c55e; font-weight: bold; }
        @media print {
          body { background: white; padding: 10px; }
          .header { box-shadow: none; border: 1px solid #ddd; }
          .sticker { border: 1px solid #999; box-shadow: none; }
          .sticker-grid { gap: 10px; }
        }
        @media (max-width: 768px) {
          .sticker-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .sticker-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 ${project.name}</h1>
        <p>Total Panels: ${project.panels.length} | Total Price: ₹${project.totalPrice || 0}</p>
      </div>
      <div class="sticker-grid">
    `;

    project.panels.forEach((panel) => {
      const item = panel.items && panel.items[0] ? panel.items[0] : { length: 0, width: 0 };
      const isHighlight = highlight && panel.id.includes(highlight);
      
      const statusColors = {
        'pending': '#f59e0b',
        'cutting': '#3b82f6',
        'dispatched': '#10b981'
      };
      
      html += `
        <div class="sticker${isHighlight ? ' highlight' : ''}">
          <div class="sticker-header">
            <span class="id">${panel.id}</span>
            <span class="status" style="background:${statusColors[panel.status] || '#f59e0b'}">${panel.status || 'PENDING'}</span>
          </div>
          <div class="sticker-content">
            <div><span class="label">Dimensions:</span> <span class="value">${item.length || 0} × ${item.width || 0} mm</span></div>
            <div><span class="label">Quantity:</span> <span class="value">${panel.totalGroupQty || 1}</span></div>
            <div><span class="label">Price:</span> <span class="value price">₹${panel.price || 0}</span></div>
          </div>
          <div class="sticker-barcode">${panel.id.replace('#', '')}</div>
          <div class="sticker-footer">${project.name} | ${new Date().toLocaleDateString('en-IN')}</div>
        </div>
      `;
    });

    html += `
      </div>
      <script>
        setTimeout(() => { window.print(); }, 1000);
      </script>
    </body>
    </html>
    `;

    res.send(html);

  } catch (error) {
    console.error('Print stickers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===== START SERVER =====
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
