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

  const primaryExpenseKeys=new Set(["date","description","amount","category"]);
  const currentExpenseValues={...form,...(form.customFields||{})};
  const primaryFields=visibleFields.filter(field=>{
    const state=getFieldState(field,currentExpenseValues);
    return state.visible&&(state.required||primaryExpenseKeys.has(field.key));
  });
  const primaryFieldKeys=new Set(primaryFields.map(field=>field.key));
  const additionalFields=visibleFields.filter(field=>!primaryFieldKeys.has(field.key));
  const sectionNames=useMemo(()=>[...new Set(additionalFields.map(field=>field.section||"General"))],[additionalFields]);

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
  const renderExpenseField=field=>{
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
  };

  return(
    <>
      <form onSubmit={submit} className="card p-4 bg-white shadow-sm border-0">
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
          <div>
            <h3 className="mb-1">{initialData?._id?"Edit expense":"Add an expense"}</h3>
            <div className="small text-muted">Enter what you spent and what it was for. Other details are optional.</div>
          </div>
          <details className="expense-form-options">
            <summary><i className="bi bi-three-dots me-1"></i>More options</summary>
            <div className="expense-form-options-panel">
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>setFormSettingsOpen(true)}>
                <i className="bi bi-sliders2 me-1"></i>Customize fields
              </button>
            </div>
          </details>
        </div>

        {error&&<div className="alert alert-danger" role="alert">{error}</div>}

        {expenseFormConfig.loading?(
          <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading expense details...</div>
        ):(
          <>
            <section className="expense-quick-fields">
              <div className="expense-fields-heading">
                <span className="expense-step-number">1</span>
                <div>
                  <h6 className="mb-1">Expense basics</h6>
                  <p className="mb-0">Enter the date, what you spent money on, the amount and the type of expense.</p>
                </div>
              </div>
              <div className="row g-3">{primaryFields.map(renderExpenseField)}</div>
            </section>

            {additionalFields.some(field=>getFieldState(field,fieldStateValues).visible)&&(
              <details className="expense-additional-details mt-3">
                <summary><i className="bi bi-plus-circle me-2"></i>More details <span>Short title, payment method, GST, customer links and other optional information</span></summary>
                <div className="expense-additional-details-body">
                  {sectionNames.map(section=>{
                    const sectionFields=additionalFields.filter(field=>(field.section||"General")===section);
                    if(!sectionFields.some(field=>getFieldState(field,fieldStateValues).visible))return null;
                    return(
                      <section className="expense-detail-section mb-3" key={section}>
                        <h6>{String(section).replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase())}</h6>
                        <div className="row g-3">{sectionFields.map(renderExpenseField)}</div>
                      </section>
                    );
                  })}
                  <div className="expense-detail-section">
                    <h6>Receipt</h6>
                    <div className="small text-muted mb-2">Optional. Add an image or PDF receipt for your records.</div>
                    <input type="file" accept="image/*,.pdf" className="form-control" onChange={receiptUpload} disabled={uploading||saving}/>
                    {uploading&&<div className="small text-muted mt-1">Uploading receipt...</div>}
                    {form.receipt&&<a className="d-inline-block mt-2" target="_blank" rel="noreferrer" href={form.receipt}>View uploaded receipt</a>}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
<div className="d-flex justify-content-end mt-4">
          <button className="btn btn-primary px-4" type="submit" disabled={saving||uploading||expenseFormConfig.loading}>
            {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:"Save expense"}
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
