'use server';
// Editorial decisions. Only an admin of the existing app may make them, checked on the server for every call.
import { revalidatePath } from 'next/cache';
import { access } from '@/lib/gate';
import { db } from '@/lib/db';
import { setTrendState } from '@/lib/store';

export async function reviewTrend(form: FormData) {
  const a = await access(); if (a.state !== 'ok' || a.role !== 'admin') return;   // refused silently: the buttons are not shown to anyone else
  const state = String(form.get('state')); if (state !== 'approved' && state !== 'hidden' && state !== 'draft') return;
  await setTrendState(db(), String(form.get('id')), state, a.name);
  revalidatePath('/', 'layout');
}
