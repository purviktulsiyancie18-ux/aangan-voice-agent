'use server';
// Dashboard actions (page is behind the dashboard password via middleware).
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { normPhone } from '@/lib/rules';

export async function setConverted(callId, converted) {
  await query('update calls set converted = $2, updated_at = now() where call_id = $1', [callId, Boolean(converted)]);
  revalidatePath('/');
}

export async function addClient({ phone, name, project, designer }) {
  const p = normPhone(phone);
  if (!p || !name) return { ok: false };
  await query(
    `insert into clients (phone, name, project, designer) values ($1, $2, $3, $4)
     on conflict (phone) do update set name = excluded.name, project = excluded.project, designer = excluded.designer`,
    [p, name, project || null, designer || null]
  );
  revalidatePath('/');
  return { ok: true };
}

export async function removeClient(phone) {
  await query('delete from clients where phone = $1', [normPhone(phone)]);
  revalidatePath('/');
}
