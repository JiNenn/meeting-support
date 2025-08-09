import axios from 'axios';

// バックエンドに Cookie を送るため withCredentials=true を既定に
export const api = axios.create({
  baseURL: 'http://localhost:4000/api',
  withCredentials: true,
});
