import {useCallback,useEffect,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const auth=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export function useSoftwareConfiguration(){
  const [configuration,setConfiguration]=useState(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    try{
      setLoading(true);
      const response=await axios.get(apiBase+"/api/software-config",auth());
      setConfiguration(response.data);
      setError("");
    }catch(loadError){
      setError(loadError.response?.data?.message||"Unable to load software settings.");
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const save=useCallback(async(next)=>{
    try{
      setSaving(true);
      const response=await axios.put(apiBase+"/api/software-config",next,auth());
      setConfiguration(response.data);
      return response.data;
    }catch(saveError){
      setError(saveError.response?.data?.message||"Unable to save software settings.");
      throw saveError;
    }finally{setSaving(false);}
  },[]);

  const reset=useCallback(async()=>{
    try{
      setSaving(true);
      const response=await axios.post(apiBase+"/api/software-config/reset",{},auth());
      setConfiguration(response.data);
      return response.data;
    }catch(resetError){
      setError(resetError.response?.data?.message||"Unable to reset software settings.");
      throw resetError;
    }finally{setSaving(false);}
  },[]);

  return {configuration,loading,saving,error,setError,load,save,reset};
}
