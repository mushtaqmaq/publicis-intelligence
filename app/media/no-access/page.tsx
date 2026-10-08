import { requireMediaUser } from "@/lib/auth/modules";

export default async function NoAccess() {
  await requireMediaUser(null);
  return (
    <div className="mx-auto max-w-xl p-10">
      <h1 className="font-serif text-2xl">No access to this section</h1>
      <p className="mt-2 text-sm text-muted">Your account does not include this part of Media. Ask an admin to switch it on for you.</p>
      <a href="/media" className="mt-4 inline-block text-sm text-accent">Back to Media</a>
    </div>
  );
}
