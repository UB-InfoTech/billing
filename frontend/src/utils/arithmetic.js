const tokenize=expression=>{
  const tokens=[];const source=String(expression??"");let index=0;
  while(index<source.length){
    const char=source[index];
    if(/\s/.test(char)){index++;continue;}
    if(/[0-9.]/.test(char)){let value="";while(index<source.length&&/[0-9.]/.test(source[index]))value+=source[index++];if((value.match(/\./g)||[]).length>1)throw new Error("Invalid number.");tokens.push({type:"number",value});continue;}
    if(/[A-Za-z_]/.test(char)){let value="";while(index<source.length&&/[A-Za-z0-9_.]/.test(source[index]))value+=source[index++];tokens.push({type:"identifier",value});continue;}
    if("+-*/%()".includes(char)){tokens.push({type:"operator",value:char});index++;continue;}
    throw new Error("Unsupported character.");
  }
  return tokens;
};

export const evaluateArithmeticExpression=(expression,variables={})=>{
  if(expression===null||expression===undefined||String(expression).trim()==="")return 0;
  const tokens=tokenize(expression);let position=0;
  const peek=()=>tokens[position];const consume=()=>tokens[position++];
  const parsePrimary=()=>{
    const token=peek();if(!token)throw new Error("Unexpected end.");
    if(token.value==="+"||token.value==="-"){consume();const value=parsePrimary();return token.value==="-"?-value:value;}
    if(token.value==="("){consume();const value=parseAdditive();if(peek()?.value!==")")throw new Error("Missing closing parenthesis.");consume();return value;}
    consume();
    if(token.type==="number")return Number(token.value);
    if(token.type==="identifier"){const number=Number(variables[token.value]??0);if(!Number.isFinite(number))throw new Error("Invalid variable.");return number;}
    throw new Error("Invalid expression.");
  };
  const parseMultiplicative=()=>{let value=parsePrimary();while(peek()&&["*","/","%"].includes(peek().value)){const operator=consume().value;const right=parsePrimary();if(operator==="*")value*=right;if(operator==="/"){if(right===0)throw new Error("Divide by zero.");value/=right;}if(operator==="%"){if(right===0)throw new Error("Divide by zero.");value%=right;}}return value;};
  const parseAdditive=()=>{let value=parseMultiplicative();while(peek()&&["+","-"].includes(peek().value)){const operator=consume().value;const right=parseMultiplicative();value=operator==="+"?value+right:value-right;}return value;};
  const result=parseAdditive();if(position!==tokens.length)throw new Error("Invalid expression.");if(!Number.isFinite(result))throw new Error("Expression is not finite.");
  return Math.round((result+Number.EPSILON)*1000000)/1000000;
};