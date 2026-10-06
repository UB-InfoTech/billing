import {useEffect,useMemo,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const authConfig=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

export function useNoCodeDataSources(resources=[]){
  const requested=useMemo(()=>Array.from(new Set((resources||[]).filter(Boolean))),[JSON.stringify(resources||[])]);
  const [records,setRecords]=useState({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    if(!requested.length){setRecords({});setLoading(false);return;}
    (async()=>{
      try{
        setLoading(true);setError("");
        const entries=await Promise.all(requested.map(async resource=>{
          const response=await axios.get(apiBase+"/api/no-code-data/"+encodeURIComponent(resource),{...authConfig(),params:{limit:200}});
          return [resource,response.data?.records||[]];
        }));
        if(!cancelled)setRecords(Object.fromEntries(entries));
      }catch(fetchError){
        if(!cancelled)setError(fetchError.response?.data?.message||"Unable to load linked data.");
      }finally{
        if(!cancelled)setLoading(false);
      }
    })();
    return()=>{cancelled=true;};
  },[requested]);

  return {records,loading,error};
}

export default useNoCodeDataSources;
