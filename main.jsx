import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import {AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer} from "recharts";
import "./style.css";

const API="/api";
const demo=[{day:"Mon",v:28},{day:"Tue",v:42},{day:"Wed",v:35},{day:"Thu",v:58},{day:"Fri",v:44},{day:"Sat",v:71},{day:"Sun",v:53}];

async function req(path,options={},token){
  const response=await fetch(API+path,{
    ...options,
    headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Error(data.message||"Request failed");
  return data;
}

function Auth({onLogin}){
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
  const [busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[cool,setCool]=useState(0);

  useEffect(()=>{
    if(!cool)return;
    const timer=setInterval(()=>setCool(x=>Math.max(0,x-1)),1000);
    return()=>clearInterval(timer);
  },[cool]);

  const submit=async e=>{
    e.preventDefault();
    if(busy||cool)return;
    setBusy(true);setMsg("");
    try{
      const data=await req(mode==="login"?"/auth/login":"/auth/signup",{
        method:"POST",body:JSON.stringify({email,password,name})
      });
      if(mode==="signup"&&data.needsConfirmation){
        setMsg("Account created. Check your email confirmation before logging in.");
        setCool(60);
      }else if(data.session?.access_token){
        onLogin(data.session.access_token);
      }
    }catch(error){
      setMsg(error.message);
      if(mode==="signup"&&/email limit|too many/i.test(error.message))setCool(120);
    }finally{setBusy(false);}
  };

  return <main className="auth">
    <div className="authbox">
      <div className="logo">◈ CYBER NEXUS</div>
      <p className="muted">Authorized Network Security Console</p>
      <div className="tabs">
        <button className={mode==="login"?"active":""} onClick={()=>{setMode("login");setMsg("")}}>LOGIN</button>
        <button className={mode==="signup"?"active":""} onClick={()=>{setMode("signup");setMsg("")}}>SIGN UP</button>
      </div>
      <form onSubmit={submit}>
        {mode==="signup"&&<input placeholder="Operator name" value={name} onChange={e=>setName(e.target.value)}/>}
        <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/>
        <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/>
        <button className="primary" disabled={busy||cool}>
          {busy?"PROCESSING...":cool?`WAIT ${cool}s`:mode==="login"?"ENTER NEXUS":"CREATE ACCOUNT"}
        </button>
      </form>
      {msg&&<div className="notice">{msg}</div>}
      <small>Use only on networks you own or are authorized to assess.</small>
    </div>
  </main>;
}

function App(){
  const [token,setToken]=useState(localStorage.getItem("cn_token"));
  const [tab,setTab]=useState("overview"),[dash,setDash]=useState(null),[assets,setAssets]=useState([]);
  const [name,setName]=useState(""),[type,setType]=useState("WPA2"),[audit,setAudit]=useState(null),[msg,setMsg]=useState("");

  const logout=()=>{localStorage.removeItem("cn_token");setToken(null)};
  const load=async()=>{
    try{
      const [dashboard,assetList]=await Promise.all([req("/dashboard",{},token),req("/assets",{},token)]);
      setDash(dashboard);setAssets(assetList);
    }catch(error){setMsg(error.message);if(/session/i.test(error.message))logout();}
  };
  useEffect(()=>{if(token)load()},[token]);

  const login=t=>{localStorage.setItem("cn_token",t);setToken(t)};
  const add=async()=>{
    try{await req("/assets",{method:"POST",body:JSON.stringify({name,security_type:type})},token);setName("");load();}
    catch(error){setMsg(error.message);}
  };
  const runAudit=async id=>{
    try{setAudit(await req(`/assets/${id}/audit`,{method:"POST"},token));load();}
    catch(error){setMsg(error.message);}
  };

  if(!token)return <Auth onLogin={login}/>;

  return <div className="app">
    <aside>
      <div className="brand">◈ NEXUS</div>
      {["overview","assets","events"].map(item=><button key={item} className={tab===item?"nav active":"nav"} onClick={()=>setTab(item)}>
        {item==="overview"?"⌂ OVERVIEW":item==="assets"?"◫ ASSETS":"⚠ EVENTS"}
      </button>)}
      <button className="nav logout" onClick={logout}>↪ LOGOUT</button>
    </aside>

    <section className="content">
      <header>
        <div><span className="eyebrow">SECURITY OPERATIONS</span><h1>{tab==="overview"?"Command Center":tab==="assets"?"Network Assets":"Security Events"}</h1></div>
        <span className="live">● SYSTEM ONLINE</span>
      </header>

      {msg&&<div className="notice">{msg}</div>}

      {tab==="overview"&&<>
        <div className="grid">
          {[["ASSETS",dash?.assets||0],["EVENTS",dash?.events||0],["INCIDENTS",dash?.incidents||0],["CRITICAL",dash?.critical||0]].map(item=>
            <div className="card stat" key={item[0]}><span>{item[0]}</span><b>{item[1]}</b></div>
          )}
        </div>
        <div className="panel"><h2>Threat Activity</h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={demo}><XAxis dataKey="day"/><YAxis/><Tooltip/><Area type="monotone" dataKey="v" fill="currentColor" fillOpacity=".18" stroke="currentColor"/></AreaChart>
          </ResponsiveContainer>
        </div>
      </>}

      {tab==="assets"&&<>
        <div className="panel add">
          <input placeholder="Network name" value={name} onChange={e=>setName(e.target.value)}/>
          <select value={type} onChange={e=>setType(e.target.value)}><option>WPA3</option><option>WPA2</option><option>WEP</option></select>
          <button className="primary" onClick={add}>+ ADD ASSET</button>
        </div>
        <div className="grid">
          {assets.map(asset=><div className="card asset" key={asset.id}>
            <div><h3>{asset.name}</h3><span>{asset.security_type} · {asset.status||"unscanned"}</span></div>
            <b>{asset.score??0}</b><button onClick={()=>runAudit(asset.id)}>RUN AUDIT</button>
          </div>)}
        </div>
      </>}

      {tab==="events"&&<div className="panel"><h2>Security Events</h2><p className="muted">Authorized configuration-audit findings are stored in the database.</p></div>}
    </section>

    {audit&&<div className="modal"><div className="modalbox">
      <button className="close" onClick={()=>setAudit(null)}>×</button>
      <div className="score">{audit.score}</div><h2>Audit Complete</h2>
      <p>Status: <b>{audit.status}</b></p>
      {audit.findings.length?<ul>{audit.findings.map((f,i)=><li key={i}><b>{f.severity.toUpperCase()}</b> · {f.title}</li>)}</ul>:<p>✓ No configuration findings detected.</p>}
    </div></div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);