const FormConfiguration=require("../models/FormConfiguration");

const tokenize=expression=>{
  const source=String(expression??"");
  if(source.length>500)throw new Error("Calculation is too long.");
  const tokens=[];
  let index=0;
  while(index<source.length){
    const char=source[index];
    if(/\s/.test(char)){index+=1;continue;}
    if(/[0-9.]/.test(char)){
      let raw="";
      while(index<source.length&&/[0-9.]/.test(source[index]))raw+=source[index++];
      const number=Number(raw);
      if(!raw||!Number.isFinite(number))throw new Error("Invalid number in calculation.");
      tokens.push({type:"number",value:number});
      continue;
    }
    if(/[A-Za-z_]/.test(char)){
      let value="";
      while(index<source.length&&/[A-Za-z0-9_.]/.test(source[index]))value+=source[index++];
      tokens.push({type:"identifier",value});
      continue;
    }
    if("+-*/%()".includes(char)){
      tokens.push({type:"operator",value:char});
      index+=1;
      continue;
    }
    throw new Error("Unsupported character in calculation.");
  }
  if(tokens.length>200)throw new Error("Calculation contains too many parts.");
  return tokens;
};

const evaluateArithmeticExpression=(expression,variables={})=>{
  if(expression===null||expression===undefined||String(expression).trim()==="")return 0;
  const tokens=tokenize(expression);
  let position=0;
  const peek=()=>tokens[position];
  const consume=()=>tokens[position++];
  const parsePrimary=depth=>{
    if(depth>100)throw new Error("Calculation is nested too deeply.");
    const token=peek();
    if(!token)throw new Error("Calculation is incomplete.");
    if(token.value==="+"||token.value==="-"){
      consume();
      const value=parsePrimary(depth+1);
      return token.value==="-"?-value:value;
    }
    if(token.value==="("){
      consume();
      const value=parseAdditive(depth+1);
      if(peek()?.value!==")")throw new Error("Calculation is missing a closing bracket.");
      consume();
      return value;
    }
    consume();
    if(token.type==="number")return token.value;
    if(token.type==="identifier"){
      const raw=Object.prototype.hasOwnProperty.call(variables,token.value)
        ?variables[token.value]
        :0;
      const number=Number(raw??0);
      if(!Number.isFinite(number))throw new Error("A value used in this calculation is not a valid number.");
      return number;
    }
    throw new Error("Calculation contains an invalid value.");
  };
  const parseMultiplicative=depth=>{
    let value=parsePrimary(depth);
    while(peek()&&["*","/","%"].includes(peek().value)){
      const operator=consume().value;
      const right=parsePrimary(depth);
      if((operator==="/"||operator==="%")&&right===0)throw new Error("Cannot divide by zero.");
      if(operator==="*")value*=right;
      if(operator==="/")value/=right;
      if(operator==="%")value%=right;
    }
    return value;
  };
  const parseAdditive=depth=>{
    let value=parseMultiplicative(depth);
    while(peek()&&["+","-"].includes(peek().value)){
      const operator=consume().value;
      const right=parseMultiplicative(depth);
      value=operator==="+"?value+right:value-right;
    }
    return value;
  };
  const result=parseAdditive(0);
  if(position!==tokens.length)throw new Error("Calculation contains an unexpected value.");
  if(!Number.isFinite(result))throw new Error("Calculation did not produce a valid number.");
  return Math.round((result+Number.EPSILON)*1000000)/1000000;
};

const toPlainObject=value=>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  if(value instanceof Map)return Object.fromEntries(value.entries());
  if(typeof value.toObject==="function")return value.toObject();
  return {...value};
};

const calculateConfiguredCustomFields=(fields,recordValues={},customFields={})=>{
  const result=toPlainObject(customFields);
  const formulas=(Array.isArray(fields)?fields:[]).filter(field=>
    field?.custom===true
    &&String(field.formula||"").trim()
    &&["number","currency"].includes(field.fieldType)
  );
  if(!formulas.length)return result;

  const values={...(recordValues||{}),...result};
  for(let pass=0;pass<formulas.length;pass+=1){
    let changed=false;
    for(const field of formulas){
      let calculated;
      try{
        calculated=evaluateArithmeticExpression(field.formula,values);
      }catch(error){
        throw new Error(`Unable to calculate “${field.label||"a custom field"}”. Check the numbers used in this calculation.`);
      }
      if(result[field.key]!==calculated)changed=true;
      result[field.key]=calculated;
      values[field.key]=calculated;
    }
    if(!changed)break;
  }
  return result;
};

const loadConfiguredFormFields=async(ownerId,formKey)=>{
  if(!ownerId||!formKey)return [];
  const config=await FormConfiguration.findOne({createdBy:ownerId,formKey})
    .select("fields")
    .lean();
  return Array.isArray(config?.fields)?config.fields:[];
};

module.exports={
  tokenize,
  evaluateArithmeticExpression,
  calculateConfiguredCustomFields,
  loadConfiguredFormFields
};
