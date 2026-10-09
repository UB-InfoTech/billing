import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {useSearchParams} from "react-router-dom";
import {ORDER_FORM_FIELDS,ORDER_ITEM_FIELDS} from "../config/noCodeCatalog";
import axios from "axios";
import editSVG from '../assets/edit.svg';
import deleteSVG from '../assets/delete.svg';
import infoSVG from '../assets/info.svg';
import paymentsSVG from '../assets/payments.svg';
import invoiceSVG from '../assets/invoice.svg';
import receiptSVG from '../assets/receipt.svg';
import 'bootstrap/dist/css/bootstrap.min.css'; // Ensure Bootstrap CSS is imported
import EWayBillForm from "../components/EWayBillForm";
import DynamicTable from "../components/DynamicTable";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import ArithmeticInput from "../components/ArithmeticInput";
import {useFormConfiguration,applyFormulas,hydrateConfiguredValues,applyAutoFill,getFieldState,syncConfiguredCustomFields,buildConfiguredDefaults} from "../hooks/useFormConfiguration";
import {useNoCodeDataSources} from "../hooks/useNoCodeDataSources";
import * as XLSX from 'xlsx';
import Report from '../components/Report';
import { useReactToPrint } from "react-to-print";

function Order2() {
    const linkone = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
    
    const [orders, setOrders] = useState([]);
    const [clients, setClients] = useState([]);
    const [clientsData, setClientsData] = useState([]);
    const [products, setProducts] = useState([]);
    const [profile, setProfile] = useState({
        headerTitle: '',
        companyName: '',
        companyAddress: '',
        phoneNumber1: '',
        phoneNumber2: '',
        gstin: '',
        pan: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifsc: '',
        pinCode: '',
        stateCode: '',
        billNoPrefix: '',
        billNoSequence: 1,
        billNoSuffix: '',
        eWayUserName: '',
        eWayPassword: ''
    });
   
    const [showModal, setShowModal] = useState(false);
    const [statusModal, setStatusModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showEwayBillModal, setShowEwayBillModal] = useState(false);
    const [orderId, setOrderId] = useState(null);
    const [formSettingsOpen,setFormSettingsOpen]=useState(false);
    const [itemSettingsOpen,setItemSettingsOpen]=useState(false);
    const [tableCustomizeRequested,setTableCustomizeRequested]=useState(false);
    const [ewayCustomizeRequested,setEwayCustomizeRequested]=useState(false);
    const [searchParams,setSearchParams]=useSearchParams();

    useEffect(()=>{
        const customize=searchParams.get("customize");
        const action=searchParams.get("action");
        if(customize==="form")setFormSettingsOpen(true);
        if(customize==="items")setItemSettingsOpen(true);
        if(customize==="table")setTableCustomizeRequested(true);
        if(customize==="ewaybill")setEwayCustomizeRequested(true);
        if(action==="new"){
            const newSubOrders=[emptyOrderItem()];
            setShowModal(true);
            setEditingOrder(null);
            setInvoiceFormError("");
            setOrdersMessage("");
            setSubOrders(newSubOrders);
            setFormData({...emptyOrder(),subOrders:newSubOrders});
        }
        if(customize||action){
            searchParams.delete("customize");
            searchParams.delete("action");
            setSearchParams(searchParams,{replace:true});
        }
    },[searchParams,setSearchParams]);
    const orderFormConfig=useFormConfiguration("orders.form",ORDER_FORM_FIELDS);
    const orderItemConfig=useFormConfiguration("orders.items",ORDER_ITEM_FIELDS);
    const emptyOrderItem=()=>buildConfiguredDefaults({designNumber:"",orderName:"",productId:null,hsnCode:0,qtyUnit:"PCS",quantity:0,cut:0,MTR:0,unitPrice:0,shortPcs:0,customFields:{}},orderItemConfig.fields);
    const emptyOrder=()=>buildConfiguredDefaults({orderDate:new Date(),orderNumber:OrderBillNo,lrNo:"",challanNumber:"",Address:"",State:"",City:"",pinCode:"",stateCode:"",clientId:"",gstNumber:"",companyName:"",subOrders:[],status:"Pending",paymentTerms:"30",taxPercentage:5,discountRate:0,note:"",customFields:{}},orderFormConfig.fields);
    const linkedOrderSources=useMemo(()=>Array.from(new Set([
        ...orderFormConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean),
        ...orderItemConfig.fields.map(field=>field.dataSource?.resource).filter(Boolean)
    ])),[orderFormConfig.fields,orderItemConfig.fields]);
    const {records:linkedRecords}=useNoCodeDataSources(linkedOrderSources);
    const [editingOrder, setEditingOrder] = useState(null);


    const [payments, setPayments] = useState([]);
    const [editPayment, setEditPayment] = useState(null);
    const [newPayment, setNewPayment] = useState({ amount: "", method: "Cash", amountReference: "", paymentDate: new Date().toISOString().slice(0, 10) });
    const authConfig = () => ({ headers: { "x-auth-token": localStorage.getItem("token") || "" } });

    // const date = new DateObject()
    // const [editIndex, setEditIndex] = useState(null);

    const [subOrders, setSubOrders] = useState([
        { designNumber: "", orderName: "", hsnCode: 0, qtyUnit: "", quantity: 0, cut: 0, MTR: 0, unitPrice: 0, shortPcs: 0, customFields: {} }
    ]);



    // ----------------
    // State declarations
    const [search, setSearch] = useState('');

    const [loading, setLoading] = useState(false);
    const [loadingOrders,setLoadingOrders]=useState(true);
    const [ordersError,setOrdersError]=useState("");
    const [ordersMessage,setOrdersMessage]=useState("");
    const [invoiceFormError,setInvoiceFormError]=useState("");
    const [orderSubmitting, setOrderSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    // const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'asc' });
    // const [sortKey, setSortKey] = useState('orderDate'); // default
    // const [sortKey, setSortKey] = useState('orderNumber'); // default
    const [sortKey, setSortKey] = useState('orderDate'); // default
    const [sortOrder, setSortOrder] = useState('asc'); // default


    const [filters, setFilters] = useState({
        status: '',
        paymentStatus: '',
        dateRange: [],
        minTotal: '',
        maxTotal: '',
        // startDate: '01/04/2026',
        startDate: '',
        endDate: '',
    });

    //     fabricType: "Cotton",
    //     priority: "Medium",
    //     rawMaterialCost: 0,
    //     labourCost: 0,
    //     machineUsageCost: 0,
    const [formData, setFormData] = useState({
        orderDate: new Date(),
        orderNumber: "",
        lrNo: "",
        challanNumber: "",
        Address: "",
        State: "",
        City: "",
        pinCode: "",
        stateCode: "",
        clientId: "",
        gstNumber: "",
        companyName: "",
        subOrders: subOrders,

        status: "Pending",
        paymentTerms: "30",

        taxPercentage: 5,
        discountRate: 0,
        customFields: {},
    });


    useEffect(() => {
        fetchOrders();
        fetchClients();
        fetchProducts();
        fetchProfile();
        // fetchSuppliers();
        // fetchMachines();

    }, []);

    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('No token found');
    }

    const fetchOrders = async () => {
        setLoadingOrders(true);
        setOrdersError("");
        try {
            const response = await axios.get(`${linkone}/api/order/orders`, {
                headers: {'x-auth-token': token}
            });
            setOrders(Array.isArray(response.data?.orders)?response.data.orders:[]);
        } catch (error) {
            if (error.response?.data?.msg === "Token is not valid") {
                localStorage.removeItem("token");
                window.location.reload();
                return;
            }
            setOrdersError(error.response?.data?.message||"Invoices could not be loaded. Refresh the page to try again.");
            console.error("Error fetching invoices",error);
        } finally {
            setLoadingOrders(false);
        }
    };


    // const fetchOrdersLength = orders.length + 1;
    // OrderBillNo = profile.billNoPrefix + billNoSequence + billNoSuffix


    const fetchProfile = async () => {
        try {
            const response = await axios.get(`${linkone}/api/profile`, {
                headers: {
                    'x-auth-token': token
                },
            });
            setProfile(response.data);

        } catch (error) {
            console.error("Error fetching profile", error);
        }
    };
    useEffect(() => {

        fetchProfile();

    }, []);
    // const OrderBillNo = profile.billNoPrefix + profile.billNoSequence + profile.billNoSuffix;
    const OrderBillNo = (profile.billNoPrefix || '') + profile.billNoSequence + (profile.billNoSuffix || '');

    const incrementBillNoSequence = async () => {
        try {
            // await axios.put(`${linkone}/api/profile/updateBillNoSequence`, {
            await axios.patch(`${linkone}/api/profile/billNoSequence`, {
                billNoSequence: profile.billNoSequence + 1
            }, {
                headers: {
                    'x-auth-token': token
                }
            });
            setProfile(prev => ({
                ...prev,
                billNoSequence: prev.billNoSequence + 1
            }));
        } catch (error) {
            console.error("Error updating billNoSequence", error);
        }
    };
    const fetchClients = async () => {
        const response = await axios.get(`${linkone}/api/clients`, {
            headers: {
                'x-auth-token': token
            }
        });
        setClients(response.data);
    };

    const fetchProducts = async () => {
        const response = await axios.get(`${linkone}/api/products`, authConfig());
        setProducts(response.data.products);
    };

    const handleSubOrderChange = (index, e) => {
        handleSubOrderValueChange(index,e.target.name,e.target.value);
    };

    const handleSubOrderValueChange=(index,name,value,record=null,field=null)=>{
        const updatedOrders=[...subOrders];
        const current={...(updatedOrders[index]||{}),customFields:{...((updatedOrders[index]||{}).customFields||{})}};
        let next={...current,[name]:value};

        if(field?.custom)next.customFields={...next.customFields,[name]:value};
        if(field?.dataSource?.autoFill?.length)next=applyAutoFill(field,record,next);
        next=syncConfiguredCustomFields(next,orderItemConfig.fields);

        if(name==="orderName"&&!record&&!field?.custom){
            const selectedProduct=products.find(product=>product.productName===value);
            if(selectedProduct){
                next.unitPrice=selectedProduct.rate||"";
                next.designNumber=selectedProduct.designNo||"";
            }
        }

        next=applyFormulas(orderItemConfig.fields,next);
        updatedOrders[index]={...next,customFields:next.customFields||{}};
        setSubOrders(updatedOrders);
        setFormData(prev=>({...prev,subOrders:updatedOrders}));
    };

    const handleConfiguredOrderValue=(name,value,record=null,field=null)=>{
        const currentCustomFields={...(formData.customFields||{})};
        let next={...formData,[name]:value,customFields:currentCustomFields};

        if(field?.custom)next.customFields={...currentCustomFields,[name]:value};
        if(field?.dataSource?.autoFill?.length)next=applyAutoFill(field,record,next);
        next=syncConfiguredCustomFields(next,orderFormConfig.fields);

        if(name==="companyName"&&!record&&!field?.custom){
            const selectedClient=clients.find(client=>client.companyName===value);
            if(selectedClient){
                next={...next,companyName:value,clientId:selectedClient._id||"",Address:selectedClient.address||"",State:selectedClient.state||"",City:selectedClient.city||"",pinCode:selectedClient.pinCode||"",stateCode:selectedClient.stateCode||"",gstNumber:selectedClient.gstNumber||"",paymentTerms:selectedClient.paymentTerms||"30",discountRate:selectedClient.discountRate||"0"};
            }
        }
        setFormData(applyFormulas(orderFormConfig.fields,next));
    };

    const fieldFor=(fields,key)=>fields.find(field=>field.key===key)||{key,label:key,fieldType:"text",width:6,visible:true,order:0};
    const configuredOrderValue=field=>{
        if(field.custom)return formData.customFields?.[field.key]??formData[field.key]??field.defaultValue??"";
        return formData[field.key]??field.defaultValue??"";
    };
    const configuredItemValue=(item,field)=>{
        if(field.custom)return item.customFields?.[field.key]??item[field.key]??field.defaultValue??"";
        return item[field.key]??field.defaultValue??"";
    };
    const visibleOrderFields=orderFormConfig.fields.filter(field=>field.visible!==false);
    const primaryInvoiceFieldKeys=new Set(["orderNumber","orderDate","companyName"]);
    const orderFieldValues={...formData,...(formData.customFields||{})};
    const primaryOrderFields=visibleOrderFields.filter(field=>{
        const state=getFieldState(field,orderFieldValues);
        return state.visible&&(state.required||primaryInvoiceFieldKeys.has(field.key));
    });
    const additionalOrderFields=visibleOrderFields.filter(field=>!primaryOrderFieldKeys.has(field.key));


    // const addSubOrderRow = () => {
    //     setSubOrders([
    //         ...subOrders,
    //         { designNumber: "", orderName: "", hsnCode: 0, qtyUnit: "", quantity: 0, cut: 0, MTR: 0, unitPrice: 0, shortPcs: 0 }
    //     ]);
    // };

    const addSubOrderRow = useCallback(() => {
        setSubOrders(prev => [
            ...prev,
            {
                designNumber: "",
                orderName: "",
                hsnCode: 0,
                qtyUnit: "",
                quantity: 0,
                cut: 0,
                MTR: 0,
                unitPrice: 0,
                shortPcs: 0,
                customFields: {}
            }
        ]);
    }, []);

    const deleteSubOrder = (index) => {
        const updated = subOrders.filter((_, i) => i !== index);
        setSubOrders(updated);
    };

    // Bind '+' key only when modal is open
    useEffect(() => {
        const handleKeyPress = (e) => {
            if (showModal && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                addSubOrderRow();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [showModal, addSubOrderRow]);

    const modalRef = useRef(null); // For trapping focus
    // Focus trap inside modal
    useEffect(() => {
        if (!showModal || !modalRef.current) return;

        const focusable = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        const trapFocus = (e) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                // Shift + Tab
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                // Tab
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', trapFocus);
        first?.focus();

        return () => document.removeEventListener('keydown', trapFocus);
    }, [showModal]);



    const handleInputChange = (e) => {
        const { name, value } = e.target;


        // if(subOrders.map((subOrder) => subOrder.orderName).includes(value)) {
        //     console.log("if enter subOrders");
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct ," selected product if enter subOrders")
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //             console.log("if if enter subOrders")
        //             return {
        //                 ...subOrder,
        //                 unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //             };
        //         }
        //         return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //         ...formData,
        //         subOrders: updatedSubOrders,
        //     });
        // } 
        // else {
        //     console.log("else enter subOrders")
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct ," selected product else enter subOrders")
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //             console.log("else if enter subOrders")
        //             return {
        //                 ...subOrder,
        //                 unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //             };
        //         }
        //         return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //         ...formData,
        //         subOrders: updatedSubOrders,
        //     });
        // }

        // if (name === "orderName") {
        //     console.log("if enter");
        //     const updatedSubOrders = subOrders.map((subOrder, index) => {
        //         if (subOrder.orderName === value) {
        //         console.log("if if enter")
        //         const selectedProduct = products.find(product => product.productName === value);
        //         console.log(selectedProduct ," selected product if if enter")
        //         return {
        //             ...subOrder,
        //             unitPrice: selectedProduct ? selectedProduct.rate : subOrder.unitPrice,
        //         };
        //     }
        //     return subOrder;
        //     });
        //     setSubOrders(updatedSubOrders);
        //     setFormData({
        //     ...formData,
        //     subOrders: updatedSubOrders,
        //     });
        // }


        // if (name === "orderName") {
        //     console.log(name, value, "name value orderName");
        //     const selectedProduct = products.find(product => product.productName === value);
        //     if (selectedProduct) {
        //     const updatedSubOrders = subOrders.map((subOrder, index) => ({
        //         ...subOrder,
        //         unitPrice: selectedProduct.rate || "",
        //         orderName: value,
        //     }));
        //     // const updatedSubOrders = subOrders.map((subOrder, index) => {  
        //         // if (index === editIndex) {
        //         // return { ...subOrder, unitPrice: selectedProduct.rate || "" };
        //         // }
        //         // return subOrder;
        //     // });
        //     setSubOrders(updatedSubOrders);
        //     console.log(updatedSubOrders, "updatedSubOrders");
        //     setFormData({
        //         ...formData,
        //         orderName: value,
        //         subOrders: updatedSubOrders,
        //     });
        //     }
        // }

        if (name === "companyName") {
            const selectedClient = clients.find(client => client.companyName === value);
            if (selectedClient) {
                setFormData({
                    ...formData,
                    companyName: value,
                    clientId: selectedClient._id || "",
                    Address: selectedClient.address || "",
                    State: selectedClient.state || "",
                    City: selectedClient.city || "",
                    pinCode: selectedClient.pinCode || "",
                    stateCode: selectedClient.stateCode || "",
                    gstNumber: selectedClient.gstNumber || "",
                    paymentTerms: selectedClient.paymentTerms || "30",
                    discountRate: selectedClient.discountRate || "0"
                });
            }
        }
        else {
            setFormData({
                ...formData,
                // subOrders: subOrders,
                [name]: value,
            });
        }



        // else {
        //     setFormData({
        //         ...formData,
        //         [name]: value,
        //     });
        // }

        // if (name === "orderName") {
        //     // const selectedProduct = products.find(product => product._id === value);
        //     const selectedProduct = products.find(product => product.productName === value);
        //     console.log(selectedProduct, "selectedProduct");

        //     if (selectedProduct) {
        //         setFormData({
        //             ...formData,
        //             orderName: value,
        //             unitPrice: selectedProduct.rate || "",
        //             // quantity: selectedProduct.quantity || "",
        //             // shortPcs: selectedClient.shortPcs || "",
        //         });
        //     }
        // }
        // else {
        //   setFormData({
        //     ...formData,
        //     [name]: value,
        //   });
        // }
    };

    const orderTotals = useMemo(() => {
        const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
        const discountRate = Math.min(100, Math.max(0, Number(formData.discountRate ?? 0)));
        const taxRate = Math.min(100, Math.max(0, Number(formData.taxPercentage ?? 0)));

        const lines = subOrders.map(item => {
            const unit = item.qtyUnit || "PCS";
            const quantity = Math.max(0, Number(item.quantity || 0));
            const mtr = Math.max(0, Number(item.MTR || 0));
            const shortPcs = Math.max(0, Number(item.shortPcs || 0));
            const unitPrice = Math.max(0, Number(item.unitPrice || 0));
            const billableQty = unit === "MTR"
                ? Math.max(0, mtr - shortPcs)
                : Math.max(0, quantity - shortPcs);

            return {
                billableQty,
                amount: round(billableQty * unitPrice),
                unit,
            };
        });

        const subtotal = round(lines.reduce((sum, line) => sum + line.amount, 0));
        const discount = round(subtotal * discountRate / 100);
        const taxable = round(subtotal - discount);
        const tax = round(taxable * taxRate / 100);
        const finalRevenue = round(taxable + tax);
        const grandTotal = Math.round(finalRevenue);
        const roundOff = round(grandTotal - finalRevenue);
        const paid = round(
            Array.isArray(formData.payments)
                ? formData.payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0)
                : Number(formData.paidAmount ?? editingOrder?.paidAmount ?? 0)
        );
        const creditApplied = Math.min(
            grandTotal,
            Math.max(0, round(Number(formData.creditAppliedAmount || editingOrder?.creditAppliedAmount || 0)))
        );
        const due = Math.max(0, round(grandTotal - paid - creditApplied));

        return { lines, subtotal, discount, taxable, taxRate, tax, finalRevenue, grandTotal, roundOff, paid, creditApplied, due };
    }, [
        subOrders,
        formData.discountRate,
        formData.taxPercentage,
        formData.payments,
        formData.paidAmount,
        formData.creditAppliedAmount,
        editingOrder?.paidAmount,
        editingOrder?.creditAppliedAmount,
    ]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setInvoiceFormError("");
        setOrdersMessage("");
        const orderValues={...formData,...(formData.customFields||{})};
        const requiredOrderFields=orderFormConfig.fields.filter(field=>{
            const state=getFieldState(field,orderValues);
            return state.visible&&state.required&&!field.formula;
        });
        const missingOrderField=requiredOrderFields.find(field=>String(configuredOrderValue(field)??"").trim()==="");
        if(missingOrderField){
            setInvoiceFormError(`Please complete “${missingOrderField.label}” before saving.`);
            return;
        }

        const requiredItemFields=orderItemConfig.fields.filter(field=>field.required&&!field.formula);
        const missingItem=requiredItemFields.length
            ? subOrders.find(item=>requiredItemFields.some(field=>{
                const state=getFieldState(field,{...item,...(item.customFields||{})});
                return state.visible&&state.required&&String(configuredItemValue(item,field)??"").trim()==="";
            }))
            : null;
        if(missingItem){
            const missingField=requiredItemFields.find(field=>String(configuredItemValue(missingItem,field)??"").trim()==="");
            setInvoiceFormError(`Please complete “${missingField?.label||"the item details"}” for the item before saving.`);
            return;
        }

        const customOrderFields=orderFormConfig.fields.filter(field=>field.custom);
        const orderCustomFields=Object.fromEntries(customOrderFields.map(field=>[
            field.key,
            formData.customFields?.[field.key]??formData[field.key]??field.defaultValue??""
        ]));

        const cleanItems = subOrders.map(item => ({
            ...item,
            customFields:Object.fromEntries(orderItemConfig.fields.filter(field=>field.custom).map(field=>[
                field.key,
                item.customFields?.[field.key]??item[field.key]??field.defaultValue??""
            ])),
            quantity: Math.max(0, Number(item.quantity || 0)),
            cut: Math.max(0, Number(item.cut || 0)),
            MTR: Math.max(0, Number(item.MTR || 0)),
            unitPrice: Math.max(0, Number(item.unitPrice || 0)),
            shortPcs: Math.max(0, Number(item.shortPcs || 0)),
            hsnCode: item.hsnCode === "" ? 0 : Number(item.hsnCode || 0),
        }));

        if (!String(formData.orderNumber || "").trim()) {
            setInvoiceFormError("Invoice number is missing. Check the invoice number field.");
            return;
        }
        if (!String(formData.companyName || "").trim()) {
            setInvoiceFormError("Choose a customer before saving this invoice.");
            return;
        }
        if (!cleanItems.length || cleanItems.every(item => !String(item.orderName || "").trim())) {
            setInvoiceFormError("Add at least one item before saving this invoice.");
            return;
        }

        try {
            setOrderSubmitting(true);
            const payload = {
                ...formData,
                orderNumber: String(formData.orderNumber || "").trim(),
                companyName: String(formData.companyName || "").trim(),
                taxPercentage: Math.min(100, Math.max(0, Number(formData.taxPercentage ?? 0))),
                discountRate: Math.min(100, Math.max(0, Number(formData.discountRate ?? 0))),
                subOrders: cleanItems,
                customFields:orderCustomFields,
            };

            const wasEditing=Boolean(editingOrder);
            if (wasEditing) {
                await axios.put(
                    `${linkone}/api/order/orders/${editingOrder._id}/update`,
                    payload,
                    authConfig()
                );
            } else {
                await axios.post(
                    `${linkone}/api/order/orders/create`,
                    payload,
                    authConfig()
                );
                await incrementBillNoSequence();
            }

            setShowModal(false);
            setEditingOrder(null);
            setSubOrders([]);
            setOrdersMessage(wasEditing?"Invoice updated successfully.":"Invoice created successfully.");
            await fetchOrders();
        } catch (error) {
            setInvoiceFormError(error.response?.data?.message || error.message || "We could not save this invoice. Check the details and try again.");
        } finally {
            setOrderSubmitting(false);
        }
    };

    const handleEdit = (order) => {
        setInvoiceFormError("");
        setOrdersMessage("");
        setEditingOrder(order);
        const configuredOrder=buildConfiguredDefaults(hydrateConfiguredValues(order,orderFormConfig.fields),orderFormConfig.fields);
        const configuredItems=(order.subOrders||[]).map(item=>buildConfiguredDefaults(hydrateConfiguredValues(item,orderItemConfig.fields),orderItemConfig.fields));
        setSubOrders(configuredItems.map(item=>({...item,customFields:{...(item.customFields||{})}})));
        setFormData({...configuredOrder,customFields:{...(order.customFields||{})}});
        setShowModal(true);
    };

    const handlePaymentEdit = (order) => {
        setEditingOrder(order);
        setFormData(order);
        setEditPayment(null);
        setNewPayment({
            amount: "",
            method: "Cash",
            amountReference: "",
            paymentDate: new Date().toISOString().slice(0, 10),
        });
        setShowPaymentModal(true);
    };

    const handleStatus = (order) => {
        setEditingOrder(order);
        setStatusModal(true);
    };

    const handleStatusChange = async (orderId, newStatus) => {
        const updatedOrder = orders.find(order => order._id === orderId);

        if (!updatedOrder) return;

        // Ensure statusHistory is initialized
        if (!updatedOrder.statusHistory) {
            updatedOrder.statusHistory = [];
        }

        updatedOrder.status = newStatus;
        updatedOrder.statusHistory.push({ status: newStatus, timestamp: new Date().toISOString() });

        await axios.patch(`${linkone}/api/order/orders/${orderId}/upd`, updatedOrder, authConfig());

        alert("✅ Status change to " + newStatus);
        fetchOrders();
    };


    useEffect(() => {
        // setLoading(true);
        if (showPaymentModal) fetchPayments();
        // setLoading(false);
    }, [showPaymentModal]);

    const fetchPayments = async () => {
        try {
            const response = await axios.get(`${linkone}/api/order/orders/${editingOrder._id}/payments`, authConfig());
            setPayments(response.data);
        } catch (error) {
            console.error("Error fetching payments" + error.response.data.message);
        }
    };

    const addPayment = async (orderId) => {
        const amount = Number(newPayment.amount);
        const due = Number(editingOrder?.dueAmount || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
            alert("❌ Enter a valid payment amount.");
            return;
        }
        if (amount > due + 0.01) {
            alert(`❌ Payment cannot exceed the current due balance of ₹${due.toFixed(2)}.`);
            return;
        }

        try {
            const response = await axios.post(
                `${linkone}/api/order/orders/${orderId}/pay`,
                {
                    ...newPayment,
                    amount,
                    paymentDate: newPayment.paymentDate || new Date().toISOString().slice(0, 10),
                },
                authConfig()
            );
            await fetchPayments();
            setEditingOrder(response.data?.order || editingOrder);
            setNewPayment({ amount: "", method: "Cash", amountReference: "", paymentDate: new Date().toISOString().slice(0, 10) });
            await fetchOrders();
            alert("✅ Payment added successfully.");
        } catch (error) {
            alert("❌ " + (error.response?.data?.message || error.message || "Unable to add payment."));
        }
    };

    const updatePayment = async () => {
        if (!editingOrder || !editPayment) return;
        try {
            const response = await axios.put(
                `${linkone}/api/order/orders/${editingOrder._id}/payments/${editPayment._id}`,
                {
                    ...editPayment,
                    amount: Number(editPayment.amount),
                    paymentDate: editPayment.paymentDate || new Date().toISOString().slice(0, 10),
                },
                authConfig()
            );
            await fetchPayments();
            setEditingOrder(response.data?.order || editingOrder);
            setEditPayment(null);
            await fetchOrders();
            alert("✅ Payment updated successfully.");
        } catch (error) {
            alert("❌ Error updating payment: " + (error.response?.data?.message || error.message || "Unable to update payment."));
        }
    };

    const deletePayment = async (paymentId) => {
        if (!editingOrder?._id || !paymentId) return;
        if (!window.confirm("Delete this payment? The invoice balance will be recalculated.")) return;

        try {
            const response = await axios.delete(
                `${linkone}/api/order/orders/${editingOrder._id}/payments/${paymentId}`,
                authConfig()
            );
            await fetchPayments();
            setEditingOrder(response.data?.order || editingOrder);
            await fetchOrders();
            alert("✅ Payment deleted successfully.");
        } catch (error) {
            alert("❌ Error deleting payment: " + (error.response?.data?.message || error.message || "Unable to delete payment."));
        }
    };

    const handleDeleteOrder = async (order) => {
        const password = prompt("Enter password to delete:");
        if (password === "123") {

            try {
                await axios.delete(`${linkone}/api/order/orders/${order}/delete`, authConfig());
                fetchOrders();
                alert("✅ Order Delete Sucessfully")
            } catch (error) {
                alert("❌ " + error.response.data.message || "Error deleting order");
                // alert("dc " , error.response.data.message)
                // console.error('Error deleting client', error);
            }
        } else {
            alert("❌ Incorrect password");
        }
    };

    const printKachuBill = (order) => {
        window.open(`${linkone}/api/order/${order}/KachuBill`, "_blank");
    };
    const printInvoice = async (order) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            alert("Please allow pop-ups to open the invoice.");
            return;
        }

        const esc = (value) => String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

        const buildFallbackInvoice = () => {
            const rows = (order.subOrders || []).map((item, index) => {
                const unit = item.qtyUnit || "PCS";
                const qty = unit === "MTR" ? Number(item.MTR || 0) : Number(item.quantity || 0);
                const amount = qty * Number(item.unitPrice || 0);
                return `<tr><td>${index + 1}</td><td>${esc(item.orderName)}</td><td>${esc(item.designNumber)}</td><td>${esc(item.hsnCode)}</td><td>${qty.toFixed(2)} ${esc(unit)}</td><td>${Number(item.unitPrice || 0).toFixed(2)}</td><td>${amount.toFixed(2)}</td></tr>`;
            }).join("");

            return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(order.orderNumber)}</title><style>
            body{font-family:Arial,sans-serif;padding:24px;color:#111} .wrap{max-width:1100px;margin:auto}
            .head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:14px}
            table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #222;padding:7px;font-size:13px}
            th{background:#f2f2f2}.right{text-align:right}@media print{body{padding:0}}
            </style></head><body><div class="wrap"><div class="head">
            <div><h2>${esc(profile.companyName || "Company")}</h2><div>${esc(profile.companyAddress || "")}</div><div>GSTIN: ${esc(profile.gstin || "")}</div></div>
            <div><h2>INVOICE</h2><div>Invoice: <b>${esc(order.orderNumber)}</b></div><div>Date: ${new Date(order.orderDate).toLocaleDateString("en-IN")}</div></div>
            </div><p><b>Bill To:</b> ${esc(order.companyName || "Customer")}</p><p>${esc(order.Address || "")}</p>
            <table><thead><tr><th>#</th><th>Item</th><th>Design</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No items</td></tr>'}</tbody></table>
            <div class="right" style="margin-top:18px"><div>Taxable: ₹${Number(order.totalCost || 0).toFixed(2)}</div><div>Tax: ₹${Number(order.taxAmount || 0).toFixed(2)}</div><h3>Total: ₹${Number(order.roundOffFinalRevenue || 0).toFixed(2)}</h3><div>Paid: ₹${Number(order.paidAmount || 0).toFixed(2)} | Due: ₹${Number(order.dueAmount || 0).toFixed(2)}</div></div>
            </div></body></html>`;
        };

        printWindow.document.write("<p style='font-family:sans-serif;padding:24px'>Loading invoice...</p>");

        try {
            const response = await axios.get(
                `${linkone}/api/order/${order._id}/invoice`,
                {
                    ...authConfig(),
                    responseType: "text"
                }
            );

            printWindow.document.open();
            printWindow.document.write(response.data);
            printWindow.document.close();
            printWindow.focus();
        } catch (error) {
            console.error("Error opening invoice:", error);
            try {
                printWindow.document.open();
                printWindow.document.write(buildFallbackInvoice());
                printWindow.document.close();
                printWindow.focus();
            } catch (fallbackError) {
                console.error("Fallback invoice error:", fallbackError);
                printWindow.close();
                alert(error.response?.data?.message || error.message || "Failed to open invoice.");
            }
        }
    };

    const printReceipt = async (paymentId) => {
        if (!editingOrder?._id || !paymentId) return;

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            alert("Please allow pop-ups to print the payment receipt.");
            return;
        }

        printWindow.document.open();
        printWindow.document.write("<p style='font-family:Arial,sans-serif;padding:24px'>Preparing receipt...</p>");
        printWindow.document.close();

        try {
            const response = await axios.get(
                `${linkone}/api/order/${editingOrder._id}/payments/${paymentId}/invoice`,
                { ...authConfig(), responseType: "text" }
            );
            printWindow.document.open();
            printWindow.document.write(response.data);
            printWindow.document.close();
            printWindow.focus();
        } catch (error) {
            printWindow.close();
            alert("❌ Unable to print receipt: " + (error.response?.data?.message || error.message || "Unknown error"));
        }
    };

    const sortedOrders = useMemo(() => {
        let sortableOrders = [...orders];
        if (sortConfig.key) {
            sortableOrders.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
                if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableOrders;
    }, [orders, sortConfig]);

    // Filtering
    const filteredOrders = useMemo(() => {
        return sortedOrders.filter(order => {
            const clientName = clients.find(client => client._id === order.clientId)?.companyName || '';
            return (
                (clientName.toLowerCase().includes(search.toLowerCase()) || order.orderNumber.toLowerCase().includes(search.toLowerCase())) &&
                (filters.status === '' || order.status === filters.status) &&
                (filters.paymentStatus === '' || order.paymentStatus === filters.paymentStatus) &&
                (filters.dateRange.length === 0 || (new Date(order.orderDate) >= new Date(filters.dateRange[0]) && new Date(order.orderDate) <= new Date(filters.dateRange[1]))) &&
                // (filters.minTotal === '' || order.totalCost >= parseInt(filters.minTotal)) &&
                // (filters.maxTotal === '' || order.totalCost <= parseInt(filters.maxTotal)) &&
                (filters.startDate === '' || new Date(order.orderDate) >= new Date(filters.startDate)) &&
                (filters.endDate === '' || new Date(order.orderDate) <= new Date(filters.endDate))
            );
        });
    }, [sortedOrders, search, filters, clients]);

    // Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentOrders = filteredOrders.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

    // // Handlers
    // const handleSort = (key) => {
    //     setSortConfig({
    //         key,
    //         direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    //     });
    // };

    // const handleSort = (key) => {
    //     setSortConfig(prev => {
    //         const direction = prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc';
    //         return { key, direction };
    //     });
    // };

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortOrder('asc');
        }
    };


    // -----------------------------
    // using    
    // const sortedData = [...filteredOrders].sort((a, b) => {

    //         // const sortedData = [...orders].sort((a, b) => {
    //         let aVal = a[sortKey];
    //         let bVal = b[sortKey];

    //         // Handle date comparison
    //         if (sortKey === 'orderDate') {
    //             aVal = new Date(aVal);
    //             bVal = new Date(bVal);
    //         }

    //         // Handle number comparison
    //         if (typeof aVal === 'number' && typeof bVal === 'number') {
    //             return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    //         }

    //         // Default string comparison
    //         return sortOrder === 'asc'
    //             ? aVal?.toString().localeCompare(bVal?.toString())
    //             : bVal?.toString().localeCompare(aVal?.toString());
    //     });
    // ---------------
    const sortedData = [...filteredOrders].sort((a, b) => {
        let aVal = a[sortKey];
        let bVal = b[sortKey];

        // OrderNumber (natural sort: SS-1, SS-2, ..., SS-100)
        if (sortKey === 'orderNumber') {
            const numA = parseInt(aVal.match(/\d+/)?.[0] ?? 0, 10);
            const numB = parseInt(bVal.match(/\d+/)?.[0] ?? 0, 10);

            if (numA !== numB) {
                return sortOrder === 'asc' ? numA - numB : numB - numA;
            }

            // if numbers are equal, fallback to string compare (handles SS-09 vs SS-9)
            return sortOrder === 'asc'
                ? aVal.localeCompare(bVal, undefined, { sensitivity: 'base' })
                : bVal.localeCompare(aVal, undefined, { sensitivity: 'base' });
        }

        // Date comparison
        if (sortKey === 'orderDate') {
            return sortOrder === 'asc'
                ? new Date(aVal) - new Date(bVal)
                : new Date(bVal) - new Date(aVal);
        }

        // Number comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // String (default) comparison
        const strA = aVal?.toString() ?? "";
        const strB = bVal?.toString() ?? "";
        return sortOrder === 'asc'
            ? strA.localeCompare(strB, undefined, { sensitivity: 'base' })
            : strB.localeCompare(strA, undefined, { sensitivity: 'base' });
    });


    const handleExportExcel = () => {
        // const exportData = filteredOrders.map(order => ({
        const exportData = sortedData.map(order => ({
            Bill_Date: new Date(order.orderDate).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }),
            Inv_No: order.orderNumber,
            Ch_No: order.challanNumber,
            Company_Name: order.companyName,
            Qty: order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.quantity), 0),
            Cut: order.subOrders.reduce((acc, subOrder) => acc + parseInt(subOrder.cut), 0),
            Inv_Amt: order.roundOffFinalRevenue,
            Paid_Amt: order.paidAmount,
            Due_Amt: order.dueAmount,
            // new Date(order.orderDate).toLocaleDateString("en-IN", {
            //     year: "numeric",
            //     month: "2-digit",
            //     day: "2-digit",
            //     hour: "2-digit",
            //     minute: "2-digit",
            //     second: "2-digit",
            // }),
            Due_Date: new Date(Date.parse(order.orderDate) + order.paymentTerms * 86400000),
            Due_Days: Math.floor((new Date(order.orderDate) - new Date()) / 86400000),

            // Due_Date: new Date(order.orderDate.getTime() + order.paymentTerms * 86400000),
            // Due_Days: Math.floor((order.orderDate - new Date()) / 86400000),
            // ...order,

        }));
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
        XLSX.writeFile(workbook, 'orders_report.xlsx');
    };

    // const getSortIcon = (key) => {
    //     if (sortConfig.key !== key) return '↕';
    //     return sortConfig.direction === 'asc' ? '↑' : '↓';
    // };
    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? '↑' : '↓';
    };

    const reportRef = useRef();
    const contentRef = useRef(null);
    const reactToPrintFn = useReactToPrint({ contentRef });

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
                <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    // const handleDelete = (index) => {
    //     const updated = subOrders.filter((_, i) => i !== index);
    //     setSubOrders(updated);
    // };
    const handleDownloadEwayBill = async (ewbNo) => {
        if (!ewbNo) return alert('❌ Invalid EWB number');

        // setLoading(true); // Start spinner
        alert('Downloading PDF...');
        try {
            const response = await axios.get(`${linkone}/api/ewaybill/pdf/${ewbNo}/${profile.gstin}/${profile.eWayUserName}/${profile.eWayPassword}`, {
                responseType: 'blob',
                headers: { 'x-auth-token': localStorage.getItem('token') || '' }
            });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `ewaybill_${ewbNo}.pdf`;
            document.body.appendChild(link);
            link.click();

            // Cleanup
            link.remove();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Error downloading PDF:', err);
            alert('❌ Failed to download PDF');
        } finally {
            // setLoading(false); // Stop spinner
            alert('✅ Download complete');
        }
    }
const styles = {
        pageReport: {
            '@media print': {
                body: {
                    '-webkit-print-color-adjust': 'exact',
                },
            },
        },
    };


    const hasActiveInvoiceFilters=Boolean(
        search.trim()||filters.status||filters.paymentStatus||filters.startDate||filters.endDate||
        (Array.isArray(filters.dateRange)&&filters.dateRange.length)
    );
    const clearInvoiceFilters=()=>{
        setSearch("");
        setFilters({status:"",paymentStatus:"",dateRange:[],minTotal:"",maxTotal:"",startDate:"",endDate:""});
        setCurrentPage(1);
    };

    return (
        <div className="container-fluid invoice-page py-4">

            <header className="business-page-heading invoice-page-heading mb-3">
                <div>
                    <span className="page-eyebrow">SALES</span>
                    <h1 className="mb-1">Invoices</h1>
                    <div className="text-muted">Create invoices, check what is paid, and see what is still due.</div>
                </div>

                <button className="btn btn-primary d-inline-flex align-items-center gap-2 shadow-sm" onClick={() => {
                    const newSubOrders=[emptyOrderItem()];
                    const nextOrder={...emptyOrder(),subOrders:newSubOrders};
                    setShowModal(true);
                    setEditingOrder(null);
                    setInvoiceFormError("");
                    setOrdersMessage("");
                    setSubOrders(newSubOrders);
                    setFormData(nextOrder);
                }}>
                    <i className="bi bi-plus-lg"></i> New invoice
                </button>

                <Link to="/bulk-payment" className="btn btn-light border d-inline-flex align-items-center gap-2">
                    <i className="bi bi-cash-stack"></i> Record payments
                </Link>
            </header>

            {ordersError&&<div className="alert alert-danger" role="alert">{ordersError}</div>}
            {ordersMessage&&<div className="alert alert-success d-flex align-items-center gap-2" role="status"><i className="bi bi-check-circle-fill"></i><span>{ordersMessage}</span><button type="button" className="btn-close ms-auto" aria-label="Dismiss message" onClick={()=>setOrdersMessage("")}></button></div>}

            <div className="py-2">

                <div className="card p-3">
                    <section className="invoice-filter-panel mb-3" aria-label="Find invoices">
                        <div className="row g-2 align-items-center">
                            <div className="col-lg-6">
                                <label className="visually-hidden" htmlFor="invoice-search">Search invoices</label>
                                <div className="input-group">
                                    <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                                    <input id="invoice-search" type="search" className="form-control" placeholder="Search invoice number or customer" value={search} onChange={event=>{setSearch(event.target.value);setCurrentPage(1);}}/>
                                    {search&&<button type="button" className="btn btn-light border" onClick={()=>setSearch("")}>Clear</button>}
                                </div>
                            </div>
                            <div className="col-sm-6 col-lg-3">
                                <select className="form-select" aria-label="Filter invoices by status" value={filters.status} onChange={event=>{setFilters(prev=>({...prev,status:event.target.value}));setCurrentPage(1);}}>
                                    <option value="">All invoice statuses</option>
                                    <option value="Pending">Pending</option>
                                    <option value="In Process">In progress</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Dispatched">Dispatched</option>
                                </select>
                            </div>
                            <div className="col-sm-6 col-lg-3">
                                <select className="form-select" aria-label="Filter invoices by payment status" value={filters.paymentStatus} onChange={event=>{setFilters(prev=>({...prev,paymentStatus:event.target.value}));setCurrentPage(1);}}>
                                    <option value="">All payment statuses</option>
                                    <option value="Unpaid">Unpaid</option>
                                    <option value="Partial">Partly paid</option>
                                    <option value="Paid">Paid</option>
                                </select>
                            </div>
                        </div>

                        <details className="filter-details mt-3">
                            <summary><i className="bi bi-calendar3 me-2"></i>Filter by date <span className="text-secondary fw-normal">(optional)</span></summary>
                            <div className="row g-2 pt-3 align-items-end">
                                <div className="col-sm-5">
                                    <label className="form-label small" htmlFor="invoice-date-from">From</label>
                                    <input id="invoice-date-from" type="date" className="form-control" value={filters.startDate||""} onChange={event=>setFilters(prev=>({...prev,startDate:event.target.value}))}/>
                                </div>
                                <div className="col-sm-5">
                                    <label className="form-label small" htmlFor="invoice-date-to">To</label>
                                    <input id="invoice-date-to" type="date" className="form-control" value={filters.endDate||""} onChange={event=>setFilters(prev=>({...prev,endDate:event.target.value}))}/>
                                </div>
                                <div className="col-sm-2">
                                    <button type="button" className="btn btn-outline-secondary w-100" onClick={()=>setFilters(prev=>({...prev,startDate:"",endDate:"",dateRange:[]}))}>Clear dates</button>
                                </div>
                            </div>
                        </details>

                        <div className="invoice-list-toolbar mt-3">
                            <span className="small text-secondary">{filteredOrders.length} invoice{filteredOrders.length===1?"":"s"}{hasActiveInvoiceFilters?" match your filters":" found"}</span>
                            <div className="d-flex flex-wrap gap-2">
                                {hasActiveInvoiceFilters&&<button type="button" className="btn btn-sm btn-light border" onClick={clearInvoiceFilters}>Clear filters</button>}
                                <button type="button" className="btn btn-sm btn-light border" onClick={handleExportExcel}><i className="bi bi-download me-1"></i>Export Excel</button>
                                <button type="button" className="btn btn-sm btn-light border" onClick={reactToPrintFn}><i className="bi bi-printer me-1"></i>Print report</button>
                            </div>
                            <div ref={contentRef} className="d-print-block d-none">
                                <div style={styles.pageReport}><Report ref={reportRef} data={sortedData}/></div>
                            </div>
                        </div>
                    </section>
                    {/* Table */}
                    <DynamicTable
                        tableKey="orders.list"
                        autoOpenSettings={tableCustomizeRequested}
                        rows={sortedData}
                        loading={loadingOrders}
                        getRowKey={order=>order._id}
                        emptyText={hasActiveInvoiceFilters?"No invoices match these filters. Clear the filters to see all invoices.":"No invoices yet. Select New invoice to create your first invoice."}
                        columns={[
                            {key:"__rowNumber",label:"#",render:(_row,index)=>index+1},
                            {key:"orderDate",label:"Date",render:order=>order.orderDate?new Date(order.orderDate).toLocaleDateString("en-IN"):""},
                            {key:"orderNumber",label:"Invoice no."},
                            {key:"challanNumber",label:"Challan No"},
                            {key:"companyName",label:"Customer",render:order=>clients.find(client=>client._id===order.clientId)?.companyName||order.companyName||""},
                            {key:"status",label:"Status",render:order=>(
                                <select className="form-select form-select-sm" value={order.status||"Pending"} onChange={e=>handleStatusChange(order._id,e.target.value)}>
                                    <option value="Pending">Pending</option>
                                    <option value="In Process">In Process</option>
                                    <option value="Cancelled">Cancelled</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Dispatched">Dispatched</option>
                                </select>
                            )},
                            {key:"paymentStatus",label:"Payment Status",render:order=>(
                                <span className={`badge ${order.paymentStatus==="Paid"?"bg-success":order.paymentStatus==="Partial"?"bg-warning text-dark":"bg-secondary"}`}>
                                    {order.paymentStatus||"Unpaid"}
                                </span>
                            )},
                            {key:"quantity",label:"Qty",render:order=>(order.subOrders||[]).reduce((sum,item)=>sum+(Number(item.quantity)||0),0).toFixed(2)},
                            {key:"cut",label:"Cut",render:order=>(order.subOrders||[]).reduce((sum,item)=>sum+(Number(item.cut)||0),0).toFixed(2)},
                            {key:"unitPrice",label:"Unit Price",render:order=>(order.subOrders||[]).length?((order.subOrders||[]).reduce((sum,item)=>sum+(Number(item.unitPrice)||0),0)/(order.subOrders||[]).length).toFixed(2):"0.00"},
                            {key:"roundOffFinalRevenue",label:"Invoice total",render:order=>`₹${Number(order.roundOffFinalRevenue||0).toFixed(2)}`},
                            {key:"paidAmount",label:"Paid Amount",render:order=>`₹${Number(order.paidAmount||0).toFixed(2)}`},
                            {key:"dueAmount",label:"Due Amount",render:order=>`₹${Number(order.dueAmount||0).toFixed(2)}`},
                        ]}
                        onSort={handleSort}
                        actionColumn={{
                            label:"Actions",
                            locked:true,
                            render:order=>(
                                <div className="invoice-row-actions">
                                    <button type="button" className="btn btn-sm btn-light border" onClick={()=>handleEdit(order)} title="Edit this invoice">
                                        <i className="bi bi-pencil me-1"></i>Edit
                                    </button>
                                    <button type="button" className="btn btn-sm btn-light border" onClick={()=>handlePaymentEdit(order)} title="Record a payment">
                                        <i className="bi bi-cash-stack me-1"></i>Payment
                                    </button>
                                    <button type="button" className="btn btn-sm btn-light border" onClick={()=>printInvoice(order)} title="Print invoice">
                                        <i className="bi bi-printer me-1"></i>Print
                                    </button>
                                    <button type="button" className="btn btn-sm btn-light border" onClick={()=>{setShowEwayBillModal(true);setOrderId(order._id);}} disabled={Boolean(order.ewbDetails?.ewbNo)} title={order.ewbDetails?.ewbNo?"E-Way Bill already created":"Create E-Way Bill"}>
                                        <i className="bi bi-truck me-1"></i>E-Way
                                    </button>
                                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>handleDeleteOrder(order._id)} title="Delete this invoice">
                                        <i className="bi bi-trash me-1"></i>Delete
                                    </button>
                                </div>
                            )
                        }}
                        footer={({visibleColumns,hasActions})=>{
                            const totals={
                                roundOffFinalRevenue:sortedData.reduce((sum,item)=>sum+Number(item.roundOffFinalRevenue||0),0).toFixed(2),
                                paidAmount:sortedData.reduce((sum,item)=>sum+Number(item.paidAmount||0),0).toFixed(2),
                                dueAmount:sortedData.reduce((sum,item)=>sum+Number(item.dueAmount||0),0).toFixed(2)
                            };
                            return (
                                <tr>
                                    {visibleColumns.map((column,index)=>(
                                        <td key={column.key} className={totals[column.key]?"fw-bold":index===0?"text-end fw-bold":""}>
                                            {totals[column.key] ? "₹"+totals[column.key] : index===0 ? "Total:" : ""}
                                        </td>
                                    ))}
                                    {hasActions&&<td></td>}
                                </tr>
                            );
                        }}
                    />

                    {/* Pagination */}
                    {/* <nav aria-label="Page navigation">
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
                    </nav> */}
                </div>
            </div>


            {showModal && (
                <div className="modal show d-block invoice-modal-backdrop" tabIndex="-1" role="presentation">
                    <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
                        <div className="modal-content invoice-create-modal border-0" ref={modalRef}>
                            <div className="modal-header invoice-create-header p-4">
                                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 w-100">
                                    <div className="d-flex align-items-center gap-2">
                                        <div>
                                            <div className="small text-primary text-uppercase fw-semibold mb-1">INVOICE</div>
                                            <h5 className="modal-title fw-bold mb-1">
                                                {editingOrder ? "Edit invoice" : "Create an invoice"}
                                            </h5>
                                            <div className="small text-secondary">Choose a customer, add the items you sold, and the total is worked out for you.</div>
                                        </div>
                                        <details className="invoice-more-options">
                                            <summary><i className="bi bi-three-dots me-1"></i>More options</summary>
                                            <div className="invoice-more-options-panel">
                                                <button type="button" className="btn btn-sm btn-light border" onClick={()=>setFormSettingsOpen(true)}>Customize invoice fields</button>
                                                <button type="button" className="btn btn-sm btn-light border" onClick={()=>setItemSettingsOpen(true)}>Customize item fields</button>
                                            </div>
                                        </details>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => setShowModal(false)}
                                    aria-label="Close"
                                ></button>
                            </div>
                            <div className="modal-body p-4 invoice-create-body">
                                <form onSubmit={handleSubmit}>
                                    {invoiceFormError&&<div className="alert alert-danger d-flex gap-2 align-items-start" role="alert"><i className="bi bi-exclamation-circle-fill mt-1"></i><div>{invoiceFormError}</div></div>}
                                    <section className="card border-0 shadow-sm mb-3 invoice-basics-card">
                                        <div className="card-header bg-white d-flex align-items-start gap-2 py-3">
                                            <span className="invoice-step-number">1</span>
                                            <div>
                                                <h6 className="mb-1 fw-semibold">Invoice basics</h6>
                                                <div className="small text-secondary">Start with the invoice number, date and customer. Other details can be added if needed.</div>
                                            </div>
                                        </div>
                                        <div className="card-body">
                                            <div className="row g-3">
                                                {primaryOrderFields.map(field=>{
                                                    const state=getFieldState(field,{...formData,...(formData.customFields||{})});
                                                    if(!state.visible)return null;
                                                    const source=field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[];
                                                    const value=field.key==="orderDate"
                                                        ? (configuredOrderValue(field)?new Date(configuredOrderValue(field)).toISOString().slice(0,10):"")
                                                        : configuredOrderValue(field);
                                                    return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                                        <ConfiguredField
                                                            field={{...field,required:state.required,readOnly:state.readOnly,disabled:state.disabled}}
                                                            value={value}
                                                            onChange={next=>{setInvoiceFormError("");handleConfiguredOrderValue(field.key,next,null,field);}}
                                                            onRecordChange={record=>{setInvoiceFormError("");handleConfiguredOrderValue(field.key,record?.[field.dataSource?.valueField||"_id"]??"",record,field);}}
                                                            lookupRecords={source}
                                                            options={field.options||[]}
                                                            listId={field.key==="companyName"&&!field.custom&&!field.dataSource?.resource?"orderCompanyName":undefined}
                                                            listOptions={field.key==="companyName"&&!field.custom&&!field.dataSource?.resource?clients.map(client=>client.companyName):[]}
                                                            icon=""
                                                            required={state.required}
                                                        />
                                                    </div>;
                                                })}
                                            </div>
                                        </div>
                                    </section>

                                    {additionalOrderFields.some(field=>getFieldState(field,{...formData,...(formData.customFields||{})}).visible)&&(
                                        <details className="invoice-additional-details mb-3">
                                            <summary><i className="bi bi-sliders me-2"></i>More invoice details <span>Optional fields such as address, delivery and tax settings</span></summary>
                                            <div className="invoice-additional-details-body">
                                                <div className="row g-3">
                                                    {additionalOrderFields.map(field=>{
                                                        const state=getFieldState(field,{...formData,...(formData.customFields||{})});
                                                        if(!state.visible)return null;
                                                        const source=field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[];
                                                        const value=field.key==="orderDate"
                                                            ? (configuredOrderValue(field)?new Date(configuredOrderValue(field)).toISOString().slice(0,10):"")
                                                            : configuredOrderValue(field);
                                                        return <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                                            <ConfiguredField
                                                                field={{...field,required:state.required,readOnly:state.readOnly,disabled:state.disabled}}
                                                                value={value}
                                                                onChange={next=>{setInvoiceFormError("");handleConfiguredOrderValue(field.key,next,null,field);}}
                                                                onRecordChange={record=>{setInvoiceFormError("");handleConfiguredOrderValue(field.key,record?.[field.dataSource?.valueField||"_id"]??"",record,field);}}
                                                                lookupRecords={source}
                                                                options={field.options||[]}
                                                                listId={field.key==="companyName"&&!field.custom&&!field.dataSource?.resource?"orderCompanyName":undefined}
                                                                listOptions={field.key==="companyName"&&!field.custom&&!field.dataSource?.resource?clients.map(client=>client.companyName):[]}
                                                                icon=""
                                                                required={state.required}
                                                            />
                                                        </div>;
                                                    })}
                                                </div>
                                            </div>
                                        </details>
                                    )}

                                    <div className="row g-3">
                                        <div className="col-12">
                                            <section className="card border-0 shadow-sm">
                                                <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
                                                    <div className="d-flex align-items-center gap-2">
                                                        <i className="bi bi-box-seam text-primary"></i>
                                                        <h6 className="mb-0 fw-semibold">Items being sold</h6>
                                                    </div>
                                                    <button type="button" className="btn btn-primary btn-sm" onClick={()=>{setInvoiceFormError("");addSubOrderRow();}}>
                                                        <i className="bi bi-plus-lg me-1"></i>Add item
                                                    </button>
                                                </div>
                                                <div className="card-body">
                                                    {subOrders.map((order,index)=>{
                                                        const itemValues={...order,...(order.customFields||{})};
                                                        const itemFields=orderItemConfig.fields.filter(field=>getFieldState(field,itemValues).visible).sort((a,b)=>a.order-b.order);
                                                        return (
                                                            <div key={index} className="order-config-item-row border rounded-3 bg-light p-3 mb-3">
                                                                <div className="d-flex align-items-center justify-content-between mb-3">
                                                                    <span className="fw-semibold">Item {index+1}</span>
                                                                    {subOrders.length>1&&(
                                                                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>deleteSubOrder(index)}>
                                                                            <i className="bi bi-trash me-1"></i>Remove
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="row g-3">
                                                                    {itemFields.map(field=>(
                                                                        <div key={field.key} className={`col-12 col-md-${field.width||6}`}>
                                                                            <ConfiguredField
                                                                                field={{...field,...getFieldState(field,itemValues)}}
                                                                                value={configuredItemValue(order,field)}
                                                                                onChange={next=>handleSubOrderValueChange(index,field.key,next,null,field)}
                                                                                onRecordChange={record=>handleSubOrderValueChange(index,field.key,record?.[field.dataSource?.valueField||"_id"]??"",record,field)}
                                                                                lookupRecords={field.dataSource?.resource?linkedRecords[field.dataSource.resource]||[]:[]}
                                                                                options={field.options||[]}
                                                                                listId={field.key==="orderName"&&!field.custom?"orderItemName":undefined}
                                                                                listOptions={field.key==="orderName"&&!field.custom?products.map(product=>product.productName):[]}
                                                                                required={getFieldState(field,itemValues).required}
                                                                                readOnly={getFieldState(field,itemValues).readOnly}
                                                                                disabled={getFieldState(field,itemValues).disabled}
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="small text-secondary">
                                                        <i className="bi bi-lightbulb me-1"></i>
                                                        Choose a product, enter its quantity, and check the rate. Item amounts and invoice totals update automatically.
                                                    </div>
                                                </div>
                                            </section>
                                        </div>
                                    </div>

                                    <div className="card border-0 shadow-sm mt-3">
                                        <div className="card-body p-4">
                                            <div className="row g-3 align-items-center">
                                                <div className="col-md-7">
                                                    <div className="fw-bold text-dark mb-1">Invoice summary</div>
                                                    <div className="small text-muted">Totals update automatically while you enter the bill.</div>
                                                </div>
                                                <div className="col-md-5">
                                                    <div className="d-flex justify-content-between small mb-1"><span className="text-muted">Items Subtotal</span><strong>₹{orderTotals.subtotal.toFixed(2)}</strong></div>
                                                    <div className="d-flex justify-content-between small mb-1"><span className="text-muted">Discount</span><strong className="text-danger">- ₹{orderTotals.discount.toFixed(2)}</strong></div>
                                                    <div className="d-flex justify-content-between small mb-1"><span className="text-muted">Tax</span><strong>₹{orderTotals.tax.toFixed(2)}</strong></div>
                                                    <div className="d-flex justify-content-between small mb-2"><span className="text-muted">Round Off</span><strong>₹{orderTotals.roundOff.toFixed(2)}</strong></div>
                                                    <div className="d-flex justify-content-between align-items-center border-top pt-2">
                                                        <span className="fw-bold">Invoice total</span>
                                                        <span className="fs-4 fw-bold text-primary">₹{orderTotals.grandTotal.toFixed(2)}</span>
                                                    </div>
                                                    <div className="d-flex justify-content-between mt-2"><span className="text-muted">Paid</span><strong className="text-success">₹{orderTotals.paid.toFixed(2)}</strong></div>
                                                    <div className="d-flex justify-content-between"><span className="text-muted">Current due</span><strong className="text-danger">₹{orderTotals.due.toFixed(2)}</strong></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="invoice-save-footer mt-4">
                                        <div className="small text-secondary"><i className="bi bi-shield-check me-1"></i>You can print or record a payment after saving.</div>
                                        <div className="d-flex justify-content-end gap-2">
                                            <button type="button" className="btn btn-light border" onClick={()=>{setShowModal(false);setInvoiceFormError("");}}>Cancel</button>
                                            <button type="submit" className="btn btn-primary px-4" disabled={orderSubmitting}>
                                                {orderSubmitting?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:(editingOrder?"Save invoice changes":"Save invoice")}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <FormConfigurator
                open={formSettingsOpen}
                onClose={()=>setFormSettingsOpen(false)}
                title="Customize Bill Form"
                subtitle="Arrange Order fields, show or hide them, change field type and width, and add automatic formulas."
                fields={orderFormConfig.fields}
                saving={orderFormConfig.saving}
                onSave={orderFormConfig.save}
                onReset={async()=>{const defaults=await orderFormConfig.reset();orderFormConfig.setFields(defaults);setFormSettingsOpen(false);}}
            />
            {ewayCustomizeRequested&&(
                <EWayBillForm
                    customizeOnly
                    onClose={()=>{setEwayCustomizeRequested(false);setSearchParams({}, {replace:true});}}
                />
            )}

            <FormConfigurator
                open={itemSettingsOpen}
                onClose={()=>setItemSettingsOpen(false)}
                title="Customize Bill Information"
                subtitle="Drag and drop item columns, change their width/type, or set formulas for numeric columns."
                fields={orderItemConfig.fields}
                saving={orderItemConfig.saving}
                onSave={orderItemConfig.save}
                onReset={async()=>{const defaults=await orderItemConfig.reset();orderItemConfig.setFields(defaults);setItemSettingsOpen(false);}}
            />

            {showEwayBillModal && (
                <div className="modal fade show d-block" tabIndex="-1">
                    <div className="modal-dialog modal-lg">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">E-Way Bill Details</h5>
                                <button type="button" className="btn-close" onClick={() => setShowEwayBillModal(false)}></button>
                            </div>
                            <div className="modal-body">
                                <EWayBillForm orderId={orderId} profile={profile} />
                                {/* <EWayBillForm orderId={editingOrder} /> */}
                            </div>
                        </div>
                    </div>
                </div>
            )}




            {loading && (
                <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                >
                </span>
            )
            }
            {/* {loading ? 'Downloading...' : 'Download PDF'} */}
            {statusModal && (
                <div className="modal show d-block" tabIndex="-1">
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Status History</h5>
                                <button type="button" className="btn-close" onClick={() => setStatusModal(false)}></button>
                            </div>
                            <div className="modal-body">

                                {/* e way bill generated  */}
                                <h6 className="d-flex">e-way bill Generated : {

                                    editingOrder.ewbDetails && editingOrder.ewbDetails.ewbNo ?

                                        // editingOrder.ewbDetails.ewbNo
                                        <details>
                                            <summary>{editingOrder.ewbDetails.ewbNo || "Not Generated"}</summary>
                                            <p><b>Generated on:</b> {editingOrder.ewbDetails.ewbDate}</p>
                                            <p><b>Valid Till:</b> {editingOrder.ewbDetails.validTill}</p>
                                            <p><b>alert:</b> {editingOrder.ewbDetails.alert}</p>
                                            {/* <button className="btn btn-primary" onClick={() => (window.location.href = `http://localhost:5000/api/ewaybill/pdf/${editingOrder.ewbDetails.ewbNo}`)}>
                                                <i className="bi bi-file-earmark-pdf"></i>
                                            </button> */}

                                            <button className="btn btn-primary" onClick={() => handleDownloadEwayBill(editingOrder.ewbDetails.ewbNo)}>
                                                <i className="bi bi-file-earmark-arrow-down"></i>
                                            </button>
                                        </details>
                                        : "not"}</h6>
                                {/* <a
                                    className="btn btn-success mt-3"
                                    href={`/api/ewaybill/pdf/${response.data.ewayBillNo}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Iscsdc
                                </a> */}





                                {/* <h6>Status History:</h6> */}
                                <ul>
                                    {/* {editingOrder?.statusHistory?.map((entry, index) => (
                    
                    <li key={index}>{entry.status} - {new Date(entry.timestamp).toLocaleString()}</li>
                  ))} */}

                                    {editingOrder?.statusHistory && editingOrder.statusHistory.length > 0 ? (
                                        editingOrder.statusHistory.map((entry, index) => (
                                            <li key={index}>{entry.status} - {new Date(entry.timestamp).toLocaleString()}</li>
                                        ))
                                    ) : (
                                        <li>No status history available</li> // Show message if empty
                                    )}
                                </ul>

                            </div>
                        </div>
                    </div>
                </div>
            )
            }



            {
                showPaymentModal && (
                    <div className="modal fade show d-block" tabIndex="-1">
                        <div className="modal-dialog">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <h5 className="modal-title">Manage Payments — {editingOrder?.companyName || "Customer"}</h5>
                                    <button type="button" className="btn-close" onClick={() => setShowPaymentModal(false)}></button>
                                </div>
                                <div className="modal-body">

                                    <h6>Add Payment :</h6>
                                    <div className="d-flex gap-2 mb-2">

                                        <div className="col-3">
                                            <ArithmeticInput
                                                value={newPayment.amount}
                                                onValueChange={value=>setNewPayment(prev=>({...prev,amount:value}))}
                                                className="form-control"
                                                placeholder="Amount"
                                                min="0.01"
                                                max={Number(editingOrder?.dueAmount || 0)}
                                                step="0.01"
                                                required
                                            />
                                            <div className="small text-muted mt-1">Due: ₹{Number(editingOrder?.dueAmount || 0).toFixed(2)}</div>
                                        </div>
                                        <div className="col-3">
                                            <select className="form-select" value={newPayment.method} onChange={(e) => setNewPayment({ ...newPayment, method: e.target.value })}>
                                                <option>Cash</option>
                                                <option>Bank Transfer</option>
                                                <option>UPI</option>
                                                <option>Cheque</option>
                                            </select>
                                        </div>
                                        <div className="col-5" >
                                            <input type="text" className="form-control" placeholder="Reference (optional)" maxLength="100" value={newPayment.amountReference} onChange={(e) => setNewPayment({ ...newPayment, amountReference: e.target.value })} />
                                            <input type="date" className="form-control mt-2" value={newPayment.paymentDate || ""} onChange={(e) => setNewPayment({ ...newPayment, paymentDate: e.target.value })} />
                                        </div>
                                        {/* // <button className="btn btn-success" onClick={addPayment}>Add Payment</button> */}
                                    </div>
                                    <button className="btn btn-primary" disabled={Number(editingOrder?.dueAmount || 0) <= 0 || !newPayment.amount} onClick={() => addPayment(editingOrder._id)}>Add Payment</button>


                                                                        <DynamicTable
                                        tableKey="orders.payments"
                                        rows={payments}
                                        getRowKey={payment=>payment._id}
                                        columns={[
                                            {key:"paymentDate",label:"Date",render:p=>new Date(p.paymentDate||p.createdAt).toLocaleDateString("en-IN")},
                                            {key:"method",label:"Method"},
                                            {key:"amount",label:"Amount",render:p=>`₹${Number(p.amount||0).toFixed(2)}`},
                                            {key:"amountReference",label:"Reference"},
                                        ]}
                                        actionColumn={{
                                            label:"Actions",
                                            locked:true,
                                            render:p=>(
                                                <div className="d-flex gap-1 justify-content-end">
                                                    <button className="btn btn-warning btn-sm" onClick={()=>setEditPayment(p)} title="Edit"><img src={editSVG} alt="Edit" /></button>
                                                    <button className="btn btn-danger btn-sm" onClick={()=>deletePayment(p._id)} title="Delete"><img src={deleteSVG} alt="Delete" /></button>
                                                    <button className="btn btn-info btn-sm" onClick={()=>printReceipt(p._id)} title="Receipt"><img src={receiptSVG} alt="Receipt" /></button>
                                                </div>
                                            )
                                        }}
                                        footer={({visibleColumns,hasActions})=>{
                                            const total=payments.reduce((sum,p)=>sum+Number(p.amount||0),0).toFixed(2);
                                            return (
                                                <tr>
                                                    {visibleColumns.map((column,index)=>(
                                                        <td key={column.key} className={column.key==="amount"?"fw-bold":index===0?"text-end fw-bold":""}>
                                                            {column.key==="amount" ? "₹"+total : index===0 ? "Total:" : ""}
                                                        </td>
                                                    ))}
                                                    {hasActions&&<td></td>}
                                                </tr>
                                            );
                                        }}
                                    />

                                    {editPayment && (
                                        <div>
                                            <h6>Edit Payment</h6>

                                            <ArithmeticInput
                                                value={editPayment.amount}
                                                onValueChange={value=>setEditPayment(prev=>({...prev,amount:value}))}
                                                className="form-control mb-2"
                                                min="0.01"
                                                step="0.01"
                                                placeholder="Payment amount"
                                            />
                                            <input type="date" className="form-control mb-2" value={editPayment.paymentDate ? new Date(editPayment.paymentDate).toISOString().slice(0, 10) : ""} onChange={(e) => setEditPayment({ ...editPayment, paymentDate: e.target.value })} />
                                            <select className="form-select mb-2" value={editPayment.method} onChange={(e) => setEditPayment({ ...editPayment, method: e.target.value })}>
                                                <option>Cash</option>
                                                <option>Bank Transfer</option>
                                                <option>UPI</option>
                                                <option>Cheque</option>
                                            </select>
                                            {/* <div className="col-5" > */}
                                            <input type="text" className="form-control" placeholder="Reference" value={editPayment.amountReference} onChange={(e) => setEditPayment({ ...editPayment, amountReference: e.target.value })} />
                                            {/* <input type="text" className="form-control" placeholder="Reference" value={newPayment.amountReference} onChange={(e) => setNewPayment({ ...newPayment, amountReference: e.target.value })} /> */}
                                            {/* </div> */}
                                            <button className="btn btn-info" onClick={updatePayment}>Update Payment</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
};


export default Order2
