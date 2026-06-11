import { exportAll, importAll } from '../history/db';
import { Assembler, toFrames } from './protocol';

// Device-to-device sync session. The relay WebSocket only carries the WebRTC
// handshake; the history itself travels browser-to-browser over a DTLS
// (end-to-end encrypted) DataChannel. No STUN/TURN — pairing works when both
// devices are on the same network, which is the PC↔phone use case.
//
// Thin by design and NOT unit-tested (jsdom has no WebRTC): everything
// testable lives in protocol.ts; the UI is driven through this interface so
// tests inject a scripted fake.

export interface SyncEvents {
  onStatus: (status: string) => void;
  onProgress: (received: number, expected: number) => void;
  onMerged: (summary: string) => void;
  onError: (message: string) => void;
}

export interface SyncSession {
  close: () => void;
}

export type StartSync = (role: 'host' | 'join', code: string, ev: SyncEvents) => SyncSession;

// Public STUN lets each browser discover a routable candidate so the two
// devices can find each other without relying on mDNS (.local) resolution,
// which Android + many Wi-Fi networks block. STUN only sees the IP making a
// discovery request — never your data, which flows directly and end-to-end
// encrypted. A self-hoster can point this at their own STUN to avoid Google.
const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export const startSync: StartSync = (role, code, ev) => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/v1/sync/${code}`);
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  const asm = new Assembler();
  let channel: RTCDataChannel | null = null;
  let sentDone = false;
  let receivedDone = false;
  let finished = false;

  const fail = (msg: string) => { if (!finished) { finished = true; ev.onError(msg); cleanup(); } };
  const cleanup = () => { try { channel?.close(); } catch { /* closing */ } try { pc.close(); } catch { /* closing */ } try { ws.close(); } catch { /* closing */ } };
  const relay = (payload: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload));
  const maybeFinish = () => { if (sentDone && receivedDone && !finished) { finished = true; cleanup(); } };

  const wire = (ch: RTCDataChannel) => {
    channel = ch;
    ch.onopen = async () => {
      ev.onStatus('connected — transferring…');
      const dump = JSON.stringify(await exportAll());
      for (const frame of toFrames(dump)) ch.send(frame);
      sentDone = true;
      maybeFinish();
    };
    ch.onmessage = async (e) => {
      try {
        const payload = asm.feed(String(e.data));
        ev.onProgress(asm.received, asm.expected);
        if (payload != null) {
          const res = await importAll(payload);
          receivedDone = true;
          ev.onMerged(`Merged ${res.drives} drives · ${res.cars} cars · ${res.places} places from the other device.`);
          maybeFinish();
        }
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    };
    ch.onerror = () => fail('connection lost during transfer');
  };

  pc.onicecandidate = (e) => { if (e.candidate) relay({ t: 'ice', c: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connecting') ev.onStatus('connecting the two devices…');
    if (pc.connectionState === 'failed') fail('could not connect the two devices — try the same Wi-Fi, or use Download/Restore backup');
  };
  if (role === 'host') pc.ondatachannel = (e) => wire(e.channel);

  ws.onopen = () => {
    ev.onStatus(role === 'host' ? 'waiting for the other device…' : 'connecting…');
    if (role === 'join') {
      // joiner owns the offer + channel; host answers
      wire(pc.createDataChannel('hrvadrive-sync'));
      pc.createOffer()
        .then(async (offer) => { await pc.setLocalDescription(offer); relay({ t: 'offer', sdp: offer }); })
        .catch(() => fail('could not start the connection'));
    }
  };
  // Trickled ICE can arrive before the remote description is set; buffer until
  // then. Adding a candidate can fail for benign reasons (e.g. an mDNS name
  // that won't resolve) — that must NOT tear the session down, only a failed
  // offer/answer exchange is fatal.
  const pendingIce: RTCIceCandidateInit[] = [];
  let remoteSet = false;
  const addIce = (c: RTCIceCandidateInit) => { pc.addIceCandidate(c).catch(() => { /* benign */ }); };
  const flushIce = () => { remoteSet = true; while (pendingIce.length) addIce(pendingIce.shift()!); };

  ws.onmessage = async (e) => {
    let msg: { t: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };
    try {
      msg = JSON.parse(String(e.data));
    } catch {
      return; // ignore non-JSON noise on the relay
    }
    if (msg.t === 'ice' && msg.c) {
      if (remoteSet) addIce(msg.c); else pendingIce.push(msg.c);
      return;
    }
    try {
      if (msg.t === 'offer' && role === 'host' && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        relay({ t: 'answer', sdp: answer });
        flushIce();
      } else if (msg.t === 'answer' && role === 'join' && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
        flushIce();
      }
    } catch {
      fail('pairing failed — try a fresh code');
    }
  };
  ws.onclose = (e) => { if (e.code === 4000) fail('that code is already in use by two devices'); };
  ws.onerror = () => { if (!finished && !channel) fail('could not reach the pairing relay'); };

  return { close: () => { finished = true; cleanup(); } };
};
