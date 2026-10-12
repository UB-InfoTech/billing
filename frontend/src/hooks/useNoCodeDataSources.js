import {useCallback,useEffect,useMemo,useState} from "react";
import axios from "axios";

const apiBase=(import.meta.env.VITE_API_URL||"http://localhost:5000").replace(/\/$/,"");
const authConfig=()=>({headers:{"x-auth-token":localStorage.getItem("token")||""}});

const mergeRecords=(existing=[],incoming=[])=>{
  const byId=new Map();
  [...existing,...incoming].forEach(record=>{
    const key=String(record?._id??record?.id??"");
    if(key)byId.set(key,record);
  });
  return [...byId.values()];
};

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
        if(!cancelled){
          setRecords(previous=>{
            const next={...previous};
            entries.forEach(([resource,items])=>{
              next[resource]=mergeRecords(next[resource]||[],items);
            });
            return next;
          });
        }
      }catch(fetchError){
        if(!cancelled)setError(fetchError.response?.data?.message||"Unable to load linked data.");
      }finally{
        if(!cancelled)setLoading(false);
      }
    })();
    return()=>{cancelled=true;};
  },[requested]);

  const searchRecords=useCallback(async(resource,query="",searchField="",ids=[])=>{
    if(!resource)return [];
    const params={limit:200};
    const normalizedQuery=String(query||"").trim();
    if(normalizedQuery)params.q=normalizedQuery;
    if(searchField)params.searchField=searchField;
    if(Array.isArray(ids)&&ids.length)params.ids=ids.map(String).filter(Boolean).slice(0,50).join(",");

    try{
      const response=await axios.get(
        apiBase+"/api/no-code-data/"+encodeURIComponent(resource),
        {...authConfig(),params}
      );
      const matches=Array.isArray(response.data?.records)?response.data.records:[];
      setRecords(previous=>({...previous,[resource]:mergeRecords(previous[resource]||[],matches)}));
      setError("");
      return matches;
    }catch(searchError){
      setError(searchError.response?.data?.message||"Unable to search linked records.");
      throw searchError;
    }
  },[]);

  return {records,loading,error,searchRecords};
}

export default useNoCodeDataSources;
