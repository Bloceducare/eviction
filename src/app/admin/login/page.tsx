import { adminLoginAction } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        action={adminLoginAction}
        method="post"
        className="card w-full max-w-md space-y-4"
      >
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
          Instructor login
        </h1>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            required
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full">
          Sign in
        </button>
      </form>
    </main>
  );
}
