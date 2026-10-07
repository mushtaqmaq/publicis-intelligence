import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { userFromToken } from '@/lib/current-user';

export const dynamic = 'force-dynamic';

// Foundation placeholder for the OOH Planning area (Media pillar). It proves the shared login:
// the same pi_session cookie that signs you in to the rest of the platform is read here.
export default async function PlanningHome() {
  const token = (await cookies()).get('pi_session')?.value;
  const user = await userFromToken(token);
  if (!user) redirect('/login');
  return (
    <main style={{ padding: 32 }}>
      <h1>OOH Planning</h1>
      <p>Signed in as {user.email}. Inventory, rates, map and media plans are coming to this area.</p>
      <p><a href="/">Back to Publicis Intelligence</a></p>
    </main>
  );
}
