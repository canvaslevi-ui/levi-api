const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* 🔥 MongoDB */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log(err));

/* 🔥 DISTANCE FUNCTION */
function getDistance(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;

  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000;
}

/* 🔥 STAFF SCHEMA */
const staffSchema = new mongoose.Schema({
  name:String,
  mobile:String,
  salary:Number,

  trackingEnabled:{type:Boolean,default:true},
  workLocation:{
    lat:Number,
    lng:Number
  },

  createdAt:{type:Date,default:Date.now}
});
const Staff = mongoose.model("Staff", staffSchema);

/* 🔥 ROUTES */

/* ADD STAFF */
app.post("/staff", async(req,res)=>{
  try{
    const data = await Staff.create(req.body);
    res.json({success:true,data});
  }catch(err){
    res.json({success:false});
  }
});

/* GET STAFF */
app.get("/staff", async(req,res)=>{
  const data = await Staff.find();
  res.json({success:true,data});
});

/* SET WORK LOCATION */
app.put("/staff/:id/location", async(req,res)=>{
  try{
    await Staff.findByIdAndUpdate(req.params.id,{
      workLocation:req.body
    });
    res.json({success:true});
  }catch{
    res.json({success:false});
  }
});

/* TOGGLE TRACKING */
app.put("/staff/:id/tracking", async(req,res)=>{
  try{
    await Staff.findByIdAndUpdate(req.params.id,{
      trackingEnabled:req.body.status
    });
    res.json({success:true});
  }catch{
    res.json({success:false});
  }
});

/* 🔥 TRACK USER */
app.post("/track", async(req,res)=>{
  try{
    const {staffId,lat,lng} = req.body;

    const staff = await Staff.findById(staffId);
    if(!staff) return res.json({success:false});

    if(!staff.trackingEnabled){
      return res.json({success:true,tracking:false});
    }

    if(!staff.workLocation){
      return res.json({success:true,msg:"No base location"});
    }

    const distance = getDistance(
      staff.workLocation.lat,
      staff.workLocation.lng,
      lat,
      lng
    );

    let alert=false;

    if(distance>200){
      alert=true;
      console.log("🚨 OUT OF ZONE:", staff.name, distance);
    }

    res.json({success:true,distance,alert});

  }catch(err){
    res.json({success:false});
  }
});

/* PORT */
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 Server running",PORT));
