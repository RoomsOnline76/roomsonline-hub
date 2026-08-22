import JSZip from "jszip";
import * as XLSX from "xlsx";
import fs from "fs";
const TEXT_PART=/\.(xml|rels)$/i;
const bomEnc=b=>b.length>=2&&b[0]===0xfe&&b[1]===0xff?"utf-16be":b.length>=2&&b[0]===0xff&&b[1]===0xfe?"utf-16le":null;
function dec(bytes,enc){const body=bytes.subarray(2);if(enc==="utf-16le")return new TextDecoder("utf-16le").decode(body);const s=new Uint8Array(body.length);for(let i=0;i+1<body.length;i+=2){s[i]=body[i+1];s[i+1]=body[i];}return new TextDecoder("utf-16le").decode(s);}
async function repair(buf){const zip=await JSZip.loadAsync(buf);const out=new JSZip();const parts=[];let enc=null;
for(const name of Object.keys(zip.files)){const e=zip.files[name];if(e.dir)continue;const raw=await e.async("uint8array");let data=raw;
if(TEXT_PART.test(name)){const f=bomEnc(raw);if(f){data=new TextEncoder().encode(dec(raw,f).replace(/encoding\s*=\s*"UTF-16(?:BE|LE)?"/i,'encoding="utf-8"'));parts.push(name);enc=f;}}
out.file(name,data);}
if(!parts.length)return{buf,parts,enc};
const u=await out.generateAsync({type:"uint8array"});return{buf:u.buffer.slice(u.byteOffset,u.byteOffset+u.byteLength),parts,enc};}
for(const f of process.argv.slice(2)){const orig=fs.readFileSync(f);
try{XLSX.read(new Uint8Array(orig),{type:"array"});console.log("raw ok",f);}catch(e){console.log("raw FAIL",f,String(e).slice(0,80));}
const r=await repair(orig.buffer.slice(orig.byteOffset,orig.byteOffset+orig.byteLength));
console.log("repaired parts",r.parts.length,r.enc);
const wb=XLSX.read(new Uint8Array(r.buf),{type:"array"});
console.log("sheets",wb.SheetNames);
const g=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:""});
console.log("rows",g.length);console.log(JSON.stringify(g.slice(0,8)));}
