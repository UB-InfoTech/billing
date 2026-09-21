const express=require("express");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const User=require("../models/User");
const auth=require("../middleware/auth");
const router=express.Router();

const signToken=user=>jwt.sign({user:{id:user.id}},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||"8h"});
const normalizeEmail=e=>String(e||"").trim().toLowerCase();

router.post("/register",async(req,res)=>{
  try{
    const username=String(req.body?.username||"").trim();
    const email=normalizeEmail(req.body?.email);
    const password=String(req.body?.password||"");
    if(username.length<2)return res.status(400).json({msg:"Username must be at least 2 characters.",message:"Username must be at least 2 characters."});
    if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({msg:"Enter a valid email address.",message:"Enter a valid email address."});
    if(password.length<8)return res.status(400).json({msg:"Password must be at least 8 characters.",message:"Password must be at least 8 characters."});
    if(await User.findOne({$or:[{email},{username}]}).select("_id").lean())return res.status(409).json({msg:"User already exists.",message:"User already exists."});
    const passwordHash=await bcrypt.hash(password,12);
    const user=await User.create({username,email,password:passwordHash});
    res.status(201).json({token:signToken(user)});
  }catch(error){if(error.code===11000)return res.status(409).json({msg:"Username or email already exists.",message:"Username or email already exists."});res.status(500).json({msg:"Server error",message:"Server error"});}
});

router.post("/login",async(req,res)=>{
  try{
    const email=normalizeEmail(req.body?.email),password=String(req.body?.password||"");
    if(!email||!password)return res.status(400).json({msg:"Email and password are required."});
    const user=await User.findOne({email}).select("+password");
    if(!user||!(await bcrypt.compare(password,user.password)))return res.status(401).json({msg:"Invalid credentials",message:"Invalid credentials"});
    res.json({token:signToken(user),user:{id:user.id,username:user.username,email:user.email}});
  }catch(error){res.status(500).json({msg:"Server error"});}
});

router.get("/user",auth,async(req,res)=>{
  try{const user=await User.findById(req.user.id).select("-password").lean();if(!user)return res.status(404).json({msg:"User not found"});res.json(user);}catch(error){res.status(500).json({msg:"Server error"});}
});

module.exports=router;