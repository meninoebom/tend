import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        isSignUp: { label: "Is Sign Up", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const isSignUp = credentials?.isSignUp === "true";

        if (!email || !password) return null;

        const backendUrl = process.env.BACKEND_URL;

        if (isSignUp) {
          // Create user in FastAPI backend
          const res = await fetch(`${backendUrl}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, auth_provider: "email" }),
          });
          if (res.status === 409) {
            // Email already registered — don't leak this, just fail generically
            return null;
          }
          if (!res.ok) return null;
          const user = await res.json();
          return { id: user.id, email: user.email };
        }

        // Login: verify credentials against backend
        const res = await fetch(`${backendUrl}/users/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) return null;
        const user = await res.json();
        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        // Find or create user in our backend, get our backend user ID
        const backendUrl = process.env.BACKEND_URL;
        const res = await fetch(`${backendUrl}/users/oauth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, auth_provider: "google" }),
        });
        if (!res.ok) return false;
        const backendUser = await res.json();
        // Store backend user ID on the user object for the jwt callback
        user.id = backendUser.id;
      }
      return true;
    },
    jwt({ token, user }) {
      // On initial sign-in, persist user.id into the JWT
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      // Expose userId to client-side session
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
