import React,{useEffect,useId,useMemo,useRef,useState} from "react";

const nameOf=record=>String(record?.companyName||record?.name||"").trim();
const normalize=value=>String(value??"").trim().toLocaleLowerCase();
const detailsOf=record=>[record?.phone,record?.email,record?.gstNumber].filter(Boolean).join(" · ");

export default function InvoiceCustomerPicker({field,clients=[],selectedClientId="",selectedLabel="",loading=false,required=false,disabled=false,onSelect,onCreateCustomer}){
  const root=useRef(null);
  const input=useRef(null);
  const id=useId();
  const [query,setQuery]=useState("");
  const [open,setOpen]=useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [draft,setDraft]=useState({companyName:"",name:"",phone:"",email:"",gstNumber:""});
  const selected=useMemo(()=>clients.find(item=>String(item?._id||"")===String(selectedClientId||""))||null,[clients,selectedClientId]);
  const selectedText=nameOf(selected)||String(selectedLabel||"").trim();
  const matches=useMemo(()=>{
    const needle=normalize(query);
    return (Array.isArray(clients)?clients:[])
      .filter(item=>!needle||[item.companyName,item.name,item.phone,item.email,item.gstNumber].some(value=>normalize(value).includes(needle)))
      .sort((a,b)=>nameOf(a).localeCompare(nameOf(b),undefined,{sensitivity:"base"}))
      .slice(0,12);
  },[clients,query]);

  useEffect(()=>{
    const close=event=>{
      if(root.current&&!root.current.contains(event.target)){setOpen(false);setQuery("");}
    };
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[]);

  const choose=record=>{
    onSelect?.(record||null);
    setOpen(false);setQuery("");setCreateOpen(false);setError("");
  };
  const startCreate=()=>{
    setDraft({companyName:String(query||"").trim(),name:"",phone:"",email:"",gstNumber:""});
    setError("");setOpen(false);setCreateOpen(true);
  };
  const update=(key,value)=>{
    setDraft(previous=>({...previous,[key]:value}));
    if(error)setError("");
  };
  const save=async()=>{
    if(!String(draft.companyName||"").trim()&&!String(draft.name||"").trim()){
      setError("Enter a customer or business name to continue.");return;
    }
    if(!onCreateCustomer){setError("Customer creation is unavailable. Please try again.");return;}
    setSaving(true);setError("");
    try{
      const created=await onCreateCustomer({
        companyName:String(draft.companyName||"").trim(),name:String(draft.name||"").trim(),
        phone:String(draft.phone||"").trim(),email:String(draft.email||"").trim(),
        gstNumber:String(draft.gstNumber||"").trim().toUpperCase(),
        accountStatus:"Active",paymentTerms:"30",discountRate:0,customFields:{}
      });
      if(!created?._id)throw new Error("The customer was saved but could not be selected. Refresh the customer list and try again.");
      choose(created);
    }catch(saveError){
      setError(saveError.response?.data?.message||saveError.message||"We could not save this customer. Check the details and try again.");
    }finally{setSaving(false);}
  };
  const keyDown=event=>{
    if(event.key==="Escape"){setOpen(false);setCreateOpen(false);setQuery("");}
    if(event.key==="Enter"&&open&&matches.length===1){event.preventDefault();choose(matches[0]);}
  };

  return(
    <div className="form-config-field invoice-customer-picker-field" data-field-key={field?.key||"companyName"} ref={root}>
      <label className="form-label form-entry-label" htmlFor={"invoice-customer-"+id}>
        {field?.label||"Customer"}
        {required?<span className="form-entry-required ms-2">Required</span>:<span className="form-entry-optional ms-2">Optional</span>}
      </label>
      <div className="invoice-customer-picker">
        <div className="invoice-customer-picker-input-wrap">
          <i className="bi bi-search invoice-customer-picker-search-icon" aria-hidden="true"></i>
          <input
            ref={input} id={"invoice-customer-"+id} type="search"
            className="form-control form-entry-control invoice-customer-picker-input"
            value={open?query:selectedText}
            placeholder="Search customer, phone, email or GSTIN"
            role="combobox" aria-autocomplete="list" aria-expanded={open}
            aria-controls={"invoice-customer-list-"+id} aria-required={required}
            autoComplete="off" disabled={disabled}
            onFocus={()=>{if(!disabled&&!open){setQuery("");setOpen(true);}}}
            onClick={()=>{if(!disabled)setOpen(true);}}
            onChange={event=>{setQuery(event.target.value);setOpen(true);setCreateOpen(false);setError("");}}
            onKeyDown={keyDown}
          />
          {selectedText&&!disabled&&<button type="button" className="invoice-customer-picker-clear" title="Clear customer" aria-label="Clear selected customer" onClick={()=>{choose(null);setOpen(true);input.current?.focus();}}><i className="bi bi-x-lg" aria-hidden="true"></i></button>}
        </div>
        {open&&(
          <div className="invoice-customer-picker-menu" id={"invoice-customer-list-"+id} role="listbox" aria-label="Customers">
            {loading?<div className="invoice-customer-picker-state"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Loading customers…</div>:
              matches.length?matches.map(record=>{
                const selectedOption=String(record._id||"")===String(selectedClientId||"");
                return <button type="button" role="option" aria-selected={selectedOption} key={String(record._id||nameOf(record))} className={"invoice-customer-option"+(selectedOption?" is-selected":"")} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(record)}>
                  <span className="invoice-customer-avatar" aria-hidden="true">{nameOf(record).charAt(0).toUpperCase()||"C"}</span>
                  <span className="invoice-customer-option-copy"><strong>{nameOf(record)||"Unnamed customer"}</strong><small>{detailsOf(record)||"No contact details added"}</small></span>
                  {selectedOption&&<i className="bi bi-check-circle-fill text-primary" aria-hidden="true"></i>}
                </button>;
              }):<div className="invoice-customer-picker-state">{query.trim()?"No matching customer found.":"No customers have been added yet."}</div>}
            {!disabled&&<button type="button" className="invoice-customer-create-trigger" onMouseDown={event=>event.preventDefault()} onClick={startCreate}>
              <span className="invoice-customer-create-icon"><i className="bi bi-plus-lg" aria-hidden="true"></i></span>
              <span><strong>{query.trim()?"Create a new customer":"Add a new customer"}</strong><small>{query.trim()?"Start a customer record with the name you searched":"Create without leaving this invoice"}</small></span>
              <i className="bi bi-arrow-right ms-auto" aria-hidden="true"></i>
            </button>}
          </div>
        )}
      </div>
      {selectedText&&!open&&<div className="invoice-customer-selected-hint"><i className="bi bi-check-circle-fill" aria-hidden="true"></i>{selected?detailsOf(selected)||"Customer selected":"This invoice has a customer name but no saved customer link. Select a saved customer to link it."}</div>}
      {createOpen&&<div className="invoice-customer-create-panel">
        <div className="invoice-customer-create-heading"><div><strong>Add a new customer</strong><p>Save the customer here, then continue with this invoice.</p></div><button type="button" className="btn btn-sm btn-light border" onClick={()=>{setCreateOpen(false);setError("");}} disabled={saving}>Cancel</button></div>
        <div className="row g-2">
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={"invoice-new-company-"+id}>Customer / business name</label><input id={"invoice-new-company-"+id} className="form-control form-entry-control" value={draft.companyName} onChange={event=>update("companyName",event.target.value)} placeholder="e.g. ABC Traders" disabled={saving}/></div>
          <div className="col-12 col-md-6"><label className="form-label" htmlFor={"invoice-new-name-"+id}>Contact person</label><input id={"invoice-new-name-"+id} className="form-control form-entry-control" value={draft.name} onChange={event=>update("name",event.target.value)} placeholder="Contact person name" disabled={saving}/></div>
          <div className="col-12 col-sm-6 col-lg-4"><label className="form-label" htmlFor={"invoice-new-phone-"+id}>Phone number</label><input id={"invoice-new-phone-"+id} type="tel" className="form-control form-entry-control" value={draft.phone} onChange={event=>update("phone",event.target.value)} placeholder="Phone number" disabled={saving}/></div>
          <div className="col-12 col-sm-6 col-lg-4"><label className="form-label" htmlFor={"invoice-new-email-"+id}>Email address</label><input id={"invoice-new-email-"+id} type="email" className="form-control form-entry-control" value={draft.email} onChange={event=>update("email",event.target.value)} placeholder="Email (optional)" disabled={saving}/></div>
          <div className="col-12 col-sm-6 col-lg-4"><label className="form-label" htmlFor={"invoice-new-gst-"+id}>GSTIN</label><input id={"invoice-new-gst-"+id} className="form-control form-entry-control" value={draft.gstNumber} onChange={event=>update("gstNumber",event.target.value.toUpperCase())} placeholder="GST number (optional)" maxLength={15} disabled={saving}/></div>
        </div>
        {error&&<div className="alert alert-danger py-2 mt-3 mb-0" role="alert">{error}</div>}
        <div className="invoice-customer-create-actions"><span className="small text-secondary">Address and other details can be added to the customer profile later.</span><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving customer…</>:<><i className="bi bi-person-plus me-2" aria-hidden="true"></i>Save and select</>}</button></div>
      </div>}
    </div>
  );
}
