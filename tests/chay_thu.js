// Chạy thử chuỗi node 08 → 09 → 11 trên máy Mac (không cần n8n):
// osascript -l JavaScript tests/chay_thu.js <file.tex | thư mục bài (giả lập gửi .zip)> <lớp> <bài> <file_ra.tex> ["chú thích Telegram"] [file_ghi_yeu_cau_AI.txt]
ObjC.import('Foundation');
function rd(p){return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p,4,null));}
function wr(p,s){$.NSString.alloc.initWithUTF8String(s).writeToFileAtomicallyEncodingError(p,true,4,null);}
function run(argv){
 const G='/Users/mailan/Desktop/GiaoAn/', lop=argv[1], bai=argv[2];
 const fm=$.NSFileManager.defaultManager, isDir=Ref();
 fm.fileExistsAtPathIsDirectory(argv[0],isDir);
 let tex, zipBin=null;
 if(isDir[0]){ // giả lập node 07B: giải nén cả thư mục bài (đệ quy) thành file_0, file_1…
   zipBin={}; let i=0;
   const en=fm.enumeratorAtPath(argv[0]); let f;
   while((f=en.nextObject).js){ const rel=f.js, full=argv[0]+'/'+rel; const d=Ref(); fm.fileExistsAtPathIsDirectory(full,d); if(d[0]) continue;
     const parts=rel.split('/'); zipBin['file_'+(i++)]={fileName:parts.pop(),directory:parts.join('/'),_p:full}; }
 } else tex=rd(argv[0]);
 const dir=`/Users/mailan/Desktop/NganHangDe_Lan/web/NganHangDe/data/curriculum/toan${lop}/`;
 let all=[];for(let c=1;c<=12;c++){const s=rd(dir+`L${lop}_C${c}.json`); if(s) all=all.concat(JSON.parse(s));}
 const rows=all.filter(x=>String(x.bai_so)===bai);
 const yccd=rows.map(x=>({id:x.id,MucDo:x.MucDo,content:x.content,scope:x.scope}));
 const out={'04_LAY_YCCD':{chat_id:1,message_id:1,file_name:argv[0].split('/').pop()+(zipBin?'.zip':''),request:{grade:lop},lesson:{bai_so:bai,bai:rows[0]&&rows[0].bai,so_tiet:2,tuan:'?'},yccd},'07_DOC_TEX':{giao_an_tex:tex}};
 const st={}, $$=n=>({first:()=>({json:out[n]})});
 const helpers={httpRequest:o=>{const u=o.url;
   if(u.includes('nls_nc1')) return JSON.parse(rd(G+'data/nang_luc_so/nls_nc1.json'));
   if(u.includes('ppct_2026_2027/')||u.includes('ppct_hien_hanh/')||u.includes('nang_luc_ai/')) return JSON.parse(rd(G+'data/'+u.split('/data/')[1]));
   if(u.includes('/curriculum/')){const t=rd('/Users/mailan/Desktop/NganHangDe_Lan/web/NganHangDe/data/'+u.split('/data/')[1]); if(!t) throw new Error('404'); return JSON.parse(t);}
   if(u.includes('er-api')) return {result:'success',rates:{VND:25692.44}};   // tỷ giá giả lập
   return {data:[{id:'google/gemma-4-31b-it:free'}]};},
   prepareBinaryData:(b,f,m)=>({fileName:f,_s:b._s})};
 const Buf={from:s=>({length:s.length,_s:s})};
 const mk=code=>new Function('$input','$','$getWorkflowStaticData','Buffer',code.replace(/await /g,'').replace(/async /g,''));
 const step=(f,inp)=>mk(rd(G+'n8n/'+f)).call({helpers},{first:()=>({json:inp})},$$,()=>st,Buf)[0];
 if(bai==='-'){ // chạy THẬT node 03 + 04 (tìm bài trong PPCT theo chú thích + tên file)
   const r3=new Function('$json',rd(G+'n8n/03_PHAN_TICH_YEU_CAU.js'))({text:argv[4]||'',file_name:out['04_LAY_YCCD'].file_name,input_type:'document'});
   out['04_LAY_YCCD']=mk(rd(G+'n8n/04_LAY_YCCD.js')).call({helpers},{first:()=>({json:{chat_id:1,message_id:1,file_name:out['04_LAY_YCCD'].file_name,...r3.json}})},$$,()=>st,Buf)[0].json;
   if(!out['04_LAY_YCCD'].ok) return 'NODE 04: '+out['04_LAY_YCCD'].error_message;
 } else if(argv[4]){const r3=new Function('$json',rd(G+'n8n/03_PHAN_TICH_YEU_CAU.js'))({text:argv[4],file_name:out['04_LAY_YCCD'].file_name}); out['04_LAY_YCCD'].request={...r3.json.request,grade:lop};}
 try{
  if(zipBin){
   const h2={...helpers,getBinaryDataBuffer:(n,k)=>({toString:enc=>enc==='base64'?ObjC.unwrap($.NSData.dataWithContentsOfFile(zipBin[k]._p).base64EncodedStringWithOptions(0)):rd(zipBin[k]._p)})};
   const r7=mk(rd(G+'n8n/07C_LAY_TEX_TU_ZIP.js')).call({helpers:h2},{first:()=>({json:{},binary:zipBin})},$$,()=>st,Buf)[0];
   out['07C_LAY_TEX_TU_ZIP']=r7.json; tex=r7.json.giao_an_tex; out['07_DOC_TEX']=undefined;
  }
  out['08']=step('08_KIEM_TRA_5512.js',{giao_an_tex:tex}).json;
  out['09_CHUAN_BI_AI']=step('09_CHUAN_BI_AI.js',out['08']).json;
  if(argv[5]) wr(argv[5],out['09_CHUAN_BI_AI'].ai_body.messages.map(m=>m.content).join('\n\n=====\n\n'));  // xem yêu cầu gửi AI
  const r=step('11_GHEP_VA_SUA.js',JSON.parse(rd(G+(out['09_CHUAN_BI_AI'].soan_moi?'tests/fake_ai_soan.json':'tests/fake_ai.json'))));
  if(argv[3]) wr(argv[3],r.binary.data._s);
  if(argv[5]) wr(argv[5]+'.word.json',JSON.stringify(r.json.them_word,null,1));   // danh sách chèn vào Word gốc
  return 'BINARY: '+r.json.ds_binary+' | zip: '+r.json.zip_name+'\n'+r.json.caption+"\n\nVIỆC GỬI AI: "+JSON.stringify(out['09_CHUAN_BI_AI'].viec).slice(0,600);
 }catch(e){return 'LỖI: '+e+' dòng '+e.line;}
}
