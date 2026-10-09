export type Me = { id: number; email: string; name: string; isAdmin: boolean };
export type Onboarding = {
  confirmed: boolean;
  roles: { departmentId: number; name: string; requiresAvailability: boolean }[];
};
export type DevUser = Me;

export async function fetchMe(): Promise<Me | null> {
  const res = await fetch('/api/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`);
  return (await res.json()) as Me;
}

export async function fetchOnboarding(): Promise<Onboarding> {
  const res = await fetch('/api/me/onboarding');
  if (!res.ok) throw new Error(`/api/me/onboarding failed: ${res.status}`);
  return (await res.json()) as Onboarding;
}

export async function confirmOnboarding(): Promise<void> {
  const res = await fetch('/api/me/onboarding/confirm', { method: 'POST' });
  if (!res.ok) throw new Error(`confirm failed: ${res.status}`);
}

// 開発用ログインが無効（本番）の場合は 404 になるので null を返す
export async function fetchDevUsers(): Promise<DevUser[] | null> {
  const res = await fetch('/api/dev/users');
  if (!res.ok) return null;
  return (await res.json()) as DevUser[];
}

// Auth.js は CSRF トークン付きのフォームPOSTを要求する。通常のフォーム送信でリダイレクトに従う。
export async function postAuthForm(action: string, fields: Record<string, string>): Promise<void> {
  const res = await fetch('/api/auth/csrf');
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries({ csrfToken, callbackUrl: '/', ...fields })) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
