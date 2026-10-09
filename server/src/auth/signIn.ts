export type AppUser = { id: number; email: string; name: string; isAdmin: boolean };
export type FindUser = (email: string) => Promise<AppUser | null>;

// 事前登録されたメールのみ許可。tid が渡された場合（Entra 経由）は許可リストも確認する。
export async function isSignInAllowed(
  input: { email?: string | null; tid?: string | null },
  findUser: FindUser,
  allowedTids: readonly string[],
): Promise<boolean> {
  if (!input.email) return false;
  if (input.tid !== undefined && input.tid !== null && !allowedTids.includes(input.tid)) {
    return false;
  }
  return (await findUser(input.email.toLowerCase())) !== null;
}
