import jwt from 'jsonwebtoken';
import 'dotenv/config';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'JWT_SECRET is required. Set a secure secret before starting the API.',
    );
  }
  return secret;
};

const JWT_SECRET = getJwtSecret();
const EXPIRES_IN = '7d';

export { JWT_SECRET };

export const generateToken = (id: string, email: string) => {
  return jwt.sign(
    {
      sub: id,
      email,
    },
    JWT_SECRET,
    {
      expiresIn: EXPIRES_IN,
    }
  );
};