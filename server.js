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

console.log('📡 Server starting on port:', PORT);

// ===== DB CONNECT =====
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
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
  price: { type: Number, default: 0 }
});

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  panels: [PanelSchema],
  createdAt: { type: Date, default: Date.now },
  totalPrice: { type: Number, default: 0 },
  stickerCount: { type: Number, default: 0 },
  // ==========================================
  // 🔥 NEW: Store panel → page mapping
  // ==========================================
  panelPageMap: { type: Map, of: Number, default: {} },
  stickerPDFPath: { type: String } // Path to original PDF
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

// ==========================================
// 🔥 NEW: OCR - Extract panel numbers from PDF
// ==========================================
async function extractPanelNumbersFromPDF(pdfPath) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfData = await PDFParse(pdfBytes);
    const text = pdfData.text;
    const lines = text.split('\n').filter(line => line.trim());
    const totalPages = pdfData.numpages;

    console.log('📄 Total PDF Pages:', totalPages);
    console.log('🔍 Running OCR to extract panel numbers...');

    const panelPageMap = {};

    // ==========================================
    // 🔥 Extract panel number from each page
    // ==========================================
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageText = lines.join(' ');
      
      let panelNumber = null;
      let panelId = null;
      
      // Pattern 1: #15, #27, #3, etc.
      const hashMatch = pageText.match(/#(\d+)/);
      if (hashMatch) {
        panelNumber = parseInt(hashMatch[1]);
        panelId = '#' + panelNumber;
        console.log(`📄 Page ${pageNum}: Found #${panelNumber}`);
      }
      
      // Pattern 2: Panel 15, Panel 27, etc.
      if (!panelNumber) {
        const panelMatch = pageText.match(/Panel\s+(\d+)/i);
        if (panelMatch) {
          panelNumber = parseInt(panelMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found Panel ${panelNumber}`);
        }
      }
      
      // Pattern 3: Part 15, Part 27, etc.
      if (!panelNumber) {
        const partMatch = pageText.match(/Part\s+(\d+)/i);
        if (partMatch) {
          panelNumber = parseInt(partMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found Part ${panelNumber}`);
        }
      }
      
      // Pattern 4: MBR #15, CBR #27, etc.
      if (!panelNumber) {
        const mbrMatch = pageText.match(/(?:MBR|CBR)\s*#(\d+)/i);
        if (mbrMatch) {
          panelNumber = parseInt(mbrMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found MBR/CBR #${panelNumber}`);
        }
      }
      
      // Pattern 5: GF MBR #15, FF CBR #27, etc.
      if (!panelNumber) {
        const fullMatch = pageText.match(/(?:GF|FF)\s+(?:MBR|CBR)\s*#(\d+)/i);
        if (fullMatch) {
          panelNumber = parseInt(fullMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found GF/FF MBR/CBR #${panelNumber}`);
        }
      }
      
      // If panel found, store mapping
      if (panelId) {
        // If same panel appears on multiple pages, use first occurrence
        if (!panelPageMap[panelId]) {
          panelPageMap[panelId] = pageNum;
        } else {
          console.log(`⚠️ Panel ${panelId} already mapped to Page ${panelPageMap[panelId]}, ignoring Page ${pageNum}`);
        }
      }
    }

    console.log('📊 Panel → Page Mapping:', panelPageMap);
    return panelPageMap;

  } catch (error) {
    console.error('OCR Error:', error);
    return {};
  }
}

// ==========================================
// 🔥 NEW: Get PDF page as response
// ==========================================
async function getPDFPage(pdfPath, pageNumber) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    
    // Validate page number
    if (pageNumber < 1 || pageNumber > totalPages) {
      pageNumber = 1;
    }
    
    // Create new PDF with only the requested page
    const newPdf = await PDFDocument.create();
    const [page] = await newPdf.copyPages(pdfDoc, [pageNumber - 1]);
    newPdf.addPage(page);
    
    return await newPdf.save();
  } catch (error) {
    console.error('Get PDF Page Error:', error);
    return null;
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

// ==========================================
// 🔥 UPLOAD - OCR runs ONCE here
// ==========================================
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

    // ==========================================
    // 🔥 OCR: Run ONCE during upload
    // ==========================================
    let panelPageMap = {};
    let stickerPDFPath = null;

    if (pdfFile) {
      try {
        // Save PDF file
        const pdfFileName = `sticker_${Date.now()}.pdf`;
        const pdfSavePath = path.join('./uploads', pdfFileName);
        fs.copyFileSync(pdfFile.path, pdfSavePath);
        stickerPDFPath = pdfSavePath;

        // Run OCR to extract panel numbers
        console.log('🔍 Running OCR on PDF...');
        panelPageMap = await extractPanelNumbersFromPDF(pdfFile.path);
        console.log('✅ OCR Complete. Found', Object.keys(panelPageMap).length, 'panel mappings');

        // Clean up temp file
        if (fs.existsSync(pdfFile.path)) {
          fs.unlinkSync(pdfFile.path);
        }
      } catch (pdfErr) {
        console.error("PDF Processing Error:", pdfErr);
        if (fs.existsSync(pdfFile.path)) {
          fs.unlinkSync(pdfFile.path);
        }
      }
    }

    const totalPrice = panels.reduce((sum, p) => sum + (p.price || 0), 0);

    // ==========================================
    // 🔥 Save project with panelPageMap
    // ==========================================
    const project = new Project({
      name: projectName,
      panels: panels,
      totalPrice: totalPrice,
      stickerCount: Object.keys(panelPageMap).length,
      panelPageMap: panelPageMap,
      stickerPDFPath: stickerPDFPath
    });

    await project.save();

    // Cleanup uploaded files
    try {
      if (excelFile && fs.existsSync(excelFile.path)) {
        fs.unlinkSync(excelFile.path);
      }
    } catch (cleanErr) {
      console.log("Cleanup error:", cleanErr);
    }

    io.emit('refresh');

    res.json({
      success: true,
      project: project,
      message: `Uploaded ${panels.length} panels with ${Object.keys(panelPageMap).length} sticker mappings`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Upload failed' 
    });
  }
});

// ==========================================
// GET ALL PROJECTS
// ==========================================
app.get("/api/projects", async (req, res) => {
  try {
    const data = await Project.find().sort({ _id: -1 });
    res.json({ success: true, data });
  } catch (err) {
    console.error("❌ Fetch Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// GET SINGLE PROJECT
// ==========================================
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

// ==========================================
// UPDATE PANEL STATUS
// ==========================================
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

// ==========================================
// DELETE PROJECT
// ==========================================
app.delete("/api/projects/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false });
    }

    // Delete sticker PDF if exists
    if (project.stickerPDFPath && fs.existsSync(project.stickerPDFPath)) {
      fs.unlinkSync(project.stickerPDFPath);
    }

    await Project.findByIdAndDelete(req.params.id);
    io.emit("refresh");

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Delete Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 🔥 GET STICKER - INSTANT (No OCR, No Split)
// ==========================================
app.get("/api/projects/:id/sticker/:panelNumber", async (req, res) => {
  try {
    const { id, panelNumber } = req.params;
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Check if panelPageMap exists
    if (!project.panelPageMap || Object.keys(project.panelPageMap).length === 0) {
      return res.status(404).json({ success: false, message: 'No sticker mapping found for this project' });
    }

    // Get panel ID with #
    const panelId = '#' + panelNumber;
    
    // Get page number from mapping
    const pageNumber = project.panelPageMap[panelId];
    
    if (!pageNumber) {
      return res.status(404).json({ 
        success: false, 
        message: `Panel ${panelId} not found in sticker mapping`,
        availablePanels: Object.keys(project.panelPageMap)
      });
    }

    // Check if PDF exists
    if (!project.stickerPDFPath || !fs.existsSync(project.stickerPDFPath)) {
      return res.status(404).json({ success: false, message: 'Sticker PDF file not found' });
    }

    console.log(`📄 Panel ${panelId} → PDF Page ${pageNumber}`);

    // ==========================================
    // 🔥 Get only the requested page
    // ==========================================
    const pdfBytes = await getPDFPage(project.stickerPDFPath, pageNumber);
    
    if (!pdfBytes) {
      return res.status(500).json({ success: false, message: 'Failed to extract PDF page' });
    }

    // Send PDF page
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="sticker_${panelId}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(pdfBytes);

  } catch (error) {
    console.error('Sticker fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 🔥 PRINT ALL STICKERS - HTML VIEW (Using mapping)
// ==========================================
app.get("/api/projects/:id/print-stickers", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>All Stickers - ${project.name}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:Arial,Helvetica,sans-serif;padding:20px;background:#f0f0f0;}
        .header{text-align:center;padding:15px;background:white;border-radius:8px;margin-bottom:20px;box-shadow:0 2px 4px rgba(0,0,0,0.1);}
        .header h1{font-size:20px;color:#1a1a2e;}
        .header p{color:#666;font-size:14px;margin-top:4px;}
        .sticker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px;max-width:1200px;margin:0 auto;}
        .sticker{background:white;padding:12px;border:2px solid #333;border-radius:6px;page-break-inside:avoid;min-height:160px;box-shadow:0 2px 4px rgba(0,0,0,0.05);}
        .sticker-header{font-weight:bold;font-size:14px;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;}
        .sticker-header .id{font-size:16px;}
        .sticker-header .status{font-size:10px;padding:2px 8px;border-radius:10px;background:#e5e5e5;text-transform:uppercase;}
        .sticker-content{font-size:12px;line-height:1.8;}
        .sticker-content .label{color:#666;}
        .sticker-content .value{font-weight:bold;color:#1a1a2e;}
        .sticker-barcode{margin-top:8px;text-align:center;font-family:'Courier New',monospace;font-size:18px;letter-spacing:3px;padding:4px;background:#f8f8f8;border-radius:4px;}
        .sticker-footer{margin-top:8px;font-size:9px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:6px;}
        .sticker .price{color:#22c55e;font-weight:bold;}
        .sticker .page-info{color:#3b82f6;font-weight:bold;}
        @media print{body{background:white;padding:10px;} .sticker{border:1px solid #999;box-shadow:none;} .sticker-grid{gap:10px;}}
        @media (max-width:768px){.sticker-grid{grid-template-columns:repeat(2,1fr);}}
        @media (max-width:480px){.sticker-grid{grid-template-columns:1fr;}}
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 ${project.name}</h1>
        <p>Total Panels: ${project.panels.length} | Total Price: ₹${project.totalPrice.toLocaleString()} | Stickers: ${project.stickerCount || 0}</p>
      </div>
      <div class="sticker-grid">
    `;

    // Sort panels by ID number
    const sortedPanels = [...project.panels].sort((a, b) => {
      const numA = parseInt(String(a.id).replace(/[^0-9]/g, '')) || 0;
      const numB = parseInt(String(b.id).replace(/[^0-9]/g, '')) || 0;
      return numA - numB;
    });

    sortedPanels.forEach(panel => {
      const item = panel.items[0];
      const statusColors = {
        pending: '#f59e0b',
        cutting: '#3b82f6',
        dispatched: '#10b981'
      };
      
      const pageNumber = project.panelPageMap ? project.panelPageMap[panel.id] || 'N/A' : 'N/A';
      
      html += `
        <div class="sticker">
          <div class="sticker-header">
            <span class="id">${panel.id}</span>
            <span class="status" style="background:${statusColors[panel.status] || '#999'};color:white;">${panel.status}</span>
          </div>
          <div class="sticker-content">
            <div><span class="label">Dimensions:</span> <span class="value">${item.length} × ${item.width} mm</span></div>
            <div><span class="label">Quantity:</span> <span class="value">${panel.totalGroupQty || 1}</span></div>
            <div><span class="label">Price:</span> <span class="value price">₹${panel.price || 0}</span></div>
            <div><span class="label">PDF Page:</span> <span class="value page-info">${pageNumber}</span></div>
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
    console.error('Print all error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
});
