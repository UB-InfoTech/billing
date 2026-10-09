import React,{useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import axios from "axios";
import {
  MODULE_CATALOG,
  FORM_CATALOG,
  TABLE_CATALOG,
  WORKFLOW_RESOURCES,
  WORKFLOW_EVENTS,
  WORKFLOW_OPERATORS,
  workflowFieldsFor
} from "../config/noCodeCatalog";
import {useSoftwareConfiguration} from "../hooks/useSoftwareConfiguration";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const defaultWorkflow={
  name:"",
  active:true,
  trigger:{event:"record_updated",resource:"orders"},
  conditions:[],
  actions:[]
};

const workflowResourceLabel=key=>{
  const item=WORKFLOW_RESOURCES.find(resource=>resource.key===key);
  return item?.label||key||"Record";
};

const workflowEventLabel=key=>{
  const item=WORKFLOW_EVENTS.find(event=>event.key===key);
  return item?.label||key||"Changed";
};



const FINANCIAL_INPUT_GROUPS=[
  {title:"Profit & loss",fields:[
    ["depreciation","Depreciation"],
    ["amortization","Amortization"],
    ["interestExpense","Interest / finance cost"],
    ["incomeTax","Income tax"],
    ["otherIncome","Other income"],
    ["otherExpenses","Other expenses"],
    ["rAndD","R&D expense"],
    ["sellingExpenses","Selling expenses"],
    ["administrativeExpenses","Administrative expenses"]
  ]},
  {title:"Balance sheet",fields:[
    ["equity","Equity / net worth"],
    ["averageEquity","Average equity"],
    ["totalAssets","Total assets"],
    ["averageAssets","Average assets"],
    ["currentAssets","Current assets"],
    ["currentLiabilities","Current liabilities"],
    ["cash","Cash & cash equivalents"],
    ["accountsReceivable","Accounts receivable"],
    ["averageReceivables","Average receivables"],
    ["inventory","Inventory"],
    ["averageInventory","Average inventory"],
    ["accountsPayable","Accounts payable"],
    ["averagePayables","Average payables"],
    ["debt","Total debt"],
    ["principalRepayments","Principal repayments"]
  ]},
  {title:"Shares & market",fields:[
    ["weightedAverageShares","Weighted average shares"],
    ["sharesOutstanding","Shares outstanding"],
    ["marketPricePerShare","Market price per share"],
    ["dividends","Dividends"]
  ]},
  {title:"Cash flow & unit economics",fields:[
    ["capitalExpenditure","CAPEX"],
    ["operatingCashFlow","Operating cash flow"],
    ["investingCashFlow","Investing cash flow"],
    ["financingCashFlow","Financing cash flow"],
    ["variableCosts","Variable costs"],
    ["fixedOperatingCosts","Fixed operating costs"]
  ]},
  {title:"Tax & return assumptions",fields:[
    ["wacc","WACC"],
    ["taxRate","Tax rate"]
  ]}
];

export default function Settings(){
  const navigate=useNavigate();
  const {
    configuration,
    loading,
    saving,
    error:configurationError,
    setError:setConfigurationError,
    save:saveConfiguration,
    reset:resetConfiguration
  }=useSoftwareConfiguration();

  const [section,setSection]=useState("home");
  const [navigationDraft,setNavigationDraft]=useState([]);
  const [dragKey,setDragKey]=useState(null);
  const [workflows,setWorkflows]=useState([]);
  const [workflow,setWorkflow]=useState(defaultWorkflow);
  const [workflowSaving,setWorkflowSaving]=useState(false);
  const [workflowError,setWorkflowError]=useState("");
  const [workflowLoading,setWorkflowLoading]=useState(true);
  const [invoiceConfig,setInvoiceConfig]=useState(null);
  const [invoiceLoading,setInvoiceLoading]=useState(true);
  const [invoiceSaving,setInvoiceSaving]=useState(false);
  const [invoiceError,setInvoiceError]=useState("");
  const [invoiceDragKey,setInvoiceDragKey]=useState(null);
  const [reportConfig,setReportConfig]=useState(null);
  const [reportLoading,setReportLoading]=useState(true);
  const [reportSaving,setReportSaving]=useState(false);
  const [reportError,setReportError]=useState("");
  const [reportDragKey,setReportDragKey]=useState(null);
  const [dashboardConfig,setDashboardConfig]=useState(null);
  const [dashboardLoading,setDashboardLoading]=useState(true);
  const [dashboardSaving,setDashboardSaving]=useState(false);
  const [dashboardError,setDashboardError]=useState("");
  const [dashboardDragKey,setDashboardDragKey]=useState(null);

  useEffect(()=>{
    if(configuration?.navigation){
      const legacyDefaultLabels={orders:"Bills",clients:"Clients"};
      setNavigationDraft(configuration.navigation.slice().sort((a,b)=>a.order-b.order).map(item=>{
        const fallback=MODULE_CATALOG.find(module=>module.key===item.key);
        const savedLabel=String(item.label||"").trim();
        const isOldDefault=savedLabel&&savedLabel===legacyDefaultLabels[item.key];
        return {...item,label:!savedLabel||isOldDefault?(fallback?.label||item.label):savedLabel};
      }));
    }
  },[configuration]);

  const currentModuleMap=useMemo(
    ()=>new Map(MODULE_CATALOG.map(item=>[item.key,item])),
    []
  );

  const loadWorkflows=async()=>{
    try{
      setWorkflowLoading(true);
      const response=await axios.get(apiBase+"/api/workflows",auth());
      setWorkflows(response.data?.workflows||[]);
    }catch(loadError){
      setWorkflowError(loadError.response?.data?.message||"Unable to load workflows.");
    }finally{setWorkflowLoading(false);}
  };

  useEffect(()=>{loadWorkflows();},[]);

  const loadInvoiceConfig=async()=>{
    try{
      setInvoiceLoading(true);
      setInvoiceError("");
      const response=await axios.get(apiBase+"/api/invoice-config",auth());
      setInvoiceConfig(response.data||null);
    }catch(loadError){
      setInvoiceError(loadError.response?.data?.message||"Unable to load invoice settings.");
    }finally{setInvoiceLoading(false);}
  };

  useEffect(()=>{loadInvoiceConfig();},[]);

  const loadReportConfig=async()=>{
    try{
      setReportLoading(true);
      setReportError("");
      const response=await axios.get(apiBase+"/api/report-config",auth());
      setReportConfig(response.data||null);
    }catch(loadError){
      setReportError(loadError.response?.data?.message||"Unable to load report settings.");
    }finally{setReportLoading(false);}
  };

  useEffect(()=>{loadReportConfig();},[]);

  const loadDashboardConfig=async()=>{
    try{
      setDashboardLoading(true);
      setDashboardError("");
      const response=await axios.get(apiBase+"/api/dashboard-config",auth());
      setDashboardConfig(response.data||null);
    }catch(loadError){
      setDashboardError(loadError.response?.data?.message||"Unable to load dashboard settings.");
    }finally{setDashboardLoading(false);}
  };

  useEffect(()=>{loadDashboardConfig();},[]);

  const updateDashboardWidget=(key,patch)=>{
    setDashboardConfig(prev=>({...prev,widgets:(prev?.widgets||[]).map(widget=>widget.key===key?{...widget,...patch}:widget)}));
  };

  const moveDashboardWidget=(source,target)=>{
    if(!source||!target||source===target)return;
    setDashboardConfig(prev=>{
      const widgets=(prev?.widgets||[]).slice().sort((a,b)=>a.order-b.order);
      const sourceIndex=widgets.findIndex(item=>item.key===source);
      const targetIndex=widgets.findIndex(item=>item.key===target);
      if(sourceIndex<0||targetIndex<0)return prev;
      const next=widgets.slice();
      const [moved]=next.splice(sourceIndex,1);
      next.splice(targetIndex,0,moved);
      return {...prev,widgets:next.map((item,index)=>({...item,order:index}))};
    });
  };

  const saveDashboardConfig=async()=>{
    try{
      setDashboardSaving(true);
      setDashboardError("");
      const response=await axios.put(apiBase+"/api/dashboard-config",{widgets:(dashboardConfig?.widgets||[]).map((item,index)=>({...item,order:index}))},auth());
      setDashboardConfig(response.data||dashboardConfig);
    }catch(saveError){
      setDashboardError(saveError.response?.data?.message||"Unable to save dashboard settings.");
    }finally{setDashboardSaving(false);}
  };

  const resetDashboardConfig=async()=>{
    try{
      setDashboardSaving(true);
      setDashboardError("");
      const response=await axios.post(apiBase+"/api/dashboard-config/reset",{},auth());
      setDashboardConfig(response.data||null);
    }catch(resetError){
      setDashboardError(resetError.response?.data?.message||"Unable to reset dashboard settings.");
    }finally{setDashboardSaving(false);}
  };

  const updateFinancialInput=(key,value)=>{
    setReportConfig(prev=>({...prev,financialInputs:{...(prev?.financialInputs||{}),[key]:value}}));
  };

  const updateReportWidget=(key,patch)=>{
    setReportConfig(prev=>({...prev,widgets:(prev?.widgets||[]).map(widget=>widget.key===key?{...widget,...patch}:widget)}));
  };

  const moveReportWidget=(source,target)=>{
    if(!source||!target||source===target)return;
    setReportConfig(prev=>{
      const widgets=(prev?.widgets||[]).slice().sort((a,b)=>a.order-b.order);
      const sourceIndex=widgets.findIndex(item=>item.key===source);
      const targetIndex=widgets.findIndex(item=>item.key===target);
      if(sourceIndex<0||targetIndex<0)return prev;
      const next=widgets.slice();
      const [moved]=next.splice(sourceIndex,1);
      next.splice(targetIndex,0,moved);
      return {...prev,widgets:next.map((item,index)=>({...item,order:index}))};
    });
  };

  const saveReportConfig=async()=>{
    try{
      setReportSaving(true);
      setReportError("");
      const response=await axios.put(apiBase+"/api/report-config",{widgets:(reportConfig?.widgets||[]).map((item,index)=>({...item,order:index})),financialInputs:reportConfig?.financialInputs||{}},auth());
      setReportConfig(response.data||reportConfig);
    }catch(saveError){
      setReportError(saveError.response?.data?.message||"Unable to save report settings.");
    }finally{setReportSaving(false);}
  };

  const resetReportConfig=async()=>{
    try{
      setReportSaving(true);
      setReportError("");
      const response=await axios.post(apiBase+"/api/report-config/reset",{},auth());
      setReportConfig(response.data||null);
    }catch(resetError){
      setReportError(resetError.response?.data?.message||"Unable to reset report settings.");
    }finally{setReportSaving(false);}
  };

  const updateInvoiceSection=(section,patch)=>{
    setInvoiceConfig(prev=>({...prev,[section]:{...(prev?.[section]||{}),...patch}}));
  };

  const saveInvoiceConfig=async()=>{
    try{
      setInvoiceSaving(true);
      setInvoiceError("");
      const response=await axios.put(apiBase+"/api/invoice-config",invoiceConfig,auth());
      setInvoiceConfig(response.data||invoiceConfig);
    }catch(saveError){
      setInvoiceError(saveError.response?.data?.message||"Unable to save invoice settings.");
    }finally{setInvoiceSaving(false);}
  };

  const resetInvoiceConfig=async()=>{
    try{
      setInvoiceSaving(true);
      setInvoiceError("");
      const response=await axios.post(apiBase+"/api/invoice-config/reset",{},auth());
      setInvoiceConfig(response.data||null);
    }catch(resetError){
      setInvoiceError(resetError.response?.data?.message||"Unable to reset invoice settings.");
    }finally{setInvoiceSaving(false);}
  };

  const moveInvoiceColumn=(source,target)=>{
    if(!source||!target||source===target)return;
    setInvoiceConfig(prev=>{
      const columns=(prev?.itemColumns||[]).slice().sort((a,b)=>a.order-b.order);
      const sourceIndex=columns.findIndex(item=>item.key===source);
      const targetIndex=columns.findIndex(item=>item.key===target);
      if(sourceIndex<0||targetIndex<0)return prev;
      const next=columns.slice();
      const [moved]=next.splice(sourceIndex,1);
      next.splice(targetIndex,0,moved);
      return {...prev,itemColumns:next.map((item,index)=>({...item,order:index}))};
    });
  };

  const updateInvoiceColumn=(key,patch)=>{
    setInvoiceConfig(prev=>({...prev,itemColumns:(prev?.itemColumns||[]).map(column=>column.key===key?{...column,...patch}:column)}));
  };

  const moveNavigation=(source,target)=>{
    if(!source||!target||source===target)return;
    setNavigationDraft(prev=>{
      const sourceIndex=prev.findIndex(item=>item.key===source);
      const targetIndex=prev.findIndex(item=>item.key===target);
      if(sourceIndex<0||targetIndex<0)return prev;
      const next=prev.slice();
      const [moved]=next.splice(sourceIndex,1);
      next.splice(targetIndex,0,moved);
      return next.map((item,index)=>({...item,order:index}));
    });
  };

  const updateNavigation=(key,patch)=>{
    setNavigationDraft(prev=>prev.map(item=>item.key===key?{...item,...patch}:item));
  };

  const saveNavigation=async()=>{
    try{
      setConfigurationError("");
      await saveConfiguration({
        navigation:navigationDraft.map((item,index)=>({...item,order:index})),
        appearance:configuration?.appearance||{compactMode:false,showPageHelp:true}
      });
    }catch(saveError){
      setConfigurationError(saveError?.response?.data?.message||"Unable to save the menu.");
    }
  };

  const resetNavigation=async()=>{
    try{
      await resetConfiguration();
    }catch(resetError){
      setConfigurationError(resetError?.response?.data?.message||"Unable to reset the menu.");
    }
  };

  const newWorkflow=()=>{
    setWorkflow({...defaultWorkflow,trigger:{...defaultWorkflow.trigger}});
    setWorkflowError("");
  };

  const editWorkflow=item=>{
    setWorkflow({
      ...defaultWorkflow,
      ...item,
      trigger:{...defaultWorkflow.trigger,...(item.trigger||{})},
      conditions:Array.isArray(item.conditions)?item.conditions.map(condition=>({...condition})):[],
      actions:Array.isArray(item.actions)?item.actions.map(action=>({...action})):[],
    });
    setWorkflowError("");
  };

  const updateWorkflow=(patch)=>setWorkflow(prev=>({...prev,...patch}));

  const addCondition=()=>{
    setWorkflow(prev=>({
      ...prev,
      conditions:[...prev.conditions,{fieldKey:"",operator:"equals",value:""}]
    }));
  };

  const updateCondition=(index,patch)=>{
    setWorkflow(prev=>({
      ...prev,
      conditions:prev.conditions.map((condition,itemIndex)=>itemIndex===index?{...condition,...patch}:condition)
    }));
  };

  const removeCondition=index=>{
    setWorkflow(prev=>({...prev,conditions:prev.conditions.filter((_,itemIndex)=>itemIndex!==index)}));
  };

  const addAction=()=>{
    setWorkflow(prev=>({
      ...prev,
      actions:[...prev.actions,{type:"set_value",fieldKey:"",value:"",message:""}]
    }));
  };

  const updateAction=(index,patch)=>{
    setWorkflow(prev=>({
      ...prev,
      actions:prev.actions.map((action,itemIndex)=>itemIndex===index?{...action,...patch}:action)
    }));
  };

  const removeAction=index=>{
    setWorkflow(prev=>({...prev,actions:prev.actions.filter((_,itemIndex)=>itemIndex!==index)}));
  };

  const saveWorkflow=async()=>{
    try{
      setWorkflowSaving(true);
      setWorkflowError("");
      if(!workflow.name.trim()){
        setWorkflowError("Give this workflow a simple name.");
        return;
      }
      if(!workflow.actions.length){
        setWorkflowError("Add at least one action.");
        return;
      }

      const response=workflow._id
        ? await axios.put(apiBase+"/api/workflows/"+workflow._id,workflow,auth())
        : await axios.post(apiBase+"/api/workflows",workflow,auth());

      setWorkflows(prev=>{
        const next=prev.slice();
        const index=next.findIndex(item=>item._id===response.data._id);
        if(index>=0)next[index]=response.data;
        else next.unshift(response.data);
        return next;
      });
      setWorkflow(defaultWorkflow);
    }catch(saveError){
      setWorkflowError(saveError.response?.data?.message||"Unable to save workflow.");
    }finally{setWorkflowSaving(false);}
  };

  const deleteWorkflow=async(id)=>{
    if(!window.confirm("Remove this workflow?"))return;
    try{
      await axios.delete(apiBase+"/api/workflows/"+id,auth());
      setWorkflows(prev=>prev.filter(item=>item._id!==id));
      if(workflow._id===id)setWorkflow(defaultWorkflow);
    }catch(deleteError){
      setWorkflowError(deleteError.response?.data?.message||"Unable to remove workflow.");
    }
  };

  const workflowFields=workflowFieldsFor(workflow.trigger.resource);

  if(loading){
    return <div className="settings-page d-flex align-items-center justify-content-center min-vh-100"><div className="text-center text-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Loading settings...</div></div>;
  }

  return(
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-hero">
          <div>
            <div className="settings-kicker">Settings</div>
            <h1>Make the software fit your business</h1>
            <p>Change names, fields, lists and automations without code. Start with a simple task below.</p>
          </div>
          <button type="button" className="btn btn-light border" onClick={()=>navigate("/dashboard")}>Back to software</button>
        </header>

        <div className="settings-layout">
          <aside className="settings-menu">
            {[
              ["home","Overview","bi-house"],
              ["dashboard","Dashboard","bi-speedometer2"],
              ["navigation","Menu","bi-layout-sidebar"],
              ["forms","Forms & fields","bi-ui-checks-grid"],
              ["tables","Lists","bi-table"],
              ["reports","Reports","bi-bar-chart"],
              ["invoice","Invoice & print","bi-file-earmark-text"],
              ["workflows","Automations","bi-diagram-3"]
            ].map(([key,label,icon])=>(
              <button type="button" key={key} className={section===key?"active":""} onClick={()=>setSection(key)}>
                <i className={`bi ${icon}`}></i><span>{label}</span>
              </button>
            ))}
          </aside>

          <main className="settings-content">
            {configurationError&&<div className="alert alert-danger">{configurationError}</div>}

            {section==="dashboard"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div>
                    <h2>Dashboard</h2>
                    <p>Choose the dashboard information your team sees first. Rename panels, hide what you do not need, and drag to reorder.</p>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light border" onClick={resetDashboardConfig} disabled={dashboardSaving}>Reset</button>
                    <button type="button" className="btn btn-primary" onClick={saveDashboardConfig} disabled={dashboardSaving||dashboardLoading}>{dashboardSaving?"Saving...":"Save dashboard"}</button>
                  </div>
                </div>
                {dashboardError&&<div className="alert alert-danger">{dashboardError}</div>}
                {dashboardLoading||!dashboardConfig?(
                  <div className="text-center py-5 text-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Loading dashboard settings...</div>
                ):(
                  <div className="settings-workflow-list">
                    {(dashboardConfig.widgets||[]).slice().sort((a,b)=>a.order-b.order).map(widget=>(
                      <div
                        className="settings-workflow-row"
                        key={widget.key}
                        draggable
                        onDragStart={()=>setDashboardDragKey(widget.key)}
                        onDragOver={event=>event.preventDefault()}
                        onDrop={()=>{moveDashboardWidget(dashboardDragKey,widget.key);setDashboardDragKey(null);}}
                        onDragEnd={()=>setDashboardDragKey(null)}
                      >
                        <div className="d-flex align-items-center gap-3 flex-grow-1">
                          <span className="text-secondary" style={{cursor:"grab"}} title="Drag to move"><i className="bi bi-grip-vertical"></i></span>
                          <div className="flex-grow-1">
                            <input className="form-control" value={widget.title||""} onChange={event=>updateDashboardWidget(widget.key,{title:event.target.value})}/>
                            <small className="text-secondary">Controls one area of the dashboard.</small>
                          </div>
                        </div>
                        <button type="button" className={`btn btn-sm ${widget.visible!==false?"btn-outline-primary":"btn-outline-secondary"}`} onClick={()=>updateDashboardWidget(widget.key,{visible:widget.visible===false})}>
                          <i className={`bi ${widget.visible!==false?"bi-eye":"bi-eye-slash"} me-1`}></i>
                          {widget.visible!==false?"Shown":"Hidden"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {section==="home"&&(
              <>
                <section className="settings-section settings-welcome-section">
                  <div className="settings-section-heading">
                    <div>
                      <span className="settings-eyebrow">START HERE</span>
                      <h2>What would you like to change?</h2>
                      <p>Choose one simple task. Advanced options are still available when you need them.</p>
                    </div>
                  </div>
                  <div className="row g-3">
                    {[
                      ["forms","Add or change fields","Add information such as Sales Person, Area or Credit Limit.","bi-plus-circle"],
                      ["tables","Change a list","Show, hide, rename or reorder the columns your team sees.","bi-table"],
                      ["navigation","Organize the menu","Put your most-used screens first and hide screens you do not use.","bi-layout-sidebar"],
                      ["workflows","Automate a task","Make the software fill, update or react automatically.","bi-lightning-charge"]
                    ].map(([key,title,description,icon])=>(
                      <div className="col-lg-6" key={key}>
                        <button type="button" className="settings-start-card settings-start-card-large" onClick={()=>setSection(key)}>
                          <span className="settings-start-icon"><i className={"bi "+icon}></i></span>
                          <span>
                            <strong>{title}</strong>
                            <small>{description}</small>
                          </span>
                          <i className="bi bi-arrow-right"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="settings-section">
                  <div className="settings-section-heading">
                    <div>
                      <span className="settings-eyebrow">KEEP IT SIMPLE</span>
                      <h2>Everyday screens stay clean</h2>
                      <p>Your team does not need to see builder controls while doing normal work.</p>
                    </div>
                  </div>
                  <div className="settings-simple-box settings-simple-box-enhanced">
                    <div className="settings-simple-copy">
                      <strong>Customization stays here</strong>
                      <span>Your team can use invoices, clients, products and reports normally without seeing builder controls.</span>
                    </div>
                    <span className="badge bg-light text-dark border"><i className="bi bi-check2-circle me-1"></i>Simple by default</span>
                  </div>
                </section>
              </>
            )}

            {section==="navigation"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Menu & pages</h2><p>Drag the screens into the order your business follows. Hide anything you do not use.</p></div>
                  <button type="button" className="btn btn-primary" onClick={saveNavigation} disabled={saving}>{saving?"Saving...":"Save menu"}</button>
                </div>

                <div className="settings-builder-tip">Drag using the handle. Rename a page for your team. The software keeps the real page safely connected underneath.</div>

                <div className="settings-drag-list">
                  {navigationDraft.map(item=>{
                    const module=currentModuleMap.get(item.key);
                    if(!module)return null;
                    return(
                      <div
                        key={item.key}
                        className={`settings-drag-row ${item.visible?"":"is-hidden"} ${dragKey===item.key?"is-dragging":""}`}
                        draggable
                        onDragStart={()=>setDragKey(item.key)}
                        onDragOver={event=>event.preventDefault()}
                        onDrop={()=>{moveNavigation(dragKey,item.key);setDragKey(null);}}
                        onDragEnd={()=>setDragKey(null)}
                      >
                        <span className="settings-drag-handle" title="Drag to move"><i className="bi bi-grip-vertical"></i></span>
                        <span className="settings-row-icon"><i className={`bi ${module.icon}`}></i></span>
                        <div className="flex-grow-1">
                          <input className="form-control" value={item.label} onChange={event=>updateNavigation(item.key,{label:event.target.value})}/>
                          <small>{module.description}</small>
                        </div>
                        <button type="button" className={`btn btn-sm ${item.visible?"btn-outline-primary":"btn-outline-secondary"}`} onClick={()=>updateNavigation(item.key,{visible:!item.visible})}>{item.visible?"Shown":"Hidden"}</button>
                      </div>
                    );
                  })}
                </div>

                <div className="d-flex justify-content-end gap-2 mt-3">
                  <button type="button" className="btn btn-light border" onClick={resetNavigation}>Reset menu</button>
                </div>
              </section>
            )}

            {section==="forms"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Forms</h2><p>Add, rename or hide fields using a simple visual editor.</p></div>
                </div>
                <div className="row g-3">
                  {FORM_CATALOG.map(form=>(
                    <div className="col-lg-6" key={form.key}>
                      <div className="settings-feature-card">
                        <div className="d-flex gap-3 align-items-start">
                          <span className="settings-feature-icon"><i className="bi bi-ui-checks-grid"></i></span>
                          <div className="flex-grow-1">
                            <h3>{form.label}</h3>
                            <p>{form.description}</p>
                            <button type="button" className="btn btn-primary btn-sm" onClick={()=>navigate(form.page+"?customize="+form.query)}>Customize form</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {section==="tables"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Lists & tables</h2><p>Choose the columns people see, then rename or reorder them.</p></div>
                </div>
                <div className="row g-3">
                  {TABLE_CATALOG.map(table=>(
                    <div className="col-lg-6" key={table.key}>
                      <div className="settings-feature-card">
                        <div className="d-flex gap-3 align-items-start">
                          <span className="settings-feature-icon"><i className="bi bi-table"></i></span>
                          <div className="flex-grow-1">
                            <h3>{table.label}</h3>
                            <p>{table.description}</p>
                            <button type="button" className="btn btn-primary btn-sm" onClick={()=>navigate(table.page+"?customize="+(table.query||"table"))}>Customize list</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {section==="reports"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div>
                    <h2>Reports</h2>
                    <p>Keep Reports simple. Turn sections on or off and rename them only when you need to.</p>
                  </div>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light border" onClick={resetReportConfig} disabled={reportSaving}>Reset</button>
                    <button type="button" className="btn btn-primary" onClick={saveReportConfig} disabled={reportSaving||reportLoading}>{reportSaving?"Saving...":"Save report layout"}</button>
                  </div>
                </div>
                {reportError&&<div className="alert alert-danger">{reportError}</div>}
                {reportLoading||!reportConfig?(
                  <div className="text-center py-5 text-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Loading report settings...</div>
                ):(
                  <div className="settings-workflow-list">
                    {(reportConfig.widgets||[]).slice().sort((a,b)=>a.order-b.order).map(widget=>(
                      <div
                        className="settings-workflow-row"
                        key={widget.key}
                        draggable
                        onDragStart={()=>setReportDragKey(widget.key)}
                        onDragOver={event=>event.preventDefault()}
                        onDrop={()=>{moveReportWidget(reportDragKey,widget.key);setReportDragKey(null);}}
                        onDragEnd={()=>setReportDragKey(null)}
                      >
                        <div className="d-flex align-items-center gap-3 flex-grow-1">
                          <span className="text-secondary" style={{cursor:"grab"}} title="Drag to move"><i className="bi bi-grip-vertical"></i></span>
                          <div className="flex-grow-1">
                            <input
                              className="form-control"
                              value={widget.title||""}
                              onChange={event=>updateReportWidget(widget.key,{title:event.target.value})}
                              aria-label={`Title for ${widget.title||widget.key}`}
                            />
                            <small className="text-secondary">This panel controls one part of the Reports screen.</small>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${widget.visible!==false?"btn-outline-primary":"btn-outline-secondary"}`}
                          onClick={()=>updateReportWidget(widget.key,{visible:widget.visible===false})}
                        >
                          <i className={`bi ${widget.visible!==false?"bi-eye":"bi-eye-slash"} me-1`}></i>
                          {widget.visible!==false?"Shown":"Hidden"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {!reportLoading&&reportConfig&&(
                  <div className="mt-4">
                    <details className="settings-advanced-box">
                      <summary>
                        <div>
                          <strong>Advanced financial data</strong>
                          <span>Add extra business figures only when you want investor or accounting measures such as ROE, EPS, WACC or P/E.</span>
                        </div>
                        <i className="bi bi-chevron-down"></i>
                      </summary>
                      <div className="settings-advanced-box-body">
                        <div className="settings-builder-tip mb-3">
                          <i className="bi bi-info-circle me-2"></i>
                          Your normal sales, bills and expenses are calculated automatically. You only need these extra numbers when the software cannot know them from your billing data.
                        </div>
                        <div className="row g-3">
                          {FINANCIAL_INPUT_GROUPS.map(group=>(
                            <div className="col-lg-6" key={group.title}>
                              <div className="settings-feature-card h-100">
                                <h4>{group.title}</h4>
                                <div className="small text-secondary mb-3">Leave anything blank that does not apply to your business.</div>
                                <div className="row g-2">
                                  {group.fields.map(([key,label])=>(
                                    <div className="col-md-6" key={key}>
                                      <label className="form-label">{label}</label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="form-control"
                                        value={reportConfig.financialInputs?.[key]??""}
                                        onChange={event=>updateFinancialInput(key,event.target.value)}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="small text-secondary mt-3">Use Save report layout below after entering the numbers.</div>
                      </div>
                    </details>
                  </div>
                )}
              </section>
            )}

            {section==="invoice"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Invoice & print</h2><p>Change what appears on printed invoices without editing templates or code.</p></div>
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light border" onClick={resetInvoiceConfig} disabled={invoiceSaving}>Reset</button>
                    <button type="button" className="btn btn-primary" onClick={saveInvoiceConfig} disabled={invoiceSaving||invoiceLoading}>{invoiceSaving?"Saving...":"Save invoice design"}</button>
                  </div>
                </div>
                {invoiceError&&<div className="alert alert-danger">{invoiceError}</div>}
                {invoiceLoading||!invoiceConfig?(
                  <div className="text-center py-5 text-secondary"><span className="spinner-border spinner-border-sm me-2"></span>Loading invoice settings...</div>
                ):(
                  <>
                    <div className="row g-3">
                      <div className="col-lg-6">
                        <div className="settings-feature-card h-100">
                          <h3>Page & title</h3>
                          <p>Set the paper size and the main heading.</p>
                          <div className="row g-3">
                            <div className="col-md-6"><label className="form-label">Paper size</label><select className="form-select" value={invoiceConfig.pageSize} onChange={event=>setInvoiceConfig(prev=>({...prev,pageSize:event.target.value}))}><option>A4</option><option>A5</option><option>Letter</option></select></div>
                            <div className="col-md-6"><label className="form-label">Invoice title</label><input className="form-control" value={invoiceConfig.invoiceTitle||""} onChange={event=>setInvoiceConfig(prev=>({...prev,invoiceTitle:event.target.value}))}/></div>
                            <div className="col-md-6"><label className="form-label">Accent color</label><div className="input-group"><input type="color" className="form-control form-control-color" value={invoiceConfig.accentColor||"#111827"} onChange={event=>setInvoiceConfig(prev=>({...prev,accentColor:event.target.value}))}/><input className="form-control" value={invoiceConfig.accentColor||""} onChange={event=>setInvoiceConfig(prev=>({...prev,accentColor:event.target.value}))}/></div></div>
                          </div>
                        </div>
                      </div>

                      <div className="col-lg-6">
                        <div className="settings-feature-card h-100">
                          <h3>Company header</h3>
                          <p>Choose what customers see at the top.</p>
                          <div className="row g-2">
                            {[["showHeaderTitle","Header title"],["showCompanyName","Company name"],["showGST","GSTIN"],["showPhones","Phone numbers"],["showAddress","Company address"]].map(([key,label])=>(
                              <div className="col-md-6" key={key}><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={invoiceConfig.header?.[key]!==false} onChange={event=>updateInvoiceSection("header",{[key]:event.target.checked})}/><label className="form-check-label">{label}</label></div></div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="col-lg-6">
                        <div className="settings-feature-card h-100">
                          <h3>Customer details</h3>
                          <p>Choose the customer information printed on the bill.</p>
                          <div className="row g-2">
                            {[["showName","Name"],["showAddress","Address"],["showMobile","Mobile"],["showState","State"],["showGSTIN","GSTIN"]].map(([key,label])=>(
                              <div className="col-md-6" key={key}><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={invoiceConfig.receiver?.[key]!==false} onChange={event=>updateInvoiceSection("receiver",{[key]:event.target.checked})}/><label className="form-check-label">{label}</label></div></div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="col-lg-6">
                        <div className="settings-feature-card h-100">
                          <h3>Invoice details</h3>
                          <p>Choose the reference information printed beside the customer details.</p>
                          <div className="row g-2">
                            {[["showChallan","Challan number"],["showInvoiceNo","Invoice number"],["showInvoiceDate","Invoice date"],["showDueDate","Due date"],["showPaymentTerms","Payment terms"],["showEwayBill","E-Way Bill"]].map(([key,label])=>(
                              <div className="col-md-6" key={key}><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={invoiceConfig.invoiceDetails?.[key]!==false} onChange={event=>updateInvoiceSection("invoiceDetails",{[key]:event.target.checked})}/><label className="form-check-label">{label}</label></div></div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="col-12">
                        <div className="settings-feature-card">
                          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                            <div><h3>Item columns</h3><p>Drag to reorder columns, rename them, or hide anything you do not need.</p></div>
                          </div>
                          <div className="settings-drag-list">
                            {(invoiceConfig.itemColumns||[]).slice().sort((a,b)=>a.order-b.order).map(column=>(
                              <div key={column.key} className={`settings-drag-row ${column.visible===false?"is-hidden ":""}${invoiceDragKey===column.key?"is-dragging":""}`} draggable onDragStart={()=>setInvoiceDragKey(column.key)} onDragOver={event=>event.preventDefault()} onDrop={()=>{moveInvoiceColumn(invoiceDragKey,column.key);setInvoiceDragKey(null);}} onDragEnd={()=>setInvoiceDragKey(null)}>
                                <span className="settings-drag-handle"><i className="bi bi-grip-vertical"></i></span>
                                <span className="settings-row-icon"><i className="bi bi-layout-three-columns"></i></span>
                                <div className="flex-grow-1"><input className="form-control" value={column.label} onChange={event=>updateInvoiceColumn(column.key,{label:event.target.value})}/><small>{column.key}</small></div>
                                <button type="button" className={`btn btn-sm ${column.visible===false?"btn-outline-secondary":"btn-outline-primary"}`} onClick={()=>updateInvoiceColumn(column.key,{visible:column.visible===false})}>{column.visible===false?"Hidden":"Shown"}</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="col-12">
                        <div className="settings-feature-card">
                          <h3>Totals, bank details & footer</h3>
                          <p>Control the supporting sections of the printed invoice.</p>
                          <div className="row g-2">
                            {[["showDiscount","Discount row"],["showTax","Tax rows"],["showRoundOff","Round off"],["showBankDetails","Bank details"],["showTerms","Terms & conditions"],["showWebCredit","Footer credit"]].map(([key,label])=>(
                              <div className="col-md-4" key={key}><div className="form-check form-switch"><input className="form-check-input" type="checkbox" checked={invoiceConfig.summary?.[key]!==false} onChange={event=>updateInvoiceSection("summary",{[key]:event.target.checked})}/><label className="form-check-label">{label}</label></div></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {section==="workflows"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Automations</h2><p>Build simple “When this happens → do this” rules. Start small; add conditions only when you need them.</p></div>
                  <button type="button" className="btn btn-primary" onClick={newWorkflow}><i className="bi bi-plus-lg me-1"></i>New automation</button>
                </div>

                {workflowError&&<div className="alert alert-warning">{workflowError}</div>}

                <div className="settings-workflow-builder">
                  <div className="settings-workflow-step">
                    <span className="settings-step-number">1</span>
                    <div className="flex-grow-1">
                      <label className="form-label">Give it a name</label>
                      <input className="form-control" value={workflow.name} onChange={event=>updateWorkflow({name:event.target.value})} placeholder="Example: Lock completed bills"/>
                    </div>
                    <div className="form-check form-switch pt-4">
                      <input className="form-check-input" type="checkbox" checked={workflow.active!==false} onChange={event=>updateWorkflow({active:event.target.checked})}/>
                      <label className="form-check-label">Active</label>
                    </div>
                  </div>

                  <div className="settings-workflow-step">
                    <span className="settings-step-number">2</span>
                    <div className="flex-grow-1">
                      <h4>When</h4>
                      <div className="row g-2">
                        <div className="col-md-5">
                          <select className="form-select" value={workflow.trigger.resource} onChange={event=>updateWorkflow({trigger:{...workflow.trigger,resource:event.target.value}})}>
                            {WORKFLOW_RESOURCES.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
                          </select>
                        </div>
                        <div className="col-md-7">
                          <select className="form-select" value={workflow.trigger.event} onChange={event=>updateWorkflow({trigger:{...workflow.trigger,event:event.target.value}})}>
                            {WORKFLOW_EVENTS.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="settings-workflow-step">
                    <span className="settings-step-number">3</span>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h4 className="mb-0">Only when</h4>
                        <button type="button" className="btn btn-sm btn-light border" onClick={addCondition}>Add condition</button>
                      </div>
                      {!workflow.conditions.length&&<div className="settings-empty-inline">No condition. The workflow will run whenever the trigger happens.</div>}
                      {workflow.conditions.map((condition,index)=>(
                        <div className="row g-2 align-items-end mb-2" key={index}>
                          <div className="col-md-4">
                            <label className="form-label">Field</label>
                            <select className="form-select" value={condition.fieldKey} onChange={event=>updateCondition(index,{fieldKey:event.target.value})}>
                              <option value="">Choose a field</option>
                              {workflowFields.map(field=><option key={field.value} value={field.value}>{field.label}</option>)}
                            </select>
                          </div>
                          <div className="col-md-3">
                            <label className="form-label">Condition</label>
                            <select className="form-select" value={condition.operator} onChange={event=>updateCondition(index,{operator:event.target.value})}>
                              {WORKFLOW_OPERATORS.map(operator=><option key={operator.value} value={operator.value}>{operator.label}</option>)}
                            </select>
                          </div>
                          <div className="col-md-4">
                            <label className="form-label">Value</label>
                            <input className="form-control" value={condition.value||""} disabled={["empty","not_empty"].includes(condition.operator)} onChange={event=>updateCondition(index,{value:event.target.value})}/>
                          </div>
                          <div className="col-md-1">
                            <button type="button" className="btn btn-outline-danger w-100" onClick={()=>removeCondition(index)} aria-label="Remove condition"><i className="bi bi-trash"></i></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="settings-workflow-step">
                    <span className="settings-step-number">4</span>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h4 className="mb-0">Then do</h4>
                        <button type="button" className="btn btn-sm btn-light border" onClick={addAction}>Add action</button>
                      </div>
                      {!workflow.actions.length&&<div className="settings-empty-inline">Add an action to make the workflow useful.</div>}
                      {workflow.actions.map((action,index)=>(
                        <div className="row g-2 align-items-end mb-2" key={index}>
                          <div className="col-md-3">
                            <label className="form-label">Action</label>
                            <select className="form-select" value={action.type} onChange={event=>updateAction(index,{type:event.target.value})}>
                              <option value="set_value">Set a field</option>
                              <option value="change_status">Change status</option>
                            </select>
                          </div>
                          <div className="col-md-4">
                                <label className="form-label">Field</label>
                                <select className="form-select" value={action.fieldKey||""} onChange={event=>updateAction(index,{fieldKey:event.target.value})}>
                                  <option value="">Choose a field</option>
                                  {workflowFields.map(field=><option key={field.value} value={field.value}>{field.label}</option>)}
                                </select>
                              </div>
                              <div className="col-md-4">
                                <label className="form-label">New value</label>
                                {action.type==="change_status" ? (
                                  <select className="form-select" value={action.value||""} onChange={event=>updateAction(index,{value:event.target.value})}>
                                    <option value="">Choose status</option>
                                    <option>Pending</option>
                                    <option>In Process</option>
                                    <option>Completed</option>
                                    <option>Cancelled</option>
                                    <option>Dispatched</option>
                                  </select>
                                ) : (
                                  <input className="form-control" value={action.value??""} onChange={event=>updateAction(index,{value:event.target.value})} placeholder="Enter the value"/>
                                )}
                              </div>
                          <div className="col-md-1">
                            <button type="button" className="btn btn-outline-danger w-100" onClick={()=>removeAction(index)} aria-label="Remove action"><i className="bi bi-trash"></i></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-light border" onClick={newWorkflow}>Clear</button>
                    <button type="button" className="btn btn-primary" disabled={workflowSaving} onClick={saveWorkflow}>{workflowSaving?"Saving...":workflow._id?"Update workflow":"Save workflow"}</button>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="h5">Saved automations</h3>
                  {workflowLoading?<div className="text-secondary">Loading...</div>:workflows.length===0?<div className="settings-empty-inline">No workflows created yet.</div>:(
                    <div className="settings-workflow-list">
                      {workflows.map(item=>(
                        <div className="settings-workflow-row" key={item._id}>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{workflowResourceLabel(item.trigger?.resource)} · {workflowEventLabel(item.trigger?.event)} · {item.active===false?"Off":"Active"}</small>
                          </div>
                          <div className="d-flex gap-2">
                            <button type="button" className="btn btn-sm btn-light border" onClick={()=>editWorkflow(item)}>Edit</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>deleteWorkflow(item._id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
