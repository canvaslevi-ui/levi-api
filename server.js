const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

/* ================= CONNECT DB ================= */
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("✅ MongoDB Connected"))
.catch(err=>console.log(err));

/* ================= TIME ================= */
function getISTTime(){
return new Date().toLocaleTimeString("en-IN",{
timeZone:"Asia/Kolkata",
hour:"2-digit",
minute:"2-digit",
second:"2-digit"
});
}

/* ================= DISTANCE ================= */
function getDistance(lat1, lon1, lat2, lon2){

const R = 6371;
const dLat = (lat2-lat1) * Math.PI/180;
const dLon = (lon2-lon1) * Math.PI/180;

const a =
Math.sin(dLat/2)**2 +
Math.cos(lat1*Math.PI/180) *
Math.cos(lat2*Math.PI/180) *
Math.sin(dLon/2)**2;

const c = 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));

return R * c * 1000;
}

/* ================= SCHEMAS ================= */

const Staff = mongoose.model("Staff", new mongoose.Schema({
name:String,
mobile:String,
salary:Number,
trackingEnabled:{type:Boolean,default:true},
workLocation:{
lat:Number,
lng:Number
},
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
payType:{type:String,default:"Cash"},
status:{type:String,default:"pending"},
approvedAt:String,
approvedBy:String,
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

const Setting = mongoose.model("Setting", new mongoose.Schema({
companyName:{type:String,default:"Levi Interiors"},
ownerName:String,
phone:String,
address:String,
startTime:String,
lateTime:String,
radius:{type:Number,default:200},
salaryDate:String,
advanceLimit:{type:Number,default:0},
payReq:{type:Boolean,default:true},
leaveReq:{type:Boolean,default:true},
tracking:{type:Boolean,default:true},
relogin:{type:Boolean,default:false},
adminPassword:{type:String,default:"1234"},
updatedAt:{type:Date,default:Date.now}
}));

/* ================= STAFF ================= */

app.post("/staff", async(req,res)=>{
try{
const data=await Staff.create(req.body);
res.json({success:true,data});
}catch(err){
res.status(500).json({success:false});
}
});

app.get("/staff", async(req,res)=>{
const data=await Staff.find().sort({_id:-1});
res.json({success:true,data});
});

app.put("/staff/:id", async(req,res)=>{
try{
const data=await Staff.findByIdAndUpdate(
req.params.id,
req.body,
{new:true}
);
res.json({success:true,data});
}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/staff/:id", async(req,res)=>{
try{
await Staff.findByIdAndDelete(req.params.id);
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.put("/staff/:id/tracking", async(req,res)=>{
try{
await Staff.findByIdAndUpdate(req.params.id,{
trackingEnabled:req.body.status
});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.put("/staff/:id/location", async(req,res)=>{
try{
await Staff.findByIdAndUpdate(req.params.id,{
workLocation:req.body
});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

/* ================= ATTENDANCE ================= */

app.post("/attendance", async(req,res)=>{
try{

const {staffId,date,status,location,lat,lng}=req.body;

let existing=await Attendance.findOne({staffId,date});
const time=getISTTime();

if(status==="present"){

if(existing){

existing.checkIn=time;
existing.location=location;
existing.lat=lat;
existing.lng=lng;

await existing.save();

}else{

await Attendance.create({
staffId,
date,
checkIn:time,
location,
lat,
lng
});

}

}

if(status==="checkout"){

if(existing){
existing.checkOut=time;
await existing.save();
}

}

res.json({success:true});

}catch(err){
res.status(500).json({success:false});
}
});

app.get("/attendance", async(req,res)=>{

let data;

if(req.query.staffId){
data=await Attendance.find({
staffId:req.query.staffId
}).sort({date:-1});
}else{
data=await Attendance.find().sort({date:-1});
}

res.json({success:true,data});
});

/* ================= PAYMENT ================= */

app.post("/payment", async(req,res)=>{
try{

const setting=await Setting.findOne();

if(setting && setting.payReq===false){
return res.json({
success:false,
message:"Payment requests disabled"
});
}

const data=await Payment.create(req.body);
res.json({success:true,data});

}catch(err){
res.status(500).json({success:false});
}
});

app.get("/payment", async(req,res)=>{

let data;

if(req.query.staffId){
data=await Payment.find({
staffId:req.query.staffId
}).sort({createdAt:-1});
}else{
data=await Payment.find().sort({createdAt:-1});
}

res.json({success:true,data});
});

app.put("/payment/:id", async(req,res)=>{
try{

const body=req.body||{};

if(body.status==="paid" && !body.approvedAt){
body.approvedAt=new Date().toLocaleDateString("en-IN");
}

if(body.status==="paid" && !body.approvedBy){
body.approvedBy="Admin";
}

const data=await Payment.findByIdAndUpdate(
req.params.id,
body,
{new:true}
);

res.json({success:true,data});

}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/payment/:id", async(req,res)=>{
try{
await Payment.findByIdAndDelete(req.params.id);
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

/* ================= LEAVE ================= */

app.post("/leave", async(req,res)=>{
try{

const setting=await Setting.findOne();

if(setting && setting.leaveReq===false){
return res.json({
success:false,
message:"Leave requests disabled"
});
}

const data=await Leave.create(req.body);
res.json({success:true,data});

}catch(err){
res.status(500).json({success:false});
}
});

app.get("/leave", async(req,res)=>{

let data;

if(req.query.staffId){
data=await Leave.find({
staffId:req.query.staffId
}).sort({createdAt:-1});
}else{
data=await Leave.find().sort({createdAt:-1});
}

res.json({success:true,data});
});

app.put("/leave/:id", async(req,res)=>{
try{
const data=await Leave.findByIdAndUpdate(
req.params.id,
req.body,
{new:true}
);
res.json({success:true,data});
}catch(err){
res.status(500).json({success:false});
}
});

/* ================= SETTINGS ================= */

/* GET SETTINGS */
app.get("/settings", async(req,res)=>{
try{

let data=await Setting.findOne();

if(!data){
data=await Setting.create({});
}

res.json({success:true,data});

}catch(err){
res.status(500).json({success:false});
}
});

/* SAVE SETTINGS */
app.post("/settings", async(req,res)=>{
try{

let data=await Setting.findOne();

if(data){
data=await Setting.findByIdAndUpdate(
data._id,
{...req.body,updatedAt:new Date()},
{new:true}
);
}else{
data=await Setting.create(req.body);
}

res.json({success:true,data});

}catch(err){
res.status(500).json({success:false});
}
});

/* CHANGE PASSWORD */
app.post("/settings/password", async(req,res)=>{
try{

let data=await Setting.findOne();

if(!data){
data=await Setting.create({});
}

data.adminPassword=req.body.password;
await data.save();

res.json({success:true});

}catch(err){
res.status(500).json({success:false});
}
});

/* ================= TRACK ================= */

app.post("/track", async(req,res)=>{
try{

const {staffId,lat,lng}=req.body;

const staff=await Staff.findById(staffId);
if(!staff) return res.json({success:false});

const setting=await Setting.findOne();

if(setting && setting.tracking===false){
return res.json({success:true});
}

if(!staff.trackingEnabled || !staff.workLocation){
return res.json({success:true});
}

const maxRadius=setting?.radius || 200;

const dist=getDistance(
staff.workLocation.lat,
staff.workLocation.lng,
lat,
lng
);

res.json({
success:true,
distance:dist,
alert:dist>maxRadius
});

}catch(err){
res.status(500).json({success:false});
}
});

/* ================= RESET SYSTEM ================= */

app.delete("/reset/attendance", async(req,res)=>{
try{
await Attendance.deleteMany({});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/reset/payment", async(req,res)=>{
try{
await Payment.deleteMany({});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/reset/leave", async(req,res)=>{
try{
await Leave.deleteMany({});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/reset/testing", async(req,res)=>{
try{
await Attendance.deleteMany({});
await Payment.deleteMany({});
await Leave.deleteMany({});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

app.delete("/reset/all", async(req,res)=>{
try{
await Attendance.deleteMany({});
await Payment.deleteMany({});
await Leave.deleteMany({});
await Staff.deleteMany({});
res.json({success:true});
}catch(err){
res.status(500).json({success:false});
}
});

/* ================= HOME ================= */

app.get("/",(req,res)=>{
res.send("Levi Interiors API Running 🚀");
});

/* ================= START ================= */

const PORT=process.env.PORT || 3000;

app.listen(PORT,()=>{
console.log("🚀 Server running on",PORT);
});
