// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* =========================
   CONFIG
========================= */
const PORT = 3000;
const ADMIN_USER = "levi";
const ADMIN_PASS = "7888";

/* =========================
   MONGODB CONNECT
========================= */
mongoose.connect("mongodb://127.0.0.1:27017/leviinteriors")
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err));

/* =========================
   SCHEMAS
========================= */
const StaffSchema = new mongoose.Schema({
  name:String,
  mobile:String,
  salary:Number
},{timestamps:true});

const AttendanceSchema = new mongoose.Schema({
  staffId:String,
  name:String,
  date:String,
  checkIn:String,
  checkOut:String,
  location:String
},{timestamps:true});

const LeaveSchema = new mongoose.Schema({
  staffId:String,
  name:String,
  from:String,
  to:String,
  reason:String,
  status:{type:String,default:"pending"}
},{timestamps:true});

const PaymentSchema = new mongoose.Schema({
  staffId:String,
  name:String,
  amount:Number,
  reason:String,
  status:{type:String,default:"pending"}
},{timestamps:true});

const Staff = mongoose.model("Staff", StaffSchema);
const Attendance = mongoose.model("Attendance", AttendanceSchema);
const Leave = mongoose.model("Leave", LeaveSchema);
const Payment = mongoose.model("Payment", PaymentSchema);

/* =========================
   ADMIN LOGIN
========================= */
app.post("/api/login",(req,res)=>{
  const {username,password}=req.body;

  if(username===ADMIN_USER && password===ADMIN_PASS){
    return res.json({success:true});
  }

  res.json({success:false,message:"Invalid Login"});
});

/* =========================
   DASHBOARD
========================= */
app.get("/api/dashboard", async(req,res)=>{
  const totalStaff = await Staff.countDocuments();
  const pendingLeave = await Leave.countDocuments({status:"pending"});
  const pendingPayment = await Payment.countDocuments({status:"pending"});
  const today = new Date().toISOString().split("T")[0];
  const present = await Attendance.countDocuments({date:today});

  res.json({
    totalStaff,
    present,
    pendingLeave,
    pendingPayment
  });
});

/* =========================
   STAFF CRUD
========================= */
app.get("/api/staff", async(req,res)=>{
  const data = await Staff.find().sort({_id:-1});
  res.json(data);
});

app.post("/api/staff", async(req,res)=>{
  await Staff.create(req.body);
  res.json({success:true});
});

app.put("/api/staff/:id", async(req,res)=>{
  await Staff.findByIdAndUpdate(req.params.id,req.body);
  res.json({success:true});
});

app.delete("/api/staff/:id", async(req,res)=>{
  await Staff.findByIdAndDelete(req.params.id);
  res.json({success:true});
});

/* =========================
   ATTENDANCE
========================= */
app.get("/api/attendance", async(req,res)=>{
  const data = await Attendance.find().sort({_id:-1});
  res.json(data);
});

/* =========================
   LEAVE
========================= */
app.get("/api/leave", async(req,res)=>{
  const data = await Leave.find().sort({_id:-1});
  res.json(data);
});

app.put("/api/leave/:id", async(req,res)=>{
  await Leave.findByIdAndUpdate(req.params.id,{status:req.body.status});
  res.json({success:true});
});

/* =========================
   PAYMENT
========================= */
app.get("/api/payment", async(req,res)=>{
  const data = await Payment.find().sort({_id:-1});
  res.json(data);
});

app.put("/api/payment/:id", async(req,res)=>{
  await Payment.findByIdAndUpdate(req.params.id,{status:req.body.status});
  res.json({success:true});
});

/* ========================= */
app.listen(PORT,()=>{
  console.log("Server Running http://localhost:"+PORT);
});
