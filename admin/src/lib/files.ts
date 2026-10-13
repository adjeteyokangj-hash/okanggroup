import { supabase } from './supabase';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
]);

export function assertAllowedFile(file: File) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File must be between 1 byte and 25 MB.');
  }
  if (!ALLOWED_MIME.has(file.type) && !file.name.match(/\.(pdf|docx?|xlsx?|zip|png|jpe?g|webp|gif|txt)$/i)) {
    throw new Error('File type not allowed. Use PDF, Word, Excel, images or ZIP.');
  }
}

function safeName(name: string) {
  return name.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180);
}

export async function uploadTaskAttachment(opts: {
  taskId: string;
  clientId: string | null;
  role: 'instruction' | 'work_upload';
  file: File;
  userId: string;
}) {
  assertAllowedFile(opts.file);
  const id = crypto.randomUUID();
  const folder = opts.clientId ?? 'internal';
  const path = `${folder}/${opts.taskId}/${opts.role}/${id}_${safeName(opts.file.name)}`;

  const { error: upErr } = await supabase.storage.from('task-files').upload(path, opts.file, {
    contentType: opts.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('task_attachments')
    .insert({
      id,
      task_id: opts.taskId,
      client_id: opts.clientId,
      role: opts.role,
      file_name: opts.file.name,
      mime_type: opts.file.type || 'application/octet-stream',
      byte_size: opts.file.size,
      storage_path: path,
      uploaded_by: opts.userId,
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('task-files').remove([path]);
    throw new Error(error.message);
  }
  return data.id as string;
}

export async function uploadProjectDocument(opts: {
  clientId: string;
  projectId: string;
  title: string;
  docType: string;
  file: File;
  userId: string;
  visibility?: 'internal' | 'client_visible';
  approvalStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'superseded';
  versionOf?: string;
  versionNo?: number;
}) {
  assertAllowedFile(opts.file);
  const id = crypto.randomUUID();
  const path = `${opts.clientId}/${opts.projectId}/${id}_${safeName(opts.file.name)}`;

  const { error: upErr } = await supabase.storage.from('project-files').upload(path, opts.file, {
    contentType: opts.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('project_documents')
    .insert({
      id,
      client_id: opts.clientId,
      project_id: opts.projectId,
      title: opts.title.trim() || opts.file.name,
      doc_type: opts.docType,
      file_name: opts.file.name,
      mime_type: opts.file.type || 'application/octet-stream',
      byte_size: opts.file.size,
      storage_path: path,
      uploaded_by: opts.userId,
      visibility: opts.visibility ?? 'internal',
      approval_status: opts.approvalStatus ?? 'none',
      ...(opts.versionOf
        ? { version_of: opts.versionOf, version_no: opts.versionNo ?? 2 }
        : {}),
    })
    .select('id')
    .single();
  if (error) {
    await supabase.storage.from('project-files').remove([path]);
    throw new Error(error.message);
  }
  return data.id as string;
}

const CMS_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'video/mp4',
  'video/webm',
]);

export async function uploadClientCmsImage(opts: {
  clientId: string;
  instanceId: string;
  file: File;
  userId: string;
  altText?: string;
}) {
  const okMime =
    CMS_MEDIA_MIME.has(opts.file.type) ||
    Boolean(opts.file.name.match(/\.(png|jpe?g|webp|gif|svg|pdf|docx?|mp3|wav|mp4|webm)$/i));
  if (!okMime) {
    throw new Error('File type not allowed. Use images, PDF, Word, audio or supported video.');
  }
  if (opts.file.size <= 0 || opts.file.size > 25 * 1024 * 1024) {
    throw new Error('Media must be between 1 byte and 25 MB.');
  }
  const id = crypto.randomUUID();
  const path = `${opts.clientId}/${opts.instanceId}/${id}_${safeName(opts.file.name)}`;
  const { error: upErr } = await supabase.storage.from('client-cms-media').upload(path, opts.file, {
    contentType: opts.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('client_cms_media')
    .insert({
      id,
      client_id: opts.clientId,
      cms_instance_id: opts.instanceId,
      file_name: opts.file.name,
      mime_type: opts.file.type || 'application/octet-stream',
      byte_size: opts.file.size,
      storage_path: path,
      alt_text: opts.altText ?? null,
      uploaded_by: opts.userId,
    })
    .select('id, storage_path')
    .single();
  if (error) {
    await supabase.storage.from('client-cms-media').remove([path]);
    throw new Error(error.message);
  }
  return data as { id: string; storage_path: string };
}

export async function signedCmsMediaUrl(path: string, expiresSec = 3600) {
  const { data, error } = await supabase.storage.from('client-cms-media').createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Could not sign media URL');
  return data.signedUrl;
}

export async function downloadStorageFile(
  bucket: 'task-files' | 'project-files' | 'expense-receipts',
  path: string,
  fileName: string,
) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Download failed');
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = fileName;
  a.target = '_blank';
  a.rel = 'noreferrer';
  a.click();
}

export async function uploadExpenseReceipt(opts: {
  expenseId: string;
  file: File;
  userId: string;
}) {
  assertAllowedFile(opts.file);
  const id = crypto.randomUUID();
  const path = `${opts.expenseId}/${id}_${safeName(opts.file.name)}`;

  const { error: upErr } = await supabase.storage.from('expense-receipts').upload(path, opts.file, {
    contentType: opts.file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('expense_attachments')
    .insert({
      expense_id: opts.expenseId,
      file_name: opts.file.name,
      mime_type: opts.file.type || null,
      byte_size: opts.file.size,
      storage_path: path,
      uploaded_by: opts.userId,
    })
    .select('id, storage_path')
    .single();

  if (error) {
    await supabase.storage.from('expense-receipts').remove([path]);
    throw new Error(error.message);
  }
  return data as { id: string; storage_path: string };
}

export async function softDeleteTaskAttachment(id: string) {
  const { error } = await supabase
    .from('task_attachments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function softDeleteProjectDocument(id: string) {
  const { error } = await supabase
    .from('project_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
