const fs=require('fs');
const lines=fs.readFileSync('app.pretty.js','utf8').split('\n');
// extract a `key: "NAME", value: function(){...}` method starting at line (1-based)
function extract(startLine){
  let txt=lines.slice(startLine-1, startLine+20000).join('\n');
  const i=txt.indexOf('function()');
  let depth=0,j=txt.indexOf('{',i),k=j;
  for(;k<txt.length;k++){const c=txt[k]; if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0)break;}}
  return eval('('+txt.slice(i,k+1)+')')();
}
module.exports={extract,lines};
if(require.main===module){
  const [,,line,out]=process.argv;
  const r=extract(+line); fs.writeFileSync(out,JSON.stringify(r,null,1)); console.log('ok',Array.isArray(r)?r.length:typeof r);
}
