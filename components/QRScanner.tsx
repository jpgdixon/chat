
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let animationFrameId: number;
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          requestAnimationFrame(scan);
        }
      } catch (err) {
        setError('Camera access denied or unavailable.');
        console.error(err);
      }
    };

    const scan = () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (video.readyState === video.HAVE_ENOUGH_DATA && context) {
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code) {
            onScan(code.data);
            return; // Stop scanning once found
          }
        }
      }
      animationFrameId = requestAnimationFrame(scan);
    };

    startCamera();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-6">
      <div className="relative w-full aspect-square max-w-sm rounded-mesh overflow-hidden border-2 border-primary shadow-2xl shadow-primary/20">
        <video 
          ref={videoRef} 
          className="absolute inset-0 w-full h-full object-cover" 
          playsInline 
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Overlay targeting frame */}
        <div className="absolute inset-0 border-[40px] border-black/50">
           <div className="w-full h-full border-2 border-primary/50 rounded-xl relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-primary"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-primary"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-primary"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-primary"></div>
           </div>
        </div>
      </div>

      <div className="mt-8 text-center space-y-4">
        <p className="text-lg font-medium">Scanning Signal...</p>
        <p className="text-sm text-gray-400">Position the QR code inside the frame</p>
        
        {error && <p className="text-red-500 bg-red-500/10 py-2 px-4 rounded-xl">{error}</p>}
        
        <button 
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-mesh transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default QRScanner;
