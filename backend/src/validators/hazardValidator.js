// src/validators/hazardValidator.js
'use strict';

const Joi = require('joi');

const HAZARD_TYPES = ['EARTHQUAKE', 'VOLCANO', 'HURRICANE', 'WEATHER', 'AIR_QUALITY'];

const listHazards = Joi.object({
  type:      Joi.string().valid(...HAZARD_TYPES).uppercase().optional(),
  minMag:    Joi.number().min(-2).max(10).optional(),
  maxMag:    Joi.number().min(-2).max(10).optional(),
  from:      Joi.date().iso().optional(),
  to:        Joi.date().iso().optional(),
  page:      Joi.number().integer().min(1).default(1),
  perPage:   Joi.number().integer().min(1).max(500).default(50),
  sortBy:    Joi.string().valid('occurredAt', 'magnitude', 'riskScore').default('occurredAt'),
  order:     Joi.string().valid('asc', 'desc').default('desc'),
});

const idParam = Joi.object({
  id: Joi.string().required(),
});

const alertPreference = Joi.object({
  hazardType:    Joi.string().valid(...HAZARD_TYPES).uppercase().required(),
  minMagnitude:  Joi.number().min(0).max(10).required(),
  emailEnabled:  Joi.boolean().default(true),
});

module.exports = { listHazards, idParam, alertPreference };
