import { useCallback } from "react";
import { type AuthUser, authClient, isAdminUser } from "#client/lib/auth.client";
import { queryClient } from "#client/lib/query.client";

export interface SessionState {
  user: AuthUser | null;
  isPending: boolean;
  isAdmin: boolean;
  refetch: () => void;
  signOut: () => Promise<void>;
}

/** Reactive session; the source of truth for "who is signed in" on the client. */
export function useSession(): SessionState {
  const { data, isPending, refetch } = authClient.useSession();
  const signOut = useCallback(async () => {
    await authClient.signOut();
    // Everything cached belongs to the previous user.
    queryClient.clear();
  }, []);
  const user = data?.user ?? null;
  return { user, isPending, isAdmin: isAdminUser(user), refetch, signOut };
}
