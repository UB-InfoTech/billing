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

  const builderOpen=searchParams.get("customize")==="form";

  const load=async()=>{
    try{
      setLoading(true);
      const response=await axios.get(API+"/api/profile",auth());
      setProfile(hydrateConfiguredValues({...blankProfile(),...(response.data||{})},profileFields));
      setError("");
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
    try{
      setSaving(true);
      const response=await axios.put(API+"/api/profile",next,auth());
      setProfile(hydrateConfiguredValues(response.data||next,profileFields));
      setError("");
    }catch(saveError){
      setError(saveError.response?.data?.message||"Unable to save company profile.");
    }finally{setSaving(false);}
  };

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h2 className="mb-1">Company Profile</h2>
          <div className="text-muted small">Manage company identity, banking details, bill numbering and E-Way Bill credentials.</div>
        </div>
        <button type="button" className="btn btn-light border" onClick={()=>navigate("/profile?customize=form")}>
          <i className="bi bi-sliders me-1"></i>Customize profile form
        </button>
      </div>

      {error&&<div className="alert alert-danger">{error}</div>}

      <div className="card shadow-sm border-0">
        <div className="card-body">
          {loading||formLoading
            ? <div className="text-center py-5"><span className="spinner-border spinner-border-sm me-2"></span>Loading profile...</div>
            : <form onSubmit={save}>
                <div className="row g-3">
                  {profileFields.map(field=>{
                    const state=getFieldState(field,profile);
                    if(!state.visible)return null;
                    return (
                      <div className={`col-md-${Math.min(12,Math.max(1,Number(field.width)||6))}`} key={field.key}>
                        <ConfiguredField
                          field={field}
                          value={profile[field.key]}
                          onChange={value=>updateValue(field.key,value)}
                          required={state.required}
                          readOnly={state.readOnly}
                          disabled={state.disabled}
                        />
                      </div>
                    );
                  })}
                </div>
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
