import BusinessPageHeader from "../components/BusinessPageHeader";
import React, { useEffect, useState, useMemo, useRef } from 'react';
import {useSearchParams} from "react-router-dom";
import {CLIENT_FORM_FIELDS} from "../config/noCodeCatalog";
import axios from 'axios';
import DynamicTable from '../components/DynamicTable';
import FormConfigurator from '../components/FormConfigurator';
import ConfiguredField from '../components/ConfiguredField';
import ClientActivityPanel from "../components/ClientActivityPanel";
import {useFormConfiguration,applyFormulas,applyAutoFill,getFieldState,syncConfiguredCustomFields,buildConfiguredDefaults,buildNewRecordDefaults,groupFieldsBySection} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";
import * as XLSX from 'xlsx';

const indianStates=[
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh",
  "Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir",
  "Ladakh","Lakshadweep","Puducherry"
];

function Clients() {
  const [searchParams,setSearchParams]=useSearchParams();

  const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
  
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewingClient,setViewingClient]=useState(null);
  const [clientProfileTab,setClientProfileTab]=useState("activity");
  const [statementFor,setStatementFor]=useState(null);
  const [statementData,setStatementData]=useState(null);
  const [statementLoading,setStatementLoading]=useState(false);
  const [statementError,setStatementError]=useState("");
  const [statementFrom,setStatementFrom]=useState("");
  const [statementTo,setStatementTo]=useState("");
  const statementRequestRef=useRef(0);
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    state: '',
    city: '',
    pinCode: '',
    stateCode: '',
    gstNumber: '',
    companyName: '',
    businessType: '',
    paymentTerms: '30',
    discountRate: 0,
    accountStatus: 'Active',
    notes: '',
    customFields: {}
  });

  // -----
  const [loading, setLoading] = useState(false);
  const [clientsLoadError,setClientsLoadError]=useState("");
  const [formSaving,setFormSaving]=useState(false);
  const [formError,setFormError]=useState("");
  const [pageMessage,setPageMessage]=useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [filters, setFilters] = useState({
    businessType: '',
    accountStatus: '',
    minRevenue: '',
    maxRevenue: ''
  });

  const [sortKey, setSortKey] = useState('companyName'); // default
  const [sortClient, setSortClient] = useState('asc'); // default


  const [editingClient, setEditingClient] = useState(null);
  const [formSettingsOpen,setFormSettingsOpen]=useState(false);
  const [tableCustomizeRequested,setTableCustomizeRequested]=useState(false);

  useEffect(()=>{
    const customize=searchParams.get("customize");
    const action=searchParams.get("action");
    if(customize==="table")setTableCustomizeRequested(true);
    if(customize==="form")setFormSettingsOpen(true);
    if(action==="new"){
      setEditingClient(null);
      setNewClient(emptyClient());
      setFormError("");
      setPageMessage("");
      setShowModal(true);
    }
    if(customize||action){
      searchParams.delete("customize");
      searchParams.delete("action");
      setSearchParams(searchParams,{replace:true});
    }
  },[searchParams,setSearchParams]);

  useEffect(()=>{
    const clientId=searchParams.get("openClient");
    if(!clientId)return;
    const params=new URLSearchParams(searchParams);
    params.delete("openClient");
    setSearchParams(params,{replace:true});
    axios.get(linkone+"/api/clients/"+encodeURIComponent(clientId),{
      headers:{"x-auth-token":localStorage.getItem("token")||""}
    }).then(response=>{
      setClientProfileTab("activity");
      setViewingClient(response.data);
    }).catch(error=>{
      setPageMessage(error.response?.data?.message||"That customer profile could not be opened.");
    });
  },[searchParams,setSearchParams,linkone]);

  const clientFormConfig=useFormConfiguration("clients.form",CLIENT_FORM_FIELDS);
  const linkedClientSources=useMemo(()=>Array.from(new Set(clientFormConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean))),[clientFormConfig.fields]);
  const {records:linkedRecords,searchRecords:searchLinkedRecords}=useNoCodeDataSources(linkedClientSources);

  const clientDefaultsAppliedRef=useRef(false);
  useEffect(()=>{
    if(clientFormConfig.loading||clientDefaultsAppliedRef.current)return;
    clientDefaultsAppliedRef.current=true;
    if(showModal&&!editingClient){
      setNewClient(previous=>applyFormulas(
        clientFormConfig.fields,
        buildNewRecordDefaults(previous,clientFormConfig.fields)
      ));
    }
  },[clientFormConfig.loading,clientFormConfig.fields,showModal,editingClient]);
  const clientValue=field=>field.custom
    ? newClient.customFields?.[field.key]??newClient[field.key]??field.defaultValue??""
    : newClient[field.key]??field.defaultValue??"";
  const updateClientField=(field,value,record=null)=>{
    setFormError("");
    setNewClient(prev=>{
      let next=field.custom
        ? {...prev,[field.key]:value,customFields:{...(prev.customFields||{}),[field.key]:value}}
        : {...prev,[field.key]:value};
      if(field?.dataSource?.autoFill?.length)next=applyAutoFill(field,record,next);
      next=syncConfiguredCustomFields(next,clientFormConfig.fields);
      return applyFormulas(clientFormConfig.fields,next);
    });
  };
  const visibleClientFields=clientFormConfig.fields.filter(field=>field.visible!==false);
  const clientFormSections=groupFieldsBySection(visibleClientFields);
  const emptyClient=()=>applyFormulas(
    clientFormConfig.fields,
    buildNewRecordDefaults({name:"",email:"",phone:"",address:"",state:"",city:"",pinCode:"",stateCode:"",gstNumber:"",companyName:"",businessType:"",paymentTerms:"30",discountRate:0,accountStatus:"Active",notes:"",customFields:{}},clientFormConfig.fields)
  );
  const renderClientField=field=>{
    const state=getFieldState(field,{...newClient,...(newClient.customFields||{})});
    if(!state.visible)return null;
    const source=field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[];
    const common={
      field:{...field,required:state.required,readOnly:state.readOnly,disabled:state.disabled||clientFormConfig.loading},
      value:clientValue(field),
      autoFocus:field.key==="companyName",
      onChange:value=>updateClientField(field,value,null),
      onRecordChange:record=>updateClientField(field,record?.[field.dataSource?.valueField||"_id"]??"",record),
      lookupRecords:source,
      onLookupSearch:searchLinkedRecords
    };
    if(field.key==="state"&&!field.dataSource?.resource){
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} options={indianStates}/></div>;
    }
    if(field.key==="city"&&!field.dataSource?.resource){
      const cityChoices=Array.isArray(field.options)?field.options:[];
      if(cityChoices.length){
        return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} options={cityChoices}/></div>;
      }
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} field={{...common.field,fieldType:"text"}}/></div>;
    }
    if(field.key==="companyName"&&!field.custom&&!field.dataSource?.resource){
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} listId="clientCompanyName" listOptions={clients.map(client=>client.companyName)}/></div>;
    }
    if(field.key==="gstNumber"&&!field.custom&&!field.dataSource?.resource){
      const suffix=(
        <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={()=>{
          const gst=String(newClient.gstNumber||"").trim().toUpperCase();
          if(!gst){setFormError("Enter the GST number first.");return;}
          const gstRegex=/^(0[1-9]|1[0-9]|2[0-9]|3[0-7])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
          if(!gstRegex.test(gst)){setFormError("Enter a valid 15-character GST number.");return;}
          fetchGstDetails(gst);
        }}>Fetch GST details</button>
      );
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} suffix={suffix}/></div>;
    }
    return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common}/></div>;
  };

  useEffect(() => {
    // setLoading(true);
    fetchClients();
    // setLoading(false);
  }, []);

  const token = localStorage.getItem('token');
  const authConfig = { headers: { "x-auth-token": token || "" } };
  const fetchCustomerStatement=async(client,from=statementFrom,to=statementTo)=>{
    if(!client?._id)return;
    const requestId=++statementRequestRef.current;
    setStatementLoading(true);
    setStatementError("");
    try{
      const params={};
      if(from)params.from=from;
      if(to)params.to=to;
      const response=await axios.get(`${linkone}/api/clients/${client._id}/statement`,{
        headers:{"x-auth-token":token||""},
        params
      });
      if(requestId===statementRequestRef.current)setStatementData(response.data?.statement||null);
    }catch(error){
      if(requestId===statementRequestRef.current){
        setStatementData(null);
        setStatementError(error.response?.data?.message||"The customer statement could not be prepared. Try again.");
      }
    }finally{
      if(requestId===statementRequestRef.current)setStatementLoading(false);
    }
  };
  const openCustomerStatement=client=>{
    setStatementFor(client);
    setStatementData(null);
    setStatementError("");
    setStatementFrom("");
    setStatementTo("");
    setViewingClient(null);
    fetchCustomerStatement(client,"","");
  };
  const openClientProfile=client=>{
    setClientProfileTab("activity");
    setViewingClient(client);
  };
  const closeCustomerStatement=()=>{
    statementRequestRef.current+=1;
    setStatementFor(null);
    setStatementData(null);
    setStatementError("");
    if(statementFor)setViewingClient(statementFor);
  };
  const statementMoney=value=>`₹${Number(value||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const statementDate=value=>{
    const parsed=value?new Date(value):null;
    return parsed&&!Number.isNaN(parsed.getTime())?parsed.toLocaleDateString("en-IN"):"—";
  };
  const fetchClients = async () => {
    setLoading(true);
    setClientsLoadError("");
    try {
      const response = await axios.get(`${linkone}/api/clients`, {
        headers: {'x-auth-token': token}
      });
      setClients(Array.isArray(response.data)?response.data:[]);
    } catch (error) {
      if (error.response?.data?.msg === "Token is not valid") {
        localStorage.removeItem("token");
        window.location.reload();
        return;
      }
      setClientsLoadError(error.response?.data?.message||"Customers could not be loaded. Refresh the page to try again.");
      console.error("Error fetching customers",error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGstDetails = async (gstNumber) => {
    setFormError("");
    try {
      const stateCode = gstNumber.slice(0, 2);
      const pan = gstNumber.slice(2, 12);
      const entityNumber = gstNumber[12];
      const gstinStates = {
        '01': 'Jammu and Kashmir',
        '02': 'Himachal Pradesh',
        '03': 'Punjab',
        '04': 'Chandigarh',
        '05': 'Uttarakhand',
        '06': 'Haryana',
        '07': 'Delhi',
        '08': 'Rajasthan',
        '09': 'Uttar Pradesh',
        '10': 'Bihar',
        '11': 'Sikkim',
        '12': 'Arunachal Pradesh',
        '13': 'Nagaland',
        '14': 'Manipur',
        '15': 'Mizoram',
        '16': 'Tripura',
        '17': 'Meghalaya',
        '18': 'Assam',
        '19': 'West Bengal',
        '20': 'Jharkhand',
        '21': 'Odisha',
        '22': 'Chhattisgarh',
        '23': 'Madhya Pradesh',
        '24': 'Gujarat',
        // '25': 'Daman and Diu',//
        '26': 'Dadra and Nagar Haveli and Daman and Diu',
        '27': 'Maharashtra',
        // '28': 'Andhra Pradesh (Old)', // /?
        '29': 'Karnataka',
        '30': 'Goa',
        '31': 'Lakshadweep',
        '32': 'Kerala',
        '33': 'Tamil Nadu',
        '34': 'Puducherry',
        '35': 'Andaman and Nicobar Islands',//
        '36': 'Telangana',
        '37': 'Andhra Pradesh',
        '38': 'Ladakh',
        '97': 'Other Territory',
        '99': 'Other Country'
      };

      const stateName = gstinStates[stateCode] || 'Unknown';

      const response = await axios.get(`${linkone}/api/gstdetails/${gstNumber}`, authConfig);

      if (!response.data || !response.data.success) {
        throw new Error('Failed to fetch GST details');
      }

      const gstData = response.data.data;

      setNewClient(prev => ({
        ...prev,
        stateCode: gstData.stateCode || stateCode,
        name: gstData.tradeName || '',
        address: `${gstData.address1 || ''}, ${gstData.address2 || ''}`,
        pinCode: gstData.pinCode,
        companyName: gstData.legalName,
        accountStatus: gstData.status === 'ACT' ? 'Active' : 'Inactive',
        state: stateName,
        // stateCode: stateCode,
      }));

      // return gstData;
    } catch (error) {
      setFormError("GST details could not be fetched. Check the GST number and try again.");
      // return null;
    }
  };

  const missingRequiredCustomerField=values=>{
    const prepared={...values,...(values.customFields||{})};
    return clientFormConfig.fields.find(field=>{
      const state=getFieldState(field,prepared);
      if(!state.visible||!state.required||state.disabled)return false;
      const value=field.custom
        ? values.customFields?.[field.key]??values[field.key]
        : values[field.key];
      return String(value??"").trim()==="";
    });
  };

  const handleAddClient = async event => {
    event.preventDefault();
    setFormError("");
    setPageMessage("");
    const prepared=applyFormulas(clientFormConfig.fields,syncConfiguredCustomFields(newClient,clientFormConfig.fields));
    const missing=missingRequiredCustomerField(prepared);
    if(missing){
      setFormError(`Please complete “${missing.label}” before saving.`);
      return;
    }

    try {
      setFormSaving(true);
      await axios.post(`${linkone}/api/clients`, prepared, {
        headers: {'x-auth-token': token}
      });
      setShowModal(false);
      setNewClient(emptyClient());
      setPageMessage("Customer added successfully.");
      await fetchClients();
    } catch (error) {
      setFormError(error.response?.data?.message||"We could not save this customer. Check the details and try again.");
      console.error("Error adding customer",error);
    } finally {
      setFormSaving(false);
    }
  };

  const handleEditClient = (client) => {
    setFormError("");
    setPageMessage("");
    setEditingClient(client._id);
    const hydrated={
      ...client,
      ...((client.customFields&&typeof client.customFields==="object")?client.customFields:{}),
      customFields:{...(client.customFields||{})}
    };
    setNewClient(buildConfiguredDefaults(hydrated,clientFormConfig.fields));
    setShowModal(true);
  };

  const handleUpdateClient = async event => {
    event?.preventDefault();
    setFormError("");
    setPageMessage("");
    const prepared=applyFormulas(clientFormConfig.fields,syncConfiguredCustomFields(newClient,clientFormConfig.fields));
    const missing=missingRequiredCustomerField(prepared);
    if(missing){
      setFormError(`Please complete “${missing.label}” before saving.`);
      return;
    }

    try {
      setFormSaving(true);
      await axios.patch(
        `${linkone}/api/clients/${editingClient}`,
        {
          name: prepared.name || '',
          email: prepared.email || '',
          phone: prepared.phone || '',
          address: prepared.address || '',
          state: prepared.state || '',
          city: prepared.city || '',
          pinCode: prepared.pinCode || '',
          stateCode: prepared.stateCode || '',
          gstNumber: prepared.gstNumber || '',
          companyName: prepared.companyName || '',
          businessType: prepared.businessType || '',
          paymentTerms: prepared.paymentTerms || '30',
          discountRate: Number(prepared.discountRate || 0),
          accountStatus: prepared.accountStatus || 'Active',
          notes: prepared.notes || '',
          customFields: prepared.customFields || {}
        },
        {headers: {'x-auth-token': token}}
      );

      setShowModal(false);
      setEditingClient(null);
      setNewClient(emptyClient());
      setPageMessage("Customer updated successfully.");
      await fetchClients();
    } catch (error) {
      setFormError(error.response?.data?.message||"We could not update this customer. Check the details and try again.");
      console.error("Error updating customer",error);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteClient = async id => {
    const confirmed=window.confirm("Delete this customer? This will remove the customer from your list.");
    if(!confirmed)return;
    setPageMessage("");
    try {
      await axios.delete(`${linkone}/api/clients/${id}`,authConfig);
      setPageMessage("Customer deleted.");
      if(String(viewingClient?._id)===String(id))setViewingClient(null);
      if(String(editingClient)===String(id)){
        setShowModal(false);
        setEditingClient(null);
        setNewClient(emptyClient());
      }
      await fetchClients();
    } catch (error) {
      setPageMessage(error.response?.data?.message||"We could not delete this customer. Try again.");
      console.error("Error deleting customer",error);
    }
  };

  const filteredClients=useMemo(()=>{
    const query=search.trim().toLowerCase();
    return clients.filter(client=>{
      const searchableValues=[client.companyName,client.name,client.phone,client.email,client.gstNumber]
        .filter(Boolean)
        .map(value=>String(value).toLowerCase());
      const revenue=Number(client.totalRevenue||0);
      return (
        (!query||searchableValues.some(value=>value.includes(query))) &&
        (!filters.businessType||client.businessType===filters.businessType) &&
        (!filters.accountStatus||client.accountStatus===filters.accountStatus) &&
        (filters.minRevenue===""||revenue>=Number(filters.minRevenue)) &&
        (filters.maxRevenue===""||revenue<=Number(filters.maxRevenue))
      );
    });
  },[clients,search,filters]);

  const hasActiveClientFilters=Boolean(
    search.trim()||Object.values(filters).some(value=>String(value??"").trim())
  );
  const clearClientFilters=()=>{
    setSearch("");
    setFilters({businessType:"",accountStatus:"",minRevenue:"",maxRevenue:""});
    setCurrentPage(1);
  };

  const totalPages=Math.ceil(filteredClients.length/itemsPerPage);
  const indexOfLastItem=currentPage*itemsPerPage;
  const indexOfFirstItem=indexOfLastItem-itemsPerPage;
  const pageWindowStart=Math.max(1,Math.min(currentPage-3,totalPages-6));
  const visiblePageNumbers=Array.from(
    {length:Math.min(7,totalPages)},
    (_,index)=>pageWindowStart+index
  );

  // If a delete or refreshed filter removes the last page, move to the last
  // available page instead of showing an empty list while other customers exist.
  useEffect(()=>{
    const lastAvailablePage=Math.max(1,totalPages);
    if(currentPage>lastAvailablePage)setCurrentPage(lastAvailablePage);
  },[currentPage,totalPages]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortClient(sortClient === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortClient('asc');
    }
    setCurrentPage(1);
  };

  const sortedData = [...filteredClients].sort((a, b) => {
    // const sortedData = [...orders].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // // Handle date comparison
    // if (sortKey === 'orderDate') {
    //   aVal = new Date(aVal);
    //   bVal = new Date(bVal);
    // }

    // Handle number comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortClient === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Missing values are treated as empty text so optional customer fields
    // do not break sorting when some records have not filled them in.
    const aText=String(aVal??"");
    const bText=String(bVal??"");
    return sortClient === 'asc'
      ? aText.localeCompare(bText,undefined,{numeric:true,sensitivity:"base"})
      : bText.localeCompare(aText,undefined,{numeric:true,sensitivity:"base"});
  });

  const pagedClientRows=sortedData.slice(indexOfFirstItem,indexOfLastItem);


  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredClients);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, 'clients_report.xlsx');
  };

  const handleCustomerModalKeyDown = event => {
    if (event.key === "Escape") {
      if (!formSettingsOpen) {
        event.preventDefault();
        setShowModal(false);
        setFormError("");
      }
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(event.currentTarget.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
      <div className="container-fluid customer-page py-4">
        <BusinessPageHeader
          eyebrow="YOUR CONTACTS"
          title="Customers"
          description="Save each person or business once. Their details will be ready when you create an invoice."
          className="mb-3"
        >
          <button type="button" className="btn btn-light border" onClick={handleExportExcel}><i className="bi bi-download me-2"></i>Export Excel</button>
          <button type="button" className="btn btn-primary" onClick={() => { setEditingClient(null); setNewClient(emptyClient()); setFormError(""); setPageMessage(""); setShowModal(true); }} disabled={clientFormConfig.loading}><i className="bi bi-person-plus me-2"></i>Add customer</button>
        </BusinessPageHeader>

        {pageMessage&&<div className="alert alert-info" role="status">{pageMessage}</div>}
        {clientsLoadError&&(
          <div className="alert alert-danger d-flex flex-wrap align-items-center gap-2" role="alert">
            <div className="flex-grow-1">
              <div className="fw-semibold">Customer list could not be refreshed.</div>
              <div className="small">{clients.length?"Showing the last loaded customer records below.":"No customer records are available to display until loading succeeds."}</div>
            </div>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={fetchClients} disabled={loading}>
              {loading?"Refreshing…":"Try again"}
            </button>
          </div>
        )}

        <div className="customer-overview-grid mb-3">
          <div className="customer-overview-card">
            <span className="customer-overview-icon"><i className="bi bi-people"></i></span>
            <div><span>Total customers</span><strong>{clients.length.toLocaleString("en-IN")}</strong><small>Saved in your records</small></div>
          </div>
          <div className="customer-overview-card">
            <span className="customer-overview-icon active"><i className="bi bi-person-check"></i></span>
            <div><span>Active customers</span><strong>{clients.filter(client=>client.accountStatus!=="Inactive").length.toLocaleString("en-IN")}</strong><small>Ready for new invoices</small></div>
          </div>
          <div className="customer-overview-card">
            <span className="customer-overview-icon sales"><i className="bi bi-currency-rupee"></i></span>
            <div><span>Total sales</span><strong>₹{clients.reduce((sum,client)=>sum+Number(client.totalRevenue||0),0).toLocaleString("en-IN",{maximumFractionDigits:0})}</strong><small>Sales recorded for customers</small></div>
          </div>
        </div>

        <div className="py-2">
          <div className="card p-3">
            <div className="row g-2 align-items-center">
              <div className="col-lg-8">
                <label className="visually-hidden" htmlFor="customer-search">Search customers</label>
                <div className="input-group customer-search-input">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input id="customer-search" type="search" className="form-control" placeholder="Search by customer, phone, email or GST number" value={search} onChange={event=>{setSearch(event.target.value);setCurrentPage(1);}}/>
                  {search&&<button type="button" className="btn btn-light border" onClick={()=>{setSearch("");setCurrentPage(1);}}>Clear</button>}
                </div>
              </div>
              <div className="col-lg-4">
                <select aria-label="Filter by customer status" className="form-select" value={filters.accountStatus} onChange={event=>{setFilters(prev=>({...prev,accountStatus:event.target.value}));setCurrentPage(1);}}>
                  <option value="">All customers</option>
                  <option value="Active">Active only</option>
                  <option value="Inactive">Inactive only</option>
                </select>
              </div>
            </div>

            <details className="filter-details mt-3">
              <summary><i className="bi bi-sliders me-2"></i>More filters</summary>
              <div className="row g-2 align-items-end pt-3">
                <div className="col-sm-6 col-lg-4">
                  <label className="form-label small" htmlFor="customer-type-filter">Customer type</label>
                  <select id="customer-type-filter" className="form-select" value={filters.businessType} onChange={event=>{setFilters(prev=>({...prev,businessType:event.target.value}));setCurrentPage(1);}}>
                    <option value="">All types</option>
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Trader">Trader</option>
                    <option value="Supplier">Supplier</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="col-sm-6 col-lg-4">
                  <label className="form-label small" htmlFor="customer-min-revenue">Minimum sales (₹)</label>
                  <input id="customer-min-revenue" type="number" min="0" className="form-control" placeholder="No minimum" value={filters.minRevenue} onChange={event=>{setFilters(prev=>({...prev,minRevenue:event.target.value}));setCurrentPage(1);}}/>
                </div>
                <div className="col-sm-6 col-lg-4">
                  <label className="form-label small" htmlFor="customer-max-revenue">Maximum sales (₹)</label>
                  <input id="customer-max-revenue" type="number" min="0" className="form-control" placeholder="No maximum" value={filters.maxRevenue} onChange={event=>{setFilters(prev=>({...prev,maxRevenue:event.target.value}));setCurrentPage(1);}}/>
                </div>
              </div>
            </details>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
              <span className="small text-secondary">{filteredClients.length} customer{filteredClients.length===1?"":"s"}{hasActiveClientFilters?" match your filters":" in your records"}</span>
              {hasActiveClientFilters&&<button type="button" className="btn btn-sm btn-light border" onClick={clearClientFilters}>Clear filters</button>}
            </div>
          </div>

            {/* Table */}
            <DynamicTable
              autoOpenSettings={tableCustomizeRequested}
              tableKey="clients.list"
              rows={pagedClientRows}
              loading={loading}
              emptyText={clientsLoadError?"Customer records could not be loaded. Try again above.":hasActiveClientFilters?"No customers match these filters. Use Clear filters to see everyone.":"No customers yet. Add a customer so their details are ready when you create an invoice."}
              getRowKey={client => client._id}
              columns={[
                { key:"companyName", label:"Customer", sortKey:"companyName", render:client=>(
                  <div className="customer-crm-name">
                    <strong>{client.companyName||client.name||"Unnamed customer"}</strong>
                    <small>{[client.name,client.phone].filter(Boolean).join(" · ")||"Contact details not added"}</small>
                    <small>{client.lastCrmActivityAt?"Last activity "+new Date(client.lastCrmActivityAt).toLocaleDateString("en-IN"):"No activity logged yet"}</small>
                  </div>
                ) },
                { key:"phone", label:"Phone", sortKey:"phone", visible:false },
                { key:"address", label:"Address", visible:false },
                { key:"gstNumber", label:"GST No.", visible:false },
                { key:"businessType", label:"Business Type", sortKey:"businessType", visible:false },
                { key:"paymentTerms", label:"Payment Terms", visible:false, render:client=>String(client.paymentTerms||"")+(client.paymentTerms!=="Advance"&&client.paymentTerms?" days":"") },
                { key:"discountRate", label:"Discount", visible:false, render:client=>String(client.discountRate??0)+"%" },
                { key:"orderCount", label:"Invoices", sortKey:"orderCount", visible:false },
                { key:"nextFollowUpAt", label:"Next follow-up", sortKey:"nextFollowUpAt", render:client=>{
                  if(!client.nextFollowUpAt)return <span className="customer-next-followup-empty">{client.openFollowUpCount?client.openFollowUpCount+" open":"Not scheduled"}</span>;
                  const due=new Date(client.nextFollowUpAt);
                  const overdue=due<new Date();
                  return <span className={overdue?"customer-next-followup is-overdue":"customer-next-followup"}>{overdue?"Overdue · ":""}{due.toLocaleDateString("en-IN")}</span>;
                } },
                { key:"totalRevenue", label:"Total billed", sortKey:"totalRevenue", render:client=><span className="customer-total-billed">₹{Number(client.totalRevenue||0).toLocaleString("en-IN",{maximumFractionDigits:2})}</span> },
                { key:"accountStatus", label:"Status", render:client=><span className={client.accountStatus==="Inactive"?"customer-status is-inactive":"customer-status"}>{client.accountStatus||"Active"}</span> },
                { key:"notes", label:"Notes", visible:false },
              ]}
              onSort={handleSort}
              actionColumn={{
                label:"Actions",
                locked:true,
                render:client=>(
                  <div className="d-flex gap-1 justify-content-end">
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>openClientProfile(client)}>
                      Open profile <i className="bi bi-arrow-right ms-1"></i>
                    </button>
                  </div>
                )
              }}
              footer={({visibleColumns,hasActions})=>{
                const totalRevenue=filteredClients.reduce((sum,p)=>sum+Number(p.totalRevenue||0),0).toFixed(2);
                return (
                  <tr>
                    {visibleColumns.map((column,index)=>(
                      <td key={column.key} className={column.key==="totalRevenue"?"text-center fw-bold":index===0?"text-end fw-bold":""}>
                        {column.key==="totalRevenue" ? "₹"+totalRevenue : index===0 ? "Total:" : ""}
                      </td>
                    ))}
                    {hasActions&&<td></td>}
                  </tr>
                );
              }}
            />

            {/* Pagination */}
            {totalPages>1&&<nav aria-label="Customer pages">
              <ul className="pagination justify-content-center mt-3">
                <li className="page-item">
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>
                {visiblePageNumbers.map(page => (
                  <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                    <button type="button" className="page-link" aria-current={currentPage === page ? "page" : undefined} onClick={() => setCurrentPage(page)}>
                      {page}
                    </button>
                  </li>
                ))}
                <li className="page-item">
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>}

          </div>

          {viewingClient&&(
            <div className="modal show d-block customer-view-backdrop client-crm-backdrop" tabIndex="-1" role="dialog" aria-modal="true" aria-label="Customer profile">
              <div className="modal-dialog client-crm-dialog">
                <div className="modal-content customer-view-modal client-crm-shell border-0">
                  <header className="client-profile-header">
                    <button type="button" className="client-profile-back" onClick={()=>setViewingClient(null)}>
                      <i className="bi bi-arrow-left"></i><span>Customers</span>
                    </button>
                    <div className="client-profile-identity">
                      <span className="client-profile-avatar">{String(viewingClient.companyName||viewingClient.name||"C").trim().charAt(0).toUpperCase()}</span>
                      <div className="min-w-0">
                        <div className="client-profile-name-line">
                          <h2>{viewingClient.companyName||viewingClient.name||"Customer"}</h2>
                          <span className={"client-profile-status "+(viewingClient.accountStatus==="Inactive"?"is-inactive":"")}>{viewingClient.accountStatus||"Active"}</span>
                        </div>
                        <div className="client-profile-contact-line">
                          {viewingClient.name&&viewingClient.companyName&&<span>{viewingClient.name}</span>}
                          {viewingClient.phone&&<a href={"tel:"+viewingClient.phone}><i className="bi bi-telephone"></i>{viewingClient.phone}</a>}
                          {viewingClient.email&&<a href={"mailto:"+viewingClient.email}><i className="bi bi-envelope"></i>{viewingClient.email}</a>}
                        </div>
                      </div>
                    </div>
                    <div className="client-profile-actions">
                      <button type="button" className="btn btn-light border" onClick={()=>openCustomerStatement(viewingClient)}>
                        <i className="bi bi-journal-text"></i><span>Statement</span>
                      </button>
                      <button type="button" className="btn btn-primary" onClick={()=>{handleEditClient(viewingClient);setViewingClient(null);}}>
                        <i className="bi bi-pencil"></i><span>Edit customer</span>
                      </button>
                      <button type="button" className="btn btn-light border client-profile-close" aria-label="Close customer profile" onClick={()=>setViewingClient(null)}>
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  </header>

                  <section className="client-profile-metrics" aria-label="Customer summary">
                    <div><span>Total billed</span><strong>₹{Number(viewingClient.totalRevenue||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
                    <div><span>Invoices</span><strong>{Number(viewingClient.orderCount||0).toLocaleString("en-IN")}</strong></div>
                    <div><span>Outstanding</span><strong>₹{Number(viewingClient.outstanding_balance||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div>
                    <div><span>Open reminders</span><strong>{Number(viewingClient.openFollowUpCount||0).toLocaleString("en-IN")}</strong></div>
                  </section>

                  <nav className="client-profile-tabs" aria-label="Customer profile sections">
                    <button type="button" className={clientProfileTab==="activity"?"is-active":""} onClick={()=>setClientProfileTab("activity")}><i className="bi bi-clock-history"></i>Activity</button>
                    <button type="button" className={clientProfileTab==="overview"?"is-active":""} onClick={()=>setClientProfileTab("overview")}><i className="bi bi-grid"></i>Overview</button>
                    <button type="button" className={clientProfileTab==="details"?"is-active":""} onClick={()=>setClientProfileTab("details")}><i className="bi bi-person-vcard"></i>All details</button>
                  </nav>

                  <main className="modal-body client-profile-content">
                    {clientProfileTab==="activity"&&<ClientActivityPanel clientId={viewingClient._id} apiBase={linkone}/>}

                    {clientProfileTab==="overview"&&(
                      <div className="client-profile-overview">
                        <section className="client-profile-card">
                          <div className="client-profile-card-heading"><h3>Contact information</h3><span>How to reach this customer</span></div>
                          <div className="client-profile-contact-grid">
                            <div><span>Contact person</span><strong>{viewingClient.name||"Not added"}</strong></div>
                            <div><span>Phone number</span>{viewingClient.phone?<a href={"tel:"+viewingClient.phone}>{viewingClient.phone}</a>:<strong>Not added</strong>}</div>
                            <div><span>Email address</span>{viewingClient.email?<a href={"mailto:"+viewingClient.email}>{viewingClient.email}</a>:<strong>Not added</strong>}</div>
                            <div><span>GST number</span><strong>{viewingClient.gstNumber||"Not added"}</strong></div>
                            <div className="is-wide"><span>Address</span><strong>{[viewingClient.address,viewingClient.city,viewingClient.state,viewingClient.pinCode].filter(Boolean).join(", ")||"No address saved"}</strong></div>
                          </div>
                          <div className="client-profile-quick-links">
                            {viewingClient.phone&&<a className="btn btn-light border" href={"tel:"+viewingClient.phone}><i className="bi bi-telephone"></i>Call</a>}
                            {viewingClient.email&&<a className="btn btn-light border" href={"mailto:"+viewingClient.email}><i className="bi bi-envelope"></i>Email</a>}
                            {viewingClient.phone&&<a className="btn btn-light border" href={"https://wa.me/"+(String(viewingClient.phone).replace(/\D/g,"").length===10?"91":"")+String(viewingClient.phone).replace(/\D/g,"")} target="_blank" rel="noreferrer"><i className="bi bi-whatsapp"></i>WhatsApp</a>}
                          </div>
                        </section>
                        <section className="client-profile-card">
                          <div className="client-profile-card-heading"><h3>Business relationship</h3><span>Account at a glance</span></div>
                          <div className="client-profile-contact-grid">
                            <div><span>Customer type</span><strong>{viewingClient.businessType||"Not specified"}</strong></div>
                            <div><span>Payment terms</span><strong>{viewingClient.paymentTerms?(viewingClient.paymentTerms==="Advance"?"Advance":viewingClient.paymentTerms+" days"):"Not specified"}</strong></div>
                            <div><span>Default discount</span><strong>{Number(viewingClient.discountRate||0)}%</strong></div>
                            <div><span>Customer since</span><strong>{viewingClient.createdAt?new Date(viewingClient.createdAt).toLocaleDateString("en-IN"):"—"}</strong></div>
                            <div className="is-wide"><span>Next follow-up</span><strong>{viewingClient.nextFollowUpAt?new Date(viewingClient.nextFollowUpAt).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"No follow-up scheduled"}</strong></div>
                          </div>
                          {viewingClient.notes&&<div className="client-profile-notes"><span>Notes</span><p>{viewingClient.notes}</p></div>}
                        </section>
                      </div>
                    )}

                    {clientProfileTab==="details"&&(
                      <div className="client-profile-details">
                        {clientFormSections.map(section=>{
                          const fields=section.fields.filter(field=>getFieldState(field,{...viewingClient,...(viewingClient.customFields||{})}).visible);
                          if(!fields.length)return null;
                          return (
                            <section key={section.key} className="client-profile-card">
                              <div className="client-profile-card-heading"><h3>{section.label}</h3></div>
                              <div className="client-profile-contact-grid">
                                {fields.map(field=>{
                                  const value=(field.custom?viewingClient.customFields?.[field.key]??viewingClient[field.key]:viewingClient[field.key])??field.defaultValue;
                                  const display=Array.isArray(value)?value.join(", "):typeof value==="boolean"?(value?"Yes":"No"):value===null||value===undefined||value===""?"—":field.key==="paymentTerms"&&value!=="Advance"?value+" days":field.key==="discountRate"?value+"%":String(value);
                                  return <div key={field.key} className={Number(field.width||6)>=12?"is-wide":""}><span>{field.label}</span><strong>{display}</strong></div>;
                                })}
                              </div>
                            </section>
                          );
                        })}
                        <div className="client-profile-detail-actions">
                          <button type="button" className="btn btn-light border" onClick={()=>window.print()}><i className="bi bi-printer me-2"></i>Print customer details</button>
                        </div>
                        <div className="client-profile-danger-zone">
                          <div><strong>Remove this customer</strong><span>Only possible when no invoices or history depend on this record.</span></div>
                          <button type="button" className="btn btn-outline-danger" onClick={()=>handleDeleteClient(viewingClient._id)}><i className="bi bi-trash"></i>Delete customer</button>
                        </div>
                      </div>
                    )}
                  </main>
                </div>
              </div>
            </div>
          )}

                    {statementFor&&(
            <div className="modal show d-block customer-view-backdrop" tabIndex="-1" role="dialog" aria-modal="true" aria-label="Customer account statement">
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable customer-statement-dialog">
                <div className="modal-content customer-view-modal customer-statement-modal border-0">
                  <div className="modal-header customer-view-toolbar customer-statement-toolbar">
                    <div className="min-w-0">
                      <div className="small text-primary text-uppercase fw-semibold mb-1">CUSTOMER ACCOUNT</div>
                      <h5 className="modal-title fw-bold mb-1">Account statement</h5>
                      <div className="small text-secondary">{statementFor.companyName||statementFor.name||"Customer"}{statementFor.phone?" · "+statementFor.phone:""}</div>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>fetchCustomerStatement(statementFor)} disabled={statementLoading}><i className="bi bi-arrow-clockwise me-1"></i>Refresh</button>
                      <button type="button" className="btn-close" aria-label="Close account statement" onClick={closeCustomerStatement}/>
                    </div>
                  </div>
                  <div className="modal-body customer-statement-body">
                    <div className="customer-statement-filter">
                      <div>
                        <label className="form-label small fw-semibold" htmlFor="statement-from">From date</label>
                        <input id="statement-from" className="form-control form-control-sm" type="date" value={statementFrom} onChange={event=>setStatementFrom(event.target.value)}/>
                      </div>
                      <div>
                        <label className="form-label small fw-semibold" htmlFor="statement-to">To date</label>
                        <input id="statement-to" className="form-control form-control-sm" type="date" value={statementTo} onChange={event=>setStatementTo(event.target.value)}/>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm align-self-end" onClick={()=>fetchCustomerStatement(statementFor)} disabled={statementLoading}>
                        {statementLoading?"Loading...":"Apply dates"}
                      </button>
                      <div className="small text-secondary align-self-end">Dates use India time (IST).</div>
                    </div>
                    {statementError&&<div className="alert alert-danger py-2" role="alert">{statementError}</div>}
                    {statementLoading&&!statementData&&<div className="text-center py-5"><div className="spinner-border text-primary" role="status"/><div className="small text-secondary mt-2">Preparing the account statement...</div></div>}
                    {statementData&&(
                      <>
                        <div className="customer-statement-heading">
                          <div><div className="small text-secondary">STATEMENT PERIOD</div><strong>{statementDate(statementData.period.from)} – {statementDate(statementData.period.to)}</strong></div>
                          <div className="text-end"><div className="small text-secondary">CUSTOMER</div><strong>{statementFor.companyName||statementFor.name||"Customer"}</strong></div>
                        </div>
                        <section className="customer-statement-section">
                          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                            <div><h6 className="mb-1 fw-bold">Invoice balance</h6><div className="small text-secondary">Invoices increase the amount due. Payments and Credit Note adjustments reduce it.</div></div>
                            <div className="small text-secondary">Current outstanding: <strong className="text-dark">{statementMoney(statementData.receivables.currentOutstanding)}</strong></div>
                          </div>
                          <div className="row g-2 mb-3">
                            <div className="col-6 col-lg-4"><div className="customer-statement-total"><span>Opening balance</span><strong>{statementMoney(statementData.receivables.openingBalance)}</strong></div></div>
                            <div className="col-6 col-lg-4"><div className="customer-statement-total"><span>Invoices</span><strong>{statementMoney(statementData.totals.invoiceDebits)}</strong></div></div>
                            <div className="col-6 col-lg-4"><div className="customer-statement-total"><span>Payments received</span><strong>{statementMoney(statementData.totals.paymentCredits)}</strong></div></div>
                            <div className="col-6 col-lg-4"><div className="customer-statement-total"><span>Credit Note reductions</span><strong>{statementMoney(statementData.totals.creditNoteCredits)}</strong></div></div>
                            <div className="col-6 col-lg-4"><div className="customer-statement-total"><span>Credit Note reversals</span><strong>{statementMoney(statementData.totals.creditNoteReversals)}</strong></div></div>
                            <div className="col-6 col-lg-4"><div className="customer-statement-total is-closing"><span>Closing balance</span><strong>{statementMoney(statementData.receivables.closingBalance)}</strong></div></div>
                          </div>
                          <div className="table-responsive customer-statement-table-wrap">
                            <table className="table table-sm align-middle customer-statement-table">
                              <thead><tr><th>Date</th><th>Details</th><th>Reference</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Balance</th></tr></thead>
                              <tbody>
                                {statementData.receivables.transactions.map((row,index)=>(
                                  <tr key={row.type+"-"+row.reference+"-"+index}>
                                    <td className="text-nowrap">{statementDate(row.date)}</td>
                                    <td>{row.description}</td>
                                    <td className="text-break">{row.reference||"—"}</td>
                                    <td className="text-end text-nowrap">{Number(row.debit||0)>0?statementMoney(row.debit):"—"}</td>
                                    <td className="text-end text-nowrap">{Number(row.credit||0)>0?statementMoney(row.credit):"—"}</td>
                                    <td className="text-end text-nowrap fw-semibold">{statementMoney(row.balanceAfter)}</td>
                                  </tr>
                                ))}
                                {!statementData.receivables.transactions.length&&<tr><td colSpan="6" className="text-center text-secondary py-4">No invoice transactions in this period.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        <section className="customer-statement-section">
                          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                            <div><h6 className="mb-1 fw-bold">Available customer credit</h6><div className="small text-secondary">Credit Note credits and manual adjustments held on the customer account.</div></div>
                            <div className="text-end"><div className="small text-secondary">Current available credit</div><strong>{statementMoney(statementData.customerCredit.currentBalance)}</strong></div>
                          </div>
                          <div className="row g-2 mb-3">
                            <div className="col-6 col-lg-3"><div className="customer-statement-total"><span>Opening credit</span><strong>{statementMoney(statementData.customerCredit.openingBalance)}</strong></div></div>
                            <div className="col-6 col-lg-3"><div className="customer-statement-total"><span>Added</span><strong>{statementMoney(statementData.customerCredit.additions)}</strong></div></div>
                            <div className="col-6 col-lg-3"><div className="customer-statement-total"><span>Deducted</span><strong>{statementMoney(statementData.customerCredit.deductions)}</strong></div></div>
                            <div className="col-6 col-lg-3"><div className="customer-statement-total is-closing"><span>Closing credit</span><strong>{statementMoney(statementData.customerCredit.closingBalance)}</strong></div></div>
                          </div>
                          <div className="table-responsive customer-statement-table-wrap">
                            <table className="table table-sm align-middle customer-statement-table">
                              <thead><tr><th>Date</th><th>Details</th><th>Reference</th><th className="text-end">Added</th><th className="text-end">Deducted</th><th className="text-end">Balance</th></tr></thead>
                              <tbody>
                                {statementData.customerCredit.transactions.map((row,index)=>(
                                  <tr key={row.type+"-"+row.reference+"-"+index}>
                                    <td className="text-nowrap">{statementDate(row.date)}</td>
                                    <td>{row.description}</td>
                                    <td className="text-break">{row.reference||"—"}</td>
                                    <td className="text-end text-nowrap">{Number(row.credit||0)>0?statementMoney(row.credit):"—"}</td>
                                    <td className="text-end text-nowrap">{Number(row.debit||0)>0?statementMoney(row.debit):"—"}</td>
                                    <td className="text-end text-nowrap fw-semibold">{statementMoney(row.balanceAfter)}</td>
                                  </tr>
                                ))}
                                {!statementData.customerCredit.transactions.length&&<tr><td colSpan="6" className="text-center text-secondary py-4">No customer-credit movements in this period.</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </section>
                        {(statementData.warnings.length>0||statementData.limitations.length>0)&&(
                          <section className="customer-statement-notes">
                            <h6 className="fw-bold mb-2">Reconciliation notes</h6>
                            {statementData.warnings.map((warning,index)=><div className="alert alert-warning py-2 mb-2" key={"warning-"+index}>{warning}</div>)}
                            {statementData.limitations.map((limitation,index)=><div className="small text-secondary mb-1" key={"limitation-"+index}>• {limitation}</div>)}
                          </section>
                        )}
                      </>
                    )}
                  </div>
                  <div className="modal-footer customer-view-footer customer-statement-footer">
                    <button type="button" className="btn btn-light border" onClick={closeCustomerStatement}>Back to customer</button>
                    <button type="button" className="btn btn-primary" onClick={()=>window.print()} disabled={!statementData||statementLoading}><i className="bi bi-printer me-2"></i>Print statement</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showModal && (
            <div
              className="modal show d-block"
              tabIndex="-1"
              role="dialog"
              aria-modal="true"
              aria-labelledby="customer-form-title"
              onKeyDown={handleCustomerModalKeyDown}
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
            >
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable customer-a4-dialog">
                <div className="modal-content customer-form-modal shadow-sm border-0">
                  <div className="modal-header bg-white text-dark p-3 border-bottom d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <div>
                        <h5 id="customer-form-title" className="modal-title fw-bold mb-1">{editingClient ? "Edit customer" : "Add a customer"}</h5>
                        <div className="small text-muted">Start with the customer or business name. Add contact details only when you need them.</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={() => {setShowModal(false);setFormError("");}}
                      aria-label="Close"
                    ></button>
                  </div>

                  {formError&&<div className="alert alert-danger mx-3 mt-3 mb-0" role="alert">{formError}</div>}
                  <form className="customer-form-workspace" onSubmit={editingClient?handleUpdateClient:handleAddClient}>
                    <div className="modal-body p-3 customer-a4-sheet-body">
                      <div className="customer-paper-intro">
                        <div className="customer-paper-instruction"><i className="bi bi-info-circle me-2"></i>Complete fields marked Required. Optional fields can be left blank and added later.</div>
                      </div>
                      {clientFormSections.map((section,sectionIndex)=>{
                        const sectionFields=section.fields.filter(field=>getFieldState(field,{...newClient,...(newClient.customFields||{})}).visible);
                        if(!sectionFields.length)return null;
                        return (
                          <section className="customer-form-section" key={section.key}>
                            <div className="customer-form-section-heading">
                              <span className="customer-section-number">{sectionIndex+1}</span>
                              <div><h6>{section.label}</h6><div className="small text-secondary">Enter the details for this section</div></div>
                            </div>
                            <div className="row g-3">
                              {sectionFields.map(renderClientField)}
                            </div>
                          </section>
                        );
                      })}
                      <div className="customer-paper-note"><i className="bi bi-info-circle me-2"></i>You can leave optional fields blank and add details later.</div>
                    </div>
                    <div className="modal-footer bg-white p-3 border-top sticky-bottom">
                      <button type="button" className="btn btn-light border" onClick={()=>{setShowModal(false);setFormError("");}}>Cancel</button>
                      <button type="submit" className="btn btn-primary px-4" disabled={formSaving||clientFormConfig.loading}>
                        {formSaving?<><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving...</>:(editingClient?"Save changes":"Add customer")}
                      </button>
                    </div>
                  </form>

                </div>
              </div>
            </div>
          )}




        <FormConfigurator
        open={formSettingsOpen}
        onClose={()=>setFormSettingsOpen(false)}
        title="Customize customer form"
        subtitle="Change which customer details your team sees and which ones are required."
        fields={clientFormConfig.fields}
        saving={clientFormConfig.saving}
        onSave={clientFormConfig.save}
        onReset={async()=>{const defaults=await clientFormConfig.reset();clientFormConfig.setFields(defaults);setFormSettingsOpen(false);}}
      />
        </div>
);
}

export default Clients;
