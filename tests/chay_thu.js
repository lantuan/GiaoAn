// Chạy thử chuỗi node 08 → 09 → 11 trên máy Mac (không cần n8n):
// osascript -l JavaScript tests/chay_thu.js <file.tex> <lớp> <bài> <file_ra.tex> ["chú thích Telegram"]
ObjC.import('Foundation');
function rd(p){return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p,4,null));}
function wr(p,s){$.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(p,true,4,null);}
function run(argv){
 const G='/Users/mailan/Desktop/GiaoAn/', tex=rd(argv[0]), lop=argv[1], bai=argv[2];
 const dir=`/Users/mailan/Desktop/NganHangDe_Lan/web/NganHangDe/data/curriculum/toan${lop}/`;
 let all=[];for(let c=1;c<=12;c++){const s=rd(dir+`L${lop}_C${c}.json`); if(s) all=all.concat(JSON.parse(s));}
 const rows=all.filter(x=>String(x.bai_so)===bai);
 const yccd=rows.map(x=>({id:x.id,MucDo:x.MucDo,content:x.content,scope:x.scope}));
 const out={'04_LAY_YCCD':{chat_id:1,message_id:1,file_name:argv[0].split('/').pop(),request:{grade:lop},lesson:{bai_so:bai,bai:rows[0]&&rows[0].bai,so_tiet:2,tuan:'?'},yccd},'07_DOC_TEX':{giao_an_tex:tex}};
 if(argv[4]){const r3=new Function('$json',rd(G+'n8n/03_PHAN_TICH_YEU_CAU.js'))({text:argv[4],file_name:out['04_LAY_YCCD'].file_name}); out['04_LAY_YCCD'].request={...r3.json.request,grade:lop};}
 const st={}, $$=n=>({first:()=>({json:out[n]})});
 const helpers={httpRequest:o=>o.url.includes('nls_nc1')?JSON.parse(rd(G+'data/nang_luc_so/nls_nc1.json')):{data:[{id:'google/gemma-4-31b-it:free'}]},
   prepareBinaryData:(b,f,m)=>({fileName:f,_s:b._s})};
 const Buf={from:s=>({length:s.length,_s:s})};
 const mk=code=>new Function('$input','$','$getWorkflowStaticData','Buffer',code.replace(/await /g,''));
 const step=(f,inp)=>mk(rd(G+'n8n/'+f)).call({helpers},{first:()=>({json:inp})},$$,()=>st,Buf)[0];
 try{
  out['08']=step('08_KIEM_TRA_5512.js',{giao_an_tex:tex}).json;
  out['09_CHUAN_BI_AI']=step('09_CHUAN_BI_AI.js',out['08']).json;
  const r=step('11_GHEP_VA_SUA.js',JSON.parse(rd(G+'tests/fake_ai.json')));
  if(argv[3]) wr(argv[3],r.binary.data._s);
  return r.json.caption+"\n\nVIỆC GỬI AI: "+JSON.stringify(out['09_CHUAN_BI_AI'].viec).slice(0,600);
 }catch(e){return 'LỖI: '+e+' dòng '+e.line;}
}
