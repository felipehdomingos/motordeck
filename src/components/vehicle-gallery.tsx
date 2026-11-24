"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, Expand, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export function VehicleGallery({images,label}:{images:string[];label:string}) {
  const [selected,setSelected]=useState(0);
  const [open,setOpen]=useState(false);
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState({x:0,y:0});
  const pointer=useRef<{x:number;y:number}|null>(null);
  const touchPoints=useRef(new Map<number,{x:number;y:number}>());
  const touchDistance=useRef<number|null>(null);
  const resetZoom=useCallback(()=>{setZoom(1);setOffset({x:0,y:0});pointer.current=null;touchPoints.current.clear();touchDistance.current=null;},[]);
  const prev=useCallback(()=>{setSelected(i=>(i-1+images.length)%images.length);resetZoom();},[images.length,resetZoom]);
  const next=useCallback(()=>{setSelected(i=>(i+1)%images.length);resetZoom();},[images.length,resetZoom]);
  const zoomTo=(value:number)=>{const nextZoom=Math.max(1,Math.min(5,value));setZoom(nextZoom);if(nextZoom===1)setOffset({x:0,y:0});};
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open)setOpen(false);if(e.key==='ArrowLeft'){if(!open&&(['INPUT','TEXTAREA','SELECT'].includes((document.activeElement as HTMLElement)?.tagName)))return;prev();}if(e.key==='ArrowRight'){if(!open&&(['INPUT','TEXTAREA','SELECT'].includes((document.activeElement as HTMLElement)?.tagName)))return;next();}if(open&&(e.key==='+'||e.key==='='))setZoom(z=>Math.min(5,z+.5));if(open&&e.key==='-')setZoom(z=>Math.max(1,z-.5));};window.addEventListener('keydown',onKey);const previous=document.body.style.overflow;if(open)document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=previous;};},[open,prev,next]);
  if(!images.length)return null;
  return <div className="vehicle-gallery">
    <button type="button" className="gallery-main" onClick={()=>{resetZoom();setOpen(true);}} aria-label="Abrir a foto ampliada e navegar pela galeria">
      <img className="gallery-backdrop" src={images[selected]} alt="" aria-hidden="true" />
      <img className="gallery-featured" src={images[selected]} alt={`${label} — foto ${selected+1}`} />
      <span className="gallery-expand"><Expand size={18}/> Ver fotos e ampliar</span>
      <span className="gallery-count">{selected+1} / {images.length}</span>
    </button>
    {images.length>1&&<><button className="gallery-inline-prev" type="button" onClick={prev} aria-label="Foto anterior do carro" title="Foto anterior"><ChevronLeft size={26}/></button><button className="gallery-inline-next" type="button" onClick={next} aria-label="Próxima foto do carro" title="Próxima foto"><ChevronRight size={26}/></button></>}
    <div className="gallery-thumbnails" aria-label="Selecionar fotos do veículo">{images.map((src,i)=><button type="button" key={`${src}-${i}`} className={selected===i?'active':''} onClick={()=>setSelected(i)} aria-label={`Selecionar foto ${i+1}`} aria-pressed={selected===i}><img src={src} alt={`${label} — miniatura ${i+1}`} loading="lazy"/></button>)}</div>
    {open&&<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`Galeria ampliada de ${label}`} onClick={()=>{setOpen(false);resetZoom();}}>
      <div className="lightbox-toolbar" onClick={e=>e.stopPropagation()}>
        <button type="button" onClick={()=>zoomTo(zoom-.5)} disabled={zoom<=1} aria-label="Diminuir zoom" title="Diminuir zoom"><ZoomOut size={20}/></button>
        <span>{Math.round(zoom*100)}%</span>
        <button type="button" onClick={()=>zoomTo(zoom+.5)} disabled={zoom>=5} aria-label="Aumentar zoom" title="Aumentar zoom"><ZoomIn size={20}/></button>
        <button type="button" onClick={resetZoom} aria-label="Redefinir zoom" title="Restaurar tamanho"><RotateCcw size={19}/></button>
      </div>
      <button type="button" className="lightbox-close" onClick={e=>{e.stopPropagation();setOpen(false);resetZoom();}} aria-label="Fechar galeria"><X size={25}/></button>
      <button type="button" className="lightbox-prev" onClick={e=>{e.stopPropagation();prev();}} aria-label="Foto anterior"><ChevronLeft size={32}/></button>
      <div className="lightbox-photo-area" onClick={e=>e.stopPropagation()} onWheel={e=>{e.stopPropagation();zoomTo(zoom+(e.deltaY<0?.25:-.25));}}
        onDoubleClick={()=>zoomTo(zoom===1?2.5:1)}
        onPointerDown={e=>{if(e.pointerType==='touch'){touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touchPoints.current.size===2){const pts=[...touchPoints.current.values()];touchDistance.current=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);}}else if(zoom>1){pointer.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}}
        onPointerMove={e=>{if(e.pointerType==='touch'){if(!touchPoints.current.has(e.pointerId))return;const old=touchPoints.current.get(e.pointerId)!;touchPoints.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touchPoints.current.size===2){const pts=[...touchPoints.current.values()];const dist=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(touchDistance.current){setZoom(z=>Math.min(5,Math.max(1,z*dist/touchDistance.current!)));}touchDistance.current=dist;}else if(zoom>1){setOffset(p=>({x:p.x+e.clientX-old.x,y:p.y+e.clientY-old.y}));}return;}if(pointer.current&&zoom>1){setOffset(p=>({x:p.x+e.clientX-pointer.current!.x,y:p.y+e.clientY-pointer.current!.y}));pointer.current={x:e.clientX,y:e.clientY};}}}
        onPointerUp={e=>{pointer.current=null;touchPoints.current.delete(e.pointerId);touchDistance.current=null;}}
        onPointerCancel={e=>{pointer.current=null;touchPoints.current.delete(e.pointerId);touchDistance.current=null;}}
        style={{cursor:zoom>1?'grab':'zoom-in'}}>
        <img src={images[selected]} alt={`${label} — foto ampliada ${selected+1}`} draggable={false} style={{transform:`translate(${offset.x}px, ${offset.y}px) scale(${zoom})`}} />
      </div>
      <button type="button" className="lightbox-next" onClick={e=>{e.stopPropagation();next();}} aria-label="Próxima foto"><ChevronRight size={32}/></button>
      <div className="lightbox-count">{selected+1} de {images.length} · Role o mouse para dar zoom · Arraste para explorar · Setas para navegar</div>
    </div>}
  </div>;
}
