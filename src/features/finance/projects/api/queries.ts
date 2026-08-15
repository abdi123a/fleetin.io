import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeProject,
  createProject,
  fetchProject,
  fetchProjects,
  updateProject,
  type CreateProjectPayload,
  type ProjectFilters,
  type UpdateProjectPayload,
} from './projectsService';

export const projectQueryKeys = {
  all: ['projects'] as const,
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  detail: (id: string) => ['projects', 'detail', id] as const,
};

export function useProjects(filters: ProjectFilters = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: projectQueryKeys.list(filters),
    queryFn: () => fetchProjects(filters),
    enabled: options.enabled,
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectQueryKeys.detail(id ?? ''),
    queryFn: () => fetchProject(id as string),
    enabled: Boolean(id),
  });
}

function invalidateProjects(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
  if (id) queryClient.invalidateQueries({ queryKey: projectQueryKeys.detail(id) });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => createProject(payload),
    onSuccess: () => invalidateProjects(queryClient),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateProjectPayload }) => updateProject(id, payload),
    onSuccess: (_data, variables) => invalidateProjects(queryClient, variables.id),
  });
}

export function useCloseProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => closeProject(id),
    onSuccess: (_data, id) => invalidateProjects(queryClient, id),
  });
}
