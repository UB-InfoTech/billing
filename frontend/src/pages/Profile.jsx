import React,{useEffect,useMemo,useRef,useState} from "react";
import {useNavigate,useSearchParams} from "react-router-dom";
import axios from "axios";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import {PROFILE_FORM_FIELDS} from "../config/noCodeCatalog";
import {
  applyFormulas,
  buildConfiguredDefaults,
  getFieldState,
  groupFieldsBySection,
  hydrateConfiguredValues,
  syncConfiguredCustomFields,
  useFormConfiguration
} from "../hooks/useFormConfiguration";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const blankProfile=()=>buildConfiguredDefaults({
  headerTitle:"",
  companyName:"",
  legalName:"",
  organizationType:"",
  industry:"",
  contactPerson:"",
  emailAddress:"",
  website:"",
  companyAddress:"",
  addressLine2:"",
  city:"",
  district:"",
  state:"",
  country:"India",
  phoneNumber1:"",
  phoneNumber2:"",
  gstin:"",
  pan:"",
  tan:"",
  cin:"",
  udyamNumber:"",
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
  const [logoUploading,setLogoUploading]=useState(false);
  const [logoRemoving,setLogoRemoving]=useState(false);
  const logoInputRef=useRef(null);

  const builderOpen=searchParams.get("customize")==="form";
  const profilePrimaryKeys=new Set([
    "headerTitle","companyName","legalName","organizationType","industry",
    "contactPerson","emailAddress","website","companyAddress","addressLine2",
    "city","district","state","country","pinCode","stateCode","phoneNumber1","phoneNumber2"
  ]);
  const primaryProfileFields=profileFields.filter(field=>{
    const state=getFieldState(field,{...profile,...(profile.customFields||{})});
    return state.visible&&(state.required||profilePrimaryKeys.has(field.key));
  });
  const primaryProfileGroups=groupFieldsBySection(primaryProfileFields);
  const primaryProfileKeySet=new Set(primaryProfileFields.map(field=>field.key));
  const additionalProfileFields=profileFields.filter(field=>!primaryProfileKeySet.has(field.key));
  const renderProfileField=field=>{
    const state=getFieldState(field,{...profile,...(profile.customFields||{})});
    if(!state.visible)return null;
    return(
      <div className={`col-md-${Math.min(12,Math.max(1,Number(field.width)||6))}`} key={field.key}>
        <ConfiguredField
          field={{
            ...field,
            ...state,
            ...(field.key==="eWayPassword"?{
              helpText:profile.hasEWayPassword
                ?"A password is saved on the server. Leave blank to keep it unchanged, or enter a new password to replace it."
                :"Enter the E-Way Bill password. It will not be returned to the browser after saving."
            }:{})
          }}
          value={profile[field.key]??profile.customFields?.[field.key]??field.defaultValue??""}
          placeholder={field.key==="eWayPassword"&&profile.hasEWayPassword?"Leave blank to keep the saved password":undefined}
          onChange={value=>{setSuccessMessage("");updateValue(field.key,value);}}
          required={state.required}
          readOnly={state.readOnly}
          disabled={state.disabled}
        />
      </div>
    );
  };

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try{
        setLoading(true);
        const response=await axios.get(API+"/api/profile",auth());
        if(!active)return;
        const hydrated=hydrateConfiguredValues(
          {...blankProfile(),...(response.data||{})},
          profileFields
        );
        setProfile(applyFormulas(profileFields,hydrated));
        setError("");
        setSuccessMessage("");
      }catch(loadError){
        if(active)setError(loadError.response?.data?.message||"Unable to load organization profile.");
      }finally{
        if(active)setLoading(false);
      }
    };
    load();
    return()=>{active=false;};
  },[profileFields]);

  const updateValue=(key,value)=>{
    setProfile(previous=>applyFormulas(
      profileFields,
      syncConfiguredCustomFields({...previous,[key]:value},profileFields)
    ));
  };

  const handleLogoFileChange=async event=>{
    const file=event.target.files?.[0];
    event.target.value="";
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){
      setError("Choose a JPG, PNG or WebP image for your organization logo.");
      return;
    }
    if(file.size>2*1024*1024){
      setError("The organization logo must be 2 MB or smaller.");
      return;
    }

    const formData=new FormData();
    formData.append("logo",file);
    setError("");
    setSuccessMessage("");
    try{
      setLogoUploading(true);
      const response=await axios.post(API+"/api/profile/logo",formData,auth());
      setProfile(previous=>({...previous,logoUrl:response.data?.logoUrl||""}));
      setSuccessMessage("Organization logo uploaded and will appear on your invoices.");
    }catch(uploadError){
      setError(uploadError.response?.data?.message||"Unable to upload the organization logo.");
    }finally{
      setLogoUploading(false);
    }
  };

  const removeLogo=async()=>{
    if(!profile.logoUrl||logoRemoving)return;
    setError("");
    setSuccessMessage("");
    try{
      setLogoRemoving(true);
      await axios.delete(API+"/api/profile/logo",auth());
      setProfile(previous=>({...previous,logoUrl:""}));
      setSuccessMessage("Organization logo removed. Your invoices will use the text-only header.");
    }catch(removeError){
      setError(removeError.response?.data?.message||"Unable to remove the organization logo.");
    }finally{
      setLogoRemoving(false);
    }
  };

  const save=async event=>{
    event.preventDefault();
    const next=applyFormulas(profileFields,syncConfiguredCustomFields(profile,profileFields));
    const validationValues={...next,...(next.customFields||{})};
    const missing=profileFields.filter(field=>!field.formula).find(field=>{
      const state=getFieldState(field,validationValues);
      if(!state.visible||!state.required||state.disabled)return false;
      const value=field.custom?next.customFields?.[field.key]??next[field.key]:next[field.key];
      return String(value??"").trim()==="";
    });
    if(missing){
      setError("Please complete “"+missing.label+"” before saving.");
      return;
    }
    setError("");
    setSuccessMessage("");
    try{
      setSaving(true);
      const response=await axios.put(API+"/api/profile",next,auth());
      setProfile(applyFormulas(profileFields,hydrateConfiguredValues(response.data||next,profileFields)));
      setError("");
      setSuccessMessage("Organization profile saved. These details will be used on your invoices.");
    }catch(saveError){
      setError(saveError.response?.data?.message||"We could not save the organization details. Please check the fields and try again.");
    }finally{setSaving(false);}
  };

  const logoPreviewUrl=profile.logoUrl
    ?(String(profile.logoUrl).startsWith("http://")||String(profile.logoUrl).startsWith("https://")
      ?profile.logoUrl
      :API+profile.logoUrl)
    :"";

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2">
        <div>
          <h2 className="mb-1">Organization profile</h2>
          <div className="text-muted small">Enter your organization name, legal details, contact information and address. Tax registrations, bank details and invoice settings can be added now or later.</div>
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
                <section className="d-flex align-items-center flex-wrap gap-3 border rounded-3 p-3 mb-4">
                  <div className="d-flex align-items-center justify-content-center rounded-2 border bg-light flex-shrink-0" style={{width:112,height:88}}>
                    {logoPreviewUrl
                      ? <img src={logoPreviewUrl} alt="Organization logo" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
                      : <span className="text-muted small text-center px-2">No logo uploaded</span>}
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="mb-1">Organization logo <span className="text-muted fw-normal small">(optional)</span></h6>
                    <p className="text-muted small mb-2">Your logo appears in the header of printed invoices. Use a clear JPG, PNG or WebP image up to 2 MB.</p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="d-none"
                      onChange={handleLogoFileChange}
                    />
                    <div className="d-flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={()=>logoInputRef.current?.click()}
                        disabled={logoUploading||logoRemoving}
                      >
                        {logoUploading
                          ? <><span className="spinner-border spinner-border-sm me-1"></span>Uploading...</>
                          : profile.logoUrl?"Change logo":"Upload logo"}
                      </button>
                      {profile.logoUrl&&(
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={removeLogo}
                          disabled={logoUploading||logoRemoving}
                        >
                          {logoRemoving
                            ? <><span className="spinner-border spinner-border-sm me-1"></span>Removing...</>
                            :"Remove logo"}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
                <section className="profile-quick-fields">
                  {primaryProfileGroups.map(group=>(
                    <section className="profile-primary-group mb-4" key={group.key}>
                      <div className="profile-fields-heading">
                        <div>
                          <h6 className="mb-1">{group.label}</h6>
                          <p className="mb-0">
                            {group.key==="organization"||group.key==="company"
                              ? "Use the name and legal structure that identify your business."
                              : group.key==="contact"
                                ? "Add the details customers can use to contact your organization."
                                : group.key==="address"
                                  ? "Enter the business address used for correspondence and invoices."
                                  : "Complete the details your business needs."}
                          </p>
                        </div>
                      </div>
                      <div className="row g-3">{group.fields.map(renderProfileField)}</div>
                    </section>
                  ))}
                </section>
                {additionalProfileFields.some(field=>getFieldState(field,{...profile,...(profile.customFields||{})}).visible)&&(
                  <details className="profile-additional-details mt-3">
                    <summary><i className="bi bi-plus-circle me-2"></i>Registrations, banking and billing <span>GST, PAN, CIN, Udyam, bank details, invoice numbering and E-Way Bill setup</span></summary>
                    <div className="row g-3 p-3">{additionalProfileFields.map(renderProfileField)}</div>
                  </details>
                )}
                <div className="d-flex justify-content-end mt-4">
                  <button type="submit" className="btn btn-primary px-4" disabled={saving}>
                    {saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:"Save organization profile"}
                  </button>
                </div>
              </form>}
        </div>
      </div>

      <FormConfigurator
        open={builderOpen}
        onClose={()=>navigate("/profile")}
        title="Customize organization profile"
        subtitle="Arrange organization fields, add your own business information, set visibility, rules and validations."
        fields={profileFields}
        onSave={saveForm}
        onReset={resetForm}
        saving={formSaving}
      />
    </div>
  );
}
