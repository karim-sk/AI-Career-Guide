const mongoose = require('mongoose');
/** Strict ObjectId check — rejects objects/arrays (NoSQL-operator injection) and malformed strings. */
const isId = v => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v) && mongoose.isValidObjectId(v);
const asId = v => (isId(v) ? v : null);
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });
module.exports = { isId, asId, httpError };
