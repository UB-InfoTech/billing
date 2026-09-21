const express=require("express");
const mongoose=require("mongoose");
const cors=require("cors");
const dotenv=require("dotenv");
const path=require("path");
const mongoSanitize=require("express-mongo-sanitize");
const rateLimit=require("express-rate-limit");

dotenv.config();

const app=express();
const PORT=Number(process.env.PORT||5000);

const apiLimiter=rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:"draft-7",legacyHeaders:false});

const allowedOrigins=String(process.env.FRONTEND_URLS||process.env.FRONTEND_URL||"*")
  .split(",").map(x=>x.trim()).filter(Boolean);

app.set("trust proxy",1);
app.use(cors({
  origin:(origin,callback)=>{
    if(!origin||allowedOrigins.includes("*")||allowedOrigins.includes(origin))return callback(null,true);
    return callback(new Error("CORS origin not allowed."));
  },
  credentials:true,
  allowedHeaders:["Content-Type","x-auth-token","Authorization"],
  exposedHeaders:["x-auth-token"]
}));
app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true,limit:"2mb"}));
app.use(mongoSanitize());
app.use("/api",apiLimiter);

app.use("/uploads",express.static(path.join(__dirname,"public/uploads"),{maxAge:"7d"}));

app.get("/api/health",(req,res)=>{
  res.json({
    status:"ok",
    database:mongoose.connection.readyState===1?"connected":"disconnected",
    timestamp:new Date().toISOString(),
    uptime:process.uptime(),
    version:process.env.API_VERSION||"1.0.0"
  });
});

app.use("/api/auth",require("./routes/auth"));
app.use("/api/clients",require("./routes/clientRoutes"));
app.use("/api/order",require("./routes/orderRoutes2"));
app.use("/api/events",require("./routes/calendar"));
app.use("/api/expenses",require("./routes/expenseRoutes2"));
app.use("/api/products",require("./routes/productRoute"));
app.use("/api/profile",require("./routes/profile"));
app.use("/api/ewaybill",require("./routes/ewaybillRoutes"));
app.use("/api/gstdetails",require("./routes/getGstDetailsRoutes"));
app.use("/api/payments",require("./routes/bulkPayment"));
app.use("/api/credit-notes",require("./routes/creditNoteRoutes"));
app.use("/api/reports",require("./routes/reportRoutes"));

const errorHandler=(err,req,res,next)=>{
  console.error("API error:",err);
  if(res.headersSent)return next(err);
  const status=Number(err.status||err.statusCode)||500;
  res.status(status).json({message:err.message||"Something went wrong.",requestId:req.id||undefined});
};
app.use(errorHandler);

async function start(){
  if(!process.env.MONGO_URI)throw new Error("MONGO_URI is required.");
  if(!process.env.JWT_SECRET)throw new Error("JWT_SECRET is required.");
  await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});
  console.log("MongoDB Connected");
  app.listen(PORT,()=>console.log("Server running on port "+PORT));
}
start().catch(error=>{
  console.error("Server startup failed:",error);
  process.exit(1);
});

module.exports=app;
