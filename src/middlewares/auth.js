import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { findUserById } from '../modules/users/users.service.js';

export function authenticate(db) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'informe o token no cabeçalho Authorization: Bearer <token>');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError(401, 'token inválido ou expirado');
    }

    // busca o usuário a cada requisição para refletir mudança de perfil/nível na hora
    const user = findUserById(db, Number(payload.sub));
    if (!user) throw new AppError(401, 'usuário do token não existe mais');

    req.user = user;
    next();
  };
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'seu perfil não tem permissão para esta operação');
    }
    next();
  };
}
