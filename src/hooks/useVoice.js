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
    // 이미 연결된 상태면 무시 (레이스 컨디션 방지: 비동기 전에 즉시 설정)
    if (clientRef.current) return;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    // 1. 다른 사용자 음성 자동 구독 (join 전에 등록해야 함)
    client.on('user-published', async (remoteUser, mediaType) => {
      console.log('[Agora] user-published:', remoteUser.uid, mediaType);
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') {
        console.log('[Agora] playing remote audio from:', remoteUser.uid);
        remoteUser.audioTrack.play();
      }
    });

    // 2. BackServer에서 Agora 토큰 발급
    const { token, uid } = await api.get(`/api/agora/token?roomId=${roomId}`);

    // 3. 채널 입장
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
