import React,{useEffect,useMemo,useState} from "react";
import {useNavigate,useSearchParams} from "react-router-dom";
import axios from "axios";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import {PROFILE_FORM_FIELDS} from "../config/noCodeCatalog";
import {
  buildConfiguredDefaults,
  getFieldState,
  hydrateConfiguredValues,
  syncConfiguredCustomFields,
  useFormConfiguration
} from "../hooks/useFormConfiguration";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const blankProfile=()=>buildConfiguredDefaults({
  headerTitle:"",
  companyName:"",
  companyAddress:"",
  phoneNumber1:"",
  phoneNumber2:"",
  gstin:"",
  pan:"",
  bankName:"",
  accountNo:"",
  branchName:"",
  ifsc:"",
  pinCode:"",
  stateCode:"",
  billNoPrefix:"",
  billNoSequence:1,
  billNoSuffix:"",
  eWayUserName:"",
  eWayPassword:"",
  customFields:{}
},PROFILE_FORM_FIELDS);

export default function Profile(){
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const {fields,loading:formLoading,save:saveForm,reset:resetForm,saving:formSaving}=useFormConfiguration("profile.form",PROFILE_FORM_FIELDS);
  const profileFields=useMemo(()=>fields||PROFILE_FORM_FIELDS,[fields]);
  const [profile,setProfile]=useState(blankProfile);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [successMessage,setSuccessMessage]=useState("");

  const builderOpen=searchParams.get("customize")==="form";
  const profilePrimaryKeys=new Set(["headerTitle","companyName","companyAddress","phoneNumber1"]);
  const primaryProfileFields=profileFields.filter(field=>{
    const state=getFieldState(field,{...profile,...(profile.customFields||{})});
    return state.visible&&(state.required||profilePrimaryKeys.has(field.key));
  });
  const primaryProfileKeySet=new Set(primaryProfileFields.map(field=>field.key));
  const additionalProfileFields=profileFields.filter(field=>!primaryProfileKeySet.has(field.key));
  const renderProfileField=field=>{
    const state=getFieldState(field,{...profile,...(profile.customFields||{})});
    if(!state.visible)return null;
    return(
      <div className={`col-md-${Math.min(12,Math.max(1,Number(field.width)||6))}`} key={field.key}>
        <ConfiguredField
          field={{...field,...state}}
          value={profile[field.key]??profile.customFields?.[field.key]??field.defaultValue??""}
          onChange={value=>{setSuccessMessage("");updateValue(field.key,value);}}
          required={state.required}
          readOnly={state.readOnly}
          disabled={state.disabled}
        />
      </div>
    );
  };

  const load=async()=>{
    try{
      setLoading(true);
      const response=await axios.get(API+"/api/profile",auth());
      setProfile(hydrateConfiguredValues({...blankProfile(),...(response.data||{})},profileFields));
      setError("");
      setSuccessMessage("");
    }catch(loadError){
      setError(loadError.response?.data?.message||"Unable to load company profile.");
    }finally{setLoading(false);}
  };

  useEffect(()=>{load();},[]);

  const updateValue=(key,value)=>{
    setProfile(previous=>syncConfiguredCustomFields({...previous,[key]:value},profileFields));
  };

  const save=async event=>{
    event.preventDefault();
    const next=syncConfiguredCustomFields(profile,profileFields);
    setError("");
    setSuccessMessage("");
    try{
      setSaving(true);
      const response=await axios.put(API+"/api/profile",next,auth());
      setProfile(hydrateConfiguredValues(response.data||next,profileFields));
      setError("");
      setSuccessMessage("Company profile saved. These details will be used on your invoices.");
    }catch(saveError){
      setError(saveError.response?.data?.message||"We could not save the company details. Please check the fields and try again.");
    }finally{setSaving(false);}
  };

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h2 className="mb-1">Company details</h2>
          <div className="text-muted small">Add the details you want printed on invoices. Bank, tax and E-Way Bill information can be added later.</div>
        </div>
        <button type="button" className="btn btn-light border" onClick={()=>navigate("/profile?customize=form")}>
          <i className="bi bi-sliders me-1"></i>Customize profile form
        </button>
      </div>

      {error&&<div className="alert alert-danger" role="alert">{error}</div>}
      {successMessage&&<div className="alert alert-success d-flex align-items-center gap-2" role="status"><i className="bi bi-check-circle-fill"></i><span>{successMessage}</span><button type="button" className="btn-close ms-auto" aria-label="Dismiss message" onClick={()=>setSuccessMessage("")}></button></div>}

      <div className="card shadow-sm border-0">
        <div className="card-body">
          {loading||formLoading
            ? <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading profile...</div>
            : <form onSubmit={save}>
                <section className="profile-quick-fields">
                  <div className="profile-fields-heading">
                    <span className="profile-step-number">1</span>
                    <div>
                      <h6 className="mb-1">Invoice header</h6>
                      <p className="mb-0">Start with your company name. Add address and phone if you want them to appear on printed invoices.</p>
                    </div>
                  </div>
                  <div className="row g-3">{primaryProfileFields.map(renderProfileField)}</div>
                </section>
                {additionalProfileFields.some(field=>getFieldState(field,{...profile,...(profile.customFields||{})}).visible)&&(
                  <details className="profile-additional-details mt-3">
                    <summary><i className="bi bi-plus-circle me-2"></i>More company details <span>GST/PAN, bank details, invoice numbering and E-Way Bill setup</span></summary>
                    <div className="row g-3 p-3">{additionalProfileFields.map(renderProfileField)}</div>
                  </details>
                )}
                <div className="d-flex justify-content-end mt-4">
                  <button type="submit" className="btn btn-primary px-4" disabled={saving}>
                    {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:"Save company profile"}
                  </button>
                </div>
              </form>}
        </div>
      </div>

      <FormConfigurator
        open={builderOpen}
        onClose={()=>navigate("/profile")}
        title="Customize company profile"
        subtitle="Arrange fields, add your own business information, set visibility, rules and validations."
        fields={profileFields}
        onSave={saveForm}
        onReset={resetForm}
        saving={formSaving}
      />
    </div>
  );
}
