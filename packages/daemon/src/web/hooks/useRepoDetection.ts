import { useMutation } from "@tanstack/react-query";
import { client } from "@/web/integrations/orpc";

export type RepoDetectResult = Awaited<ReturnType<typeof client.repos.detect>>;

export function useDetectRepoFromGithub() {
  return useMutation({
    mutationFn: (data: { url: string }) => client.repos.detect(data),
  });
}
