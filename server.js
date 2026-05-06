const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ===== CONFIG =====
const PORT = 3000;
const SECRET = "levi_secret";

// ===== DB =====
mongoose.connect("YOUR_MONGO_URI")
.then(()=>console.log("MongoDB Connected"))
.catch(err=>console.log(err));

// ===== MODEL =====
const Project = mongoose.model("Project", new mongoose.Schema({
  name:String,
  panels:Array,
  createdAt:{type:Date,default:Date.now}
}));

// ===== SOCKET =====
io.on("connection", socket=>{
  console.log("⚡ Connected");
});

// ===== AUTH =====
const ADMIN = {
  username:"admin",
  password:bcrypt.hashSync("1234",10)
};

app.post("/api/login",(req,res)=>{
  const {username,password} = req.body;

  if(username !== ADMIN.username) return res.json({success:false});

  const match = bcrypt.compareSync(password, ADMIN.password);

  if(!match) return res.json({success:false});

  const token = jwt.sign({user:"admin"}, SECRET);

  res.json({success:true,token});
});

function verify(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.status(401).json({success:false});

  try{
    jwt.verify(token, SECRET);
    next();
  }catch{
    res.status(401).json({success:false});
  }
}

// ===== ROUTES =====

// CREATE PROJECT
app.post("/api/projects", verify, async(req,res)=>{
  const data = await Project.create(req.body);
  io.emit("refresh");
  res.json({success:true,data});
});

// GET PROJECTS
app.get("/api/projects", async(req,res)=>{
  const data = await Project.find().sort({_id:-1});
  res.json({success:true,data});
});

// UPDATE STATUS
app.put("/api/projects/:id/status", async(req,res)=>{
  const {panelId,status} = req.body;

  const project = await Project.findById(req.params.id);

  project.panels.forEach(p=>{
    if(p.id === panelId){
      p.status = status;
    }
  });

  await project.save();

  io.emit("refresh");

  res.json({success:true});
});

// DELETE PROJECT
app.delete("/api/projects/:id", verify, async(req,res)=>{
  await Project.findByIdAndDelete(req.params.id);
  io.emit("refresh");
  res.json({success:true});
});

// ===== START =====
server.listen(PORT,()=>{
  console.log("🚀 Server running on", PORT);
});
