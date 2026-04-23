const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* 🔥 MongoDB Connect */
mongoose.connect(process.env.MONGO_URI,{
  useNewUrlParser:true,
  useUnifiedTopology:true
})
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log("❌ DB Error:", err));

/* ================= SCHEMA ================= */

// STAFF
const staffSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  salary: Number,
  createdAt: { type: Date, default: Date.now }
});
const Staff = mongoose.model("Staff", staffSchema);

// ATTENDANCE
const attendanceSchema = new mongoose.Schema({
  staffId: String,
  date: String,
  status: String
});
const Attendance = mongoose.model("Attendance", attendanceSchema);

// LEAVE
const leaveSchema = new mongoose.Schema({
  staffId: String,
  reason: String,
  status: { type: String, default: "pending" }
});
const Leave = mongoose.model("Leave", leaveSchema);

// PAYMENT
const paymentSchema = new mongoose.Schema({
  staffId: String,
  amount: Number,
  status: { type: String, default: "pending" }
});
const Payment = mongoose.model("Payment", paymentSchema);


/* ================= ROUTES ================= */

// TEST
app.get("/", (req,res)=> res.send("Levi API Running 🚀"));

/* STAFF */
app.post("/staff", async (req,res)=>{
  try{
    const data = await Staff.create(req.body);
    res.json({success:true, data});
  }catch(err){
    console.log(err);
    res.status(500).json({success:false, error:err.message});
  }
});

app.get("/staff", async (req,res)=>{
  try{
    const data = await Staff.find();
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false, error:err.message});
  }
});

/* ATTENDANCE */
app.post("/attendance", async (req,res)=>{
  try{
    const data = await Attendance.create(req.body);
    res.json({success:true, data});
  }catch(err){
    res.status(500).json({success:false});
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
    res.status(500).json({success:false});
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
    res.status(500).json({success:false});
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

/* PORT */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 Server running on", PORT));
