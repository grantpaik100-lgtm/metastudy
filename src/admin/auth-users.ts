interface AdminAuthClient {
  auth: {
    admin: {
      listUsers(options: { page: number; perPage: number }): Promise<{
        data: { users: ListedAuthUser[] };
        error: { message?: string } | null;
      }>;
    };
  };
}

export interface ListedAuthUser {
  id: string;
  email?: string;
}

export async function listAllAuthUsers(
  client: AdminAuthClient,
): Promise<ListedAuthUser[]> {
  const users: ListedAuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) {
      throw new Error("Unable to read Supabase Auth users");
    }
    users.push(
      ...result.data.users.map((user) => ({
        id: user.id,
        ...(user.email ? { email: user.email } : {}),
      })),
    );
    if (result.data.users.length < 1000) return users;
  }
}
