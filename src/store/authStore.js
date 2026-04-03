import { create } from 'zustand';
import { api } from '../api/client';

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  friends: [],
  friendStatuses: {},

  refreshFriends: async () => {
    try {
      // 1. API 호출
      const resStatus = await api.get('/api/friends/statuses');
      const resList = await api.get('/api/friends/list');

      // 2. [핵심 수정] 응답 구조에 맞춰 안전하게 데이터만 추출 (HomePage의 방 목록 추출 방식과 동일)
      const statusData = resStatus.data ? resStatus.data : resStatus;
      const listData = resList.data ? resList.data : resList;

      // 3. Store 업데이트
      set({ 
        friendStatuses: statusData || {}, 
        friends: Array.isArray(listData) ? listData : [] 
      });
      
    } catch (err) {
      console.error("친구 로드 실패", err);
    }
  },

  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, token: null, friends: [], friendStatuses: {} });
  },
}));