// Shared types across client + API.

// Signal mailbox message types.
export type SignalType =
  | "request" // connection request (tap a dot)
  | "accept" // recipient accepted
  | "decline" // recipient declined (or auto-declined while busy)
  | "offer" // WebRTC SDP offer
  | "answer" // WebRTC SDP answer
  | "ice" // WebRTC ICE candidate
  | "end" // hang up / leave the connection
  | "circle-offer"
  | "circle-answer"
  | "circle-ice";

export interface PeerDot {
  id: string;
  lat: number;
  lng: number;
  busy: boolean;
  identityMode: IdentityMode;
  avatarTone: AvatarTone;
  nickname: string | null;
}

export type AvatarTone = "green" | "violet" | "cyan" | "rose" | "amber";
export type IdentityMode = "anonymous" | "color" | "nickname";

export interface IdentityProfile {
  identityMode: IdentityMode;
  avatarTone: AvatarTone;
  nickname: string;
}

export interface CircleSummary {
  circleId: string;
  keyword: string;
  memberCount: number;
}

export type CircleMember = PeerDot;

export interface CircleRoom {
  circleId: string;
  keyword: string;
  members: CircleMember[];
}

export interface SignalMsg {
  id: string;
  fromId: string;
  toId: string;
  type: SignalType;
  payload: string | null;
  createdAt: string;
}

export interface PollResponse {
  peers: PeerDot[];
  signals: SignalMsg[];
}
