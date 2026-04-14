import { useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { api } from '../api/client';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

export function useVoice() {
  const clientRef       = useRef(null);
  const localTrackRef   = useRef(null);

  const [connected, setConnected] = useState(false);
  const [muted,     setMuted]     = useState(false);

  async function start(roomId) {
    // 이미 연결된 상태면 무시
    if (clientRef.current) return;

    // 1. BackServer에서 Agora 토큰 발급
    const { token, uid } = await api.get(`/api/agora/token?roomId=${roomId}`);

    // 2. Agora 클라이언트 생성
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    // 3. 다른 사용자 음성 자동 구독
    client.on('user-published', async (remoteUser, mediaType) => {
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') {
        remoteUser.audioTrack.play();
      }
    });

    // 4. 채널 입장
    await client.join(APP_ID, String(roomId), token, uid);

    // 5. 마이크 트랙 생성 및 발행
    const localTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localTrackRef.current = localTrack;
    await client.publish(localTrack);

    setConnected(true);
    setMuted(false);
  }

  function toggleMute() {
    const track = localTrackRef.current;
    if (!track) return;
    if (muted) {
      track.setEnabled(true);
    } else {
      track.setEnabled(false);
    }
    setMuted((m) => !m);
  }

  async function stop() {
    localTrackRef.current?.close();
    localTrackRef.current = null;
    await clientRef.current?.leave();
    clientRef.current = null;
    setConnected(false);
    setMuted(false);
  }

  return { start, stop, toggleMute, connected, muted };
}
