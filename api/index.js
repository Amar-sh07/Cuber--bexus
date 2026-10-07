import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({limit:"100kb"}));
app.use("/api", rateLimit({windowMs: 15*60*1000, max:120, standardHeaders:true, legacyHeaders:false}));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);

function authError(error){
  const m=(error?.message||"").toLowerCase();
  if(m.includes("rate limit") || m.includes("too many"))
    return [429,"Email limit reached. Please wait a few minutes before trying again."];
  if(m.includes("already registered"))
    return [409,"This email is already registered. Please log in instead."];
  if(m.includes("invalid login"))
    return [401,"Invalid email or password."];
  return [400,error?.message||"Authentication failed."];
}

app.get("/api",(_,res)=>res.json({ok:true,name:"CYBER NEXUS",version:"2.0"}));

app.post("/api/auth/signup",async(req,res)=>{
  try{
    const {email,password,name}=req.body||{};
    if(!email||!password) return res.status(400).json({message:"Email and password are required."});
    if(password.length<6) return res.status(400).json({message:"Password must be at least 6 characters."});

    const {data,error}=await supabase.auth.signUp({
      email,password,
      options:{data:{full_name:name||"Cyber Operator"}}
    });

    if(error){
      const [status,message]=authError(error);
      return res.status(status).json({message});
    }

    if(data.user && data.session){
      await supabase.from("profiles").upsert(
        {id:data.user.id,full_name:name||"Cyber Operator"},
        {onConflict:"id"}
      );
    }

    return res.json({
      user:data.user,
      session:data.session,
      needsConfirmation:!!data.user&&!data.session,
      message:data.session?"Account created.":"Account created. Check your email to confirm it."
    });
  }catch{
    return res.status(500).json({message:"Server error while creating account."});
  }
});

app.post("/api/auth/login",async(req,res)=>{
  try{
    const {email,password}=req.body||{};
    if(!email||!password) return res.status(400).json({message:"Email and password are required."});
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error){
      const [status,message]=authError(error);
      return res.status(status).json({message});
    }
    if(data.user){
      await supabase.from("profiles").upsert(
        {id:data.user.id,full_name:data.user.user_metadata?.full_name||"Cyber Operator"},
        {onConflict:"id"}
      );
    }
    return res.json(data);
  }catch{
    return res.status(500).json({message:"Server error while logging in."});
  }
});

async function user(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({message:"Authentication required."});
  const {data,error}=await supabase.auth.getUser(h.slice(7));
  if(error||!data.user) return res.status(401).json({message:"Session expired. Please log in again."});
  req.user=data.user;
  next();
}

app.get("/api/dashboard",user,async(req,res)=>{
  const tables=["network_assets","security_events","incidents"],counts={};
  for(const t of tables){
    const q=await supabase.from(t).select("id",{count:"exact",head:true});
    counts[t]=q.count||0;
  }
  const q=await supabase.from("security_events").select("id",{count:"exact",head:true}).eq("severity","critical");
  res.json({assets:counts.network_assets||0,events:counts.security_events||0,incidents:counts.incidents||0,critical:q.count||0});
});

app.get("/api/assets",user,async(req,res)=>{
  const {data,error}=await supabase.from("network_assets").select("*").order("created_at",{ascending:false});
  if(error) return res.status(500).json({message:error.message});
  res.json(data||[]);
});

app.post("/api/assets",user,async(req,res)=>{
  const {name,security_type,wps_enabled=false,firmware_updated=true,admin_password_strong=true}=req.body||{};
  if(!name) return res.status(400).json({message:"Network name is required."});
  const {data,error}=await supabase.from("network_assets").insert({
    name,security_type:security_type||"WPA2",wps_enabled,firmware_updated,admin_password_strong,score:0,status:"unscanned"
  }).select().single();
  if(error) return res.status(400).json({message:error.message});
  res.json(data);
});

app.post("/api/assets/:id/audit",user,async(req,res)=>{
  const {data:asset,error}=await supabase.from("network_assets").select("*").eq("id",req.params.id).single();
  if(error||!asset) return res.status(404).json({message:"Asset not found."});

  const findings=[];
  if(asset.security_type==="WEP") findings.push({title:"Legacy encryption",severity:"critical"});
  if(asset.wps_enabled) findings.push({title:"WPS enabled",severity:"high"});
  if(!asset.firmware_updated) findings.push({title:"Firmware update recommended",severity:"medium"});
  if(!asset.admin_password_strong) findings.push({title:"Weak admin password policy",severity:"high"});

  let score=100-findings.reduce((s,f)=>s+(f.severity==="critical"?35:f.severity==="high"?20:10),0);
  score=Math.max(0,score);
  const status=score>=85?"secure":score>=60?"warning":"critical";

  await supabase.from("network_assets").update({
    score,status,last_audited_at:new Date().toISOString()
  }).eq("id",asset.id);

  for(const f of findings){
    await supabase.from("security_events").insert({
      asset_id:asset.id,title:f.title,severity:f.severity,type:"configuration_audit"
    });
  }
  res.json({score,status,findings});
});

export default app;
