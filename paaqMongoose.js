const mongoose = require('mongoose');
const { track } = require('./paaq');

const SLOW_QUERY_MS = 500;

function paaqMongoosePlugin(schema) {
  // Query middleware — this = Query instance
  const queryOps = ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'count', 'deleteOne', 'deleteMany', 'updateOne', 'updateMany'];

  queryOps.forEach((method) => {
    schema.pre(method, function () {
      this._paaqStart = Date.now();
    });

    schema.post(method, function (result) {
      const duration = Date.now() - (this._paaqStart || Date.now());
      const collection = this.model?.collection?.collectionName || 'unknown';
      const isSlow = duration >= SLOW_QUERY_MS;
      track(isSlow ? 'db_slow_query' : 'db_query', {
        operation: method,
        collection,
        duration_ms: duration,
        found: Array.isArray(result) ? result.length : result != null ? 1 : 0,
      });
    });

    schema.post(method, function (error, result, next) {
      const collection = this.model?.collection?.collectionName || 'unknown';
      track('db_error', { operation: method, collection, error: error?.message });
      next(error);
    });
  });

  // Document middleware — this = Document instance
  schema.pre('save', function () {
    this._paaqStart = Date.now();
    this._paaqIsNew = this.isNew;
  });

  schema.post('save', function () {
    const duration = Date.now() - (this._paaqStart || Date.now());
    const collection = this.constructor?.collection?.collectionName || 'unknown';
    track('db_query', {
      operation: this._paaqIsNew ? 'insert' : 'update',
      collection,
      duration_ms: duration,
    });
  });

  schema.post('save', function (error, doc, next) {
    const collection = this.constructor?.collection?.collectionName || 'unknown';
    track('db_error', { operation: 'save', collection, error: error?.message });
    next(error);
  });
}

function trackMongooseConnection() {
  // Register as global plugin — applies to every model automatically
  mongoose.plugin(paaqMongoosePlugin);

  mongoose.connection.on('connected', () => {
    track('db_connected', { database: 'mongodb' });
  });

  mongoose.connection.on('disconnected', () => {
    track('db_disconnected', { database: 'mongodb' });
  });

  mongoose.connection.on('error', (err) => {
    track('db_connection_error', { database: 'mongodb', error: err?.message });
  });
}

module.exports = { trackMongooseConnection };
