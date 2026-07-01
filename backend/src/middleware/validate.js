// src/middleware/validate.js
// DisasterWatch — Request validation middleware (Joi)

'use strict';

const { ApiError } = require('../utils/response');

/**
 * validate(schema, target?)
 * Validates req[target] against a Joi schema.
 * target = 'body' | 'query' | 'params'  (default: 'body')
 */
function validate(schema, target = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }

    // Replace with sanitized/coerced value
    req[target] = value;
    next();
  };
}

module.exports = validate;
