export interface User {
  id: string;
  name: string;
}

export async function loadUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  const data = (await res.json()) as User[];
  return data.filter((u) => u.name.length > 0).map((u) => ({ ...u, name: u.name.trim() }));
}

export const EMPTY_MESSAGE = 'No users have been added yet';
