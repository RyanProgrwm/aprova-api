import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { verifyCredentials } from '../users/users.service.js';

export function signToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: config.jwtExpiresIn,
  });
}

export function login(db, email, password) {
  const user = verifyCredentials(db, email, password);
  return { token: signToken(user), user };
}
