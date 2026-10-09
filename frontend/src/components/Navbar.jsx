import React,{useEffect,useState} from "react";
import axios from "axios";
import {MODULE_CATALOG} from "../config/noCodeCatalog";
import {NavLink,useNavigate} from "react-router-dom";

const MENU_ITEMS=MODULE_CATALOG;
const LEGACY_DEFAULT_LABELS={orders:"Bills",clients:"Clients"};

export default function Navbar({collapsed,setCollapsed,mobileOpen,setMobileOpen}){
  const navigate=useNavigate();
  const [userName,setUserName]=useState("");

  useEffect(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem("user")||"null");
      setUserName(stored?.username||stored?.name||"");
    }catch{
      setUserName("");
    }
  },[]);

  const [menuItems,setMenuItems]=useState(MENU_ITEMS);

  useEffect(()=>{
    let cancelled=false;
    const loadMenu=async()=>{
      try{
        const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
        const response=await axios.get(apiBase+"/api/software-config",{
          headers:{"x-auth-token":localStorage.getItem("token")||""}
        });
        if(cancelled)return;
        const saved=Array.isArray(response.data?.navigation)?response.data.navigation:[];
        const byKey=new Map(MENU_ITEMS.map(item=>[item.key,item]));
        const next=saved
          .slice()
          .sort((a,b)=>(a.order??0)-(b.order??0))
          .filter(item=>item.visible!==false&&byKey.has(item.key))
          .map(item=>{
            const fallback=byKey.get(item.key);
            const savedLabel=String(item.label||"").trim();
            const isOldDefault=savedLabel&&savedLabel===LEGACY_DEFAULT_LABELS[item.key];
            return {...fallback,label:!savedLabel||isOldDefault?fallback.label:savedLabel};
          });
        if(next.length)setMenuItems(next);
      }catch{
        if(!cancelled)setMenuItems(MENU_ITEMS);
      }
    };
    if(localStorage.getItem("token"))loadMenu();
    return()=>{cancelled=true;};
  },[]);

  const closeMobile=()=>setMobileOpen(false);
  const handleLogout=()=>{
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    closeMobile();
  };

  return(
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle btn btn-primary shadow-sm"
        onClick={()=>setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <i className="bi bi-list"></i>
      </button>

      {mobileOpen&&(
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={closeMobile}
          aria-label="Close navigation"
        />
      )}

      <aside className={`app-sidebar ${collapsed?"is-collapsed":""} ${mobileOpen?"is-mobile-open":""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><i className="bi bi-grid-1x2-fill"></i></div>
          <div className="sidebar-brand-text">
            <div className="fw-bold">Billing</div>
            <div className="small text-secondary">Simple business workspace</div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={()=>setCollapsed(prev=>!prev)}
            title={collapsed?"Expand sidebar":"Collapse sidebar"}
            aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}
          >
            <i className={`bi ${collapsed?"bi-layout-sidebar-inset":"bi-layout-sidebar"}`}></i>
          </button>
          <button type="button" className="sidebar-mobile-close btn btn-sm" onClick={closeMobile} aria-label="Close navigation">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="sidebar-quick-create-wrap">
          <button type="button" className="sidebar-quick-create" onClick={()=>{navigate("/orders?action=new");closeMobile();}} title="Create a new invoice">
            <i className="bi bi-plus-lg"></i><span>New invoice</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section-label">Workspace</div>
          <nav className="nav flex-column gap-1" aria-label="Main navigation">
            {menuItems.map(item=>(

              <NavLink
                key={item.key}
                to={item.route}
                onClick={closeMobile}
                className={({isActive})=>`sidebar-nav-link ${isActive?"active":""}`}
              >
                <span className="sidebar-nav-icon"><i className={`bi ${item.icon}`}></i></span>
                <span className="sidebar-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar"><i className="bi bi-person"></i></div>
            <div className="sidebar-user-copy">
              <div className="fw-semibold text-truncate">{userName||"Administrator"}</div>
              <div className="small text-white-50">Signed in</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={handleLogout} title="Logout">
            <i className="bi bi-box-arrow-right"></i>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
