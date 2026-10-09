export interface Me {
  email: string;
}

// null means "not signed in"; any other failure is an error.
export async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`GET /api/me failed with ${res.status}`);
  }
  return (await res.json()) as Me;
}

// Every mutation carries X-Requested-With: the API rejects state changes without it (CSRF control).
export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "X-Requested-With": "fetch" },
  });
  if (!res.ok) {
    throw new Error(`POST /api/auth/logout failed with ${res.status}`);
  }
}

export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/me", {
    method: "DELETE",
    headers: { "X-Requested-With": "fetch" },
  });
  if (!res.ok) {
    throw new Error(`DELETE /api/me failed with ${res.status}`);
  }
}
