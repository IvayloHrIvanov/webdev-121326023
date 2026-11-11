import bcrypt from 'bcrypt';
import * as userRepo from '../data/userRepo.js';

export async function authenticateUser(email, password) {
  const lowerEmail = email ? email.toLowerCase() : email;
  const user = await userRepo.findUserByEmail(lowerEmail);
  if (!user) {
    return null;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return null;
  }
  return { id: user.id, email: user.email, role: user.role };
}

export async function deleteAccount(userId, password) {
  const user = await userRepo.findUserByIdWithPassword(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    const err = new Error('Invalid password');
    err.status = 401;
    throw err;
  }
  await userRepo.deleteUser(userId);
  return { success: true };
}
