// src/validators/authValidator.js
// DisasterWatch — Joi schemas for auth endpoints

'use strict';

const Joi = require('joi');

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,72}$/;

const register = Joi.object({
  name: Joi.string().min(1).max(100).trim().required()
    .messages({ 'any.required': 'Full name is required' }),
  email: Joi.string().email().max(254).lowercase().trim().required()
    .messages({ 'string.email': 'Please enter a valid email address' }),
  password: Joi.string().pattern(PASSWORD_PATTERN).required()
    .messages({
      'string.pattern.base':
        'Password must be 8–72 chars and include uppercase, lowercase, number, and symbol',
    }),
  phone: Joi.string().pattern(/^[+]?[0-9\s\-()]{7,20}$/).required()
    .messages({
      'string.pattern.base': 'Please enter a valid mobile phone number (digits and optional + prefix)',
      'any.required': 'Mobile phone number is required',
    }),
});

const login = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().min(1).required(),
});

const refresh = Joi.object({
  refreshToken: Joi.string().required(),
});

const changePassword = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().pattern(PASSWORD_PATTERN).required()
    .messages({
      'string.pattern.base':
        'New password must be 8–72 chars and include uppercase, lowercase, number, and symbol',
    }),
});

module.exports = { register, login, refresh, changePassword };
