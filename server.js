const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* 🔥 MongoDB Connect */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB Connected"))
.catch(err=>{
  console.log("DB Error:", err);
  process.exit(1);
});

/* ================== SCHEMAS ================== */

// STAFF
const staffSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  salary: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Staff = mongoose.model("Staff", staffSchema);

// ATTENDANCE
const attendanceSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  date: { type: String, required: true },
  status: { type: String, required: true }
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

// LEAVE
const leaveSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  reason: { type: String, required: true },
  status: { type: String, default: "pending" }
});
const Leave = mongoose.model("Leave", leaveSchema);

// PAYMENT
const paymentSchema = new mongoose.Schema({
  staffId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "pending" }
});
const Payment = mongoose.model("Payment", paymentSchema);


/* ================== ROUTES ================== */

// TEST
app.get("/", (req,res)=> res.send("Levi API Pro Running 🚀"));

/* STAFF */
app.post("/staff", async (req,res)=>{
  try{
    const data = await Staff.create(req.body);
    res.json({success:true, data});
  }catch(err){
    res.status(400).json({success:false, error:err.message});
  }
});

app.get("/staff", async (req,res)=>{
  try{
    const data = await Staff.find();
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false});
  }
});

app.delete("/staff/:id", async (req,res)=>{
  try{
    await Staff.findByIdAndDelete(req.params.id);
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false});
  }
});


/* ATTENDANCE */
app.post("/attendance", async (req,res)=>{
  try{
    const data = await Attendance.create(req.body);
    res.json({success:true, data});
  }catch(err){
    res.status(400).json({success:false, error:err.message});
  }
});

app.get("/attendance", async (req,res)=>{
  try{
    const data = await Attendance.find();
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false});
  }
});


/* LEAVE */
app.post("/leave", async (req,res)=>{
  try{
    const data = await Leave.create(req.body);
    res.json({success:true, data});
  }catch(err){
    res.status(400).json({success:false});
  }
});

app.get("/leave", async (req,res)=>{
  try{
    const data = await Leave.find();
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false});
  }
});

app.put("/leave/:id", async (req,res)=>{
  try{
    await Leave.findByIdAndUpdate(req.params.id, req.body);
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false});
  }
});


/* PAYMENT */
app.post("/payment", async (req,res)=>{
  try{
    const data = await Payment.create(req.body);
    res.json({success:true, data});
  }catch(err){
    res.status(400).json({success:false});
  }
});

app.get("/payment", async (req,res)=>{
  try{
    const data = await Payment.find();
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false});
  }
});

app.put("/payment/:id", async (req,res)=>{
  try{
    await Payment.findByIdAndUpdate(req.params.id, req.body);
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false});
  }
});


/* 🔌 PORT */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
