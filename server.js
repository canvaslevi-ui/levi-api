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
.catch(err=>console.log(err));

/* ================== SCHEMAS ================== */

// STAFF
const staffSchema = new mongoose.Schema({
  name: String,
  role: String,
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


/* ================== ROUTES ================== */

// TEST
app.get("/", (req,res)=> res.send("Levi API Pro Running 🚀"));

/* STAFF */
app.post("/staff", async (req,res)=>{
  const data = await Staff.create(req.body);
  res.send(data);
});

app.get("/staff", async (req,res)=>{
  const data = await Staff.find();
  res.send(data);
});

app.delete("/staff/:id", async (req,res)=>{
  await Staff.findByIdAndDelete(req.params.id);
  res.send({success:true});
});


/* ATTENDANCE */
app.post("/attendance", async (req,res)=>{
  const data = await Attendance.create(req.body);
  res.send(data);
});

app.get("/attendance", async (req,res)=>{
  const data = await Attendance.find();
  res.send(data);
});


/* LEAVE */
app.post("/leave", async (req,res)=>{
  const data = await Leave.create(req.body);
  res.send(data);
});

app.get("/leave", async (req,res)=>{
  const data = await Leave.find();
  res.send(data);
});

app.put("/leave/:id", async (req,res)=>{
  await Leave.findByIdAndUpdate(req.params.id, req.body);
  res.send({success:true});
});


/* PAYMENT */
app.post("/payment", async (req,res)=>{
  const data = await Payment.create(req.body);
  res.send(data);
});

app.get("/payment", async (req,res)=>{
  const data = await Payment.find();
  res.send(data);
});

app.put("/payment/:id", async (req,res)=>{
  await Payment.findByIdAndUpdate(req.params.id, req.body);
  res.send({success:true});
});


/* 🔌 PORT */
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("Server running on", PORT));
