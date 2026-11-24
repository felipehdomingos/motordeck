export const whatsapp = (message = 'Olá, Bruno! Gostaria de saber mais sobre seus serviços.') => `https://wa.me/5511942628006?text=${encodeURIComponent(message)}`;
export type Vehicle = { slug:string; brand:string; model:string; version:string; year:number; mileage:number; price:number; transmission:string; fuel:string; type:string; status:string; featured:boolean; images:string[]; notes:string; color:string };
export const money = (value:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(value);
