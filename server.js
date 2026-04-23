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

/* 🔥 STAFF */
const Staff = mongoose.model("Staff", new mongoose.Schema({
  name:String,
  mobile:String,
  salary:Number,
  trackingEnabled:{type:Boolean,default:true},
  workLocation:{lat:Number,lng:Number},
  createdAt:{type:Date,default:Date.now}
}));

/* 🔥 ATTENDANCE */
const Attendance = mongoose.model("Attendance", new mongoose.Schema({
  staffId:String,
  date:String,
  checkIn:String,
  checkOut:String,
  location:String,
  lat:Number,
  lng:Number
}));

/* ================= STAFF ================= */

app.post("/staff", async(req,res)=>{
  try{
    const data = await Staff.create(req.body);
    res.json({success:true,data});
  }catch(err){
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
    const time = new Date().toLocaleTimeString();

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
    res.json({success:false});
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

/* ================= TRACK ================= */

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

app.post("/track", async(req,res)=>{
  const {staffId,lat,lng} = req.body;

  const staff = await Staff.findById(staffId);
  if(!staff) return res.json({success:false});

  if(!staff.trackingEnabled){
    return res.json({success:true});
  }

  if(!staff.workLocation){
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
app.listen(PORT,()=>console.log("🚀 Server running",PORT));
