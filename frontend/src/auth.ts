import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
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
