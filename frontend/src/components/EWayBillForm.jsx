import React,{useEffect,useState} from "react";
import axios from "axios";
import FormConfigurator from "./FormConfigurator";
import ConfiguredField from "./ConfiguredField";
import {EWAY_BILL_FIELDS} from "../config/noCodeCatalog";
import {buildConfiguredDefaults,getFieldState,hydrateConfiguredValues,syncConfiguredCustomFields,useFormConfiguration} from "../hooks/useFormConfiguration";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const DEFAULT_VALUES={
  supplyType:"O",
  subSupplyType:"1",
  transactionType:"1",
  transporterName:"",
  transporterId:"",
  transDocNo:"",
  transDocDate:"",
  vehicleNo:"",
  vehicleType:"R",
  transMode:"1",
  transDistance:"0",
  customFields:{}
};

export default function EWayBillForm({orderId,customizeOnly=false,onClose}){
  const {fields,loading:formLoading,save:saveForm,reset:resetForm,saving:formSaving}=useFormConfiguration("ewaybill.form",EWAY_BILL_FIELDS);
  const [formData,setFormData]=useState(()=>buildConfiguredDefaults(DEFAULT_VALUES,EWAY_BILL_FIELDS));
  const [loading,setLoading]=useState(false);
  const [response,setResponse]=useState(null);
  const [error,setError]=useState("");
  const [builderOpen,setBuilderOpen]=useState(customizeOnly);

  useEffect(()=>{
    if(customizeOnly)setBuilderOpen(true);
  },[customizeOnly]);

  const eventFields=fields||EWAY_BILL_FIELDS;

  const updateValue=(key,value)=>{
    setFormData(previous=>syncConfiguredCustomFields({...previous,[key]:value},eventFields));
  };

  const resetValues=()=>{
    setFormData(buildConfiguredDefaults(DEFAULT_VALUES,eventFields));
    setResponse(null);
    setError("");
  };

  const downloadPdf=async ewbNo=>{
    if(!ewbNo||!orderId)throw new Error("E-Way Bill number is missing.");
    const response=await axios.get(
      `${API}/api/ewaybill/pdf/${encodeURIComponent(ewbNo)}?orderId=${encodeURIComponent(orderId)}`,
      {headers:{"x-auth-token":localStorage.getItem("token")||""},responseType:"blob"}
    );
    const blob=new Blob([response.data],{type:"application/pdf"});
    const url=window.URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=`ewaybill_${ewbNo}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit=async event=>{
    event.preventDefault();
    if(!orderId){
      setBuilderOpen(true);
      return;
    }
    setLoading(true);
    setError("");
    setResponse(null);
    try{
      const values=syncConfiguredCustomFields(formData,eventFields);
      const payload={...values,customFields:values.customFields||{}};
      const result=await axios.post(`${API}/api/ewaybill/generate/${orderId}`,payload,{
        headers:{"x-auth-token":localStorage.getItem("token")||""}
      });
      setResponse(result.data);
    }catch(submitError){
      setError(submitError.response?.data?.error||submitError.response?.data?.message||"Unable to generate E-Way Bill.");
    }finally{setLoading(false);}
  };

  return (
    <div className="container-fluid">
      {!customizeOnly&&(
        <>
          {response&&(
            <div className="alert alert-success">
              <strong><i className="bi bi-check-circle-fill me-2"></i>E-Way Bill generated successfully.</strong>
              <div className="mt-1">EWB No.: {response.data?.ewayBillNo||"—"}</div>
              <div>EWB Date: {response.data?.ewayBillDate||"—"}</div>
              <div>Valid Till: {response.data?.validUpto||response.data?.validTill||"—"}</div>
              {response.data?.alert&&<div>Alert: {response.data.alert}</div>}
              <button type="button" className="btn btn-success btn-sm mt-3" onClick={()=>downloadPdf(response.data?.ewayBillNo)}>
                <i className="bi bi-file-earmark-arrow-down me-1"></i>Download PDF
              </button>
            </div>
          )}
          {error&&<div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleSubmit} className="row g-3">
            {formLoading
              ? <div className="col-12 text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading E-Way Bill fields...</div>
              : eventFields.map(field=>{
                  const state=getFieldState(field,formData);
                  if(!state.visible)return null;
                  return (
                    <div className={`col-md-${Math.min(12,Math.max(1,Number(field.width)||6))}`} key={field.key}>
                      <ConfiguredField
                        field={field}
                        value={formData[field.key]}
                        onChange={value=>updateValue(field.key,value)}
                        required={state.required}
                        readOnly={state.readOnly}
                        disabled={state.disabled}
                        help={field.helpText}
                      />
                    </div>
                  );
                })}
            <div className="col-12 d-flex justify-content-between align-items-center mt-2">
              <button type="button" className="btn btn-light border" onClick={()=>setBuilderOpen(true)}>
                <i className="bi bi-sliders me-1"></i>Customize
              </button>
              <button type="submit" className="btn btn-primary px-4" disabled={loading||formLoading}>
                <i className="bi bi-file-earmark-arrow-up me-1"></i>{loading?"Generating...":"Generate E-Way Bill"}
              </button>
            </div>
          </form>
        </>
      )}

      <FormConfigurator
        open={builderOpen}
        onClose={()=>{setBuilderOpen(false);onClose?.();}}
        title="Customize E-Way Bill form"
        subtitle="Arrange fields, add your own information, set defaults, visibility, read-only rules and validations."
        fields={eventFields}
        onSave={saveForm}
        onReset={async()=>{const defaults=await resetForm();setBuilderOpen(true);return defaults;}}
        saving={formSaving}
      />
    </div>
  );
}
