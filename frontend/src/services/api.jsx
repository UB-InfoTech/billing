import axios from "axios";

const BASE_URL=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export const getExpenses=(params={})=>axios.get(BASE_URL+"/api/expenses",{...auth(),params});
export const getExpenseById=(id)=>axios.get(BASE_URL+"/api/expenses/"+id,auth());
export const createExpense=(data)=>axios.post(BASE_URL+"/api/expenses",data,auth());
export const updateExpense=(id,data)=>axios.put(BASE_URL+"/api/expenses/"+id,data,auth());
export const deleteExpense=(id)=>axios.delete(BASE_URL+"/api/expenses/"+id,auth());
export const getExpenseSummary=(params={})=>axios.get(BASE_URL+"/api/expenses/summary",{...auth(),params});
export const getExpenseOptions=()=>axios.get(BASE_URL+"/api/expenses/linked/options",auth());

export const uploadReceipt=async(file)=>{
  const formData=new FormData();
  formData.append("receipt",file);
  const response=await axios.post(BASE_URL+"/api/expenses/upload-receipt",formData,{
    ...auth(),
    headers:{...auth().headers,"Content-Type":"multipart/form-data"}
  });
  return response.data;
};

/**
 * Open an expense receipt with an authenticated API request. Receipt files
 * are not served through the public /uploads static path anymore.
 */
export const openExpenseReceipt=async(value)=>{
  const receipt=String(value||"").trim();
  if(!receipt)throw new Error("No receipt has been attached.");

  let pathname=receipt;
  const isAbsoluteHttp=receipt.toLowerCase().startsWith("http://")||receipt.toLowerCase().startsWith("https://");
  if(isAbsoluteHttp){
    let parsed;
    try{parsed=new URL(receipt);}catch{throw new Error("This receipt link is invalid.");}
    const apiOrigin=new URL(BASE_URL||window.location.origin,window.location.origin).origin;
    const isExpenseUpload=parsed.pathname.toLowerCase().includes("/uploads/expenses/");
    if(parsed.origin!==apiOrigin||!isExpenseUpload){
      const externalWindow=window.open(receipt,"_blank","noopener,noreferrer");
      if(!externalWindow)throw new Error("Please allow pop-ups to open the receipt.");
      return;
    }
    pathname=parsed.pathname;
  }

  const cleanPath=pathname.split(/[?#]/,1)[0].replace(/\\/g,"/");
  const match=cleanPath.match(/(?:^|\\/)uploads\\/expenses\\/([^/]+)$/i);
  const filename=match?.[1]||(!cleanPath.includes("/")&&!cleanPath.includes(":")?cleanPath:"");
  if(!/^[A-Za-z0-9_-]+\\.(?:jpe?g|png|gif|webp|pdf)$/i.test(filename)){
    throw new Error("This receipt file path is invalid.");
  }

  // Create the tab during the original click gesture so browser popup blockers
  // do not suppress it while the authenticated request is in flight.
  const receiptWindow=window.open("about:blank","_blank");
  if(!receiptWindow)throw new Error("Please allow pop-ups to open the receipt.");

  try{
    const response=await axios.get(
      BASE_URL+"/api/expenses/receipt/"+encodeURIComponent(filename),
      {...auth(),responseType:"blob"}
    );
    const objectUrl=URL.createObjectURL(response.data);
    receiptWindow.location.href=objectUrl;
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),120000);
  }catch(error){
    receiptWindow.close();
    throw error;
  }
};

export const getApiBase=()=>BASE_URL;
