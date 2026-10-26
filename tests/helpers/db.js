const mongoose = require('mongoose');

/** Connects to TEST_MONGODB_URI (or a local MongoDB / FerretDB) on a throw-away database. Returns false if unavailable. */
async function connectTestDb() {
  const base = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const name = `nav_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  try {
    await mongoose.connect(`${base.replace(/\/$/, '')}/${name}`, { serverSelectionTimeoutMS: 2500 });
    return true;
  } catch (e) { return false; }
}
async function dropAndClose() {
  try { await mongoose.connection.dropDatabase(); } catch (e) { /* ignore */ }
  await mongoose.disconnect();
}
module.exports = { connectTestDb, dropAndClose };
