import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteAccount, fetchMe, logout } from "./api.ts";

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
  const removeAccount = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => queryClient.setQueryData(ME_KEY, null),
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (me.isPending) {
    return <p>Loading…</p>;
  }
  if (me.isError) {
    return <p role="alert">Could not load your account.</p>;
  }
  if (!me.data) {
    return (
      <div>
        {removeAccount.isSuccess && (
          <p role="status">Your account has been deleted.</p>
        )}
        {/* A full-page navigation, not fetch: the API answers with a redirect to Google. */}
        <a href="/api/auth/google/start">Sign in with Google</a>
      </div>
    );
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
      {confirmingDelete ? (
        <div>
          <p>
            This permanently deletes your account and signs you out on every
            device.
          </p>
          <button
            type="button"
            onClick={() => removeAccount.mutate()}
            disabled={removeAccount.isPending}
          >
            Delete permanently
          </button>
          <button type="button" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmingDelete(true)}>
          Delete account
        </button>
      )}
      {removeAccount.isError && (
        <p role="alert">Account deletion failed. Please try again.</p>
      )}
    </div>
  );
}
