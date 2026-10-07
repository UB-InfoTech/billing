import React,{useEffect,useMemo,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {getExpenseOptions,uploadReceipt} from "../services/api";
import FormConfigurator from "./FormConfigurator";
import ConfiguredField from "./ConfiguredField";
import {EXPENSE_FORM_FIELDS} from "../config/noCodeCatalog";
import {useFormConfiguration,applyFormulas,getFieldState,hydrateConfiguredValues,syncConfiguredCustomFields,buildConfiguredDefaults} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";

const today=()=>new Date().toISOString().slice(0,10);
const EMPTY={
  title:"",
  description:"",
  amount:"",
  category:"Operational",
  subCategory:"",
  tags:"",
  paymentMethod:"Cash",
  currency:"INR",
  vendor:"",
  gstNo:"",
  taxDeductible:false,
  taxRate:0,
  taxAmount:0,
  clientId:"",
  orderId:"",
  date:today(),
  isRecurring:false,
  recurringInterval:"",
  recurringEndDate:"",
  notes:"",
  receipt:"",
  customFields:{}
};

export default function ExpenseForm({onSubmit,initialData={}}){
  const [searchParams,setSearchParams]=useSearchParams();
  const expenseFormConfig=useFormConfiguration("expenses.form",EXPENSE_FORM_FIELDS);
  const [form,setForm]=useState(EMPTY);
  const [uploading,setUploading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [formSettingsOpen,setFormSettingsOpen]=useState(false);

  const fields=expenseFormConfig.fields||[];
  const visibleFields=fields.filter(field=>field.visible!==false);
  const linkedSources=useMemo(()=>Array.from(new Set(fields.map(field=>field.dataSource?.resource).filter(Boolean))),[fields]);
  const {records:linkedRecords}=useNoCodeDataSources(linkedSources);

  useEffect(()=>{
    if(searchParams.get("customize")==="form"){
      setFormSettingsOpen(true);
      searchParams.delete("customize");
      setSearchParams(searchParams,{replace:true});
    }
  },[searchParams,setSearchParams]);

  useEffect(()=>{
    const hydrated=hydrateConfiguredValues(initialData,fields);
    setForm(buildConfiguredDefaults({...EMPTY,...hydrated,customFields:{...(hydrated.customFields||{})}},fields));
  },[initialData,fields]);

  const sectionNames=useMemo(()=>[...new Set(visibleFields.map(field=>field.section||"General"))],[visibleFields]);

  const valueFor=(field)=>{
    const raw=field.custom
      ? form.customFields?.[field.key]??form[field.key]??field.defaultValue??""
      : form[field.key]??field.defaultValue??"";
    if(field.fieldType==="date"&&raw){
      const date=new Date(raw);
      return Number.isNaN(date.getTime())?String(raw):date.toISOString().slice(0,10);
    }
    return raw;
  };

  const updateField=(field,value)=>{
    setForm(prev=>{
      let next=field.custom
        ? {...prev,[field.key]:value,customFields:{...(prev.customFields||{}),[field.key]:value}}
        : {...prev,[field.key]:value};
      next=syncConfiguredCustomFields(next,fields);
      return applyFormulas(fields,next);
    });
  };

  const submit=async(event)=>{
    event.preventDefault();
    setError("");
    const values=syncConfiguredCustomFields(form,fields);
    const requiredFields=fields.filter(field=>field.required&&!field.formula);
    const missing=requiredFields.find(field=>{
      const state=getFieldState(field,{...values,...(values.customFields||{})});
      if(!state.visible||!state.required)return false;
      const value=field.custom?values.customFields?.[field.key]??values[field.key]:values[field.key];
      return String(value??"").trim()==="";
    });
    if(missing){
      setError("Please fill the required field: "+missing.label);
      return;
    }
    if(values.isRecurring&&!values.recurringInterval){
      setError("Choose a recurring interval.");
      return;
    }

    try{
      setSaving(true);
      await onSubmit({
        ...values,
        tags:Array.isArray(values.tags)?values.tags:String(values.tags||"").split(",").map(item=>item.trim()).filter(Boolean),
        amount:Number(values.amount||0),
        taxRate:Number(values.taxRate||0),
        taxAmount:Number(values.taxAmount||0),
        clientId:values.clientId||null,
        orderId:values.orderId||null,
        recurringEndDate:values.recurringEndDate||null,
        recurringInterval:values.isRecurring?values.recurringInterval:null,
        customFields:values.customFields||{}
      });
    }catch(err){
      setError(err.response?.data?.message||err.message||"Unable to save expense.");
    }finally{setSaving(false);}
  };

  const receiptUpload=async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    try{
      setUploading(true);
      setError("");
      const data=await uploadReceipt(file);
      setForm(prev=>({...prev,receipt:data.receiptUrl}));
    }catch(err){
      setError(err.response?.data?.message||"Receipt upload failed.");
    }finally{setUploading(false);}
  };

  const fieldStateValues={...form,...(form.customFields||{})};

  return(
    <>
      <form onSubmit={submit} className="card p-4 bg-white shadow-sm border-0">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
          <div>
            <h3 className="mb-1">Expense</h3>
            <div className="small text-muted">Use your saved expense form layout. Customize it without code from the button above.</div>
          </div>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>setFormSettingsOpen(true)}>
            <i className="bi bi-sliders2 me-1"></i>Customize form
          </button>
        </div>

        {error&&<div className="alert alert-danger">{error}</div>}

        {expenseFormConfig.loading?(
          <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading form settings...</div>
        ):(
          <div className="row g-3">
            {sectionNames.map(section=>(
              <div className="col-12" key={section}>
                <div className="border rounded-3 p-3">
                  <div className="fw-semibold mb-3">{String(section).replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase())}</div>
                  <div className="row g-3">
                    {visibleFields.filter(field=>(field.section||"General")===section).map(field=>{
                      const state=getFieldState(field,fieldStateValues);
                      if(!state.visible)return null;
                      const lookupRecords=field.dataSource?.resource?(linkedRecords[field.dataSource.resource]||[]):[];
                      return(
                        <div className={`col-12 col-md-${field.width||6}`} key={field.key}>
                          <ConfiguredField
                            field={{...field,...state}}
                            value={valueFor(field)}
                            onChange={value=>updateField(field,value)}
                            lookupRecords={lookupRecords}
                            options={field.options}
                            required={state.required}
                            disabled={state.disabled}
                            readOnly={state.readOnly}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            <div className="col-12">
              <div className="border rounded-3 p-3">
                <div className="fw-semibold mb-1">Receipt</div>
                <div className="small text-muted mb-2">Upload an image or PDF receipt. This remains an attachment rather than a normal form field.</div>
                <input type="file" accept="image/*,.pdf" className="form-control" onChange={receiptUpload} disabled={uploading||saving}/>
                {uploading&&<div className="small text-muted mt-1">Uploading...</div>}
                {form.receipt&&<a className="d-inline-block mt-2" target="_blank" rel="noreferrer" href={form.receipt}>View uploaded receipt</a>}
              </div>
            </div>
          </div>
        )}

        <div className="d-flex justify-content-end mt-4">
          <button className="btn btn-primary px-4" type="submit" disabled={saving||uploading||expenseFormConfig.loading}>
            {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:"Save Expense"}
          </button>
        </div>
      </form>

      <FormConfigurator
        open={formSettingsOpen}
        onClose={()=>setFormSettingsOpen(false)}
        title="Customize Expense Form"
        subtitle="Arrange expense fields, add your own fields, connect Clients or Bills, create calculations and set rules."
        fields={expenseFormConfig.fields}
        saving={expenseFormConfig.saving}
        onSave={expenseFormConfig.save}
        onReset={async()=>{
          const defaults=await expenseFormConfig.reset();
          expenseFormConfig.setFields(defaults);
          setFormSettingsOpen(false);
        }}
      />
    </>
  );
}
