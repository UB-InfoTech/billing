import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";
import {MODULE_CATALOG} from "../config/noCodeCatalog";
import {NavLink,useLocation,useNavigate} from "react-router-dom";

const MENU_ITEMS=MODULE_CATALOG;
const LEGACY_DEFAULT_LABELS={orders:"Bills",clients:"Clients"};
const NAV_GROUPS=[
  {key:"overview",label:"Overview",keys:["dashboard"]},
  {key:"sales",label:"Sales & customers",keys:["orders","clients","deals","follow-ups","sales-performance"]},
  {key:"inventory",label:"Products & purchasing",keys:["products","suppliers","purchases"]},
  {key:"money",label:"Money",keys:["expense","bulk-payment","credit-notes","financial-recovery"]},
  {key:"insights",label:"Reports & calendar",keys:["analytics","calendar"]},
  {key:"business",label:"Business setup",keys:["organization-profile","settings"]}
];
const navGroupFor=key=>NAV_GROUPS.find(group=>group.keys.includes(key))||{key:"other",label:"More",keys:[]};

export default function Navbar({collapsed,setCollapsed,mobileOpen,setMobileOpen}){
  const navigate=useNavigate();
  const location=useLocation();
  const [userName,setUserName]=useState("");
  const [menuItems,setMenuItems]=useState(MENU_ITEMS);
  const [pageSearch,setPageSearch]=useState("");

  useEffect(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem("user")||"null");
      setUserName(stored?.username||stored?.name||"");
    }catch{
      setUserName("");
    }
  },[]);

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

        // Keep new modules visible for businesses with older saved menus.
        const afterKey=key=>{
          const index=next.findIndex(item=>item.key===key);
          return index<0?next.length:index+1;
        };
        const addMissing=(key,position)=>{
          if(saved.some(item=>item.key===key)||!byKey.has(key))return;
          const insertAt=position?position():next.length;
          next.splice(Math.min(next.length,Math.max(0,insertAt)),0,byKey.get(key));
        };
        addMissing("follow-ups",()=>afterKey("clients"));
        addMissing("deals",()=>afterKey("follow-ups"));
        addMissing("sales-performance",()=>afterKey("deals"));
        addMissing("suppliers",()=>afterKey("products"));
        addMissing("purchases",()=>afterKey("suppliers"));
        addMissing("financial-recovery",()=>next.length);
        addMissing("organization-profile",()=>next.length);
        if(next.length)setMenuItems(next);
      }catch{
        if(!cancelled)setMenuItems(MENU_ITEMS);
      }
    };
    if(localStorage.getItem("token"))loadMenu();
    return()=>{cancelled=true;};
  },[]);

  const sections=useMemo(()=>{
    const sectionMap=new Map();
    menuItems.forEach((item,index)=>{
      const group=navGroupFor(item.key);
      if(!sectionMap.has(group.key))sectionMap.set(group.key,{...group,firstIndex:index,items:[]});
      sectionMap.get(group.key).items.push(item);
    });
    return Array.from(sectionMap.values()).sort((a,b)=>a.firstIndex-b.firstIndex);
  },[menuItems]);

  const filteredSections=useMemo(()=>{
    const query=pageSearch.trim().toLowerCase();
    return sections.map(section=>({
      ...section,
      items:section.items.filter(item=>!query||item.label.toLowerCase().includes(query)||String(item.description||"").toLowerCase().includes(query))
    })).filter(section=>section.items.length>0);
  },[sections,pageSearch]);

  const closeMobile=()=>{
    setMobileOpen(false);
    setPageSearch("");
  };
  const handleLogout=()=>{
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    closeMobile();
  };
  const createInvoice=()=>{
    navigate("/orders?action=new");
    closeMobile();
  };

  useEffect(()=>{
    if(!mobileOpen)return undefined;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const handleKeyDown=event=>{
      if(event.key==="Escape")setMobileOpen(false);
    };
    window.addEventListener("keydown",handleKeyDown);
    return()=>{
      document.body.style.overflow=previousOverflow;
      window.removeEventListener("keydown",handleKeyDown);
    };
  },[mobileOpen,setMobileOpen]);

  useEffect(()=>{
    setMobileOpen(false);
  },[location.pathname,setMobileOpen]);

  const compactNavigation=collapsed&&!mobileOpen;
  const isMoreActive=!["/","/dashboard","/orders","/clients","/products"].some(route=>
    route==="/"
      ?location.pathname==="/"
      :location.pathname===route||location.pathname.startsWith(route+"/")
  );

  return(
    <>
      <header className="mobile-appbar">
        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={()=>setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="main-sidebar"
        >
          <i className="bi bi-list" aria-hidden="true"/>
        </button>
        <NavLink to="/dashboard" className="mobile-appbar-brand" onClick={closeMobile}>
          <span className="mobile-appbar-mark"><i className="bi bi-grid-1x2-fill"/></span>
          <span><strong>Billing</strong><small>Business workspace</small></span>
        </NavLink>
        <button type="button" className="mobile-appbar-create" onClick={createInvoice}>
          <i className="bi bi-plus-lg" aria-hidden="true"/><span>New invoice</span>
        </button>
      </header>

      {mobileOpen&&(
        <button type="button" className="sidebar-backdrop" onClick={closeMobile} aria-label="Close navigation"/>
      )}

      <aside id="main-sidebar" className={"app-sidebar "+(collapsed?"is-collapsed ":"")+(mobileOpen?"is-mobile-open":"")}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><i className="bi bi-grid-1x2-fill"/></div>
          <div className="sidebar-brand-text">
            <div className="fw-bold">Billing</div>
            <div className="small text-secondary">Simple business workspace</div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={()=>setCollapsed(previous=>!previous)}
            title={collapsed?"Expand sidebar":"Collapse sidebar"}
            aria-label={collapsed?"Expand sidebar":"Collapse sidebar"}
          >
            <i className={"bi "+(collapsed?"bi-layout-sidebar-inset":"bi-layout-sidebar")}/>
          </button>
          <button type="button" className="sidebar-mobile-close btn btn-sm" onClick={closeMobile} aria-label="Close navigation">
            <i className="bi bi-x-lg"/>
          </button>
        </div>

        <div className="sidebar-quick-create-wrap ux-sidebar-create-wrap">
          <button type="button" className="sidebar-quick-create" onClick={createInvoice} title="Create a new invoice">
            <i className="bi bi-plus-lg" aria-hidden="true"/>
            <span>New invoice</span>
          </button>
        </div>

        <div className="sidebar-scroll">
          {compactNavigation?(
            <nav className="nav flex-column gap-1" aria-label="Main navigation">
              {menuItems.map(item=>(
                <NavLink
                  key={item.key}
                  to={item.route}
                  end={item.key==="dashboard"}
                  onClick={closeMobile}
                  title={item.label}
                  aria-label={item.label}
                  className={({isActive})=>"sidebar-nav-link "+(isActive||(item.key==="dashboard"&&location.pathname==="/")?"active":"")}
                >
                  <span className="sidebar-nav-icon"><i className={"bi "+item.icon}/></span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          ):(
            <>
              <label className="ux-sidebar-search" htmlFor="ux-sidebar-page-search">
                <i className="bi bi-search" aria-hidden="true"/>
                <input
                  id="ux-sidebar-page-search"
                  type="search"
                  value={pageSearch}
                  onChange={event=>setPageSearch(event.target.value)}
                  placeholder="Find a page"
                  autoComplete="off"
                />
                {pageSearch&&<button type="button" onClick={()=>setPageSearch("")} aria-label="Clear page search"><i className="bi bi-x"/></button>}
              </label>
              <nav className="nav flex-column" aria-label="Main navigation">
                {filteredSections.map(section=>(
                  <section className="ux-sidebar-section" key={section.key}>
                    <div className="ux-sidebar-section-heading">{section.label}</div>
                    <div className="ux-sidebar-section-links">
                      {section.items.map(item=>(
                        <NavLink
                          key={item.key}
                          to={item.route}
                          end={item.key==="dashboard"}
                          onClick={closeMobile}
                          title={item.label}
                          className={({isActive})=>"sidebar-nav-link "+(isActive||(item.key==="dashboard"&&location.pathname==="/")?"active":"")}
                        >
                          <span className="sidebar-nav-icon"><i className={"bi "+item.icon}/></span>
                          <span className="sidebar-nav-label">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  </section>
                ))}
                {!filteredSections.length&&(
                  <div className="ux-sidebar-no-results">
                    No pages match “{pageSearch}”.
                    <button type="button" onClick={()=>setPageSearch("")}>Clear search</button>
                  </div>
                )}
              </nav>
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <NavLink to="/settings?section=navigation" className="sidebar-customize-link" onClick={closeMobile} title="Customize your menu">
            <i className="bi bi-sliders2" aria-hidden="true"/>
            <span>Customize menu</span>
          </NavLink>
          <div className="sidebar-user">
            <div className="sidebar-user-avatar"><i className="bi bi-person"/></div>
            <div className="sidebar-user-copy">
              <div className="fw-semibold text-truncate">{userName||"Administrator"}</div>
              <div className="small text-white-50">Signed in</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={handleLogout} title="Logout">
            <i className="bi bi-box-arrow-right"/>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        <NavLink to="/dashboard" end className={({isActive})=>"mobile-bottom-nav-link "+(isActive?"active":"")} onClick={closeMobile}>
          <i className="bi bi-house-door" aria-hidden="true"/><span>Home</span>
        </NavLink>
        <NavLink to="/orders" className={({isActive})=>"mobile-bottom-nav-link "+(isActive?"active":"")} onClick={closeMobile}>
          <i className="bi bi-receipt" aria-hidden="true"/><span>Invoices</span>
        </NavLink>
        <NavLink to="/clients" className={({isActive})=>"mobile-bottom-nav-link "+(isActive?"active":"")} onClick={closeMobile}>
          <i className="bi bi-people" aria-hidden="true"/><span>Customers</span>
        </NavLink>
        <NavLink to="/products" className={({isActive})=>"mobile-bottom-nav-link "+(isActive?"active":"")} onClick={closeMobile}>
          <i className="bi bi-box-seam" aria-hidden="true"/><span>Products</span>
        </NavLink>
        <button type="button" className={"mobile-bottom-nav-link "+(isMoreActive?"active":"")} onClick={()=>setMobileOpen(true)} aria-expanded={mobileOpen}>
          <i className="bi bi-grid" aria-hidden="true"/><span>More</span>
        </button>
      </nav>
    </>
  );
}
