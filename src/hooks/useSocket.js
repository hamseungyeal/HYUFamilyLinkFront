import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useRoomStore } from '../store/roomStore';

let socketInstance = null;

export function getSocket() {
  return socketInstance;
}

export function useSocket() {
  const token      = useAuthStore((s) => s.token);
  const {
    setRoom, setQueue, setSongPlaying, setSongEnded,
    setCurrentMs, addReaction, setScore, reset,
  } = useRoomStore();

  const initialized = useRef(false);

  useEffect(() => {
    if (!token || initialized.current) return;
    initialized.current = true;

    socketInstance = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] connected:', socketInstance.id);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });

    // ── 방 이벤트 ────────────────────────────────────────────────
    socketInstance.on('room:state', ({ roomId, joinCode, status, participants }) => {
      setRoom(roomId, joinCode, status, participants);
    });

    socketInstance.on('room:user_joined', (user) => {
      useRoomStore.setState((s) => ({
        participants: [...s.participants, user],
      }));
    });

    socketInstance.on('room:user_left', ({ userId }) => {
      useRoomStore.setState((s) => ({
        participants: s.participants.filter((p) => p.id !== userId),
      }));
    });

    // ── 큐 / 노래 이벤트 ─────────────────────────────────────────
    socketInstance.on('queue:updated', ({ queue }) => setQueue(queue));
    socketInstance.on('song:playing',  ({ song })  => setSongPlaying(song));
    socketInstance.on('song:ended',    ()          => setSongEnded());

    // ── 가사 싱크 ────────────────────────────────────────────────
    socketInstance.on('lyrics:tick', ({ currentMs }) => setCurrentMs(currentMs));

    // ── 리액션 / 점수 ────────────────────────────────────────────
    socketInstance.on('user:reaction', (r)          => addReaction(r));
    socketInstance.on('score:result',  ({ score })  => setScore(score));

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
      initialized.current = false;
      reset();
    };
  }, [token]);

  return socketInstance;
}
