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

export const getApiBase=()=>BASE_URL;
