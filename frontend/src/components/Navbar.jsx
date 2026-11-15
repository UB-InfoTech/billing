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

const CREATE_ACTIONS=[
  {label:"New invoice",description:"Create a customer bill",icon:"bi-receipt",to:"/orders?action=new"},
  {label:"Add customer",description:"Save a customer or company",icon:"bi-person-plus",to:"/clients?action=new"},
  {label:"Add expense",description:"Record a business expense",icon:"bi-wallet2",to:"/add-expense"},
  {label:"Record purchase",description:"Receive stock from a supplier",icon:"bi-cart-plus",to:"/purchases?action=new"}
];

export default function Navbar({collapsed,setCollapsed,mobileOpen,setMobileOpen}){
  const navigate=useNavigate();
  const location=useLocation();
  const [userName,setUserName]=useState("");
  const [menuItems,setMenuItems]=useState(MENU_ITEMS);
  const [pageSearch,setPageSearch]=useState("");
  const [quickCreateOpen,setQuickCreateOpen]=useState(false);
  const [expandedGroups,setExpandedGroups]=useState(()=>new Set(["sales"]));

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

        // Keep newer modules available to businesses whose saved menus predate them.
        const addMissing=(key,position)=>{
          if(saved.some(item=>item.key===key)||!byKey.has(key))return;
          const item=byKey.get(key);
          const insertAt=typeof position==="function"?position():next.length;
          next.splice(insertAt,0,item);
        };
        addMissing("follow-ups",()=>Math.max(0,next.findIndex(item=>item.key==="clients")+1));
        addMissing("deals",()=>Math.max(0,next.findIndex(item=>item.key==="follow-ups")+1));
        addMissing("sales-performance",()=>Math.max(0,next.findIndex(item=>item.key==="deals")+1));
        addMissing("suppliers",()=>Math.max(0,next.findIndex(item=>item.key==="products")+1));
        addMissing("purchases",()=>Math.max(0,next.findIndex(item=>item.key==="suppliers")+1));
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
      if(!sectionMap.has(group.key)){
        sectionMap.set(group.key,{...group,firstIndex:index,items:[]});
      }
      sectionMap.get(group.key).items.push(item);
    });
    return Array.from(sectionMap.values()).sort((a,b)=>a.firstIndex-b.firstIndex);
  },[menuItems]);

  const activeGroup=useMemo(()=>{
    if(location.pathname==="/")return "overview";
    const activeItem=menuItems.find(item=>location.pathname===item.route||location.pathname.startsWith(item.route+"/"));
    return activeItem?navGroupFor(activeItem.key).key:null;
  },[location.pathname,menuItems]);

  useEffect(()=>{
    if(!activeGroup)return;
    setExpandedGroups(previous=>previous.has(activeGroup)?previous:new Set([...previous,activeGroup]));
  },[activeGroup]);

  const filteredSections=useMemo(()=>{
    const query=pageSearch.trim().toLowerCase();
    return sections.map(section=>({
      ...section,
      items:section.items.filter(item=>!query||item.label.toLowerCase().includes(query)||String(item.description||"").toLowerCase().includes(query))
    })).filter(section=>section.items.length>0);
  },[sections,pageSearch]);

  const closeMobile=()=>{
    setMobileOpen(false);
    setQuickCreateOpen(false);
  };

  const toggleGroup=key=>{
    setExpandedGroups(previous=>{
      const next=new Set(previous);
      if(next.has(key))next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleLogout=()=>{
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    closeMobile();
  };

  const compactNavigation=collapsed&&!mobileOpen;
  const openCreateAction=to=>{
    navigate(to);
    setQuickCreateOpen(false);
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

      <aside className={"app-sidebar "+(collapsed?"is-collapsed ":"")+(mobileOpen?"is-mobile-open":"")}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark"><i className="bi bi-grid-1x2-fill"></i></div>
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
            <i className={"bi "+(collapsed?"bi-layout-sidebar-inset":"bi-layout-sidebar")}></i>
          </button>
          <button type="button" className="sidebar-mobile-close btn btn-sm" onClick={closeMobile} aria-label="Close navigation">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="sidebar-quick-create-wrap ux-sidebar-create-wrap">
          <button
            type="button"
            className="sidebar-quick-create"
            onClick={()=>setQuickCreateOpen(previous=>!previous)}
            title="Create a new record"
            aria-haspopup="menu"
            aria-expanded={quickCreateOpen}
            aria-controls="ux-create-menu"
          >
            <i className="bi bi-plus-lg"></i>
            <span>New</span>
            <i className="bi bi-chevron-down ux-create-chevron"></i>
          </button>
          {quickCreateOpen&&(
            <div className="ux-create-menu" id="ux-create-menu" role="menu" aria-label="Create new">
              {CREATE_ACTIONS.map(action=>(
                <button type="button" role="menuitem" key={action.to} onClick={()=>openCreateAction(action.to)}>
                  <span className="ux-create-menu-icon"><i className={"bi "+action.icon}></i></span>
                  <span className="ux-create-menu-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
                </button>
              ))}
            </div>
          )}
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
                  <span className="sidebar-nav-icon"><i className={"bi "+item.icon}></i></span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          ):(
            <>
              <label className="ux-sidebar-search" htmlFor="ux-sidebar-page-search">
                <i className="bi bi-search" aria-hidden="true"></i>
                <input
                  id="ux-sidebar-page-search"
                  type="search"
                  value={pageSearch}
                  onChange={event=>setPageSearch(event.target.value)}
                  placeholder="Find a page"
                  autoComplete="off"
                />
                {pageSearch&&<button type="button" onClick={()=>setPageSearch("")} aria-label="Clear page search"><i className="bi bi-x"></i></button>}
              </label>
              <nav className="nav flex-column" aria-label="Main navigation">
                {filteredSections.map(section=>{
                  const isOpen=pageSearch.trim()!==""||expandedGroups.has(section.key);
                  return(
                    <section className="ux-sidebar-section" key={section.key}>
                      <button
                        type="button"
                        className="ux-sidebar-section-toggle"
                        onClick={()=>toggleGroup(section.key)}
                        aria-expanded={isOpen}
                      >
                        <span>{section.label}</span>
                        <i className={"bi "+(isOpen?"bi-chevron-up":"bi-chevron-down")} aria-hidden="true"></i>
                      </button>
                      {isOpen&&(
                        <div className="ux-sidebar-section-links">
                          {section.items.map(item=>(
                            <NavLink
                              key={item.key}
                              to={item.route}
                              end={item.key==="dashboard"}
                              onClick={()=>{setPageSearch("");closeMobile();}}
                              title={item.label}
                              className={({isActive})=>"sidebar-nav-link "+(isActive||(item.key==="dashboard"&&location.pathname==="/")?"active":"")}
                            >
                              <span className="sidebar-nav-icon"><i className={"bi "+item.icon}></i></span>
                              <span className="sidebar-nav-label">{item.label}</span>
                            </NavLink>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
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
