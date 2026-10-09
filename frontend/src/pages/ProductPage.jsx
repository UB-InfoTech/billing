import React,{useEffect,useMemo,useState,useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import { createProduct, fetchProducts, updateProduct, deleteProduct, searchProductByBarcode } from "../services/productService";
import { Html5QrcodeScanner } from "html5-qrcode";
import FormConfigurator from "../components/FormConfigurator";
import ConfiguredField from "../components/ConfiguredField";
import DynamicTable from "../components/DynamicTable";
import { PRODUCT_FORM_FIELDS } from "../config/noCodeCatalog";
import { useFormConfiguration, applyFormulas, getFieldState, hydrateConfiguredValues, syncConfiguredCustomFields, buildConfiguredDefaults } from "../hooks/useFormConfiguration";

const emptyBase={
  productName:"",
  productCode:"",
  designNo:"",
  rate:"",
  purchasePrice:"",
  minStock:0,
  quantity:0,
  serialNumber:"",
  barcode:"",
  purchaseDate:"",
  description:"",
  customFields:{}
};

export default function ProductPage(){
  const [searchParams,setSearchParams]=useSearchParams();
  const productFormConfig=useFormConfiguration("products.form",PRODUCT_FORM_FIELDS);
  const [products,setProducts]=useState([]);
  const [form,setForm]=useState(emptyBase);
  const [images,setImages]=useState([]);
  const [editingProduct,setEditingProduct]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [showBarcodeScanner,setShowBarcodeScanner]=useState(false);
  const [formSettingsOpen,setFormSettingsOpen]=useState(false);
  const [tableCustomizeRequested,setTableCustomizeRequested]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [lowStock,setLowStock]=useState(false);

  const configuredFields=productFormConfig.fields||[];
  const visibleFields=configuredFields.filter(field=>field.visible!==false);

  const resetProduct=()=>{
    setEditingProduct(null);
    setImages([]);
    setForm(buildConfiguredDefaults({...emptyBase},configuredFields));
    setError("");
    setShowForm(true);
  };

  useEffect(()=>{
    const customize=searchParams.get("customize");
    const action=searchParams.get("action");
    if(customize==="form")setFormSettingsOpen(true);
    if(customize==="table")setTableCustomizeRequested(true);
    if(action==="new")resetProduct();
    if(customize||action){
      searchParams.delete("customize");
      searchParams.delete("action");
      setSearchParams(searchParams,{replace:true});
    }
  },[searchParams,setSearchParams]);

  const loadProducts=async()=>{
    try{
      setLoading(true);
      setError("");
      const response=await fetchProducts({search:search.trim(),lowStock:lowStock?"true":"false",limit:100,sort:"productName",order:"asc"});
      setProducts(response.data?.products||[]);
    }catch(loadError){
      setError(loadError.response?.data?.message||"Unable to load products.");
    }finally{setLoading(false);}
  };

  useEffect(()=>{loadProducts();},[search,lowStock]);

  const handleEdit=useCallback(product=>{
    const hydrated=buildConfiguredDefaults(hydrateConfiguredValues(product,configuredFields),configuredFields);
    setEditingProduct(product);
    setForm({...hydrated,customFields:{...(product.customFields||{})}});
    setImages([]);
    setError("");
    setShowForm(true);
    window.scrollTo({top:0,behavior:"smooth"});
  },[configuredFields]);

  useEffect(()=>{
    if(!showBarcodeScanner)return undefined;
    const reader=document.getElementById("product-barcode-reader");
    if(!reader)return undefined;
    const scanner=new Html5QrcodeScanner("product-barcode-reader",{fps:8,qrbox:200});
    scanner.render(text=>{
      searchProductByBarcode(text).then(response=>{
        const product=response.data?.product;
        if(product){
          handleEdit(product);
          setShowBarcodeScanner(false);
        }else{
          setError("No product found for that barcode.");
        }
      }).catch(err=>setError(err.response?.data?.message||"Unable to find that barcode."));
    });
    return()=>{scanner.clear().catch(()=>{});};
  },[showBarcodeScanner,handleEdit]);

  const productValue=(field)=>{
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
      next=syncConfiguredCustomFields(next,configuredFields);
      return applyFormulas(configuredFields,next);
    });
  };



  const handleSubmit=async event=>{
    event.preventDefault();
    setError("");

    const values={...syncConfiguredCustomFields(form,configuredFields)};
    const requiredFields=configuredFields.filter(field=>field.required&&!field.formula);
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

    try{
      setSaving(true);
      const data=new FormData();
      configuredFields.filter(field=>!field.custom).forEach(field=>{
        const value=values[field.key];
        if(value===undefined||value===null)return;
        if(value instanceof Date)data.append(field.key,value.toISOString());
        else if(typeof value==="object")data.append(field.key,JSON.stringify(value));
        else data.append(field.key,String(value));
      });
      data.append("customFields",JSON.stringify(values.customFields||{}));
      images.forEach(image=>data.append("images",image));

      if(editingProduct?._id)await updateProduct(editingProduct._id,data);
      else await createProduct(data);

      resetProduct();
      await loadProducts();
    }catch(saveError){
      setError(saveError.response?.data?.message||saveError.message||"Unable to save product.");
    }finally{setSaving(false);}
  };

  const handleDelete=async product=>{
    if(!window.confirm("Delete this product?"))return;
    try{
      await deleteProduct(product._id);
      if(editingProduct?._id===product._id)resetProduct();
      await loadProducts();
    }catch(deleteError){
      setError(deleteError.response?.data?.message||"Unable to delete product.");
    }
  };

  const productSections=useMemo(
    ()=>[...new Set(visibleFields.map(field=>field.section||"General"))],
    [visibleFields]
  );

  const tableColumns=useMemo(()=>{
    const base=[
      {key:"productName",label:"Product",sortKey:"productName"},
      {key:"productCode",label:"Code",sortKey:"productCode"},
      {key:"designNo",label:"Design No.",sortKey:"designNo"},
      {key:"rate",label:"Selling Rate",sortKey:"rate",render:product=>`₹${Number(product.rate||0).toFixed(2)}`},
      {key:"quantity",label:"Stock",sortKey:"quantity",render:product=>{
        const low=Number(product.quantity||0)<=Number(product.minStock||0);
        return <span className={low?"text-danger fw-bold":""}>{Number(product.quantity||0).toLocaleString("en-IN")}</span>;
      }},
      {key:"minStock",label:"Min Stock",sortKey:"minStock"},
      {key:"purchasePrice",label:"Purchase Price",sortKey:"purchasePrice",render:product=>`₹${Number(product.purchasePrice||0).toFixed(2)}`},
      {key:"barcode",label:"Barcode",sortKey:"barcode"},
    ];
    const custom=configuredFields.filter(field=>field.custom).map(field=>({
      key:field.key,
      label:field.label,
      render:product=>product.customFields?.[field.key]??""
    }));
    return [...base,...custom];
  },[configuredFields]);

  return(
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <div className="text-primary small fw-semibold">YOUR CATALOGUE</div>
          <h2 className="mb-1">Products</h2>
          <div className="text-muted">Keep item names, prices and stock in one place. Add products only when you need to.</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={resetProduct}><i className="bi bi-plus-lg me-1"></i>Add product</button>
        </div>
      </div>

      {error&&<div className="alert alert-danger">{error}</div>}

      {showForm&&(
        <form onSubmit={handleSubmit} className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div>
              <h5 className="mb-1">{editingProduct?"Edit product details":"Add a product"}</h5>
              <div className="small text-muted">{editingProduct?"Update the details and save your changes.":"Enter the details you know. You can add more information later."}</div>
            </div>
            <button type="button" className="btn btn-sm btn-light border" onClick={()=>{setShowForm(false);setEditingProduct(null);setImages([]);setError("");}}>Close</button>
          </div>

          <div className="card-body">
            {productFormConfig.loading?(
              <div className="text-center py-4"><span className="spinner-border spinner-border-sm me-2"></span>Loading form settings...</div>
            ):(
              <div className="row g-3">
                {productSections.map(section=>(
                  <div className="col-12" key={section}>
                    <div className="border rounded-3 p-3">
                      <div className="fw-semibold mb-3">{String(section).replace(/[_-]+/g," ").replace(/\b\w/g,char=>char.toUpperCase())}</div>
                      <div className="row g-3">
                        {visibleFields.filter(field=>(field.section||"General")===section).map(field=>{
                          const state=getFieldState(field,{...form,...(form.customFields||{})});
                          if(!state.visible)return null;
                          const common={
                            field:{...field,...state},
                            value:productValue(field),
                            onChange:value=>updateField(field,value),
                            required:state.required,
                            disabled:state.disabled,
                            readOnly:state.readOnly
                          };
                          return <div className={`col-12 col-md-${field.width||6}`} key={field.key}><ConfiguredField {...common}/></div>;
                        })}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="col-12">
                  <div className="border rounded-3 p-3">
                    <div className="fw-semibold mb-2">Product images</div>
                    <div className="small text-muted mb-2">Images stay with the product. Up to 5 image files can be added.</div>
                    <input type="file" className="form-control" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={event=>setImages(Array.from(event.target.files||[]).slice(0,5))}/>
                    {editingProduct?.images?.length>0&&(
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        {editingProduct.images.map((src,index)=><img key={index} src={src} alt="" style={{width:72,height:72,objectFit:"cover"}} className="rounded border"/> )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card-footer bg-white d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-primary px-4" disabled={saving||productFormConfig.loading}>{saving?<><span className="spinner-border spinner-border-sm me-2"></span>Saving...</>:(editingProduct?"Update product":"Add product")}</button>
          </div>
        </form>
      )}

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div className="d-flex flex-wrap gap-2">
              <div className="input-group" style={{maxWidth:360}}>
                <span className="input-group-text bg-white"><i className="bi bi-search"></i></span>
                <input className="form-control" placeholder="Search products, codes or designs" value={search} onChange={event=>setSearch(event.target.value)}/>
              </div>
              <label className="form-check form-switch d-flex align-items-center gap-2 px-3 mb-0 border rounded">
                <input className="form-check-input" type="checkbox" checked={lowStock} onChange={event=>setLowStock(event.target.checked)}/>
                <span className="small">Low stock only</span>
              </label>
            </div>
            <span className="small text-muted">{products.length} products shown</span>
          </div>

          <DynamicTable
            tableKey="products.list"
            autoOpenSettings={tableCustomizeRequested}
            rows={products}
            getRowKey={product=>product._id}
            loading={loading}
            emptyText={search.trim()?"No products match your search. Clear the search to see all products.":lowStock?"No products are at or below the minimum stock level.":"No products yet. Select Add product to add your first item."}
            columns={tableColumns}
            actionColumn={{
              label:"Actions",
              locked:true,
              render:product=>(
                <div className="d-flex justify-content-end gap-1">
                  <button type="button" className="btn btn-sm btn-light border" onClick={()=>handleEdit(product)} title="Edit product"><i className="bi bi-pencil me-1"></i>Edit</button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>handleDelete(product)} title="Delete product"><i className="bi bi-trash me-1"></i>Delete</button>
                </div>
              )
            }}
          />
        </div>
      </div>

      <details className="barcode-lookup-panel mt-3" onToggle={event=>{if(!event.currentTarget.open)setShowBarcodeScanner(false);}}>
        <summary><i className="bi bi-upc-scan me-2"></i>Find a product by barcode <span className="text-secondary fw-normal">(optional)</span></summary>
        <div className="barcode-lookup-body">
          <div className="small text-muted mb-2">Type a barcode or open the scanner when you need it. Your camera will only start after you choose Scan.</div>
          <div className="d-flex flex-wrap gap-2">
            <input className="form-control flex-grow-1" style={{minWidth:220,maxWidth:480}} placeholder="Enter barcode and press Enter" onKeyDown={event=>{
              if(event.key!=="Enter")return;
              event.preventDefault();
              const code=event.currentTarget.value.trim();
              if(!code)return;
              searchProductByBarcode(code).then(response=>{
                const product=response.data?.product;
                if(product)handleEdit(product); else setError("No product found. Check the barcode and try again.");
              }).catch(err=>setError(err.response?.data?.message||"Unable to find that barcode."));
              event.currentTarget.value="";
            }}/>
            <button type="button" className="btn btn-outline-primary" onClick={()=>setShowBarcodeScanner(value=>!value)}>
              <i className={"bi "+(showBarcodeScanner?"bi-camera-video-off":"bi-camera-video")+" me-1"}></i>{showBarcodeScanner?"Stop scanner":"Scan barcode"}
            </button>
          </div>
          {showBarcodeScanner&&<div id="product-barcode-reader" className="barcode-reader mt-3"></div>}
        </div>
      </details>

      <FormConfigurator
        open={formSettingsOpen}
        onClose={()=>setFormSettingsOpen(false)}
        title="Customize Product Form"
        subtitle="Arrange product fields, add your own fields, set rules, defaults and calculations."
        fields={productFormConfig.fields}
        saving={productFormConfig.saving}
        onSave={productFormConfig.save}
        onReset={async()=>{
          const defaults=await productFormConfig.reset();
          productFormConfig.setFields(defaults);
          setFormSettingsOpen(false);
          resetProduct();
        }}
      />
    </div>
  );
}
