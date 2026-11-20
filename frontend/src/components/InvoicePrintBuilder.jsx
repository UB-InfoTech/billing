import React,{useEffect,useMemo,useRef,useState} from "react";
import axios from "axios";
import "./InvoicePrintBuilder.css";
import {buildInvoiceSmartLayout,scanImportedInvoiceLayout} from "../utils/invoiceLayoutScanner.js";
import {inferOcrValueBox} from "../utils/invoiceOcrMapping.js";
import {analyzeInvoiceLayout,applySafeInvoiceLayoutFixes} from "../utils/invoiceLayoutQuality.js";
import {estimateInvoiceTextOverflow,getInvoiceMarginWarnings,getInvoicePrintGeometry} from "../utils/invoicePrintFit.js";
import {INVOICE_DESIGN_PRESETS,createInvoiceDesignTemplate,createBlankInvoiceDesignTemplate} from "../utils/invoiceTemplateLibrary.js";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});
const FIELD_GROUPS=[
  {title:"Business details",items:[
    ["company_name","Business name"],["company_address","Business address"],["company_gstin","Business GSTIN"],["company_phone","Business phone"],["company_email","Business email"],["logo","Business logo"]
  ]},
  {title:"Customer details",items:[
    ["customer_name","Customer name"],["customer_address","Customer address"],["customer_phone","Customer phone"],["customer_gstin","Customer GSTIN"],["customer_state","Customer state"]
  ]},
  {title:"Invoice details",items:[
    ["invoice_title","Invoice title"],["invoice_no","Invoice number"],["invoice_date","Invoice date"],["due_date","Due date"],["challan_no","Challan number"],["payment_terms","Payment terms"],["eway_bill","E-Way Bill"]
  ]},
  {title:"Amounts and payment",items:[
    ["subtotal","Subtotal"],["discount","Discount"],["taxable_value","Taxable value"],["cgst","CGST"],["sgst","SGST"],["igst","IGST"],["round_off","Round off"],["grand_total","Invoice total"],["amount_paid","Amount paid"],["balance_due","Balance due"],["amount_words","Amount in words"],["bank_details","Bank details"],["terms","Terms and conditions"],["signature","Authorised signatory"]
  ]}
];
const FIELD_LABELS=Object.fromEntries(FIELD_GROUPS.flatMap(group=>group.items));
const DEFAULT_ITEM_COLUMNS=[
  {key:"sr",label:"#",width:5,order:0,visible:true},
  {key:"description",label:"Description",width:24,order:1,visible:true},
  {key:"designNumber",label:"Design No.",width:12,order:2,visible:true},
  {key:"hsnCode",label:"HSN",width:8,order:3,visible:true},
  {key:"quantity",label:"Qty",width:8,order:4,visible:true},
  {key:"qtyUnit",label:"Unit",width:6,order:5,visible:true},
  {key:"cut",label:"Cut",width:6,order:6,visible:true},
  {key:"MTR",label:"MTR",width:7,order:7,visible:true},
  {key:"shortPcs",label:"Short Pcs",width:8,order:8,visible:true},
  {key:"unitPrice",label:"Rate",width:9,order:9,visible:true},
  {key:"amount",label:"Amount",width:10,order:10,visible:true},
  {key:"discount",label:"Disc. %",width:7,order:11,visible:true},
  {key:"taxable",label:"Taxable",width:12,order:12,visible:true}
];
const ITEM_TABLE_COLUMN_OPTIONS=DEFAULT_ITEM_COLUMNS.map(({key,label})=>({key,label}));
const SAMPLE_VALUES={
  company_name:"Your Business Name",company_address:"Business address · City · PIN",company_gstin:"GSTIN: 24ABCDE1234F1Z5",company_phone:"+91 98765 43210",company_email:"hello@yourbusiness.com",
  customer_name:"Customer / Company name",customer_address:"Customer billing address",customer_phone:"+91 98765 43210",customer_gstin:"Customer GSTIN",customer_state:"Gujarat",
  invoice_title:"TAX INVOICE",invoice_no:"INV-00001",invoice_date:"18 Nov 2026",due_date:"25 Nov 2026",challan_no:"CH-001",payment_terms:"Net 7 days",eway_bill:"E-Way Bill number",
  subtotal:"₹ 10,000.00",discount:"− ₹ 500.00",taxable_value:"₹ 9,500.00",cgst:"₹ 855.00",sgst:"₹ 855.00",igst:"₹ 0.00",round_off:"₹ 0.00",grand_total:"₹ 11,210.00",amount_paid:"₹ 5,000.00",balance_due:"₹ 6,210.00",amount_words:"Eleven thousand two hundred ten only",bank_details:"Bank name · Account number · IFSC",terms:"Goods once sold will not be taken back.",signature:"For Your Business · Authorised Signatory"
};
const makeBlock=(id,type,fieldKey,label,x,y,w,h,extra={})=>({id,type,fieldKey:fieldKey||"",label:label||"",text:"",x,y,w,h,fontSize:10,bold:false,align:"left",color:"#172335",backgroundColor:"transparent",borderColor:"#d8e0e9",borderWidth:0,borderRadius:0,padding:1,fontFamily:"Arial",italic:false,opacity:1,visible:true,showLabel:true,...extra});
const makeTemplate=(id,name,key)=>({...createInvoiceDesignTemplate(id,key),name:name||createInvoiceDesignTemplate(id,key).name});
const makeInitialDesign=()=>({enabled:false,activeTemplateId:"clean-default",templates:[makeTemplate("clean-default","Clean","clean")]});
const createId=prefix=>prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||min));
const snapAxis=(origin,size,lines)=>{
  let bestPosition=origin;
  let bestGuide=null;
  let bestDistance=1.25;
  [0,size/2,size].forEach(offset=>{
    lines.forEach(line=>{
      const candidate=line-offset;
      if(candidate<0||candidate>100-size)return;
      const distance=Math.abs(candidate-origin);
      if(distance<=bestDistance){
        bestDistance=distance;
        bestPosition=candidate;
        bestGuide=line;
      }
    });
  });
  return {position:bestPosition,guide:bestGuide};
};
const getSnappedPosition=(block,x,y,blocks)=>{
  const vertical=[5,50,95];
  const horizontal=[5,50,95];
  (blocks||[]).filter(item=>item.id!==block.id&&item.visible!==false).forEach(item=>{
    vertical.push(item.x,item.x+item.w/2,item.x+item.w);
    horizontal.push(item.y,item.y+item.h/2,item.y+item.h);
  });
  const snappedX=snapAxis(x,block.w,vertical);
  const snappedY=snapAxis(y,block.h,horizontal);
  return {
    x:snappedX.position,
    y:snappedY.position,
    guides:{
      vertical:snappedX.guide===null?[]:[snappedX.guide],
      horizontal:snappedY.guide===null?[]:[snappedY.guide]
    }
  };
};

export default function InvoicePrintBuilder({design,onChange,onSave,onClose,saving=false}){
  const [localDesign,setLocalDesign]=useState(()=>design&&Array.isArray(design.templates)&&design.templates.length?design:makeInitialDesign());
  const [selectedBlockId,setSelectedBlockId]=useState("business-name");
  const [dragging,setDragging]=useState(null);
  const [history,setHistory]=useState({past:[],future:[]});
  const [alignmentGuides,setAlignmentGuides]=useState({vertical:[],horizontal:[]});
  const [showGrid,setShowGrid]=useState(false);
  const [snapToGrid,setSnapToGrid]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [placementField,setPlacementField]=useState("company_name");
  const [placingField,setPlacingField]=useState(false);
  const [layoutScan,setLayoutScan]=useState(null);
  const [layoutScanLoading,setLayoutScanLoading]=useState(false);
  const [layoutScanError,setLayoutScanError]=useState("");
  const [importedFile,setImportedFile]=useState(null);
  const [ocrScan,setOcrScan]=useState(null);
  const [ocrLoading,setOcrLoading]=useState(false);
  const [ocrProgress,setOcrProgress]=useState({stage:"",progress:0});
  const [ocrError,setOcrError]=useState("");
  const [ocrView,setOcrView]=useState("suggested");
  const [highlightedOcrLineId,setHighlightedOcrLineId]=useState("");
  const [fieldSearch,setFieldSearch]=useState("");
  const [showTemplateLibrary,setShowTemplateLibrary]=useState(false);
  const [confirmDeleteTemplate,setConfirmDeleteTemplate]=useState(false);
  const [htmlImporting,setHtmlImporting]=useState(false);
  const [previewRecords,setPreviewRecords]=useState([]);
  const [previewRecordId,setPreviewRecordId]=useState("");
  const [previewInvoice,setPreviewInvoice]=useState(null);
  const [previewLoading,setPreviewLoading]=useState(false);
  const [previewError,setPreviewError]=useState("");
  const [printPreviewOpen,setPrintPreviewOpen]=useState(false);
  const [printPreviewHtml,setPrintPreviewHtml]=useState("");
  const [printPreviewLoading,setPrintPreviewLoading]=useState(false);
  const [printPreviewError,setPrintPreviewError]=useState("");
  const canvasRef=useRef(null);
  const printPreviewFrameRef=useRef(null);
  const printCheckRef=useRef(null);
  const importRef=useRef(null);
  const htmlImportRef=useRef(null);
  const elementImageRef=useRef(null);
  const currentDesignRef=useRef(localDesign);
  const historyRef=useRef(history);
  const draggingRef=useRef(null);
  const previewRequestRef=useRef(0);
  const starterTemplateSnapshotRef=useRef(null);

  useEffect(()=>{
    let active=true;
    const loadLatestPreview=async()=>{
      setPreviewLoading(true);
      setPreviewError("");
      try{
        const listResponse=await axios.get(API+"/api/invoice-config/preview-records",auth());
        const records=Array.isArray(listResponse.data?.records)?listResponse.data.records:[];
        if(!active)return;
        setPreviewRecords(records);
        if(!records.length){
          setPreviewRecordId("");
          setPreviewInvoice(null);
          return;
        }
        setPreviewRecordId(records[0].id);
        const requestId=++previewRequestRef.current;
        const detailResponse=await axios.get(API+"/api/invoice-config/preview/"+encodeURIComponent(records[0].id),auth());
        if(active&&requestId===previewRequestRef.current){
          setPreviewInvoice(detailResponse.data?.preview||null);
        }
      }catch(previewLoadError){
        if(active)setPreviewError(previewLoadError.response?.data?.message||"Saved invoice data could not be loaded. Sample data is available.");
      }finally{
        if(active)setPreviewLoading(false);
      }
    };
    loadLatestPreview();
    return ()=>{
      active=false;
      previewRequestRef.current+=1;
    };
  },[]);

  const handlePreviewRecordChange=async event=>{
    const id=event.target.value;
    setPreviewRecordId(id);
    setPrintPreviewHtml("");
    setPrintPreviewOpen(false);
    setPreviewError("");
    const requestId=++previewRequestRef.current;
    if(!id){
      setPreviewInvoice(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    try{
      const response=await axios.get(API+"/api/invoice-config/preview/"+encodeURIComponent(id),auth());
      if(requestId===previewRequestRef.current)setPreviewInvoice(response.data?.preview||null);
    }catch(previewLoadError){
      if(requestId===previewRequestRef.current){
        setPreviewInvoice(null);
        setPreviewError(previewLoadError.response?.data?.message||"This invoice preview could not be loaded.");
      }
    }finally{
      if(requestId===previewRequestRef.current)setPreviewLoading(false);
    }
  };

  const openActualPrintPreview=async()=>{
    if(!previewRecordId){
      setPrintPreviewError("Choose a saved invoice before opening the print preview.");
      return;
    }
    setPrintPreviewLoading(true);
    setPrintPreviewError("");
    try{
      const response=await axios.post(
        API+"/api/order/"+encodeURIComponent(previewRecordId)+"/invoice-preview",
        {design:{...localDesign,enabled:true}},
        {...auth(),responseType:"text"}
      );
      const html=typeof response.data==="string"?response.data:"";
      const normalizedHtmlStart=html.trimStart().toLowerCase();
      if(!normalizedHtmlStart.startsWith("<!doctype html")&&!normalizedHtmlStart.startsWith("<html")){
        throw new Error("The invoice renderer did not return a printable preview.");
      }
      setPrintPreviewHtml(html);
      setPrintPreviewOpen(true);
    }catch(previewRenderError){
      const responseMessage=previewRenderError.response?.data;
      setPrintPreviewError(
        (typeof responseMessage==="string"&&responseMessage)
        ||responseMessage?.message
        ||previewRenderError.message
        ||"Unable to open the actual invoice preview."
      );
    }finally{
      setPrintPreviewLoading(false);
    }
  };

  const printActualInvoice=()=>{
    const frameWindow=printPreviewFrameRef.current?.contentWindow;
    if(!frameWindow)return;
    frameWindow.focus();
    frameWindow.print();
  };

  useEffect(()=>{
    if(design&&Array.isArray(design.templates)&&design.templates.length&&design!==currentDesignRef.current){
      currentDesignRef.current=design;
      setLocalDesign(design);
      historyRef.current={past:[],future:[]};
      setHistory(historyRef.current);
    }
  },[design]);

  const activeTemplate=useMemo(
    ()=>localDesign.templates.find(template=>template.id===localDesign.activeTemplateId)||localDesign.templates[0]||makeTemplate("clean-default","Clean","clean"),
    [localDesign]
  );
  if(!starterTemplateSnapshotRef.current){
    starterTemplateSnapshotRef.current={id:activeTemplate.id,blocks:JSON.stringify(activeTemplate.blocks)};
  }
  const selectedBlock=activeTemplate.blocks.find(block=>block.id===selectedBlockId)||null;
  const visibleOcrLines=useMemo(()=>{
    if(!ocrScan)return [];
    const source=ocrView==="suggested"?ocrScan.lines.filter(line=>line.selectedField):ocrScan.lines;
    return source.slice(0,30);
  },[ocrScan,ocrView]);
  const suggestedOcrCount=ocrScan?.lines.filter(line=>line.selectedField).length||0;
  const filteredFieldGroups=useMemo(()=>{
    const query=fieldSearch.trim().toLowerCase();
    return FIELD_GROUPS.map(group=>({...group,items:group.items.filter(([key,label])=>!query||label.toLowerCase().includes(query)||key.replace(/_/g," ").includes(query))})).filter(group=>group.items.length);
  },[fieldSearch]);
  const highlightedOcrLine=ocrScan?.lines.find(line=>line.id===highlightedOcrLineId)||null;
  const referenceReady=Boolean(activeTemplate.background?.url);
  const designChosen=referenceReady||activeTemplate.templateKey!=="blank";
  const liveFieldCount=activeTemplate.blocks.filter(block=>block.visible!==false&&["field","items_table","totals","logo"].includes(block.type)).length;
  const previewFields=previewInvoice?.fields||SAMPLE_VALUES;
  const previewColumns=previewInvoice?.itemColumns?.length?previewInvoice.itemColumns:DEFAULT_ITEM_COLUMNS;
  const printMargins=activeTemplate.printMargins||{top:0,right:0,bottom:0,left:0};
  const printGeometry=getInvoicePrintGeometry(activeTemplate.pageSize,activeTemplate.orientation,printMargins);
  const pageContentInset={top:(printGeometry.margins.top/printGeometry.heightMm*100)+"%",right:(printGeometry.margins.right/printGeometry.widthMm*100)+"%",bottom:(printGeometry.margins.bottom/printGeometry.heightMm*100)+"%",left:(printGeometry.margins.left/printGeometry.widthMm*100)+"%"};
  const designWarnings=useMemo(()=>[
    ...analyzeInvoiceLayout(activeTemplate.blocks,previewColumns),
    ...estimateInvoiceTextOverflow(activeTemplate.blocks,previewFields,{pageSize:activeTemplate.pageSize,orientation:activeTemplate.orientation,printMargins}),
    ...getInvoiceMarginWarnings(activeTemplate.pageSize,activeTemplate.orientation,printMargins)
  ],[activeTemplate.blocks,activeTemplate.pageSize,activeTemplate.orientation,previewColumns,previewFields,printMargins]);
  const applyDesign=next=>{
    currentDesignRef.current=next;
    setLocalDesign(next);
    setPrintPreviewHtml("");
    setPrintPreviewOpen(false);
    onChange?.(next);
  };
  const pushHistory=snapshot=>{
    const current=historyRef.current;
    const next={past:[...current.past.slice(-49),snapshot],future:[]};
    historyRef.current=next;
    setHistory(next);
  };
  const updateDesign=(next,options={})=>{
    if(options.recordHistory!==false&&currentDesignRef.current!==next)pushHistory(currentDesignRef.current);
    applyDesign(next);
  };
  const undo=()=>{
    const current=historyRef.current;
    if(!current.past.length)return;
    const previous=current.past[current.past.length-1];
    const next={past:current.past.slice(0,-1),future:[currentDesignRef.current,...current.future].slice(0,50)};
    historyRef.current=next;
    setHistory(next);
    applyDesign(previous);
  };
  const redo=()=>{
    const current=historyRef.current;
    if(!current.future.length)return;
    const nextDesign=current.future[0];
    const next={past:[...current.past,currentDesignRef.current].slice(-50),future:current.future.slice(1)};
    historyRef.current=next;
    setHistory(next);
    applyDesign(nextDesign);
  };
  useEffect(()=>{
    const handleShortcut=event=>{
      if(!event.target?.closest?.(".invoice-builder-overlay"))return;
      if(event.target.closest("input,textarea,select,[contenteditable=true]"))return;
      const key=String(event.key||"").toLowerCase();
      if(event.ctrlKey||event.metaKey){
        if(key==="z"){
          event.preventDefault();
          if(event.shiftKey)redo();
          else undo();
        }else if(key==="y"){
          event.preventDefault();
          redo();
        }
        return;
      }
      if(!selectedBlockId||!["arrowleft","arrowright","arrowup","arrowdown"].includes(key))return;
      const block=activeTemplate.blocks.find(item=>item.id===selectedBlockId);
      if(!block)return;
      event.preventDefault();
      const step=snapToGrid?2:(event.shiftKey?1:0.25);
      const patch={};
      if(key==="arrowleft")patch.x=clamp(block.x-step,0,100-block.w);
      if(key==="arrowright")patch.x=clamp(block.x+step,0,100-block.w);
      if(key==="arrowup")patch.y=clamp(block.y-step,0,100-block.h);
      if(key==="arrowdown")patch.y=clamp(block.y+step,0,100-block.h);
      updateBlock(block.id,patch);
    };
    window.addEventListener("keydown",handleShortcut);
    return ()=>window.removeEventListener("keydown",handleShortcut);
  },[history,selectedBlockId,activeTemplate,snapToGrid]);
  const updateActive=(patch,options={})=>{
    updateDesign({...localDesign,templates:localDesign.templates.map(template=>template.id===activeTemplate.id?{...template,...patch}:template)},options);
  };
  const updateBlock=(blockId,patch,options={})=>{
    updateActive({blocks:activeTemplate.blocks.map(block=>block.id===blockId?{...block,...patch}:block)},options);
  };
  const addBlock=(type,fieldKey,position,dimensions={},extra={})=>{
    if(activeTemplate.blocks.length>=80){setError("This design can contain up to 80 elements. Remove an unused item before adding another.");return;}
    const label=type==="field"?(FIELD_LABELS[fieldKey]||"Invoice field"):type==="items_table"?"Invoice items":type==="totals"?"Invoice totals":type==="text"?"Text":type==="divider"?"Divider":type==="shape"?"Accent shape":type==="image"?"Image":"Business logo";
    const id=createId("block");
    const width=dimensions.w??(type==="items_table"?55:type==="totals"?28:type==="logo"?15:30);
    const height=dimensions.h??(type==="items_table"?18:type==="totals"?16:type==="logo"?12:5);
    const x=clamp(position?.x??34,0,100-width);
    const y=clamp(position?.y??40,0,100-height);
    const newBlock=makeBlock(id,type,fieldKey,label,x,y,width,height,{showLabel:type==="field"?!activeTemplate.background?.url:false,...extra});
    if(type==="text")newBlock.text="Your text";
    if(type==="items_table")newBlock.fontSize=8;
    updateActive({blocks:type==="shape"?[newBlock,...activeTemplate.blocks]:[...activeTemplate.blocks,newBlock]});
    setSelectedBlockId(id);
  };
  const findOpenPalettePosition=(width,height)=>{
    const occupied=activeTemplate.blocks.filter(block=>block.visible!==false);
    const candidates=[];
    const rowGap=Math.max(7,height+2);
    const columnGap=Math.max(8,width+3);
    for(let y=6;y<=94-height;y+=rowGap){
      for(let x=6;x<=94-width;x+=columnGap){
        let overlap=0;
        occupied.forEach(block=>{
          const intersectionWidth=Math.max(0,Math.min(x+width,block.x+block.w)-Math.max(x,block.x));
          const intersectionHeight=Math.max(0,Math.min(y+height,block.y+block.h)-Math.max(y,block.y));
          overlap+=intersectionWidth*intersectionHeight;
        });
        candidates.push({x,y,score:overlap*100+Math.abs(x-35)+Math.abs(y-38)*0.45});
      }
    }
    candidates.sort((a,b)=>a.score-b.score);
    return candidates[0]?{x:candidates[0].x,y:candidates[0].y}:{x:6,y:6};
  };

  const addPaletteField=(fieldKey)=>{
    const type=fieldKey==="items"?"items_table":fieldKey==="totals"?"totals":fieldKey==="logo"?"logo":"field";
    const dimensions=type==="items_table"?{w:88,h:22}:type==="totals"?{w:32,h:15}:type==="logo"?{w:15,h:12}:{w:30,h:5};
    addBlock(type,fieldKey,findOpenPalettePosition(dimensions.w,dimensions.h),dimensions);
  };

  const applySmartLayout=()=>{
    if(!layoutScan)return;
    const plan=buildInvoiceSmartLayout(layoutScan);
    const blocks=activeTemplate.blocks.map(block=>({...block}));
    let tableBlockId="";
    plan.blocks.forEach(suggestion=>{
      const existingIndex=blocks.findIndex(block=>
        suggestion.type==="items_table"
          ?block.type==="items_table"
          :suggestion.type==="totals"
            ?block.type==="totals"
            :suggestion.type==="logo"
              ?block.type==="logo"
              :block.type==="field"&&block.fieldKey===suggestion.fieldKey
      );
      const patch={
        x:suggestion.x,y:suggestion.y,w:suggestion.w,h:suggestion.h,
        visible:true,
        ...(suggestion.type==="field"?{showLabel:false}:{}),
        ...(suggestion.fontSize?{fontSize:suggestion.fontSize}:{}),
        ...(suggestion.bold!==undefined?{bold:suggestion.bold}:{}),
        ...(suggestion.align?{align:suggestion.align}:{})
      };
      if(existingIndex>=0){
        blocks[existingIndex]={...blocks[existingIndex],visible:true,...(suggestion.type==="field"?{showLabel:false}:{})};
        if(suggestion.type==="items_table")tableBlockId=blocks[existingIndex].id;
      }else{
        const id=createId("auto");
        const created=makeBlock(id,suggestion.type,suggestion.fieldKey,suggestion.label,
          suggestion.x,suggestion.y,suggestion.w,suggestion.h,patch);
        blocks.push(created);
        if(suggestion.type==="items_table")tableBlockId=id;
      }
    });
    updateActive({blocks});
    if(tableBlockId)setSelectedBlockId(tableBlockId);
    setMessage(plan.tableDetected
      ?"Suggested fields were added around the detected table. Any fields you had already positioned were kept in place."
      :"A standard starting layout was added because no clear table grid was found. Existing field positions were kept; please check the table area.");
  };

  const placeFieldOnCanvas=event=>{
    if(!placingField||!placementField||!canvasRef.current)return;
    const rect=canvasRef.current.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const clickX=clamp((event.clientX-rect.left)/rect.width*100,0,100);
    const clickY=clamp((event.clientY-rect.top)/rect.height*100,0,100);
    const type=placementField==="items"?"items_table":placementField==="totals"?"totals":placementField==="logo"?"logo":"field";
    const dimensions=type==="items_table"?{w:88,h:22}
      :type==="totals"?{w:32,h:17}
      :type==="logo"?{w:15,h:12}
      :placementField==="terms"||placementField==="bank_details"?{w:44,h:10}
      :placementField==="amount_words"?{w:58,h:7}
      :placementField==="company_name"?{w:52,h:7}
      :{w:38,h:5};
    const x=clamp(clickX-dimensions.w/2,0,100-dimensions.w);
    const y=clamp(clickY-dimensions.h/2,0,100-dimensions.h);
    const existing=type==="field"
      ?activeTemplate.blocks.find(block=>block.type==="field"&&block.fieldKey===placementField)
      :activeTemplate.blocks.find(block=>block.type===type);
    if(existing){
      updateBlock(existing.id,{x,y,...dimensions,visible:true,...(type==="field"&&activeTemplate.background?.url?{showLabel:false}:{})});
      setSelectedBlockId(existing.id);
    }else addBlock(type,placementField,{x,y},dimensions);
    setPlacingField(false);
    setMessage((FIELD_LABELS[placementField]||"Invoice element")+" positioned. You can drag or resize it on the page.");
  };
  const chooseTemplate=key=>{
    if(localDesign.templates.length>=12){setError("You can keep up to 12 invoice designs. Delete an unused design before adding another.");return;}
    const template=createInvoiceDesignTemplate(createId("design"),key);
    updateDesign({...localDesign,activeTemplateId:template.id,templates:[...localDesign.templates,template]});
    setSelectedBlockId(template.blocks[0]?.id||"");setShowTemplateLibrary(false);setConfirmDeleteTemplate(false);
    setMessage(template.name+" added. You can now edit every element and position it on the page.");
  };
  const createBlankDesign=()=>{
    if(localDesign.templates.length>=12){setError("You can keep up to 12 invoice designs. Delete an unused design first.");return;}
    const template=createBlankInvoiceDesignTemplate(createId("blank"),"My blank invoice");
    updateDesign({...localDesign,activeTemplateId:template.id,templates:[...localDesign.templates,template]});
    setSelectedBlockId("");setShowTemplateLibrary(false);setConfirmDeleteTemplate(false);
    setMessage("Blank design created. Add fields, text, images, dividers and accent shapes from the left panel.");
  };
  const deleteActiveTemplate=()=>{
    if(!confirmDeleteTemplate){setConfirmDeleteTemplate(true);return;}
    if(localDesign.templates.length===1){
      const blank=createBlankInvoiceDesignTemplate(createId("blank"),"My blank invoice");
      updateDesign({...localDesign,enabled:false,activeTemplateId:blank.id,templates:[blank]});
      setSelectedBlockId("");setConfirmDeleteTemplate(false);
      setMessage("The design was deleted. A blank design is ready to customize.");return;
    }
    const remaining=localDesign.templates.filter(template=>template.id!==activeTemplate.id);
    const next=remaining[0];
    updateDesign({...localDesign,activeTemplateId:next.id,templates:remaining});
    setSelectedBlockId(next.blocks[0]?.id||"");setConfirmDeleteTemplate(false);
    setMessage(activeTemplate.name+" deleted. Your other designs are unchanged.");
  };
  const duplicateSelectedBlock=()=>{
    if(!selectedBlock)return;
    if(activeTemplate.blocks.length>=80){setError("This design can contain up to 80 elements.");return;}
    const copy={...selectedBlock,id:createId("element"),x:clamp(selectedBlock.x+2,0,100-selectedBlock.w),y:clamp(selectedBlock.y+2,0,100-selectedBlock.h),label:(selectedBlock.label||"Element")+" copy"};
    updateActive({blocks:[...activeTemplate.blocks,copy]});setSelectedBlockId(copy.id);
  };
  const moveSelectedLayer=direction=>{
    if(!selectedBlock)return;
    const blocks=activeTemplate.blocks.slice();
    const index=blocks.findIndex(block=>block.id===selectedBlock.id);
    const target=index+direction;
    if(index<0||target<0||target>=blocks.length)return;
    [blocks[index],blocks[target]]=[blocks[target],blocks[index]];
    updateActive({blocks});
  };
  const duplicateTemplate=()=>{
    if(localDesign.templates.length>=12){setError("You can save up to 12 invoice designs.");return;}
    const copy={...activeTemplate,id:createId("copy"),name:activeTemplate.name+" copy",blocks:activeTemplate.blocks.map(block=>({...block,id:createId("block")})),background:{...activeTemplate.background}};
    updateDesign({...localDesign,activeTemplateId:copy.id,templates:[...localDesign.templates,copy]});
    setSelectedBlockId(copy.blocks[0]?.id||"");
    setMessage("Design duplicated. Your original design is unchanged.");
  };
  const renameTemplate=value=>updateActive({name:value.slice(0,60)});
  const removeBlock=()=>{
    if(!selectedBlock)return;
    updateActive({blocks:activeTemplate.blocks.filter(block=>block.id!==selectedBlock.id)});
    setSelectedBlockId("");
  };
  const handleHtmlUpload=async file=>{
    if(!file)return;
    setError("");setMessage("");
    if(localDesign.templates.length>=12){setError("You can keep up to 12 invoice designs. Delete an unused design first.");if(htmlImportRef.current)htmlImportRef.current.value="";return;}
    setHtmlImporting(true);
    try{
      const {convertInvoiceHtml}=await import("../utils/invoiceHtmlImporter.js");
      const imported=await convertInvoiceHtml(file);
      const template=createBlankInvoiceDesignTemplate(createId("html"),imported.name);
      template.templateKey="html-import";template.pageSize=imported.pageSize||"A4";template.blocks=imported.blocks;
      updateDesign({...localDesign,activeTemplateId:template.id,templates:[...localDesign.templates,template]});
      setSelectedBlockId(template.blocks[0]?.id||"");setShowTemplateLibrary(false);
      const summary=imported.matchedFieldCount+" live fields, "+imported.staticTextCount+" text elements"+(imported.imageCount?", "+imported.imageCount+" embedded images":"");
      setMessage("HTML design converted into editable elements: "+summary+"."+(imported.warning?" "+imported.warning:""));
    }catch(importError){setError(importError.message||"This HTML design could not be converted. Try PDF or image import instead.");}
    finally{setHtmlImporting(false);if(htmlImportRef.current)htmlImportRef.current.value="";}
  };

  const handleElementImageUpload=file=>{
    if(!file)return;
    const allowed=["image/png","image/jpeg","image/webp","image/gif"];
    if(!allowed.includes(String(file.type||"").toLowerCase())){setError("Choose a PNG, JPG, WebP or GIF image.");return;}
    if(Number(file.size)>180*1024){setError("Images added as editable elements must be 180 KB or smaller. For larger artwork, import it as a PDF or image reference.");return;}
    const reader=new FileReader();
    reader.onload=()=>{
      const imageUrl=String(reader.result||"");
      if(!imageUrl.startsWith("data:image/")){setError("This image could not be read.");return;}
      addBlock("image","",findOpenPalettePosition(20,14),{w:20,h:14},{imageUrl,label:file.name||"Image",padding:0});
    };
    reader.onerror=()=>setError("This image could not be read.");
    reader.readAsDataURL(file);
    if(elementImageRef.current)elementImageRef.current.value="";
  };

  const handleUpload=async file=>{
    if(!file)return;
    const fileName=String(file.name||"").toLowerCase();
    const fileType=String(file.type||"").toLowerCase();
    const supportedExtension=[".pdf",".jpg",".jpeg",".png",".webp"].some(extension=>fileName.endsWith(extension));
    const acceptedType=fileType==="application/pdf"||["image/jpeg","image/png","image/webp"].includes(fileType)||supportedExtension;
    if(!acceptedType){setError("Choose a PDF, JPG, PNG or WebP invoice design.");if(importRef.current)importRef.current.value="";return;}
    if(Number(file.size)>12*1024*1024){setError("This file is larger than 12 MB. Please choose a smaller invoice design.");if(importRef.current)importRef.current.value="";return;}
    setError("");
    setMessage("");
    setLayoutScan(null);
    setLayoutScanError("");
    setLayoutScanLoading(false);
    setImportedFile(null);
    setOcrScan(null);
    setOcrError("");
    setOcrProgress({stage:"",progress:0});
    setUploading(true);
    try{
      const data=new FormData();
      data.append("background",file);
      const response=await axios.post(API+"/api/invoice-config/background",data,auth());
      const background=response.data||{};
      setImportedFile(file);
      setOcrView("suggested");
      setHighlightedOcrLineId("");
      const isUntouchedStarter=!activeTemplate.background?.url
        &&activeTemplate.id===starterTemplateSnapshotRef.current?.id
        &&JSON.stringify(activeTemplate.blocks)===starterTemplateSnapshotRef.current?.blocks;
      const importedBlocks=isUntouchedStarter?[]:activeTemplate.blocks.map(block=>
        block.type==="field"?{...block,showLabel:false}:block
      );
      updateActive({
        templateKey:"imported",
        ...(isUntouchedStarter?{name:file.name.replace(/\.[^.]+$/,"").slice(0,60)||"Imported invoice"}:{}),
        blocks:importedBlocks,
        background:{url:background.url||"",type:background.type||"image",locked:true,visible:true}
      });
      setMessage(isUntouchedStarter
        ?"Your design is imported safely. The page is ready for editable fields; the original stays locked."
        :"Your new reference is imported. Existing fields were kept in place and their extra labels hidden; review their positions.");
      setLayoutScanLoading(true);
      try{
        const scan=await scanImportedInvoiceLayout(file);
        setLayoutScan(scan);
        setMessage(scan.table
          ?"Scan complete. A likely invoice item-table area was found. Apply the suggested layout and review the editable fields."
          :"Scan complete. No clear item-table grid was found, so the assistant will use a standard layout as a starting point.");
      }catch(scanError){
        setLayoutScanError(scanError.message||"This file could not be scanned automatically. Guided field placement is still available.");
      }finally{
        setLayoutScanLoading(false);
      }
    }catch(uploadError){
      setError(uploadError.response?.data?.message||"Unable to import this design. Use a PDF, JPG, PNG or WebP file up to 12 MB.");
    }finally{
      setUploading(false);
      if(importRef.current)importRef.current.value="";
    }
  };
  const runOcrScan=async()=>{
    if(!importedFile){
      setOcrError("Re-import this PDF or image to run text recognition on it.");
      return;
    }
    setOcrLoading(true);
    setOcrError("");
    setOcrScan(null);
    setOcrProgress({stage:"Preparing first page",progress:0});
    try{
      const {scanImportedInvoiceText}=await import("../utils/invoiceOcrScanner.js");
      const result=await scanImportedInvoiceText(importedFile,setOcrProgress);
      setOcrScan({...result,lines:result.lines.map(line=>({...line,selectedField:line.fieldKey||""}))});
      setOcrView("suggested");
      setHighlightedOcrLineId("");
      setMessage(result.lines.length
        ?"Text recognition complete. Use Place at detected area where a value position was found, or choose manual placement to click the page."
        :"No readable text was found on the first page. You can still use smart layout scanning and guided placement.");
    }catch(ocrScanError){
      setOcrError(ocrScanError.message||"Text recognition could not read this file. Guided field placement is still available.");
    }finally{
      setOcrLoading(false);
    }
  };

  const updateOcrMapping=(lineId,fieldKey)=>{
    setOcrScan(previous=>previous?{
      ...previous,
      lines:previous.lines.map(line=>line.id===lineId
        ?{...line,selectedField:fieldKey,valueBox:inferOcrValueBox({...line,selectedField:fieldKey},previous.lines)}
        :line)
    }:previous);
  };

  const placeOcrMapping=line=>{
    const fieldKey=line.selectedField||line.fieldKey;
    if(!fieldKey){
      setOcrError("Choose what this detected text represents before placing a field.");
      return;
    }
    const label=FIELD_LABELS[fieldKey]||"invoice field";
    setPlacementField(fieldKey);
    setHighlightedOcrLineId(line.id);
    setPlacingField(true);
    setMessage("Click the value position for "+label+". The highlighted area shows what OCR matched.");
  };

  const placeOcrMappingAtDetectedArea=line=>{
    const fieldKey=line.selectedField||line.fieldKey;
    const box=line.valueBox;
    if(!fieldKey||!box){
      setOcrError("A clear printed value area was not found. Use manual placement for this line.");
      return;
    }
    const width=clamp(box.w,3,48);
    const height=clamp(box.h,2,10);
    const position={
      x:clamp(box.x,0,100-width),
      y:clamp(box.y,0,100-height)
    };
    const existing=activeTemplate.blocks.find(block=>block.type==="field"&&block.fieldKey===fieldKey);
    if(existing){
      updateBlock(existing.id,{...position,w:width,h:height,visible:true,showLabel:false});
      setSelectedBlockId(existing.id);
    }else{
      addBlock("field",fieldKey,position,{w:width,h:height});
    }
    setPlacementField(fieldKey);
    setPlacingField(false);
    setHighlightedOcrLineId(line.id);
    setOcrError("");
    const placementDescription=box.kind==="estimated"?"in the suggested space":"over the detected value";
    setMessage((FIELD_LABELS[fieldKey]||"Invoice field")+" placed "+placementDescription+". Check the preview and adjust its size or position if needed.");
  };

  const startBlockDrag=(event,block)=>{
    if(event.target.closest("[data-resize-handle]"))return;
    const nestedButton=event.target.closest("button");
    if(nestedButton&&nestedButton!==event.currentTarget)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelectedBlockId(block.id);
    const next={id:block.id,mode:"move",startX:event.clientX,startY:event.clientY,x:block.x,y:block.y,w:block.w,h:block.h,initialDesign:currentDesignRef.current,didMove:false};
    draggingRef.current=next;
    setDragging(next);
  };
  const startBlockResize=(event,block)=>{
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const next={id:block.id,mode:"resize",startX:event.clientX,startY:event.clientY,x:block.x,y:block.y,w:block.w,h:block.h,initialDesign:currentDesignRef.current,didMove:false};
    draggingRef.current=next;
    setSelectedBlockId(block.id);
    setDragging(next);
    setAlignmentGuides({vertical:[],horizontal:[]});
  };
  const finishBlockDrag=()=>{
    draggingRef.current=null;
    setDragging(null);
    setAlignmentGuides({vertical:[],horizontal:[]});
  };
  const moveBlock=event=>{
    const current=draggingRef.current;
    if(!current||!canvasRef.current)return;
    const rect=canvasRef.current.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const dx=(event.clientX-current.startX)/rect.width*100;
    const dy=(event.clientY-current.startY)/rect.height*100;
    let patch;
    if(current.mode==="resize"){
      patch={
        w:clamp(current.w+dx,3,100-current.x),
        h:clamp(current.h+dy,2,100-current.y)
      };
      setAlignmentGuides({vertical:[],horizontal:[]});
    }else{
      const block=activeTemplate.blocks.find(item=>item.id===current.id);
      if(!block)return;
      const proposedX=clamp(current.x+dx,0,100-current.w);
      const proposedY=clamp(current.y+dy,0,100-current.h);
      const snapped=snapToGrid
        ?{x:Math.round(proposedX/2)*2,y:Math.round(proposedY/2)*2,guides:{vertical:[],horizontal:[]}}
        :getSnappedPosition(block,proposedX,proposedY,activeTemplate.blocks);
      patch={x:clamp(snapped.x,0,100-current.w),y:clamp(snapped.y,0,100-current.h)};
      setAlignmentGuides(snapped.guides);
    }
    const liveBlock=activeTemplate.blocks.find(item=>item.id===current.id);
    if(!liveBlock)return;
    const changed=Object.entries(patch).some(([key,value])=>Math.abs(Number(liveBlock[key])-value)>0.01);
    if(!changed)return;
    if(!current.didMove){
      pushHistory(current.initialDesign);
      const next={...current,didMove:true};
      draggingRef.current=next;
      setDragging(next);
    }
    updateBlock(current.id,patch,{recordHistory:false});
  };
  const handlePaletteDrop=event=>{
    event.preventDefault();
    const fieldKey=event.dataTransfer.getData("application/x-invoice-field");
    if(!fieldKey)return;
    const rect=canvasRef.current?.getBoundingClientRect();
    if(!rect)return;
    const x=clamp((event.clientX-rect.left)/rect.width*100,0,90);
    const y=clamp((event.clientY-rect.top)/rect.height*100,0,94);
    if(fieldKey==="items")addBlock("items_table","items",{x,y});
    else if(fieldKey==="totals")addBlock("totals","totals",{x,y});
    else if(fieldKey==="logo")addBlock("logo","logo",{x,y});
    else addBlock("field",fieldKey,{x,y});
  };
  const setPageSize=value=>updateActive({pageSize:value});
  const canvasRatio=activeTemplate.orientation==="landscape"
    ?(activeTemplate.pageSize==="Letter"?1.294:1.414)
    :(activeTemplate.pageSize==="Letter"?0.773:0.707);
  const backgroundUrl=activeTemplate.background?.url?API+activeTemplate.background.url:"";
  const previewItems=previewInvoice?.items||[
    {sr:"1",description:"Sample product",quantity:"2",unitPrice:"500.00",amount:"1000.00",qtyUnit:"PCS"},
    {sr:"2",description:"Another product",quantity:"1",unitPrice:"750.00",amount:"750.00",qtyUnit:"PCS"}
  ];
  const selectedTableColumns=selectedBlock?.type==="items_table"
    ?(Array.isArray(selectedBlock.columns)?selectedBlock.columns:previewColumns).map((column,index)=>({...column,order:index,visible:column.visible!==false}))
    :[];
  const updateSelectedTableColumns=columns=>updateBlock(selectedBlock.id,{columns:columns.map((column,index)=>({...column,order:index}))});
  const updateSelectedTableColumn=(index,patch)=>{
    const next=selectedTableColumns.map((column,columnIndex)=>columnIndex===index?{...column,...patch}:column);
    updateSelectedTableColumns(next);
  };
  const reorderSelectedTableColumn=(fromIndex,toIndex)=>{
    if(toIndex<0||toIndex>=selectedTableColumns.length||fromIndex===toIndex)return;
    const next=selectedTableColumns.slice();
    const [moved]=next.splice(fromIndex,1);
    next.splice(toIndex,0,moved);
    updateSelectedTableColumns(next);
  };
  const addSelectedTableColumn=key=>{
    if(!key||selectedTableColumns.some(column=>column.key===key)||selectedTableColumns.length>=14)return;
    const option=DEFAULT_ITEM_COLUMNS.find(column=>column.key===key);
    if(!option)return;
    updateSelectedTableColumns([...selectedTableColumns,{...option,order:selectedTableColumns.length}]);
  };

  const renderBlockContent=block=>{
    if(block.type==="shape")return null;
    if(block.type==="image")return <img className="invoice-builder-imported-image" style={{objectFit:block.imageFit||"contain"}} src={block.imageUrl} alt={block.label||"Imported invoice image"}/>;
    if(block.type==="text")return <span>{block.text||block.label}</span>;
    if(block.type==="divider")return <div className="invoice-builder-divider-line"/>;
    if(block.type==="logo"){
      const logo=previewInvoice?.logoUrl?(previewInvoice.logoUrl.startsWith("http")?previewInvoice.logoUrl:API+previewInvoice.logoUrl):"";
      return logo
        ?<img className="invoice-builder-live-logo" src={logo} alt="Business logo"/>
        :<div className="invoice-builder-logo-placeholder"><i className="bi bi-image"></i><small>{previewInvoice?"No business logo saved":"Business logo"}</small></div>;
    }
    if(block.type==="items_table"){
      const columns=(Array.isArray(block.columns)?block.columns:previewColumns).filter(column=>column.visible!==false).slice(0,14);
      const rows=previewItems.slice(0,4);
      const borderColor=block.tableBorderColor||"#b8c4d1";
      const cellPadding=Number(block.tableCellPadding??4);
      return (
        <div className="invoice-builder-sample-table" style={{color:block.color}}>
          <table>
            <thead><tr>{columns.map(column=><th key={column.key} style={{backgroundColor:block.tableHeaderBackground||"#edf2f7",color:block.tableHeaderColor||"#172335",borderColor,borderWidth:(block.tableBorderWidth??1)+"px",padding:cellPadding+"px"}}>{column.label}</th>)}</tr></thead>
            <tbody>{rows.map((item,index)=><tr key={item.sr||index}>{columns.map(column=><td key={column.key} style={{backgroundColor:block.alternateRows!==false&&index%2===1?(block.tableAlternateRowBackground||"#f7f9fc"):(block.tableRowBackground||"#ffffff"),borderColor,borderWidth:(block.tableBorderWidth??1)+"px",padding:cellPadding+"px"}}>{item[column.key]??""}</td>)}</tr>)}</tbody>
          </table>
          {previewItems.length>rows.length&&<small className="invoice-builder-more-items">+ {previewItems.length-rows.length} more saved items</small>}
        </div>
      );
    }
    if(block.type==="totals"){
      const totals=previewInvoice?.totals||{
        subtotal:SAMPLE_VALUES.subtotal,discount:SAMPLE_VALUES.discount,
        taxableValue:SAMPLE_VALUES.taxable_value,tax:"₹ 1,710.00",
        grandTotal:SAMPLE_VALUES.grand_total,paid:SAMPLE_VALUES.amount_paid,due:SAMPLE_VALUES.balance_due
      };
      return <div className="invoice-builder-totals">
        <span>Subtotal <b>{totals.subtotal}</b></span>
        <span>Discount <b>{totals.discount}</b></span>
        <span>Tax <b>{totals.tax}</b></span>
        <span className="invoice-builder-total">Invoice total <b>{totals.grandTotal}</b></span>
        <span>Paid <b>{totals.paid}</b></span>
        <span>Due <b>{totals.due}</b></span>
      </div>;
    }
    const value=previewInvoice?(previewFields[block.fieldKey]||"—"):(SAMPLE_VALUES[block.fieldKey]||block.label||"Invoice field");
    return <span>{block.label&&block.showLabel!==false&&<small className="invoice-builder-field-label">{block.label}: </small>}{value}</span>;
  };

  return (
    <div className="invoice-builder-overlay" role="dialog" aria-modal="true" aria-label="Custom invoice print builder">
      <div className="invoice-builder-app">
        <header className="invoice-builder-topbar">
          <div className="invoice-builder-brand">
            <button type="button" className="btn btn-light border" onClick={onClose}><i className="bi bi-arrow-left me-1"></i>Back</button>
            <div><strong>Invoice design builder</strong><small>Import a design, position invoice details, then check the print preview</small></div>
          </div>
          <div className="invoice-builder-top-actions">
            <span className="invoice-builder-save-status">{localDesign.enabled?"Custom design active":"Current print design unchanged"}</span>
            <button type="button" className="btn btn-light border" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" disabled={saving||uploading} onClick={()=>onSave?.({...localDesign,enabled:true})}>{saving?<><span className="spinner-border spinner-border-sm me-2"/>Saving</>:"Save design"}</button>
          </div>
        </header>
        <nav className="invoice-builder-steps" aria-label="Invoice design steps">
          <div className={designChosen?"is-complete":"is-current"}><span>{designChosen?<i className="bi bi-check-lg"/>:"1"}</span><div><strong>Choose a design</strong><small>{referenceReady?"Reference imported safely":activeTemplate.templateKey==="html-import"?"HTML design converted":"Starter design selected"}</small></div></div>
          <div className={liveFieldCount>0?"is-complete":referenceReady?"is-current":""}><span>{liveFieldCount>0?<i className="bi bi-check-lg"/>:"2"}</span><div><strong>Place invoice details</strong><small>{liveFieldCount>0?liveFieldCount+" editable elements":"Add the fields your invoice needs"}</small></div></div>
          <div className={printPreviewHtml?"is-complete":liveFieldCount>0?"is-current":""}><span>{printPreviewHtml?<i className="bi bi-check-lg"/>:"3"}</span><div><strong>Check and save</strong><small>{printPreviewHtml?"Print preview checked":"Preview the real invoice before saving"}</small></div></div>
        </nav>
        {error&&<div className="alert alert-danger m-3 mb-0">{error}</div>}
        {previewError&&<div className="alert alert-warning m-3 mb-0">{previewError} You can continue with sample data.</div>}
        {printPreviewError&&<div className="alert alert-warning m-3 mb-0">{printPreviewError}<button type="button" className="btn-close float-end" aria-label="Dismiss" onClick={()=>setPrintPreviewError("")}/></div>}
        {message&&<div className="alert alert-info m-3 mb-0">{message}<button type="button" className="btn-close float-end" aria-label="Dismiss" onClick={()=>setMessage("")}/></div>}
        <div className="invoice-builder-workspace">
          <aside className="invoice-builder-sidebar invoice-builder-fields">
            <div className="invoice-builder-panel-heading"><strong>Add to invoice</strong><small>Drag a field onto the page or tap to add it</small></div>
            <div className="invoice-builder-field-search"><i className="bi bi-search"/><input type="search" className="form-control form-control-sm" value={fieldSearch} onChange={event=>setFieldSearch(event.target.value)} placeholder="Find an invoice field…" aria-label="Find an invoice field"/>{fieldSearch&&<button type="button" onClick={()=>setFieldSearch("")} aria-label="Clear field search"><i className="bi bi-x-lg"/></button>}</div>
            {filteredFieldGroups.map(group=>(
              <section className="invoice-builder-field-group" key={group.title}>
                <h3>{group.title}</h3>
                <div className="invoice-builder-palette">
                  {group.items.map(([key,label])=>(
                    <button type="button" key={key} draggable onDragStart={event=>{event.dataTransfer.setData("application/x-invoice-field",key);event.dataTransfer.effectAllowed="copy";}} onClick={()=>addPaletteField(key)}>
                      <span><i className={"bi "+(key==="logo"?"bi-image":key==="items"?"bi-table":"bi-plus-square")}></i></span>{label}<i className="bi bi-plus"/>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!filteredFieldGroups.length&&<div className="invoice-builder-field-no-results">No fields match “{fieldSearch}”. Try another name.</div>}
            <div className="invoice-builder-extra-tools">
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>addBlock("items_table","items")}> <i className="bi bi-table me-1"/>Item table</button>
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>addBlock("totals","totals")}> <i className="bi bi-calculator me-1"/>Totals</button>
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>addBlock("text","")}> <i className="bi bi-fonts me-1"/>Text</button>
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>addBlock("divider","")}> <i className="bi bi-dash-lg me-1"/>Divider</button>
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>addBlock("shape","",{x:8,y:40},{w:34,h:7})}> <i className="bi bi-square me-1"/>Accent box</button>
              <button type="button" className="btn btn-sm btn-light border" onClick={()=>elementImageRef.current?.click()}> <i className="bi bi-image me-1"/>Image</button>
              <input ref={elementImageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={event=>handleElementImageUpload(event.target.files?.[0])}/>
            </div>
          </aside>

          <main className="invoice-builder-center">
            <div className="invoice-builder-toolbar">
              <div className="invoice-builder-templates">
                <label htmlFor="invoice-design-template">Design</label>
                <select id="invoice-design-template" className="form-select form-select-sm" value={activeTemplate.id} onChange={event=>{updateDesign({...localDesign,activeTemplateId:event.target.value});setConfirmDeleteTemplate(false);}}>
                  {localDesign.templates.map(template=><option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
                <button type="button" className="btn btn-sm btn-light border" onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)"><i className="bi bi-arrow-counterclockwise me-1"/>Undo</button>
                <button type="button" className="btn btn-sm btn-light border" onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Y)"><i className="bi bi-arrow-clockwise me-1"/>Redo</button>
                <button type="button" className="btn btn-sm btn-light border" onClick={duplicateTemplate} disabled={localDesign.templates.length>=12} title="Duplicate this design"><i className="bi bi-copy"/></button>
                <button type="button" className="btn btn-sm btn-light border" onClick={deleteActiveTemplate} title="Delete this design"><i className="bi bi-trash"/></button>
              </div>
              <div className="invoice-builder-toolbar-actions">
                <button type="button" className="btn btn-sm btn-light border" onClick={()=>setShowTemplateLibrary(true)}><i className="bi bi-grid me-1"/>Templates</button>
                <label className="btn btn-sm btn-light border mb-0" htmlFor="invoice-html-import"><i className="bi bi-code-slash me-1"/>{htmlImporting?"Reading HTML…":"Import HTML"}</label>
                <input ref={htmlImportRef} id="invoice-html-import" type="file" accept=".html,.htm,text/html" hidden onChange={event=>handleHtmlUpload(event.target.files?.[0])}/>
                <label className="btn btn-sm btn-light border mb-0" htmlFor="invoice-design-import"><i className="bi bi-upload me-1"/>{uploading?"Importing…":"Import PDF / image"}</label>
                <input ref={importRef} id="invoice-design-import" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" hidden onChange={event=>handleUpload(event.target.files?.[0])}/>
                <button type="button" className="btn btn-sm btn-light border" onClick={createBlankDesign}><i className="bi bi-plus-lg me-1"/>New blank</button>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={()=>updateDesign({...localDesign,enabled:!localDesign.enabled})}>{localDesign.enabled?"Using custom design":"Use this design"}</button>
              </div>
            </div>

            <div className="invoice-builder-designbar">
              <div className="invoice-builder-name"><label htmlFor="invoice-design-name">Design name</label><input id="invoice-design-name" value={activeTemplate.name} maxLength={60} onChange={event=>renameTemplate(event.target.value)}/></div>
              <div className="invoice-builder-preview-select">
                <label htmlFor="invoice-real-preview">Preview with</label>
                <select id="invoice-real-preview" className="form-select form-select-sm" value={previewRecordId} onChange={handlePreviewRecordChange} disabled={previewLoading&&!previewRecords.length}>
                  <option value="">Sample data</option>
                  {previewRecords.map(record=><option value={record.id} key={record.id}>{record.orderNumber} · {record.companyName}</option>)}
                </select>
                <span className={previewInvoice?"is-real":"is-sample"}>{previewLoading?"Loading preview…":previewInvoice?"Saved invoice data":"Sample data"}</span>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={openActualPrintPreview} disabled={!previewRecordId||previewLoading||printPreviewLoading} title="Render the current design using the real invoice print template">
                  {printPreviewLoading?<span className="spinner-border spinner-border-sm me-1"/>:<i className="bi bi-file-earmark-pdf me-1"/>}
                  {printPreviewLoading?"Preparing…":"Actual print"}
                </button>
                {!previewRecordId&&<small className="invoice-builder-preview-help">Sample values are shown. Create an invoice to check the real print output.</small>}
              </div>
              <div className="invoice-builder-page-settings">
                <button type="button" className={"btn btn-sm "+(designWarnings.length?"btn-outline-warning":"btn-light border")} onClick={()=>printCheckRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"})} title="Review potential print-layout issues"><i className="bi bi-clipboard-check me-1"/>Print check {designWarnings.length?("(" +designWarnings.length+")"):"✓"}</button>
                <label>Paper</label><select value={activeTemplate.pageSize} onChange={event=>setPageSize(event.target.value)}><option value="A4">A4</option><option value="A5">A5</option><option value="Letter">Letter</option></select>
                <select aria-label="Page orientation" value={activeTemplate.orientation} onChange={event=>updateActive({orientation:event.target.value})}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
                <details className="invoice-builder-margin-settings"><summary>Margins</summary><div className="invoice-builder-margin-popover"><strong>Printable area (mm)</strong><div className="invoice-builder-margin-grid">{[["Top","top"],["Right","right"],["Bottom","bottom"],["Left","left"]].map(([label,key])=><label key={key}>{label}<input type="number" min="0" max="25" step="1" className="form-control form-control-sm" value={printMargins[key]??0} onChange={event=>updateActive({printMargins:{...printMargins,[key]:Math.max(0,Math.min(25,Number(event.target.value)||0))}})}/></label>)}</div><small>Elements are positioned inside this printable area. Imported reference backgrounds stay full-page.</small></div></details>
                <button type="button" className={"btn btn-sm "+(showGrid?"btn-primary":"btn-light border")} onClick={()=>setShowGrid(value=>!value)} aria-pressed={showGrid} title="Show a 2% alignment grid"><i className="bi bi-grid-3x3 me-1"/>Grid</button>
                <button type="button" className={"btn btn-sm "+(snapToGrid?"btn-primary":"btn-light border")} onClick={()=>setSnapToGrid(value=>!value)} aria-pressed={snapToGrid} title="Snap moved elements to the 2% grid"><i className="bi bi-magnet me-1"/>Snap</button>
              </div>
            </div>

            <div ref={printCheckRef} className="invoice-builder-print-check" role="status"><strong>{designWarnings.length?("Layout check · "+designWarnings.length+" issue"+(designWarnings.length===1?"":"s")+" to review"):"Layout check · No estimated issues found"}</strong>{designWarnings.some(issue=>issue.fixable)&&<button type="button" className="btn btn-sm btn-outline-primary mt-2" onClick={()=>{const result=applySafeInvoiceLayoutFixes(activeTemplate.blocks,previewColumns);if(result.changed)updateActive({blocks:result.blocks});}}>Fix safe issues</button>}{designWarnings.length>0?<ul>{designWarnings.slice(0,8).map((issue,index)=><li key={index}><span className={issue.severity==="error"?"text-danger":"text-warning"}>{issue.title}</span> — {issue.detail}</li>)}</ul>:<small>No obvious layout problems were estimated. Confirm the final design in Actual print before printing.</small>}{designWarnings.length>0&&<small>Text-fit checks are estimates. Confirm the final result using Actual print.</small>}</div>
            <div className="invoice-builder-canvas-scroll">
              <div className={"invoice-builder-page "+(activeTemplate.orientation==="landscape"?"is-landscape":"")} style={{aspectRatio:activeTemplate.orientation==="landscape"?"1.414 / 1":String(canvasRatio).replace("/"," / ")}}>
                <div className="invoice-builder-canvas" onDragOver={event=>event.preventDefault()} onDrop={handlePaletteDrop} onPointerMove={moveBlock} onPointerUp={finishBlockDrag} onPointerCancel={finishBlockDrag}>
                  {highlightedOcrLine?.box&&<div className="invoice-builder-ocr-highlight is-label" style={{left:highlightedOcrLine.box.x+"%",top:highlightedOcrLine.box.y+"%",width:highlightedOcrLine.box.w+"%",height:Math.max(2,highlightedOcrLine.box.h)+"%"}}><span>Matched text</span></div>}
                  {highlightedOcrLine?.valueBox&&<div className={"invoice-builder-ocr-highlight is-target "+(highlightedOcrLine.valueBox.kind==="estimated"?"is-estimated":"")} style={{left:highlightedOcrLine.valueBox.x+"%",top:highlightedOcrLine.valueBox.y+"%",width:highlightedOcrLine.valueBox.w+"%",height:highlightedOcrLine.valueBox.h+"%"}}><span>{highlightedOcrLine.valueBox.kind==="estimated"?"Suggested space":"Live field position"}</span></div>}
                  {activeTemplate.background?.url&&activeTemplate.background.visible!==false&&(
                    activeTemplate.background.type==="pdf"
                      ? <iframe className="invoice-builder-background" title="Imported PDF invoice reference" src={backgroundUrl+"#toolbar=0&navpanes=0&scrollbar=0"} tabIndex="-1"/>
                      : <img className="invoice-builder-background" src={backgroundUrl} alt="Imported invoice reference background" draggable="false"/>
                  )}
                  <div className="invoice-builder-safe-area" ref={canvasRef} style={pageContentInset}>
                    <div className={"invoice-builder-grid-overlay"+(showGrid?" is-visible":"")} aria-hidden="true"/>
                  {placingField&&<button type="button" className="invoice-builder-placement-layer" onClick={placeFieldOnCanvas} aria-label={"Place "+(FIELD_LABELS[placementField]||"invoice element")+" at the selected position"}><span>Click on the page to place {FIELD_LABELS[placementField]||"the selected element"}</span></button>}
                  <div className="invoice-builder-alignment-guides" aria-hidden="true">
                    {alignmentGuides.vertical.map((position,index)=><span key={"v-"+index} className="invoice-builder-alignment-guide vertical" style={{left:position+"%"}}/>)}
                    {alignmentGuides.horizontal.map((position,index)=><span key={"h-"+index} className="invoice-builder-alignment-guide horizontal" style={{top:position+"%"}}/>)}
                  </div>
                  <div className="invoice-builder-block-layer">
                    {activeTemplate.blocks.filter(block=>block.visible!==false).map(block=>(
                      <button type="button" key={block.id} className={"invoice-builder-block "+(selectedBlockId===block.id?"is-selected":"")+(dragging?.id===block.id?" is-dragging":"")} style={{left:block.x+"%",top:block.y+"%",width:block.w+"%",height:block.h+"%",fontSize:block.fontSize+"px",fontWeight:block.bold?700:400,fontStyle:block.italic?"italic":"normal",fontFamily:block.fontFamily||"Arial",textAlign:block.align,color:block.color,backgroundColor:block.backgroundColor||"transparent",border:block.borderWidth?block.borderWidth+"px solid "+(block.borderColor||"#d8e0e9"):undefined,borderRadius:block.borderRadius+"px",padding:block.padding+"px",opacity:block.opacity??1}} onClick={()=>{if(!placingField)setSelectedBlockId(block.id);}} onPointerDown={event=>{if(!placingField)startBlockDrag(event,block);}} aria-label={"Move "+(block.label||"invoice element")}>
                        {renderBlockContent(block)}
                        {selectedBlockId===block.id&&<span className="invoice-builder-resize-handle" data-resize-handle="true" onPointerDown={event=>startBlockResize(event,block)} aria-hidden="true"/>}
                      </button>
                    ))}
                  </div>
                  </div>
                  {activeTemplate.background?.url&&<div className="invoice-builder-reference-hint">Reference background · {activeTemplate.background.type.toUpperCase()}</div>}
                </div>
              </div>
            </div>
            <div className="invoice-builder-canvas-footer">
              <span><i className="bi bi-arrows-move me-1"/>Drag to position · Arrow keys nudge (Shift for larger steps) · Select to edit.</span><span className="invoice-builder-pagination-hint">Long invoices continue automatically. Headings repeat and totals move to the final page.</span>
              {activeTemplate.background?.url&&<button type="button" className="btn btn-sm btn-light border" onClick={()=>updateActive({background:{...activeTemplate.background,visible:activeTemplate.background.visible===false}})}>{activeTemplate.background.visible===false?"Show reference":"Hide reference"}</button>}
            </div>
          </main>

          <aside className="invoice-builder-sidebar invoice-builder-properties">
            <div className="invoice-builder-panel-heading"><strong>Design settings</strong><small>Make this invoice your own</small></div>
            {activeTemplate.background?.url&&(
              <section className="invoice-builder-property-card">
                <h3>Your imported design</h3>
                <p>The original file is kept as a locked reference. Editable invoice details sit above it and will not move the original.</p>
                <div className="invoice-builder-import-file"><i className={"bi "+(activeTemplate.background.type==="pdf"?"bi-file-earmark-pdf":"bi-image")}/><div><strong>{importedFile?.name||"Imported reference file"}</strong><small>{activeTemplate.background.type.toUpperCase()} reference · {importedFile?Math.max(1,Math.round(importedFile.size/1024))+" KB · ":""}Original kept safe</small></div><span className="badge text-bg-light border">Locked</span></div>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>{setPlacingField(false);setLayoutScan(null);setLayoutScanError("");setImportedFile(null);setOcrScan(null);setOcrError("");setHighlightedOcrLineId("");updateActive({templateKey:"clean",background:{url:"",type:"none",locked:true,visible:true},blocks:activeTemplate.blocks.map(block=>block.type==="field"?{...block,showLabel:true}:block)});}}>Remove</button>
                </div>
                <div className="invoice-builder-smart-scan mt-3">
                  <strong><i className="bi bi-magic me-1"/>Smart layout scan</strong>
                  <p>Checks image rules or PDF drawing lines to find a likely item-table area, then arranges common invoice fields around it. It does not read or recognize printed words.</p>
                  {layoutScanLoading&&<div className="small text-primary mb-2"><span className="spinner-border spinner-border-sm me-1"/>Scanning imported design…</div>}
                  {layoutScan&&<div className="invoice-builder-scan-result mb-2">
                    <i className="bi bi-check-circle me-1"/>
                    {layoutScan.table
                      ?"Likely item table found · "+layoutScan.table.rows+" horizontal rules"
                      :"Page scanned · item table needs manual positioning"}
                  </div>}
                  {layoutScanError&&<div className="small text-warning mb-2">{layoutScanError}</div>}
                  <button type="button" className="btn btn-sm btn-primary w-100" onClick={applySmartLayout} disabled={!layoutScan||layoutScanLoading}>
                    <i className="bi bi-stars me-1"/>Apply suggested layout
                  </button>
                </div>
                <div className="invoice-builder-ocr-card mt-3">
                  <strong><i className="bi bi-text-paragraph me-1"/>Recognise printed text</strong>
                  <p>Reads the first page and suggests which invoice fields each line may represent. You review every match and choose where its live value belongs.</p>
                  <button type="button" className="btn btn-sm btn-outline-primary w-100" onClick={runOcrScan} disabled={!importedFile||ocrLoading}>
                    {ocrLoading?<><span className="spinner-border spinner-border-sm me-1"/>Reading text…</>:<><i className="bi bi-search me-1"/>Read text and suggest fields</>}
                  </button>
                  {!importedFile&&<div className="small text-secondary mt-2">Re-import this reference file to run OCR.</div>}
                  {ocrLoading&&<div className="invoice-builder-ocr-progress mt-2">
                    <div className="d-flex justify-content-between gap-2"><span>{ocrProgress.stage||"Preparing"}</span><span>{Math.round((ocrProgress.progress||0)*100)}%</span></div>
                    <div className="progress mt-1" role="progressbar" aria-label="Text recognition progress" aria-valuenow={Math.round((ocrProgress.progress||0)*100)} aria-valuemin="0" aria-valuemax="100"><div className="progress-bar" style={{width:Math.round((ocrProgress.progress||0)*100)+"%"}}/></div>
                  </div>}
                  {ocrError&&<div className="small text-warning mt-2">{ocrError}</div>}
                  {ocrScan&&<div className="invoice-builder-ocr-results mt-3">
                    <div className="invoice-builder-ocr-results-heading">
                      <strong>{suggestedOcrCount} suggested fields · {ocrScan.lines.length} text lines</strong>
                      <small>Page 1 · English</small>
                    </div>
                    <div className="invoice-builder-ocr-view-switch" role="group" aria-label="Which detected text to show">
                      <button type="button" className={ocrView==="suggested"?"is-active":""} onClick={()=>setOcrView("suggested")}>Suggested fields</button>
                      <button type="button" className={ocrView==="all"?"is-active":""} onClick={()=>setOcrView("all")}>All detected text</button>
                    </div>
                    <p>Review each match. Preview its area on the page, then place the live field or choose a position yourself.</p>
                    {ocrScan.lines.length===0
                      ?<div className="small text-secondary">No readable text was found. Try a clearer scan or use guided placement.</div>
                      :visibleOcrLines.length===0
                        ?<div className="invoice-builder-ocr-empty">No field labels were confidently matched. Open <strong>All detected text</strong> to choose a field manually.</div>
                        :visibleOcrLines.map(line=>(
                        <div className="invoice-builder-ocr-row" key={line.id}>
                          <div className="invoice-builder-ocr-line">
                            <span>{line.text}</span>
                            <small>{line.confidence>0?Math.round(line.confidence)+"% confidence":"Text found"}</small>
                          </div>
                          <div className="invoice-builder-ocr-map">
                            <select className="form-select form-select-sm" aria-label={"Map detected text: "+line.text} value={line.selectedField||""} onChange={event=>updateOcrMapping(line.id,event.target.value)}>
                              <option value="">Choose field…</option>
                              {FIELD_GROUPS.map(group=>(
                                <optgroup label={group.title} key={group.title}>
                                  {group.items.filter(([key])=>key!=="logo").map(([key,label])=><option value={key} key={key}>{label}</option>)}
                                </optgroup>
                              ))}
                            </select>
                            <div className="invoice-builder-ocr-map-actions">
                              <button type="button" className={"btn btn-sm "+(highlightedOcrLineId===line.id?"btn-outline-primary":"btn-light border")} onClick={()=>setHighlightedOcrLineId(highlightedOcrLineId===line.id?"":line.id)}><i className="bi bi-eye me-1"/>{highlightedOcrLineId===line.id?"Hide area":"Show area"}</button>
                              {line.valueBox&&<button type="button" className="btn btn-sm btn-primary" disabled={!line.selectedField} onClick={()=>placeOcrMappingAtDetectedArea(line)}>{line.valueBox.kind==="estimated"?"Place in suggested space":"Place over detected value"}</button>}
                              <button type="button" className="btn btn-sm btn-light border" disabled={!line.selectedField} onClick={()=>placeOcrMapping(line)}>{line.valueBox?"Choose position":"Place"}</button>
                            </div>
                            {line.valueBox&&<small className="invoice-builder-ocr-value-found">{line.valueBox.kind==="estimated"?"Space estimated from the label and nearby text":"Printed value area found"} · review after placing</small>}
                          </div>
                        </div>
                      ))}
                    {(ocrView==="suggested"?ocrScan.lines.filter(line=>line.selectedField):ocrScan.lines).length>30&&<div className="small text-secondary mt-2">Showing the first 30. Use field search or guided placement for other details.</div>}
                  </div>}
                  <div className="small text-secondary mt-2">Recognition runs in your browser. The English OCR engine and language file are downloaded on first use and cached; your document is not sent to an external OCR service.</div>
                </div>
                <div className="invoice-builder-mapping-guide mt-3">
                  <strong>Guided field placement</strong>
                  <p>Choose an invoice field, then click its exact position on the reference. You can resize and style it afterwards.</p>
                  <label className="form-label" htmlFor="invoice-field-to-place">Field to add</label>
                  <select id="invoice-field-to-place" className="form-select form-select-sm" value={placementField} onChange={event=>{setPlacementField(event.target.value);setPlacingField(false);}}>
                    {FIELD_GROUPS.map(group=><optgroup label={group.title} key={group.title}>{group.items.map(([key,label])=><option value={key} key={key}>{label}</option>)}</optgroup>)}
                    <optgroup label="Invoice structure"><option value="items">Invoice items table</option><option value="totals">Invoice totals</option></optgroup>
                  </select>
                  <div className="d-flex gap-2 mt-2">
                    <button type="button" className="btn btn-sm btn-primary flex-grow-1" onClick={()=>{setPlacingField(true);setMessage("Click the location on the invoice page where "+(FIELD_LABELS[placementField]||"the selected element")+" should appear.");}} disabled={!placementField}>Place on page</button>
                    {placingField&&<button type="button" className="btn btn-sm btn-light border" onClick={()=>setPlacingField(false)}>Cancel</button>}
                  </div>
                  {placingField&&<div className="small text-primary mt-2">Placement mode is on. Click the matching area on the invoice page.</div>}
                </div>
                <div className="small text-secondary mt-2">{activeTemplate.background.type==="pdf"?"PDF page shown as a locked reference. Map fields onto the visible page; the original file will not move.":"Image shown as a locked reference. Map fields onto the visible page; the original file will not move."}</div>
              </section>
            )}
            {!selectedBlock?(
              <div className="invoice-builder-empty-property"><i className="bi bi-cursor"/>Select an item on the page to edit it.</div>
            ):(
              <section className="invoice-builder-property-card">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-3"><h3 className="mb-0">Selected item</h3><button type="button" className="btn btn-sm btn-outline-danger" onClick={removeBlock} title="Remove item"><i className="bi bi-trash"/></button></div>
                <label className="form-label">Name</label><input className="form-control form-control-sm mb-3" value={selectedBlock.label} onChange={event=>updateBlock(selectedBlock.id,{label:event.target.value})}/>
                {selectedBlock.type==="field"&&(
                  <><label className="form-label">What should it show?</label><select className="form-select form-select-sm mb-3" value={selectedBlock.fieldKey} onChange={event=>updateBlock(selectedBlock.id,{fieldKey:event.target.value,label:FIELD_LABELS[event.target.value]||selectedBlock.label})}>{Object.entries(FIELD_LABELS).filter(([key])=>key!=="logo").map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></>
                )}
                {selectedBlock.type==="text"&&<><label className="form-label">Text</label><textarea className="form-control form-control-sm mb-3" rows={3} value={selectedBlock.text} onChange={event=>updateBlock(selectedBlock.id,{text:event.target.value})}/></>}
                {selectedBlock.type==="items_table"&&(
                  <div className="invoice-builder-table-editor">
                    <h4>Columns in this table</h4>
                    <p>Rename, resize, hide or drag columns into the order you want. These changes apply only to this design.</p>
                    <div className="invoice-builder-table-columns">
                      {selectedTableColumns.map((column,index)=>(
                        <div className={"invoice-builder-table-column"+(column.visible===false?" is-hidden":"")} key={column.key} draggable onDragStart={event=>{event.dataTransfer.setData("application/x-invoice-table-column",String(index));event.dataTransfer.effectAllowed="move";}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const from=Number(event.dataTransfer.getData("application/x-invoice-table-column"));if(Number.isInteger(from))reorderSelectedTableColumn(from,index);}}>
                          <span className="invoice-builder-column-grip" title="Drag to reorder"><i className="bi bi-grip-vertical"/></span>
                          <div className="invoice-builder-column-fields">
                            <input className="form-control form-control-sm" aria-label={"Column "+(index+1)+" heading"} value={column.label} maxLength={40} onChange={event=>updateSelectedTableColumn(index,{label:event.target.value})}/>
                            <div className="d-flex align-items-center gap-2">
                              <label className="small text-secondary mb-0">Width</label>
                              <input type="number" min="3" max="70" className="form-control form-control-sm invoice-builder-column-width" aria-label={column.label+" column width"} value={column.width??8} onChange={event=>updateSelectedTableColumn(index,{width:clamp(event.target.value,3,70)})}/>
                              <span className="small text-secondary">%</span>
                            </div>
                          </div>
                          <button type="button" className="invoice-builder-column-visibility" onClick={()=>updateSelectedTableColumn(index,{visible:column.visible===false})} aria-label={(column.visible===false?"Show ":"Hide ")+column.label} title={column.visible===false?"Show column":"Hide column"} disabled={column.visible!==false&&selectedTableColumns.filter(item=>item.visible!==false).length===1}><i className={"bi "+(column.visible===false?"bi-eye-slash":"bi-eye")}/></button>
                        </div>
                      ))}
                    </div>
                    <div className="invoice-builder-table-add">
                      <select className="form-select form-select-sm" value="" aria-label="Add an item table column" onChange={event=>addSelectedTableColumn(event.target.value)}>
                        <option value="">Add a column…</option>
                        {ITEM_TABLE_COLUMN_OPTIONS.filter(option=>!selectedTableColumns.some(column=>column.key===option.key)).map(option=><option value={option.key} key={option.key}>{option.label}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm btn-light border" onClick={()=>updateBlock(selectedBlock.id,{columns:undefined})} title="Use the saved invoice column settings">Reset</button>
                    </div>
                    <h4>Table appearance</h4>
                    <div className="invoice-builder-number-grid">
                      <div><label className="form-label">Header background</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.tableHeaderBackground||"#edf2f7"} onChange={event=>updateBlock(selectedBlock.id,{tableHeaderBackground:event.target.value})}/></div>
                      <div><label className="form-label">Header text</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.tableHeaderColor||"#172335"} onChange={event=>updateBlock(selectedBlock.id,{tableHeaderColor:event.target.value})}/></div>
                      <div><label className="form-label">Row background</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.tableRowBackground||"#ffffff"} onChange={event=>updateBlock(selectedBlock.id,{tableRowBackground:event.target.value})}/></div>
                      <div><label className="form-label">Alternate row</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.tableAlternateRowBackground||"#f7f9fc"} onChange={event=>updateBlock(selectedBlock.id,{tableAlternateRowBackground:event.target.value})}/></div>
                      <div><label className="form-label">Border colour</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.tableBorderColor||"#b8c4d1"} onChange={event=>updateBlock(selectedBlock.id,{tableBorderColor:event.target.value})}/></div>
                      <div><label className="form-label">Cell spacing (px)</label><input type="number" min="1" max="10" className="form-control form-control-sm" value={selectedBlock.tableCellPadding??4} onChange={event=>updateBlock(selectedBlock.id,{tableCellPadding:clamp(event.target.value,1,10)})}/></div>
                    </div>
                    <div className="d-flex justify-content-between align-items-center gap-2 mt-3">
                      <div className="form-check form-switch"><input id="invoice-table-alternate-rows" type="checkbox" className="form-check-input" checked={selectedBlock.alternateRows!==false} onChange={event=>updateBlock(selectedBlock.id,{alternateRows:event.target.checked})}/><label className="form-check-label small" htmlFor="invoice-table-alternate-rows">Alternate row shading</label></div>
                      <div className="invoice-builder-column-border-width"><label className="small text-secondary">Border</label><input type="number" min="0" max="3" className="form-control form-control-sm" value={selectedBlock.tableBorderWidth??1} onChange={event=>updateBlock(selectedBlock.id,{tableBorderWidth:clamp(event.target.value,0,3)})}/></div>
                    </div>
                  </div>
                )}
                {selectedBlock.type==="field"&&<div className="form-check form-switch mb-3"><input id="invoice-block-show-label" className="form-check-input" type="checkbox" checked={selectedBlock.showLabel!==false} onChange={event=>updateBlock(selectedBlock.id,{showLabel:event.target.checked})}/><label className="form-check-label" htmlFor="invoice-block-show-label">Show field label before the value</label><small className="d-block text-secondary">Turn this off when the imported design already prints the label.</small></div>}
                <div className="invoice-builder-selected-actions"><button type="button" className="btn btn-sm btn-light border" onClick={duplicateSelectedBlock}><i className="bi bi-copy me-1"/>Duplicate element</button><button type="button" className="btn btn-sm btn-light border" onClick={()=>moveSelectedLayer(1)} title="Bring forward"><i className="bi bi-front"/></button><button type="button" className="btn btn-sm btn-light border" onClick={()=>moveSelectedLayer(-1)} title="Send backward"><i className="bi bi-back"/></button></div>
                <h4>Position and size</h4>
                <div className="invoice-builder-number-grid">
                  {[[ "Left", "x"],["Top","y"],["Width","w"],["Height","h"]].map(([label,key])=><div key={key}><label className="form-label">{label} (%)</label><input type="number" min={0} max={100} className="form-control form-control-sm" value={selectedBlock[key]} onChange={event=>updateBlock(selectedBlock.id,{[key]:clamp(event.target.value,0,100)})}/></div>)}
                </div>
                <h4>Appearance</h4>
                {selectedBlock.type!=="shape"&&selectedBlock.type!=="image"&&<div className="invoice-builder-number-grid">
                  <div><label className="form-label">Text size</label><input type="number" min={6} max={48} className="form-control form-control-sm" value={selectedBlock.fontSize} onChange={event=>updateBlock(selectedBlock.id,{fontSize:clamp(event.target.value,6,48)})}/></div>
                  <div><label className="form-label">Text colour</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.color} onChange={event=>updateBlock(selectedBlock.id,{color:event.target.value})}/></div>
                </div>}
                <div className="invoice-builder-number-grid mt-3">
                  <div><label className="form-label">Background</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.backgroundColor&&selectedBlock.backgroundColor!=="transparent"?selectedBlock.backgroundColor:"#ffffff"} onChange={event=>updateBlock(selectedBlock.id,{backgroundColor:event.target.value})}/><button type="button" className="btn btn-link btn-sm p-0 mt-1" onClick={()=>updateBlock(selectedBlock.id,{backgroundColor:"transparent"})}>No fill</button></div>
                  <div><label className="form-label">Border colour</label><input type="color" className="form-control form-control-color w-100" value={selectedBlock.borderColor||"#d8e0e9"} onChange={event=>updateBlock(selectedBlock.id,{borderColor:event.target.value})}/></div>
                </div>
                <div className="invoice-builder-number-grid mt-2">
                  <div><label className="form-label">Border width (px)</label><input type="number" min={0} max={6} className="form-control form-control-sm" value={selectedBlock.borderWidth??0} onChange={event=>updateBlock(selectedBlock.id,{borderWidth:clamp(event.target.value,0,6)})}/></div>
                  <div><label className="form-label">Corner roundness</label><input type="number" min={0} max={24} className="form-control form-control-sm" value={selectedBlock.borderRadius??0} onChange={event=>updateBlock(selectedBlock.id,{borderRadius:clamp(event.target.value,0,24)})}/></div>
                  <div><label className="form-label">Inner spacing</label><input type="number" min={0} max={16} className="form-control form-control-sm" value={selectedBlock.padding??1} onChange={event=>updateBlock(selectedBlock.id,{padding:clamp(event.target.value,0,16)})}/></div>
                  <div><label className="form-label">Font family</label><select className="form-select form-select-sm" value={selectedBlock.fontFamily||"Arial"} onChange={event=>updateBlock(selectedBlock.id,{fontFamily:event.target.value})}><option>Arial</option><option>Helvetica</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Tahoma</option></select></div>
                </div>
                <label className="form-label mt-3">Alignment</label><div className="btn-group w-100 mb-3" role="group" aria-label="Text alignment">{["left","center","right"].map(value=><button type="button" className={"btn btn-sm "+(selectedBlock.align===value?"btn-primary":"btn-light border")} key={value} onClick={()=>updateBlock(selectedBlock.id,{align:value})}><i className={"bi bi-text-"+value}/></button>)}</div>
                <div className="form-check form-switch"><input id="invoice-block-bold" className="form-check-input" type="checkbox" checked={selectedBlock.bold} onChange={event=>updateBlock(selectedBlock.id,{bold:event.target.checked})}/><label className="form-check-label" htmlFor="invoice-block-bold">Bold text</label></div>
                {selectedBlock.type==="image"&&<div className="mt-3"><label className="form-label">Image fit</label><select className="form-select form-select-sm" value={selectedBlock.imageFit||"contain"} onChange={event=>updateBlock(selectedBlock.id,{imageFit:event.target.value})}><option value="contain">Show full image</option><option value="cover">Fill the element</option><option value="fill">Stretch to fit</option></select></div>}
                <div className="mt-3"><label className="form-label d-flex justify-content-between"><span>Transparency</span><span>{Math.round((selectedBlock.opacity??1)*100)}%</span></label><input className="form-range" type="range" min="0.1" max="1" step="0.05" value={selectedBlock.opacity??1} onChange={event=>updateBlock(selectedBlock.id,{opacity:Number(event.target.value)})}/></div>
                <div className="form-check form-switch mt-2"><input id="invoice-block-italic" className="form-check-input" type="checkbox" checked={selectedBlock.italic===true} onChange={event=>updateBlock(selectedBlock.id,{italic:event.target.checked})}/><label className="form-check-label" htmlFor="invoice-block-italic">Italic text</label></div>
                <div className="form-check form-switch mt-2"><input id="invoice-block-visible" className="form-check-input" type="checkbox" checked={selectedBlock.visible!==false} onChange={event=>updateBlock(selectedBlock.id,{visible:event.target.checked})}/><label className="form-check-label" htmlFor="invoice-block-visible">Show on invoice</label></div>
              </section>
            )}
            <section className="invoice-builder-property-card">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2"><h3 className="mb-0">Selected design</h3><button type="button" className="btn btn-sm btn-light border" onClick={()=>setShowTemplateLibrary(true)}>Browse templates</button></div>
              <p>{activeTemplate.name} · {activeTemplate.blocks.length} elements. Your other saved designs remain unchanged while you edit this one.</p>
              <div className="invoice-builder-design-actions"><button type="button" className="btn btn-sm btn-light border" onClick={duplicateTemplate} disabled={localDesign.templates.length>=12}><i className="bi bi-copy me-1"/>Duplicate</button><button type="button" className="btn btn-sm btn-light border" onClick={()=>setConfirmDeleteTemplate(value=>!value)}><i className="bi bi-trash me-1"/>Delete</button><button type="button" className="btn btn-sm btn-primary" onClick={createBlankDesign} disabled={localDesign.templates.length>=12}><i className="bi bi-plus-lg me-1"/>New design</button></div>
              {confirmDeleteTemplate&&<div className="invoice-builder-delete-confirm"><span>Delete “{activeTemplate.name}”?</span><button type="button" className="btn btn-sm btn-danger" onClick={deleteActiveTemplate}>Delete design</button><button type="button" className="btn btn-sm btn-light border" onClick={()=>setConfirmDeleteTemplate(false)}>Keep it</button></div>}
            </section>
            <section className="invoice-builder-property-card invoice-builder-layers">
              <div className="d-flex justify-content-between align-items-center gap-2 mb-2"><h3 className="mb-0">Elements on this page</h3><small>{activeTemplate.blocks.length}/80</small></div>
              {activeTemplate.blocks.length===0?<p>Start by adding a field, text, image, divider or accent shape.</p>:<div className="invoice-builder-layer-list">{activeTemplate.blocks.slice().reverse().map(block=><div className={selectedBlockId===block.id?"is-selected":""} key={block.id}><button type="button" className="invoice-builder-layer-select" onClick={()=>setSelectedBlockId(block.id)}><i className={"bi "+(block.type==="field"?"bi-braces":block.type==="items_table"?"bi-table":block.type==="image"||block.type==="logo"?"bi-image":block.type==="shape"?"bi-square":block.type==="divider"?"bi-dash":"bi-fonts")}/><span>{block.label||block.text||block.type.replace("_"," ")}</span></button><button type="button" className="invoice-builder-layer-visibility" title={block.visible===false?"Show element":"Hide element"} onClick={()=>updateBlock(block.id,{visible:block.visible===false})}><i className={"bi "+(block.visible===false?"bi-eye-slash":"bi-eye")}/></button></div>)}</div>}
            </section>
          </aside>
        </div>
        <footer className="invoice-builder-footer">
          <div><strong>{activeTemplate.blocks.length} elements</strong><span> · Your existing invoice data and calculations stay unchanged.</span></div>
          <div><button type="button" className="btn btn-light border" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={saving} onClick={()=>onSave?.({...localDesign,enabled:true})}>{saving?"Saving...":"Save and use design"}</button></div>
        </footer>
      </div>
      {showTemplateLibrary&&<div className="invoice-builder-template-modal" role="dialog" aria-modal="true" aria-label="Professional invoice templates">
        <div className="invoice-builder-template-dialog">
          <header><div><strong>Professional invoice templates</strong><small>Choose a ready-made layout. Every field, colour and position can be changed afterwards.</small></div><button type="button" className="btn btn-light border" onClick={()=>setShowTemplateLibrary(false)} aria-label="Close templates"><i className="bi bi-x-lg"/></button></header>
          <div className="invoice-builder-template-intro"><span><i className="bi bi-stars me-1"/>8 ready-to-customize designs</span><button type="button" className="btn btn-sm btn-outline-primary" onClick={createBlankDesign}><i className="bi bi-plus-lg me-1"/>Start with a blank page</button></div>
          <div className="invoice-builder-template-grid">{INVOICE_DESIGN_PRESETS.map(preset=><article className="invoice-builder-template-card" key={preset.key}>
            <div className={"invoice-builder-template-thumb theme-"+preset.key} aria-hidden="true"><span className="thumb-brand"/><span className="thumb-brand-line"/><span className="thumb-title"/><span className="thumb-customer"/><span className="thumb-meta"/><span className="thumb-table"/><span className="thumb-total"/><span className="thumb-foot"/></div>
            <div className="invoice-builder-template-card-copy"><div><strong>{preset.name}</strong><small>{preset.description}</small></div><span className="invoice-builder-template-category">{preset.category}</span></div>
            <button type="button" className="btn btn-sm btn-primary w-100" onClick={()=>chooseTemplate(preset.key)}>Use this design</button>
          </article>)}</div>
          <footer><small>Choosing a template creates a new design. Your current design is kept.</small><button type="button" className="btn btn-light border" onClick={()=>setShowTemplateLibrary(false)}>Close</button></footer>
        </div>
      </div>}
      {printPreviewOpen&&printPreviewHtml&&(
        <div className="invoice-builder-print-preview" role="dialog" aria-modal="true" aria-label="Actual invoice print preview">
          <div className="invoice-builder-print-preview-dialog">
            <header className="invoice-builder-print-preview-header">
              <div>
                <strong>Actual print preview</strong>
                <small>This uses your current design edits and the selected saved invoice. Nothing is saved or changed.</small>
              </div>
              <button type="button" className="btn btn-light border" onClick={()=>setPrintPreviewOpen(false)} aria-label="Close print preview"><i className="bi bi-x-lg"/></button>
            </header>
            <div className="invoice-builder-print-preview-content">
              <iframe
                ref={printPreviewFrameRef}
                title="Rendered invoice print preview"
                srcDoc={printPreviewHtml}
                sandbox="allow-same-origin allow-modals"
              />
            </div>
            <footer className="invoice-builder-print-preview-footer">
              <span>Review page breaks and layout here before printing.</span>
              <div>
                <button type="button" className="btn btn-light border" onClick={()=>setPrintPreviewOpen(false)}>Back to designer</button>
                <button type="button" className="btn btn-primary" onClick={printActualInvoice}><i className="bi bi-printer me-1"/>Print invoice</button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
