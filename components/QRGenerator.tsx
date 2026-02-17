
import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';

interface QRGeneratorProps {
  data: string;
  title: string;
  subtitle?: string;
}

const QRGenerator: React.FC<QRGeneratorProps> = ({ data, title, subtitle }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8 bg-white/5 rounded-[2.5rem] border border-white/10 w-full max-w-sm animate-in zoom-in duration-300 shadow-2xl">
      <div className="text-center space-y-1">
        <h3 className="text-xl font-black italic text-primary uppercase tracking-tighter">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{subtitle}</p>}
      </div>
      
      <div className="bg-white p-4 rounded-3xl shadow-inner border-[6px] border-white">
        <QRCodeCanvas 
          value={data} 
          size={220}
          level="L" // Nivel de error bajo = menos puntos = más simple
          marginSize={0}
          renderAs="canvas"
        />
      </div>
      
      <button 
        onClick={() => {
          navigator.clipboard.writeText(data);
          alert('Código copiado');
        }}
        className="text-[10px] font-mono text-gray-600 bg-black/20 py-2 px-4 rounded-full max-w-[200px] truncate hover:text-primary transition-colors"
      >
        {data}
      </button>
    </div>
  );
};

export default QRGenerator;
