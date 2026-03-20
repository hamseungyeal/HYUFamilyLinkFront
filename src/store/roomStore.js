import { create } from 'zustand';

export const useRoomStore = create((set) => ({
  roomId:       null,
  joinCode:     null,
  status:       'waiting',   // 'waiting' | 'singing' | 'result'
  participants: [],
  queue:        [],
  currentSong:  null,
  currentMs:    0,
  reactions:    [],          // 최근 리액션 목록
  lastScore:    null,

  setRoom: (roomId, joinCode, status, participants) =>
    set({ roomId, joinCode, status, participants }),

  setQueue: (queue) => set({ queue }),

  setSongPlaying: (song) => set({ currentSong: song, currentMs: 0, status: 'singing' }),

  setSongEnded: () => set({ currentSong: null, currentMs: 0, status: 'result' }),

  setCurrentMs: (ms) => set({ currentMs: ms }),

  addReaction: (reaction) =>
    set((s) => ({ reactions: [...s.reactions.slice(-9), reaction] })),

  setScore: (score) => set({ lastScore: score }),

  reset: () =>
    set({
      roomId: null, joinCode: null, status: 'waiting',
      participants: [], queue: [], currentSong: null,
      currentMs: 0, reactions: [], lastScore: null,
    }),
}));
