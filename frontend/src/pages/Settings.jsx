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

  useEffect(()=>{
    if(configuration?.navigation){
      setNavigationDraft(configuration.navigation.slice().sort((a,b)=>a.order-b.order));
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
            <h1>Make your billing software your own</h1>
            <p>Change the way your software looks and works without code. Drag things, choose options and save.</p>
          </div>
          <button type="button" className="btn btn-light border" onClick={()=>navigate("/dashboard")}>Back to software</button>
        </header>

        <div className="settings-layout">
          <aside className="settings-menu">
            {[
              ["home","Overview","bi-house"],
              ["navigation","Menu & pages","bi-layout-sidebar"],
              ["forms","Forms","bi-ui-checks-grid"],
              ["tables","Lists & tables","bi-table"],
              ["workflows","Workflows","bi-diagram-3"]
            ].map(([key,label,icon])=>(
              <button type="button" key={key} className={section===key?"active":""} onClick={()=>setSection(key)}>
                <i className={`bi ${icon}`}></i><span>{label}</span>
              </button>
            ))}
          </aside>

          <main className="settings-content">
            {configurationError&&<div className="alert alert-danger">{configurationError}</div>}

            {section==="home"&&(
              <>
                <section className="settings-section">
                  <div className="settings-section-heading">
                    <div>
                      <h2>Start here</h2>
                      <p>Most businesses only need these four things.</p>
                    </div>
                  </div>
                  <div className="row g-3">
                    {[
                      ["navigation","Menu & pages","Put the screens you use most in the order you want.","bi-layout-sidebar"],
                      ["forms","Forms","Add fields, connect records, set rules and calculations.","bi-ui-checks-grid"],
                      ["tables","Lists & tables","Choose the columns your team actually needs.","bi-table"],
                      ["workflows","Workflows","Tell the software what should happen automatically.","bi-diagram-3"]
                    ].map(([key,title,description,icon])=>(
                      <div className="col-md-6" key={key}>
                        <button type="button" className="settings-start-card" onClick={()=>setSection(key)}>
                          <span className="settings-start-icon"><i className={`bi ${icon}`}></i></span>
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
                    <div><h2>Simple mode</h2><p>Keep technical choices out of the day-to-day screens.</p></div>
                  </div>
                  <div className="settings-simple-box">
                    <div><strong>Keep customization in Settings</strong><span>Users can work normally without seeing builder controls on every screen.</span></div>
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" checked={configuration?.appearance?.showPageHelp!==false} onChange={event=>saveConfiguration({navigation:navigationDraft,appearance:{...(configuration?.appearance||{}),showPageHelp:event.target.checked}})}/>
                      <label className="form-check-label">Show helpful hints</label>
                    </div>
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
                  <div><h2>Forms</h2><p>Open a visual builder. You can drag fields, add new fields and connect existing records.</p></div>
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
                            <button type="button" className="btn btn-primary btn-sm" onClick={()=>navigate(form.page+"?customize="+form.query)}>Open visual builder</button>
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
                  <div><h2>Lists & tables</h2><p>Keep only the columns your business actually needs. Drag to reorder.</p></div>
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
                            <button type="button" className="btn btn-primary btn-sm" onClick={()=>navigate(table.page+"?customize=table")}>Open table builder</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {section==="workflows"&&(
              <section className="settings-section">
                <div className="settings-section-heading">
                  <div><h2>Workflows</h2><p>Build automatic rules with simple “When this happens → do this” steps.</p></div>
                  <button type="button" className="btn btn-primary" onClick={newWorkflow}>New workflow</button>
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
                          <>
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
                          </>
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
                  <h3 className="h5">Saved workflows</h3>
                  {workflowLoading?<div className="text-secondary">Loading...</div>:workflows.length===0?<div className="settings-empty-inline">No workflows created yet.</div>:(
                    <div className="settings-workflow-list">
                      {workflows.map(item=>(
                        <div className="settings-workflow-row" key={item._id}>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.trigger?.resource} · {item.trigger?.event==="record_created"?"New record":"Updated record"} · {item.active===false?"Off":"Active"}</small>
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
