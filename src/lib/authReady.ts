import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';

export async function authReady(): Promise<User> {
  const auth = getAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          reject(new Error('Auth not ready'));
        }
      },
      reject,
    );
  });
}
