
import React, { useState, useEffect, useRef } from 'react';
import { 
  Wifi, WifiOff, Settings, Plus, UserPlus, 
  Send, Sparkles, LogOut, ChevronLeft, MessageSquare, Globe, Copy, Hash
} from 'lucide-react';
import { View, UserProfile, ChatMessage, PeerConnectionState, SignalData } from './types';
import { suggestGroupName } from './services/geminiService';
import QRGenerator from './components/QRGenerator';
import QRScanner from './components/QRScanner';

// --- Diccionario de Compresión SDP ---
// Mapea términos repetitivos de WebRTC a tokens cortos para reducir el tamaño del QR
const SDP_MAP: Record<string, string> = {
  'a=ice-ufrag:': 'u:',
  'a=ice-pwd:': 'p:',
  'a=fingerprint:sha-256 ': 'f:',
  'a=setup:': 's:',
  'a=mid:': 'm:',
  'a=candidate:': 'c:',
  'a=sctpmap:': 't:',
  ' IN IP4 ': ' i:',
  '\r\n': '|'
};

const compactSDP = (sdp: string): string => {
  let compacted = sdp;
  // Solo guardamos las líneas críticas para DataChannels
  const lines = sdp.split('\r\n').filter(l => 
    l.startsWith('a=ice-ufrag') || 
    l.startsWith('a=ice-pwd') || 
    l.startsWith('a=fingerprint') ||
    l.startsWith('a=candidate') ||
    l.startsWith('a=setup')
  );
  
  compacted = lines.join('|');
  Object.entries(SDP_MAP).forEach(([key, val]) => {
    compacted = compacted.split(key).join(val);
  });
  return compacted;
};

const expandSDP = (compacted: string): string => {
  let expanded = compacted;
  Object.entries(SDP_MAP).forEach(([key, val]) => {
    expanded = expanded.split(val).join(key);
  });
  // Reconstruir cabeceras mínimas para que el navegador lo acepte
  const lines = expanded.split('|');
  const header = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=msid-semantic: WMS\r\nm=data 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n";
  return header + lines.join('\r\n') + '\r\n';
};

const encodeSignal = (obj: SignalData) => {
  const data = {
    t: obj.type === 'offer' ? 0 : 1,
    s: compactSDP(obj.sdp),
    n: obj.userName
  };
  return btoa(JSON.stringify(data)).replace(/=/g, ''); // Base64 sin padding para acortar
};

const decodeSignal = (str: string): SignalData | null => {
  try {
    const data = JSON.parse(atob(str));
    return {
      type: data.t === 0 ? 'offer' : 'answer',
      sdp: expandSDP(data.s),
      userName: data.n
    };
  } catch (e) {
    return null;
  }
};

const TRANSLATIONS = {
  en: {
    welcome: "Welcome,",
    onboardingSub: "Offline mesh chat.",
    getStarted: "Start",
    placeholderName: "Name...",
    createGroup: "Create",
    createGroupSub: "Start a hub",
    joinGroup: "Join",
    joinGroupSub: "Scan an offer",
    hostingTitle: "Mesh Hub",
    hostingSub: "Share this QR",
    waitingPeers: "Waiting...",
    scanGuest: "Scan Answer",
    sendAnswer: "Send Answer",
    sendAnswerSub: "Host scans this",
    waitingHost: "Waiting...",
    noMessages: "Silence...",
    typeMessage: "Message...",
    settings: "Settings",
    signOut: "Exit",
    networkInfo: "Network",
    webrtcStatus: "WebRTC",
    meshRole: "Role",
    active: "Connected",
    hub: "Host",
    node: "Client",
    cancel: "Cancel",
    peer: "User",
    peers: "Users",
    language: "Lang",
    manualCode: "Short Code",
    pasteCode: "Paste code or scan",
    connect: "Connect",
    copy: "Copy",
    sessionCode: "Session ID"
  },
  es: {
    welcome: "Hola,",
    onboardingSub: "Chat local sin internet.",
    getStarted: "Entrar",
    placeholderName: "Tu nombre...",
    createGroup: "Crear",
    createGroupSub: "Iniciar central",
    joinGroup: "Unirse",
    joinGroupSub: "Escanear oferta",
    hostingTitle: "Hosteando",
    hostingSub: "Muestra este QR",
    waitingPeers: "Esperando...",
    scanGuest: "Escanear Resp.",
    sendAnswer: "Responder",
    sendAnswerSub: "El Host escanea esto",
    waitingHost: "Esperando...",
    noMessages: "Sin mensajes.",
    typeMessage: "Escribe...",
    settings: "Ajustes",
    signOut: "Salir",
    networkInfo: "Red",
    webrtcStatus: "WebRTC",
    meshRole: "Rol",
    active: "Activo",
    hub: "Host",
    node: "Cliente",
    cancel: "Cancelar",
    peer: "Par",
    peers: "Pares",
    language: "Idioma",
    manualCode: "Código Manual",
    pasteCode: "Pega el código o escanea",
    connect: "Conectar",
    copy: "Copiar",
    sessionCode: "ID Sesión"
  }
};

const App: React.FC = () => {
  const [view, setView] = useState<View>('onboarding');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [groupName, setGroupName] = useState("Mesh Group");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lang, setLang] = useState<'en' | 'es'>('es');
  const [manualInput, setManualInput] = useState("");
  const [showManualModal, setShowManualModal] = useState(false);
  const [sessionId] = useState(() => Math.floor(10000000 + Math.random() * 90000000).toString());

  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerConnectionState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const savedUser = localStorage.getItem('mesh_user');
    const savedLang = localStorage.getItem('mesh_lang') as 'en' | 'es';
    if (savedLang) setLang(savedLang);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setView('home');
    }
  }, []);

  const changeLang = (l: 'en' | 'es') => {
    setLang(l);
    localStorage.setItem('mesh_lang', l);
  };

  const handleOnboarding = (name: string) => {
    if (!name.trim()) return;
    const newUser: UserProfile = {
      id: Math.random().toString(36).substring(7),
      name,
      avatarColor: `hsl(${Math.random() * 360}, 70%, 60%)`
    };
    setUser(newUser);
    localStorage.setItem('mesh_user', JSON.stringify(newUser));
    setView('home');
  };

  const createHostSignal = async () => {
    setIsHost(true);
    const pc = new RTCPeerConnection();
    const peerId = Math.random().toString(36).substring(7);
    const dc = pc.createDataChannel("chat");
    setupDataChannel(dc, peerId);
    
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        setActiveSignal(encodeSignal({ type: 'offer', sdp: pc.localDescription!.sdp, userName: user!.name }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    peerConnections.current.set(peerId, pc);
    setView('host');
  };

  const setupDataChannel = (dc: RTCDataChannel, peerId: string) => {
    dc.onopen = () => {
      setPeers(prev => new Map(prev).set(peerId, { id: peerId, status: 'connected' }));
      setView('chat');
    };
    dc.onclose = () => setPeers(prev => { const n = new Map(prev); n.delete(peerId); return n; });
    dc.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'chat') {
        setMessages(prev => [...prev, data.payload]);
        if (isHost) dataChannels.current.forEach((ch, id) => id !== peerId && ch.send(e.data));
      }
    };
    dataChannels.current.set(peerId, dc);
  };

  const handleScan = async (data: string) => {
    const signal = decodeSignal(data);
    if (!signal) return;
    setIsScanning(false);
    setShowManualModal(false);

    if (signal.type === 'offer') {
      const pc = new RTCPeerConnection();
      pc.ondatachannel = (e) => setupDataChannel(e.channel, 'host');
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          setActiveSignal(encodeSignal({ type: 'answer', sdp: pc.localDescription!.sdp, userName: user!.name }));
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      peerConnections.current.set('host', pc);
      setView('join');
    } else if (signal.type === 'answer') {
      const pcs = Array.from(peerConnections.current.values()) as RTCPeerConnection[];
      const pc = pcs.find(p => p.signalingState === 'have-local-offer');
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
    }
  };

  const sendMessage = () => {
    if (!currentMessage.trim() || !user) return;
    const msg = { id: Date.now().toString(), senderId: user.id, senderName: user.name, text: currentMessage, timestamp: Date.now() };
    setMessages(prev => [...prev, msg]);
    const payload = JSON.stringify({ type: 'chat', payload: msg });
    dataChannels.current.forEach(dc => dc.readyState === 'open' && dc.send(payload));
    setCurrentMessage("");
  };

  return (
    <div className="flex flex-col h-screen text-white bg-dark select-none overflow-hidden font-sans">
      
      {view === 'onboarding' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 animate-in fade-in duration-700">
          <div className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 bg-primary flex items-center justify-center rounded-[2.5rem] shadow-2xl shadow-primary/30"><MessageSquare className="w-10 h-10 text-white" /></div>
            <h1 className="text-4xl font-black tracking-tight italic">ChatLan</h1>
            <p className="text-gray-500 font-medium">{t.onboardingSub}</p>
          </div>
          <div className="w-full max-w-sm space-y-4">
            <input type="text" placeholder={t.placeholderName} className="w-full bg-white/5 border border-white/10 p-5 rounded-mesh text-lg outline-none focus:ring-2 focus:ring-primary text-center" onKeyDown={(e) => e.key === 'Enter' && handleOnboarding((e.target as HTMLInputElement).value)} />
            <button onClick={(e) => handleOnboarding((e.currentTarget.previousElementSibling as HTMLInputElement).value)} className="w-full bg-primary py-5 rounded-mesh text-lg font-bold active:scale-95 transition-transform">{t.getStarted}</button>
          </div>
        </div>
      )}

      {view === 'home' && (
        <div className="flex-1 flex flex-col p-8 safe-area-top">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold border border-white/10" style={{ backgroundColor: user?.avatarColor }}>{user?.name[0].toUpperCase()}</div>
              <h2 className="text-xl font-bold">{user?.name}</h2>
            </div>
            <button onClick={() => setView('settings')} className="p-2.5 bg-white/5 rounded-full"><Settings className="w-5 h-5" /></button>
          </div>
          
          <div className="bg-white/5 p-4 rounded-3xl border border-white/5 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-400">
              <Hash className="w-4 h-4" />
              <span className="text-sm font-mono tracking-widest">{t.sessionCode}</span>
            </div>
            <span className="font-black text-primary tracking-tighter text-xl">{sessionId}</span>
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-4">
            <button onClick={createHostSignal} className="bg-primary/10 border border-primary/20 p-8 rounded-mesh flex items-center gap-6 hover:bg-primary/20 transition-all group">
              <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><Plus className="w-8 h-8" /></div>
              <div className="text-left"><h3 className="text-xl font-bold">{t.createGroup}</h3><p className="text-gray-500 text-sm">{t.createGroupSub}</p></div>
            </button>
            <button onClick={() => setIsScanning(true)} className="bg-white/5 border border-white/10 p-8 rounded-mesh flex items-center gap-6 hover:bg-white/10 transition-all group">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"><UserPlus className="w-8 h-8" /></div>
              <div className="text-left"><h3 className="text-xl font-bold">{t.joinGroup}</h3><p className="text-gray-500 text-sm">{t.joinGroupSub}</p></div>
            </button>
          </div>
        </div>
      )}

      {(view === 'host' || view === 'join') && activeSignal && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6 animate-in slide-in-from-bottom-4">
           <QRGenerator 
              data={activeSignal} 
              title={view === 'host' ? t.hostingTitle : t.sendAnswer}
              subtitle={view === 'host' ? t.hostingSub : t.sendAnswerSub}
           />
           
           <div className="w-full max-w-sm space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setIsScanning(true)} className="flex-1 bg-primary py-4 rounded-2xl font-bold flex items-center justify-center gap-2"><Globe className="w-5 h-5"/> {t.scanGuest}</button>
                <button onClick={() => setShowManualModal(true)} className="flex-1 bg-white/10 py-4 rounded-2xl font-bold">{t.manualCode}</button>
              </div>
              <button onClick={() => setView('home')} className="w-full text-gray-500 py-2">{t.cancel}</button>
           </div>
        </div>
      )}

      {view === 'chat' && (
        <div className="flex flex-col h-full">
          <header className="safe-area-top bg-dark/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                {peers.size > 0 ? <Wifi className="text-primary w-5 h-5 animate-pulse" /> : <WifiOff className="text-gray-500 w-5 h-5" />}
              </div>
              <h1 className="font-bold">{groupName}</h1>
            </div>
            <button onClick={() => { setIsAiLoading(true); suggestGroupName(messages).then(n => { setGroupName(n); setIsAiLoading(false); }); }} className="p-2 bg-white/5 rounded-full"><Sparkles className={`w-4 h-4 text-yellow-400 ${isAiLoading ? 'animate-spin' : ''}`} /></button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.senderId === user?.id ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl ${msg.senderId === user?.id ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-gray-200 rounded-tl-none'}`}>
                  <p className="text-base">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 safe-area-bottom">
            <div className="flex gap-2">
              <input value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder={t.typeMessage} className="flex-1 bg-white/5 border border-white/10 p-4 rounded-2xl outline-none" />
              <button onClick={sendMessage} className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center"><Send className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      )}

      {view === 'settings' && (
        <div className="flex-1 flex flex-col p-8 safe-area-top space-y-6">
          <div className="flex items-center gap-4"><button onClick={() => setView('home')} className="p-2 bg-white/5 rounded-full"><ChevronLeft /></button><h2 className="text-2xl font-bold">{t.settings}</h2></div>
          <button onClick={() => changeLang(lang === 'es' ? 'en' : 'es')} className="w-full bg-white/5 p-5 rounded-3xl flex justify-between"><span>{t.language}</span><span className="font-bold text-primary">{lang.toUpperCase()}</span></button>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full bg-red-500/10 text-red-500 p-5 rounded-3xl font-bold flex items-center justify-center gap-2"><LogOut className="w-5 h-5"/> {t.signOut}</button>
        </div>
      )}

      {showManualModal && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-secondary p-8 rounded-3xl w-full max-w-sm space-y-6 border border-white/10">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold">{t.manualCode}</h3>
              <p className="text-xs text-gray-500 uppercase tracking-widest">{t.pasteCode}</p>
            </div>
            <textarea value={manualInput} onChange={(e) => setManualInput(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-[10px] font-mono h-40 outline-none" placeholder="CODIGO AQUI..." />
            <div className="flex gap-3">
              <button onClick={() => setShowManualModal(false)} className="flex-1 py-4 text-gray-400 font-bold">{t.cancel}</button>
              <button onClick={() => handleScan(manualInput)} className="flex-1 py-4 bg-primary rounded-2xl font-bold">{t.connect}</button>
            </div>
          </div>
        </div>
      )}

      {isScanning && <QRScanner onScan={handleScan} onClose={() => setIsScanning(false)} />}
    </div>
  );
};

export default App;
