const DEFAULT_DEAL_STAGES=[
 {key:"new-enquiry",label:"New enquiry",probability:10,order:0,outcome:"open"},
 {key:"contacted",label:"Contacted",probability:20,order:1,outcome:"open"},
 {key:"qualified",label:"Qualified",probability:40,order:2,outcome:"open"},
 {key:"proposal-sent",label:"Quote sent",probability:60,order:3,outcome:"open"},
 {key:"negotiation",label:"Negotiation",probability:80,order:4,outcome:"open"},
 {key:"won",label:"Won",probability:100,order:5,outcome:"won"},
 {key:"lost",label:"Lost",probability:0,order:6,outcome:"lost"}
];

function createStageKey(label,index){
 const base=String(label||"stage").toLowerCase().normalize("NFKD")
  .replace(/[\\u0300-\\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-|-$/g,"")
  .slice(0,32)||"stage";
 return base+"-"+(index+1);
}

function normalizeOpenStages(input){
 if(!Array.isArray(input))throw new Error("Choose at least two sales stages.");
 if(input.length<2)throw new Error("A sales pipeline needs at least two open stages.");
 if(input.length>12)throw new Error("Keep the pipeline to 12 open stages or fewer so it stays easy to use.");
 const seenKeys=new Set(),seenLabels=new Set();
 const stages=input.map((item,index)=>{
  const label=String(item?.label||"").trim().replace(/\\s+/g," ");
  if(!label||label.length>48)throw new Error("Each stage needs a name of 1 to 48 characters.");
  const normalized=label.toLocaleLowerCase();
  if(seenLabels.has(normalized))throw new Error("Stage names must be unique.");
  seenLabels.add(normalized);
  let key=String(item?.key||createStageKey(label,index)).trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(key)||["won","lost"].includes(key))key=createStageKey(label,index);
  if(seenKeys.has(key))key=createStageKey(label,index);
  if(seenKeys.has(key))throw new Error("Stage names must produce unique stage identifiers.");
  seenKeys.add(key);
  const probability=Number(item?.probability);
  if(!Number.isFinite(probability)||probability<0||probability>100)throw new Error("Stage probability must be between 0 and 100.");
  return {key,label,probability:Math.round(probability),order:index,outcome:"open"};
 });
 return [
  ...stages,
  {key:"won",label:"Won",probability:100,order:stages.length,outcome:"won"},
  {key:"lost",label:"Lost",probability:0,order:stages.length+1,outcome:"lost"}
 ];
}

function dealAttentionRank(deal,now=new Date()){
 if(deal?.status!=="open")return 4;
 if(!deal?.nextActionAt)return 2;
 const due=new Date(deal.nextActionAt);
 if(Number.isNaN(due.getTime()))return 2;
 if(due<now)return 0;
 const endOfToday=new Date(now);
 endOfToday.setHours(23,59,59,999);
 if(due<=endOfToday)return 1;
 return 3;
}

module.exports={DEFAULT_DEAL_STAGES,normalizeOpenStages,dealAttentionRank};
