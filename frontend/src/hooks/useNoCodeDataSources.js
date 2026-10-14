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

export const normalizeRequestedResources=(resources=[])=>Array.from(new Set(
  (Array.isArray(resources)?resources:[])
    .map(resource=>String(resource??"").trim())
    .filter(resource=>resource&&resource.toLowerCase()!=="none")
));

export function useNoCodeDataSources(resources=[]){
  const requested=useMemo(()=>normalizeRequestedResources(resources),[JSON.stringify(resources||[])]);
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
          try{
            const response=await axios.get(apiBase+"/api/no-code-data/"+encodeURIComponent(resource),{...authConfig(),params:{limit:200}});
            return {resource,items:Array.isArray(response.data?.records)?response.data.records:[],error:""};
          }catch(fetchError){
            return {
              resource,
              items:null,
              error:fetchError.response?.data?.message||`Unable to load ${resource} records.`
            };
          }
        }));
        if(!cancelled){
          setRecords(previous=>{
            const next={...previous};
            entries.forEach(({resource,items})=>{
              // One unavailable source should not suppress usable customer,
              // product or invoice choices from the other lookup lists.
              if(items!==null)next[resource]=mergeRecords(previous[resource]||[],items);
            });
            return next;
          });
          const failed=entries.find(entry=>entry.error);
          setError(failed?.error||"");
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
    const resourceKey=String(resource??"").trim();
    if(!resourceKey||resourceKey.toLowerCase()==="none")return [];
    const params={limit:200};
    const normalizedQuery=String(query||"").trim();
    if(normalizedQuery)params.q=normalizedQuery;
    if(searchField)params.searchField=searchField;
    if(Array.isArray(ids)&&ids.length)params.ids=ids.map(String).filter(Boolean).slice(0,50).join(",");

    try{
      const response=await axios.get(
        apiBase+"/api/no-code-data/"+encodeURIComponent(resourceKey),
        {...authConfig(),params}
      );
      const matches=Array.isArray(response.data?.records)?response.data.records:[];
      setRecords(previous=>({...previous,[resourceKey]:mergeRecords(previous[resourceKey]||[],matches)}));
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
