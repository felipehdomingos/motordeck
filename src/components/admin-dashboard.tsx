'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Camera, CarFront, Check, ChevronRight, ClipboardList, FileImage, Save, Trash2, WandSparkles } from 'lucide-react';
import type { LocalVehicle } from '@/lib/local-vehicles';
import { money } from '@/lib/data';
import { normalizePlate, type PlateLookup } from '@/lib/plate-lookup';

type VehicleFields = {plate:string; brand:string; model:string; version:string; manufactureYear:string; modelYear:string; transmission:string; fuel:string; fipe:string; fipeCode:string; fipeReference:string; mileage:string; price:string; color:string; type:string; notes:string; images:string[]; status:string};
const blank:VehicleFields={plate:'',brand:'',model:'',version:'',manufactureYear:'',modelYear:'',transmission:'',fuel:'',fipe:'',fipeCode:'',fipeReference:'',mileage:'',price:'',color:'',type:'',notes:'',images:[],status:'Disponível'};
function parseConsultationText(text:string): Partial<VehicleFields> {
 const t=text.replace(/\r/g,'').replace(/\u00a0/g,' ');
 const out:Partial<VehicleFields>={};
 const plate=t.match(/\b[A-Z]{3}[\s-]?[0-9][A-Z0-9][0-9]{2}\b/i); if(plate)out.plate=plate[0].replace(/[\s-]/g,'').toUpperCase();
 const years=t.match(/\b(19\d{2}|20\d{2})\s*[\/|]\s*(19\d{2}|20\d{2})\b/); if(years){out.manufactureYear=years[1];out.modelYear=years[2];}
 const identity=t.match(/(?:I\/)?(NISSAN|TOYOTA|VOLKSWAGEN|VW|CHEVROLET|GM|FIAT|HYUNDAI|HONDA|JEEP|RENAULT|FORD|CITRO[EË]N|PEUGEOT|VOLVO|BMW|AUDI|MITSUBISHI|KIA)\s+[A-Z0-9/ .-]{3,70}/i);
 if(identity){ const raw=identity[0].replace(/^I\//i,'').trim().split(/\n|\b20\d{2}\s*\/\s*20\d{2}/)[0].trim(); const pieces=raw.split(/\s+/);out.brand=pieces[0].replace(/^VW$/i,'Volkswagen').replace(/^GM$/i,'Chevrolet');out.model=pieces[1]??'';out.version=pieces.slice(2).join(' ').trim(); }
 const fipe=t.match(/R\$\s*([\d.]+,\d{2})/); if(fipe)out.fipe=String(Number(fipe[1].replace(/\./g,'').replace(',','.')));
 const code=t.match(/\b\d{6}-\d\b/);if(code)out.fipeCode=code[0];
 const reference=t.match(/(?:Ref[:.]?\s*)([a-zç]+\s*\/\s*20\d{2})/i);if(reference)out.fipeReference=reference[1];
 if(/\b(CVT|AUT\.|AUTOMATIC[AO])\b/i.test(t))out.transmission=/\bCVT\b/i.test(t)?'Automático CVT':'Automático';else if(/\bMANUAL\b|\bMT\b/i.test(t))out.transmission='Manual';
 if(/\bFLEX(?:START)?\b/i.test(t))out.fuel='Flex';
 return out;
}
function validate(items:VehicleFields){return Boolean(items.brand.trim()&&items.model.trim()&&Number(items.modelYear)>=1900&&numeric(items.price)>0&&items.images.length);}
function numeric(v:string){
 const amount=v.replace(/[^0-9.,]/g,'');
 if(amount.includes(','))return Number(amount.replace(/\./g,'').replace(',','.'))||0;
 return Number(/^\d{1,3}(\.\d{3})+$/.test(amount)?amount.replace(/\./g,''):amount)||0;
}
async function prepareImage(file:File):Promise<string> { return new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{const canvas=document.createElement('canvas');const max=1300;const ratio=Math.min(1,max/Math.max(img.width,img.height));canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72));};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Imagem inválida'));};img.src=url;});}

declare global { interface Window { Tesseract?:{recognize:(img:File,lang:string,options?:object)=>Promise<{data:{text:string}}>} } }
let ocrLoading:Promise<void>|null=null;
function loadOCR(){if(window.Tesseract)return Promise.resolve();if(!ocrLoading){ocrLoading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=()=>resolve();s.onerror=()=>reject(Error('Não foi possível carregar o leitor de imagem. Confira sua conexão.'));document.head.appendChild(s);});}return ocrLoading;}
async function vehiclesRequest<T>(init?: RequestInit, query = ''): Promise<T> {
 const response = await fetch('/api/admin/vehicles' + query, { ...init, cache: 'no-store' });
 if (!response.ok) {
   const data = await response.json().catch(() => null);
   throw new Error(data?.message || 'Não foi possível acessar o cadastro.');
 }
 return response.status === 204 ? undefined as T : response.json();
}
function saveRecord(record: LocalVehicle) {
 return vehiclesRequest<void>({
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ record }),
 });
}
export default function AdminDashboard({ environment, plateLookupEnabled }: { environment: string; plateLookupEnabled: boolean }){
 const [form,setForm]=useState<VehicleFields>(blank);const [items,setItems]=useState<LocalVehicle[]>([]);const [ocrFile,setOcrFile]=useState<File|null>(null);const [ocrPreview,setOcrPreview]=useState('');const [raw,setRaw]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [editing,setEditing]=useState<string|null>(null);
 const [plateLookup,setPlateLookup]=useState<PlateLookup|null>(null);
 const [plateMessage,setPlateMessage]=useState('');
 const newSlug = useRef<string | null>(null);
 useEffect(()=>{
   let active = true;
   vehiclesRequest<LocalVehicle[]>()
     .then(records=>{ if (active) setItems(records); })
     .catch(error=>{ if (active) setMessage(error.message); });
   return ()=>{ active = false; };
 },[]);
 function patch(k:keyof VehicleFields,v:VehicleFields[keyof VehicleFields]){setForm(f=>({...f,[k]:v}));}
 function changePlate(value: string) {
   const normalized = normalizePlate(value).replace(/[^A-Z0-9]/g, '').slice(0, 7);
   const formatted = /^[A-Z]{3}[0-9]{4}$/.test(normalized) ? normalized.replace(/^(.{3})/, '$1-') : normalized;
   patch('plate', formatted);
   setPlateLookup(null);
   setPlateMessage('');
 }
 async function lookupPlate() {
   if (busy) return;
   setBusy(true);
   setPlateLookup(null);
   setPlateMessage('Consultando a placa...');
   try {
     const response = await fetch('/api/admin/plate-lookup', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ plate: form.plate }),
     });
     const data = await response.json().catch(() => null);
     if (!response.ok || !data) throw new Error(data?.message || 'Não foi possível consultar a placa.');
     const { versions, fipe, fipeCode, fipeText, ...vehicle } = data as PlateLookup;
     setForm(current => ({
       ...current,
       ...vehicle,
       fipe: fipe === null ? '' : String(fipe ?? '').replace('.', ','),
       fipeCode: fipe === null ? '' : fipeCode,
     }));
     setPlateLookup(data);
     const resultMessage = fipe === null && versions.length
       ? 'Confira os dados e selecione a versão FIPE.'
       : fipe === null ? 'Confira os dados disponíveis. A FIPE não foi encontrada.' : `FIPE${data.fipeReference ? ' de '+data.fipeReference : ''}: ${fipeText || money(fipe)}. Confira os dados.`;
     setPlateMessage(resultMessage);
   } catch (error) {
     setPlateMessage(error instanceof Error ? error.message : 'Não foi possível consultar a placa.');
   } finally {
     setBusy(false);
   }
 }
 function chooseFipeVersion(code: string) {
   const version = plateLookup?.versions.find(option => option.code === code);
   setForm(current => ({
     ...current,
     version: version?.label ?? plateLookup?.version ?? current.version,
     fipeCode: version?.code ?? '',
     fipe: String(version?.value ?? '').replace('.', ','),
   }));
 }
 function extracted(txt:string){setPlateLookup(null);setPlateMessage('');setRaw(txt);const data=parseConsultationText(txt);setForm(f=>({...f,...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined&&v!==''))}));setMessage('Campos encontrados preenchidos. Confira a versão, o ano e o valor antes de salvar.');}
 async function chooseScreenshot(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;setOcrFile(file);setOcrPreview(URL.createObjectURL(file));setMessage('Captura carregada. Clique em “Ler captura”.');}
 async function runOCR(){if(!ocrFile)return;setBusy(true);setMessage('Lendo a captura...');try{await loadOCR();const result=await window.Tesseract!.recognize(ocrFile,'por+eng');extracted(result.data.text);if(!result.data.text.trim())setMessage('Não encontrei texto legível. Use o campo de texto manual abaixo.');}catch(e){setMessage(e instanceof Error?e.message:'Não foi possível ler a imagem. Digite os dados manualmente.');}finally{setBusy(false);}}
 async function addPhotos(e:ChangeEvent<HTMLInputElement>){const files=[...(e.target.files||[])];if(!files.length)return;setBusy(true);try{const result=await Promise.all(files.map(prepareImage));patch('images',[...form.images,...result].slice(0,12));setMessage(`${result.length} foto(s) adicionada(s). A primeira imagem será a capa.`);}catch{setMessage('Erro ao processar fotos. Tente arquivos JPG ou PNG menores.');}finally{setBusy(false);e.target.value='';}}
 async function persist(draft:boolean){if(!draft&&!validate(form)){setMessage('Para publicar, preencha marca, modelo, ano-modelo, preço e pelo menos uma foto.');return;}if(!form.brand||!form.model){setMessage('Informe pelo menos marca e modelo.');return;}const slug=editing||(newSlug.current ??= 'local-'+crypto.randomUUID());const record:LocalVehicle={slug,local:true,plate:form.plate,brand:form.brand,model:form.model,version:form.version||form.model,year:Number(form.modelYear)||Number(form.manufactureYear)||0,manufactureYear:Number(form.manufactureYear)||0,mileage:numeric(form.mileage),price:numeric(form.price),transmission:form.transmission||'Sob consulta',fuel:form.fuel||'Sob consulta',type:form.type,status:form.status,featured:false,images:form.images,notes:form.notes,color:form.color||'Sob consulta',fipe:numeric(form.fipe),fipeCode:form.fipeCode,fipeReference:form.fipeReference,draft,createdAt:items.find(v=>v.slug===slug)?.createdAt||new Date().toISOString()};setBusy(true);
 try {
   await saveRecord(record);
   newSlug.current = null;
   setItems(previous=>[record,...previous.filter(v=>v.slug!==slug)]);
   setPlateLookup(null);setPlateMessage('');setForm(blank);setEditing(null);setOcrFile(null);setOcrPreview('');setRaw('');
   setMessage(draft?'Rascunho salvo.':'Anúncio salvo no catálogo.');
   window.scrollTo({top:0,behavior:'smooth'});
 } catch(error) {
   setMessage(error instanceof Error?error.message:'Não foi possível salvar o veículo.');
 } finally { setBusy(false); }
 }
 function edit(v:LocalVehicle){setPlateLookup(null);setPlateMessage('');setEditing(v.slug);setForm({plate:v.plate,brand:v.brand,model:v.model,version:v.version,manufactureYear:String(v.manufactureYear||''),modelYear:String(v.year||''),transmission:v.transmission,fuel:v.fuel,fipe:String(v.fipe||''),fipeCode:v.fipeCode||'',fipeReference:v.fipeReference||'',mileage:String(v.mileage||''),price:String(v.price||''),color:v.color,type:v.type,notes:v.notes,images:v.images,status:v.status});setMessage('Editando anúncio.');}
 async function remove(slug:string){
   if(!confirm('Excluir este cadastro?'))return;
   setBusy(true);
   try {
     await vehiclesRequest<void>({method:'DELETE'},'?slug='+encodeURIComponent(slug));
     setItems(previous=>previous.filter(v=>v.slug!==slug));
     if(editing===slug){setPlateLookup(null);setPlateMessage('');setEditing(null);setForm(blank);}
     setMessage('Anúncio excluído.');
   } catch(error) {
     setMessage(error instanceof Error?error.message:'Não foi possível excluir o veículo.');
   } finally { setBusy(false); }
 }
 return <section className="container section admin-motordeck"><div className="admin-head"><div><span className="eyebrow">MotorDeck / {environment}</span><h1>Cadastro de veículos</h1><p>Consulte a placa e revise os dados antes de publicar o anúncio.</p></div><Link className="button button-outline" href="/veiculos">Ver catálogo <ChevronRight size={17}/></Link></div>
 <div className="admin-layout"><div className="admin-form-panel"><div className="admin-step"><span>01</span><div><h2>Consultar pela placa</h2></div></div>
 <label className="admin-field">Placa<input value={form.plate} maxLength={10} disabled={busy} onChange={e=>changePlate(e.target.value)}/></label>
 <div className="admin-actions"><button type="button" className="button" disabled={busy||!plateLookupEnabled||!form.plate.trim()} onClick={lookupPlate}>Consultar placa</button></div>
 {!plateLookupEnabled&&<p>Configure a chave do Placa &amp; FIPE para ativar a consulta.</p>}
 {plateMessage&&<p className="admin-message" role="status">{plateMessage}</p>}
 {plateLookup?.fipe===null&&!!plateLookup.versions.length&&<div className="admin-fields"><label className="admin-full">Versão FIPE<select value={form.fipeCode} onChange={e=>chooseFipeVersion(e.target.value)} disabled={busy}><option value="">Selecione a versão</option>{plateLookup.versions.map(option=><option key={option.code} value={option.code}>{option.label}{option.value!==null?' · '+(option.valueText || money(option.value)):''}</option>)}</select></label></div>}
 <details><summary>Importar captura ou texto da consulta</summary><div className="admin-upload"><FileImage size={29}/><label className="admin-upload-button">Escolher captura da consulta<input type="file" accept="image/*" onChange={chooseScreenshot} /></label><span>JPG, PNG ou imagem do celular</span></div>{ocrPreview&&<img className="admin-screenshot-preview" src={ocrPreview} alt="Captura da consulta selecionada"/>}<div className="admin-actions"><button type="button" className="button" disabled={!ocrFile||busy} onClick={runOCR}><WandSparkles size={18}/>{busy?'Processando...':'Ler captura'}</button></div><label className="admin-field">Ou cole o texto da consulta<textarea rows={3} placeholder="Cole aqui as informações da consulta, se preferir" value={raw} onChange={e=>setRaw(e.target.value)}/></label><button type="button" className="admin-secondary" onClick={()=>extracted(raw)} disabled={busy||!raw.trim()}>Preencher usando o texto</button></details>
 <div className="admin-step"><span>02</span><div><h2>Conferir o veículo</h2><p>Corrija qualquer dado lido incorretamente antes de publicar.</p></div></div><div className="admin-fields"><label>Marca<input value={form.brand} onChange={e=>patch('brand',e.target.value)}/></label><label>Modelo<input value={form.model} onChange={e=>patch('model',e.target.value)}/></label><label>Versão<input value={form.version} onChange={e=>patch('version',e.target.value)}/></label><label>Ano fabricação<input type="number" value={form.manufactureYear} onChange={e=>patch('manufactureYear',e.target.value)}/></label><label>Ano modelo<input type="number" value={form.modelYear} onChange={e=>patch('modelYear',e.target.value)}/></label><label>Câmbio<select value={form.transmission} onChange={e=>patch('transmission',e.target.value)}><option value="">Selecionar</option><option>Automático CVT</option><option>Automático</option><option>Manual</option><option>Automatizado</option></select></label><label>Combustível<select value={form.fuel} onChange={e=>patch('fuel',e.target.value)}><option value="">Selecionar</option><option>Flex</option><option>Gasolina</option><option>Diesel</option><option>Elétrico</option><option>Híbrido</option>{form.fuel&&!["Flex","Gasolina","Diesel","Elétrico","Híbrido"].includes(form.fuel)&&<option>{form.fuel}</option>}</select></label><label>FIPE — apenas referência (R$)<input inputMode="decimal" value={form.fipe} onChange={e=>patch('fipe',e.target.value)}/></label><label>Código FIPE<input value={form.fipeCode} onChange={e=>patch('fipeCode',e.target.value)}/></label><label className="admin-full">Referência FIPE<input value={form.fipeReference} onChange={e=>patch('fipeReference',e.target.value)}/></label></div>
 <div className="admin-step"><span>03</span><div><h2>Completar anúncio</h2><p>Dados reais do carro e fotos que você escolher.</p></div></div><div className="admin-fields"><label>Preço anunciado (R$)<input inputMode="decimal" value={form.price} onChange={e=>patch('price',e.target.value)}/></label><label>Quilometragem<input inputMode="numeric" value={form.mileage} onChange={e=>patch('mileage',e.target.value)}/></label><label>Cor<input value={form.color} onChange={e=>patch('color',e.target.value)}/></label><label>Tipo<input value={form.type} onChange={e=>patch('type',e.target.value)}/></label><label>Situação<select value={form.status} onChange={e=>patch('status',e.target.value)}><option>Disponível</option><option>Reservado</option><option>Vendido</option></select></label><label className="admin-full">Histórico, laudo, revisões e diferenciais<textarea rows={4} value={form.notes} onChange={e=>patch('notes',e.target.value)} placeholder="Ex.: único dono, manual, chave reserva, laudo aprovado..."/></label></div>
 <div className="admin-upload admin-photos"><Camera size={27}/><label className="admin-upload-button">Adicionar fotos do carro<input type="file" accept="image/*" multiple onChange={addPhotos}/></label><span>Até 12 imagens nesta demonstração. A primeira será a capa.</span></div>{form.images.length>0&&<div className="admin-image-grid">{form.images.map((src,i)=><div key={i}><img src={src} alt={`Foto ${i+1}`}/>{i===0&&<span>Capa</span>}<button type="button" title="Remover foto" onClick={()=>patch('images',form.images.filter((_,j)=>i!==j))}><Trash2 size={15}/></button>{i!==0&&<button type="button" className="admin-cover" onClick={()=>patch('images',[src,...form.images.filter((_,j)=>i!==j)])}>Usar como capa</button>}</div>)}</div>}
 <div className="admin-actions admin-bottom-actions"><button className="admin-secondary" type="button" disabled={busy} onClick={()=>persist(true)}><Save size={17}/> Salvar rascunho</button><button className="button" type="button" disabled={busy} onClick={()=>persist(false)}><Check size={18}/> Publicar no catálogo local</button></div>{message&&<p className="admin-message" role="status">{message}</p>}</div>
 <aside className="admin-side"><div className="admin-step"><span><ClipboardList size={18}/></span><div><h2>Seus veículos</h2><p>{items.length} veículo(s) cadastrados.</p></div></div>{items.length===0?<div className="admin-empty"><CarFront size={40}/><p>Nenhum carro cadastrado ainda.</p></div>:items.map(v=><div className="admin-item" key={v.slug}>{v.images[0]?<img src={v.images[0]} alt=""/>:<CarFront size={27}/>}<div><strong>{v.brand} {v.model}</strong><small>{v.version} · {v.manufactureYear}/{v.year}</small><small>{v.draft?'Rascunho':`Publicado · ${money(v.price)}`}</small><div className="admin-item-actions"><button disabled={busy} onClick={()=>edit(v)}>Editar</button><button disabled={busy} onClick={()=>remove(v.slug)}>Excluir</button>{!v.draft&&v.status!=='Vendido'&&<Link href={`/veiculos/novo/${v.slug}`}>Visualizar</Link>}</div></div></div>)}</aside></div></section>;
}
