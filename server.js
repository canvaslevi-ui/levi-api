const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* 🔥 CONNECT DB */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log(err));

/* 🔥 IST TIME FUNCTION */
function getISTTime(){
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

/* 🔥 DISTANCE */
function getDistance(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;

  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000;
}

/* ================= SCHEMAS ================= */

const Staff = mongoose.model("Staff", new mongoose.Schema({
  name:String,
  mobile:String,
  salary:Number,
  trackingEnabled:{type:Boolean,default:true},
  workLocation:{lat:Number,lng:Number},
  createdAt:{type:Date,default:Date.now}
}));

const Attendance = mongoose.model("Attendance", new mongoose.Schema({
  staffId:String,
  date:String,
  checkIn:String,
  checkOut:String,
  location:String,
  lat:Number,
  lng:Number
}));

const Payment = mongoose.model("Payment", new mongoose.Schema({
  staffId:String,
  amount:Number,
  reason:String,
  status:{type:String,default:"pending"},
  createdAt:{type:Date,default:Date.now}
}));

const Leave = mongoose.model("Leave", new mongoose.Schema({
  staffId:String,
  from:String,
  to:String,
  reason:String,
  status:{type:String,default:"pending"},
  createdAt:{type:Date,default:Date.now}
}));

/* ================= STAFF ================= */

app.post("/staff", async(req,res)=>{
  try{
    const data = await Staff.create(req.body);
    res.json({success:true,data});
  }catch{
    res.json({success:false});
  }
});

app.get("/staff", async(req,res)=>{
  const data = await Staff.find();
  res.json({success:true,data});
});

/* ================= ATTENDANCE ================= */

app.post("/attendance", async(req,res)=>{
  try{
    const {staffId,date,status,location,lat,lng} = req.body;

    let existing = await Attendance.findOne({staffId,date});
    const time = getISTTime();

    if(status==="present"){
      if(existing){
        existing.checkIn = time;
        existing.location = location;
        existing.lat = lat;
        existing.lng = lng;
        await existing.save();
      }else{
        await Attendance.create({
          staffId,
          date,
          checkIn: time,
          location,
          lat,
          lng
        });
      }
    }

    if(status==="checkout"){
      if(existing){
        existing.checkOut = time;
        await existing.save();
      }
    }

    res.json({success:true});

  }catch(err){
    console.log(err);
    res.status(500).json({success:false});
  }
});

app.get("/attendance", async(req,res)=>{
  const {staffId} = req.query;

  let data;

  if(staffId){
    data = await Attendance.find({staffId}).sort({date:-1});
  }else{
    data = await Attendance.find().sort({date:-1});
  }

  res.json({success:true,data});
});

/* ================= PAYMENT ================= */

app.post("/payment", async(req,res)=>{
  const data = await Payment.create(req.body);
  res.json({success:true,data});
});

app.get("/payment", async(req,res)=>{
  const data = await Payment.find({staffId:req.query.staffId});
  res.json({success:true,data});
});

/* ================= LEAVE ================= */

app.post("/leave", async(req,res)=>{
  const data = await Leave.create(req.body);
  res.json({success:true,data});
});

app.get("/leave", async(req,res)=>{
  const data = await Leave.find({staffId:req.query.staffId});
  res.json({success:true,data});
});

/* ================= TRACK ================= */

app.post("/track", async(req,res)=>{
  const {staffId,lat,lng} = req.body;

  const staff = await Staff.findById(staffId);
  if(!staff) return res.json({success:false});

  if(!staff.trackingEnabled || !staff.workLocation){
    return res.json({success:true});
  }

  const dist = getDistance(
    staff.workLocation.lat,
    staff.workLocation.lng,
    lat,
    lng
  );

  res.json({
    success:true,
    alert: dist > 200
  });
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 Server running on", PORT));
