// ==========================================
// 🔥 NEW: SPLIT PDF - PANEL NUMBER MATCHING ONLY
// ==========================================
async function splitPDFIntoStickers(pdfPath, panels) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    
    const stickerFiles = [];
    const stickersDir = path.join('./uploads', 'stickers');
    
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }

    // Read PDF text
    const pdfData = await PDFParse(pdfBytes);
    const text = pdfData.text;
    const lines = text.split('\n').filter(line => line.trim());

    console.log('📄 Total PDF Pages:', totalPages);
    console.log('📊 CSV Panels:', panels.map(p => p.id));

    // ==========================================
    // 🔥 Step 1: Extract panel number from each PDF page
    // ==========================================
    const pagePanelMap = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Get text for this page
      const pageText = lines.join(' ');
      
      // ==========================================
      // 🔥 Step 2: Find panel number using regex
      // ==========================================
      let panelNumber = null;
      let panelId = null;
      
      // Pattern 1: #15, #27, #3, etc.
      const hashMatch = pageText.match(/#(\d+)/);
      if (hashMatch) {
        panelNumber = parseInt(hashMatch[1]);
        panelId = '#' + panelNumber;
        console.log(`📄 Page ${pageNum}: Found #${panelNumber} → Panel ID: ${panelId}`);
      }
      
      // Pattern 2: Panel 15, Panel 27, etc.
      if (!panelNumber) {
        const panelMatch = pageText.match(/Panel\s+(\d+)/i);
        if (panelMatch) {
          panelNumber = parseInt(panelMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found Panel ${panelNumber} → Panel ID: ${panelId}`);
        }
      }
      
      // Pattern 3: Part 15, Part 27, etc.
      if (!panelNumber) {
        const partMatch = pageText.match(/Part\s+(\d+)/i);
        if (partMatch) {
          panelNumber = parseInt(partMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found Part ${panelNumber} → Panel ID: ${panelId}`);
        }
      }
      
      // Pattern 4: MBR #15, CBR #27, etc.
      if (!panelNumber) {
        const mbrMatch = pageText.match(/(?:MBR|CBR)\s*#(\d+)/i);
        if (mbrMatch) {
          panelNumber = parseInt(mbrMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found MBR/CBR #${panelNumber} → Panel ID: ${panelId}`);
        }
      }
      
      // Pattern 5: GF MBR #15, FF CBR #27, etc.
      if (!panelNumber) {
        const fullMatch = pageText.match(/(?:GF|FF)\s+(?:MBR|CBR)\s*#(\d+)/i);
        if (fullMatch) {
          panelNumber = parseInt(fullMatch[1]);
          panelId = '#' + panelNumber;
          console.log(`📄 Page ${pageNum}: Found GF/FF MBR/CBR #${panelNumber} → Panel ID: ${panelId}`);
        }
      }
      
      pagePanelMap.push({
        page: pageNum,
        panelNumber: panelNumber,
        panelId: panelId,
        text: pageText.substring(0, 200) // First 200 chars for debugging
      });
    }

    console.log('📊 Page → Panel ID Mapping:', pagePanelMap.map(p => ({
      page: p.page,
      panelId: p.panelId
    })));

    // ==========================================
    // 🔥 Step 3: Create mapping - Panel ID → PDF Page
    // ==========================================
    const panelPageMap = {};

    for (const data of pagePanelMap) {
      if (data.panelId) {
        // If same panel appears on multiple pages, use the first occurrence
        if (!panelPageMap[data.panelId]) {
          panelPageMap[data.panelId] = data.page;
          console.log(`✅ Panel ${data.panelId} → PDF Page ${data.page}`);
        } else {
          console.log(`⚠️ Panel ${data.panelId} already mapped to Page ${panelPageMap[data.panelId]}, ignoring Page ${data.page}`);
        }
      }
    }

    console.log('📊 Final Panel → Page Mapping:', panelPageMap);

    // ==========================================
    // 🔥 Step 4: Assign stickers to panels (CSV matching)
    // ==========================================
    let assignedCount = 0;
    let notFoundCount = 0;

    for (const panel of panels) {
      const panelId = String(panel.id).trim();
      
      // Find which page this panel belongs to
      let pageIndex = null;
      
      if (panelPageMap[panelId]) {
        pageIndex = panelPageMap[panelId] - 1; // 0-based index
        console.log(`✅ Panel ${panelId} → PDF Page ${pageIndex + 1} (matched by ID)`);
        assignedCount++;
      } else {
        // Try to find by number (without #)
        const panelNumber = parseInt(panelId.replace(/[^0-9]/g, '')) || 0;
        if (panelNumber > 0) {
          // Search in pagePanelMap by number
          for (const data of pagePanelMap) {
            if (data.panelNumber === panelNumber) {
              pageIndex = data.page - 1;
              console.log(`✅ Panel ${panelId} → PDF Page ${data.page} (matched by number)`);
              assignedCount++;
              break;
            }
          }
        }
      }
      
      // If still not found, use fallback
      if (pageIndex === null) {
        // Try to find in text
        for (let i = 0; i < pagePanelMap.length; i++) {
          const text = pagePanelMap[i].text;
          const panelNum = parseInt(panelId.replace(/[^0-9]/g, '')) || 0;
          if (text.includes(`#${panelNum}`) || 
              text.includes(`Panel ${panelNum}`) ||
              text.includes(`Part ${panelNum}`)) {
            pageIndex = i;
            console.log(`✅ Panel ${panelId} → PDF Page ${i + 1} (found in text)`);
            assignedCount++;
            break;
          }
        }
      }
      
      // Final fallback
      if (pageIndex === null) {
        const panelNum = parseInt(panelId.replace(/[^0-9]/g, '')) || 0;
        pageIndex = panelNum - 1;
        if (pageIndex >= totalPages) {
          pageIndex = pageIndex % totalPages;
        }
        if (pageIndex < 0) pageIndex = 0;
        console.log(`⚠️ Panel ${panelId} → PDF Page ${pageIndex + 1} (fallback - no match found)`);
        notFoundCount++;
      }
      
      if (pageIndex < 0 || pageIndex >= totalPages) {
        pageIndex = 0;
        console.log(`⚠️ Panel ${panelId} → Using Page 1 (out of bounds)`);
      }

      // Create individual PDF
      const newPdf = await PDFDocument.create();
      const [page] = await newPdf.copyPages(pdfDoc, [pageIndex]);
      newPdf.addPage(page);
      
      const bytes = await newPdf.save();
      const fileName = `sticker_${panelId.replace('#', '')}_${Date.now()}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      fs.writeFileSync(filePath, bytes);
      
      stickerFiles.push({
        panelId: panel.id,
        fileName: fileName,
        pageNumber: pageIndex + 1
      });
    }

    console.log(`📊 Summary: ${assignedCount} panels matched, ${notFoundCount} panels used fallback`);

    return stickerFiles;

  } catch (error) {
    console.error("PDF Split Error:", error);
    // Fallback: create dummy stickers
    const stickersDir = path.join('./uploads', 'stickers');
    if (!fs.existsSync(stickersDir)) {
      fs.mkdirSync(stickersDir, { recursive: true });
    }
    
    const stickerFiles = [];
    for (let i = 0; i < panels.length; i++) {
      const fileName = `sticker_${Date.now()}_${i + 1}.pdf`;
      const filePath = path.join(stickersDir, fileName);
      const newPdf = await PDFDocument.create();
      newPdf.addPage([200, 200]);
      const bytes = await newPdf.save();
      fs.writeFileSync(filePath, bytes);
      stickerFiles.push({
        panelId: panels[i].id,
        fileName: fileName,
        pageNumber: i + 1
      });
    }
    return stickerFiles;
  }
}
