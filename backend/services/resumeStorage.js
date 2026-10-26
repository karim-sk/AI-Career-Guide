/**
 * Resume file storage adapter.
 *   RESUME_STORAGE=gridfs (default) → stored in MongoDB GridFS (persistent on Render; no ephemeral-disk dependency)
 *   RESUME_STORAGE=none             → original file is NOT retained; only extracted structured data is kept
 * Files are only ever streamed back to their owner (see resumeController.download).
 */
const mongoose = require('mongoose');

const provider = () => (process.env.RESUME_STORAGE || 'gridfs').toLowerCase() === 'none' ? 'none' : 'gridfs';
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'resumes' });

async function save(buffer, filename, metadata) {
  if (provider() === 'none') return { provider: 'none', fileId: null };
  const up = bucket().openUploadStream(String(filename).replace(/[^\w.\- ]+/g, '_').slice(0, 120), { metadata });
  await new Promise((resolve, reject) => { up.on('error', reject); up.on('finish', resolve); up.end(buffer); });
  return { provider: 'gridfs', fileId: up.id };
}

async function remove(storage) {
  if (!storage || storage.provider !== 'gridfs' || !storage.fileId) return;
  try { await bucket().delete(storage.fileId); } catch (e) { /* already gone */ }
}

function openDownload(storage) {
  if (!storage || storage.provider !== 'gridfs' || !storage.fileId) return null;
  return bucket().openDownloadStream(storage.fileId);
}

module.exports = { save, remove, openDownload, provider };
