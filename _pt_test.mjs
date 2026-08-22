import JSZip from "jszip";
import fs from "fs";
const TEXT_PART=/\.(xml|rels)$/i;
const bomEnc=b=>b.length>=2&&b[0]===0xfe&&b[1]===0xff?"utf-16be":b.length>=2&&b[0]===0xff&&b[1]===0xfe?"utf-16le":null;
function dec(bytes,enc){const body=bytes.subarray(2);if(enc==="utf-16le")return new TextDecoder("utf-16le").decode(body);const s=new Uint8Array(body.length);for(let i=0;i+1<body.length;i+=2){s[i]=body[i+1];s[i+1]=body[i];}return new TextDecoder("utf-16le").decode(s);}
for(const f of process.argv.slice(2)){const orig=fs.readFileSync(f);
const zip=await JSZip.loadAsync(orig);const out=new JSZip();const parts=[];let enc=null;
for(const name of Object.keys(zip.files)){const e=zip.files[name];if(e.dir)continue;const raw=await e.async("uint8array");let data=raw;
if(TEXT_PART.test(name)){const g=bomEnc(raw);if(g){data=new TextEncoder().encode(dec(raw,g).replace(/encoding\s*=\s*"UTF-16(?:BE|LE)?"/i,'encoding="utf-8"'));parts.push(name);enc=g;}}
out.file(name,data);}
console.log(f,"parts:",parts.length,enc,parts.slice(0,8));
const u=await out.generateAsync({type:"uint8array"});
fs.writeFileSync("/tmp/pt/"+f.split("/").pop(),u);}
