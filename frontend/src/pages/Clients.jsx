import React, { useEffect, useState, useMemo } from 'react';
import {useSearchParams} from "react-router-dom";
import {CLIENT_FORM_FIELDS} from "../config/noCodeCatalog";
import axios from 'axios';
import DynamicTable from '../components/DynamicTable';
import FormConfigurator from '../components/FormConfigurator';
import ConfiguredField from '../components/ConfiguredField';
import {useFormConfiguration,applyFormulas,applyAutoFill,getFieldState,syncConfiguredCustomFields,buildConfiguredDefaults} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";
import * as XLSX from 'xlsx';

function Clients() {
  const [searchParams,setSearchParams]=useSearchParams();

  const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
  
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
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
  const clientFormConfig=useFormConfiguration("clients.form",CLIENT_FORM_FIELDS);
  const linkedClientSources=useMemo(()=>Array.from(new Set(clientFormConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean))),[clientFormConfig.fields]);
  const {records:linkedRecords}=useNoCodeDataSources(linkedClientSources);
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
  const clientPrimaryKeys=new Set(["name","companyName","phone","email"]);
  const clientFieldValues={...newClient,...(newClient.customFields||{})};
  const primaryClientFields=visibleClientFields.filter(field=>{
    const state=getFieldState(field,clientFieldValues);
    return state.visible&&(state.required||clientPrimaryKeys.has(field.key));
  });
  const primaryClientKeys=new Set(primaryClientFields.map(field=>field.key));
  const additionalClientFields=visibleClientFields.filter(field=>!primaryClientKeys.has(field.key));
  const emptyClient=()=>buildConfiguredDefaults({name:"",email:"",phone:"",address:"",state:"",city:"",pinCode:"",stateCode:"",gstNumber:"",companyName:"",businessType:"",paymentTerms:"30",discountRate:0,accountStatus:"Active",notes:"",customFields:{}},clientFormConfig.fields);
  const renderClientField=field=>{
    const state=getFieldState(field,{...newClient,...(newClient.customFields||{})});
    if(!state.visible)return null;
    const source=field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[];
    const common={
      field:{...field,required:state.required,readOnly:state.readOnly,disabled:state.disabled},
      value:clientValue(field),
      onChange:value=>updateClientField(field,value,null),
      onRecordChange:record=>updateClientField(field,record?.[field.dataSource?.valueField||"_id"]??"",record),
      lookupRecords:source
    };
    if(field.key==="state"&&!field.dataSource?.resource){
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} options={indianStates}/></div>;
    }
    if(field.key==="city"&&!field.dataSource?.resource){
      return <div key={field.key} className={`col-12 col-md-${field.width||6}`}><ConfiguredField {...common} options={newClient.state?(stateCityMapping[newClient.state]||[]):[]} disabled={!newClient.state}/></div>;
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
  if (!token) {
    throw new Error('No token found');
  }
  const fetchClients = async () => {
    setLoading(true);
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
      setPageMessage(error.response?.data?.message||"Customers could not be loaded. Refresh the page to try again.");
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

  const totalPages=Math.ceil(filteredClients.length/itemsPerPage);
  const indexOfLastItem=currentPage*itemsPerPage;
  const indexOfFirstItem=indexOfLastItem-itemsPerPage;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortClient(sortClient === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortClient('asc');
    }
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

    // Default string comparison
    return sortClient === 'asc'
      ? aVal?.toString().localeCompare(bVal?.toString())
      : bVal?.toString().localeCompare(aVal?.toString());
  });

  const pagedClientRows=sortedData.slice(indexOfFirstItem,indexOfLastItem);


  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(filteredClients);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, 'clients_report.xlsx');
  };

  return (
      <div className="container-fluid customer-page py-4">
        <header className="business-page-heading mb-3">
          <div>
            <span className="page-eyebrow">YOUR CONTACTS</span>
            <h1 className="mb-1">Customers</h1>
            <p className="text-muted mb-0">Keep customer details and buying history together.</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-light border" onClick={handleExportExcel}><i className="bi bi-download me-2"></i>Export Excel</button>
            <button className="btn btn-primary" onClick={() => { setEditingClient(null); setNewClient(emptyClient()); setFormError(""); setPageMessage(""); setShowModal(true); }}><i className="bi bi-person-plus me-2"></i>Add customer</button>
          </div>
        </header>

        {pageMessage&&<div className="alert alert-info" role="status">{pageMessage}</div>}

        <div className="py-2">
          <div className="card p-3">
            <div className="row g-2 align-items-center">
              <div className="col-lg-6">
                <label className="visually-hidden" htmlFor="customer-search">Search customers</label>
                <div className="input-group">
                  <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                  <input id="customer-search" type="search" className="form-control" placeholder="Search company, name, phone or GST" value={search} onChange={event=>{setSearch(event.target.value);setCurrentPage(1);}}/>
                  {search&&<button type="button" className="btn btn-light border" onClick={()=>{setSearch("");setCurrentPage(1);}}>Clear</button>}
                </div>
              </div>
              <div className="col-sm-6 col-lg-3">
                <select aria-label="Filter by business type" className="form-select" value={filters.businessType} onChange={event=>{setFilters(prev=>({...prev,businessType:event.target.value}));setCurrentPage(1);}}>
                  <option value="">All customer types</option>
                  <option value="Retail">Retail</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Service">Service</option>
                </select>
              </div>
              <div className="col-sm-6 col-lg-3">
                <select aria-label="Filter by status" className="form-select" value={filters.accountStatus} onChange={event=>{setFilters(prev=>({...prev,accountStatus:event.target.value}));setCurrentPage(1);}}>
                  <option value="">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <details className="filter-details mt-3">
              <summary><i className="bi bi-sliders me-2"></i>More filters <span className="text-secondary fw-normal">(optional)</span></summary>
              <div className="row g-2 align-items-end pt-3">
                <div className="col-sm-5">
                  <label className="form-label small" htmlFor="customer-min-revenue">Minimum total sales (₹)</label>
                  <input id="customer-min-revenue" type="number" min="0" className="form-control" placeholder="No minimum" value={filters.minRevenue} onChange={event=>{setFilters(prev=>({...prev,minRevenue:event.target.value}));setCurrentPage(1);}}/>
                </div>
                <div className="col-sm-5">
                  <label className="form-label small" htmlFor="customer-max-revenue">Maximum total sales (₹)</label>
                  <input id="customer-max-revenue" type="number" min="0" className="form-control" placeholder="No maximum" value={filters.maxRevenue} onChange={event=>{setFilters(prev=>({...prev,maxRevenue:event.target.value}));setCurrentPage(1);}}/>
                </div>
                <div className="col-sm-2">
                  <button type="button" className="btn btn-outline-secondary w-100" onClick={()=>{setSearch("");setFilters({businessType:"",accountStatus:"",minRevenue:"",maxRevenue:""});setCurrentPage(1);}}>Clear all</button>
                </div>
              </div>
            </details>
          </div>

            {/* Table */}
            <DynamicTable
              autoOpenSettings={tableCustomizeRequested}
              tableKey="clients.list"
              rows={pagedClientRows}
              loading={loading}
              emptyText={search.trim()||Object.values(filters).some(Boolean)?"No customers match these filters. Clear them to see everyone.":"No customers yet. Select Add customer to save your first customer."}
              getRowKey={client => client._id}
              columns={[
                { key:"__rowNumber", label:"#", locked:false, render:(_row,index)=>index+1 },
                { key:"companyName", label:"Name", sortKey:"companyName" },
                { key:"phone", label:"Phone", sortKey:"phone" },
                { key:"address", label:"Address" },
                { key:"gstNumber", label:"GST No." },
                { key:"businessType", label:"Business Type", sortKey:"businessType" },
                { key:"paymentTerms", label:"Payment Terms", render:client=>`${client.paymentTerms||""}${client.paymentTerms!=="Advance"&&client.paymentTerms?" days":""}` },
                { key:"discountRate", label:"Dis%", render:client=>`${client.discountRate??0} %` },
                { key:"orderCount", label:"Orders", sortKey:"orderCount" },
                { key:"totalRevenue", label:"Total Revenue", sortKey:"totalRevenue", render:client=>`₹${Number(client.totalRevenue||0).toFixed(2)}` },
                { key:"accountStatus", label:"A/C Status", render:client=><span className={`badge ${client.accountStatus==="Active"?"bg-success":"bg-danger"}`}>{client.accountStatus}</span> },
                { key:"notes", label:"Notes" },
              ]}
              onSort={handleSort}
              actionColumn={{
                label:"Actions",
                locked:true,
                render:client=>(
                  <div className="d-flex gap-1 justify-content-end">
                    <button className="btn btn-sm btn-light border" onClick={()=>handleEditClient(client)} title="Edit customer">
                      <i className="bi bi-pencil me-1"></i>Edit
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={()=>handleDeleteClient(client._id)} title="Delete customer">
                      <i className="bi bi-trash me-1"></i>Delete
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
                    className="page-link"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                    <button className="page-link" onClick={() => setCurrentPage(page)}>
                      {page}
                    </button>
                  </li>
                ))}
                <li className="page-item">
                  <button
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



        </div>

          {showModal && (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
              <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
                <div className="modal-content customer-form-modal shadow-sm border-0">
                  <div className="modal-header bg-white text-dark p-3 border-bottom d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                      <div>
                        <h5 className="modal-title fw-bold mb-1">{editingClient ? "Edit customer" : "Add a customer"}</h5>
                        <div className="small text-muted">Start with the customer or company name. Add other details only when you need them.</div>
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
                  <form onSubmit={editingClient?handleUpdateClient:handleAddClient}>
                    <div className="modal-body p-3">
                      <section className="customer-quick-fields">
                        <div className="customer-fields-heading">
                          <span className="customer-step-number">1</span>
                          <div>
                            <h6 className="mb-1">Basic details</h6>
                            <p className="mb-0">The name is enough to start. Phone and email make follow-up easier.</p>
                          </div>
                        </div>
                        <div className="row g-3">
                          {primaryClientFields.map(renderClientField)}
                        </div>
                      </section>

                      {additionalClientFields.some(field=>getFieldState(field,{...newClient,...(newClient.customFields||{})}).visible)&&(
                        <details className="customer-additional-details mt-3">
                          <summary><i className="bi bi-plus-circle me-2"></i>More customer details <span>Address, GST, payment terms and other information</span></summary>
                          <div className="row g-3 p-3">
                            {additionalClientFields.map(renderClientField)}
                          </div>
                        </details>
                      )}                    </div>

                    <div className="modal-footer bg-white p-3 border-top sticky-bottom">
                      <button type="button" className="btn btn-light border" onClick={()=>{setShowModal(false);setFormError("");}}>Cancel</button>
                      <button type="submit" className="btn btn-primary px-4" disabled={formSaving}>
                        {formSaving?<><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Saving...</>:(editingClient?"Save changes":"Add customer")}
                      </button>
                    </div>                  </form>

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
