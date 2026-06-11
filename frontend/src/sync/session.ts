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

export const startSync: StartSync = (role, code, ev) => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/api/v1/sync/${code}`);
  const pc = new RTCPeerConnection({ iceServers: [] });
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
  ws.onmessage = async (e) => {
    try {
      const msg = JSON.parse(String(e.data)) as { t: string; sdp?: RTCSessionDescriptionInit; c?: RTCIceCandidateInit };
      if (msg.t === 'offer' && role === 'host' && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        relay({ t: 'answer', sdp: answer });
      } else if (msg.t === 'answer' && role === 'join' && msg.sdp) {
        await pc.setRemoteDescription(msg.sdp);
      } else if (msg.t === 'ice' && msg.c) {
        await pc.addIceCandidate(msg.c);
      }
    } catch {
      fail('pairing failed — try a fresh code');
    }
  };
  ws.onclose = (e) => { if (e.code === 4000) fail('that code is already in use by two devices'); };
  ws.onerror = () => { if (!finished && !channel) fail('could not reach the pairing relay'); };

  return { close: () => { finished = true; cleanup(); } };
};
