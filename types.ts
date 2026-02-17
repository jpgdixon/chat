
export type View = 'onboarding' | 'home' | 'host' | 'join' | 'chat' | 'settings';

export interface UserProfile {
  id: string;
  name: string;
  avatarColor: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface PeerConnectionState {
  id: string;
  status: 'connecting' | 'connected' | 'disconnected';
  userName?: string;
}

export interface SignalData {
  type: 'offer' | 'answer';
  sdp: string;
  userName: string;
}
