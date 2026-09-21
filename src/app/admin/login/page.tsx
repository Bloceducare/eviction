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
        <p className="text-sm text-muted">
          Defaults from <code className="text-ink">.env</code>:{" "}
          <code className="text-ink">admin@web3bridge.com</code> /{" "}
          <code className="text-ink">admin123</code>
        </p>
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
            defaultValue="admin@web3bridge.com"
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
            defaultValue="admin123"
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
