import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe, logout } from "./api.ts";

const ME_KEY = ["me"] as const;

export function App() {
  return (
    <main>
      <h1>BarBro</h1>
      <SignInFailedNotice />
      <Account />
    </main>
  );
}

function SignInFailedNotice() {
  const failed =
    new URLSearchParams(window.location.search).get("signin") === "failed";
  return failed ? <p role="alert">Sign-in failed. Please try again.</p> : null;
}

function Account() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });

  if (me.isPending) {
    return <p>Loading…</p>;
  }
  if (me.isError) {
    return <p role="alert">Could not load your account.</p>;
  }
  if (!me.data) {
    // A full-page navigation, not fetch: the API answers with a redirect to Google.
    return <a href="/api/auth/google/start">Sign in with Google</a>;
  }
  return (
    <div>
      <p>Signed in as {me.data.email}</p>
      <button
        type="button"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        Sign out
      </button>
      {signOut.isError && (
        <p role="alert">Sign-out failed. Please try again.</p>
      )}
    </div>
  );
}
