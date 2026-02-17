
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Wifi, WifiOff, Users, Settings, Plus, UserPlus, 
  Send, Sparkles, LogOut, ChevronLeft, User, MessageSquare, Globe
} from 'lucide-react';
import { View, UserProfile, ChatMessage, PeerConnectionState, SignalData } from './types';
import { suggestGroupName } from './services/geminiService';
import QRGenerator from './components/QRGenerator';
import QRScanner from './components/QRScanner';

// --- Global WebRTC Config ---
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [] 
};

// --- Translations ---
const TRANSLATIONS = {
  en: {
    welcome: "Welcome back,",
    onboardingSub: "Local mesh communication without internet.",
    getStarted: "Get Started",
    placeholderName: "Your local name...",
    createGroup: "Create Group",
    createGroupSub: "Host a new chat for people nearby",
    joinGroup: "Join Group",
    joinGroupSub: "Scan someone's offer QR code",
    hostingTitle: "Hosting New Mesh",
    hostingSub: "Let participants scan this to join",
    waitingPeers: "Waiting for participants...",
    scanGuest: "Scan Guest Answer",
    sendAnswer: "Send Answer to Host",
    sendAnswerSub: "The Host must scan this to complete connection",
    waitingHost: "Waiting for Host to scan...",
    noMessages: "No messages yet. Say hello to the mesh!",
    typeMessage: "Type a message...",
    settings: "Settings",
    signOut: "Sign Out",
    networkInfo: "Network Info",
    webrtcStatus: "WebRTC Status",
    meshRole: "Mesh Role",
    active: "Active",
    hub: "Hub",
    node: "Node",
    cancel: "Cancel",
    peer: "Peer",
    peers: "Peers",
    language: "Language",
    back: "Back"
  },
  es: {
    welcome: "Bienvenido de nuevo,",
    onboardingSub: "Comunicación local mesh sin internet.",
    getStarted: "Comenzar",
    placeholderName: "Tu nombre local...",
    createGroup: "Crear Grupo",
    createGroupSub: "Inicia un chat para personas cercanas",
    joinGroup: "Unirse a Grupo",
    joinGroupSub: "Escanea el código QR de oferta",
    hostingTitle: "Hosteando Nueva Red",
    hostingSub: "Deja que los participantes escaneen esto",
    waitingPeers: "Esperando participantes...",
    scanGuest: "Escanear Respuesta",
    sendAnswer: "Enviar Respuesta al Host",
    sendAnswerSub: "El Host debe escanear esto para conectar",
    waitingHost: "Esperando que el Host escanee...",
    noMessages: "Sin mensajes. ¡Saluda a la red!",
    typeMessage: "Escribe un mensaje...",
    settings: "Ajustes",
    signOut: "Cerrar Sesión",
    networkInfo: "Información de Red",
    webrtcStatus: "Estado WebRTC",
    meshRole: "Rol de Red",
    active: "Activo",
    hub: "Central (Hub)",
    node: "Nodo",
    cancel: "Cancelar",
    peer: "Par",
    peers: "Pares",
    language: "Idioma",
    back: "Atrás"
  }
};

type Lang = 'en' | 'es';

// --- Helper for compression ---
const encodeSignal = (obj: any) => btoa(JSON.stringify(obj));
const decodeSignal = (str: string) => {
  try {
    return JSON.parse(atob(str));
  } catch (e) {
    return null;
  }
};

const App: React.FC = () => {
  // UI State
  const [view, setView] = useState<View>('onboarding');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [groupName, setGroupName] = useState("Mesh Group");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lang, setLang] = useState<Lang>('en');

  // Connection State
  const [isHost, setIsHost] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerConnectionState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  
  // Signaling State
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // WebRTC Refs
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());

  const t = TRANSLATIONS[lang];

  // Persistence
  useEffect(() => {
    const savedUser = localStorage.getItem('mesh_user');
    const savedLang = localStorage.getItem('mesh_lang') as Lang;
    if (savedLang) setLang(savedLang);
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setView('home');
    }
  }, []);

  const changeLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem('mesh_lang', l);
  };

  // --- Handlers ---
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
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerId = Math.random().toString(36).substring(7);
    
    const dc = pc.createDataChannel("chat");
    setupDataChannel(dc, peerId);
    
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        const signal: SignalData = {
          type: 'offer',
          sdp: pc.localDescription!.sdp,
          userName: user!.name
        };
        setActiveSignal(encodeSignal(signal));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    peerConnections.current.set(peerId, pc);
    setView('host');
  };

  const setupDataChannel = (dc: RTCDataChannel, peerId: string) => {
    dc.onopen = () => {
      setPeers(prev => {
        const next = new Map(prev);
        next.set(peerId, { id: peerId, status: 'connected' });
        return next;
      });
      setView('chat');
    };
    
    dc.onclose = () => {
      setPeers(prev => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    };

    dc.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'chat') {
        const msg: ChatMessage = data.payload;
        addMessage(msg);
        
        if (isHost) {
          dataChannels.current.forEach((channel, id) => {
            if (id !== peerId) {
              channel.send(e.data);
            }
          });
        }
      }
    };

    dataChannels.current.set(peerId, dc);
  };

  const addMessage = (msg: ChatMessage) => {
    setMessages(prev => [...prev, msg]);
  };

  const handleScan = async (data: string) => {
    const signal = decodeSignal(data) as SignalData;
    if (!signal) return;

    setIsScanning(false);

    if (signal.type === 'offer') {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const peerId = 'host';

      pc.ondatachannel = (e) => {
        setupDataChannel(e.channel, peerId);
      };

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          const answerSignal: SignalData = {
            type: 'answer',
            sdp: pc.localDescription!.sdp,
            userName: user!.name
          };
          setActiveSignal(encodeSignal(answerSignal));
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      peerConnections.current.set(peerId, pc);
      setView('join');
    } else if (signal.type === 'answer') {
      // Corrected the type casting and searching for the connection expecting an answer
      const pc = Array.from(peerConnections.current.values()).find((p) => (p as RTCPeerConnection).signalingState === 'have-local-offer');
      if (pc) {
        await (pc as RTCPeerConnection).setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
      }
    }
  };

  const sendMessage = () => {
    if (!currentMessage.trim() || !user) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      senderId: user.id,
      senderName: user.name,
      text: currentMessage,
      timestamp: Date.now()
    };

    addMessage(newMessage);
    
    const payload = JSON.stringify({ type: 'chat', payload: newMessage });
    dataChannels.current.forEach(dc => {
      if (dc.readyState === 'open') dc.send(payload);
    });

    setCurrentMessage("");
  };

  const handleSuggestName = async () => {
    setIsAiLoading(true);
    const suggested = await suggestGroupName(messages);
    setGroupName(suggested);
    setIsAiLoading(false);
  };

  // --- UI Components ---
  const Navbar = () => (
    <header className="safe-area-top bg-dark/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-xl">
          {peers.size > 0 ? (
            <Wifi className="text-primary w-5 h-5 animate-pulse" />
          ) : (
            <WifiOff className="text-gray-500 w-5 h-5" />
          )}
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">{groupName}</h1>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
            {peers.size} {peers.size === 1 ? t.peer : t.peers} Connected
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={handleSuggestName}
          disabled={isAiLoading || messages.length === 0}
          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-mesh transition-colors disabled:opacity-30"
        >
          <Sparkles className={`w-5 h-5 text-yellow-400 ${isAiLoading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setView('settings')} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-mesh transition-colors">
          <Settings className="w-5 h-5 text-gray-300" />
        </button>
      </div>
    </header>
  );

  return (
    <div className="flex flex-col h-screen text-white bg-dark select-none overflow-hidden font-sans">
      
      {/* Onboarding */}
      {view === 'onboarding' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 animate-in fade-in duration-700">
          <div className="text-center space-y-4">
            <div className="mx-auto w-24 h-24 bg-primary flex items-center justify-center rounded-[3rem] shadow-2xl shadow-primary/30 mb-8">
              <MessageSquare className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">ChatLan</h1>
            <p className="text-gray-400 max-w-xs mx-auto text-lg">{t.onboardingSub}</p>
          </div>
          
          <div className="w-full max-w-sm space-y-6">
            <input 
              type="text" 
              placeholder={t.placeholderName}
              className="w-full bg-white/5 border border-white/10 p-6 rounded-mesh text-xl focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleOnboarding((e.target as HTMLInputElement).value)}
            />
            <button 
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement).value;
                handleOnboarding(input);
              }}
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-6 rounded-mesh text-xl shadow-lg transition-transform active:scale-95"
            >
              {t.getStarted}
            </button>
          </div>
        </div>
      )}

      {/* Home */}
      {view === 'home' && (
        <div className="flex-1 flex flex-col p-8 safe-area-top safe-area-bottom">
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 rounded-mesh flex items-center justify-center font-bold text-xl border-2 border-white/10"
                style={{ backgroundColor: user?.avatarColor }}
              >
                {user?.name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">{t.welcome}</p>
                <h2 className="text-2xl font-bold">{user?.name}</h2>
              </div>
            </div>
            <button onClick={() => setView('settings')} className="p-3 bg-white/5 rounded-mesh">
              <Settings className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center space-y-6">
            <button 
              onClick={createHostSignal}
              className="group relative bg-white/5 border border-white/10 p-8 rounded-mesh flex flex-col items-center text-center space-y-4 hover:bg-white/10 transition-all hover:scale-[1.02]"
            >
              <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-3xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
                <Plus className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">{t.createGroup}</h3>
                <p className="text-gray-400">{t.createGroupSub}</p>
              </div>
            </button>

            <button 
              onClick={() => setIsScanning(true)}
              className="group relative bg-white/5 border border-white/10 p-8 rounded-mesh flex flex-col items-center text-center space-y-4 hover:bg-white/10 transition-all hover:scale-[1.02]"
            >
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-3xl flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <UserPlus className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">{t.joinGroup}</h3>
                <p className="text-gray-400">{t.joinGroupSub}</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Host Signal QR */}
      {view === 'host' && activeSignal && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
           <QRGenerator 
              data={activeSignal} 
              title={t.hostingTitle}
              subtitle={t.hostingSub}
           />
           <div className="space-y-4 text-center">
              <p className="text-gray-400 animate-pulse">{t.waitingPeers}</p>
              <button 
                onClick={() => setIsScanning(true)}
                className="bg-primary/20 text-primary font-bold py-4 px-10 rounded-mesh hover:bg-primary hover:text-white transition-all"
              >
                {t.scanGuest}
              </button>
              <button onClick={() => setView('home')} className="block mx-auto text-gray-500 hover:text-white transition-colors">
                {t.cancel}
              </button>
           </div>
        </div>
      )}

      {/* Join Signal QR */}
      {view === 'join' && activeSignal && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
           <QRGenerator 
              data={activeSignal} 
              title={t.sendAnswer}
              subtitle={t.sendAnswerSub}
           />
           <div className="space-y-4 text-center">
              <p className="text-gray-400 animate-pulse">{t.waitingHost}</p>
              <button onClick={() => setView('home')} className="block mx-auto text-gray-500 hover:text-white transition-colors">
                {t.cancel}
              </button>
           </div>
        </div>
      )}

      {/* Chat Room */}
      {view === 'chat' && (
        <>
          <Navbar />
          <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-12">
                <div className="w-20 h-20 border-2 border-dashed border-white/50 rounded-mesh flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <p className="text-lg">{t.noMessages}</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    {!isMe && (
                      <span className="text-xs text-gray-500 ml-4 mb-1 font-medium">{msg.senderName}</span>
                    )}
                    <div className={`max-w-[85%] px-5 py-4 ${
                      isMe 
                        ? 'bg-primary text-white rounded-t-3xl rounded-bl-3xl' 
                        : 'bg-white/5 text-gray-200 rounded-t-3xl rounded-br-3xl'
                    } shadow-lg`}>
                      <p className="text-[17px] leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div className="h-4" />
          </div>
          
          <div className="safe-area-bottom p-6 bg-dark/80 backdrop-blur-xl border-t border-white/5">
            <div className="flex items-center gap-3">
              <input 
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder={t.typeMessage}
                className="flex-1 bg-white/5 border border-white/10 p-5 rounded-mesh outline-none focus:ring-2 focus:ring-primary transition-all text-lg"
              />
              <button 
                onClick={sendMessage}
                disabled={!currentMessage.trim()}
                className="w-16 h-16 bg-primary hover:bg-primary/80 disabled:opacity-30 rounded-mesh flex items-center justify-center shadow-lg transition-transform active:scale-95"
              >
                <Send className="w-7 h-7" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Settings */}
      {view === 'settings' && (
        <div className="flex-1 flex flex-col p-8 safe-area-top overflow-y-auto no-scrollbar">
          <div className="flex items-center gap-4 mb-12">
            <button onClick={() => setView(user ? 'home' : 'onboarding')} className="p-3 bg-white/5 rounded-mesh">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-3xl font-bold">{t.settings}</h2>
          </div>

          <div className="space-y-6">
            <div className="p-6 bg-white/5 rounded-mesh border border-white/10">
              <div className="flex items-center gap-4 mb-6">
                <div 
                  className="w-16 h-16 rounded-mesh flex items-center justify-center font-bold text-2xl"
                  style={{ backgroundColor: user?.avatarColor }}
                >
                  {user?.name?.[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold">{user?.name}</h3>
                  <p className="text-gray-500 text-xs">ID: {user?.id}</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  localStorage.removeItem('mesh_user');
                  window.location.reload();
                }}
                className="w-full bg-red-500/10 text-red-500 font-bold py-4 rounded-mesh flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-all"
              >
                <LogOut className="w-5 h-5" />
                {t.signOut}
              </button>
            </div>

            {/* Language Selector */}
            <div className="p-6 bg-white/5 rounded-mesh border border-white/10 space-y-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Globe className="w-5 h-5 text-primary" />
                <h3>{t.language}</h3>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => changeLang('es')}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${lang === 'es' ? 'bg-primary text-white' : 'bg-white/5 text-gray-400'}`}
                >
                  Español
                </button>
                <button 
                  onClick={() => changeLang('en')}
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${lang === 'en' ? 'bg-primary text-white' : 'bg-white/5 text-gray-400'}`}
                >
                  English
                </button>
              </div>
            </div>

            <div className="p-6 bg-white/5 rounded-mesh border border-white/10 space-y-4">
              <h3 className="text-lg font-bold">{t.networkInfo}</h3>
              <div className="flex justify-between text-gray-400">
                <span>{t.webrtcStatus}</span>
                <span className="text-emerald-500 font-bold">{t.active}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>{t.meshRole}</span>
                <span>{isHost ? t.hub : t.node}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Scanner Overlay */}
      {isScanning && (
        <QRScanner 
          onScan={handleScan} 
          onClose={() => setIsScanning(false)} 
        />
      )}

    </div>
  );
};

export default App;
