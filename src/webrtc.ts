export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "call-request"
  | "call-accept"
  | "call-decline"
  | "call-end"
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end";

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
  onChannelClose?: () => void;
}

export const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pendingChats: string[] = [];

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        const offer = await this.pc.createOffer();
        if (this.pc.signalingState !== "stable") return;
        await this.pc.setLocalDescription(offer);
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } catch (err) {
        console.error("Negotiation error:", err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        // Stream provided by browser
        this.cb.onRemoteStream(event.streams[0]);
      } else if (event.track) {
        // Add track to persistent remoteStream
        const existingTracks = this.remoteStream.getTracks();
        if (!existingTracks.some((t) => t.id === event.track.id)) {
          this.remoteStream.addTrack(event.track);
        }
        this.cb.onRemoteStream(this.remoteStream);
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      // Flush buffered chats once data channel opens
      while (this.pendingChats.length > 0) {
        const text = this.pendingChats.shift();
        if (text) {
          this.safeSend({ t: "chat", text });
        }
      }
      this.cb.onChannelOpen();
    };

    dc.onclose = () => this.cb.onChannelClose?.();

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if ((msg.t === "chat" || msg.t === "msg") && typeof msg.text === "string") {
          this.cb.onChat(msg.text);
        } else if (msg.t === "ctrl" && typeof msg.ctrl === "string") {
          this.cb.onControl(msg.ctrl as PeerControl);
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    const data = JSON.parse(payload);

    if (type === "ice") {
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(data);
        return;
      }
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(data));
      } catch (err) {
        if (!this.ignoreOffer) {
          console.warn("ICE candidate error:", err);
        }
      }
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");

    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    if (offerCollision) {
      await Promise.all([
        this.pc.setLocalDescription({ type: "rollback" }),
        this.pc.setRemoteDescription(new RTCSessionDescription(desc)),
      ]);
    } else {
      await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
    }

    await this.flushPendingCandidates();

    if (desc.type === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      if (this.pc.localDescription) {
        this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
      }
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = [...this.pendingCandidates];
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("Flushing ICE candidate error:", err);
      }
    }
  }

  sendChat(text: string) {
    if (this.dc && this.dc.readyState === "open") {
      this.safeSend({ t: "chat", text });
    } else {
      this.pendingChats.push(text);
    }
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      try {
        this.dc.send(JSON.stringify(obj));
        return true;
      } catch {}
    }
    return false;
  }

  async startAudio(): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      for (const track of this.localStream.getTracks()) {
        this.pc.addTrack(track, this.localStream);
      }
    } else if (this.localStream.getAudioTracks().length === 0) {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of audioStream.getAudioTracks()) {
        this.localStream.addTrack(track);
        this.pc.addTrack(track, this.localStream);
      }
    }
    return this.localStream;
  }

  stopAudio() {
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.stop();
        this.localStream.removeTrack(track);
        const sender = this.pc.getSenders().find((s) => s.track === track);
        if (sender) {
          try {
            this.pc.removeTrack(sender);
          } catch {}
        }
      }
      if (this.localStream.getTracks().length === 0) {
        this.localStream = null;
      }
    }
  }

  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      for (const track of this.localStream.getTracks()) {
        this.pc.addTrack(track, this.localStream);
      }
    } else if (this.localStream.getVideoTracks().length === 0) {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      for (const track of videoStream.getVideoTracks()) {
        this.localStream.addTrack(track);
        this.pc.addTrack(track, this.localStream);
      }
    }
    return this.localStream;
  }

  stopVideo() {
    if (this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.stop();
        this.localStream.removeTrack(track);
        const sender = this.pc.getSenders().find((s) => s.track === track);
        if (sender) {
          try {
            this.pc.removeTrack(sender);
          } catch {}
        }
      }
      if (this.localStream.getTracks().length === 0) {
        this.localStream = null;
      }
    }
  }

  stopAllMedia() {
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      for (const sender of this.pc.getSenders()) {
        if (sender.track) {
          try {
            this.pc.removeTrack(sender);
          } catch {}
        }
      }
      this.localStream = null;
    }
    for (const track of this.remoteStream.getTracks()) {
      track.stop();
      this.remoteStream.removeTrack(track);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopAllMedia();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}
