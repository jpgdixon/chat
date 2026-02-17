
import React, { useEffect, useRef } from 'react';

// Simplified QR generation for the sake of no external heavy libs in this context,
// we will use a reliable CDN library if we could, but let's stick to a basic approach.
// Using a smaller SDP via compression if possible would be better, but we'll show raw base64.
import { QRCodeCanvas } from 'qrcode.react';

interface QRGeneratorProps {
  data: string;
  title: string;
  subtitle?: string;
}

const QRGenerator: React.FC<QRGeneratorProps> = ({ data, title, subtitle }) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8 bg-white/5 rounded-mesh border border-white/10 w-full max-w-sm">
      <div className="text-center">
        <h3 className="text-xl font-bold">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
      </div>
      
      <div className="bg-white p-4 rounded-3xl overflow-hidden shadow-2xl">
        <QRCodeCanvas 
          value={data} 
          size={220}
          level="L"
          includeMargin={false}
          imageSettings={{
            src: "https://picsum.photos/40/40",
            x: undefined,
            y: undefined,
            height: 24,
            width: 24,
            excavate: true,
          }}
        />
      </div>
      
      <div className="text-xs text-gray-500 break-all line-clamp-2 px-4 opacity-50">
        Signal Data: {data.substring(0, 50)}...
      </div>
    </div>
  );
};

export default QRGenerator;
