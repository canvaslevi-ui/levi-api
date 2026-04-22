const express = require("express");
const app = express();
app.use(express.json());

let attendance = [];
let leaves = [];
let payments = [];
let staff = [];

/* TEST */
app.get("/", (req,res)=>{
  res.send("Levi API Running 🚀");
});

/* STAFF */
app.post("/staff/add",(req,res)=>{
  staff.push(req.body);
  res.send({success:true});
});
app.get("/staff",(req,res)=> res.send(staff));

/* ATTENDANCE */
app.post("/attendance",(req,res)=>{
  attendance.push(req.body);
  res.send({success:true});
});
app.get("/attendance",(req,res)=> res.send(attendance));

/* LEAVE */
app.post("/leave",(req,res)=>{
  leaves.push({...req.body,status:"pending"});
  res.send({success:true});
});
app.get("/leave",(req,res)=> res.send(leaves));

/* PAYMENT */
app.post("/payment",(req,res)=>{
  payments.push({...req.body,status:"pending"});
  res.send({success:true});
});
app.get("/payment",(req,res)=> res.send(payments));

app.listen(3000,()=>console.log("Server running on 3000"));