import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-slate-600">This page could not be found.</p>
      <Link href="/" className="rounded-lg bg-brand-500 px-4 py-2 font-medium text-white">
        OpenCanvas
      </Link>
    </main>
  );
}
