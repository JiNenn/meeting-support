import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const useCandidates = (id: string) =>
  useQuery({
    queryKey: ['candidates', id],
    queryFn: async () => {
      const { data } = await api.get(`/meetings/${id}/candidates`, { withCredentials: true });
      return data as { start: string; end: string; optionalOK: number }[];
    },
  });
