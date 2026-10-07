'use server';
// Dashboard actions (page is behind the dashboard password via middleware).
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { normPhone } from '@/lib/rules';

export async function toggleConverted(formData) {
  const callId = formData.get('call_id');
  await query('update calls set converted = not converted, updated_at = now() where call_id = $1', [callId]);
  revalidatePath('/');
}

export async function addClient(formData) {
  const phone = normPhone(formData.get('phone'));
  if (!phone) return;
  await query(
    `insert into clients (phone, name, project, designer) values ($1, $2, $3, $4)
     on conflict (phone) do update set name = excluded.name, project = excluded.project, designer = excluded.designer`,
    [phone, formData.get('name') || null, formData.get('project') || null, formData.get('designer') || null]
  );
  revalidatePath('/');
}

export async function removeClient(formData) {
  await query('delete from clients where phone = $1', [formData.get('phone')]);
  revalidatePath('/');
}
