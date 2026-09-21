import axios from "axios";

const BASE_URL=(import.meta.env.VITE_API_URL||"http://localhost:5000")+"/api/products";
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export const fetchProducts=(params={})=>axios.get(BASE_URL,{...auth(),params});
export const createProduct=(data)=>axios.post(BASE_URL,data,{...auth(),headers:{...auth().headers,"Content-Type":"multipart/form-data"}});
export const updateProduct=(id,data)=>axios.put(BASE_URL+"/"+id,data,{...auth(),headers:{...auth().headers,"Content-Type":"multipart/form-data"}});
export const deleteProduct=(id)=>axios.delete(BASE_URL+"/"+id,auth());
export const getProductById=(id)=>axios.get(BASE_URL+"/"+id,auth());
export const searchProductByBarcode=(code)=>axios.get(BASE_URL+"/barcode/"+encodeURIComponent(code),auth());
