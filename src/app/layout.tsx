import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';
import { Header, Footer, FloatingWhatsApp } from '@/components/ui';
export const metadata: Metadata = { title: {default:'Bruno Mesquiatti | Carros & Soluções em Suzano',template:'%s | Bruno Mesquiatti'},description:'Veículos particulares, intermediação de vendas e consórcio automotivo em Suzano e no Alto Tietê. Converse com Bruno Mesquiatti.',robots:{index:false,follow:false} };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="pt-BR"><body><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Header/><main id="conteudo">{children}</main><Footer/><FloatingWhatsApp/></body></html>; }
