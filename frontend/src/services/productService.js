import axios from "axios";

const BASE_URL=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"")+"/api/products";
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export const fetchProducts=(params={})=>axios.get(BASE_URL,{...auth(),params});

/**
 * Load the full product catalogue in bounded batches. Invoice line-item
 * pickers must not silently stop at the API's default first page.
 */
export const fetchAllProducts=async(params={})=>{
  const limit=100;
  const first=await fetchProducts({...params,page:1,limit});
  const products=Array.isArray(first.data?.products)?[...first.data.products]:[];
  const pages=Math.max(1,Number(first.data?.pages)||1);

  for(let firstPage=2;firstPage<=pages;firstPage+=4){
    const pageNumbers=Array.from(
      {length:Math.min(4,pages-firstPage+1)},
      (_,index)=>firstPage+index
    );
    const responses=await Promise.all(pageNumbers.map(page=>
      fetchProducts({...params,page,limit})
    ));
    responses.forEach(response=>{
      if(Array.isArray(response.data?.products))products.push(...response.data.products);
    });
  }

  const uniqueProducts=[...new Map(products.map(product=>[String(product._id),product])).values()];
  return {
    ...first,
    data:{
      ...first.data,
      products:uniqueProducts,
      total:uniqueProducts.length,
      pages:1,
      page:1,
      limit:uniqueProducts.length
    }
  };
};

export const createProduct=(data)=>axios.post(BASE_URL,data,auth());
export const updateProduct=(id,data)=>axios.put(BASE_URL+"/"+id,data,auth());
export const deleteProduct=(id)=>axios.delete(BASE_URL+"/"+id,auth());
export const getProductById=(id)=>axios.get(BASE_URL+"/"+id,auth());
export const searchProductByBarcode=(code)=>axios.get(BASE_URL+"/barcode/"+encodeURIComponent(code),auth());
