import bcrypt from 'bcrypt';
import * as userRepo from '../data/userRepo.js';

export async function authenticateUser(email, password) {
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    return null;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return null;
  }
  return { id: user.id, email: user.email };
}
