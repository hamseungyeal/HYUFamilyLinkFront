import { useRef, useState, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { api } from '../api/client';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

export function useVoice() {
  const clientRef       = useRef(null);
  const localTrackRef   = useRef(null);

  const [connected, setConnected] = useState(false);
  const [muted,     setMuted]     = useState(false);

  const start = useCallback(async (roomId) => {
    // 이미 연결된 상태면 무시 (레이스 컨디션 방지: 비동기 전에 즉시 설정)
    if (clientRef.current) return;
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    // 모바일 autoplay 차단 시 사용자에게 탭 유도
    AgoraRTC.onAutoplayFailed = () => {
      const btn = document.createElement('button');
      btn.innerText = '🔊 소리를 켜려면 탭하세요';
      Object.assign(btn.style, {
        position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, padding: '12px 24px', borderRadius: '24px',
        background: '#e94560', color: '#fff', border: 'none', fontSize: '15px',
        cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      });
      btn.onclick = () => {
        client.remoteUsers.forEach((u) => u.audioTrack?.play());
        btn.remove();
      };
      document.body.appendChild(btn);
    };

    // 1. 다른 사용자 음성 자동 구독 (join 전에 등록해야 함)
    client.on('user-published', async (remoteUser, mediaType) => {
      console.log('[Agora] user-published:', remoteUser.uid, mediaType);
      await client.subscribe(remoteUser, mediaType);
      if (mediaType === 'audio') {
        console.log('[Agora] playing remote audio from:', remoteUser.uid);
        remoteUser.audioTrack.play();
      }
    });

    try {
      // 2. BackServer에서 Agora 토큰 발급
      console.log('[Agora] fetching token for roomId:', roomId);
      
      // API 응답 객체 구조 안전장치 추가
      const response = await api.get(`/api/agora/token?roomId=${roomId}`);
      const token = response.data?.token || response.token;
      const uid = response.data?.uid || response.uid;
      
      console.log('[Agora] joining channel:', String(roomId), 'uid:', uid);

      // 3. 채널 입장
      await client.join(APP_ID, String(roomId), token, uid);
      console.log('[Agora] joined successfully');

      // 4. 마이크 트랙 생성 및 발행 (✨ 노래방 최적화 옵션 적용)
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "high_quality", // 고음질 전송
        AEC: true, // 에코 캔슬링 (하울링 방지)
        ANS: true, // 노이즈 캔슬링
      });
      
      localTrackRef.current = localTrack;
      await client.publish(localTrack);
      console.log('[Agora] published local track');

      setConnected(true);
      setMuted(false);
    } catch (err) {
      console.error('[Agora] start failed - name:', err.name, '/ message:', err.message, '/ code:', err.code);
      clientRef.current = null;
      throw err;
    }
  }, []);

  // ✨ [수정] 마이크 토글 로직: setEnabled 대신 즉각 반응하는 setMuted 적용
  const toggleMute = useCallback(async () => {
    const track = localTrackRef.current;
    if (!track) return;
    
    try {
      const newMutedState = !muted;
      await track.setMuted(newMutedState); 
      setMuted(newMutedState);
      console.log(`[Agora] Microphone is now ${newMutedState ? 'Muted 🔇' : 'Unmuted 🎤'}`);
    } catch (err) {
      console.error('[Agora] toggleMute failed:', err);
    }
  }, [muted]);

  const stop = useCallback(async () => {
    localTrackRef.current?.close();
    localTrackRef.current = null;
    await clientRef.current?.leave();
    clientRef.current = null;
    setConnected(false);
    setMuted(false);
  }, []);

  return { start, stop, toggleMute, connected, muted };
}