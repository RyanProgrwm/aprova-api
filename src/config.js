const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('defina a variável JWT_SECRET antes de subir em produção');
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'segredo-de-desenvolvimento',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  databasePath: process.env.DATABASE_PATH ?? 'data/aprova.db',
};
